import PanelBody from '@flowkit-core/layout/PanelBody'
import Sidebar from '@flowkit-core/layout/Sidebar'
import SidebarButton from '@flowkit-core/layout/SidebarButton'
import { SessionDb } from '@flowkit-features/flowTracer/sessionDb'
import type { SessionExport } from '@flowkit-features/flowTracer/types'
import SegmentedControl from '@flowkit-shared/components/ui/SegmentedControl'
import { useFlowLensMode } from '@flowkit-shared/contexts/FlowLensModeContext'
import {
  BarChart3,
  Filter,
  Flame,
  GitFork,
  LayoutDashboard,
  ListTree,
  Plus,
  Tag,
  X,
} from 'lucide-react'
import { useMemo, useState } from 'react'

import { buildPathGraph, computeSessionMetrics } from '../analyticsEngine'
import {
  exportEventsCsv,
  exportMarkdownSummary,
  exportMetricsCsv,
  exportSessionJson,
} from '../exportUtils'
import { FLOWLENS_ACCENT } from '../flowLensTheme'
import { replayFromSnapshot } from '../replayState'
import {
  EmptyHint,
  ExportMenu,
  MiniBarRow,
  QuickStat,
  QuickStatGrid,
  TabBody,
} from './analyticsPrimitives'
import type { FlowLensOverlay } from './FlowLensAnalyticsOverlays'
import TimelineView from './TimelineView'

type SessionTab = 'overview' | 'timeline' | 'paths' | 'funnel' | 'heatmap'

interface RailTab {
  id: SessionTab
  label: string
  icon: React.ElementType
}

const RAIL_TABS: RailTab[] = [
  { id: 'overview', label: 'Overview', icon: LayoutDashboard },
  { id: 'timeline', label: 'Timeline', icon: ListTree },
  { id: 'paths', label: 'Paths', icon: GitFork },
  { id: 'funnel', label: 'Funnel', icon: Filter },
  { id: 'heatmap', label: 'Heatmap', icon: Flame },
]

interface Props {
  selectedSession: SessionExport | null
  currentSequenceId: number
  tab: SessionTab
  setTab: (t: SessionTab) => void
  onSeek: (seq: number) => void
  onViewAll: (o: Exclude<FlowLensOverlay, null>) => void
  onOpenReports: () => void
  replayDisabledReason: string | null
  onSessionMetaChanged: (s: SessionExport) => void
  reportsSummary: { sessions: number; completionRate: number; avgQuality: number } | null
  /** Controlled open state — owned by FlowLensMode via usePanelLayout. */
  isOpen: boolean
  onOpenChange: (v: boolean) => void
}

function fmtDur(ms: number) {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return s % 60 ? `${m}m ${s % 60}s` : `${m}m`
}

export default function LensSideInspector(props: Props) {
  const { exit } = useFlowLensMode()
  const {
    selectedSession,
    currentSequenceId,
    tab,
    setTab,
    onSeek,
    onViewAll,
    onOpenReports,
    replayDisabledReason,
    onSessionMetaChanged,
    reportsSummary,
    isOpen,
    onOpenChange,
  } = props

  const hasCursor = (selectedSession?.cursorSamples?.length ?? 0) > 0
  const visibleTabs = RAIL_TABS.filter(t => t.id !== 'heatmap' || hasCursor)

  function activateTab(id: SessionTab) {
    if (tab === id && isOpen) {
      onOpenChange(false)
    } else {
      setTab(id)
      onOpenChange(true)
    }
  }

  return (
    <div className="flex flex-row h-full pointer-events-auto">
      {/* Content panel */}
      {isOpen && (
        <PanelBody
          side="right"
          className="flex-1"
          scrollable={false}
          toolbar={
            <div className="flex items-center gap-2 py-2.5 px-3">
              <span
                className="rounded-sm shrink-0 size-1.5"
                style={{ background: FLOWLENS_ACCENT }}
              />
              <span className="text-xs font-bold text-theme-text-primary flex-1">FlowLens</span>
              {selectedSession && (
                <ExportMenu
                  items={[
                    {
                      label: 'Session JSON (re-import)',
                      onClick: () => exportSessionJson(selectedSession),
                    },
                    { label: 'Events CSV', onClick: () => exportEventsCsv(selectedSession) },
                    { label: 'Metrics CSV', onClick: () => exportMetricsCsv([selectedSession]) },
                    {
                      label: 'Markdown summary',
                      onClick: () => exportMarkdownSummary([selectedSession]),
                    },
                  ]}
                />
              )}
              <button
                onClick={exit}
                aria-label="Exit FlowLens mode"
                className="flex items-center gap-1 text-ui-2xs font-semibold text-theme-text-secondary bg-transparent border border-theme-border rounded-md py-1 px-2 cursor-pointer"
              >
                <X size={12} /> Exit
              </button>
            </div>
          }
        >
          {selectedSession ? (
            <SessionContent
              session={selectedSession}
              currentSequenceId={currentSequenceId}
              tab={tab}
              setTab={setTab}
              onSeek={onSeek}
              onViewAll={onViewAll}
              replayDisabledReason={replayDisabledReason}
              onSessionMetaChanged={onSessionMetaChanged}
              visibleTabs={visibleTabs}
            />
          ) : (
            <ReportsQuick summary={reportsSummary} onOpenReports={onOpenReports} />
          )}
        </PanelBody>
      )}

      {/* Rail */}
      <Sidebar side="right" isOpen={isOpen} onToggle={() => onOpenChange(!isOpen)}>
        {visibleTabs.map(t => (
          <SidebarButton
            key={t.id}
            label={t.label}
            icon={t.icon}
            isActive={tab === t.id && isOpen}
            onClick={() => activateTab(t.id)}
            activeColor={FLOWLENS_ACCENT}
          />
        ))}
      </Sidebar>
    </div>
  )
}

