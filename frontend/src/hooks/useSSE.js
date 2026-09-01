import { useEffect } from 'react'
import { useRef, useState } from 'react'

/**
 * SSE hook — connects to a URL and streams events.
 * @param {string} url
 * @param {{ onMessage: (data: any) => void, enabled?: boolean }} options
 */
export function useSSE(url, { onMessage, enabled = false }) {
  const esRef = useRef(null)
  const [connected, setConnected] = useState(false)

  useEffect(() => {
    if (!enabled || !url) return

    const es = new EventSource(url)
    esRef.current = es

    es.onopen    = () => setConnected(true)
    es.onmessage = (e) => {
      try { onMessage(JSON.parse(e.data)) } catch {}
    }
    es.onerror   = () => { setConnected(false); es.close() }

    return () => { es.close(); setConnected(false) }
  }, [url, enabled])

  const close = () => esRef.current?.close()
  return { connected, close }
}
