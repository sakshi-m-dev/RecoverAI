import { motion } from 'framer-motion'
import {
  CreditCardIcon, SearchIcon, ShieldIcon, CheckIcon, XIcon,
  BoltIcon, SparklesIcon, UserIcon, ClockIcon, AlertIcon,
} from './Icons'

// ─── Phase config ─────────────────────────────────────────────────────────────
const PHASE_CONFIG = {
  DETECTED: {
    label: 'DETECTED',
    color: 'text-at-risk',
    bg:    'bg-at-risk/10 border-at-risk/25',
    dot:   'bg-at-risk',
    icon:  (cls) => <CreditCardIcon className={cls} />,
  },
  PRE_CHECK: {
    label: 'PRE-CHECK',
    color: 'text-gold',
    bg:    'bg-gold/10 border-gold/25',
    dot:   'bg-gold',
    icon:  (cls) => <ShieldIcon className={cls} />,
  },
  BLOCKED: {
    label: 'BLOCKED',
    color: 'text-escalated',
    bg:    'bg-escalated/10 border-escalated/30',
    dot:   'bg-escalated',
    icon:  (cls) => <XIcon className={cls} />,
  },
  MODEL: {
    label: 'MODEL',
    color: 'text-gold',
    bg:    'bg-gold/[0.07] border-gold/20',
    dot:   'bg-gold',
    icon:  (cls) => <SparklesIcon className={cls} />,
  },
  DIAGNOSING: {
    label: 'DIAGNOSING',
    color: 'text-gold',
    bg:    'bg-gold/[0.07] border-gold/20',
    dot:   'bg-gold',
    icon:  (cls) => <SearchIcon className={cls} />,
  },
  TOOL_CALL: {
    label: 'TOOL CALL',
    color: 'text-text-secondary',
    bg:    'bg-white/[0.04] border-white/10',
    dot:   'bg-white/40',
    icon:  (cls) => <BoltIcon className={cls} />,
  },
  DIAGNOSIS: {
    label: 'DIAGNOSIS',
    color: 'text-gold',
    bg:    'bg-gold/[0.07] border-gold/20',
    dot:   'bg-gold',
    icon:  (cls) => <SearchIcon className={cls} />,
  },
  DECISION: {
    label: 'DECISION',
    color: 'text-gold',
    bg:    'bg-gold/[0.07] border-gold/20',
    dot:   'bg-gold',
    icon:  (cls) => <SparklesIcon className={cls} />,
  },
  GUARDRAIL: {
    label: 'GUARDRAIL',
    color: 'text-gold',
    bg:    'bg-gold/[0.07] border-gold/20',
    dot:   'bg-gold',
    icon:  (cls) => <ShieldIcon className={cls} />,
  },
  ACTION: {
    label: 'ACTION',
    color: 'text-recovered',
    bg:    'bg-recovered/[0.07] border-recovered/25',
    dot:   'bg-recovered',
    icon:  (cls) => <BoltIcon className={cls} />,
  },
  VERIFYING: {
    label: 'VERIFYING',
    color: 'text-gold',
    bg:    'bg-gold/[0.07] border-gold/20',
    dot:   'bg-gold',
    icon:  (cls) => <ClockIcon className={cls} />,
  },
  VERIFIED: {
    label: 'VERIFIED',
    color: 'text-recovered',
    bg:    'bg-recovered/[0.07] border-recovered/25',
    dot:   'bg-recovered',
    icon:  (cls) => <CheckIcon className={cls} />,
  },
  OUTCOME: {
    label: 'OUTCOME',
    color: 'text-text-muted',
    bg:    'bg-white/[0.04] border-white/[0.08]',
    dot:   'bg-white/30',
    icon:  (cls) => <AlertIcon className={cls} />,
  },
}

