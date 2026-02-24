using Microsoft.AspNetCore.Mvc;
using QuantBacktesting.Api.Models;
using QuantBacktesting.Api.Services;

namespace QuantBacktesting.Api.Controllers;

[ApiController]
[Route("api/runs")]
public sealed class RunsController(BacktestRunService runService, RunRegistry runRegistry) : ControllerBase
{
    [HttpPost]
    public ActionResult<object> CreateRun([FromBody] BacktestConfig config, CancellationToken cancellationToken)
    {
        if (config.Symbols.Count == 0)
        {
            return BadRequest("At least one symbol is required.");
        }
        if (config.EndDate < config.StartDate)
        {
            return BadRequest("EndDate must be greater than or equal to StartDate.");
        }

        var runId = runService.Start(config, cancellationToken);
        return Ok(new { runId });
    }

    [HttpGet("{runId}")]
    public ActionResult<object> GetRun(string runId)
    {
        var run = runRegistry.Get(runId);
        if (run is null)
        {
            return NotFound();
        }

        if (run.Status != "completed" || run.Result is null)
        {
            return StatusCode(StatusCodes.Status202Accepted, new
            {
                runId = run.RunId,
                status = run.Status,
                errorMessage = run.ErrorMessage
            });
        }

        return Ok(run.Result);
    }

    [HttpGet("{runId}/transactions")]
    public ActionResult<IReadOnlyList<TransactionPoint>> GetTransactions(string runId)
    {
        var run = runRegistry.Get(runId);
        if (run?.Result is null)
        {
            return Ok(Array.Empty<TransactionPoint>());
        }
        return Ok(run.Result.Transactions);
    }
}
