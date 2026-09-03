import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import axios from 'axios'
import StatusBadge from '../shared/StatusBadge'
import AgentDecisionPanel from '../shared/AgentDecisionPanel'
import AgentTimeline from '../shared/AgentTimeline'
import {
  CreditCardIcon,
  SearchIcon,
  MailIcon,
  TagIcon,
  UserIcon,
  SparklesIcon,
  XIcon,
  ShieldIcon,
  CheckIcon,
  ClockIcon,
  AlertIcon,
} from '../shared/Icons'

function fmt(amount) { return '₹' + Number(amount).toLocaleString('en-IN') }
function fmtTime(d) {
  return new Date(d).toLocaleString('en-IN', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })
}

const FAILURE_LABELS = {
  card_decline: 'Card Decline', otp_timeout: 'OTP Timeout',
  insufficient_funds: 'Insufficient Funds', network_drop: 'Network Drop', abandoned: 'Cart Abandoned',
}

const SCENARIO_LABELS = {
  failed_payment: 'Failed Payment',
  checkout_abandonment: 'Checkout Abandonment',
  subscription_failure: 'Subscription Renewal Failure',
}

export default function CaseDetail() {
  const { id } = useParams()
  const [data, setData]           = useState(null)
  const [loading, setLoading]     = useState(true)
  const [trace, setTrace]         = useState(null)
  const [traceLoading, setTL]     = useState(false)
  const [traceError, setTE]       = useState(null)

  useEffect(() => {
    axios.get(`/api/transactions/${id}`)
      .then(r => setData(r.data))
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id])

  // Fetch trace only for processed cases
  useEffect(() => {
    if (!data) return
    const tx = data.transaction
    if (tx.status === 'at_risk') return   // not yet processed
    setTL(true)
    axios.get(`/api/agent/trace/${id}`)
      .then(r => setTrace(r.data.timeline))
      .catch(e  => setTE(e.response?.data?.error || e.message))
      .finally(() => setTL(false))
  }, [data, id])

  if (loading) return (
    <div className="min-h-screen hero-gradient flex items-center justify-center">
      <div className="font-display text-4xl text-gold animate-pulse">LOADING CASE…</div>
    </div>
  )

  if (!data) return (
    <div className="min-h-screen hero-gradient flex items-center justify-center">
      <div className="glass-card p-8 text-center">
        <div className="w-10 h-10 rounded-full bg-white/[0.04] text-text-muted flex items-center justify-center mx-auto mb-3">
          <SearchIcon className="w-5 h-5" />
        </div>
        <div className="text-text-muted">Case not found.</div>
        <Link to="/" className="mt-4 inline-block text-gold text-sm hover:underline">← Back</Link>
      </div>
    </div>
  )

  const { transaction: tx, decisions, actions, audit_log } = data
  const decision = decisions[0]

  return (
    <div className="min-h-screen hero-gradient">
      <div className="max-w-2xl mx-auto px-6 py-8">

        {/* Back */}
        <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-gold transition-colors mb-8">
          ← Back to Dashboard
        </Link>

        {/* Case header */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} className="mb-8">
          <div className="flex items-start justify-between gap-4 mb-2">
            <div className="section-label">Case {tx.id.slice(0, 8).toUpperCase()}</div>
            <StatusBadge status={tx.status} />
          </div>
          <h1 className="font-display text-4xl md:text-5xl leading-none mb-3">
            {tx.customer_name.toUpperCase()}
          </h1>
          <div className="flex items-baseline gap-4 flex-wrap">
            <span className={`font-display text-3xl ${tx.status === 'recovered' ? 'text-recovered' : 'text-gold'}`}>
              {fmt(tx.amount)}
            </span>
            <span className="text-sm text-text-muted">{FAILURE_LABELS[tx.failure_reason] || tx.failure_reason}</span>
            <span className="text-[10px] font-semibold tracking-wider uppercase bg-white/[0.04] text-text-secondary px-2 py-0.5 rounded border border-white/[0.08]">
              {SCENARIO_LABELS[tx.scenario_type] || tx.scenario_type}
            </span>
          </div>
          <div className="text-xs text-text-muted mt-2">{tx.customer_email}</div>
          {tx.discount_applied > 0 && (
            <div className="text-xs text-at-risk/80 mt-1">{tx.discount_applied}% discount applied</div>
          )}
        </motion.div>

        <div className="gold-line mb-8" />

        {/* ── Not yet processed ──────────────────────────────────────── */}
        {!decision && tx.status === 'at_risk' && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }}
            className="glass-card p-8 text-center mb-8"
          >
            <div className="w-10 h-10 rounded-full bg-gold/10 text-gold flex items-center justify-center mx-auto mb-3">
              <ClockIcon className="w-5 h-5" />
            </div>
            <div className="text-sm text-text-muted">Agent hasn't processed this case yet.</div>
            <Link to="/batch" className="mt-4 inline-block text-xs text-gold hover:underline">
              Run the batch to process it →
            </Link>
          </motion.div>
        )}

        {/* ── Structured Agent Decision Panel ───────────────────────── */}
        {decision && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
          >
            <AgentDecisionPanel
              transaction={tx}
              decision={decision}
              actions={actions}
            />
          </motion.div>
        )}

        {/* ── Agent Execution Timeline ───────────────────────────────── */}
        {(decision || tx.status !== 'at_risk') && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.18 }}
            className="mb-6"
          >
            <AgentTimeline
              timeline={trace}
              isLoading={traceLoading}
              error={traceError}
            />
          </motion.div>
        )}

        {/* ── Payment link ──────────────────────────────────────────── */}
        {tx.payment_link && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.3 }}
            className="glass-card p-4 mb-4 flex items-center justify-between gap-3"
          >
            <div className="min-w-0">
              <div className="text-xs text-text-muted mb-1">Recovery Link Generated</div>
              <div className="text-sm text-gold font-mono truncate">{tx.payment_link}</div>
            </div>
            <a
              href={tx.payment_link} target="_blank" rel="noreferrer"
              className="shrink-0 text-xs border border-gold/20 text-gold px-3 py-1.5 rounded-lg hover:bg-gold/5 transition-colors"
            >
              Open →
            </a>
          </motion.div>
        )}

      </div>
    </div>
  )
}
