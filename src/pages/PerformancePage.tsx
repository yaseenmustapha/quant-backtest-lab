import { DrawdownChart } from '../components/charts/DrawdownChart'
import { ReturnsHistogram } from '../components/charts/ReturnsHistogram'
import { useRunStore } from '../store/runStore'

export function PerformancePage() {
  const result = useRunStore((state) => state.result)

  return (
    <div className="stack">
      <DrawdownChart data={result?.drawdownSeries ?? []} />
      <ReturnsHistogram dailyReturns={result?.dailyReturns ?? []} />
    </div>
  )
}
