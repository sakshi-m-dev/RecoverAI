import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import {
  CreditCardIcon,
  SearchIcon,
  SparklesIcon,
  ShieldIcon,
  BoltIcon,
  CheckIcon,
  ArrowRightIcon,
} from '../shared/Icons'

const PIPELINE_STEPS = [
  {
    step: '01',
    name: 'DETECT',
    desc: 'Payment failure detected',
    sub: 'Gateway drops, declines & timeouts',
    Icon: CreditCardIcon,
    iconCls: 'text-at-risk bg-at-risk/10 border-at-risk/20',
    dotCls: 'bg-at-risk',
  },
  {
    step: '02',
    name: 'DIAGNOSE',
    desc: 'Root cause analysis',
    sub: 'Gemini examines transaction context',
    Icon: SearchIcon,
    iconCls: 'text-gold bg-gold/10 border-gold/20',
    dotCls: 'bg-gold',
  },
  {
    step: '03',
    name: 'DECIDE',
    desc: 'Strategy selection',
    sub: 'Nudge, dynamic discount, or escalate',
    Icon: SparklesIcon,
    iconCls: 'text-gold bg-gold/10 border-gold/20',
    dotCls: 'bg-gold',
  },
  {
    step: '04',
    name: 'GUARDRAIL',
    desc: 'Deterministic validation',
    sub: 'Caps, contact limits & cooldowns',
    Icon: ShieldIcon,
    iconCls: 'text-escalated bg-escalated/10 border-escalated/20',
    dotCls: 'bg-escalated',
  },
  {
    step: '05',
    name: 'ACT',
    desc: 'Autonomous execution',
    sub: 'Safe link dispatch & customer contact',
    Icon: BoltIcon,
    iconCls: 'text-gold bg-gold/10 border-gold/20',
    dotCls: 'bg-gold',
  },
  {
    step: '06',
    name: 'VERIFY',
    desc: 'Independent confirmation',
    sub: 'Backend verifies actual settlement',
    Icon: CheckIcon,
    iconCls: 'text-recovered bg-recovered/10 border-recovered/20',
    dotCls: 'bg-recovered',
  },
]

const FEATURE_CARDS = [
  {
    title: 'AI-Powered',
    subtitle: 'Gemini function calling for intelligent recovery decisions',
    tag: 'Adaptive Reasoning',
    tagCls: 'bg-gold/10 text-gold border-gold/25',
    iconCls: 'text-gold bg-gold/10 border-gold/25',
    glowColor: 'bg-gold/10',
    Icon: SparklesIcon,
    points: [
      'Multi-turn function calling with dynamic recovery tools',
      'Context-aware reasoning tailored to individual failure modes',
      'Rate-limit resilient model router with zero downtime cascade',
    ],
  },
  {
    title: 'Guardrailed',
    subtitle: 'Deterministic policies control every financial action',
    tag: 'Policy Enforcement',
    tagCls: 'bg-escalated/10 text-escalated border-escalated/25',
    iconCls: 'text-escalated bg-escalated/10 border-escalated/25',
    glowColor: 'bg-escalated/10',
    Icon: ShieldIcon,
    points: [
      'Pre-check gate: High-risk & high-value cases route to human review',
      'Hard discount cap (≤ 10%) enforced strictly in application code',
      'Strict retry limits (max 2 attempts) and 30-min cooldown windows',
    ],
  },
  {
    title: 'Verified',
    subtitle: 'Backend verification determines whether recovery actually succeeded',
    tag: 'Deterministic Audit',
    tagCls: 'bg-recovered/10 text-recovered border-recovered/25',
    iconCls: 'text-recovered bg-recovered/10 border-recovered/25',
    glowColor: 'bg-recovered/10',
    Icon: CheckIcon,
    points: [
      'The agent never marks a transaction recovered on its own',
      'Independent backend confirmation verifies actual payment capture',
      'Immutable chronological event trail stored in SQLite audit log',
    ],
  },
]

