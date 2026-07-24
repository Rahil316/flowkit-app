import type { SessionExport } from '@flowkit-features/flowTracer/types'

import type { SessionSource } from '../../useSessionLibrary'

/** A loaded session tagged with where it came from (library vs recorded). */
export interface SourcedSession extends SessionExport {
  source: SessionSource
  studyId: string | null
}

export interface ReportFilters {
  /** Only sessions that visited this screen id (""=any). */
  pageId: string
  /** Device preset label the session used at some point (""=any). */
  device: string
  /** Connection mode the session used at some point (""=any). */
  connection: string
  minQuality: number // 0–100
  maxQuality: number // 0–100
  tags: string[] // session must have at least one
  /** Inclusive epoch-ms range; 0 = unbounded. */
  startAfter: number
  startBefore: number
  completion: 'any' | 'completed' | 'abandoned'
  source: 'any' | SessionSource
  includeTestMode: boolean
  /** Filter to sessions from a specific study id (""=any). */
  studyId: string
}

export const DEFAULT_FILTERS: ReportFilters = {
  pageId: '',
  device: '',
  connection: '',
  minQuality: 0,
  maxQuality: 100,
  tags: [],
  startAfter: 0,
  startBefore: 0,
  completion: 'any',
  source: 'any',
  includeTestMode: false,
  studyId: '',
}

// ── Derive filterable facets from a session's events ────────────────────────────

function screensVisited(s: SessionExport): Set<string> {
  return new Set(
    s.events
      .filter(e => e.type === 'page.visited')
      .map(e => e.payload.pageId as string)
      .filter(Boolean)
  )
}

function devicesUsed(s: SessionExport): Set<string> {
  const set = new Set<string>()
  for (const e of s.events) {
    if (e.type === 'simulator.device-changed' && typeof e.payload.preset === 'string')
      set.add(e.payload.preset)
  }
  for (const snap of s.snapshots) if (snap.devicePreset) set.add(snap.devicePreset)
  return set
}

function connectionsUsed(s: SessionExport): Set<string> {
  const set = new Set<string>()
  for (const e of s.events) {
    if (e.type === 'simulator.connection-changed' && typeof e.payload.mode === 'string')
      set.add(e.payload.mode)
  }
  for (const snap of s.snapshots) if (snap.connectionMode) set.add(snap.connectionMode)
  return set
}

/** A session "completed" if it logged any flow.completed. */
function isCompleted(s: SessionExport): boolean {
  return s.events.some(e => e.type === 'chapter.completed')
}

// ── The predicate ───────────────────────────────────────────────────────────────

export function matchesFilters(s: SourcedSession, f: ReportFilters): boolean {
  const m = s.meta
  if (!f.includeTestMode && m.isTestMode) return false
  if (m.qualityScore < f.minQuality || m.qualityScore > f.maxQuality) return false
  if (f.tags.length > 0 && !f.tags.some(t => m.tags.includes(t))) return false
  if (f.startAfter && m.startTime < f.startAfter) return false
  if (f.startBefore && m.startTime > f.startBefore) return false
  if (f.source !== 'any' && s.source !== f.source) return false
  if (f.studyId && s.studyId !== f.studyId) return false

  if (f.completion !== 'any') {
    const completed = isCompleted(s)
    if (f.completion === 'completed' && !completed) return false
    if (f.completion === 'abandoned' && completed) return false
  }
  if (f.pageId && !screensVisited(s).has(f.pageId)) return false
  if (f.device && !devicesUsed(s).has(f.device)) return false
  if (f.connection && !connectionsUsed(s).has(f.connection)) return false
  return true
}

export function applyFilters(sessions: SourcedSession[], f: ReportFilters): SourcedSession[] {
  return sessions.filter(s => matchesFilters(s, f))
}

// ── Facet collection for the filter bar (union across all sessions) ─────────────

export interface ReportFacets {
  pages: string[]
  devices: string[]
  connections: string[]
  tags: string[]
  studyIds: string[]
}

export function collectFacets(sessions: SourcedSession[]): ReportFacets {
  const pages = new Set<string>()
  const devices = new Set<string>()
  const connections = new Set<string>()
  const tags = new Set<string>()
  const studyIds = new Set<string>()
  for (const s of sessions) {
    screensVisited(s).forEach(x => pages.add(x))
    devicesUsed(s).forEach(x => devices.add(x))
    connectionsUsed(s).forEach(x => connections.add(x))
    s.meta.tags.forEach(x => tags.add(x))
    if (s.studyId) studyIds.add(s.studyId)
  }
  return {
    pages: [...pages].sort(),
    devices: [...devices].sort(),
    connections: [...connections].sort(),
    tags: [...tags].sort(),
    studyIds: [...studyIds].sort(),
  }
}
