import { motion } from 'framer-motion'
import {
  ShieldIcon,
  CheckIcon,
  XIcon,
  UserIcon,
  BoltIcon,
  SparklesIcon,
  AlertIcon,
} from './Icons'

const FAILURE_LABELS = {
  card_decline:       'Card Decline',
  otp_timeout:        'OTP Timeout',
  insufficient_funds: 'Insufficient Funds',
  network_drop:       'Network Drop',
  abandoned:          'Cart Abandoned',
}

const SCENARIO_LABELS = {
  failed_payment:       'Failed Payment',
  checkout_abandonment: 'Checkout Abandonment',
  subscription_failure: 'Subscription Renewal Failure',
}

const ACTION_LABELS = {
  email_nudge:    'Send Recovery Nudge',
  discount_offer: 'Offer Discount',
  escalate:       'Escalate to Human',
}

function fmt(v) { return '₹' + Number(v).toLocaleString('en-IN') }

function Section({ label, children, delay = 0 }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.3 }}
    >
      <div className="text-[9px] font-bold tracking-[0.22em] uppercase text-text-muted mb-2">
        {label}
      </div>
      {children}
    </motion.div>
  )
}

function DividerArrow() {
  return (
    <div className="flex flex-col items-center my-1 text-white/20 text-xs select-none">
      ↓
    </div>
  )
}

/**
 * Structured agent decision panel for CaseDetail.
 * Props: transaction, decision (agent_decisions[0]), actions (recovery_actions[])
 */