function getPhaseConfig(phase, outcome) {
  if (phase === 'OUTCOME') {
    if (outcome === 'recovered') return {
      ...PHASE_CONFIG.OUTCOME,
      label: 'RECOVERED', color: 'text-recovered',
      bg: 'bg-recovered/10 border-recovered/35',
      dot: 'bg-recovered', icon: (cls) => <SparklesIcon className={cls} />,
    }
    if (outcome === 'escalated') return {
      ...PHASE_CONFIG.OUTCOME,
      label: 'ESCALATED', color: 'text-escalated',
      bg: 'bg-escalated/10 border-escalated/30',
      dot: 'bg-escalated', icon: (cls) => <UserIcon className={cls} />,
    }
    if (outcome === 'failed') return {
      ...PHASE_CONFIG.OUTCOME,
      label: 'FAILED', color: 'text-failed',
      bg: 'bg-failed/10 border-failed/25',
      dot: 'bg-failed', icon: (cls) => <XIcon className={cls} />,
    }
  }
  // Guardrail PASS vs FAIL tint
  if (phase === 'GUARDRAIL' && outcome === false) return {
    ...PHASE_CONFIG.GUARDRAIL,
    color: 'text-escalated', bg: 'bg-escalated/10 border-escalated/30', dot: 'bg-escalated',
    icon: (cls) => <ShieldIcon className={cls} />,
  }
  return PHASE_CONFIG[phase] || PHASE_CONFIG.OUTCOME
}

// ─── Timestamp formatter ──────────────────────────────────────────────────────
function fmtTime(d) {
  if (!d) return ''
  return new Date(d).toLocaleTimeString('en-IN', {
    hour: '2-digit', minute: '2-digit', second: '2-digit',
  })
}

// ─── Live step config for BatchRun ───────────────────────────────────────────
const LIVE_STEP_LABELS = {
  model_used:     (d) => d?.modelLabel ? `${d.modelLabel} selected` : 'AI model selected',
  diagnosed:      ()  => 'diagnose_failure() — analyzing root cause',
  policy_checked: (d) => d?.allowed === false
    ? 'Guardrail check — BLOCKED'
    : 'Guardrail check — PASSED',
  action_taken:   (d) => d ? `${(d.action || 'action').replace(/_/g,' ')}() executed` : 'Action executed',
  resolved:       (d) => d?.outcome
    ? `Outcome: ${d.outcome}`
    : 'Resolving case…',
}

// ─── Single timeline node ─────────────────────────────────────────────────────
function TimelineNode({ event, index, isLast }) {
  const cfg = getPhaseConfig(event.phase, event.outcome ?? event.pass)
  const lines = (event.detail || '').split('\n').filter(Boolean)

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.05, duration: 0.35 }}
      className="flex gap-3"
    >
      {/* Left rail */}
      <div className="flex flex-col items-center shrink-0" style={{ width: 32 }}>
        {/* Icon node */}
        <div className={`w-8 h-8 rounded-full border flex items-center justify-center z-10 shrink-0 ${cfg.bg}`}>
          {cfg.icon(`w-3.5 h-3.5 ${cfg.color}`)}
        </div>
        {/* Connector */}
        {!isLast && (
          <div className="w-px flex-1 mt-1 mb-0"
            style={{ background: 'linear-gradient(to bottom, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.03) 100%)', minHeight: 16 }} />
        )}
      </div>

      {/* Content */}
      <div className={`flex-1 pb-4 ${isLast ? '' : ''}`}>
        {/* Phase badge + title row */}
        <div className="flex items-start justify-between gap-2 flex-wrap mb-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`text-[9px] font-bold tracking-[0.2em] uppercase px-1.5 py-0.5 rounded border ${cfg.bg} ${cfg.color}`}>
              {cfg.label}
            </span>
            <span className={`text-sm font-medium ${cfg.color}`}>
              {event.title}
            </span>
          </div>
          {event.timestamp && (
            <span className="text-[10px] text-text-muted tabular-nums shrink-0">
              {fmtTime(event.timestamp)}
            </span>
          )}
        </div>

        {/* Detail lines */}
        {lines.length > 0 && (
          <div className={`rounded-lg px-3 py-2 mt-1.5 border ${
            event.phase === 'BLOCKED'
              ? 'bg-escalated/[0.05] border-escalated/20'
              : event.phase === 'OUTCOME' && event.outcome === 'recovered'
              ? 'bg-recovered/[0.05] border-recovered/20'
              : event.phase === 'OUTCOME' && event.outcome === 'escalated'
              ? 'bg-escalated/[0.05] border-escalated/15'
              : event.phase === 'OUTCOME' && event.outcome === 'failed'
              ? 'bg-failed/[0.05] border-failed/15'
              : 'bg-white/[0.025] border-white/[0.06]'
          }`}>
            {lines.map((line, i) => (
              <p key={i} className="text-xs text-text-secondary leading-relaxed">
                {line}
              </p>
            ))}
            {/* Special note for BLOCKED nodes */}
            {event.phase === 'BLOCKED' && event.geminiCalled === false && (
              <p className="text-[10px] text-escalated/70 mt-1.5 font-medium flex items-center gap-1">
                <ShieldIcon className="w-3 h-3 inline shrink-0" />
                Gemini was not called — autonomous action blocked before AI invocation
              </p>
            )}
          </div>
        )}
      </div>
    </motion.div>
  )
}

