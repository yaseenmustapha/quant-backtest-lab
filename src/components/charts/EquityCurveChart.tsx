import {
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import type { EquityPoint } from '../../types'

type EquityCurveChartProps = {
  data: EquityPoint[]
}

const MONOSPACE_FONT_FAMILY = '"IBM Plex Mono", ui-monospace, SFMono-Regular, Menlo, Monaco, monospace'

export function EquityCurveChart({ data }: EquityCurveChartProps) {
  return (
    <div className="panel chart-panel">
      <div className="panel-title">Equity Curve vs Benchmark</div>
      <ResponsiveContainer width="100%" height={320}>
        <LineChart data={data}>
          <CartesianGrid stroke="#12324f" strokeDasharray="2 4" />
          <XAxis dataKey="date" minTickGap={40} stroke="#8bbde1" tick={{ fontSize: 11, fontFamily: MONOSPACE_FONT_FAMILY }} />
          <YAxis stroke="#8bbde1" tick={{ fontSize: 11, fontFamily: MONOSPACE_FONT_FAMILY }} domain={['auto', 'auto']} />
          <Tooltip
            contentStyle={{ backgroundColor: "rgb(13, 20, 36)", border: "1px solid rgb(26, 37, 64)", borderRadius: 8, fontFamily: MONOSPACE_FONT_FAMILY }}
            labelStyle={{ color: "#7c9cb8", fontFamily: MONOSPACE_FONT_FAMILY }}
            itemStyle={{ color: "#e8f0fe", fontFamily: MONOSPACE_FONT_FAMILY }}
            cursor={{ stroke: "#355077", strokeWidth: 1 }}
          />
          <Legend wrapperStyle={{ fontFamily: MONOSPACE_FONT_FAMILY, fontSize: 11 }} />
          <Line
            type="monotone"
            dataKey="nav"
            dot={false}
            isAnimationActive={false}
            name="Strategy NAV"
            stroke="#30d5ff"
            strokeWidth={2}
          />
          <Line
            type="monotone"
            dataKey="benchmarkNav"
            dot={false}
            isAnimationActive={false}
            name="SPY NAV"
            stroke="#95a5c6"
            strokeWidth={1.5}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
