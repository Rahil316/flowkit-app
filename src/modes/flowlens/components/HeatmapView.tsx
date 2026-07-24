import type { PageView } from '@flowkit/types/index'
import type { CursorSample } from '@flowkit-features/flowTracer/types'
import { Eye, EyeOff, Flame } from 'lucide-react'
import { useLayoutEffect, useMemo, useRef, useState } from 'react'

import { FLOWLENS_ACCENT } from '../flowLensTheme'
import CursorHeatmap, { heatColor } from './CursorHeatmap'

interface Props {
  views: PageView[]
  pageId: string
  samples: CursorSample[]
  width: number
  height: number
  /** Extra context line under the title (e.g. "40 samples · 3 sessions"). */
  caption?: string
}

/**
 * Heatmap viewer: the real recorded screen behind, the cursor heat on top, each
 * independently toggleable (bare screen / heat-only / both), plus a color legend.
 */
export default function HeatmapView({ views, pageId, samples, width, height, caption }: Props) {
  const [showScreen, setShowScreen] = useState(true)
  const [showHeat, setShowHeat] = useState(true)

  const view = useMemo(() => views.find(v => v.id === pageId), [views, pageId])
  const ScreenComponent = view?.component

  const sampleCount = useMemo(
    () => samples.filter(s => s.pageId === pageId).length,
    [samples, pageId]
  )

  // Fit the captured-size frame into the available space.
  const wrapRef = useRef<HTMLDivElement>(null)
  const [scale, setScale] = useState(1)
  useLayoutEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const measure = () => {
      const pad = 24
      setScale(Math.min(1, (el.clientWidth - pad) / width, (el.clientHeight - pad) / height))
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [width, height])

  return (
    <div className="h-full flex flex-col">
      {/* Controls */}
      <div className="flex items-center gap-2 py-2.5 px-5 border-b border-theme-border shrink-0">
        <Toggle
          on={showScreen}
          onClick={() => setShowScreen(v => !v)}
          icon={showScreen ? <Eye size={13} /> : <EyeOff size={13} />}
          label="Screen"
        />
        <Toggle
          on={showHeat}
          onClick={() => setShowHeat(v => !v)}
          icon={<Flame size={13} />}
          label="Heatmap"
          accent
        />
        {caption && <span className="ml-2 text-ui-2xs text-theme-text-muted">{caption}</span>}
        <div className="flex-1" />
        <Legend max={sampleCount} />
      </div>

      {/* Stage */}
      <div ref={wrapRef} className="flex-1 flex items-center justify-center overflow-hidden p-3">
        <div
          className="relative rounded-[18px] overflow-hidden shrink-0 shadow-[0_24px_64px_rgba(0,0,0,0.5)] border border-theme-border"
          style={{
            width,
            height,
            transform: `scale(${scale})`,
            transformOrigin: 'center center',
            background: showScreen ? '#fff' : 'var(--color-bg-base)',
          }}
        >
          {/* Real recorded screen */}
          {showScreen && ScreenComponent ? (
            <div className="absolute inset-0 overflow-hidden">
              <ScreenComponent />
            </div>
          ) : showScreen ? (
            <div className="absolute inset-0 flex items-center justify-center text-theme-text-disabled text-xs">
              {pageId}{' '}
              <span className="ml-1.5 text-theme-border">(screen not in this workspace)</span>
            </div>
          ) : null}

          {/* Heat on top */}
          {showHeat && (
            <CursorHeatmap samples={samples} pageId={pageId} width={width} height={height} />
          )}

          {!showScreen && !showHeat && (
            <div className="absolute inset-0 flex items-center justify-center text-theme-text-disabled text-xs">
              Nothing to show — enable Screen or Heatmap
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Toggle({
  on,
  onClick,
  icon,
  label,
  accent,
}: {
  on: boolean
  onClick: () => void
  icon: React.ReactNode
  label: string
  accent?: boolean
}) {
  const activeBg = accent ? FLOWLENS_ACCENT : 'var(--color-bg-border)'
  return (
    <button
      onClick={onClick}
      style={{
        border: `1px solid ${on ? activeBg : 'var(--color-bg-border)'}`,
        background: on ? activeBg : 'transparent',
      }}
      className={`flex items-center gap-1 text-[11.5px] font-semibold py-1.25 px-2.5 rounded-[7px] cursor-pointer ${
        on ? 'text-white' : 'text-theme-text-muted'
      }`}
    >
      {icon} {label}
    </button>
  )
}

function Legend({ max }: { max: number }) {
  // Gradient stops sampled from the same heatColor ramp the canvas uses.
  const stops = [0, 0.25, 0.5, 0.75, 1]
  const css = stops
    .map(t => {
      const [r, g, b] = heatColor(t)
      return `rgb(${r},${g},${b}) ${t * 100}%`
    })
    .join(', ')
  return (
    <div className="flex items-center gap-2">
      <span className="text-[10px] text-theme-text-muted">less</span>
      <div
        className="w-30 h-2 rounded-sm"
        style={{
          background: `linear-gradient(to right, ${css})`,
        }}
      />
      <span className="text-[10px] text-theme-text-muted">more</span>
      <span className="text-[10px] text-theme-text-disabled ml-1.5 tabular-nums">
        {max} sample{max !== 1 ? 's' : ''}
      </span>
    </div>
  )
}
