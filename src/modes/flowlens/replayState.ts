import type { ColorBlindMode, ConnectionMode, NetworkSpeed } from '@flowkit/types/index'
import type {
  SessionEvent,
  SessionExport,
  SessionSnapshot,
} from '@flowkit-features/flowTracer/types'

export interface ReplayState {
  activePageId: string
  db: Record<string, unknown>
  flowState: Record<string, unknown>
  devicePreset: string
  orientation: string
  connectionMode: ConnectionMode
  networkSpeed: NetworkSpeed
  colorBlindMode: ColorBlindMode
  blurryVision: number
  /** The recorded initial db (state.db-init), used as the db-reset target. */
  initialDb: Record<string, unknown> | null
}

export function findBestSnapshot(
  snapshots: SessionSnapshot[],
  targetSeq: number
): SessionSnapshot | null {
  const before = snapshots
    .filter(s => s.sequenceId <= targetSeq)
    .sort((a, b) => b.sequenceId - a.sequenceId)
  return before[0] ?? null
}

/**
 * Reconstruct the workspace state the user was looking at, at a given point in
 * the timeline. Starts from the nearest snapshot (if any) and folds forward
 * every event up to targetSeq. Mirrors the live DashboardContext reducers so the
 * real screen component renders exactly as it did during recording.
 */
export function replayFromSnapshot(session: SessionExport, targetSeq: number): ReplayState {
  const { events, snapshots } = session
  const snapshot = findBestSnapshot(snapshots, targetSeq)

  const base: ReplayState = snapshot
    ? {
        activePageId: snapshot.activeViewId,
        db: { ...snapshot.db },
        flowState: { ...snapshot.flowState },
        devicePreset: snapshot.devicePreset,
        orientation: snapshot.orientation,
        connectionMode: snapshot.connectionMode as ConnectionMode,
        networkSpeed: (snapshot.networkSpeed as NetworkSpeed) ?? 'strong',
        colorBlindMode: snapshot.colorBlindMode as ColorBlindMode,
        blurryVision: snapshot.blurryVision ?? 0,
        initialDb: { ...snapshot.db },
      }
    : {
        activePageId: '',
        db: {},
        flowState: {},
        devicePreset: '',
        orientation: 'portrait',
        connectionMode: 'wifi',
        networkSpeed: 'strong',
        colorBlindMode: 'none',
        blurryVision: 0,
        initialDb: null,
      }

  const startSeq = snapshot?.sequenceId ?? 0
  const toApply = events.filter(e => e.sequenceId > startSeq && e.sequenceId <= targetSeq)

  for (const ev of toApply) applyEvent(base, ev)

  // If we never saw an explicit screen.visited and have no snapshot, fall back
  // to the first navigation-ish event so the canvas isn't blank.
  if (!base.activePageId) {
    const firstScreen = events.find(
      e => typeof e.payload.pageId === 'string' || typeof e.payload.to === 'string'
    )
    if (firstScreen) {
      base.activePageId =
        (firstScreen.payload.pageId as string) ?? (firstScreen.payload.to as string) ?? ''
    }
  }

  return base
}

function applyEvent(base: ReplayState, ev: SessionEvent) {
  switch (ev.type) {
    case 'page.visited':
      if (typeof ev.payload.pageId === 'string') base.activePageId = ev.payload.pageId
      break
    case 'navigation.programmatic':
    case 'navigation.sidebar-click':
    case 'navigation.flow-map-click':
    case 'sidebar.page-clicked':
      if (typeof ev.payload.to === 'string') base.activePageId = ev.payload.to
      else if (typeof ev.payload.pageId === 'string') base.activePageId = ev.payload.pageId
      break
    case 'state.db-init':
      if (ev.payload.db && typeof ev.payload.db === 'object') {
        base.db = { ...(ev.payload.db as Record<string, unknown>) }
        base.initialDb = { ...(ev.payload.db as Record<string, unknown>) }
      }
      break
    case 'state.db-patch':
      if (ev.payload.patch && typeof ev.payload.patch === 'object') {
        Object.assign(base.db, ev.payload.patch as Record<string, unknown>)
      }
      break
    case 'state.db-reset':
      // Reset to the recorded initial db when known, else the workspace default
      // (null tells ReplayController to fall back to resetDb()).
      base.db = base.initialDb ? { ...base.initialDb } : {}
      break
    case 'simulator.device-changed':
      if (typeof ev.payload.preset === 'string') base.devicePreset = ev.payload.preset
      break
    case 'simulator.orientation-toggled':
      if (typeof ev.payload.orientation === 'string') base.orientation = ev.payload.orientation
      break
    case 'simulator.connection-changed':
      if (typeof ev.payload.mode === 'string')
        base.connectionMode = ev.payload.mode as ConnectionMode
      if (typeof ev.payload.networkSpeed === 'string')
        base.networkSpeed = ev.payload.networkSpeed as NetworkSpeed
      break
    case 'simulator.accessibility-changed':
      if (typeof ev.payload.colorBlindMode === 'string')
        base.colorBlindMode = ev.payload.colorBlindMode as ColorBlindMode
      if (typeof ev.payload.blurryVision === 'number') base.blurryVision = ev.payload.blurryVision
      break
  }
}
