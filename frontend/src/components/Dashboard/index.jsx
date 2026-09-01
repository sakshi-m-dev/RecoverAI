import { useEffect, useState, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { motion } from 'framer-motion'
import axios from 'axios'
import HeroMetrics from './HeroMetrics'
import FunnelViz from './FunnelViz'
import ActivityFeed from './ActivityFeed'
import TransactionCard from '../shared/TransactionCard'
import {
  TagIcon,
  RefreshIcon,
  ClockIcon,
  BankIcon,
  ShieldIcon,
  CheckIcon,
  XIcon,
  AlertIcon,
  BoltIcon,
  SparklesIcon,
  SlidersIcon,
  UserIcon,
} from '../shared/Icons'

const GUARDRAIL_POLICIES = [
  {
    Icon: TagIcon,
    label: 'Discount Cap',
    detail: 'Maximum discount: 10%',
    sub: 'AI cannot offer more — enforced in code',
  },
  {
    Icon: RefreshIcon,
    label: 'Contact Limit',
    detail: 'Max recovery messages: 2',
    sub: 'Further attempts blocked after 2 contacts',
  },
  {
    Icon: ClockIcon,
    label: 'Cooldown Window',
    detail: 'Retry cooldown: 30 minutes',
    sub: 'Actions blocked within the cooling period',
  },
  {
    Icon: BankIcon,
    label: 'High-Value Threshold',
    detail: 'Auto-block: > ₹25,000',
    sub: 'Always escalated to human — no exceptions',
  },
]

function GuardrailPolicyPanel({ blockedCount }) {
  return (
    <div className="glass-card p-5 border border-white/[0.06]">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ShieldIcon className="w-4 h-4 text-gold" />
          <div className="section-label text-xs">Active Guardrail Policies</div>
        </div>
        {blockedCount > 0 && (
          <span className="text-[10px] font-bold text-at-risk bg-at-risk/10 border border-at-risk/20 px-2 py-0.5 rounded-full">
            {blockedCount} blocked
          </span>
        )}
      </div>
      <div className="space-y-2.5">
        {GUARDRAIL_POLICIES.map((p) => {
          const Icon = p.Icon
          return (
            <div key={p.label} className="flex items-start gap-3 p-2.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
              <div className="p-1.5 rounded-md bg-white/[0.04] text-gold shrink-0 mt-0.5">
                <Icon className="w-3.5 h-3.5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-0.5">
                  <span className="text-xs font-semibold text-text-primary">{p.detail}</span>
                </div>
                <div className="text-[10px] text-text-muted leading-tight">{p.sub}</div>
              </div>
              <CheckIcon className="w-3.5 h-3.5 text-recovered shrink-0 mt-1" />
            </div>
          )
        })}
      </div>
      <p className="text-[10px] text-text-muted mt-3 leading-relaxed">
        AI recommends. Policy decides whether AI is allowed to act.
      </p>
    </div>
  )
}

export default function Dashboard() {
  const [stats, setStats]         = useState(null)
  const [transactions, setTxs]    = useState([])
  const [loading, setLoading]     = useState(true)
  const [error, setError]         = useState(null)
  const [injecting, setInjecting] = useState(false)
  const [seeding, setSeeding]     = useState(false)

  const fetchData = useCallback(async () => {
    try {
      const [sRes, tRes] = await Promise.all([
        axios.get('/api/transactions/stats'),
        axios.get('/api/transactions?limit=200'),  // fetch full dataset for dashboard
      ])
      setStats(sRes.data)
      setTxs(tRes.data.transactions)
      setError(null)
    } catch (err) {
      setError('Backend offline. Start both backend and frontend servers.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 8000)
    return () => clearInterval(interval)
  }, [fetchData])

  const injectSimulated = async (type) => {
    try {
      setInjecting(true)
      await axios.post('/api/agent/simulate-inject', { type })
      await fetchData()
    } catch (err) {
      console.error(err)
    } finally {
      setInjecting(false)
    }
  }

  const atRisk = transactions.filter(t => t.status === 'at_risk')
  const hasAtRiskCases = atRisk.length > 0
  const allSorted = [...transactions].sort(
    (a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at)
  )

  // Seed a fresh at-risk batch then navigate to /batch to run the agent
  const handleReseedAndRun = async () => {
    try {
      setSeeding(true)
      // count omitted — backend uses NEW_CASE_GENERATION_BATCH from env (default 10)
      await axios.post('/api/agent/next-batch')
      await fetchData()
      await new Promise(r => setTimeout(r, 400))
      window.location.href = '/batch'
    } catch (err) {
      console.error('Reseed failed:', err)
    } finally {
      setSeeding(false)
    }
  }

  if (loading) return (
    <div className="min-h-screen hero-gradient flex items-center justify-center">
      <div className="text-center">
        <div className="font-display text-7xl text-gold mb-3 animate-pulse">RECOVERAI</div>
        <div className="text-text-muted text-sm uppercase tracking-widest">Initializing recovery command…</div>
      </div>
    </div>
  )

  if (error) return (
    <div className="min-h-screen hero-gradient flex items-center justify-center px-6">
      <div className="glass-card p-8 max-w-md text-center">
        <div className="w-12 h-12 rounded-full bg-at-risk/10 border border-at-risk/20 text-at-risk flex items-center justify-center mx-auto mb-4">
          <AlertIcon className="w-6 h-6" />
        </div>
        <div className="font-display text-2xl text-at-risk mb-3">Gateway Offline</div>
        <p className="text-sm text-text-muted leading-relaxed">{error}</p>
        <button onClick={fetchData} className="mt-6 btn-ghost text-sm">Reconnect</button>
      </div>
    </div>
  )

  // Calculate simulated net ROI
  const totalRecovered = stats?.recovered_amount || 0
  const assumedCost = totalRecovered > 0 ? 15000 : 0
  const netRoi = Math.max(0, totalRecovered - assumedCost)

  return (
    <div className="min-h-screen hero-gradient">
      <div className="max-w-7xl mx-auto px-6 py-8">

        {/* Page header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-6 flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4"
        >
          <div>
            <div className="section-label mb-2">Revenue Recovery Intelligence</div>
            <h1 className="font-display text-4xl md:text-5xl leading-none">
              RECOVERY <span className="text-gold">COMMAND</span>
            </h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => axios.post('/api/agent/reset').then(fetchData)}
              className="btn-ghost text-sm py-2.5 px-4 font-semibold"
            >
              Reset Data
            </button>
            {hasAtRiskCases ? (
              <Link
                to="/batch"
                className="btn-gold flex items-center gap-2 text-sm"
                aria-disabled={seeding || injecting}
                style={seeding || injecting ? { pointerEvents: 'none', opacity: 0.5 } : {}}
              >
                <BoltIcon className="w-4 h-4" /> Run Recovery Batch
              </Link>
            ) : (
              <button
                onClick={handleReseedAndRun}
                disabled={seeding || injecting}
                className="btn-gold flex items-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <SparklesIcon className="w-4 h-4" />
                {seeding ? 'Seeding…' : 'Reseed & Run'}
              </button>
            )}
          </div>
        </motion.div>

        <div className="gold-line mb-6" />

        {/* Hero metrics (5 cards) */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.05 }}
          className="mb-6"
        >
          <HeroMetrics stats={stats} />
        </motion.div>

        {/* Main layout grid (Left: charts + cases, Right: logs + simulation controls) */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          
          {/* Left Column (8 cols) */}
          <div className="lg:col-span-8 space-y-6">
            
            {/* Funnel visualization */}
            <div style={{ height: '350px' }}>
              <FunnelViz data={stats?.funnel} />
            </div>

            {/* At risk / Pending section */}
            <div>
              <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
                <div className="section-label">
                  Autonomous Recovery Queue ({atRisk.length} active)
                </div>
                <div className="flex items-center gap-3">
                  <button
                    onClick={async () => {
                      try {
                        await axios.post('/api/agent/next-batch', { count: 20 })
                        fetchData()
                      } catch (e) {
                        console.error(e)
                      }
                    }}
                    className="text-xs text-text-muted hover:text-gold transition-colors font-medium flex items-center gap-1 bg-white/[0.03] hover:bg-white/[0.06] border border-white/[0.08] px-2.5 py-1 rounded-lg"
                  >
                    <SparklesIcon className="w-3.5 h-3.5 text-gold" /> +20 from Dataset
                  </button>

                  {atRisk.length > 0 && (
                    <Link to="/batch" className="text-xs text-gold hover:text-gold-dim transition-colors uppercase tracking-wider font-semibold">
                      Execute Agent Batch →
                    </Link>
                  )}
                </div>
              </div>

              {atRisk.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {atRisk.slice(0, 12).map((tx, i) => (
                    <TransactionCard key={tx.id} transaction={tx} delay={i * 0.025} />
                  ))}
                </div>
              ) : (
                <div className="glass-card p-8 text-center border-dashed border-white/10">
                  <div className="w-12 h-12 rounded-full bg-recovered/10 border border-recovered/20 text-recovered flex items-center justify-center mx-auto mb-3">
                    <SparklesIcon className="w-6 h-6" />
                  </div>
                  <div className="font-display text-2xl text-recovered mb-2">ALL BATCHES RECOVERED</div>
                  <p className="text-text-muted text-sm mb-4">
                    No transactions are currently at risk. Load the next batch from the dataset to continue testing recovery workflows.
                  </p>
                  <button
                    onClick={async () => {
                      await axios.post('/api/agent/next-batch', { count: 25 })
                      fetchData()
                    }}
                    className="btn-gold text-xs py-2 px-4 inline-flex items-center gap-2"
                  >
                    <BoltIcon className="w-3.5 h-3.5" /> Load Next Batch (25 Cases)
                  </button>
                </div>
              )}
            </div>

            {/* Secondary Analytics: Strategy Success & ROI */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              
              {/* Strategy Success Rates */}
              <div className="glass-card p-5">
                <div className="section-label mb-4">Recovery Strategy Analytics</div>
                <div className="space-y-3.5">
                  {stats?.strategies?.map((strat) => (
                    <div key={strat.strategy} className="flex flex-col">
                      <div className="flex items-center justify-between text-xs mb-1.5">
                        <span className="text-text-secondary font-medium">{strat.strategy}</span>
                        <span className="text-text-muted">{strat.success}/{strat.total} resolved ({strat.rate}%)</span>
                      </div>
                      <div className="h-1 bg-white/[0.04] rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gold rounded-full"
                          style={{ width: `${strat.rate}%` }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Net Recovered Value ROI */}
              <div className="glass-card p-5 flex flex-col justify-between">
                <div>
                  <div className="section-label mb-2.5">Net Recovered ROI</div>
                  <p className="text-xs text-text-muted leading-relaxed">
                    Estimated savings generated by autonomous resolution, offset by manual triage assumptions.
                  </p>
                </div>
                <div className="mt-4 pt-4 border-t border-white/[0.04] flex items-baseline justify-between">
                  <div>
                    <div className="text-[10px] text-text-muted uppercase">Manual Triage Cost (Est.)</div>
                    <div className="text-sm font-semibold text-text-secondary">₹{assumedCost.toLocaleString('en-IN')}</div>
                  </div>
                  <div className="text-right">
                    <div className="text-[10px] text-gold uppercase font-semibold">Net Value Added</div>
                    <div className="text-3xl font-display text-recovered">₹{netRoi.toLocaleString('en-IN')}</div>
                  </div>
                </div>
              </div>

            </div>

            {/* Why RecoverAI Comparison Section */}
            <div className="glass-card p-5">
              <div className="section-label mb-4">Automated Workflow vs RecoverAI Agent</div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-xs leading-relaxed text-text-muted">
                <div className="p-3.5 rounded-lg bg-white/[0.02] border border-white/[0.04]">
                  <div className="font-semibold text-text-secondary mb-2 flex items-center gap-1.5">
                    <XIcon className="w-3.5 h-3.5 text-failed" /> Static Automation
                  </div>
                  <p>Triggers immediate reminders without diagnosing the root cause. Blindsides customers with repeated spam messages. Offers flat, arbitrary discounts that eat into business margins.</p>
                </div>
                <div className="p-3.5 rounded-lg bg-gold/[0.015] border border-gold/10">
                  <div className="font-semibold text-gold mb-2 flex items-center gap-1.5">
                    <CheckIcon className="w-3.5 h-3.5 text-recovered" /> RecoverAI Bounded Agent
                  </div>
                  <p>Analyzes context (Checkout vs Failed vs Subscription), runs real-time Claude diagnosis, verifies policies via built-in guardrails, applies dynamic interventions, and records full audit timelines.</p>
                </div>
              </div>
            </div>

          </div>

          {/* Right Column / Sidebar (4 cols) */}
          <div className="lg:col-span-4 space-y-6">
            
            {/* Simulation Control Panel */}
            <div className="glass-card p-5 border border-gold/15 bg-gold/[0.01]">
              <div className="flex items-center gap-2 mb-3">
                <SlidersIcon className="w-4 h-4 text-gold" />
                <div className="section-label text-gold font-bold">Simulation Control Panel</div>
              </div>
              <p className="text-xs text-text-muted mb-4 leading-relaxed">
                Inject deterministic test scenarios into the at-risk queue to demonstrate specific agent pipelines and policies:
              </p>
              <div className="space-y-2.5">
                <button
                  disabled={injecting}
                  onClick={() => injectSimulated('success')}
                  className="w-full text-left p-3 rounded-xl bg-bg-primary hover:bg-bg-hover border border-white/[0.06] hover:border-gold/30 transition-all text-xs flex items-center justify-between group"
                >
                  <div>
                    <div className="font-semibold text-text-primary group-hover:text-gold transition-colors">1. Success Case</div>
                    <div className="text-[10px] text-text-muted mt-0.5">Failed Payment (OTP Timeout) → Nudge</div>
                  </div>
                  <span className="w-2.5 h-2.5 rounded-full bg-recovered shadow-sm shadow-recovered/50" />
                </button>

                <button
                  disabled={injecting}
                  onClick={() => injectSimulated('failed_retry')}
                  className="w-full text-left p-3 rounded-xl bg-bg-primary hover:bg-bg-hover border border-white/[0.06] hover:border-gold/30 transition-all text-xs flex items-center justify-between group"
                >
                  <div>
                    <div className="font-semibold text-text-primary group-hover:text-gold transition-colors">2. Failed Retry Case</div>
                    <div className="text-[10px] text-text-muted mt-0.5">Subscription Card Decline → Fails retry</div>
                  </div>
                  <span className="w-2.5 h-2.5 rounded-full bg-failed shadow-sm shadow-failed/50" />
                </button>

                <button
                  disabled={injecting}
                  onClick={() => injectSimulated('retry_limit')}
                  className="w-full text-left p-3 rounded-xl bg-bg-primary hover:bg-bg-hover border border-white/[0.06] hover:border-gold/30 transition-all text-xs flex items-center justify-between group"
                >
                  <div>
                    <div className="font-semibold text-text-primary group-hover:text-gold transition-colors">3. Limit Violation Case</div>
                    <div className="text-[10px] text-text-muted mt-0.5">Checkout Abandoned → Exceeds 2 retries limit</div>
                  </div>
                  <span className="w-2.5 h-2.5 rounded-full bg-escalated shadow-sm shadow-escalated/50" />
                </button>

                <button
                  disabled={injecting}
                  onClick={() => injectSimulated('escalation')}
                  className="w-full text-left p-3 rounded-xl bg-bg-primary hover:bg-bg-hover border border-white/[0.06] hover:border-gold/30 transition-all text-xs flex items-center justify-between group"
                >
                  <div>
                    <div className="font-semibold text-text-primary group-hover:text-gold transition-colors">4. High Value Case</div>
                    <div className="text-[10px] text-text-muted mt-0.5">Amount ₹32,000 &gt; ₹25,000 autonomous cap</div>
                  </div>
                  <div className="p-1 rounded bg-escalated/20 text-escalated">
                    <UserIcon className="w-3 h-3" />
                  </div>
                </button>
              </div>
            </div>

            {/* Guardrail Policy Panel */}
            <GuardrailPolicyPanel blockedCount={stats?.blocked_actions || 0} />

            {/* Live Activity Feed */}
            <div style={{ height: '420px' }}>
              <ActivityFeed transactions={allSorted} />
            </div>

          </div>

        </div>

      </div>
    </div>
  )
}
