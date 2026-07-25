import { useCallback, useEffect, useRef, useState } from 'react'

export type HandleState = 'hover' | 'drag' | null

export interface PanelDragHandle {
  handleActive: HandleState
  setHandleActive: (v: HandleState) => void
  startDrag: (e: React.MouseEvent) => void
}

/**
 * Pure drag mechanic for a single resizable panel edge.
 *
 * Manages only: hover/drag visual state + the mousedown→mousemove→mouseup
 * lifecycle. Does NOT know about reducers, localStorage, or CSS vars.
 *
 * @param side       Which panel edge: 'left' grows rightward, 'right' grows leftward.
 * @param getWidth   Ref-stable getter for the current panel width (avoids stale closures).
 * @param min        Minimum clamped width.
 * @param max        Maximum clamped width.
 * @param onChange   Called on every mousemove pixel with the new clamped width.
 * @param onCommit   Called once on mouseup with the final clamped width (for persistence).
 */
export function usePanelDrag(
  side: 'left' | 'right',
  getWidth: () => number,
  min: number,
  max: number,
  onChange: (width: number) => void,
  onCommit: (width: number) => void
): PanelDragHandle {
  const [handleActive, setHandleActive] = useState<HandleState>(null)
  const dragRef = useRef<{ startX: number; startW: number } | null>(null)

  const moveListenerRef = useRef<((ev: MouseEvent) => void) | null>(null)
  const upListenerRef = useRef<((ev: MouseEvent) => void) | null>(null)

  useEffect(() => {
    return () => {
      if (moveListenerRef.current) {
        window.removeEventListener('mousemove', moveListenerRef.current)
      }
      if (upListenerRef.current) {
        window.removeEventListener('mouseup', upListenerRef.current)
      }
    }
  }, [])

  const startDrag = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      // Guard against a second mousedown arriving before the previous drag's
      // mouseup fired (multitouch, or a mouseup swallowed elsewhere) — without
      // this, the stale listeners below are orphaned rather than removed.
      if (moveListenerRef.current) window.removeEventListener('mousemove', moveListenerRef.current)
      if (upListenerRef.current) window.removeEventListener('mouseup', upListenerRef.current)

      dragRef.current = { startX: e.clientX, startW: getWidth() }
      setHandleActive('drag')

      const clamp = (raw: number) => Math.max(min, Math.min(max, raw))

      const calc = (clientX: number) => {
        if (!dragRef.current) return getWidth()
        const delta = clientX - dragRef.current.startX
        return clamp(
          side === 'left' ? dragRef.current.startW + delta : dragRef.current.startW - delta
        )
      }

      const onMove = (ev: MouseEvent) => onChange(calc(ev.clientX))

      const onUp = (ev: MouseEvent) => {
        onCommit(calc(ev.clientX))
        dragRef.current = null
        setHandleActive(null)
        window.removeEventListener('mousemove', onMove)
        window.removeEventListener('mouseup', onUp)
        moveListenerRef.current = null
        upListenerRef.current = null
      }

      moveListenerRef.current = onMove
      upListenerRef.current = onUp
      window.addEventListener('mousemove', onMove)
      window.addEventListener('mouseup', onUp)
    },
    // getWidth is always the same ref-stable function; min/max/onChange/onCommit
    // are expected to be stable (useCallback'd) by the caller.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [side, min, max, onChange, onCommit]
  )

  return { handleActive, setHandleActive, startDrag }
}
