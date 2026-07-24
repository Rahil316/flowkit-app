import type { SessionExport } from './types'

// ─── Core metric types ────────────────────────────────────────────────────────

export interface PageMetrics {
  pageId: string
  visitCount: number
  totalDwellMs: number
  avgDwellMs: number
  tapCount: number
  frustratedClickCount: number
  entryCount: number
}

export interface FlowMetrics {
  flowId: string
  entryCount: number
  completionCount: number
  blockedCount: number
  completionRate: number // 0–1
  avgDuration: number // ms from flow.entered to flow.completed
}

export interface SessionMetrics {
  totalDuration: number
  eventCount: number
  uniquePagesVisited: number
  chaptersEntered: string[]
  chaptersCompleted: string[]
  navigationBreakdown: Record<string, number>
  interactionBreakdown: Record<string, number>
  remarksCount: number
  pageMetrics: PageMetrics[]
  flowMetrics: FlowMetrics[]
  qualityScore: number
}

// ─── Single-session metrics ───────────────────────────────────────────────────

export function computeSessionMetrics(session: SessionExport): SessionMetrics {
  const { meta, events } = session
  const totalDuration = meta.endTime ? meta.endTime - meta.startTime : 0

  const pageVisits: Record<string, number[]> = {}
  const pageDwells: Record<string, number> = {}
  const pageTaps: Record<string, number> = {}
  const pageFrustrated: Record<string, number> = {}
  const chaptersEntered = new Set<string>()
  const chaptersCompleted = new Set<string>()
  const flowEntryTimes: Record<string, number[]> = {}
  const flowCompletionTimes: Record<string, number[]> = {}
  const flowBlockedSet = new Set<string>()
  const navBreakdown: Record<string, number> = {}
  const interactionBreakdown: Record<string, number> = {}

  let currentPageId = ''
  let currentPageEnterTime = 0

  for (const ev of events) {
    if (ev.type === 'page.visited') {
      if (currentPageId && currentPageEnterTime > 0) {
        pageDwells[currentPageId] =
          (pageDwells[currentPageId] ?? 0) + (ev.timestamp - currentPageEnterTime)
      }
      const sid = ev.payload.pageId as string
      currentPageId = sid
      currentPageEnterTime = ev.timestamp
      pageVisits[sid] = pageVisits[sid] ?? []
      pageVisits[sid].push(ev.timestamp)
    } else if (ev.type === 'page.dwell-end') {
      const sid = ev.payload.pageId as string
      const dwell = (ev.payload.dwellMs as number) ?? 0
      pageDwells[sid] = (pageDwells[sid] ?? 0) + dwell
    } else if (ev.type === 'interaction.tap' || ev.type === 'interaction.double-tap') {
      const sid = ev.payload.pageId as string
      if (sid) pageTaps[sid] = (pageTaps[sid] ?? 0) + 1
      interactionBreakdown[ev.type] = (interactionBreakdown[ev.type] ?? 0) + 1
    } else if (ev.type === 'interaction.frustrated-click') {
      const sid = ev.payload.pageId as string
      if (sid) pageFrustrated[sid] = (pageFrustrated[sid] ?? 0) + 1
      interactionBreakdown[ev.type] = (interactionBreakdown[ev.type] ?? 0) + 1
    } else if (ev.type.startsWith('interaction.')) {
      interactionBreakdown[ev.type] = (interactionBreakdown[ev.type] ?? 0) + 1
    } else if (ev.type === 'chapter.entered') {
      const fid = ev.payload.flowId as string
      chaptersEntered.add(fid)
      flowEntryTimes[fid] = flowEntryTimes[fid] ?? []
      flowEntryTimes[fid].push(ev.timestamp)
    } else if (ev.type === 'chapter.completed') {
      const fid = ev.payload.flowId as string
      chaptersCompleted.add(fid)
      flowCompletionTimes[fid] = flowCompletionTimes[fid] ?? []
      flowCompletionTimes[fid].push(ev.timestamp)
    } else if (ev.type === 'chapter.blocked') {
      const fid = ev.payload.flowId as string
      flowBlockedSet.add(fid)
    } else if (ev.type.startsWith('navigation.')) {
      navBreakdown[ev.type] = (navBreakdown[ev.type] ?? 0) + 1
    }
  }

  if (currentPageId && currentPageEnterTime > 0 && meta.endTime) {
    pageDwells[currentPageId] =
      (pageDwells[currentPageId] ?? 0) + (meta.endTime - currentPageEnterTime)
  }

  const pageMetrics: PageMetrics[] = Object.keys(pageVisits).map(sid => {
    const visits = pageVisits[sid].length
    const total = pageDwells[sid] ?? 0
    return {
      pageId: sid,
      visitCount: visits,
      totalDwellMs: total,
      avgDwellMs: visits > 0 ? Math.round(total / visits) : 0,
      tapCount: pageTaps[sid] ?? 0,
      frustratedClickCount: pageFrustrated[sid] ?? 0,
      entryCount: 0,
    }
  })

  const flowMetrics: FlowMetrics[] = Array.from(chaptersEntered).map(fid => {
    const entries = (flowEntryTimes[fid] ?? []).length
    const completions = (flowCompletionTimes[fid] ?? []).length
    const avgDuration = computeAvgFlowDuration(
      flowEntryTimes[fid] ?? [],
      flowCompletionTimes[fid] ?? []
    )
    return {
      flowId: fid,
      entryCount: entries,
      completionCount: completions,
      blockedCount: flowBlockedSet.has(fid) ? 1 : 0,
      completionRate: entries > 0 ? completions / entries : 0,
      avgDuration,
    }
  })

  return {
    totalDuration,
    eventCount: events.length,
    uniquePagesVisited: Object.keys(pageVisits).length,
    chaptersEntered: Array.from(chaptersEntered),
    chaptersCompleted: Array.from(chaptersCompleted),
    navigationBreakdown: navBreakdown,
    interactionBreakdown,
    remarksCount: meta.remarks.length,
    pageMetrics,
    flowMetrics,
    qualityScore: meta.qualityScore,
  }
}

function computeAvgFlowDuration(entries: number[], completions: number[]): number {
  if (entries.length === 0 || completions.length === 0) return 0
  const pairs = Math.min(entries.length, completions.length)
  let total = 0
  for (let i = 0; i < pairs; i++) {
    total += completions[i] - entries[i]
  }
  return Math.round(total / pairs)
}
