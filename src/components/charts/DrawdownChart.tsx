import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

type DrawdownPoint = {
  date: string
  drawdown: number
}

type DrawdownChartProps = {
  data: DrawdownPoint[]
}

export function DrawdownChart({ data }: DrawdownChartProps) {
  return (
    <div className="panel chart-panel">
      <div className="panel-title">Underwater (Drawdown from Peak)</div>
      <ResponsiveContainer width="100%" height={240}>
        <AreaChart data={data}>
          <defs>
            <linearGradient id="drawdownFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor="#ff5b8a" stopOpacity={0.9} />
              <stop offset="95%" stopColor="#ff5b8a" stopOpacity={0.1} />
            </linearGradient>
          </defs>
          <CartesianGrid stroke="#12324f" strokeDasharray="2 4" />
          <XAxis dataKey="date" minTickGap={40} stroke="#8bbde1" tick={{ fontSize: 11 }} />
          <YAxis
            stroke="#8bbde1"
            tick={{ fontSize: 11 }}
            tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`}
          />
          <Tooltip
            contentStyle={{ backgroundColor: "rgb(13, 20, 36)", border: "1px solid rgb(26, 37, 64)", borderRadius: 8 }}
            labelStyle={{ color: "#7c9cb8" }}
            itemStyle={{ color: "#e8f0fe" }}
            cursor={{ stroke: "#355077", strokeWidth: 1 }}
            formatter={(value) => {
              const numeric = typeof value === 'number' ? value : 0
              return `${(numeric * 100).toFixed(2)}%`
            }}
          />
          <Area
            type="monotone"
            dataKey="drawdown"
            stroke="#ff5b8a"
            fill="url(#drawdownFill)"
            isAnimationActive={false}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  )
}
