export type RunStatus = 'idle' | 'running' | 'completed' | 'error'

export type BacktestConfig = {
  symbols: string[]
  startDate: string
  endDate: string
  initialCapital: number
  lookbackDays: number
  rebalanceFrequencyDays: number
  longCount: number
  shortCount: number
  strategyCode?: string
  strategyParams?: Record<string, unknown>
  fallbackToBuiltinOnPythonError?: boolean
}

export type EquityPoint = {
  date: string
  nav: number
  benchmarkNav: number
}

export type MetricSnapshot = {
  cagr: number
  annualizedVolatility: number
  sharpe: number
  maxDrawdown: number
  hitRate: number
  turnoverPct: number
}

export type LiveStatsSnapshot = {
  endDate: string
  backtestMonths: number
  annualReturn: number
  cumulativeReturns: number
  annualVolatility: number
  sharpeRatio: number
  informationRatio: number
  calmarRatio: number
  stability: number
  omegaRatio: number
  sortinoRatio: number
  skew: number
  kurtosis: number
  tailRatio: number
  commonSenseRatio: number
  dailyValueAtRisk: number
  grossLeverage: number
  dailyTurnoverPct: number
  alpha: number
  beta: number
  winRate: number
  bestDay: number
  worstDay: number
  idio: number
}

export type TransactionsPoint = {
  date: string
  symbol: string
  side: 'BUY' | 'SELL' | 'SHORT' | 'COVER'
  shares: number
  price: number
  turnoverUsd: number
}

export type BacktestMetrics = {
  cagr: number
  annualizedVolatility: number
  sharpe: number
  maxDrawdown: number
  hitRate: number
  turnoverPct: number
}

export type BacktestResult = {
  runId: string
  startedAt: string
  completedAt: string
  config: BacktestConfig
  pythonExecution: PythonExecutionSummary
  metrics: BacktestMetrics
  additionalStats: LiveStatsSnapshot
  equityCurve: EquityPoint[]
  drawdownSeries: { date: string; drawdown: number }[]
  dailyReturns: { date: string; dailyReturn: number }[]
  topHoldings: { symbol: string; weight: number; pnlContribution: number }[]
  transactions: TransactionsPoint[]
}

export type PythonExecutionSummary = {
  requested: boolean
  executed: boolean
  succeeded: boolean
  usedFallback: boolean
  message: string
  signalDates: number
  stderrSnippet?: string
  errorType?: string
}

export type CreateRunResponse = {
  runId: string
}
