using QuantBacktesting.Api.Models;
using QuantBacktesting.Api.Services;

namespace QuantBacktesting.Api.Engine;

public sealed class BacktestEngine(
    IMarketDataService marketDataService,
    IPythonStrategyService pythonStrategyService,
    ILogger<BacktestEngine> logger)
{
    public sealed record ProgressEvent(
        decimal ProgressPct,
        string CurrentDate,
        EquityPoint EquityPoint,
        DrawdownPoint DrawdownPoint,
        DailyReturnPoint DailyReturnPoint,
        BacktestMetrics MetricsSnapshot,
        LiveStatsSnapshot StatsSnapshot);

    public async Task<BacktestResult> RunAsync(
        string runId,
        BacktestConfig config,
        Action<ProgressEvent> onProgress,
        CancellationToken cancellationToken)
    {
        var symbols = config.Symbols
            .Select(x => x.Trim().ToUpperInvariant())
            .Where(x => !string.IsNullOrWhiteSpace(x))
            .Distinct()
            .ToList();

        if (symbols.Count < Math.Max(3, config.LongCount + config.ShortCount))
        {
            throw new InvalidOperationException("Not enough symbols provided for long/short selection.");
        }

        var barsBySymbol = new Dictionary<string, List<PriceBar>>();
        foreach (var symbol in symbols)
        {
            barsBySymbol[symbol] = (await marketDataService
                .GetBarsAsync(symbol, config.StartDate, config.EndDate, cancellationToken))
                .OrderBy(x => x.Date)
                .ToList();
        }

        var benchmarkBars = (await marketDataService
            .GetBarsAsync("SPY", config.StartDate, config.EndDate, cancellationToken))
            .OrderBy(x => x.Date)
            .ToList();

        var commonDates = IntersectDates(barsBySymbol.Values.Select(x => x.Select(y => y.Date)));
        if (commonDates.Count <= config.LookbackDays + 2)
        {
            throw new InvalidOperationException("Insufficient overlapping date coverage across symbols.");
        }

        var closeMap = barsBySymbol.ToDictionary(
            kvp => kvp.Key,
            kvp => kvp.Value.ToDictionary(x => x.Date, x => x.Close));

        var pythonResult = await pythonStrategyService.BuildSignalsByDateAsync(
            config,
            commonDates,
            barsBySymbol,
            cancellationToken);
        var pythonSignals = pythonResult.Signals;
        var pythonExecution = pythonResult.Execution;

        if (pythonExecution.Requested && !pythonExecution.Succeeded)
        {
            if (!config.FallbackToBuiltinOnPythonError)
            {
                var detail = string.IsNullOrWhiteSpace(pythonExecution.StderrSnippet)
                    ? string.Empty
                    : $" stderr: {pythonExecution.StderrSnippet}";
                throw new InvalidOperationException(
                    $"Python strategy failed ({pythonExecution.ErrorType ?? "error"}): {pythonExecution.Message}.{detail}");
            }

            pythonExecution = pythonExecution with
            {
                UsedFallback = true,
                Message = $"{pythonExecution.Message} Falling back to built-in momentum ranking."
            };
            pythonSignals = null;
        }

        if (pythonSignals is not null && pythonSignals.Count > 0)
        {
            logger.LogInformation("Using Python strategy signals for {Dates} dates.", pythonSignals.Count);
        }

        var benchmarkMap = benchmarkBars.ToDictionary(x => x.Date, x => x.Close);
        var benchmarkStart = benchmarkMap.TryGetValue(commonDates[0], out var bStart)
            ? bStart
            : benchmarkMap.Values.First();

        var positions = symbols.ToDictionary(s => s, _ => 0m);
        var navSeries = new List<decimal> { config.InitialCapital };
        var equityCurve = new List<EquityPoint>();
        var drawdownSeries = new List<DrawdownPoint>();
        var dailyReturns = new List<DailyReturnPoint>();
        var benchmarkDailyReturns = new List<decimal>();
        var txs = new List<TransactionPoint>();

        decimal nav = config.InitialCapital;
        decimal totalTurnover = 0m;
        var startTs = DateTimeOffset.UtcNow.ToString("O");
        var peakNav = nav;

        for (var i = config.LookbackDays + 1; i < commonDates.Count; i++)
        {
            cancellationToken.ThrowIfCancellationRequested();
            var date = commonDates[i];
            var prevDate = commonDates[i - 1];

            decimal dailyReturn = 0m;
            foreach (var symbol in symbols)
            {
                var prev = closeMap[symbol][prevDate];
                var curr = closeMap[symbol][date];
                if (prev == 0m)
                {
                    continue;
                }
                var assetReturn = curr / prev - 1m;
                dailyReturn += positions[symbol] * assetReturn;
            }

            nav *= 1m + dailyReturn;
            navSeries.Add(nav);
            var dailyReturnPoint = new DailyReturnPoint(date.ToString("yyyy-MM-dd"), dailyReturn);
            dailyReturns.Add(dailyReturnPoint);

            var benchmarkNav = benchmarkStart == 0m || !benchmarkMap.TryGetValue(date, out var benchmarkClose)
                ? config.InitialCapital
                : config.InitialCapital * (benchmarkClose / benchmarkStart);
            var benchmarkDailyReturn = benchmarkMap.TryGetValue(prevDate, out var benchmarkPrev) && benchmarkPrev != 0m && benchmarkMap.TryGetValue(date, out var benchmarkCurr)
                ? benchmarkCurr / benchmarkPrev - 1m
                : 0m;
            benchmarkDailyReturns.Add(benchmarkDailyReturn);

            var equityPoint = new EquityPoint(date.ToString("yyyy-MM-dd"), nav, benchmarkNav);
            equityCurve.Add(equityPoint);

            peakNav = Math.Max(peakNav, nav);
            var drawdown = peakNav == 0m ? 0m : nav / peakNav - 1m;
            var drawdownPoint = new DrawdownPoint(date.ToString("yyyy-MM-dd"), drawdown);
            drawdownSeries.Add(drawdownPoint);

            var isRebalance = (i - config.LookbackDays) % Math.Max(1, config.RebalanceFrequencyDays) == 0;
            if (isRebalance)
            {
                var lookbackDate = commonDates[i - config.LookbackDays];
                var defaultRanked = symbols
                    .Select(symbol =>
                    {
                        var startClose = closeMap[symbol][lookbackDate];
                        var endClose = closeMap[symbol][date];
                        var momentum = startClose == 0m ? 0m : endClose / startClose - 1m;
                        return (symbol, score: momentum);
                    })
                    .OrderByDescending(x => x.score)
                    .ToList();

                var ranked = defaultRanked;
                var dateKey = date.ToString("yyyy-MM-dd");
                if (pythonSignals is not null && pythonSignals.TryGetValue(dateKey, out var dateSignals) && dateSignals.Count > 0)
                {
                    ranked = symbols
                        .Select(symbol =>
                        {
                            if (dateSignals.TryGetValue(symbol, out var customScore))
                            {
                                return (symbol, score: customScore);
                            }
                            return (symbol, score: decimal.MinValue / 2m);
                        })
                        .OrderByDescending(x => x.score)
                        .ToList();
                }

                var longSelection = ranked.Take(Math.Max(1, config.LongCount)).Select(x => x.symbol).ToHashSet();
                var shortSelection = ranked.TakeLast(Math.Max(1, config.ShortCount)).Select(x => x.symbol).ToHashSet();

                var nextWeights = symbols.ToDictionary(symbol => symbol, _ => 0m);
                foreach (var symbol in longSelection)
                {
                    nextWeights[symbol] = 1m / longSelection.Count;
                }
                foreach (var symbol in shortSelection)
                {
                    nextWeights[symbol] = -1m / shortSelection.Count;
                }

                foreach (var symbol in symbols)
                {
                    var previousWeight = positions[symbol];
                    var nextWeight = nextWeights[symbol];
                    var delta = nextWeight - previousWeight;
                    if (delta == 0m)
                    {
                        continue;
                    }

                    totalTurnover += Math.Abs(delta);
                    var side = delta > 0m
                        ? (nextWeight >= 0m ? "BUY" : "COVER")
                        : (nextWeight < 0m ? "SHORT" : "SELL");
                    var close = closeMap[symbol][date];
                    var notional = Math.Abs(delta) * nav;
                    var shares = close == 0m ? 0m : notional / close;

                    txs.Add(new TransactionPoint(
                        date.ToString("yyyy-MM-dd"),
                        symbol,
                        side,
                        decimal.Round(shares, 4),
                        close,
                        decimal.Round(notional, 2)));
                }

                positions = nextWeights;
            }

            var toDateMetrics = MetricsCalculator.ComputeMetrics(navSeries, dailyReturns.Select(x => x.DailyReturn).ToList(), totalTurnover);
            var liveStats = ComputeLiveStatsSnapshot(
                date,
                config.StartDate,
                nav,
                config.InitialCapital,
                toDateMetrics,
                dailyReturns.Select(x => x.DailyReturn).ToList(),
                benchmarkDailyReturns,
                positions);
            var pct = decimal.Round((decimal)(i + 1) / commonDates.Count * 100m, 2);
            onProgress(new ProgressEvent(
                pct,
                date.ToString("yyyy-MM-dd"),
                equityPoint,
                drawdownPoint,
                dailyReturnPoint,
                toDateMetrics,
                liveStats));
        }

        var finalMetrics = MetricsCalculator.ComputeMetrics(navSeries, dailyReturns.Select(x => x.DailyReturn).ToList(), totalTurnover);
        var finalStats = ComputeLiveStatsSnapshot(
            commonDates.Last(),
            config.StartDate,
            nav,
            config.InitialCapital,
            finalMetrics,
            dailyReturns.Select(x => x.DailyReturn).ToList(),
            benchmarkDailyReturns,
            positions);
        var topHoldings = positions
            .Where(x => x.Value != 0m)
            .OrderByDescending(x => Math.Abs(x.Value))
            .Select(x => new HoldingPoint(x.Key, x.Value, x.Value * finalMetrics.Cagr))
            .Take(10)
            .ToList();

        return new BacktestResult(
            runId,
            startTs,
            DateTimeOffset.UtcNow.ToString("O"),
            config,
            pythonExecution,
            finalMetrics,
            finalStats,
            equityCurve,
            drawdownSeries,
            dailyReturns,
            topHoldings,
            txs);
    }

    private static LiveStatsSnapshot ComputeLiveStatsSnapshot(
        DateOnly currentDate,
        DateOnly startDate,
        decimal nav,
        decimal initialCapital,
        BacktestMetrics metrics,
        IReadOnlyList<decimal> strategyDailyReturns,
        IReadOnlyList<decimal> benchmarkDailyReturns,
        IReadOnlyDictionary<string, decimal> positions)
    {
        var strategy = strategyDailyReturns.Select(x => (double)x).ToList();
        var benchmark = benchmarkDailyReturns.Select(x => (double)x).ToList();
        var pairedLength = Math.Min(strategy.Count, benchmark.Count);
        var strategyPaired = strategy.Take(pairedLength).ToList();
        var benchmarkPaired = benchmark.Take(pairedLength).ToList();
        var active = strategyPaired.Zip(benchmarkPaired, (s, b) => s - b).ToList();

        var avg = Mean(strategy);
        var vol = StdDev(strategy);
        var downside = strategy.Where(x => x < 0).ToList();
        var downsideStd = StdDev(downside);
        var sortino = downsideStd == 0d ? 0d : (avg / downsideStd) * Math.Sqrt(252d);

        var trackingError = StdDev(active);
        var informationRatio = trackingError == 0d ? 0d : (Mean(active) / trackingError) * Math.Sqrt(252d);

        var (alphaDaily, beta, residuals, r2) = Regression(strategyPaired, benchmarkPaired);
        var alpha = alphaDaily * 252d;
        var idio = StdDev(residuals) * Math.Sqrt(252d);

        var positiveSum = strategy.Where(x => x > 0d).Sum();
        var negativeSumAbs = Math.Abs(strategy.Where(x => x < 0d).Sum());
        var omega = negativeSumAbs == 0d ? 0d : positiveSum / negativeSumAbs;
        var gainToPain = negativeSumAbs == 0d ? 0d : (positiveSum - negativeSumAbs) / negativeSumAbs;

        var p95 = Percentile(strategy, 0.95d);
        var p05 = Percentile(strategy, 0.05d);
        var tailRatio = p05 == 0d ? 0d : p95 / Math.Abs(p05);
        var commonSenseRatio = tailRatio * Math.Max(gainToPain, 0d);
        var dailyVar = p05;

        var skew = 0d;
        var kurtosis = 0d;
        if (vol != 0d && strategy.Count > 0)
        {
            skew = strategy.Select(x => Math.Pow(x - avg, 3d)).Average() / Math.Pow(vol, 3d);
            kurtosis = strategy.Select(x => Math.Pow(x - avg, 4d)).Average() / Math.Pow(vol, 4d) - 3d;
        }

        var bestDay = strategy.Count > 0 ? strategy.Max() : 0d;
        var worstDay = strategy.Count > 0 ? strategy.Min() : 0d;
        var grossLeverage = positions.Values.Select(Math.Abs).Sum();
        if (grossLeverage == 0m)
        {
            grossLeverage = 2m;
        }

        var months = Math.Max(0, (currentDate.Year - startDate.Year) * 12 + (currentDate.Month - startDate.Month));
        var cumulative = initialCapital == 0m ? 0m : nav / initialCapital - 1m;
        var calmar = metrics.MaxDrawdown == 0m ? 0m : metrics.Cagr / Math.Abs(metrics.MaxDrawdown);

        return new LiveStatsSnapshot(
            currentDate.ToString("yyyy-MM-dd"),
            months,
            metrics.Cagr,
            cumulative,
            metrics.AnnualizedVolatility,
            metrics.Sharpe,
            (decimal)informationRatio,
            calmar,
            (decimal)Math.Max(0d, r2),
            (decimal)omega,
            (decimal)sortino,
            (decimal)skew,
            (decimal)kurtosis,
            (decimal)tailRatio,
            (decimal)commonSenseRatio,
            (decimal)dailyVar,
            grossLeverage,
            metrics.TurnoverPct,
            (decimal)alpha,
            (decimal)beta,
            metrics.HitRate,
            (decimal)bestDay,
            (decimal)worstDay,
            (decimal)idio);
    }

    private static double Mean(IReadOnlyList<double> values)
    {
        if (values.Count == 0)
        {
            return 0d;
        }
        return values.Average();
    }

    private static double StdDev(IReadOnlyList<double> values)
    {
        if (values.Count == 0)
        {
            return 0d;
        }
        var avg = Mean(values);
        var variance = values.Select(x => (x - avg) * (x - avg)).Average();
        return Math.Sqrt(variance);
    }

    private static double Percentile(IReadOnlyList<double> values, double p)
    {
        if (values.Count == 0)
        {
            return 0d;
        }
        var sorted = values.OrderBy(x => x).ToList();
        var rank = (sorted.Count - 1) * p;
        var low = (int)Math.Floor(rank);
        var high = (int)Math.Ceiling(rank);
        if (low == high)
        {
            return sorted[low];
        }
        var weight = rank - low;
        return sorted[low] * (1d - weight) + sorted[high] * weight;
    }

    private static double Covariance(IReadOnlyList<double> a, IReadOnlyList<double> b)
    {
        if (a.Count == 0 || b.Count == 0 || a.Count != b.Count)
        {
            return 0d;
        }
        var meanA = Mean(a);
        var meanB = Mean(b);
        var sum = 0d;
        for (var i = 0; i < a.Count; i++)
        {
            sum += (a[i] - meanA) * (b[i] - meanB);
        }
        return sum / a.Count;
    }

    private static (double AlphaDaily, double Beta, List<double> Residuals, double R2) Regression(
        IReadOnlyList<double> y,
        IReadOnlyList<double> x)
    {
        if (y.Count == 0 || y.Count != x.Count)
        {
            return (0d, 0d, [], 0d);
        }
        var varX = Covariance(x, x);
        var beta = varX == 0d ? 0d : Covariance(y, x) / varX;
        var alphaDaily = Mean(y) - beta * Mean(x);
        var residuals = y.Select((value, idx) => value - (alphaDaily + beta * x[idx])).ToList();

        var yMean = Mean(y);
        var sse = residuals.Sum(value => value * value);
        var sst = y.Sum(value => (value - yMean) * (value - yMean));
        var r2 = sst == 0d ? 0d : 1d - sse / sst;
        return (alphaDaily, beta, residuals, r2);
    }

    private static List<DateOnly> IntersectDates(IEnumerable<IEnumerable<DateOnly>> dateCollections)
    {
        var sets = dateCollections.Select(collection => collection.ToHashSet()).ToList();
        if (sets.Count == 0)
        {
            return [];
        }

        var intersection = sets[0];
        foreach (var set in sets.Skip(1))
        {
            intersection.IntersectWith(set);
        }
        return intersection.OrderBy(x => x).ToList();
    }
}
