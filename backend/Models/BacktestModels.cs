using System.Text.Json;

namespace QuantBacktesting.Api.Models;

public sealed record BacktestConfig
{
    public required List<string> Symbols { get; init; }
    public required DateOnly StartDate { get; init; }
    public required DateOnly EndDate { get; init; }
    public decimal InitialCapital { get; init; } = 1_000_000m;
    public int LookbackDays { get; init; } = 60;
    public int RebalanceFrequencyDays { get; init; } = 21;
    public int LongCount { get; init; } = 4;
    public int ShortCount { get; init; } = 2;
    public string? StrategyCode { get; init; }
    public Dictionary<string, JsonElement>? StrategyParams { get; init; }
    public bool FallbackToBuiltinOnPythonError { get; init; } = false;
}

public sealed record PythonExecutionSummary(
    bool Requested,
    bool Executed,
    bool Succeeded,
    bool UsedFallback,
    string Message,
    int SignalDates,
    string? StderrSnippet,
    string? ErrorType
);

public sealed record PriceBar(DateOnly Date, decimal Open, decimal High, decimal Low, decimal Close, decimal Volume);

public sealed record EquityPoint(string Date, decimal Nav, decimal BenchmarkNav);
public sealed record DrawdownPoint(string Date, decimal Drawdown);
public sealed record DailyReturnPoint(string Date, decimal DailyReturn);
public sealed record HoldingPoint(string Symbol, decimal Weight, decimal PnlContribution);
public sealed record TransactionPoint(string Date, string Symbol, string Side, decimal Shares, decimal Price, decimal TurnoverUsd);

public sealed record BacktestMetrics(
    decimal Cagr,
    decimal AnnualizedVolatility,
    decimal Sharpe,
    decimal MaxDrawdown,
    decimal HitRate,
    decimal TurnoverPct
);

public sealed record LiveStatsSnapshot(
    string EndDate,
    int BacktestMonths,
    decimal AnnualReturn,
    decimal CumulativeReturns,
    decimal AnnualVolatility,
    decimal SharpeRatio,
    decimal InformationRatio,
    decimal CalmarRatio,
    decimal Stability,
    decimal OmegaRatio,
    decimal SortinoRatio,
    decimal Skew,
    decimal Kurtosis,
    decimal TailRatio,
    decimal CommonSenseRatio,
    decimal DailyValueAtRisk,
    decimal GrossLeverage,
    decimal DailyTurnoverPct,
    decimal Alpha,
    decimal Beta,
    decimal WinRate,
    decimal BestDay,
    decimal WorstDay,
    decimal Idio
);

public sealed record BacktestResult(
    string RunId,
    string StartedAt,
    string CompletedAt,
    BacktestConfig Config,
    PythonExecutionSummary PythonExecution,
    BacktestMetrics Metrics,
    LiveStatsSnapshot AdditionalStats,
    IReadOnlyList<EquityPoint> EquityCurve,
    IReadOnlyList<DrawdownPoint> DrawdownSeries,
    IReadOnlyList<DailyReturnPoint> DailyReturns,
    IReadOnlyList<HoldingPoint> TopHoldings,
    IReadOnlyList<TransactionPoint> Transactions
);

public sealed record RunRecord(
    string RunId,
    string Status,
    BacktestConfig Config,
    string StartedAt,
    string? CompletedAt,
    string? ErrorMessage,
    BacktestResult? Result
);