// ─── Live mini step (for BatchRun in-progress card) ──────────────────────────
export function LiveStepBadge({ step, data }) {
  const label = LIVE_STEP_LABELS[step]?.(data) || step?.replace(/_/g, ' ')
  const isBlocked = step === 'policy_checked' && data?.allowed === false
  const isAction  = step === 'action_taken'
  const isDone    = step === 'resolved'

  return (
    <motion.div
      key={step}
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0 }}
      className={`flex items-center gap-1.5 text-[10px] font-medium mt-1 ${
        isBlocked ? 'text-escalated' :
        isAction  ? 'text-recovered' :
        isDone    ? 'text-text-muted' :
        'text-gold'
      }`}
    >
      <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${
        isBlocked ? 'bg-escalated' :
        isAction  ? 'bg-recovered pulse-dot' :
        isDone    ? 'bg-text-muted' :
        'bg-gold pulse-dot'
      }`} />
      {label}
    </motion.div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────
/**
 * AgentTimeline
 *
 * Props:
 *  - timeline: array of timeline event objects (from /api/agent/trace/:id)
 *  - isLoading: bool
 *  - error: string|null
 */
export default function AgentTimeline({ timeline, isLoading, error }) {
  if (isLoading) {
    return (
      <div className="glass-card p-6 mb-4">
        <div className="section-label mb-4">Agent Execution Timeline</div>
        <div className="space-y-3">
          {[...Array(5)].map((_, i) => (
            <div key={i} className="flex gap-3 animate-pulse">
              <div className="w-8 h-8 rounded-full bg-white/[0.04] shrink-0" />
              <div className="flex-1 pt-1 space-y-1.5">
                <div className="h-3 bg-white/[0.04] rounded w-1/3" />
                <div className="h-3 bg-white/[0.03] rounded w-2/3" />
              </div>
            </div>
          ))}
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="glass-card p-6 mb-4">
        <div className="section-label mb-3">Agent Execution Timeline</div>
        <p className="text-xs text-text-muted">Timeline unavailable: {error}</p>
      </div>
    )
  }

  if (!timeline || timeline.length === 0) return null

  return (
    <div className="glass-card p-6 mb-4">
      <div className="section-label mb-5">Agent Execution Timeline</div>
      <div>
        {timeline.map((event, i) => (
          <TimelineNode
            key={event.id}
            event={event}
            index={i}
            isLast={i === timeline.length - 1}
          />
        ))}
      </div>
    </div>
  )
}
