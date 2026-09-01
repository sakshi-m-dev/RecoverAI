import { useState, useRef, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import axios from 'axios'
import TransactionCard from '../shared/TransactionCard'
import AnimatedCounter from '../shared/AnimatedCounter'

// Pipeline stages shown during processing
const PIPELINE_STEPS = ['DETECTED', 'DIAGNOSING', 'DECISION', 'GUARDRAIL', 'ACTION', 'VERIFIED']

const STEP_MAP = {
  diagnosed:     'DIAGNOSING',
  policy_checked:'GUARDRAIL',
  action_taken:  'ACTION',
  resolved:      'VERIFIED',
}

function PipelineProgress({ currentStep }) {
  const activeIdx = currentStep ? PIPELINE_STEPS.indexOf(currentStep) : 0

  return (
    <div className="flex items-center gap-1 flex-wrap mt-2">
      {PIPELINE_STEPS.map((step, i) => {
        const done    = i < activeIdx
        const current = i === activeIdx

        return (
          <div key={step} className="flex items-center gap-1">
            <span
              className={`text-[9px] font-bold px-1.5 py-0.5 rounded tracking-wider transition-all duration-300 ${
                current
                  ? 'bg-gold/20 text-gold border border-gold/30'
                  : done
                  ? 'bg-recovered/10 text-recovered/70 border border-recovered/20'
                  : 'bg-white/[0.03] text-text-muted/40 border border-white/[0.05]'
              }`}
            >
              {step}
            </span>
            {i < PIPELINE_STEPS.length - 1 && (
              <span className={`text-[9px] ${done ? 'text-recovered/40' : 'text-white/10'}`}>→</span>
            )}
          </div>
        )
      })}
    </div>
  )
}

import {
  SparklesIcon,
  UserIcon,
  XIcon,
  BoltIcon,
} from '../shared/Icons'

function OutcomeFlash({ outcome, amount }) {
  if (outcome === 'recovered') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -4 }}
        transition={{ duration: 0.3 }}
        className="absolute inset-0 flex items-center justify-center bg-recovered/[0.18] backdrop-blur-[3px] border border-recovered/40 rounded-xl z-20 pointer-events-none overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-t from-recovered/20 to-transparent pointer-events-none animate-pulse" />
        <div className="text-center relative z-10 p-2">
          <div className="w-9 h-9 rounded-full bg-recovered/20 border border-recovered/40 text-recovered flex items-center justify-center mx-auto mb-1.5 shadow-lg shadow-recovered/25">
            <SparklesIcon className="w-5 h-5" />
          </div>
          <div className="font-display text-3xl md:text-4xl text-recovered tracking-wide">
            +₹{Number(amount).toLocaleString('en-IN')}
          </div>
          <div className="inline-flex items-center gap-1 mt-1 px-2.5 py-0.5 rounded-full bg-recovered/20 border border-recovered/40 text-[9px] font-semibold tracking-[0.2em] uppercase text-recovered shadow-lg shadow-recovered/20">
            <span className="w-1.5 h-1.5 rounded-full bg-recovered pulse-dot" />
            REVENUE RECOVERED
          </div>
        </div>
      </motion.div>
    )
  }

  if (outcome === 'escalated') {
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 4 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: -4 }}
        transition={{ duration: 0.3 }}
        className="absolute inset-0 flex items-center justify-center bg-escalated/[0.18] backdrop-blur-[3px] border border-escalated/40 rounded-xl z-20 pointer-events-none overflow-hidden"
      >
        <div className="absolute inset-0 bg-gradient-to-t from-escalated/20 to-transparent pointer-events-none animate-pulse" />
        <div className="text-center relative z-10 p-2">
          <div className="w-9 h-9 rounded-full bg-escalated/20 border border-escalated/40 text-escalated flex items-center justify-center mx-auto mb-1.5 shadow-lg shadow-escalated/25">
            <UserIcon className="w-5 h-5" />
          </div>
          <div className="font-display text-2xl md:text-3xl text-escalated tracking-wide">
            ESCALATED
          </div>
          <div className="inline-flex items-center gap-1 mt-1 px-2.5 py-0.5 rounded-full bg-escalated/20 border border-escalated/40 text-[9px] font-semibold tracking-[0.16em] uppercase text-escalated shadow-lg shadow-escalated/20">
            <span className="w-1.5 h-1.5 rounded-full bg-escalated pulse-dot" />
            GUARDRAIL ESCALATION
          </div>
        </div>
      </motion.div>
    )
  }

  // outcome === 'failed'
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.92, y: 4 }}
      animate={{ opacity: 1, scale: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95, y: -4 }}
      transition={{ duration: 0.3 }}
      className="absolute inset-0 flex items-center justify-center bg-failed/[0.18] backdrop-blur-[3px] border border-failed/40 rounded-xl z-20 pointer-events-none overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-t from-failed/20 to-transparent pointer-events-none animate-pulse" />
      <div className="text-center relative z-10 p-2">
        <div className="w-9 h-9 rounded-full bg-failed/20 border border-failed/40 text-failed flex items-center justify-center mx-auto mb-1.5 shadow-lg shadow-failed/25">
          <XIcon className="w-5 h-5" />
        </div>
        <div className="font-display text-2xl md:text-3xl text-failed tracking-wide">
          RECOVERY FAILED
        </div>
        <div className="inline-flex items-center gap-1 mt-1 px-2.5 py-0.5 rounded-full bg-failed/20 border border-failed/40 text-[9px] font-semibold tracking-[0.16em] uppercase text-failed shadow-lg shadow-failed/20">
          <span className="w-1.5 h-1.5 rounded-full bg-failed pulse-dot" />
          MANUAL FOLLOW-UP
        </div>
      </div>
    </motion.div>
  )
}

