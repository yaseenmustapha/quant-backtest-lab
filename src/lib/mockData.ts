import type { BacktestConfig, BacktestResult, EquityPoint } from '../types'

function randomWalkSeries(days: number, startNav: number): EquityPoint[] {
  const now = new Date()
  const series: EquityPoint[] = []
  let nav = startNav
  let benchmarkNav = startNav

  for (let i = days - 1; i >= 0; i -= 1) {
    const date = new Date(now)
    date.setDate(date.getDate() - i)
    const ret = (Math.random() - 0.47) * 0.02
    const benchRet = (Math.random() - 0.5) * 0.012
    nav *= 1 + ret
    benchmarkNav *= 1 + benchRet
    series.push({
      date: date.toISOString().slice(0, 10),
      nav: Number(nav.toFixed(2)),
      benchmarkNav: Number(benchmarkNav.toFixed(2)),
    })
  }
  return series
}

export function buildMockResult(config: BacktestConfig, runId: string): BacktestResult {
  const equityCurve = randomWalkSeries(252, config.initialCapital)
  const startNav = equityCurve[0]?.nav ?? config.initialCapital
  const endNav = equityCurve[equityCurve.length - 1]?.nav ?? config.initialCapital
  const cagr = startNav > 0 ? endNav / startNav - 1 : 0

  let runningPeak = startNav
  const drawdownSeries = equityCurve.map((p) => {
    runningPeak = Math.max(runningPeak, p.nav)
    const drawdown = runningPeak === 0 ? 0 : p.nav / runningPeak - 1
    return { date: p.date, drawdown }
  })
  const maxDrawdown = Math.min(...drawdownSeries.map((d) => d.drawdown))

  const dailyReturns = equityCurve.slice(1).map((p, idx) => {
    const prev = equityCurve[idx].nav
    return {
      date: p.date,
      dailyReturn: prev === 0 ? 0 : p.nav / prev - 1,
    }
  })

  const winCount = dailyReturns.filter((d) => d.dailyReturn > 0).length
  const hitRate = dailyReturns.length === 0 ? 0 : winCount / dailyReturns.length

  return {
    runId,
    startedAt: new Date(Date.now() - 12_000).toISOString(),
    completedAt: new Date().toISOString(),
    config,
    pythonExecution: {
      requested: Boolean(config.strategyCode),
      executed: Boolean(config.strategyCode),
      succeeded: true,
      usedFallback: false,
      message: config.strategyCode
        ? 'Mock result: custom strategy simulated.'
        : 'Mock result: built-in momentum simulated.',
      signalDates: 252,
    },
    metrics: {
      cagr,
      annualizedVolatility: 0.18,
      sharpe: 0.93,
      maxDrawdown,
      hitRate,
      turnoverPct: 0.15,
    },
    additionalStats: {
      endDate: equityCurve[equityCurve.length - 1]?.date ?? new Date().toISOString().slice(0, 10),
      backtestMonths: 12,
      annualReturn: cagr,
      cumulativeReturns: cagr,
      annualVolatility: 0.18,
      sharpeRatio: 0.93,
      informationRatio: 0.41,
      calmarRatio: maxDrawdown === 0 ? 0 : cagr / Math.abs(maxDrawdown),
      stability: 0.62,
      omegaRatio: 1.14,
      sortinoRatio: 1.22,
      skew: 0.12,
      kurtosis: 0.2,
      tailRatio: 1.08,
      commonSenseRatio: 1.01,
      dailyValueAtRisk: -0.018,
      grossLeverage: 2,
      dailyTurnoverPct: 0.15,
      alpha: 0.08,
      beta: 0.12,
      winRate: hitRate,
      bestDay: 0.035,
      worstDay: -0.029,
      idio: 0.21,
    },
    equityCurve,
    drawdownSeries,
    dailyReturns,
    topHoldings: [
      { symbol: 'NVDA', weight: 0.12, pnlContribution: 0.031 },
      { symbol: 'META', weight: 0.1, pnlContribution: 0.022 },
      { symbol: 'AAPL', weight: 0.08, pnlContribution: 0.018 },
      { symbol: 'TSLA', weight: -0.07, pnlContribution: -0.014 },
      { symbol: 'SNOW', weight: -0.06, pnlContribution: 0.009 },
    ],
    transactions: [
      {
        date: equityCurve[120]?.date ?? new Date().toISOString().slice(0, 10),
        symbol: 'NVDA',
        side: 'BUY',
        shares: 120,
        price: 476.21,
        turnoverUsd: 57145.2,
      },
      {
        date: equityCurve[120]?.date ?? new Date().toISOString().slice(0, 10),
        symbol: 'TSLA',
        side: 'SHORT',
        shares: 220,
        price: 181.04,
        turnoverUsd: 39828.8,
      },
      {
        date: equityCurve[180]?.date ?? new Date().toISOString().slice(0, 10),
        symbol: 'AAPL',
        side: 'BUY',
        shares: 340,
        price: 189.87,
        turnoverUsd: 64555.8,
      },
    ],
  }
}
