import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const PALETTE = ['#F59E0B', '#3B82F6', '#F5B731', '#22C55E', '#EF4444']

function formatCurrency(v) {
  if (v >= 100000) return `₹${(v / 100000).toFixed(1)}L`
  if (v >= 1000) return `₹${(v / 1000).toFixed(1)}k`
  return `₹${v}`
}

function CustomTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null
  const data = payload[0].payload
  return (
    <div className="glass-card px-3 py-2.5 border-white/[0.1] text-sm">
      <div className="text-text-muted text-[10px] uppercase tracking-wider mb-1">{label} Pipeline Stage</div>
      <div className="font-semibold text-text-primary text-base">₹{Number(data.amount).toLocaleString('en-IN')}</div>
      <div className="text-xs text-text-secondary mt-0.5">{data.count} case{data.count !== 1 ? 's' : ''}</div>
    </div>
  )
}

function CustomLabel({ x, y, width, value }) {
  if (!value) return null
  return (
    <text x={x + width / 2} y={y - 8} textAnchor="middle" fill="#9CA3AF" fontSize={10} fontWeight="500">
      {formatCurrency(value)}
    </text>
  )
}

export default function FunnelViz({ data }) {
  if (!data?.length) return (
    <div className="glass-card p-6 h-full flex items-center justify-center">
      <div className="shimmer w-full h-40 rounded-lg" />
    </div>
  )

  return (
    <div className="glass-card p-6 h-full flex flex-col">
      <div className="section-label mb-5">Recovery Funnel (Revenue vs Volume)</div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} margin={{ top: 22, right: 8, left: -22, bottom: 0 }}>
            <XAxis
              dataKey="stage"
              tick={{ fill: '#6B7280', fontSize: 10 }}
              axisLine={false} tickLine={false}
            />
            <YAxis
              tickFormatter={formatCurrency}
              tick={{ fill: '#6B7280', fontSize: 10 }}
              axisLine={false} tickLine={false}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ fill: 'rgba(255,255,255,0.02)' }} />
            <Bar dataKey="amount" radius={[4,4,0,0]} label={<CustomLabel />}>
              {data.map((_, i) => (
                <Cell key={i} fill={PALETTE[i % PALETTE.length]} fillOpacity={0.75} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  )
}
