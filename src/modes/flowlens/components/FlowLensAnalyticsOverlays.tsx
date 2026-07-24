import type { PageView } from '@flowkit/types/index'
import type { SessionExport } from '@flowkit-features/flowTracer/types'
import { useMemo } from 'react'

import { buildPathGraph, computeSessionMetrics } from '../analyticsEngine'
import { replayFromSnapshot } from '../replayState'
import AnalyticsOverlay from './AnalyticsOverlay'
import FunnelView from './FunnelView'
import HeatmapView from './HeatmapView'
import MetricsView from './MetricsView'
import PathsView from './PathsView'

export type FlowLensOverlay = 'metrics' | 'paths' | 'funnel' | 'heatmap' | null

interface Props {
  session: SessionExport
  views: PageView[]
  overlay: FlowLensOverlay
  currentSequenceId: number
  onClose: () => void
  onSeek: (seq: number) => void
}

/**
 * Single-session analytics shown as full-screen overlays above the canvas.
 * (Multi-session Reports land in Phase 3.)
 */
export default function FlowLensAnalyticsOverlays({
  session,
  views,
  overlay,
  currentSequenceId,
  onClose,
  onSeek,
}: Props) {
  const metrics = useMemo(() => computeSessionMetrics(session), [session])
  const pathNodes = useMemo(() => buildPathGraph(session.events), [session.events])
  const replayScreen = replayFromSnapshot(session, currentSequenceId).activePageId

  if (!overlay) return null

  if (overlay === 'metrics') {
    return (
      <AnalyticsOverlay title="Session metrics" subtitle={session.meta.name} onClose={onClose}>
        <MetricsView metrics={metrics} />
      </AnalyticsOverlay>
    )
  }

  if (overlay === 'paths') {
    return (
      <AnalyticsOverlay title="Path explorer" subtitle="Screen-to-screen flow" onClose={onClose}>
        <PathsView
          nodes={pathNodes}
          onScreenClick={sid => {
            const ev = session.events.find(
              e => e.type === 'page.visited' && e.payload.pageId === sid
            )
            if (ev) {
              onSeek(ev.sequenceId)
              onClose()
            }
          }}
        />
      </AnalyticsOverlay>
    )
  }

  if (overlay === 'funnel') {
    return (
      <AnalyticsOverlay title="Funnel" subtitle="Drop-off by step" onClose={onClose}>
        <FunnelView session={session} />
      </AnalyticsOverlay>
    )
  }

  // heatmap
  if (!session.cursorSamples?.length) return null
  const heatScreen = replayScreen ?? session.meta.id
  return (
    <AnalyticsOverlay title="Cursor heatmap" subtitle={heatScreen} onClose={onClose}>
      <HeatmapView
        views={views}
        pageId={heatScreen}
        samples={session.cursorSamples}
        width={session.meta.capturedScreenW}
        height={session.meta.capturedScreenH}
      />
    </AnalyticsOverlay>
  )
}
