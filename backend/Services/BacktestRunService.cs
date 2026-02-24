using Microsoft.AspNetCore.SignalR;
using QuantBacktesting.Api.Engine;
using QuantBacktesting.Api.Hubs;
using QuantBacktesting.Api.Models;

namespace QuantBacktesting.Api.Services;

public sealed class BacktestRunService(
    BacktestEngine engine,
    RunRegistry registry,
    IHubContext<RunHub> hubContext,
    ILogger<BacktestRunService> logger)
{
    public string Start(BacktestConfig config, CancellationToken requestCancellationToken)
    {
        var run = registry.Add(config);

        _ = Task.Run(async () =>
        {
            try
            {
                var result = await engine.RunAsync(
                    run.RunId,
                    config,
                    progress =>
                    {
                        var payloadProgress = new
                        {
                            runId = run.RunId,
                            progressPct = progress.ProgressPct,
                            currentDate = progress.CurrentDate
                        };
                        var payloadPoint = new
                        {
                            runId = run.RunId,
                            point = progress.EquityPoint
                        };
                        var payloadDrawdown = new
                        {
                            runId = run.RunId,
                            point = progress.DrawdownPoint
                        };
                        var payloadDailyReturn = new
                        {
                            runId = run.RunId,
                            point = progress.DailyReturnPoint
                        };
                        var payloadMetrics = new
                        {
                            runId = run.RunId,
                            snapshot = progress.MetricsSnapshot
                        };
                        var payloadStats = new
                        {
                            runId = run.RunId,
                            snapshot = progress.StatsSnapshot
                        };

                        _ = hubContext.Clients.All.SendAsync("runProgress", payloadProgress);
                        _ = hubContext.Clients.All.SendAsync("equityPoint", payloadPoint);
                        _ = hubContext.Clients.All.SendAsync("drawdownPoint", payloadDrawdown);
                        _ = hubContext.Clients.All.SendAsync("dailyReturnPoint", payloadDailyReturn);
                        _ = hubContext.Clients.All.SendAsync("metricSnapshot", payloadMetrics);
                        _ = hubContext.Clients.All.SendAsync("statsSnapshot", payloadStats);
                    },
                    CancellationToken.None);

                registry.MarkCompleted(run.RunId, result);
                await hubContext.Clients.All.SendAsync("runCompleted", new { runId = run.RunId });
            }
            catch (Exception ex)
            {
                logger.LogError(ex, "Backtest run {RunId} failed.", run.RunId);
                registry.MarkFailed(run.RunId, ex.Message);
            }
        }, CancellationToken.None);

        return run.RunId;
    }
}
