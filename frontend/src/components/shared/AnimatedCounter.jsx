import { useEffect, useRef, useState } from 'react'
import { useInView } from 'framer-motion'

/**
 * Animated number counter that runs once when it enters the viewport.
 */
export default function AnimatedCounter({
  value,
  prefix = '',
  suffix = '',
  duration = 1400,
  decimals = 0,
  className = '',
}) {
  const [display, setDisplay] = useState(0)
  const ref = useRef(null)
  const isInView = useInView(ref, { once: true, amount: 0.5 })
  const hasRun = useRef(false)

  useEffect(() => {
    if (!isInView || hasRun.current) return
    hasRun.current = true

    const start = performance.now()
    const to = value

    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3) }

    function tick(now) {
      const progress = Math.min((now - start) / duration, 1)
      setDisplay(to * easeOutCubic(progress))
      if (progress < 1) requestAnimationFrame(tick)
    }

    requestAnimationFrame(tick)
  }, [isInView, value, duration])

  useEffect(() => {
    if (hasRun.current) setDisplay(value)
  }, [value])

  const formatted = decimals > 0
    ? display.toFixed(decimals)
    : Math.round(display).toLocaleString('en-IN')

  return (
    <span ref={ref} className={className}>
      {prefix}{formatted}{suffix}
    </span>
  )
}
