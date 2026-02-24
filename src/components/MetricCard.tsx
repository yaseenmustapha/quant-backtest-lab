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
  const resolvedTone = value === '-' ? 'neutral' : tone

  return (
    <article className="metric-card">
      <div className="metric-label">{label}</div>
      <div className={`metric-value tone-${resolvedTone}`}>{value}</div>
      {helperText ? <div className="metric-subtitle">{helperText}</div> : null}
    </article>
  )
}
