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

export interface ChapterMetrics {
  chapterId: string
  entryCount: number
  completionCount: number
  blockedCount: number
  completionRate: number // 0–1
  avgDuration: number // ms from chapter.entered to chapter.completed
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
  chapterMetrics: ChapterMetrics[]
  qualityScore: number
}

// ─── Single-session metrics ───────────────────────────────────────────────────

// FlowEngine writes `chapterId` today; sessions recorded before that rename
// still have the payload keyed `flowId`. Read either so historical session
// files on disk keep working — this is a read-side compatibility shim, not
// a schema FlowEngine should ever write going forward.
function readChapterId(payload: Record<string, unknown>): string {
  return (payload.chapterId as string) ?? (payload.flowId as string)
}

export function computeSessionMetrics(session: SessionExport): SessionMetrics {
  const { meta, events } = session
  const totalDuration = meta.endTime ? meta.endTime - meta.startTime : 0

  const pageVisits: Record<string, number[]> = {}
  const pageDwells: Record<string, number> = {}
  const pageTaps: Record<string, number> = {}
  const pageFrustrated: Record<string, number> = {}
  const chaptersEntered = new Set<string>()
  const chaptersCompleted = new Set<string>()
  const chapterEntryTimes: Record<string, number[]> = {}
  const chapterCompletionTimes: Record<string, number[]> = {}
  const chapterBlockedSet = new Set<string>()
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
      const fid = readChapterId(ev.payload)
      chaptersEntered.add(fid)
      chapterEntryTimes[fid] = chapterEntryTimes[fid] ?? []
      chapterEntryTimes[fid].push(ev.timestamp)
    } else if (ev.type === 'chapter.completed') {
      const fid = readChapterId(ev.payload)
      chaptersCompleted.add(fid)
      chapterCompletionTimes[fid] = chapterCompletionTimes[fid] ?? []
      chapterCompletionTimes[fid].push(ev.timestamp)
    } else if (ev.type === 'chapter.blocked') {
      const fid = readChapterId(ev.payload)
      chapterBlockedSet.add(fid)
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

  const chapterMetrics: ChapterMetrics[] = Array.from(chaptersEntered).map(fid => {
    const entries = (chapterEntryTimes[fid] ?? []).length
    const completions = (chapterCompletionTimes[fid] ?? []).length
    const avgDuration = computeAvgChapterDuration(
      chapterEntryTimes[fid] ?? [],
      chapterCompletionTimes[fid] ?? []
    )
    return {
      chapterId: fid,
      entryCount: entries,
      completionCount: completions,
      blockedCount: chapterBlockedSet.has(fid) ? 1 : 0,
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
    chapterMetrics,
    qualityScore: meta.qualityScore,
  }
}

function computeAvgChapterDuration(entries: number[], completions: number[]): number {
  if (entries.length === 0 || completions.length === 0) return 0
  const pairs = Math.min(entries.length, completions.length)
  let total = 0
  for (let i = 0; i < pairs; i++) {
    total += completions[i] - entries[i]
  }
  return Math.round(total / pairs)
}
