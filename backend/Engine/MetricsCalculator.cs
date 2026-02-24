using QuantBacktesting.Api.Models;

namespace QuantBacktesting.Api.Engine;

public static class MetricsCalculator
{
    public static BacktestMetrics ComputeMetrics(
        IReadOnlyList<decimal> navSeries,
        IReadOnlyList<decimal> dailyReturns,
        decimal totalTurnover)
    {
        if (navSeries.Count < 2 || dailyReturns.Count == 0)
        {
            return new BacktestMetrics(0m, 0m, 0m, 0m, 0m, 0m);
        }

        var startNav = navSeries.First();
        var endNav = navSeries.Last();
        var years = Math.Max(1m / 252m, dailyReturns.Count / 252m);
        var cagr = startNav > 0m
            ? (decimal)Math.Pow((double)(endNav / startNav), (double)(1m / years)) - 1m
            : 0m;

        var avg = dailyReturns.Average();
        var variance = dailyReturns.Sum(r => (r - avg) * (r - avg)) / dailyReturns.Count;
        var dailyStd = (decimal)Math.Sqrt((double)variance);
        var annualizedVol = dailyStd * (decimal)Math.Sqrt(252d);
        var sharpe = dailyStd == 0m ? 0m : (avg / dailyStd) * (decimal)Math.Sqrt(252d);

        var peak = navSeries[0];
        var maxDrawdown = 0m;
        foreach (var nav in navSeries)
        {
            peak = Math.Max(peak, nav);
            if (peak == 0m)
            {
                continue;
            }
            var drawdown = nav / peak - 1m;
            if (drawdown < maxDrawdown)
            {
                maxDrawdown = drawdown;
            }
        }

        var hitRate = (decimal)dailyReturns.Count(r => r > 0m) / dailyReturns.Count;
        var turnoverPct = dailyReturns.Count == 0 ? 0m : totalTurnover / dailyReturns.Count;

        return new BacktestMetrics(cagr, annualizedVol, sharpe, maxDrawdown, hitRate, turnoverPct);
    }
}