export default function AgentDecisionPanel({ transaction: tx, decision, actions }) {
  if (!decision) return null

  const action = actions?.[0]
  const isEscalated = tx.status === 'escalated'
  const isRecovered = tx.status === 'recovered'

  // Parse what guardrail checks happened
  const guardrailCode    = decision.guardrails_applied || null

  const GUARDRAIL_REASONS = {
    HIGH_VALUE_THRESHOLD:  'Amount exceeds ₹25,000 autonomous limit',
    MAX_ATTEMPTS_EXCEEDED: 'Maximum contact attempts (2) reached',
    COOLDOWN_ACTIVE:       'Action attempted within 30-min cooldown window',
    high_value_limit_exceeded: 'Amount exceeds ₹25,000 autonomous limit',
    discount_capped_at_10pct:  'AI requested >10% discount — capped to 10%',
  }

  // Which guardrail checks to display
  const policyItems = [
    {
      label: 'Amount within autonomous limit (≤ ₹25,000)',
      pass: tx.amount <= 25000,
    },
    {
      label: 'Contact attempts available (< 2)',
      pass: tx.attempts_count < 2,
    },
    {
      label: 'Cooldown satisfied (30 min)',
      pass: guardrailCode !== 'COOLDOWN_ACTIVE',
    },
    {
      label: 'Discount within policy cap (≤ 10%)',
      pass: guardrailCode !== 'discount_capped_at_10pct',
    },
  ]

  const riskScore = tx.risk_score || 50
  const riskLabel = riskScore > 70 ? 'HIGH' : riskScore > 45 ? 'MEDIUM' : 'LOW'
  const riskColor = riskScore > 70 ? 'text-red-400' : riskScore > 45 ? 'text-amber-400' : 'text-green-400'

  return (
    <div className="glass-card p-6 mb-4">
      <div className="section-label mb-5">Agent Decision</div>

      <div className="space-y-4">

        {/* ─── WHY THIS CASE IS AT RISK ─────────────────────────────── */}
        <Section label="Why This Case Is at Risk" delay={0.05}>
          <div className="rounded-lg bg-white/[0.025] border border-white/[0.06] p-3 space-y-2">
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-muted">Scenario</span>
              <span className="text-text-secondary font-medium">
                {SCENARIO_LABELS[tx.scenario_type] || tx.scenario_type}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-muted">Failure Reason</span>
              <span className="text-text-secondary font-medium">
                {FAILURE_LABELS[tx.failure_reason] || tx.failure_reason}
              </span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-muted">Amount at Risk</span>
              <span className="text-gold font-display text-xl">{fmt(tx.amount)}</span>
            </div>
            <div className="flex items-center justify-between text-sm">
              <span className="text-text-muted">Risk Score</span>
              <span className={`font-bold ${riskColor}`}>
                {riskLabel} ({riskScore}/100)
              </span>
            </div>
          </div>
        </Section>

        <DividerArrow />

        {/* ─── AGENT DIAGNOSIS ─────────────────────────────────────── */}
        <Section label="Agent Diagnosis" delay={0.1}>
          <div className="rounded-lg bg-white/[0.025] border border-white/[0.06] p-3">
            <p className="text-sm text-text-secondary leading-relaxed">
              {decision.reasoning_text}
            </p>
          </div>
        </Section>

        <DividerArrow />

        {/* ─── GUARDRAIL POLICY CHECK ──────────────────────────────── */}
        <Section label="Guardrail Policy Check" delay={0.15}>
          <div className="rounded-lg bg-white/[0.025] border border-white/[0.06] p-3 space-y-2">
            {policyItems.map((item, i) => (
              <div key={i} className="flex items-start gap-2.5 text-sm">
                <span className={`mt-0.5 shrink-0 font-bold ${item.pass ? 'text-recovered' : 'text-failed'}`}>
                  {item.pass ? <CheckIcon className="w-3.5 h-3.5" /> : <XIcon className="w-3.5 h-3.5" />}
                </span>
                <span className={item.pass ? 'text-text-secondary' : 'text-failed/80'}>
                  {item.label}
                </span>
              </div>
            ))}
            {guardrailCode && GUARDRAIL_REASONS[guardrailCode] && (
              <div className="mt-2 pt-2 border-t border-white/[0.06] text-xs text-at-risk/90 flex items-center gap-1.5">
                <ShieldIcon className="w-3.5 h-3.5 text-gold shrink-0" />
                <span>Policy enforced: {GUARDRAIL_REASONS[guardrailCode]}</span>
              </div>
            )}
          </div>
        </Section>

        <DividerArrow />

        {/* ─── ACTION ─────────────────────────────────────────────── */}
        <Section label="Recovery Action" delay={0.2}>
          {isEscalated ? (
            /* Escalation flow panel */
            <div className="rounded-lg border border-escalated/25 bg-escalated/[0.03] p-4">
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-escalated/10 border border-escalated/25 flex items-center justify-center text-escalated">
                    <ShieldIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold tracking-wider uppercase text-escalated">Autonomous Action Blocked</div>
                    <div className="text-xs text-text-muted mt-0.5">
                      {guardrailCode
                        ? GUARDRAIL_REASONS[guardrailCode] || decision.reasoning_text
                        : 'Policy limit exceeded'}
                    </div>
                  </div>
                </div>
                <div className="h-px bg-escalated/15" />
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-escalated/15 border border-escalated/30 flex items-center justify-center text-escalated">
                    <UserIcon className="w-4 h-4" />
                  </div>
                  <div>
                    <div className="text-xs font-bold tracking-wider uppercase text-escalated">Escalated to Human</div>
                    <div className="text-xs text-text-muted mt-0.5">Queued for manual review</div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg bg-white/[0.025] border border-white/[0.06] p-3">
              <div className="flex items-center gap-2 mb-2">
                <BoltIcon className="w-4 h-4 text-gold" />
                <span className="text-sm font-semibold text-text-primary">
                  {ACTION_LABELS[action?.action_type] || (action?.action_type?.replace(/_/g, ' ') || 'Recovery action taken')}
                </span>
              </div>
              {action?.action_payload?.percent > 0 && (
                <div className="text-xs text-text-muted">
                  Discount applied: {action.action_payload.percent}% off
                  {action.action_payload.discounted_amount && (
                    <span className="text-gold ml-1">
                      → {fmt(action.action_payload.discounted_amount)}
                    </span>
                  )}
                </div>
              )}
            </div>
          )}
        </Section>

        <DividerArrow />

        {/* ─── RESULT ─────────────────────────────────────────────── */}
        <Section label="Result" delay={0.25}>
          {isRecovered ? (
            <div className="rounded-lg border border-recovered/30 bg-recovered/[0.04] p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-recovered/15 border border-recovered/30 flex items-center justify-center text-recovered">
                <SparklesIcon className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-bold text-recovered tracking-wide">PAYMENT RECOVERED</div>
                <div className="text-xs text-text-muted mt-0.5">{fmt(tx.amount)} rescued</div>
              </div>
            </div>
          ) : isEscalated ? (
            <div className="rounded-lg border border-escalated/25 bg-escalated/[0.03] p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-escalated/15 border border-escalated/30 flex items-center justify-center text-escalated">
                <UserIcon className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-bold text-escalated tracking-wide">ESCALATED TO HUMAN</div>
                <div className="text-xs text-text-muted mt-0.5">Queued for manual review — no automated action taken</div>
              </div>
            </div>
          ) : (
            <div className="rounded-lg border border-failed/25 bg-failed/[0.03] p-3 flex items-center gap-3">
              <div className="w-8 h-8 rounded-full bg-failed/15 border border-failed/30 flex items-center justify-center text-failed">
                <XIcon className="w-4 h-4" />
              </div>
              <div>
                <div className="text-sm font-bold text-failed tracking-wide">RECOVERY FAILED</div>
                <div className="text-xs text-text-muted mt-0.5">No conversion — flagged for follow-up</div>
              </div>
            </div>
          )}
        </Section>

      </div>
    </div>
  )
}
