import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'

export function useHandTool(
  canvasRef: React.RefObject<HTMLDivElement | null>,
  breakKeepFit: () => void
) {
  const [spaceHeld, setSpaceHeld] = useState(false)
  const [handLocked, setHandLocked] = useState(false)
  const [isDragging, setIsDragging] = useState(false)
  const [showHandTooltip, setShowHandTooltip] = useState(false)

  const handMode = spaceHeld || handLocked
  const handModeRef = useRef(handMode)
  const draggingRef = useRef(false)
  const dragRef = useRef<{ x: number; y: number; scrollLeft: number; scrollTop: number } | null>(
    null
  )
  const tooltipTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useLayoutEffect(() => {
    handModeRef.current = handMode
  })

  // Space hold + H toggle — mirrors the original behaviour in CanvasContent:
  // Space requires the canvas to contain focus; H requires the canvas to contain focus.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target instanceof HTMLElement ? e.target : null
      const isEditable =
        target?.tagName === 'INPUT' || target?.tagName === 'TEXTAREA' || target?.isContentEditable
      if (isEditable) return

      if (e.code === 'Space' && canvasRef.current?.contains(document.activeElement)) {
        e.preventDefault()
      }

      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return
      if ((e.key === 'h' || e.key === 'H') && canvasRef.current?.contains(document.activeElement)) {
        setHandLocked(l => !l)
      }
      if (e.code === 'Space') {
        if (!canvasRef.current?.contains(document.activeElement)) return
        setSpaceHeld(true)
      }
    }
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') {
        draggingRef.current = false
        setIsDragging(false)
        setSpaceHeld(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current)
    }
  }, [canvasRef])

  const startDrag = useCallback(
    (clientX: number, clientY: number) => {
      const el = canvasRef.current
      if (!el) return
      draggingRef.current = true
      setIsDragging(true)
      dragRef.current = {
        x: clientX,
        y: clientY,
        scrollLeft: el.scrollLeft,
        scrollTop: el.scrollTop,
      }
      breakKeepFit()
    },
    [canvasRef, breakKeepFit]
  )

  const handleMouseDown = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button === 1) {
        e.preventDefault()
        startDrag(e.clientX, e.clientY)
        return
      }
      if (!handModeRef.current) return
      if ((e.target as HTMLElement).closest('[data-mockup]')) {
        if (tooltipTimerRef.current) clearTimeout(tooltipTimerRef.current)
        setShowHandTooltip(true)
        tooltipTimerRef.current = setTimeout(() => setShowHandTooltip(false), 2200)
        return
      }
      startDrag(e.clientX, e.clientY)
      e.preventDefault()
    },
    [startDrag]
  )

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!draggingRef.current || !dragRef.current) return
      const el = canvasRef.current
      if (!el) return
      el.scrollLeft = dragRef.current.scrollLeft - (e.clientX - dragRef.current.x)
      el.scrollTop = dragRef.current.scrollTop - (e.clientY - dragRef.current.y)
    },
    [canvasRef]
  )

  const stopDrag = useCallback(() => {
    draggingRef.current = false
    dragRef.current = null
    setIsDragging(false)
  }, [])

  const handleMouseUp = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (e.button === 1) e.preventDefault()
      stopDrag()
    },
    [stopDrag]
  )

  const cursor = isDragging ? 'grabbing' : handMode ? 'grab' : 'default'

  return {
    handMode,
    handLocked,
    setHandLocked,
    isDragging,
    showHandTooltip,
    cursor,
    handlers: {
      onMouseDown: handleMouseDown,
      onMouseMove: handleMouseMove,
      onMouseUp: handleMouseUp,
      onMouseLeave: stopDrag,
    },
  }
}
