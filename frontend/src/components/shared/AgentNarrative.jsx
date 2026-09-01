import { motion } from 'framer-motion'
import {
  SearchIcon,
  BoltIcon,
  SparklesIcon,
  XIcon,
  UserIcon,
  ShieldIcon,
  AlertIcon,
} from './Icons'

const TYPE_CONFIG = {
  diagnosis:         { Icon: SearchIcon,   label: 'Diagnosis',  accent: 'border-recovering/50', iconCls: 'text-gold' },
  action:            { Icon: BoltIcon,     label: 'Action',     accent: 'border-gold/50',       iconCls: 'text-gold' },
  outcome_recovered: { Icon: SparklesIcon, label: 'Recovered',  accent: 'border-recovered/60',  iconCls: 'text-recovered' },
  outcome_failed:    { Icon: XIcon,        label: 'Failed',     accent: 'border-failed/50',     iconCls: 'text-failed' },
  outcome_escalated: { Icon: UserIcon,     label: 'Escalated',  accent: 'border-escalated/50',  iconCls: 'text-escalated' },
  guardrail:         { Icon: ShieldIcon,   label: 'Guardrail', accent: 'border-gold/30',        iconCls: 'text-gold' },
  default:           { Icon: AlertIcon,    label: 'Note',       accent: 'border-white/10',      iconCls: 'text-text-muted' },
}

export default function AgentNarrative({ type = 'default', text, delay = 0 }) {
  const cfg = TYPE_CONFIG[type] || TYPE_CONFIG.default
  const Icon = cfg.Icon

  return (
    <motion.div
      initial={{ opacity: 0, x: -10 }}
      animate={{ opacity: 1, x:   0 }}
      transition={{ delay, duration: 0.3 }}
      className={`pl-4 border-l-2 ${cfg.accent} py-1`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <Icon className={`w-3.5 h-3.5 ${cfg.iconCls}`} />
        <span className="text-[10px] font-semibold tracking-[0.18em] uppercase text-text-muted">{cfg.label}</span>
      </div>
      <p className="text-sm text-text-secondary leading-relaxed">{text}</p>
    </motion.div>
  )
}
