import { useEffect, useRef, useState } from 'react'

const IDLE_DELAY_MS = 3000

/**
 * Dims an element after a period of no screen interaction, waking it back up
 * on any pointer/touch/scroll activity anywhere in the viewport (not just on
 * the element itself) — these buttons float over live prototype content, so
 * a tap/scroll elsewhere on screen should still wake them.
 */
export function useIdleFade() {
  const [idle, setIdle] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    const wake = () => {
      setIdle(false)
      if (timerRef.current) clearTimeout(timerRef.current)
      timerRef.current = setTimeout(() => setIdle(true), IDLE_DELAY_MS)
    }

    wake()

    const events: Array<keyof WindowEventMap> = ['pointerdown', 'touchstart', 'scroll', 'wheel']
    events.forEach(evt => window.addEventListener(evt, wake, { passive: true }))

    return () => {
      events.forEach(evt => window.removeEventListener(evt, wake))
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [])

  return idle
}
