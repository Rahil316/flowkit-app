import { Z } from '@flowkit-shared/constants/zIndex'
import React, { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'

interface TooltipProps {
  children: React.ReactElement<{
    onMouseEnter?: React.MouseEventHandler<HTMLElement>
    onMouseLeave?: React.MouseEventHandler<HTMLElement>
  }>
  content: React.ReactNode
  placement?: 'top' | 'bottom' | 'left' | 'right'
  disabled?: boolean
  delay?: number
  showDelay?: number
  wrap?: boolean
}

export default function Tooltip({
  children,
  content,
  placement = 'top',
  disabled = false,
  delay = 150,
  showDelay,
  wrap = false,
}: TooltipProps) {
  const [visible, setVisible] = useState(false)
  const [coords, setCoords] = useState<{ top: number; left: number } | null>(null)
  const triggerRef = useRef<HTMLElement>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const updateCoords = () => {
    if (!triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()

    let top = 0
    let left = 0

    if (placement === 'top') {
      top = rect.top - 8
      left = rect.left + rect.width / 2
    } else if (placement === 'bottom') {
      top = rect.bottom + 8
      left = rect.left + rect.width / 2
    } else if (placement === 'left') {
      top = rect.top + rect.height / 2
      left = rect.left - 8
    } else if (placement === 'right') {
      top = rect.top + rect.height / 2
      left = rect.right + 8
    }

    setCoords({ top, left })
  }

  const show = () => {
    if (disabled || !content) return
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    if (showDelay) {
      timeoutRef.current = setTimeout(() => {
        updateCoords()
        setVisible(true)
      }, showDelay)
    } else {
      updateCoords()
      setVisible(true)
    }
  }

  const hide = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
    timeoutRef.current = setTimeout(() => {
      setVisible(false)
    }, delay)
  }

  const handleMouseEnterTooltip = () => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current)
  }

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current)
    }
  }, [])

  const trigger = React.cloneElement(children, {
    ref: triggerRef,
    onMouseEnter: (e: React.MouseEvent<HTMLElement>) => {
      show()
      if (children.props.onMouseEnter) children.props.onMouseEnter(e)
    },
    onMouseLeave: (e: React.MouseEvent<HTMLElement>) => {
      hide()
      if (children.props.onMouseLeave) children.props.onMouseLeave(e)
    },
  } as React.HTMLAttributes<HTMLElement> & { ref: React.Ref<HTMLElement> })

  const getTransform = () => {
    if (placement === 'top') return 'translate(-50%, -100%)'
    if (placement === 'bottom') return 'translate(-50%, 0)'
    if (placement === 'left') return 'translate(-100%, -50%)'
    if (placement === 'right') return 'translate(0, -50%)'
    return 'none'
  }

  return (
    <>
      {trigger}
      {visible &&
        coords &&
        createPortal(
          <div
            ref={tooltipRef}
            onMouseEnter={handleMouseEnterTooltip}
            onMouseLeave={hide}
            style={{
              position: 'fixed',
              top: coords.top,
              left: coords.left,
              transform: getTransform(),
              zIndex: Z.tooltip,
              pointerEvents: 'auto',
            }}
          >
            <div
              className={`bg-theme-surface border border-theme-border text-theme-text-primary text-ui-2xs px-2.5 py-1.5 rounded-md shadow-theme-float max-w-65 leading-[1.4] ${wrap ? 'whitespace-normal break-all' : 'whitespace-nowrap'}`}
            >
              {content}
            </div>
          </div>,
          document.body
        )}
    </>
  )
}