// ─── No session: Reports quick view ──────────────────────────────────────────

function ReportsQuick({
  summary,
  onOpenReports,
}: {
  summary: Props['reportsSummary']
  onOpenReports: () => void
}) {
  return (
    <TabBody
      title="Reports"
      hint="Across all sessions in this workspace"
      onViewAll={onOpenReports}
      viewAllLabel="Open Reports"
    >
      {!summary ? (
        <EmptyHint label="Loading sessions…" />
      ) : summary.sessions === 0 ? (
        <EmptyHint label="No sessions yet" />
      ) : (
        <>
          <QuickStatGrid>
            <QuickStat label="Sessions" value={String(summary.sessions)} />
            <QuickStat
              label="Completion"
              value={`${Math.round(summary.completionRate * 100)}%`}
              accent
            />
            <QuickStat label="Avg quality" value={`${summary.avgQuality}%`} />
          </QuickStatGrid>
          <div className="text-ui-2xs text-theme-text-muted leading-relaxed">
            Open Reports to filter the cohort and see the combined funnel, merged heatmaps, and
            roll-up metrics.
          </div>
        </>
      )}
    </TabBody>
  )
}

// ─── Session selected: tabbed content ────────────────────────────────────────

function SessionContent({
  session,
  currentSequenceId,
  tab,
  setTab,
  onSeek,
  onViewAll,
  replayDisabledReason,
  onSessionMetaChanged,
  visibleTabs,
}: {
  session: SessionExport
  currentSequenceId: number
  tab: SessionTab
  setTab: (t: SessionTab) => void
  onSeek: (seq: number) => void
  onViewAll: (o: Exclude<FlowLensOverlay, null>) => void
  replayDisabledReason: string | null
  onSessionMetaChanged: (s: SessionExport) => void
  visibleTabs: RailTab[]
}) {
  const metrics = useMemo(() => computeSessionMetrics(session), [session])
  const pathNodes = useMemo(() => buildPathGraph(session.events), [session.events])
  const replayState = useMemo(
    () => replayFromSnapshot(session, currentSequenceId),
    [session, currentSequenceId]
  )
  const replayScreen = replayState.activePageId

  return (
    <>
      {/* Session title */}
      <div className="pt-2.5 px-3.5 shrink-0">
        <div className="text-xs font-semibold text-theme-text-primary truncate">
          {session.meta.name}
        </div>
        <div className="text-[10px] text-theme-text-disabled">
          {session.events.length} events · {session.cursorSamples?.length ?? 0} cursor samples
        </div>
        <TagEditor session={session} onSessionMetaChanged={onSessionMetaChanged} />
      </div>

      {replayDisabledReason && (
        <div className="mt-2 mx-3.5 flex gap-1.5 items-start p-2 bg-amber-500/10 rounded-md text-[10.5px] text-amber-500">
          <BarChart3 size={13} className="shrink-0 mt-0.5" />
          <span>{replayDisabledReason}</span>
        </div>
      )}

      {/* Sub-tab strip — only shown when there are multiple visible tabs */}
      {visibleTabs.length > 1 && (
        <div className="px-2 py-1.5 shrink-0 border-b border-theme-border bg-theme-elevated">
          <SegmentedControl value={tab} onChange={v => setTab(v as typeof tab)} activeColor="blue">
            {visibleTabs.map(t => (
              <SegmentedControl.Segment key={t.id} value={t.id} title={t.label} iconLeft>
                <SegmentedControl.Icon>
                  <t.icon size={11} />
                </SegmentedControl.Icon>
                <SegmentedControl.Label>{t.label}</SegmentedControl.Label>
              </SegmentedControl.Segment>
            ))}
          </SegmentedControl>
        </div>
      )}

      {/* Tab body */}
      <div className="flex-1 overflow-hidden">
        {tab === 'overview' && (
          <OverviewTab
            metrics={metrics}
            session={session}
            db={replayState.db}
            replayScreen={replayScreen}
            onViewAll={() => onViewAll('metrics')}
          />
        )}
        {tab === 'timeline' && (
          <TimelineView
            events={session.events}
            snapshots={session.snapshots}
            currentSequenceId={currentSequenceId}
            onSeek={onSeek}
          />
        )}
        {tab === 'paths' && <PathsTab pathNodes={pathNodes} onViewAll={() => onViewAll('paths')} />}
        {tab === 'funnel' && <FunnelTab metrics={metrics} onViewAll={() => onViewAll('funnel')} />}
        {tab === 'heatmap' && (
          <HeatmapTab
            pageId={replayScreen}
            count={session.cursorSamples?.filter(s => s.pageId === replayScreen).length ?? 0}
            onViewAll={() => onViewAll('heatmap')}
          />
        )}
      </div>
    </>
  )
}

