import { SessionDb } from '@flowkit-features/flowTracer/sessionDb'
import type { SessionEvent, SessionMeta, SessionRemark } from '@flowkit-features/flowTracer/types'
import { ArrowLeft, Check, Pencil, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

interface Props {
  sessionId: string
  onBack: () => void
}

type CategoryFilter =
  'all' | 'chapter' | 'interaction' | 'navigation' | 'state' | 'simulator' | 'session'

const CATEGORY_COLORS: Record<string, string> = {
  flow: '#22c55e',
  page: '#22c55e',
  interaction: '#3b82f6',
  navigation: '#a855f7',
  state: '#f59e0b',
  simulator: '#71717a',
  session: '#06b6d4',
  panel: '#64748b',
  sidebar: '#64748b',
}

function eventCategory(type: string): string {
  return type.split('.')[0]
}

function eventColor(type: string): string {
  if (type === 'session.error') return '#ef4444'
  return CATEGORY_COLORS[eventCategory(type)] ?? '#71717a'
}

function formatMs(ms: number) {
  return `${(ms / 1000).toFixed(1)}s`
}

function formatDuration(ms: number) {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  const r = s % 60
  return r > 0 ? `${m}m ${r}s` : `${m}m`
}

export default function SessionInspect({ sessionId, onBack }: Props) {
  const [meta, setMeta] = useState<SessionMeta | null>(null)
  const [events, setEvents] = useState<SessionEvent[]>([])
  const [loading, setLoading] = useState(true)

  const [editingName, setEditingName] = useState(false)
  const [draftName, setDraftName] = useState('')
  const [remarkInput, setRemarkInput] = useState('')
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all')
  const nameInputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    let mounted = true
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLoading(true)
    Promise.all([SessionDb.getMeta(sessionId), SessionDb.getEvents(sessionId)]).then(([m, ev]) => {
      if (!mounted) return
      setMeta(m ?? null)
      setEvents(ev)
      if (m) setDraftName(m.name)
      setLoading(false)
    })
    return () => {
      mounted = false
    }
  }, [sessionId])

  const saveName = async () => {
    if (!meta || !draftName.trim()) return
    const updated = { ...meta, name: draftName.trim() }
    await SessionDb.saveMeta(updated)
    setMeta(updated)
    setEditingName(false)
  }

  const addRemark = async () => {
    if (!meta || !remarkInput.trim()) return
    const remark: SessionRemark = { text: remarkInput.trim(), timestamp: Date.now() }
    const updated = { ...meta, remarks: [...meta.remarks, remark] }
    await SessionDb.saveMeta(updated)
    setMeta(updated)
    setRemarkInput('')
  }

  if (loading || !meta) {
    return (
      <div className="flex items-center justify-center p-8">
        <span className="text-ui-xs text-theme-text-muted">Loading…</span>
      </div>
    )
  }

  const duration = meta.endTime ? meta.endTime - meta.startTime : null
  const pageVisits = events.filter(e => e.type === 'page.visited')
  const flowEntries = events.filter(e => e.type === 'chapter.entered')
  const firstTs = events[0]?.timestamp ?? 0

  const pagePath: { id: string; dwell: number | null }[] = []
  for (let i = 0; i < pageVisits.length; i++) {
    const id = (pageVisits[i].payload.pageId ?? pageVisits[i].payload.viewId ?? 'unknown') as string
    const next = pageVisits[i + 1]
    const dwell = next ? next.timestamp - pageVisits[i].timestamp : null
    pagePath.push({ id, dwell })
  }

  const CATEGORIES: CategoryFilter[] = [
    'all',
    'chapter',
    'interaction',
    'navigation',
    'state',
    'simulator',
    'session',
  ]
  const filteredEvents =
    categoryFilter === 'all' ? events : events.filter(e => eventCategory(e.type) === categoryFilter)

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Back header */}
      <div className="flex items-center gap-2 px-3 py-2 border-b border-theme-border shrink-0">
        <button
          onClick={onBack}
          className="bg-transparent border-none text-theme-text-muted cursor-pointer flex items-center gap-1 px-1 py-0.5"
        >
          <ArrowLeft size={13} />
          <span className="text-ui-xs">Sessions</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {/* Name */}
        <div className="mb-3">
          {editingName ? (
            <div className="flex items-center gap-1.5">
              <input
                ref={nameInputRef}
                autoFocus
                value={draftName}
                onChange={e => setDraftName(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter') saveName()
                  if (e.key === 'Escape') setEditingName(false)
                }}
                className="flex-1 bg-theme-elevated border border-theme-blue rounded-md text-theme-text-primary text-ui-sm font-semibold px-2 py-1 outline-none"
              />
              <button
                onClick={saveName}
                className="bg-transparent border-none text-theme-green cursor-pointer"
              >
                <Check size={13} />
              </button>
              <button
                onClick={() => setEditingName(false)}
                className="bg-transparent border-none text-theme-text-muted cursor-pointer"
              >
                <X size={13} />
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              <span className="text-ui-sm font-bold text-theme-text-primary flex-1">
                {meta.name}
              </span>
              <button
                onClick={() => setEditingName(true)}
                className="bg-transparent border-none text-theme-text-muted cursor-pointer p-0.5"
              >
                <Pencil size={11} />
              </button>
            </div>
          )}
        </div>

        {/* Stats */}
        <div className="flex gap-2 flex-wrap mb-4">
          {[
            { label: 'Duration', value: duration ? formatDuration(duration) : '—' },
            { label: 'Events', value: String(events.length) },
            { label: 'Pages', value: String(pageVisits.length) },
            { label: 'Flows', value: String(flowEntries.length) },
            { label: 'Quality', value: `${meta.qualityScore}%` },
          ].map(({ label, value }) => (
            <div
              key={label}
              className="bg-theme-elevated border border-theme-border rounded-md px-2 py-1 flex flex-col gap-0.5"
            >
              <span className="text-ui-2xs text-theme-text-muted">{label}</span>
              <span className="text-ui-xs font-bold text-theme-text-primary">{value}</span>
            </div>
          ))}
        </div>

        {/* Page path */}
        {pagePath.length > 0 && (
          <Section title="Page path">
            <div className="flex flex-col gap-0.5">
              {pagePath.map(({ id, dwell }, i) => (
                <div
                  key={i}
                  className="flex items-center gap-2 px-2 py-1 bg-theme-elevated rounded"
                >
                  <span className="text-ui-xs text-theme-text-muted min-w-4.5">{i + 1}</span>
                  <span className="text-ui-xs text-theme-text-secondary flex-1 truncate">{id}</span>
                  {dwell !== null && (
                    <span className="text-ui-xs text-theme-text-muted">{formatMs(dwell)}</span>
                  )}
                </div>
              ))}
            </div>
          </Section>
        )}

        {/* Event timeline */}
        <Section title="Event timeline">
          <div className="flex gap-1 flex-wrap mb-2">
            {CATEGORIES.map(cat => (
              <button
                key={cat}
                onClick={() => setCategoryFilter(cat)}
                className={[
                  'px-1.5 py-px rounded-full border-none cursor-pointer text-ui-2xs font-semibold',
                  categoryFilter === cat
                    ? 'bg-theme-blue text-white'
                    : 'bg-theme-elevated text-theme-text-muted',
                ].join(' ')}
              >
                {cat}
              </button>
            ))}
          </div>
          <div className="flex flex-col gap-px max-h-70 overflow-y-auto">
            {filteredEvents.map(ev => (
              <div key={ev.id} className="flex items-center gap-2 px-1.5 py-0.5 rounded">
                <div
                  className="rounded-full shrink-0 size-1.5"
                  style={{ background: eventColor(ev.type) }}
                />
                <span className="text-ui-xs text-theme-text-secondary flex-1">{ev.type}</span>
                <span className="text-ui-2xs text-theme-text-muted shrink-0">
                  {formatMs(ev.timestamp - firstTs)}
                </span>
              </div>
            ))}
            {filteredEvents.length === 0 && (
              <span className="text-ui-xs text-theme-text-muted px-1.5 py-2">
                No events in this category
              </span>
            )}
          </div>
        </Section>

        {/* Remarks */}
        <Section title="Remarks">
          {meta.remarks.length === 0 ? (
            <span className="text-ui-xs text-theme-text-muted">No remarks recorded</span>
          ) : (
            <div className="flex flex-col gap-1 mb-2">
              {meta.remarks.map((r, i) => (
                <div key={i} className="flex gap-2 px-2 py-1.5 bg-theme-elevated rounded">
                  <span className="text-ui-xs text-theme-text-secondary flex-1">{r.text}</span>
                  <span className="text-ui-2xs text-theme-text-muted shrink-0">
                    {formatMs(Math.max(0, r.timestamp - meta.startTime))}
                  </span>
                </div>
              ))}
            </div>
          )}
          <div className="flex gap-1.5">
            <input
              value={remarkInput}
              onChange={e => setRemarkInput(e.target.value)}
              onKeyDown={e => {
                if (e.key === 'Enter') addRemark()
              }}
              placeholder="Add a remark…"
              className="flex-1 bg-theme-elevated border border-theme-border rounded-md text-theme-text-primary text-ui-xs px-2 py-1 outline-none"
            />
            <button
              onClick={addRemark}
              disabled={!remarkInput.trim()}
              className="px-2.5 py-1 rounded-md bg-theme-blue border-none text-white text-ui-xs cursor-pointer disabled:opacity-40"
            >
              Add
            </button>
          </div>
        </Section>
      </div>

      {/* Footer */}
      <div className="shrink-0 px-3 py-2 border-t border-theme-border flex justify-end">
        <button
          onClick={onBack}
          className="px-3.5 py-1 rounded-md bg-theme-elevated border border-theme-border text-theme-text-secondary text-ui-xs cursor-pointer"
        >
          ← Back
        </button>
      </div>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <span className="block text-ui-xs font-bold tracking-[0.06em] uppercase text-theme-text-muted mb-1.5">
        {title}
      </span>
      {children}
    </div>
  )
}
