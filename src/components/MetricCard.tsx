type MetricCardProps = {
  label: string
  value: string
  tone?: 'neutral' | 'good' | 'bad' | 'info' | 'purple'
  helperText?: string
}

export function MetricCard({
  label,
  value,
  tone = 'neutral',
  helperText,
}: MetricCardProps) {
  return (
    <article className="metric-card">
      <div className="metric-label">{label}</div>
      <div className={`metric-value tone-${tone}`}>{value}</div>
      {helperText ? <div className="metric-subtitle">{helperText}</div> : null}
    </article>
  )
}
