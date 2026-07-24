import type { SessionEvent, SessionSnapshot } from '@flowkit-features/flowTracer/types'
import { useEffect, useMemo, useRef, useState } from 'react'

import { FLOWLENS_ACCENT } from '../flowLensTheme'

interface Props {
  events: SessionEvent[]
  snapshots: SessionSnapshot[]
  currentSequenceId: number
  onSeek: (sequenceId: number) => void
}

const EVENT_COLORS: Record<string, string> = {
  'session.start': '#3b82f6',
  'session.stop': '#3b82f6',
  'session.remark': '#f59e0b',
  'chapter.entered': '#22c55e',
  'chapter.completed': '#22c55e',
  'chapter.blocked': '#ef4444',
  'chapter.transition': '#ef4444',
  'page.visited': '#8b5cf6',
  'interaction.tap': '#06b6d4',
  'interaction.double-tap': '#06b6d4',
  'interaction.frustrated-click': '#ef4444',
  'interaction.effect': '#10b981',
  'navigation.sidebar-click': '#a78bfa',
  'navigation.back': '#a78bfa',
  'navigation.auto-advance': '#60a5fa',
  'state.db-patch': '#f97316',
  'state.db-reset': '#f97316',
  'simulator.device-changed': '#6b7280',
  'simulator.orientation-toggled': '#6b7280',
  'panel.opened': '#71717a',
  'panel.closed': '#71717a',
  'panel.tab-changed': '#71717a',
}

function eventColor(type: string): string {
  return EVENT_COLORS[type] ?? '#52525b'
}

export default function TimelineView({ events, snapshots, currentSequenceId, onSeek }: Props) {
  const [filter, setFilter] = useState('')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const currentRef = useRef<HTMLDivElement>(null)

  const serializedPayloads = useMemo(() => events.map(e => JSON.stringify(e.payload)), [events])

  const filtered = useMemo(
    () =>
      filter
        ? events.filter((e, i) => e.type.includes(filter) || serializedPayloads[i].includes(filter))
        : events,
    [events, filter, serializedPayloads]
  )

  useEffect(() => {
    currentRef.current?.scrollIntoView({ block: 'nearest' })
  }, [currentSequenceId])

  // Group events by category prefix
  const categories = [
    'session',
    'chapter',
    'page',
    'interaction',
    'navigation',
    'state',
    'simulator',
    'panel',
    'sidebar',
  ]

  function toggleCategory(cat: string) {
    setCollapsed(prev => {
      const next = new Set(prev)
      if (next.has(cat)) next.delete(cat)
      else next.add(cat)
      return next
    })
  }

  const grouped: Record<string, SessionEvent[]> = {}
  for (const cat of categories) grouped[cat] = []
  for (const ev of filtered) {
    const cat = ev.type.split('.')[0]
    if (grouped[cat]) grouped[cat].push(ev)
    else {
      grouped['other'] = grouped['other'] ?? []
      grouped['other'].push(ev)
    }
  }

  const snapshotSeqs = new Set(snapshots.map(s => s.sequenceId))

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Filter bar */}
      <div className="py-2 px-3 border-b border-theme-border shrink-0">
        <input
          value={filter}
          onChange={e => setFilter(e.target.value)}
          placeholder="Filter events…"
          className="w-full bg-theme-elevated border border-theme-border rounded-md py-1.25 px-2 text-ui-2xs text-theme-text-primary outline-none"
        />
      </div>

      {/* Event list */}
      <div className="flex-1 overflow-y-auto py-1">
        {categories.map(cat => {
          const catEvents = grouped[cat] ?? []
          if (catEvents.length === 0) return null
          const isCollapsed = collapsed.has(cat)
          return (
            <div key={cat}>
              {/* Category header */}
              <button
                onClick={() => toggleCategory(cat)}
                className="w-full bg-transparent border-none flex items-center gap-1.5 py-1 px-3 cursor-pointer text-theme-text-muted text-[10px] font-semibold uppercase tracking-wider"
              >
                <span
                  className="transition-transform duration-150"
                  style={{
                    transform: isCollapsed ? 'rotate(-90deg)' : 'none',
                  }}
                >
                  ▾
                </span>
                {cat}
                <span className="text-theme-text-disabled font-normal">({catEvents.length})</span>
              </button>

              {!isCollapsed &&
                catEvents.map(ev => {
                  const isCurrent = ev.sequenceId === currentSequenceId
                  const hasSnapshot = snapshotSeqs.has(ev.sequenceId)
                  return (
                    <div
                      key={ev.id}
                      ref={isCurrent ? currentRef : undefined}
                      onClick={() => onSeek(ev.sequenceId)}
                      style={{
                        background: isCurrent ? 'rgba(139,92,246,0.1)' : undefined,
                        borderLeftColor: isCurrent ? FLOWLENS_ACCENT : 'transparent',
                      }}
                      className={`py-1 pr-3 pl-5 flex items-start gap-2 cursor-pointer border-l-2 transition-colors duration-100 ${
                        isCurrent ? '' : 'bg-transparent hover:bg-theme-hover'
                      }`}
                    >
                      {/* Color dot */}
                      <div
                        className="rounded-full shrink-0 mt-1 size-1.5"
                        style={{
                          background: eventColor(ev.type),
                        }}
                      />

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span
                            className={`text-ui-2xs text-theme-text-primary ${
                              isCurrent ? 'font-medium' : 'font-normal'
                            }`}
                          >
                            {ev.type}
                          </span>
                          {hasSnapshot && (
                            <span
                              style={{
                                background: FLOWLENS_ACCENT + '20',
                                color: FLOWLENS_ACCENT,
                              }}
                              className="text-[9px] py-px px-1 rounded-[3px]"
                            >
                              snap
                            </span>
                          )}
                          <span className="ml-auto text-[10px] text-theme-text-disabled shrink-0">
                            #{ev.sequenceId}
                          </span>
                        </div>

                        {Object.keys(ev.payload).length > 0 && (
                          <div className="text-[10px] text-theme-text-muted mt-px truncate">
                            {Object.entries(ev.payload)
                              .slice(0, 3)
                              .map(([k, v]) => `${k}: ${String(v)}`)
                              .join(' · ')}
                          </div>
                        )}
                      </div>
                    </div>
                  )
                })}
            </div>
          )
        })}
      </div>
    </div>
  )
}
