import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import StatusBadge from './StatusBadge'

const FAILURE_LABELS = {
  card_decline:      'Card Decline',
  otp_timeout:       'OTP Timeout',
  insufficient_funds:'Insufficient Funds',
  network_drop:      'Network Drop',
  abandoned:         'Abandoned Cart',
}

const SCENARIO_LABELS = {
  failed_payment: 'Payment',
  checkout_abandonment: 'Checkout',
  subscription_failure: 'Subscription',
}

function fmt(amount) {
  return '₹' + Number(amount).toLocaleString('en-IN')
}

export default function TransactionCard({ transaction, result, delay = 0, showDetail = true }) {
  const isRecovered = transaction.status === 'recovered'
  const isFailed    = transaction.status === 'failed'
  const isEscalated = transaction.status === 'escalated'

  const scenario = SCENARIO_LABELS[transaction.scenario_type] || 'Payment'
  const risk = transaction.risk_score || 50
  
  let riskColor = 'text-green-400 bg-green-950/40 border-green-800/40'
  if (risk > 70) riskColor = 'text-red-400 bg-red-950/40 border-red-800/40'
  else if (risk > 45) riskColor = 'text-amber-400 bg-amber-950/40 border-amber-800/40'

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.38, ease: 'easeOut' }}
      className={`glass-card p-4 relative overflow-hidden group transition-all duration-300 cursor-default ${
        isRecovered ? 'border-recovered/25 bg-recovered/[0.025]' :
        isFailed    ? 'border-failed/15'    :
        isEscalated ? 'border-escalated/15' :
        'hover:border-white/10'
      }`}
    >
      {/* Glow accents */}
      {isRecovered && (
        <div className="absolute top-0 right-0 w-28 h-28 bg-recovered/15 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
      )}
      {isFailed && (
        <div className="absolute top-0 right-0 w-28 h-28 bg-failed/15 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
      )}
      {isEscalated && (
        <div className="absolute top-0 right-0 w-28 h-28 bg-escalated/15 rounded-full blur-2xl -translate-y-1/2 translate-x-1/2 pointer-events-none" />
      )}

      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <div className="font-semibold text-text-primary text-sm truncate">{transaction.customer_name}</div>
          <div className="text-xs text-text-muted mt-0.5 truncate">{transaction.customer_email}</div>
        </div>
        <StatusBadge status={transaction.status} className="shrink-0" />
      </div>

      {/* Scenario and risk badge */}
      <div className="flex items-center gap-1.5 mb-3 flex-wrap">
        <span className="text-[10px] font-semibold tracking-wider uppercase bg-white/[0.04] text-text-secondary px-2 py-0.5 rounded border border-white/[0.08]">
          {scenario}
        </span>
        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded border ${riskColor}`}>
          Risk: {risk}%
        </span>
        {transaction.attempts_count > 0 && (
          <span className="text-[10px] font-semibold bg-gold/10 text-gold px-2 py-0.5 rounded border border-gold/20">
            Attempt #{transaction.attempts_count}
          </span>
        )}
      </div>

      {/* Amount & reason */}
      <div className="flex items-end justify-between">
        <div>
          <div className="text-xs text-text-muted mb-1">
            {FAILURE_LABELS[transaction.failure_reason] || transaction.failure_reason}
          </div>
          <div className={`font-display text-2xl leading-none ${isRecovered ? 'text-recovered' : 'text-gold'}`}>
            {fmt(transaction.amount)}
          </div>
          {transaction.discount_applied > 0 && (
            <div className="text-xs text-at-risk/80 mt-0.5">{transaction.discount_applied}% discount</div>
          )}
        </div>
        {result?.action && (
          <div className="text-xs text-text-muted text-right">
            {result.action.replace(/_/g, ' ')}
          </div>
        )}
      </div>

      {/* Agent reasoning snippet */}
      {result?.diagnosisReasoning && (
        <div className="mt-3 pt-3 border-t border-white/[0.04]">
          <p className="text-xs text-text-muted leading-relaxed italic line-clamp-2">
            "{result.diagnosisReasoning}"
          </p>
        </div>
      )}

      {/* Hover overlay → case detail */}
      {showDetail && (
        <Link
          to={`/case/${transaction.id}`}
          className="absolute inset-0 rounded-xl opacity-0 group-hover:opacity-100 flex items-center justify-center bg-bg-card/85 backdrop-blur-sm transition-all duration-200"
        >
          <span className="text-xs font-medium text-gold border border-gold/25 px-3 py-1.5 rounded-lg bg-gold/5">
            View Case →
          </span>
        </Link>
      )}
    </motion.div>
  )
}