function OverviewTab({
  metrics,
  session,
  db,
  replayScreen,
  onViewAll,
}: {
  metrics: ReturnType<typeof computeSessionMetrics>
  session: SessionExport
  db: Record<string, unknown>
  replayScreen: string
  onViewAll: () => void
}) {
  const topPages = [...metrics.pageMetrics].sort((a, b) => b.visitCount - a.visitCount).slice(0, 5)
  const maxVisit = Math.max(1, ...topPages.map(s => s.visitCount))
  const frustrated = metrics.pageMetrics.reduce((n, s) => n + s.frustratedClickCount, 0)
  const dbKeys = Object.keys(db ?? {})

  return (
    <TabBody
      title="Overview"
      hint="Session at a glance"
      onViewAll={onViewAll}
      viewAllLabel="All metrics"
    >
      <QuickStatGrid>
        <QuickStat label="Duration" value={fmtDur(metrics.totalDuration)} />
        <QuickStat label="Events" value={String(metrics.eventCount)} />
        <QuickStat label="Pages" value={String(metrics.uniquePagesVisited)} />
        <QuickStat label="Quality" value={`${metrics.qualityScore}%`} accent />
        <QuickStat label="Chapters done" value={String(metrics.chaptersCompleted.length)} />
        <QuickStat label="Frustrated" value={String(frustrated)} />
      </QuickStatGrid>

      {/* Live reconstructed db at the current scrub position (db state preview) */}
      {dbKeys.length > 0 && (
        <div>
          <div className="text-ui-2xs font-semibold text-theme-text-secondary mb-1.5 flex justify-between">
            <span>Database state</span>
            <span className="text-theme-text-disabled font-normal">@ {replayScreen || '—'}</span>
          </div>
          <div className="bg-theme-elevated border border-theme-border rounded-md py-1.5 px-2 max-h-35 overflow-y-auto font-mono text-[10px] leading-relaxed">
            {dbKeys.map(k => (
              <div key={k} className="flex gap-1.5 whitespace-nowrap">
                <span className="shrink-0" style={{ color: FLOWLENS_ACCENT }}>
                  {k}
                </span>
                <span className="text-theme-text-muted overflow-hidden text-ellipsis">
                  {JSON.stringify(db[k])}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div className="text-ui-2xs font-semibold text-theme-text-secondary mb-1.5">
          Most visited pages
        </div>
        {topPages.length === 0 ? (
          <EmptyHint label="No page visits" />
        ) : (
          <div className="flex flex-col gap-1.5">
            {topPages.map(s => (
              <MiniBarRow key={s.pageId} label={s.pageId} value={s.visitCount} max={maxVisit} />
            ))}
          </div>
        )}
      </div>
      {session.meta.remarks.length > 0 && (
        <div>
          <div className="text-ui-2xs font-semibold text-theme-text-secondary mb-1.5">Remarks</div>
          {session.meta.remarks.map((r, i) => (
            <div key={i} className="text-ui-2xs text-theme-text-muted py-0.5">
              • {r.text}
            </div>
          ))}
        </div>
      )}
    </TabBody>
  )
}

function PathsTab({
  pathNodes,
  onViewAll,
}: {
  pathNodes: ReturnType<typeof buildPathGraph>
  onViewAll: () => void
}) {
  const top = pathNodes.slice(0, 6)
  const maxCount = Math.max(1, ...top.map(n => n.count))
  return (
    <TabBody title="Paths" hint="Top screens by visit" onViewAll={onViewAll}>
      {top.length === 0 ? (
        <EmptyHint label="No navigation recorded" />
      ) : (
        <div className="flex flex-col gap-1.5">
          {top.map(n => (
            <MiniBarRow key={n.pageId} label={n.pageId} value={n.count} max={maxCount} />
          ))}
        </div>
      )}
    </TabBody>
  )
}

function FunnelTab({
  metrics,
  onViewAll,
}: {
  metrics: ReturnType<typeof computeSessionMetrics>
  onViewAll: () => void
}) {
  return (
    <TabBody title="Funnel" hint="Chapter completion" onViewAll={onViewAll}>
      {metrics.chapterMetrics.length === 0 ? (
        <EmptyHint label="No chapters entered" />
      ) : (
        <div className="flex flex-col gap-2">
          {metrics.chapterMetrics.map(f => (
            <div key={f.chapterId}>
              <div className="flex justify-between text-ui-2xs mb-1">
                <span className="text-theme-text-secondary">{f.chapterId}</span>
                <span
                  style={{
                    color:
                      f.completionRate >= 0.5
                        ? 'var(--color-accent-green)'
                        : 'var(--color-accent-amber)',
                  }}
                  className="font-bold"
                >
                  {Math.round(f.completionRate * 100)}%
                </span>
              </div>
              <div className="h-1.5 bg-theme-elevated rounded-sm overflow-hidden">
                <div
                  className="h-full rounded-sm"
                  style={{
                    width: `${f.completionRate * 100}%`,
                    background: FLOWLENS_ACCENT,
                  }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </TabBody>
  )
}

function HeatmapTab({
  pageId,
  count,
  onViewAll,
}: {
  pageId: string
  count: number
  onViewAll: () => void
}) {
  return (
    <TabBody title="Heatmap" hint={`Current screen · ${pageId || '—'}`} onViewAll={onViewAll}>
      <QuickStatGrid>
        <QuickStat label="Samples here" value={String(count)} accent />
      </QuickStatGrid>
      <div className="text-ui-2xs text-theme-text-muted leading-relaxed">
        Open the full heatmap to see cursor density over the recorded screen, with screen / heat
        toggles.
      </div>
    </TabBody>
  )
}

// ─── Tag editor (post-record) ────────────────────────────────────────────────

function TagEditor({
  session,
  onSessionMetaChanged,
}: {
  session: SessionExport
  onSessionMetaChanged: (s: SessionExport) => void
}) {
  const [adding, setAdding] = useState(false)
  const [draft, setDraft] = useState('')
  const tags = session.meta.tags ?? []

  async function commit(next: string[]) {
    const updated: SessionExport = { ...session, meta: { ...session.meta, tags: next } }
    await SessionDb.saveMeta(updated.meta)
    onSessionMetaChanged(updated)
  }
  const addTag = () => {
    const t = draft.trim()
    if (t && !tags.includes(t)) commit([...tags, t])
    setDraft('')
    setAdding(false)
  }

  return (
    <div className="flex items-center gap-1 flex-wrap mt-1.5">
      <Tag size={10} className="text-theme-text-disabled shrink-0" />
      {tags.map(t => (
        <span
          key={t}
          className="flex items-center gap-1 text-[10px] font-semibold py-0.5 px-1.5 rounded bg-theme-hover text-theme-text-secondary"
        >
          {t}
          <button
            onClick={() => commit(tags.filter(x => x !== t))}
            aria-label={`Remove tag ${t}`}
            className="bg-transparent border-none text-theme-text-disabled cursor-pointer p-0 leading-none text-ui-2xs"
          >
            ×
          </button>
        </span>
      ))}
      {adding ? (
        <input
          autoFocus
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter') addTag()
            if (e.key === 'Escape') {
              setDraft('')
              setAdding(false)
            }
          }}
          onBlur={addTag}
          placeholder="tag…"
          className="w-17.5 text-[10px] py-0.5 px-1 rounded border border-theme-border bg-theme-elevated text-theme-text-primary outline-none"
        />
      ) : (
        <button
          onClick={() => setAdding(true)}
          aria-label="Add tag"
          className="flex items-center gap-0.5 text-[10px] text-theme-text-muted bg-transparent border border-dashed border-theme-border rounded py-0.5 px-1 cursor-pointer"
        >
          <Plus size={9} /> tag
        </button>
      )}
    </div>
  )
}

export type { SessionTab }
