import type { BacktestConfig, BacktestResult, CreateRunResponse } from '../types'

const API_BASE = import.meta.env.VITE_API_BASE ?? 'http://localhost:5055'

async function parseOrThrow<T>(response: Response): Promise<T> {
  if (!response.ok) {
    const message = await response.text()
    throw new Error(message || 'API request failed')
  }
  return (await response.json()) as T
}

function isBacktestResult(payload: unknown): payload is BacktestResult {
  if (!payload || typeof payload !== 'object') {
    return false
  }
  const candidate = payload as Partial<BacktestResult>
  return (
    typeof candidate.runId === 'string' &&
    typeof candidate.pythonExecution === 'object' &&
    candidate.pythonExecution !== null &&
    typeof candidate.additionalStats === 'object' &&
    candidate.additionalStats !== null &&
    Array.isArray(candidate.equityCurve) &&
    Array.isArray(candidate.drawdownSeries) &&
    Array.isArray(candidate.dailyReturns) &&
    Array.isArray(candidate.topHoldings) &&
    Array.isArray(candidate.transactions)
  )
}

type PendingRunPayload = {
  runId: string
  status: string
  errorMessage?: string | null
}

export async function createRun(config: BacktestConfig): Promise<CreateRunResponse> {
  const response = await fetch(`${API_BASE}/api/runs`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(config),
  })
  return parseOrThrow<CreateRunResponse>(response)
}

export async function waitForRunResult(
  runId: string,
  timeoutMs = 120_000,
): Promise<BacktestResult> {
  const startedAt = Date.now()

  // Poll until backend has finalized the run result.
  while (Date.now() - startedAt < timeoutMs) {
    const response = await fetch(`${API_BASE}/api/runs/${runId}`)

    if (response.status === 202) {
      const pending = (await response.json()) as PendingRunPayload
      if (pending.status === 'error') {
        throw new Error(pending.errorMessage || 'Run failed on backend.')
      }
      await new Promise((resolve) => setTimeout(resolve, 1000))
      continue
    }

    const payload = await parseOrThrow<unknown>(response)
    if (isBacktestResult(payload)) {
      return payload
    }
    throw new Error('Run payload was not a valid BacktestResult.')
  }

  throw new Error('Timed out waiting for run completion.')
}

export async function getRun(runId: string): Promise<BacktestResult> {
  const response = await fetch(`${API_BASE}/api/runs/${runId}`)
  const payload = await parseOrThrow<unknown>(response)
  if (isBacktestResult(payload)) {
    return payload
  }
  throw new Error('Run payload was not a valid BacktestResult.')
}

export async function getTransactions(runId: string): Promise<BacktestResult['transactions']> {
  const response = await fetch(`${API_BASE}/api/runs/${runId}/transactions`)
  return parseOrThrow<BacktestResult['transactions']>(response)
}

export function getApiBase(): string {
  return API_BASE
}

export async function measureServerLatency(): Promise<number | null> {
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 2500)
  const start = performance.now()

  try {
    const response = await fetch(`${API_BASE}/`, {
      method: 'GET',
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!response.ok) {
      return null
    }
    return Math.round(performance.now() - start)
  } catch {
    return null
  } finally {
    window.clearTimeout(timeoutId)
  }
}
