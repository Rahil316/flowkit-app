import {
  computeSessionMetrics,
  type FlowMetrics,
  type PageMetrics,
  type SessionMetrics,
} from '@flowkit-features/flowTracer/sessionMetrics'
import type { SessionEvent, SessionExport, SessionMeta } from '@flowkit-features/flowTracer/types'

// Re-export for backward compat of other files within this module.
export type { FlowMetrics, PageMetrics as ScreenMetrics, SessionMetrics }
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
  nextScreens: Record<string, number> // pageId → transition count
}

// ─── Multi-session aggregation ────────────────────────────────────────────────

export interface AggregateMetrics {
  sessionCount: number
  totalEvents: number
  screenPopularity: Array<{ pageId: string; totalVisits: number; avgDwell: number }>
  flowCompletionRates: Array<{ flowId: string; rate: number; sessions: number }>
  topFrustratedScreens: Array<{ pageId: string; count: number }>
}

export function aggregateSessions(
  sessions: SessionExport[],
  excludeTestMode = true
): AggregateMetrics {
  const filtered = excludeTestMode ? sessions.filter(s => !s.meta.isTestMode) : sessions

  const screenVisits: Record<string, number> = {}
  const screenDwells: Record<string, number[]> = {}
  const screenFrustrated: Record<string, number> = {}
  const flowEntries: Record<string, number> = {}
  const flowCompletions: Record<string, number> = {}
  const flowSessions: Record<string, Set<string>> = {}

  for (const session of filtered) {
    const metrics = computeSessionMetrics(session)
    for (const sm of metrics.pageMetrics) {
      screenVisits[sm.pageId] = (screenVisits[sm.pageId] ?? 0) + sm.visitCount
      screenDwells[sm.pageId] = screenDwells[sm.pageId] ?? []
      if (sm.avgDwellMs > 0) screenDwells[sm.pageId].push(sm.avgDwellMs)
      screenFrustrated[sm.pageId] = (screenFrustrated[sm.pageId] ?? 0) + sm.frustratedClickCount
    }
    for (const fm of metrics.flowMetrics) {
      flowEntries[fm.flowId] = (flowEntries[fm.flowId] ?? 0) + fm.entryCount
      flowCompletions[fm.flowId] = (flowCompletions[fm.flowId] ?? 0) + fm.completionCount
      flowSessions[fm.flowId] = flowSessions[fm.flowId] ?? new Set()
      flowSessions[fm.flowId].add(session.meta.id)
    }
  }

  const screenPopularity = Object.entries(screenVisits)
    .map(([pageId, totalVisits]) => ({
      pageId,
      totalVisits,
      avgDwell: screenDwells[pageId]?.length
        ? Math.round(screenDwells[pageId].reduce((a, b) => a + b, 0) / screenDwells[pageId].length)
        : 0,
    }))
    .sort((a, b) => b.totalVisits - a.totalVisits)

  const flowCompletionRates = Object.entries(flowEntries).map(([flowId, entries]) => ({
    flowId,
    rate: entries > 0 ? (flowCompletions[flowId] ?? 0) / entries : 0,
    sessions: flowSessions[flowId]?.size ?? 0,
  }))

  const topFrustratedScreens = Object.entries(screenFrustrated)
    .filter(([, count]) => count > 0)
    .map(([pageId, count]) => ({ pageId, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 10)

  return {
    sessionCount: filtered.length,
    totalEvents: filtered.reduce((sum, s) => sum + s.meta.eventCount, 0),
    screenPopularity,
    flowCompletionRates,
    topFrustratedScreens,
  }
}

// ─── Funnel analysis ──────────────────────────────────────────────────────────

export function computeFunnel(session: SessionExport, pageOrder: string[]): FunnelStep[] {
  const screenVisitSet = new Set(
    session.events.filter(e => e.type === 'page.visited').map(e => e.payload.pageId as string)
  )

  const steps: FunnelStep[] = []
  let prevReached = 1

  for (let i = 0; i < pageOrder.length; i++) {
    const reached = screenVisitSet.has(pageOrder[i]) ? prevReached : 0
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
  const screenEvents = events.filter(e => e.type === 'page.visited')
  const nodes: Record<string, PathNode> = {}

  for (let i = 0; i < screenEvents.length; i++) {
    const sid = screenEvents[i].payload.pageId as string
    if (!nodes[sid]) nodes[sid] = { pageId: sid, count: 0, nextScreens: {} }
    nodes[sid].count += 1

    if (i + 1 < screenEvents.length) {
      const nextId = screenEvents[i + 1].payload.pageId as string
      nodes[sid].nextScreens[nextId] = (nodes[sid].nextScreens[nextId] ?? 0) + 1
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
