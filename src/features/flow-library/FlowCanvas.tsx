import { type FlowStep, type FlowStoryDef, type Fork, isFlowStoryRef } from '@flowkit/types/index'
import { useTheme } from '@flowkit-shared/contexts/ThemeContext'
import { GitFork } from 'lucide-react'
import { useEffect, useRef } from 'react'

// ── FlowCanvas ──────────────────────────────────────────────────────────────────

export default function FlowCanvas({
  steps,
  activeSourcePageId = null,
}: {
  steps: FlowStoryDef['steps']
  activeSourcePageId?: string | null
}) {
  const { theme, scale } = useTheme()
  return (
    <div className="flex flex-col items-start gap-0 pb-2 overflow-auto">
      <Sequence
        steps={steps}
        theme={theme}
        scale={scale}
        depth={0}
        activeSourcePageId={activeSourcePageId}
      />
      <TerminalCap theme={theme} scale={scale} />
    </div>
  )
}

function Sequence({
  steps,
  theme,
  scale,
  depth,
  activeSourcePageId,
}: {
  steps: FlowStoryDef['steps']
  theme: ReturnType<typeof useTheme>['theme']
  scale: ReturnType<typeof useTheme>['scale']
  depth: number
  activeSourcePageId: string | null
}) {
  return (
    <>
      {steps.map((entry, i) => {
        if (isFlowStoryRef(entry)) {
          return (
            <RefNode
              key={i}
              refId={entry.ref}
              theme={theme}
              scale={scale}
              first={i === 0 && depth === 0}
            />
          )
        }
        const step = entry as FlowStep
        const forks = (step.forks as Fork[] | undefined) ?? []
        const isActive = activeSourcePageId !== null && step.pageId === activeSourcePageId
        return (
          <div key={i} className="flex flex-col items-start">
            <Connector theme={theme} hide={i === 0 && depth === 0} active={isActive} />
            <div className="flex items-start gap-3">
              <PageNode step={step} theme={theme} scale={scale} depth={depth} isActive={isActive} />
              {forks.length > 0 && (
                <div className="flex flex-col gap-2 pt-1.5">
                  {forks.map((fork, fi) => (
                    <ForkBranch
                      key={fi}
                      fork={fork}
                      theme={theme}
                      scale={scale}
                      activeSourcePageId={activeSourcePageId}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )
      })}
    </>
  )
}

function PageNode({
  step,
  theme,
  scale,
  depth,
  isActive,
}: {
  step: FlowStep
  theme: ReturnType<typeof useTheme>['theme']
  scale: ReturnType<typeof useTheme>['scale']
  depth: number
  isActive: boolean
}) {
  const ref = useRef<HTMLDivElement>(null)
  const opacity = depth === 0 ? 1 : 0.85

  useEffect(() => {
    if (isActive && ref.current) {
      ref.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [isActive])

  return (
    <div
      ref={ref}
      className="rounded-lg px-3 py-2 transition-all"
      style={{
        minWidth: 148,
        opacity,
        background: isActive ? 'rgba(99,102,241,0.1)' : theme.bg.elevated,
        border: isActive ? '1px solid rgba(99,102,241,0.45)' : `1px solid ${theme.bg.border}`,
        boxShadow: isActive ? '0 0 0 2px rgba(99,102,241,0.12)' : undefined,
      }}
    >
      <div className="flex items-center gap-1.5">
        <div
          className="font-mono font-semibold"
          style={{ fontSize: scale.text.xs, color: isActive ? '#818cf8' : theme.text.primary }}
        >
          {step.pageId}
        </div>
        {isActive && (
          <span
            className="px-1.5 py-px rounded text-[10px] font-semibold"
            style={{ background: 'rgba(99,102,241,0.2)', color: '#818cf8' }}
          >
            here
          </span>
        )}
      </div>
      {step.actionNote && (
        <div
          className="mt-0.5 leading-snug"
          style={{ fontSize: scale.text.xxs, color: theme.text.secondary }}
        >
          {step.actionNote}
        </div>
      )}
      {step.on && (
        <div
          className="font-mono mt-1 inline-block px-1.5 py-px rounded"
          style={{ fontSize: '10px', color: theme.text.muted, background: theme.bg.base }}
        >
          tap #{step.on}
        </div>
      )}
      {step.annotation && (
        <div
          className="mt-1.5 px-1.5 py-0.5 rounded italic leading-snug"
          style={{
            fontSize: scale.text.xxs,
            color: theme.accent.amber,
            background: theme.accent.amberDim,
          }}
        >
          {step.annotation}
        </div>
      )}
    </div>
  )
}

function ForkBranch({
  fork,
  theme,
  scale,
  activeSourcePageId,
}: {
  fork: Fork
  theme: ReturnType<typeof useTheme>['theme']
  scale: ReturnType<typeof useTheme>['scale']
  activeSourcePageId: string | null
}) {
  const terminal = fork.mergesTo !== 'next'
  return (
    <div
      className="rounded-lg pl-2.5 pr-2 py-1.5"
      style={{ borderLeft: `2px solid ${theme.accent.amber}55` }}
    >
      <div className="flex items-center gap-1.5 mb-1.5">
        <GitFork size={9} strokeWidth={2.5} style={{ color: theme.accent.amber }} />
        <span
          className="font-semibold"
          style={{ fontSize: scale.text.xxs, color: theme.accent.amber }}
        >
          {fork.label}
        </span>
        <span
          className="px-1.5 py-px rounded font-medium"
          style={{
            fontSize: '10px',
            color: terminal ? theme.accent.red : theme.accent.green,
            background: terminal ? theme.accent.redDim : theme.accent.greenDim,
          }}
        >
          {terminal ? 'ends' : 'merges'}
        </span>
      </div>
      <div className="flex flex-col items-start" style={{ marginLeft: 2 }}>
        <Sequence
          steps={fork.steps}
          theme={theme}
          scale={scale}
          depth={1}
          activeSourcePageId={activeSourcePageId}
        />
      </div>
    </div>
  )
}

function RefNode({
  refId,
  theme,
  scale,
  first,
}: {
  refId: string
  theme: ReturnType<typeof useTheme>['theme']
  scale: ReturnType<typeof useTheme>['scale']
  first: boolean
}) {
  return (
    <div className="flex flex-col items-start">
      {!first && <Connector theme={theme} active={false} />}
      <div
        className="rounded-lg px-3 py-2"
        style={{ background: theme.accent.purpleDim, border: `1px solid ${theme.accent.purple}30` }}
      >
        <span style={{ fontSize: scale.text.xs, color: theme.accent.purple }}>
          ↗ runs <code className="font-mono font-semibold">{refId}</code>
        </span>
      </div>
    </div>
  )
}

function Connector({
  theme,
  hide,
  active,
}: {
  theme: ReturnType<typeof useTheme>['theme']
  hide?: boolean
  active: boolean
}) {
  if (hide) return null
  return (
    <div
      style={{
        width: 1.5,
        height: 16,
        marginLeft: 19,
        background: active
          ? 'linear-gradient(180deg, rgba(99,102,241,0.6) 0%, rgba(99,102,241,0.3) 100%)'
          : `linear-gradient(180deg, ${theme.bg.border} 0%, #22d3ee55 100%)`,
        borderRadius: 1,
      }}
    />
  )
}

function TerminalCap({
  theme,
  scale,
}: {
  theme: ReturnType<typeof useTheme>['theme']
  scale: ReturnType<typeof useTheme>['scale']
}) {
  return (
    <div className="flex flex-col items-start">
      <Connector theme={theme} active={false} />
      <div
        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full"
        style={{ background: theme.bg.base, border: `1px solid ${theme.bg.border}` }}
      >
        <span
          className="rounded-full"
          style={{ width: 6, height: 6, background: theme.accent.green, display: 'inline-block' }}
        />
        <span style={{ fontSize: scale.text.xxs, color: theme.text.muted }}>complete</span>
      </div>
    </div>
  )
}
