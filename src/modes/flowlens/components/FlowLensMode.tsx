import type { PageView } from '@flowkit/types/index'
import type { PanelDragHandle } from '@flowkit-core/layout/hooks/usePanelDrag'
import PanelFrame from '@flowkit-core/layout/PanelFrame'
import { useFlowLensPanelShortcuts } from '@flowkit-core/shortcuts/useKeyboardShortcuts'
import type { SessionExport } from '@flowkit-features/flowTracer/types'
import WorkspaceSwitcherBar from '@flowkit-shared/components/WorkspaceSwitcherBar'
import { useActiveWorkspace } from '@flowkit-shared/contexts/ActiveWorkspaceContext'
import { useFlowLensMode } from '@flowkit-shared/contexts/FlowLensModeContext'
import { useCallback, useEffect, useMemo, useState } from 'react'

import { FLOWLENS_ACCENT } from '../flowLensTheme'
import { replayFromSnapshot } from '../replayState'
import { type LibraryEntry, useSessionLibrary } from '../useSessionLibrary'
import CursorGhost from './CursorGhost'
import FlowLensAnalyticsOverlays, { type FlowLensOverlay } from './FlowLensAnalyticsOverlays'
import LensSideExplorer from './LensSideExplorer'
import LensSideInspector, { type SessionTab } from './LensSideInspector'
import PlaybackBar from './PlaybackBar'
import ReplayController from './ReplayController'
import ReportsOverlay from './reports/ReportsOverlay'

interface Props {
  views: PageView[]
  effectiveLeftW: number
  effectiveRightW: number
  leftOpen: boolean
  rightOpen: boolean
  setLeftOpen: (v: boolean) => void
  setRightOpen: (v: boolean) => void
  leftHandle: PanelDragHandle
  rightHandle: PanelDragHandle
}

/**
 * Lazy default export — the entire FlowLens mode UI: sessions list (left),
 * the live canvas (middle), tabbed session info (right), playback (bottom).
 * Drives the SHARED DashboardContext via ReplayController so replay reuses the
 * real screens. Space-hungry analytics open full-screen from each tab's "View all".
 */
