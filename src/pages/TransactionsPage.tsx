import { useRunStore } from '../store/runStore'
import type { TransactionsPoint } from '../types'

const EMPTY_TRANSACTIONS: TransactionsPoint[] = []

function fmtUsd(value: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 2,
  }).format(value)
}

export function TransactionsPage() {
  const transactions = useRunStore((state) => state.result?.transactions) ?? EMPTY_TRANSACTIONS

  return (
    <section className="panel">
      <div className="panel-title">Transactions</div>
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Date</th>
              <th>Symbol</th>
              <th>Side</th>
              <th>Shares</th>
              <th>Price</th>
              <th>Turnover</th>
            </tr>
          </thead>
          <tbody>
            {transactions.map((tx, idx) => (
              <tr key={`${tx.date}-${tx.symbol}-${idx}`}>
                <td>{tx.date}</td>
                <td>{tx.symbol}</td>
                <td>{tx.side}</td>
                <td>{tx.shares.toLocaleString('en-US')}</td>
                <td>{fmtUsd(tx.price)}</td>
                <td>{fmtUsd(tx.turnoverUsd)}</td>
              </tr>
            ))}
            {transactions.length === 0 ? (
              <tr>
                <td colSpan={6} className="muted-cell">
                  No transactions yet. Run a backtest from the Overview tab.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </section>
  )
}
