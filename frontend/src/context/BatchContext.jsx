import { createContext, useContext, useRef, useState, useCallback, useEffect } from 'react'
import axios from 'axios'

const BatchContext = createContext(null)

export function BatchProvider({ children }) {
  const [phase, setPhase]             = useState('idle')   // 'idle' | 'running' | 'done'
  const [cards, setCards]             = useState([])
  const [current, setCurrent]         = useState(null)
  const [currentStep, setCurrentStep] = useState('DETECTED')
  const [liveStep, setLiveStep]       = useState(null)
  const [progress, setProgress]       = useState({ done: 0, total: 0 })
  const [summary, setSummary]         = useState(null)
  const [batchInfo, setBatchInfo]     = useState(null)
  const [flashIds, setFlashIds]       = useState({})
  const esRef                         = useRef(null)

  // Clean up SSE on unmount of the provider (app teardown only)
  useEffect(() => () => esRef.current?.close(), [])

  const STEP_MAP = {
    model_used:    'DIAGNOSING',
    diagnosed:     'DIAGNOSING',
    policy_checked:'GUARDRAIL',
    action_taken:  'ACTION',
    resolved:      'VERIFIED',
  }

  const runBatch = useCallback(() => {
    // Close any existing stream first
    esRef.current?.close()

    setPhase('running')
    setCards([])
    setSummary(null)
    setCurrent(null)
    setCurrentStep('DETECTED')
    setLiveStep(null)
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
            batchSize:   d.batch_size,
            queueSize:   d.queue_size,
            remaining:   d.remaining,
            totalInDb:   d.total_in_db,
            concurrency: d.concurrency,
            targetRpm:   d.target_rpm,
          })
          break

        case 'transaction_start':
          setCurrent(d.transaction)
          setCurrentStep('DETECTED')
          setLiveStep(null)
          break

        case 'transaction_step': {
          const mapped = STEP_MAP[d.step]
          if (mapped) setCurrentStep(mapped)
          setLiveStep({ step: d.step, data: d.data })
          break
        }

        case 'transaction_done': {
          const outcome = d.result?.outcome || d.transaction?.status || 'failed'
          const txId    = d.transaction?.id

          setCards(prev => [...prev, { transaction: d.transaction, result: d.result }])
          setCurrent(null)
          setCurrentStep('DETECTED')
          setLiveStep(null)
          setProgress(p => ({ ...p, done: p.done + 1 }))

          if (txId) {
            setFlashIds(prev => ({ ...prev, [txId]: { outcome, amount: d.transaction?.amount } }))
            setTimeout(() => setFlashIds(prev => {
              const copy = { ...prev }; delete copy[txId]; return copy
            }), 1800)
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
  }, [])

  const reset = useCallback(async () => {
    esRef.current?.close()
    await axios.post('/api/agent/reset')
    setPhase('idle'); setCards([]); setSummary(null); setCurrent(null)
    setProgress({ done: 0, total: 0 }); setFlashIds({}); setLiveStep(null)
    setBatchInfo(null)
  }, [])

  return (
    <BatchContext.Provider value={{
      phase, cards, current, currentStep, liveStep,
      progress, summary, batchInfo, flashIds,
      runBatch, reset,
    }}>
      {children}
    </BatchContext.Provider>
  )
}

export function useBatch() {
  const ctx = useContext(BatchContext)
  if (!ctx) throw new Error('useBatch must be used inside <BatchProvider>')
  return ctx
}
