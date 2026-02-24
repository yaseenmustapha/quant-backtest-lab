using System.Globalization;
using System.Text.Json;
using QuantBacktesting.Api.Models;

namespace QuantBacktesting.Api.Services;

public interface IMarketDataService
{
    Task<IReadOnlyList<PriceBar>> GetBarsAsync(string symbol, DateOnly startDate, DateOnly endDate, CancellationToken cancellationToken);
}

public sealed class MarketDataService(HttpClient httpClient, ILogger<MarketDataService> logger) : IMarketDataService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web);
    private readonly string _cacheDirectory = Path.Combine(AppContext.BaseDirectory, "cache");

    public async Task<IReadOnlyList<PriceBar>> GetBarsAsync(
        string symbol,
        DateOnly startDate,
        DateOnly endDate,
        CancellationToken cancellationToken)
    {
        Directory.CreateDirectory(_cacheDirectory);
        var normalized = symbol.Trim().ToUpperInvariant();
        var cacheFile = Path.Combine(
            _cacheDirectory,
            $"{normalized}_{startDate:yyyyMMdd}_{endDate:yyyyMMdd}.json");

        if (File.Exists(cacheFile))
        {
            var cachedJson = await File.ReadAllTextAsync(cacheFile, cancellationToken);
            var cached = JsonSerializer.Deserialize<List<PriceBar>>(cachedJson, JsonOptions);
            if (cached is { Count: > 0 })
            {
                return cached;
            }
        }

        var stooqSymbol = $"{normalized.ToLowerInvariant()}.us";
        var url = $"https://stooq.com/q/d/l/?s={stooqSymbol}&i=d";

        using var response = await httpClient.GetAsync(url, cancellationToken);
        response.EnsureSuccessStatusCode();
        var csv = await response.Content.ReadAsStringAsync(cancellationToken);

        var parsed = ParseStooqCsv(csv, startDate, endDate);
        if (parsed.Count == 0)
        {
            logger.LogWarning("No bars parsed for symbol {Symbol}.", normalized);
        }

        var serialized = JsonSerializer.Serialize(parsed, JsonOptions);
        await File.WriteAllTextAsync(cacheFile, serialized, cancellationToken);
        return parsed;
    }

    private static List<PriceBar> ParseStooqCsv(string csv, DateOnly startDate, DateOnly endDate)
    {
        var bars = new List<PriceBar>();
        var lines = csv.Split('\n', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        if (lines.Length <= 1)
        {
            return bars;
        }

        for (var i = 1; i < lines.Length; i++)
        {
            var parts = lines[i].Split(',', StringSplitOptions.TrimEntries);
            if (parts.Length < 6)
            {
                continue;
            }

            if (parts.Any(p => p.Equals("N/D", StringComparison.OrdinalIgnoreCase)))
            {
                continue;
            }

            if (!DateOnly.TryParse(parts[0], CultureInfo.InvariantCulture, DateTimeStyles.None, out var date))
            {
                continue;
            }
            if (date < startDate || date > endDate)
            {
                continue;
            }

            if (!decimal.TryParse(parts[1], CultureInfo.InvariantCulture, out var open) ||
                !decimal.TryParse(parts[2], CultureInfo.InvariantCulture, out var high) ||
                !decimal.TryParse(parts[3], CultureInfo.InvariantCulture, out var low) ||
                !decimal.TryParse(parts[4], CultureInfo.InvariantCulture, out var close) ||
                !decimal.TryParse(parts[5], CultureInfo.InvariantCulture, out var volume))
            {
                continue;
            }

            bars.Add(new PriceBar(date, open, high, low, close, volume));
        }

        return bars.OrderBy(x => x.Date).ToList();
    }
}