export default function BatchRun() {
  const [phase, setPhase]             = useState('idle')
  const [cards, setCards]             = useState([])
  const [current, setCurrent]         = useState(null)
  const [currentStep, setCurrentStep] = useState('DETECTED')
  const [progress, setProgress]       = useState({ done: 0, total: 0 })
  const [summary, setSummary]         = useState(null)
  const [agentMode, setMode]          = useState(null)
  const [batchInfo, setBatchInfo]     = useState(null)   // queue_size, remaining, total_in_db
  const [flashIds, setFlashIds]       = useState({})
  const bottomRef                     = useRef(null)
  const esRef                         = useRef(null)

  useEffect(() => {
    axios.get('/api/health').then(r => setMode(r.data.gemini ? 'gemini' : 'mock')).catch(() => {})
    return () => esRef.current?.close()
  }, [])

  useEffect(() => {
    if (bottomRef.current && cards.length) {
      bottomRef.current.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
    }
  }, [cards.length])

  function runBatch() {
    setPhase('running')
    setCards([])
    setSummary(null)
    setCurrent(null)
    setCurrentStep('DETECTED')
    setProgress({ done: 0, total: 0 })
    setFlashIds({})
    setBatchInfo(null)

    const es = new EventSource('/api/agent/batch/stream')
    esRef.current = es

    es.onmessage = (e) => {
      const d = JSON.parse(e.data)

      switch (d.type) {
        case 'batch_start':
          setProgress({ done: 0, total: d.total })
          setBatchInfo({
            batchSize:  d.batch_size,
            queueSize:  d.queue_size,
            remaining:  d.remaining,
            totalInDb:  d.total_in_db,
            concurrency: d.concurrency,
            targetRpm:  d.target_rpm,
          })
          break

        case 'transaction_start':
          setCurrent(d.transaction)
          setCurrentStep('DETECTED')
          break

        case 'transaction_step': {
          const mappedStep = STEP_MAP[d.step]
          if (mappedStep) setCurrentStep(mappedStep)
          break
        }

        case 'transaction_done': {
          const outcome = d.result?.outcome || d.transaction?.status || 'failed'
          const txId = d.transaction?.id

          setCards(prev => [...prev, { transaction: d.transaction, result: d.result }])
          setCurrent(null)
          setCurrentStep('DETECTED')
          setProgress(p => ({ ...p, done: p.done + 1 }))

          // Show outcome flash for 1.8s on all resolved cases
          if (txId) {
            setFlashIds(prev => ({ ...prev, [txId]: { outcome, amount: d.transaction?.amount } }))
            setTimeout(() => {
              setFlashIds(prev => {
                const copy = { ...prev }
                delete copy[txId]
                return copy
              })
            }, 1800)
          }
          break
        }

        case 'batch_complete':
          setSummary(d.stats)
          setPhase('done')
          es.close()
          break

        case 'no_transactions':
          alert('No at-risk transactions. Use "Add Cases" or "Reset" on the dashboard.')
          setPhase('idle')
          es.close()
          break

        case 'error':
          console.error('Batch error:', d.message)
          setPhase('idle')
          es.close()
          break
      }
    }

    es.onerror = () => { setPhase('idle'); es.close() }
  }

  async function reset() {
    await axios.post('/api/agent/reset')
    setPhase('idle'); setCards([]); setSummary(null); setCurrent(null)
    setProgress({ done: 0, total: 0 }); setFlashIds({})
  }

  const pct = progress.total > 0 ? (progress.done / progress.total) * 100 : 0

  return (
    <div className="min-h-screen hero-gradient">
      <div className="max-w-6xl mx-auto px-6 py-8">

        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }}>
          <Link to="/" className="inline-flex items-center gap-1.5 text-xs text-text-muted hover:text-gold transition-colors mb-6">
            ← Dashboard
          </Link>
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
            <div>
              <div className="section-label mb-2">Agent Operation</div>
              <h1 className="font-display text-4xl md:text-5xl leading-none">
                BATCH <span className="text-gold">RECOVERY</span>
              </h1>
              <div className="mt-2 text-xs text-text-muted">
                Detect → Diagnose → Decide → Guardrail → Act → Verify
              </div>
            </div>
            {agentMode && (
              <div className={`self-start flex items-center gap-2 text-xs px-3 py-1.5 rounded-lg border ${
                agentMode === 'gemini'
                  ? 'text-recovered border-recovered/25 bg-recovered/5'
                  : 'text-at-risk  border-at-risk/25  bg-at-risk/5'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${agentMode === 'gemini' ? 'bg-recovered' : 'bg-at-risk'} pulse-dot`} />
                {agentMode === 'gemini' ? 'Gemini AI — real' : 'Mock Agent'}
              </div>
            )}
          </div>
        </motion.div>

        <div className="gold-line mb-8" />

        {/* ── IDLE ─────────────────────────────────────────────────────── */}
        {phase === 'idle' && (
          <motion.div
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            className="flex flex-col items-center justify-center py-20 text-center"
          >
            <div className="font-display text-[120px] leading-none text-gold/[0.07] mb-6 select-none">AI</div>
            <p className="text-text-secondary text-sm max-w-sm mb-10 leading-relaxed">
              The agent processes at-risk transactions in small batches — diagnosing each failure,
              choosing the right recovery action, and narrating its reasoning live.
            </p>
            <motion.button
              id="run-batch-btn"
              whileHover={{ scale: 1.025 }}
              whileTap={{ scale: 0.975 }}
              onClick={runBatch}
              className="relative px-10 py-5 bg-gold text-bg-primary font-display text-2xl tracking-widest rounded-2xl shadow-2xl shadow-gold/25 hover:shadow-gold/45 hover:bg-gold-dim transition-all duration-300 inline-flex items-center justify-center gap-3"
            >
              <BoltIcon className="w-6 h-6" /> RUN RECOVERY BATCH
            </motion.button>
            <p className="text-xs text-text-muted mt-5">Processes up to 10 at-risk cases per run (configurable)</p>
          </motion.div>
        )}

        {/* ── RUNNING / DONE ───────────────────────────────────────────── */}
        {(phase === 'running' || phase === 'done') && (
          <div>
            {/* Progress bar + queue context */}
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              className="glass-card p-4 mb-5"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2.5">
                  <span className={`w-2 h-2 rounded-full ${phase === 'running' ? 'bg-gold pulse-dot' : 'bg-recovered'}`} />
                  <span className="text-sm font-medium">
                    {phase === 'running'
                      ? `Processing ${progress.done + 1} of ${progress.total}…`
                      : `Done — ${progress.total} transaction${progress.total !== 1 ? 's' : ''} processed`}
                  </span>
                </div>
                <span className="font-display text-gold">{Math.round(pct)}%</span>
              </div>
              <div className="h-1 bg-white/[0.06] rounded-full overflow-hidden">
                <motion.div
                  className="h-full bg-gold rounded-full"
                  animate={{ width: `${pct}%` }}
                  transition={{ ease: 'easeOut', duration: 0.4 }}
                />
              </div>
              {/* Queue context pills */}
              {batchInfo && (
                <div className="flex flex-wrap gap-1.5 mt-3">
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-text-muted">
                    Batch: {batchInfo.batchSize} cases
                  </span>
                  {batchInfo.remaining > 0 && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-at-risk/10 border border-at-risk/20 text-at-risk">
                      {batchInfo.remaining} more in queue
                    </span>
                  )}
                  <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-white/[0.05] border border-white/[0.08] text-text-muted">
                    {batchInfo.totalInDb} total in DB
                  </span>
                  {batchInfo.concurrency > 1 && (
                    <span className="text-[10px] font-medium px-2 py-0.5 rounded-full bg-gold/10 border border-gold/20 text-gold">
                      ×{batchInfo.concurrency} concurrent · {batchInfo.targetRpm} RPM
                    </span>
                  )}
                </div>
              )}
            </motion.div>

            {/* Currently processing — with pipeline step progress */}
            <AnimatePresence>
              {current && (
                <motion.div
                  key={current.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  className="glass-card p-4 mb-4 border-gold/15 bg-gold/[0.02]"
                >
                  <div className="flex items-center gap-2.5 text-sm mb-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-gold pulse-dot" />
                    <span className="text-text-muted">Agent working on</span>
                    <span className="text-text-primary font-medium">{current.customer_name}</span>
                    <span className="text-text-muted">—</span>
                    <span className="text-gold font-display">₹{Number(current.amount).toLocaleString('en-IN')}</span>
                    <span className="text-text-muted text-xs">({current.failure_reason?.replace(/_/g, ' ')})</span>
                  </div>
                  <PipelineProgress currentStep={currentStep} />
                </motion.div>
              )}
            </AnimatePresence>

            {/* Results grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 mb-6">
              <AnimatePresence>
                {cards.map(({ transaction, result }) => (
                  <div key={transaction.id} className="card-flip-enter relative">
                    <TransactionCard transaction={transaction} result={result} delay={0} />
                    <AnimatePresence>
                      {flashIds[transaction.id] && (
                        <OutcomeFlash
                          key="flash"
                          outcome={flashIds[transaction.id].outcome}
                          amount={flashIds[transaction.id].amount}
                        />
                      )}
                    </AnimatePresence>
                  </div>
                ))}
              </AnimatePresence>
            </div>
            <div ref={bottomRef} />
          </div>
        )}

        {/* ── SUMMARY ──────────────────────────────────────────────────── */}
        {phase === 'done' && summary && (
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass-card p-8 mt-4"
          >
            <div className="section-label text-center mb-2">Recovery Batch Complete</div>
            <div className="text-center text-xs text-text-muted mb-8">
              {summary.total} cases processed · agent ran autonomously
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-8 text-center">
              <div>
                <div className="font-display text-4xl text-gold mb-1.5">
                  <AnimatedCounter value={summary.total} />
                </div>
                <div className="text-xs text-text-muted">Processed</div>
              </div>
              <div>
                <div className="font-display text-4xl text-recovered mb-1.5">
                  <AnimatedCounter value={summary.recovered} />
                </div>
                <div className="text-xs text-text-muted">Recovered</div>
              </div>
              <div>
                <div className="font-display text-4xl text-failed mb-1.5">
                  <AnimatedCounter value={summary.failed} />
                </div>
                <div className="text-xs text-text-muted">Failed</div>
              </div>
              <div>
                <div className="font-display text-4xl text-escalated mb-1.5">
                  <AnimatedCounter value={summary.escalated} />
                </div>
                <div className="text-xs text-text-muted">Escalated</div>
              </div>
              <div>
                <div className="font-display text-4xl text-gold mb-1.5">
                  <AnimatedCounter value={parseFloat(summary.recovery_rate)} suffix="%" decimals={1} />
                </div>
                <div className="text-xs text-text-muted">Recovery Rate</div>
              </div>
            </div>

            {/* ── NEXT BATCH READY PANEL ─────────────────────────────── */}
            <div className="my-8 p-6 rounded-2xl bg-gold/[0.03] border border-gold/20 relative overflow-hidden">
              <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                <div className="text-left">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-2 h-2 rounded-full bg-gold pulse-dot" />
                    <span className="font-display text-xl text-gold uppercase tracking-wider">
                      {summary?.remaining_queue > 0 ? `${summary.remaining_queue} Cases Still Queued` : 'Queue Clear'}
                    </span>
                  </div>
                  <p className="text-xs text-text-muted max-w-md">
                    {summary?.remaining_queue > 0
                      ? `${summary.remaining_queue} at-risk cases are still waiting. Run the next batch or add fresh cases to keep the pipeline moving.`
                      : 'All queued cases have been processed. Add fresh synthetic cases to continue the demo.'}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2.5">
                  {summary?.remaining_queue > 0 && (
                    <button
                      onClick={runBatch}
                      className="btn-gold text-xs py-3 px-5 flex items-center gap-2 shadow-lg shadow-gold/20"
                    >
                      <BoltIcon className="w-4 h-4" /> Run Next Batch
                    </button>
                  )}

                  <button
                    onClick={async () => {
                      try {
                        await axios.post('/api/agent/next-batch')  // uses server-side env default
                        runBatch()
                      } catch (e) {
                        console.error(e)
                      }
                    }}
                    className="btn-ghost text-xs py-3 px-4 flex items-center gap-1.5"
                  >
                    <SparklesIcon className="w-4 h-4 text-gold" /> + Fresh Cases
                  </button>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-3 justify-center mt-4">
              <button onClick={reset} className="btn-ghost text-xs">
                Reset &amp; Run Again
              </button>
              <Link to="/" className="btn-ghost text-center text-xs text-text-muted hover:text-gold">
                Back to Dashboard →
              </Link>
            </div>
          </motion.div>
        )}

      </div>
    </div>
  )
}
