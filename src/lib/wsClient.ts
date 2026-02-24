import {
  HubConnection,
  HubConnectionBuilder,
  HttpTransportType,
  LogLevel,
} from '@microsoft/signalr'
import { getApiBase } from './apiClient'
import type { EquityPoint, LiveStatsSnapshot, MetricSnapshot } from '../types'

type WsHandlers = {
  onProgress: (progress: number, currentDate: string) => void
  onEquityPoint: (point: EquityPoint) => void
  onDrawdownPoint: (point: { date: string; drawdown: number }) => void
  onDailyReturnPoint: (point: { date: string; dailyReturn: number }) => void
  onMetricSnapshot: (snapshot: MetricSnapshot) => void
  onStatsSnapshot: (snapshot: LiveStatsSnapshot) => void
  onCompleted: () => void
}

export async function connectRunHub(runId: string, handlers: WsHandlers): Promise<HubConnection> {
  const connection = new HubConnectionBuilder()
    .withUrl(`${getApiBase()}/hubs/runs`, {
      transport: HttpTransportType.WebSockets | HttpTransportType.LongPolling,
    })
    .withAutomaticReconnect()
    .configureLogging(LogLevel.Warning)
    .build()

  connection.on('runProgress', (payload: { runId: string; progressPct: number; currentDate: string }) => {
    if (payload.runId === runId) {
      handlers.onProgress(payload.progressPct, payload.currentDate)
    }
  })

  connection.on('equityPoint', (payload: { runId: string; point: EquityPoint }) => {
    if (payload.runId === runId) {
      handlers.onEquityPoint(payload.point)
    }
  })

  connection.on('drawdownPoint', (payload: { runId: string; point: { date: string; drawdown: number } }) => {
    if (payload.runId === runId) {
      handlers.onDrawdownPoint(payload.point)
    }
  })

  connection.on('dailyReturnPoint', (payload: { runId: string; point: { date: string; dailyReturn: number } }) => {
    if (payload.runId === runId) {
      handlers.onDailyReturnPoint(payload.point)
    }
  })

  connection.on('metricSnapshot', (payload: { runId: string; snapshot: MetricSnapshot }) => {
    if (payload.runId === runId) {
      handlers.onMetricSnapshot(payload.snapshot)
    }
  })

  connection.on('statsSnapshot', (payload: { runId: string; snapshot: LiveStatsSnapshot }) => {
    if (payload.runId === runId) {
      handlers.onStatsSnapshot(payload.snapshot)
    }
  })

  connection.on('runCompleted', (payload: { runId: string }) => {
    if (payload.runId === runId) {
      handlers.onCompleted()
    }
  })

  await connection.start()
  return connection
}
