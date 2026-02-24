export type StrategyTemplate = {
  id: string
  name: string
  description: string
  code: string
  params: Record<string, unknown>
}

const momentumCode = `import pandas as pd

def generate_signals(context, params):
    """
    Cross-sectional momentum strategy.
    Returns a DataFrame with columns: date, symbol, signal
    """
    lookback = int(params.get("lookback_days", 126))
    skip_days = int(params.get("skip_days", 21))

    returns_df = context["returns"]
    if returns_df.empty:
        return pd.DataFrame(columns=["date", "symbol", "signal"])

    # (1+ret) rolling product minus 1 with optional skip window.
    growth = (1 + returns_df).rolling(lookback).apply(lambda x: float(pd.Series(x).prod()), raw=False) - 1.0
    if skip_days > 0:
        growth = growth.shift(skip_days)

    long_format = growth.stack().reset_index()
    long_format.columns = ["date", "symbol", "signal"]
    return long_format.dropna()
`

const meanReversionCode = `import pandas as pd

def generate_signals(context, params):
    """
    Mean reversion strategy using rolling z-score of returns.
    Negative z-score -> long, positive z-score -> short.
    """
    lookback = int(params.get("lookback_days", 20))
    clip_z = float(params.get("clip_z", 3.0))

    returns_df = context["returns"]
    if returns_df.empty:
        return pd.DataFrame(columns=["date", "symbol", "signal"])

    mu = returns_df.rolling(lookback).mean()
    sigma = returns_df.rolling(lookback).std().replace(0, pd.NA)
    z = (returns_df - mu) / sigma
    z = z.clip(lower=-clip_z, upper=clip_z)

    signal = -z
    long_format = signal.stack().reset_index()
    long_format.columns = ["date", "symbol", "signal"]
    return long_format.dropna()
`

const trendRiskParityCode = `import pandas as pd

def generate_signals(context, params):
    """
    Time-series trend with inverse-volatility scaling.
    Positive trend gets positive signal, scaled by 1/vol.
    """
    fast = int(params.get("fast_window", 20))
    slow = int(params.get("slow_window", 100))
    vol_window = int(params.get("vol_window", 60))

    prices = context["close"]
    returns_df = context["returns"]
    if prices.empty or returns_df.empty:
        return pd.DataFrame(columns=["date", "symbol", "signal"])

    fast_ma = prices.rolling(fast).mean()
    slow_ma = prices.rolling(slow).mean()
    trend = (fast_ma > slow_ma).astype(float) * 2 - 1

    vol = returns_df.rolling(vol_window).std().replace(0, pd.NA)
    inv_vol = 1 / vol
    scaled = trend * inv_vol

    long_format = scaled.stack().reset_index()
    long_format.columns = ["date", "symbol", "signal"]
    return long_format.dropna()
`

export const strategyTemplates: StrategyTemplate[] = [
  {
    id: 'cross_sectional_momentum',
    name: 'Cross-Sectional Momentum',
    description: 'Ranks assets on trailing momentum and emits relative scores.',
    code: momentumCode,
    params: {
      lookback_days: 126,
      skip_days: 21,
      top_n: 4,
      bottom_n: 2,
    },
  },
  {
    id: 'mean_reversion_zscore',
    name: 'Mean Reversion Z-Score',
    description: 'Uses rolling z-score of returns and inverts it for reversion trades.',
    code: meanReversionCode,
    params: {
      lookback_days: 20,
      clip_z: 3.0,
      top_n: 4,
      bottom_n: 2,
    },
  },
  {
    id: 'trend_inverse_vol',
    name: 'Trend + Inverse Vol',
    description: 'Combines MA trend direction with inverse-volatility scaling.',
    code: trendRiskParityCode,
    params: {
      fast_window: 20,
      slow_window: 100,
      vol_window: 60,
      top_n: 4,
      bottom_n: 2,
    },
  },
]

export const defaultStrategyCode = strategyTemplates[0].code
export const defaultStrategyParams = strategyTemplates[0].params
