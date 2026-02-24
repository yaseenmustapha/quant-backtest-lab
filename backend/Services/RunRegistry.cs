using System.Collections.Concurrent;
using QuantBacktesting.Api.Models;

namespace QuantBacktesting.Api.Services;

public sealed class RunRegistry
{
    private readonly ConcurrentDictionary<string, RunRecord> _runs = new();

    public RunRecord Add(BacktestConfig config)
    {
        var runId = Guid.NewGuid().ToString("N");
        var run = new RunRecord(
            runId,
            "running",
            config,
            DateTimeOffset.UtcNow.ToString("O"),
            null,
            null,
            null);
        _runs[runId] = run;
        return run;
    }

    public RunRecord? Get(string runId)
    {
        _runs.TryGetValue(runId, out var record);
        return record;
    }

    public void MarkCompleted(string runId, BacktestResult result)
    {
        if (_runs.TryGetValue(runId, out var run))
        {
            _runs[runId] = run with
            {
                Status = "completed",
                CompletedAt = DateTimeOffset.UtcNow.ToString("O"),
                Result = result
            };
        }
    }

    public void MarkFailed(string runId, string error)
    {
        if (_runs.TryGetValue(runId, out var run))
        {
            _runs[runId] = run with
            {
                Status = "error",
                CompletedAt = DateTimeOffset.UtcNow.ToString("O"),
                ErrorMessage = error
            };
        }
    }
}
