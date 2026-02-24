import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

type ReturnPoint = {
  date: string
  dailyReturn: number
}

type BinPoint = {
  bucket: string
  count: number
}

type ReturnsHistogramProps = {
  dailyReturns: ReturnPoint[]
}

const MONOSPACE_FONT_FAMILY = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, monospace'

function buildBins(dailyReturns: ReturnPoint[]): BinPoint[] {
  if (dailyReturns.length === 0) {
    return []
  }
  const values = dailyReturns.map((d) => d.dailyReturn)
  const min = Math.min(...values)
  const max = Math.max(...values)
  const bins = 20
  const range = Math.max(max - min, 1e-6)
  const width = range / bins
  const counts = new Array<number>(bins).fill(0)

  values.forEach((value) => {
    const rawIndex = Math.floor((value - min) / width)
    const index = Math.max(0, Math.min(bins - 1, rawIndex))
    counts[index] += 1
  })

  return counts.map((count, index) => {
    const lower = min + index * width
    const upper = lower + width
    return {
      bucket: `${(lower * 100).toFixed(1)}-${(upper * 100).toFixed(1)}%`,
      count,
    }
  })
}

export function ReturnsHistogram({ dailyReturns }: ReturnsHistogramProps) {
  const data = buildBins(dailyReturns)
  return (
    <div className="panel chart-panel">
      <div className="panel-title">Daily Returns Distribution</div>
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data}>
          <CartesianGrid stroke="#12324f" strokeDasharray="2 4" />
          <XAxis dataKey="bucket" hide />
          <YAxis stroke="#8bbde1" tick={{ fontSize: 11, fontFamily: MONOSPACE_FONT_FAMILY }} />
          <Tooltip
            contentStyle={{ backgroundColor: "rgb(13, 20, 36)", border: "1px solid rgb(26, 37, 64)", borderRadius: 8, fontFamily: MONOSPACE_FONT_FAMILY }}
            labelStyle={{ color: "#7c9cb8", fontFamily: MONOSPACE_FONT_FAMILY }}
            itemStyle={{ color: "#e8f0fe", fontFamily: MONOSPACE_FONT_FAMILY }}
            cursor={{ stroke: "#355077", strokeWidth: 1 }}
          />
          <Bar dataKey="count" fill="#9d5cff" isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