export default function LandingPage() {
  return (
    <div className="min-h-[calc(100vh-3.5rem)] hero-gradient text-text-primary flex flex-col justify-between relative overflow-hidden">
      
      {/* Subtle gold ambient glow matching the dashboard */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[700px] h-[300px] bg-gold/[0.04] blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute top-[45%] right-[-10%] w-[500px] h-[500px] bg-recovered/[0.03] blur-[130px] rounded-full pointer-events-none" />

      <div className="max-w-6xl mx-auto px-6 pt-10 pb-12 w-full flex-1 flex flex-col justify-center relative z-10">

        {/* ── TOP BADGE / PROJECT TITLE ────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.35 }}
          className="flex flex-col items-center text-center mb-6"
        >
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gold/10 border border-gold/25 text-gold mb-3">
            <span className="w-2 h-2 rounded-full bg-gold pulse-dot" />
            <span className="text-[11px] font-semibold tracking-[0.2em] uppercase">
              RecoverAI <span className="opacity-40 mx-1">·</span> Autonomous AI Revenue Recovery Agent
            </span>
          </div>
        </motion.div>

        {/* ── HERO HEADLINE & SUBTITLE ─────────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.05 }}
          className="text-center max-w-3xl mx-auto mb-10"
        >
          <h1 className="font-display text-5xl sm:text-6xl md:text-7xl leading-[0.98] tracking-tight mb-4 text-white uppercase">
            Turn Failed Payments Into <span className="text-gold">Recovered Revenue</span>
          </h1>
          <p className="text-sm sm:text-base md:text-lg text-text-secondary leading-relaxed font-normal max-w-2xl mx-auto">
            An autonomous AI agent that detects payment failures, diagnoses the cause,
            takes safe recovery actions, and independently verifies the outcome.
          </p>
        </motion.div>

        <div className="gold-line mb-10 max-w-4xl mx-auto w-full" />

        {/* ── VISUAL PROCESS FLOW (PROMINENT) ─────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.12 }}
          className="mb-10"
        >
          <div className="text-center mb-4">
            <span className="section-label text-xs">
              End-to-End Autonomous Pipeline
            </span>
          </div>

          <div className="glass-card p-3 sm:p-5 relative overflow-hidden">
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
              {PIPELINE_STEPS.map((p, idx) => {
                const Icon = p.Icon
                const isLast = idx === PIPELINE_STEPS.length - 1
                return (
                  <div
                    key={p.name}
                    className="relative flex flex-col justify-between p-3.5 rounded-xl bg-white/[0.02] border border-white/[0.05] hover:border-gold/30 hover:bg-white/[0.035] transition-all duration-200"
                  >
                    <div>
                      {/* Step index + dot */}
                      <div className="flex items-center justify-between mb-2.5">
                        <span className="text-[10px] font-mono font-semibold text-text-muted tracking-wider">
                          {p.step}
                        </span>
                        <span className={`w-1.5 h-1.5 rounded-full ${p.dotCls}`} />
                      </div>

                      {/* Icon + Step Title */}
                      <div className="flex items-center gap-2 mb-1.5">
                        <div className={`p-1.5 rounded-lg border ${p.iconCls}`}>
                          <Icon className="w-3.5 h-3.5" />
                        </div>
                        <span className="font-display text-sm tracking-wider text-white">
                          {p.name}
                        </span>
                      </div>

                      {/* Short Description */}
                      <div className="text-[11px] font-medium text-text-secondary leading-snug mb-1">
                        {p.desc}
                      </div>
                    </div>

                    {/* Secondary Detail */}
                    <div className="text-[10px] text-text-muted leading-tight pt-2 border-t border-white/[0.04]">
                      {p.sub}
                    </div>

                    {/* Desktop horizontal flow indicator */}
                    {!isLast && (
                      <div className="hidden lg:block absolute -right-2 top-1/2 -translate-y-1/2 z-10 text-gold/30 pointer-events-none text-xs font-mono">
                        →
                      </div>
                    )}
                  </div>
                )
              })}
            </div>
          </div>
        </motion.div>

        {/* ── THREE CONCISE FEATURE CARDS ─────────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.18 }}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-10"
        >
          {FEATURE_CARDS.map((card) => {
            const Icon = card.Icon
            return (
              <div
                key={card.title}
                className="glass-card p-6 relative overflow-hidden flex flex-col justify-between group hover:border-gold/30 transition-all duration-300"
              >
                {/* Card subtle ambient glow */}
                <div
                  className={`absolute top-0 right-0 w-32 h-32 rounded-full blur-2xl pointer-events-none opacity-20 ${card.glowColor}`}
                  style={{ transform: 'translate(30%, -30%)' }}
                />

                <div className="relative z-10">
                  <div className="flex items-center justify-between mb-4">
                    <div className={`p-2.5 rounded-xl border ${card.iconCls}`}>
                      <Icon className="w-5 h-5" />
                    </div>
                    <span className={`text-[10px] font-semibold tracking-wider uppercase px-2 py-0.5 rounded-md border ${card.tagCls}`}>
                      {card.tag}
                    </span>
                  </div>

                  <h2 className="font-display text-2xl text-white mb-2 tracking-wide">
                    {card.title}
                  </h2>

                  <p className="text-xs text-text-secondary leading-relaxed mb-5 font-normal">
                    {card.subtitle}
                  </p>

                  <div className="space-y-2 pt-4 border-t border-white/[0.05]">
                    {card.points.map((pt, i) => (
                      <div key={i} className="flex items-start gap-2 text-[11px] text-text-muted leading-relaxed">
                        <span className="w-1 h-1 rounded-full bg-gold/50 mt-1.5 shrink-0" />
                        <span>{pt}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )
          })}
        </motion.div>

        {/* ── CLOSING STATEMENT & PRIMARY CTA ──────────────────────────────────── */}
        <motion.div
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, delay: 0.24 }}
          className="flex flex-col items-center text-center pt-2"
        >
          {/* Closing statement */}
          <div className="mb-6">
            <span className="font-display text-2xl sm:text-3xl tracking-wide text-white/95">
              &ldquo;AI autonomy, with <span className="text-gold">financial control</span>.&rdquo;
            </span>
          </div>

          {/* Primary Action Button (RecoverAI's signature btn-gold) */}
          <Link
            to="/dashboard"
            id="explore-dashboard-cta"
            className="btn-gold px-8 sm:px-10 py-3.5 text-base tracking-wide rounded-xl inline-flex items-center gap-2.5 select-none"
          >
            <span>Explore Dashboard</span>
            <ArrowRightIcon className="w-4 h-4 stroke-[2.5]" />
          </Link>

          <p className="text-[11px] text-text-muted mt-4">
            Live interactive demo · Connected to real SQLite audit logs &amp; recovery pipeline
          </p>
        </motion.div>

      </div>
    </div>
  )
}
