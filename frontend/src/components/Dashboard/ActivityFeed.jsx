import StatusBadge from '../shared/StatusBadge'

function fmt(amount) { return '₹' + Number(amount).toLocaleString('en-IN') }

function timeAgo(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const m = Math.floor(diff / 60000)
  const h = Math.floor(m / 60)
  const d = Math.floor(h / 24)
  if (d > 0) return `${d}d ago`
  if (h > 0) return `${h}h ago`
  if (m > 0) return `${m}m ago`
  return 'just now'
}

function getMessage(tx) {
  const first = (tx.customer_name || 'Customer').split(' ')[0]
  const amt = fmt(tx.amount)
  switch (tx.status) {
    case 'recovered':  return `Recovered ${amt} from ${first}. Revenue secured.`
    case 'failed':     return `Tried for ${first}'s ${amt} — no response. Flagged for follow-up.`
    case 'escalated':  return `${first}'s ${amt} case flagged for human review — policy threshold.`
    case 'recovering': return `Working on ${first}'s ${amt} — nudge sent, waiting on response.`
    default:           return `Detected failed payment of ${amt} from ${first}.`
  }
}

export default function ActivityFeed({ transactions = [] }) {
  const sorted = [...transactions]
    .sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at))
    .slice(0, 22)

  return (
    <div className="glass-card p-6 h-full flex flex-col overflow-hidden">
      <div className="flex items-center justify-between mb-4 shrink-0">
        <div className="section-label">Live Activity</div>
        <div className="flex items-center gap-1.5 text-xs text-text-muted">
          <span className="w-1.5 h-1.5 rounded-full bg-recovered pulse-dot" />
          Live
        </div>
      </div>

      <div className="flex-1 overflow-y-auto -mr-2 pr-2 space-y-0">
        {sorted.map((tx) => (
          <div key={tx.id} className="feed-item-enter py-3 border-b border-white/[0.04] last:border-0">
            <div className="flex items-start gap-3">
              <StatusBadge status={tx.status} className="mt-0.5 shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="text-sm text-text-secondary leading-snug">{getMessage(tx)}</p>
                <div className="text-xs text-text-muted mt-1">{timeAgo(tx.updated_at || tx.created_at)}</div>
              </div>
            </div>
          </div>
        ))}

        {!sorted.length && (
          <div className="flex items-center justify-center h-full text-text-muted text-sm py-12">
            No activity yet — run the batch to see the agent work.
          </div>
        )}
      </div>
    </div>
  )
}
