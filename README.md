# Quant Backtesting Lab

A portfolio-oriented quant backtesting project with:

- React + TypeScript frontend
- C# ASP.NET Core backend
- Real historical US equities data from free Stooq CSV endpoints
- WebSocket streaming via SignalR for live run progress, charts, and metrics

## Features in this MVP

- Backtest controls for symbols/date range/strategy params
- Strategy editor on Overview:
  - single `strategy.py` Monaco editor
  - dynamic custom parameter builder (string/number/boolean/json)
  - one-click quant template import (momentum, mean reversion, trend + inverse vol)
  - fullscreen editor mode + local autosave in browser
- Momentum long/short engine (event-driven daily loop, periodic rebalance)
- Live metrics cards and live additional statistics streamed from backend
- Equity curve vs SPY benchmark
- Drawdown and returns distribution charts
- Transactions table

## Project structure

- `src/`: frontend
- `backend/`: C# API, backtest engine, market data service, SignalR hub

## Prerequisites

- Bun (or npm/pnpm, but repo is currently using Bun lockfile)
- .NET SDK 8.0+
- Python 3.10+
- Python packages: `pandas` and `numpy`

## Run frontend

```bash
bun install
cp .env.example .env
bun dev
```

Frontend runs on `http://localhost:5173` by default.

## Run backend (with venv + fixed port)

```bash
# from repo root
python3 -m venv .venv
source .venv/bin/activate
pip install --upgrade pip
pip install pandas numpy

cd backend
dotnet restore
ASPNETCORE_URLS=http://127.0.0.1:5055 dotnet run
```

Backend will run on `http://127.0.0.1:5055`.

If you use a different port, update `VITE_API_BASE` in `.env`.

## Recommended local setup

- Terminal 1 (frontend):

```bash
bun dev
```

- Terminal 2 (backend):

```bash
source .venv/bin/activate
cd backend
ASPNETCORE_URLS=http://127.0.0.1:5055 dotnet run
```

## API endpoints

- `POST /api/runs` -> start a run
- `GET /api/runs/{runId}` -> get finalized result
- `GET /api/runs/{runId}/transactions` -> get transactions
- `WS /hubs/runs` -> SignalR progress/events

Live SignalR payloads include run progress, equity points, drawdown points, daily return points, and live metric/stat snapshots.

## Python strategy contract

The frontend sends:

- `strategyCode: string` (single python file contents)
- `strategyParams: Record<string, unknown>` (user-defined params)

Preferred strategy entrypoint:

```python
def generate_signals(context, params):
    # return one of:
    # 1) DataFrame long-form: columns ['date', 'symbol', 'signal']
    # 2) DataFrame wide-form: index=date, cols=symbol, values=signal
    # 3) Series: symbol -> signal (applied to latest date)
    # 4) dict: either {date: {symbol: signal}} or {symbol: signal}
    ...
```

Context passed to `generate_signals`:

- `context["dates"]`: ordered date list (`YYYY-MM-DD`)
- `context["symbols"]`: symbol universe
- `context["close"]`: pandas DataFrame of closes (date x symbol)
- `context["returns"]`: pandas DataFrame of daily returns (date x symbol)
- `context["datasets"]`: helper object with `load("market_daily", date_start=None, date_end=None)`

Legacy support is kept for `class Strategy(...): get_signals(...)` and `compute_signals(...)`.
If custom Python fails, the run fails by default unless `fallbackToBuiltinOnPythonError` is set to `true`.

## Notes

- There is no frontend mock fallback now. If backend data is unavailable, UI fields show `-`.
- If Python strategy execution fails, the run fails by default (or optionally falls back when `fallbackToBuiltinOnPythonError` is `true`).
- If you see "address already in use" on startup, stop the process using port `5055` or run backend on a different port and update `.env`.
