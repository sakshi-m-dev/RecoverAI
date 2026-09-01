import AnimatedCounter from '../shared/AnimatedCounter'

function MetricCard({ label, value, prefix = '', suffix = '', color, sublabel }) {
  const colorClass = {
    gold: 'text-gold',
    green: 'text-recovered',
    amber: 'text-at-risk',
    purple: 'text-escalated',
    red: 'text-failed'
  }[color] || 'text-gold'

  return (
    <div className="glass-card p-5 relative overflow-hidden flex flex-col justify-between">
      {/* Card ambient glow */}
      <div className={`absolute top-0 right-0 w-28 h-28 rounded-full blur-3xl pointer-events-none opacity-20 ${
        color === 'green' ? 'bg-recovered/20' : 
        color === 'amber' ? 'bg-at-risk/15' : 
        color === 'purple' ? 'bg-escalated/15' : 'bg-gold/15'
      }`} style={{ transform: 'translate(30%, -30%)' }} />

      <div>
        <div className="section-label mb-3 relative text-[10px]">{label}</div>
        <div className={`font-display text-4xl lg:text-5xl leading-none relative ${colorClass}`}>
          <AnimatedCounter value={value} prefix={prefix} suffix={suffix}
            decimals={suffix === '%' ? 1 : 0} duration={1600} />
        </div>
      </div>
      {sublabel && <div className="text-[10px] text-text-muted mt-3.5 relative line-clamp-1">{sublabel}</div>}
    </div>
  )
}

export default function HeroMetrics({ stats }) {
  if (!stats) return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      {[0, 1, 2, 3, 4].map(i => (
        <div key={i} className="glass-card p-5 h-28 shimmer rounded-xl" />
      ))}
    </div>
  )

  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
      <MetricCard
        label="Revenue at Risk"
        value={stats.at_risk_amount}
        prefix="₹"
        color="amber"
        sublabel={`${stats.at_risk_count} pending cases`}
      />
      <MetricCard
        label="Revenue Recovered"
        value={stats.recovered_amount}
        prefix="₹"
        color="green"
        sublabel={`${stats.recovered_count} rescued cases`}
      />
      <MetricCard
        label="Recovery Rate"
        value={stats.recovery_rate}
        suffix="%"
        color="gold"
        sublabel={`${stats.failed_count} failed · ${stats.escalated_count} escalated`}
      />
      <MetricCard
        label="Auto Resolution"
        value={stats.autonomous_resolution_rate}
        suffix="%"
        color="green"
        sublabel="Recovered / Actioned"
      />
      <MetricCard
        label="Actions Blocked"
        value={stats.blocked_actions}
        color="purple"
        sublabel="Blocked by guardrail policies"
      />
    </div>
  )
}
