import type { CursorSample, SessionExport } from '@flowkit-features/flowTracer/types'

import { computeSessionMetrics } from '../../analyticsEngine'

// ── Combined funnel across N sessions ───────────────────────────────────────────

export interface CombinedFunnelStep {
  pageId: string
  /** Sessions that reached this step. */
  reached: number
  /** Sessions lost vs the previous step. */
  dropOff: number
  dropOffRate: number // 0–1
}

/**
 * Derive a canonical page order from the sessions (each screen ranked by the
 * average position at which it first appears), then count how many sessions
 * reached each step — a true multi-session funnel.
 */
export function combinedFunnel(sessions: SessionExport[]): CombinedFunnelStep[] {
  if (sessions.length === 0) return []

  // First-visit index per screen, averaged across sessions that visited it.
  const firstIdxSum: Record<string, number> = {}
  const firstIdxCount: Record<string, number> = {}
  const reachedCount: Record<string, number> = {}

  for (const s of sessions) {
    const order: string[] = []
    const seen = new Set<string>()
    for (const e of s.events) {
      if (e.type !== 'page.visited') continue
      const sid = e.payload.pageId as string
      if (!sid || seen.has(sid)) continue
      seen.add(sid)
      order.push(sid)
    }
    order.forEach((sid, i) => {
      firstIdxSum[sid] = (firstIdxSum[sid] ?? 0) + i
      firstIdxCount[sid] = (firstIdxCount[sid] ?? 0) + 1
    })
    seen.forEach(sid => {
      reachedCount[sid] = (reachedCount[sid] ?? 0) + 1
    })
  }

  const pageOrder = Object.keys(firstIdxCount).sort((a, b) => {
    const avgA = firstIdxSum[a] / firstIdxCount[a]
    const avgB = firstIdxSum[b] / firstIdxCount[b]
    return avgA - avgB
  })

  const steps: CombinedFunnelStep[] = []
  let prev = sessions.length
  for (const sid of pageOrder) {
    const reached = reachedCount[sid] ?? 0
    const dropOff = Math.max(0, prev - reached)
    steps.push({ pageId: sid, reached, dropOff, dropOffRate: prev > 0 ? dropOff / prev : 0 })
    prev = reached
  }
  return steps
}

// ── Merged per-screen cursor samples ────────────────────────────────────────────

export interface MergedHeatmap {
  pageId: string
  samples: CursorSample[]
  sessionCount: number
}

/** Pool all cursor samples by screen across sessions, for a combined heatmap. */
export function mergedHeatmaps(sessions: SessionExport[]): MergedHeatmap[] {
  const byScreen: Record<string, CursorSample[]> = {}
  const sessionsByScreen: Record<string, Set<string>> = {}

  for (const s of sessions) {
    for (const sample of s.cursorSamples ?? []) {
      ;(byScreen[sample.pageId] ??= []).push(sample)
      ;(sessionsByScreen[sample.pageId] ??= new Set()).add(s.meta.id)
    }
  }

  return Object.entries(byScreen)
    .map(([pageId, samples]) => ({
      pageId,
      samples,
      sessionCount: sessionsByScreen[pageId].size,
    }))
    .sort((a, b) => b.samples.length - a.samples.length)
}

// ── Roll-up metrics ─────────────────────────────────────────────────────────────

export interface RollupMetrics {
  sessionCount: number
  totalEvents: number
  avgDurationMs: number
  avgQuality: number
  completionRate: number // sessions with a flow.completed / total
  frustrationRate: number // frustrated clicks per session
  avgPagesPerSession: number
  topFrustratedPages: Array<{ pageId: string; count: number }>
  pagePopularity: Array<{ pageId: string; visits: number; avgDwellMs: number }>
}

export function rollup(sessions: SessionExport[]): RollupMetrics {
  const n = sessions.length
  if (n === 0) {
    return {
      sessionCount: 0,
      totalEvents: 0,
      avgDurationMs: 0,
      avgQuality: 0,
      completionRate: 0,
      frustrationRate: 0,
      avgPagesPerSession: 0,
      topFrustratedPages: [],
      pagePopularity: [],
    }
  }

  let totalEvents = 0,
    totalDuration = 0,
    totalQuality = 0,
    completed = 0
  let totalFrustrated = 0,
    totalScreens = 0
  const frustratedByScreen: Record<string, number> = {}
  const visitsByScreen: Record<string, number> = {}
  const dwellByScreen: Record<string, number[]> = {}

  for (const s of sessions) {
    const m = computeSessionMetrics(s)
    totalEvents += m.eventCount
    totalDuration += m.totalDuration
    totalQuality += m.qualityScore
    totalScreens += m.uniquePagesVisited
    if (m.chaptersCompleted.length > 0) completed += 1
    for (const sm of m.pageMetrics) {
      totalFrustrated += sm.frustratedClickCount
      if (sm.frustratedClickCount > 0)
        frustratedByScreen[sm.pageId] =
          (frustratedByScreen[sm.pageId] ?? 0) + sm.frustratedClickCount
      visitsByScreen[sm.pageId] = (visitsByScreen[sm.pageId] ?? 0) + sm.visitCount
      if (sm.avgDwellMs > 0) (dwellByScreen[sm.pageId] ??= []).push(sm.avgDwellMs)
    }
  }

  return {
    sessionCount: n,
    totalEvents,
    avgDurationMs: Math.round(totalDuration / n),
    avgQuality: Math.round(totalQuality / n),
    completionRate: completed / n,
    frustrationRate: totalFrustrated / n,
    avgPagesPerSession: Math.round((totalScreens / n) * 10) / 10,
    topFrustratedPages: Object.entries(frustratedByScreen)
      .map(([pageId, count]) => ({ pageId, count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 10),
    pagePopularity: Object.entries(visitsByScreen)
      .map(([pageId, visits]) => ({
        pageId,
        visits,
        avgDwellMs: dwellByScreen[pageId]?.length
          ? Math.round(
              dwellByScreen[pageId].reduce((a, b) => a + b, 0) / dwellByScreen[pageId].length
            )
          : 0,
      }))
      .sort((a, b) => b.visits - a.visits),
  }
}