export default function FlowLensMode({
  views,
  effectiveLeftW,
  effectiveRightW,
  leftOpen,
  rightOpen,
  setLeftOpen,
  setRightOpen,
  leftHandle,
  rightHandle,
}: Props) {
  const { selectedSession, selectSession, pendingSessionId, consumePendingSessionId } =
    useFlowLensMode()
  const activeWorkspaceForLib = useActiveWorkspace()
  const { entries, loading, reload } = useSessionLibrary(activeWorkspaceForLib)

  const [currentSequenceId, setCurrentSequenceId] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speed, setSpeed] = useState(1)
  const [overlay, setOverlay] = useState<FlowLensOverlay>(null)
  const [reportsOpen, setReportsOpen] = useState(false)
  const [tab, setTab] = useState<SessionTab>('overview')

  useFlowLensPanelShortcuts({
    tab,
    setTab: t => setTab(t as SessionTab),
    setOpen: setRightOpen,
    hasCursorSamples: (selectedSession?.cursorSamples?.length ?? 0) > 0,
  })

  const [reportsSummary, setReportsSummary] = useState<{
    sessions: number
    completionRate: number
    avgQuality: number
  } | null>(null)

  // ── Pre-select a session from a SessionCard ("Replay in FlowLens") ───────────
  useEffect(() => {
    if (!pendingSessionId) return
    const entry = entries.find(e => e.meta.id === pendingSessionId)
    if (!entry) return // not loaded yet
    consumePendingSessionId()
    let cancelled = false
    entry
      .load()
      .then(s => {
        if (!cancelled) {
          setCurrentSequenceId(s.events[0]?.sequenceId ?? 0)
          selectSession(s)
          setTab('overview')
        }
      })
      .catch(err => {
        console.error('Failed to load pending session in FlowLens:', err)
      })
    return () => {
      cancelled = true
    }
  }, [entries, pendingSessionId, consumePendingSessionId, selectSession])

  // ── Lightweight reports summary for the right panel (no session selected) ────
  useEffect(() => {
    if (selectedSession) return // only needed for the reports quick view
    let cancelled = false
    Promise.all(entries.map(e => e.load()))
      .then(sessions => {
        if (cancelled) return
        const n = sessions.length
        const done = sessions.filter(s => s.events.some(e => e.type === 'chapter.completed')).length
        const avgQ = n
          ? Math.round(sessions.reduce((sum, s) => sum + s.meta.qualityScore, 0) / n)
          : 0
        setReportsSummary({ sessions: n, completionRate: n ? done / n : 0, avgQuality: avgQ })
      })
      .catch(err => {
        console.error('Failed to load reports summary sessions:', err)
      })
    return () => {
      cancelled = true
    }
  }, [entries, selectedSession])

  const handleSelect = useCallback(
    async (entry: LibraryEntry) => {
      try {
        const session = await entry.load()
        setCurrentSequenceId(session.events[0]?.sequenceId ?? 0)
        setIsPlaying(false)
        setOverlay(null)
        setTab('overview')
        selectSession(session)
      } catch (err) {
        console.error('Failed to select session in FlowLens:', err)
      }
    },
    [selectSession]
  )

  // Tag edits etc. — update the in-memory selected session + refresh the list.
  const handleSessionMetaChanged = useCallback(
    (s: SessionExport) => {
      selectSession(s)
      reload()
    },
    [selectSession, reload]
  )

  const seek = useCallback((seq: number) => {
    setIsPlaying(false)
    setCurrentSequenceId(seq)
  }, [])
  const advance = useCallback((seq: number) => {
    setCurrentSequenceId(seq)
  }, [])

  // ── Cross-workspace validation ───────────────────────────────────────────────
  const validPageIds = useMemo(() => new Set(views.map(v => v.id)), [views])
  const replayDisabledReason = useMemo(() => {
    if (!selectedSession) return null
    const pageIds = selectedSession.events
      .map(e => (e.payload.pageId ?? e.payload.to) as string | undefined)
      .filter((x): x is string => typeof x === 'string')
    if (pageIds.length === 0) return null
    const known = pageIds.filter(id => validPageIds.has(id))
    if (known.length === 0)
      return 'Recorded against a different workspace — replay is disabled, but analytics are available.'
    return null
  }, [selectedSession, validPageIds])

  const replayEnabled = !!selectedSession && !replayDisabledReason
  const activePageId = useMemo(
    () =>
      selectedSession ? replayFromSnapshot(selectedSession, currentSequenceId).activePageId : '',
    [selectedSession, currentSequenceId]
  )
  const hasCursor = (selectedSession?.cursorSamples?.length ?? 0) > 0

  return (
    <>
      {/* Drive the shared DashboardContext (only when replay is valid). */}
      {replayEnabled && (
        <ReplayController
          key={selectedSession!.meta.id}
          session={selectedSession!}
          currentSequenceId={currentSequenceId}
        />
      )}
      {replayEnabled && hasCursor && (
        <CursorGhost
          session={selectedSession!}
          currentSequenceId={currentSequenceId}
          activePageId={activePageId}
          accent={FLOWLENS_ACCENT}
        />
      )}

      {/* ── Left panel: rail + sessions list ── */}
      <PanelFrame
        side="left"
        width={effectiveLeftW}
        handle={leftHandle}
        isOpen={leftOpen}
        accentColor={FLOWLENS_ACCENT}
        className="z-30 shadow-theme-float pointer-events-auto"
      >
        <div className="flex flex-1 min-h-0">
          <LensSideExplorer
            entries={entries}
            loading={loading}
            selectedId={selectedSession?.meta.id ?? null}
            onSelect={handleSelect}
            onImported={reload}
            onSaved={reload}
            isOpen={leftOpen}
            onOpenChange={setLeftOpen}
          />
        </div>
        <WorkspaceSwitcherBar panelOpen={leftOpen} />
      </PanelFrame>

      {/* ── Right panel: rail + tabbed session info / reports ── */}
      <PanelFrame
        side="right"
        width={effectiveRightW}
        handle={rightHandle}
        accentColor={FLOWLENS_ACCENT}
        className="z-30 shadow-theme-float pointer-events-auto"
      >
        <LensSideInspector
          selectedSession={selectedSession}
          currentSequenceId={currentSequenceId}
          tab={tab}
          setTab={setTab}
          onSeek={seek}
          onViewAll={(o: Exclude<typeof overlay, null>) => setOverlay(o)}
          onOpenReports={() => setReportsOpen(true)}
          replayDisabledReason={replayDisabledReason}
          onSessionMetaChanged={handleSessionMetaChanged}
          reportsSummary={reportsSummary}
          isOpen={rightOpen}
          onOpenChange={setRightOpen}
        />
      </PanelFrame>

      {/* ── Playback bar (between the panels, only when replay drives the canvas) ── */}
      {replayEnabled && (
        <div
          className="absolute bottom-19 z-25 pointer-events-auto"
          style={{
            left: effectiveLeftW,
            right: effectiveRightW,
          }}
        >
          <PlaybackBar
            session={selectedSession!}
            currentSequenceId={currentSequenceId}
            onSeek={seek}
            onAdvance={advance}
            isPlaying={isPlaying}
            setIsPlaying={setIsPlaying}
            speed={speed}
            setSpeed={setSpeed}
          />
        </div>
      )}

      {/* ── Full-screen overlays (opened via "View all") ── */}
      {selectedSession && (
        <FlowLensAnalyticsOverlays
          session={selectedSession}
          views={views}
          overlay={overlay}
          currentSequenceId={currentSequenceId}
          onClose={() => setOverlay(null)}
          onSeek={seek}
        />
      )}
      {reportsOpen && (
        <ReportsOverlay entries={entries} views={views} onClose={() => setReportsOpen(false)} />
      )}
    </>
  )
}
