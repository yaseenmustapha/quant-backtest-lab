import { useEffect, useMemo, useState } from 'react'
import { MetricCard } from '../components/MetricCard'
import { StrategyWorkspaceEditor } from '../components/StrategyWorkspaceEditor'
import { DrawdownChart } from '../components/charts/DrawdownChart'
import { EquityCurveChart } from '../components/charts/EquityCurveChart'
import { ReturnsHistogram } from '../components/charts/ReturnsHistogram'
import { defaultStrategyCode, defaultStrategyParams } from '../lib/strategyTemplates'
import { useRunStore } from '../store/runStore'
import type { BacktestConfig, LiveStatsSnapshot } from '../types'

const defaultSymbols = 'AAPL,MSFT,NVDA,AMZN,META,GOOGL,TSLA,JPM,XOM,UNH'
const strategyCodeStorageKey = 'quant_backtest_strategy_code_v2'
const strategyParamsStorageKey = 'quant_backtest_strategy_params_v2'

const defaultForm: BacktestConfig = {
  symbols: defaultSymbols.split(','),
  startDate: '2022-01-03',
  endDate: '2024-12-31',
  initialCapital: 1_000_000,
  lookbackDays: 60,
  rebalanceFrequencyDays: 21,
  longCount: 4,
  shortCount: 2,
}

const emptyStats: LiveStatsSnapshot = {
  endDate: '',
  backtestMonths: Number.NaN,
  annualReturn: Number.NaN,
  cumulativeReturns: Number.NaN,
  annualVolatility: Number.NaN,
  sharpeRatio: Number.NaN,
  informationRatio: Number.NaN,
  calmarRatio: Number.NaN,
  stability: Number.NaN,
  omegaRatio: Number.NaN,
  sortinoRatio: Number.NaN,
  skew: Number.NaN,
  kurtosis: Number.NaN,
  tailRatio: Number.NaN,
  commonSenseRatio: Number.NaN,
  dailyValueAtRisk: Number.NaN,
  grossLeverage: Number.NaN,
  dailyTurnoverPct: Number.NaN,
  alpha: Number.NaN,
  beta: Number.NaN,
  winRate: Number.NaN,
  bestDay: Number.NaN,
  worstDay: Number.NaN,
  idio: Number.NaN,
}

function fmtPct(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) {
    return '-'
  }
  return `${(value * 100).toFixed(2)}%`
}

function fmtSignedPct(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) {
    return '-'
  }
  const prefix = value > 0 ? '+' : ''
  return `${prefix}${(value * 100).toFixed(2)}%`
}

function fmtNum(value: number | undefined, digits = 2): string {
  if (value === undefined || !Number.isFinite(value)) {
    return '-'
  }
  return value.toFixed(digits)
}

function fmtUsd(value?: number): string {
  if (value === undefined || !Number.isFinite(value)) {
    return '-'
  }
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value)
}

