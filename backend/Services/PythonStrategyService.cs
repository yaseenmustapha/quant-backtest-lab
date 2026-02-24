using System.Diagnostics;
using System.Text.Json;
using QuantBacktesting.Api.Models;

namespace QuantBacktesting.Api.Services;

public interface IPythonStrategyService
{
    Task<PythonSignalsResult> BuildSignalsByDateAsync(
        BacktestConfig config,
        IReadOnlyList<DateOnly> dates,
        IReadOnlyDictionary<string, List<PriceBar>> barsBySymbol,
        CancellationToken cancellationToken);
}

public sealed record PythonSignalsResult(
    PythonExecutionSummary Execution,
    Dictionary<string, Dictionary<string, decimal>>? Signals
);

public sealed class PythonStrategyService(ILogger<PythonStrategyService> logger) : IPythonStrategyService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);

    public async Task<PythonSignalsResult> BuildSignalsByDateAsync(
        BacktestConfig config,
        IReadOnlyList<DateOnly> dates,
        IReadOnlyDictionary<string, List<PriceBar>> barsBySymbol,
        CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(config.StrategyCode))
        {
            return new PythonSignalsResult(
                new PythonExecutionSummary(
                    Requested: false,
                    Executed: false,
                    Succeeded: true,
                    UsedFallback: false,
                    Message: "No custom strategyCode provided. Using built-in momentum ranking.",
                    SignalDates: 0,
                    StderrSnippet: null,
                    ErrorType: null),
                null);
        }

        if (config.StrategyCode.Length > 200_000)
        {
            return new PythonSignalsResult(
                new PythonExecutionSummary(
                    Requested: true,
                    Executed: false,
                    Succeeded: false,
                    UsedFallback: false,
                    Message: "Strategy code is too large.",
                    SignalDates: 0,
                    StderrSnippet: null,
                    ErrorType: "validation"),
                null);
        }

        var paramValidationError = ValidateParams(config.StrategyParams);
        if (paramValidationError is not null)
        {
            return new PythonSignalsResult(
                new PythonExecutionSummary(
                    Requested: true,
                    Executed: false,
                    Succeeded: false,
                    UsedFallback: false,
                    Message: paramValidationError,
                    SignalDates: 0,
                    StderrSnippet: null,
                    ErrorType: "validation"),
                null);
        }

        var tempDir = Path.Combine(Path.GetTempPath(), $"quant_strategy_{Guid.NewGuid():N}");
        Directory.CreateDirectory(tempDir);

        try
        {
            await File.WriteAllTextAsync(Path.Combine(tempDir, "strategy.py"), config.StrategyCode, cancellationToken);
            await File.WriteAllTextAsync(
                Path.Combine(tempDir, "strategy_params.json"),
                JsonSerializer.Serialize(config.StrategyParams ?? new Dictionary<string, JsonElement>(), JsonOptions),
                cancellationToken);

            var payload = BuildInputPayload(config, dates, barsBySymbol);
            await File.WriteAllTextAsync(
                Path.Combine(tempDir, "strategy_input.json"),
                JsonSerializer.Serialize(payload, JsonOptions),
                cancellationToken);

            await File.WriteAllTextAsync(Path.Combine(tempDir, "runner.py"), RunnerScript, cancellationToken);

            var pythonBinary = ResolvePythonBinary();
            var psi = new ProcessStartInfo
            {
                FileName = pythonBinary,
                Arguments = "runner.py",
                WorkingDirectory = tempDir,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                UseShellExecute = false,
                CreateNoWindow = true
            };

            using var process = new Process { StartInfo = psi };
            process.Start();

            var stdoutTask = process.StandardOutput.ReadToEndAsync(cancellationToken);
            var stderrTask = process.StandardError.ReadToEndAsync(cancellationToken);
            var waitTask = process.WaitForExitAsync(cancellationToken);
            var timeoutTask = Task.Delay(TimeSpan.FromSeconds(15), cancellationToken);

            var first = await Task.WhenAny(waitTask, timeoutTask);
            if (first == timeoutTask)
            {
                try
                {
                    process.Kill(entireProcessTree: true);
                }
                catch
                {
                    // ignore kill failures
                }
                return new PythonSignalsResult(
                    new PythonExecutionSummary(
                        Requested: true,
                        Executed: true,
                        Succeeded: false,
                        UsedFallback: false,
                        Message: "Python strategy timed out after 15 seconds.",
                        SignalDates: 0,
                        StderrSnippet: null,
                        ErrorType: "timeout"),
                    null);
            }

            await waitTask;
            var stdout = await stdoutTask;
            var stderr = Truncate(await stderrTask, 3000);

            if (process.ExitCode != 0)
            {
                logger.LogWarning("Python strategy failed. stderr: {Stderr}", stderr);
                return new PythonSignalsResult(
                    new PythonExecutionSummary(
                        Requested: true,
                        Executed: true,
                        Succeeded: false,
                        UsedFallback: false,
                        Message: "Python strategy exited with non-zero status.",
                        SignalDates: 0,
                        StderrSnippet: stderr,
                        ErrorType: "runtime"),
                    null);
            }

            var signalJson = ExtractSignalJson(stdout);
            if (signalJson is null)
            {
                return new PythonSignalsResult(
                    new PythonExecutionSummary(
                        Requested: true,
                        Executed: true,
                        Succeeded: false,
                        UsedFallback: false,
                        Message: "Python strategy did not produce valid JSON output.",
                        SignalDates: 0,
                        StderrSnippet: stderr,
                        ErrorType: "output"),
                    null);
            }

            var parsed = JsonSerializer.Deserialize<Dictionary<string, Dictionary<string, decimal>>>(signalJson, JsonOptions)
                ?? new Dictionary<string, Dictionary<string, decimal>>();

            return new PythonSignalsResult(
                new PythonExecutionSummary(
                    Requested: true,
                    Executed: true,
                    Succeeded: true,
                    UsedFallback: false,
                    Message: "Python strategy executed successfully.",
                    SignalDates: parsed.Count,
                    StderrSnippet: string.IsNullOrWhiteSpace(stderr) ? null : stderr,
                    ErrorType: null),
                parsed);
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Python strategy execution failed.");
            return new PythonSignalsResult(
                new PythonExecutionSummary(
                    Requested: true,
                    Executed: false,
                    Succeeded: false,
                    UsedFallback: false,
                    Message: "Python strategy execution failed unexpectedly.",
                    SignalDates: 0,
                    StderrSnippet: Truncate(ex.Message, 3000),
                    ErrorType: "exception"),
                null);
        }
        finally
        {
            try
            {
                Directory.Delete(tempDir, recursive: true);
            }
            catch
            {
                // ignore cleanup errors
            }
        }
    }

    private static object BuildInputPayload(
        BacktestConfig config,
        IReadOnlyList<DateOnly> dates,
        IReadOnlyDictionary<string, List<PriceBar>> barsBySymbol)
    {
        var dateStrings = dates.Select(x => x.ToString("yyyy-MM-dd")).ToList();
        var symbols = barsBySymbol.Keys.ToList();

        var close = new Dictionary<string, Dictionary<string, decimal>>();
        var returns = new Dictionary<string, Dictionary<string, decimal>>();
        foreach (var symbol in symbols)
        {
            var byDate = barsBySymbol[symbol].ToDictionary(x => x.Date, x => x.Close);
            var closeSeries = new Dictionary<string, decimal>();
            var returnSeries = new Dictionary<string, decimal>();
            decimal? prevClose = null;
            foreach (var date in dates)
            {
                if (!byDate.TryGetValue(date, out var c))
                {
                    continue;
                }
                closeSeries[date.ToString("yyyy-MM-dd")] = c;
                var ret = prevClose is null || prevClose == 0m ? 0m : c / prevClose.Value - 1m;
                returnSeries[date.ToString("yyyy-MM-dd")] = ret;
                prevClose = c;
            }
            close[symbol] = closeSeries;
            returns[symbol] = returnSeries;
        }

        return new
        {
            strategy_params = config.StrategyParams ?? new Dictionary<string, JsonElement>(),
            dates = dateStrings,
            symbols,
            close,
            returns
        };
    }

    private static string ResolvePythonBinary()
    {
        return "python3";
    }

    private static string? ValidateParams(Dictionary<string, JsonElement>? strategyParams)
    {
        if (strategyParams is null)
        {
            return null;
        }

        if (strategyParams.Count > 200)
        {
            return "Too many strategy params (max 200).";
        }

        foreach (var kvp in strategyParams)
        {
            if (kvp.Key.Length > 120)
            {
                return $"Param key \"{kvp.Key}\" is too long (max 120 chars).";
            }
            if (!IsWithinDepthAndSize(kvp.Value, maxDepth: 8, maxNodes: 10_000))
            {
                return $"Param \"{kvp.Key}\" exceeds supported JSON complexity.";
            }
        }

        return null;
    }

    private static bool IsWithinDepthAndSize(JsonElement element, int maxDepth, int maxNodes)
    {
        var nodesVisited = 0;
        return Traverse(element, 0);

        bool Traverse(JsonElement current, int depth)
        {
            if (++nodesVisited > maxNodes || depth > maxDepth)
            {
                return false;
            }

            return current.ValueKind switch
            {
                JsonValueKind.Object => current.EnumerateObject().All(property => Traverse(property.Value, depth + 1)),
                JsonValueKind.Array => current.EnumerateArray().All(item => Traverse(item, depth + 1)),
                _ => true
            };
        }
    }

    private static string? ExtractSignalJson(string stdout)
    {
        if (string.IsNullOrWhiteSpace(stdout))
        {
            return null;
        }

        var lines = stdout
            .Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
            .Reverse()
            .ToList();

        foreach (var line in lines)
        {
            if (line.StartsWith("{") && line.EndsWith("}"))
            {
                return line;
            }
        }
        return null;
    }

    private static string Truncate(string value, int maxLength)
    {
        if (string.IsNullOrEmpty(value) || value.Length <= maxLength)
        {
            return value;
        }
        return value[..maxLength];
    }

    private static readonly string RunnerScript = """
import importlib.util
import json
from pathlib import Path

import pandas as pd

data = json.loads(Path("strategy_input.json").read_text())
params = json.loads(Path("strategy_params.json").read_text())

spec = importlib.util.spec_from_file_location("user_strategy", "strategy.py")
module = importlib.util.module_from_spec(spec)
spec.loader.exec_module(module)

dates = data["dates"]
symbols = data["symbols"]

close_df = pd.DataFrame(data["close"]).reindex(dates)
returns_df = pd.DataFrame(data["returns"]).reindex(dates).fillna(0.0)

signals_by_date = {}

class Datasets:
    def __init__(self, returns_frame, close_frame):
        self.returns_frame = returns_frame
        self.close_frame = close_frame
    def load(self, name, date_start=None, date_end=None):
        if name != "market_daily":
            return pd.DataFrame()
        frame = pd.DataFrame({
            "date": self.returns_frame.index.repeat(len(self.returns_frame.columns)),
            "barrid": list(self.returns_frame.columns) * len(self.returns_frame.index),
            "adj_return": self.returns_frame.to_numpy().reshape(-1),
            "adj_close": self.close_frame.to_numpy().reshape(-1),
        })
        if date_start is not None:
            frame = frame[frame["date"] >= str(date_start)]
        if date_end is not None:
            frame = frame[frame["date"] <= str(date_end)]
        return frame

class Ctx:
    def __init__(self, dates, returns_frame, close_frame):
        self.dates = dates
        self.datasets = Datasets(returns_frame, close_frame)
        self.close = close_frame
        self.returns = returns_frame
    def to_dict(self):
        return {
            "dates": self.dates,
            "symbols": list(self.returns.columns),
            "close": self.close,
            "returns": self.returns,
            "datasets": self.datasets,
        }

context = Ctx(dates, returns_df, close_df)

def normalize_to_dict(output):
    if output is None:
        return {}
    if isinstance(output, pd.DataFrame):
        cols = set(output.columns)
        if {"date", "symbol", "signal"}.issubset(cols):
            output = output.dropna(subset=["date", "symbol", "signal"])
            result = {}
            for _, row in output.iterrows():
                d = str(row["date"])
                s = str(row["symbol"])
                result.setdefault(d, {})
                result[d][s] = float(row["signal"])
            return result
        result = {}
        for date, row in output.iterrows():
            payload = {}
            for symbol, value in row.items():
                if pd.isna(value):
                    continue
                payload[str(symbol)] = float(value)
            if payload:
                result[str(date)] = payload
        return result
    if isinstance(output, pd.Series):
        return {str(dates[-1]): {str(symbol): float(value) for symbol, value in output.items() if pd.notna(value)}}
    if isinstance(output, dict):
        if not output:
            return {}
        first_value = next(iter(output.values()))
        if isinstance(first_value, dict):
            return {
                str(date): {str(symbol): float(signal) for symbol, signal in signal_map.items()}
                for date, signal_map in output.items()
            }
        return {str(dates[-1]): {str(symbol): float(signal) for symbol, signal in output.items()}}
    raise ValueError("Unsupported output type from strategy code")

out = None
if hasattr(module, "generate_signals"):
    try:
        out = module.generate_signals(context.to_dict(), params)
    except TypeError:
        # allow legacy signature generate_signals(context)
        out = module.generate_signals(context.to_dict())
elif hasattr(module, "Strategy"):
    strategy = module.Strategy(params)
    if hasattr(strategy, "get_signals"):
        out = strategy.get_signals(context)
    elif hasattr(strategy, "compute_signals"):
        out = strategy.compute_signals(returns_df)
else:
    raise ValueError("strategy.py must define generate_signals(context, params) or legacy Strategy class.")

signals_by_date = normalize_to_dict(out)

print(json.dumps(signals_by_date))
""";
}
