import {
  type ChapterMetrics,
  computeSessionMetrics,
  type PageMetrics,
  type SessionMetrics,
} from '@flowkit-features/flowTracer/sessionMetrics'
import type { SessionEvent, SessionExport, SessionMeta } from '@flowkit-features/flowTracer/types'

// Re-export for backward compat of other files within this module.
export type { ChapterMetrics, PageMetrics, SessionMetrics }
export { computeSessionMetrics }

export interface FunnelStep {
  pageId: string
  reachedCount: number
  dropOffCount: number
  dropOffRate: number // 0–1
}

export interface PathNode {
  pageId: string
  count: number
  nextPages: Record<string, number> // pageId → transition count
}

// ─── Multi-session aggregation ────────────────────────────────────────────────

export interface AggregateMetrics {
  sessionCount: number
  totalEvents: number
  pagePopularity: Array<{ pageId: string; totalVisits: number; avgDwell: number }>
  chapterCompletionRates: Array<{ chapterId: string; rate: number; sessions: number }>
  topFrustratedPages: Array<{ pageId: string; count: number }>
}

export function aggregateSessions(
  sessions: SessionExport[],
  excludeTestMode = true
): AggregateMetrics {
  const filtered = excludeTestMode ? sessions.filter(s => !s.meta.isTestMode) : sessions

  const pageVisits: Record<string, number> = {}
  const pageDwells: Record<string, number[]> = {}
  const pageFrustrated: Record<string, number> = {}
  const chapterEntries: Record<string, number> = {}
  const chapterCompletions: Record<string, number> = {}
  const chapterSessions: Record<string, Set<string>> = {}

  for (const session of filtered) {
    const metrics = computeSessionMetrics(session)
    for (const sm of metrics.pageMetrics) {
      pageVisits[sm.pageId] = (pageVisits[sm.pageId] ?? 0) + sm.visitCount
      pageDwells[sm.pageId] = pageDwells[sm.pageId] ?? []
      if (sm.avgDwellMs > 0) pageDwells[sm.pageId].push(sm.avgDwellMs)
      pageFrustrated[sm.pageId] = (pageFrustrated[sm.pageId] ?? 0) + sm.frustratedClickCount
    }
    for (const cm of metrics.chapterMetrics) {
      chapterEntries[cm.chapterId] = (chapterEntries[cm.chapterId] ?? 0) + cm.entryCount
      chapterCompletions[cm.chapterId] =
        (chapterCompletions[cm.chapterId] ?? 0) + cm.completionCount
      chapterSessions[cm.chapterId] = chapterSessions[cm.chapterId] ?? new Set()
      chapterSessions[cm.chapterId].add(session.meta.id)
    }
  }

  const pagePopularity = Object.entries(pageVisits)
    .map(([pageId, totalVisits]) => ({
      pageId,
      totalVisits,
      avgDwell: pageDwells[pageId]?.length
        ? Math.round(pageDwells[pageId].reduce((a, b) => a + b, 0) / pageDwells[pageId].length)
        : 0,
    }))
    .sort((a, b) => b.totalVisits - a.totalVisits)

  const chapterCompletionRates = Object.entries(chapterEntries).map(([chapterId, entries]) => ({
    chapterId,
    rate: entries > 0 ? (chapterCompletions[chapterId] ?? 0) / entries : 0,
    sessions: chapterSessions[chapterId]?.size ?? 0,
  }))

  const topFrustratedPages = Object.entries(pageFrustrated)
    .filter(([, count]) => count > 0)
    .map(([pageId, count]) => ({ pageId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  return {
    sessionCount: filtered.length,
    totalEvents: filtered.reduce((sum, s) => sum + s.meta.eventCount, 0),
    pagePopularity,
    chapterCompletionRates,
    topFrustratedPages,
  }
}

// ─── Funnel analysis ──────────────────────────────────────────────────────────

export function computeFunnel(session: SessionExport, pageOrder: string[]): FunnelStep[] {
  const pageVisitSet = new Set(
    session.events.filter(e => e.type === 'page.visited').map(e => e.payload.pageId as string)
  )

  const steps: FunnelStep[] = []
  let prevReached = 1

  for (let i = 0; i < pageOrder.length; i++) {
    const reached = pageVisitSet.has(pageOrder[i]) ? prevReached : 0
    const dropOff = prevReached - reached
    steps.push({
      pageId: pageOrder[i],
      reachedCount: reached,
      dropOffCount: dropOff,
      dropOffRate: prevReached > 0 ? dropOff / prevReached : 0,
    })
    if (reached > 0) prevReached = reached
  }

  return steps
}

// ─── Path explorer ────────────────────────────────────────────────────────────

export function buildPathGraph(events: SessionEvent[]): PathNode[] {
  const pageEvents = events.filter(e => e.type === 'page.visited')
  const nodes: Record<string, PathNode> = {}

  for (let i = 0; i < pageEvents.length; i++) {
    const sid = pageEvents[i].payload.pageId as string
    if (!nodes[sid]) nodes[sid] = { pageId: sid, count: 0, nextPages: {} }
    nodes[sid].count += 1

    if (i + 1 < pageEvents.length) {
      const nextId = pageEvents[i + 1].payload.pageId as string
      nodes[sid].nextPages[nextId] = (nodes[sid].nextPages[nextId] ?? 0) + 1
    }
  }

  return Object.values(nodes).sort((a, b) => b.count - a.count)
}

// ─── Session quality helpers ──────────────────────────────────────────────────

export function sessionQualityLabel(score: number): string {
  if (score >= 70) return 'High'
  if (score >= 40) return 'Medium'
  return 'Low'
}

export function filterSessions(
  sessions: SessionExport[],
  opts: {
    excludeTestMode?: boolean
    minQuality?: number
    tags?: string[]
    search?: string
  }
): SessionExport[] {
  return sessions.filter(s => {
    const m = s.meta as SessionMeta
    if (opts.excludeTestMode && m.isTestMode) return false
    if (opts.minQuality !== undefined && m.qualityScore < opts.minQuality) return false
    if (opts.tags && opts.tags.length > 0 && !opts.tags.some(t => m.tags.includes(t))) return false
    if (opts.search) {
      const q = opts.search.toLowerCase()
      if (!m.name.toLowerCase().includes(q) && !m.tags.some(t => t.includes(q))) return false
    }
    return true
  })
}