export function OverviewPage() {
  const {
    status,
    progressPct,
    progressDate,
    latestSnapshot,
    latestStatsSnapshot,
    liveEquityCurve,
    liveDrawdownSeries,
    liveDailyReturns,
    result,
    errorMessage,
    startRun,
    reset,
  } = useRunStore()

  const [symbolText, setSymbolText] = useState(defaultSymbols)
  const [form, setForm] = useState<BacktestConfig>(defaultForm)
  const [showSpinningUpStatus, setShowSpinningUpStatus] = useState(false)
  const [strategyCode, setStrategyCode] = useState<string>(() => localStorage.getItem(strategyCodeStorageKey) ?? defaultStrategyCode)
  const [strategyParams, setStrategyParams] = useState<Record<string, unknown>>(() => {
    const raw = localStorage.getItem(strategyParamsStorageKey)
    if (!raw) {
      return defaultStrategyParams
    }
    try {
      const parsed = JSON.parse(raw) as Record<string, unknown>
      return parsed && typeof parsed === 'object' ? parsed : defaultStrategyParams
    } catch {
      return defaultStrategyParams
    }
  })

  useEffect(() => {
    localStorage.setItem(strategyCodeStorageKey, strategyCode)
  }, [strategyCode])

  useEffect(() => {
    localStorage.setItem(strategyParamsStorageKey, JSON.stringify(strategyParams))
  }, [strategyParams])

  useEffect(() => {
    if (status === 'running' && progressPct <= 0) {
      const timeoutId = window.setTimeout(() => {
        setShowSpinningUpStatus(true)
      }, 1000)
      return () => {
        window.clearTimeout(timeoutId)
      }
    }

    setShowSpinningUpStatus(false)
    return undefined
  }, [status, progressPct])

  const submittedConfig = useMemo<BacktestConfig>(
    () => ({
      ...form,
      symbols: symbolText
        .split(',')
        .map((s) => s.trim().toUpperCase())
        .filter(Boolean),
      strategyCode,
      strategyParams,
    }),
    [form, symbolText, strategyCode, strategyParams],
  )

  const metrics = result?.metrics ?? latestSnapshot
  const stats = result?.additionalStats ?? latestStatsSnapshot ?? emptyStats
  const pythonExecution = result?.pythonExecution

  const equityData = result?.equityCurve ?? liveEquityCurve
  const drawdownData = result?.drawdownSeries ?? liveDrawdownSeries
  const dailyReturnsData = result?.dailyReturns ?? liveDailyReturns

  const latestNav = equityData[equityData.length - 1]?.nav
  const topHoldings = Array.isArray(result?.topHoldings) ? result.topHoldings : []
  const latestDrawdown = drawdownData[drawdownData.length - 1]?.drawdown ?? metrics?.maxDrawdown

  const additionalStats = [
    { label: 'Annual return', value: fmtSignedPct(stats.annualReturn), tone: stats.annualReturn >= 0 ? 'good' : 'bad' },
    { label: 'Cumulative returns', value: fmtSignedPct(stats.cumulativeReturns), tone: stats.cumulativeReturns >= 0 ? 'good' : 'bad' },
    { label: 'Annual volatility', value: fmtPct(stats.annualVolatility), tone: 'neutral' },
    { label: 'Sharpe ratio', value: fmtNum(stats.sharpeRatio), tone: 'info' },
    { label: 'Information ratio', value: fmtNum(stats.informationRatio), tone: 'info' },
    { label: 'Calmar ratio', value: fmtNum(stats.calmarRatio), tone: stats.calmarRatio >= 0 ? 'good' : 'bad' },
    { label: 'Stability', value: fmtNum(stats.stability), tone: 'neutral' },
    { label: 'Max drawdown', value: fmtSignedPct(metrics?.maxDrawdown), tone: (metrics?.maxDrawdown ?? -1) >= -0.2 ? 'good' : 'bad' },
    { label: 'Omega ratio', value: fmtNum(stats.omegaRatio), tone: 'neutral' },
    { label: 'Sortino ratio', value: fmtNum(stats.sortinoRatio), tone: stats.sortinoRatio >= 0 ? 'good' : 'bad' },
    { label: 'Skew', value: fmtNum(stats.skew), tone: 'neutral' },
    { label: 'Kurtosis', value: fmtNum(stats.kurtosis), tone: 'neutral' },
    { label: 'Tail ratio', value: fmtNum(stats.tailRatio), tone: 'neutral' },
    { label: 'Common sense ratio', value: fmtNum(stats.commonSenseRatio), tone: 'neutral' },
    { label: 'Daily value at risk', value: fmtSignedPct(stats.dailyValueAtRisk), tone: stats.dailyValueAtRisk >= 0 ? 'good' : 'bad' },
    { label: 'Gross leverage', value: fmtNum(stats.grossLeverage), tone: 'neutral' },
    { label: 'Daily % turnover', value: fmtPct(stats.dailyTurnoverPct), tone: 'neutral' },
    { label: 'Alpha', value: fmtNum(stats.alpha), tone: 'neutral' },
    { label: 'Beta', value: fmtNum(stats.beta), tone: 'neutral' },
    { label: 'Win rate (hit rate)', value: fmtPct(stats.winRate), tone: 'info' },
    { label: 'Best day', value: fmtSignedPct(stats.bestDay), tone: stats.bestDay >= 0 ? 'good' : 'bad' },
    { label: 'Worst day', value: fmtSignedPct(stats.worstDay), tone: stats.worstDay >= 0 ? 'good' : 'bad' },
    { label: 'Idio', value: fmtSignedPct(stats.idio), tone: 'purple' },
    { label: 'Final NAV', value: fmtUsd(latestNav), tone: 'neutral' },
  ] as const

  return (
    <div className="stack">
      <section className="overview-top-grid">
        <section className="panel">
          <div className="panel-title">Backtest Setup</div>
          <div className="run-grid">
            <label className="field">
              <span>Symbols (comma-separated)</span>
              <input value={symbolText} onChange={(event) => setSymbolText(event.target.value)} />
            </label>
            <label className="field">
              <span>Start Date</span>
              <input type="date" value={form.startDate} onChange={(event) => setForm((prev) => ({ ...prev, startDate: event.target.value }))} />
            </label>
            <label className="field">
              <span>End Date</span>
              <input type="date" value={form.endDate} onChange={(event) => setForm((prev) => ({ ...prev, endDate: event.target.value }))} />
            </label>
            <label className="field">
              <span>Initial Capital</span>
              <input type="number" value={form.initialCapital} onChange={(event) => setForm((prev) => ({ ...prev, initialCapital: Number(event.target.value) }))} />
            </label>
            <label className="field">
              <span>Lookback Days</span>
              <input type="number" value={form.lookbackDays} onChange={(event) => setForm((prev) => ({ ...prev, lookbackDays: Number(event.target.value) }))} />
            </label>
            <label className="field">
              <span>Rebalance Frequency (days)</span>
              <input
                type="number"
                value={form.rebalanceFrequencyDays}
                onChange={(event) => setForm((prev) => ({ ...prev, rebalanceFrequencyDays: Number(event.target.value) }))}
              />
            </label>
          </div>
          <div className="run-actions">
            <button className="btn btn-primary" onClick={() => void startRun(submittedConfig)} disabled={status === 'running'}>
              {status === 'running' ? 'Running...' : 'Run Backtest'}
            </button>
            <button className="btn" onClick={reset}>
              Reset
            </button>
            <div className="status-pill">
              Status: <strong>{showSpinningUpStatus ? 'SPINNING UP BACKEND' : status.toUpperCase()}</strong>
              {status === 'running' ? ` (${progressPct.toFixed(0)}% @ ${progressDate || '-'})` : ''}
            </div>
          </div>
          <div className="python-status">
            Python:{' '}
            <strong className={pythonExecution?.succeeded === false ? 'neg' : 'pos'}>
              {pythonExecution ? `${pythonExecution.succeeded ? 'ok' : 'failed'}${pythonExecution.usedFallback ? ' (fallback)' : ''}` : 'pending'}
            </strong>
            {pythonExecution?.message ? <span className="python-status-message"> — {pythonExecution.message}</span> : null}
          </div>
          {pythonExecution?.stderrSnippet ? <div className="error-text">{pythonExecution.stderrSnippet}</div> : null}
          {errorMessage ? <div className="error-text">{errorMessage}</div> : null}
        </section>

        <section className="metrics-stack">
          <div className="metrics-grid top-metrics">
            <MetricCard label="Sharpe Ratio" value={fmtNum(metrics?.sharpe, 3)} helperText="ann. risk-adjusted" tone="info" />
            <MetricCard label="Ann. Return" value={fmtSignedPct(stats.annualReturn)} helperText="since inception" tone={stats.annualReturn >= 0 ? 'good' : 'bad'} />
            <MetricCard label="Ann. Std Dev" value={fmtPct(metrics?.annualizedVolatility)} helperText="annualized vol" />
            <MetricCard label="Max Drawdown" value={fmtSignedPct(latestDrawdown)} helperText="peak to trough" tone={latestDrawdown >= -0.2 ? 'good' : 'bad'} />
            <MetricCard label="Hit Rate" value={fmtPct(metrics?.hitRate)} helperText="% days positive" tone="info" />
          </div>
          <div className="metrics-grid top-metrics">
            <MetricCard label="Sortino Ratio" value={fmtNum(stats.sortinoRatio)} helperText="downside-adjusted" tone={stats.sortinoRatio >= 0 ? 'good' : 'bad'} />
            <MetricCard label="Information Ratio" value={fmtNum(stats.informationRatio)} helperText="active risk-adjusted" tone="info" />
            <MetricCard label="Calmar Ratio" value={fmtNum(stats.calmarRatio)} helperText="return / max drawdown" tone={stats.calmarRatio >= 0 ? 'good' : 'bad'} />
            <MetricCard label="Cumulative Return" value={fmtSignedPct(stats.cumulativeReturns)} helperText="total period return" tone={stats.cumulativeReturns >= 0 ? 'good' : 'bad'} />
            <MetricCard label="Daily VaR (5%)" value={fmtSignedPct(stats.dailyValueAtRisk)} helperText="left-tail daily risk" tone={stats.dailyValueAtRisk >= 0 ? 'good' : 'bad'} />
          </div>
        </section>
      </section>

      <section className="overview-main-grid">
        <div className="overview-left-pane">
          <StrategyWorkspaceEditor
            strategyCode={strategyCode}
            strategyParams={strategyParams}
            onStrategyCodeChange={setStrategyCode}
            onStrategyParamsChange={setStrategyParams}
          />
          <section className="panel">
            <div className="panel-title">Top Holdings (final rebalance)</div>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Symbol</th>
                    <th>Weight</th>
                    <th>PnL Contribution</th>
                  </tr>
                </thead>
                <tbody>
                  {topHoldings.map((row) => (
                    <tr key={row.symbol}>
                      <td>{row.symbol}</td>
                      <td>{fmtPct(row.weight)}</td>
                      <td className={row.pnlContribution >= 0 ? 'pos' : 'neg'}>{fmtPct(row.pnlContribution)}</td>
                    </tr>
                  ))}
                  {topHoldings.length > 0 ? null : (
                    <tr>
                      <td colSpan={3} className="muted-cell">
                        Run a backtest to populate holdings.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>

        <div className="overview-right-pane">
          <EquityCurveChart data={equityData} />
          <section className="overview-bottom-charts">
            <DrawdownChart data={drawdownData} />
            <ReturnsHistogram dailyReturns={dailyReturnsData} />
          </section>
          <section className="panel quick-stats">
            <div className="panel-title">Additional Statistics</div>
            <div className="stats-meta">
              Entire data end date: {stats.endDate || '-'} · Backtest months: {Number.isFinite(stats.backtestMonths) ? stats.backtestMonths : '-'}
            </div>
            <div className="stats-grid">
              {additionalStats.map((item) => (
                <div key={item.label}>
                  <span>{item.label}</span>
                  <strong className={`tone-${item.value === '-' ? 'neutral' : item.tone}`}>{item.value}</strong>
                </div>
              ))}
            </div>
          </section>
        </div>
      </section>
    </div>
  )
}
