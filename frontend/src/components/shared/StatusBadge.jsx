const CONFIG = {
  at_risk:   { label: 'At Risk',   cls: 'text-at-risk  bg-at-risk/10   border-at-risk/25',   dot: 'bg-at-risk',   pulse: false },
  recovering:{ label: 'Working…',  cls: 'text-recovering bg-recovering/10 border-recovering/25', dot: 'bg-recovering', pulse: true  },
  recovered: { label: 'Recovered', cls: 'text-recovered bg-recovered/10 border-recovered/25', dot: 'bg-recovered', pulse: false },
  failed:    { label: 'Failed',    cls: 'text-failed    bg-failed/10    border-failed/25',    dot: 'bg-failed',    pulse: false },
  escalated: { label: 'Escalated', cls: 'text-escalated bg-escalated/10 border-escalated/25', dot: 'bg-escalated', pulse: false },
}

export default function StatusBadge({ status, className = '' }) {
  const cfg = CONFIG[status] || CONFIG.at_risk
  return (
    <span className={`status-pill border ${cfg.cls} ${className}`}>
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${cfg.dot} ${cfg.pulse ? 'pulse-dot' : ''}`} />
      {cfg.label}
    </span>
  )
}
