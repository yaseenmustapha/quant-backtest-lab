import { create } from 'zustand'
import type { HubConnection } from '@microsoft/signalr'
import { createRun, waitForRunResult } from '../lib/apiClient'
import { connectRunHub } from '../lib/wsClient'
import type { BacktestConfig, BacktestResult, EquityPoint, LiveStatsSnapshot, MetricSnapshot, RunStatus } from '../types'

type RunState = {
  status: RunStatus
  runId: string | null
  progressPct: number
  progressDate: string
  latestSnapshot: MetricSnapshot | null
  latestStatsSnapshot: LiveStatsSnapshot | null
  liveEquityCurve: EquityPoint[]
  liveDrawdownSeries: { date: string; drawdown: number }[]
  liveDailyReturns: { date: string; dailyReturn: number }[]
  result: BacktestResult | null
  errorMessage: string | null
  connection: HubConnection | null
  startRun: (config: BacktestConfig) => Promise<void>
  reset: () => void
}

export const useRunStore = create<RunState>((set, get) => ({
  status: 'idle',
  runId: null,
  progressPct: 0,
  progressDate: '',
  latestSnapshot: null,
  latestStatsSnapshot: null,
  liveEquityCurve: [],
  liveDrawdownSeries: [],
  liveDailyReturns: [],
  result: null,
  errorMessage: null,
  connection: null,
  async startRun(config) {
    const current = get().connection
    if (current) {
      await current.stop()
    }

    set({
      status: 'running',
      runId: null,
      progressPct: 0,
      progressDate: '',
      latestSnapshot: null,
      latestStatsSnapshot: null,
      liveEquityCurve: [],
      liveDrawdownSeries: [],
      liveDailyReturns: [],
      result: null,
      errorMessage: null,
      connection: null,
    })

    try {
      const response = await createRun(config)
      const nextRunId = response.runId
      set({ runId: nextRunId })

      const hub = await connectRunHub(nextRunId, {
        onProgress: (progressPct, currentDate) => set({ progressPct, progressDate: currentDate }),
        onEquityPoint: (point) =>
          set((state) => {
            const existing = state.result
            const liveEquityCurve = [...state.liveEquityCurve, point]
            if (!existing) {
              return { ...state, liveEquityCurve }
            }
            const safeCurve = Array.isArray(existing.equityCurve) ? existing.equityCurve : []
            return {
              ...state,
              liveEquityCurve,
              result: {
                ...existing,
                equityCurve: [...safeCurve, point],
              },
            }
          }),
        onDrawdownPoint: (point) =>
          set((state) => {
            const liveDrawdownSeries = [...state.liveDrawdownSeries, point]
            const existing = state.result
            if (!existing) {
              return { ...state, liveDrawdownSeries }
            }
            const safeSeries = Array.isArray(existing.drawdownSeries) ? existing.drawdownSeries : []
            return {
              ...state,
              liveDrawdownSeries,
              result: {
                ...existing,
                drawdownSeries: [...safeSeries, point],
              },
            }
          }),
        onDailyReturnPoint: (point) =>
          set((state) => {
            const liveDailyReturns = [...state.liveDailyReturns, point]
            const existing = state.result
            if (!existing) {
              return { ...state, liveDailyReturns }
            }
            const safeSeries = Array.isArray(existing.dailyReturns) ? existing.dailyReturns : []
            return {
              ...state,
              liveDailyReturns,
              result: {
                ...existing,
                dailyReturns: [...safeSeries, point],
              },
            }
          }),
        onMetricSnapshot: (snapshot) => set({ latestSnapshot: snapshot }),
        onStatsSnapshot: (snapshot) => set({ latestStatsSnapshot: snapshot }),
        onCompleted: () => set({ status: 'completed', progressPct: 100 }),
      })
      set({ connection: hub })

      const result = await waitForRunResult(nextRunId)
      set({
        result,
        status: 'completed',
        progressPct: 100,
        latestSnapshot: result.metrics,
        latestStatsSnapshot: result.additionalStats,
        liveEquityCurve: result.equityCurve,
        liveDrawdownSeries: result.drawdownSeries,
        liveDailyReturns: result.dailyReturns,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Run failed'
      set({
        status: 'error',
        errorMessage: message,
      })
    }
  },
  reset() {
    void get().connection?.stop()
    set({
      status: 'idle',
      runId: null,
      progressPct: 0,
      progressDate: '',
      latestSnapshot: null,
      latestStatsSnapshot: null,
      liveEquityCurve: [],
      liveDrawdownSeries: [],
      liveDailyReturns: [],
      result: null,
      errorMessage: null,
      connection: null,
    })
  },
}))
