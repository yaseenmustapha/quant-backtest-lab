using QuantBacktesting.Api.Engine;
using QuantBacktesting.Api.Hubs;
using QuantBacktesting.Api.Services;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddSignalR();
builder.Services.AddCors(options =>
{
    options.AddPolicy("frontend", policy =>
        policy
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials()
            .SetIsOriginAllowed(origin => origin.StartsWith("http://localhost:")));
});

builder.Services.AddHttpClient<MarketDataService>();
builder.Services.AddSingleton<IMarketDataService, MarketDataService>();
builder.Services.AddSingleton<IPythonStrategyService, PythonStrategyService>();
builder.Services.AddSingleton<BacktestEngine>();
builder.Services.AddSingleton<RunRegistry>();
builder.Services.AddSingleton<BacktestRunService>();

var app = builder.Build();

app.UseCors("frontend");
app.MapControllers();
app.MapHub<RunHub>("/hubs/runs");

app.MapGet("/", () => Results.Ok(new { service = "quant-backtesting-api", status = "ok" }));

app.Run();
