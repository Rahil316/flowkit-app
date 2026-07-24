// ─── Event envelope ───────────────────────────────────────────────────────────

export type EventType =
  // Session lifecycle
  | 'session.start'
  | 'session.stop'
  | 'session.pause'
  | 'session.resume'
  | 'session.remark'
  | 'session.presentation-mode-toggled'
  | 'session.error'
  // Chapter lifecycle
  | 'chapter.entered'
  | 'chapter.completed'
  | 'chapter.exited-early'
  | 'chapter.blocked'
  | 'chapter.transition' // navigation resolved WITH A PROBLEM (blocked or resolver threw/warned) — never fires on a clean nav
  // Page
  | 'page.visited'
  | 'page.dwell-end'
  | 'page.blocked'
  // Interaction
  | 'interaction.tap'
  | 'interaction.double-tap'
  | 'interaction.hover'
  | 'interaction.swipe'
  | 'interaction.effect'
  | 'interaction.frustrated-click'
  // Navigation
  | 'navigation.sidebar-click'
  | 'navigation.arrow-key'
  | 'navigation.programmatic'
  | 'navigation.back'
  | 'navigation.auto-advance'
  | 'navigation.flow-map-click'
  | 'navigation.mobile-gesture'
  // State
  | 'state.chapter-set'
  | 'state.db-init'
  | 'state.db-patch'
  | 'state.db-reset'
  // Simulator
  | 'simulator.device-changed'
  | 'simulator.orientation-toggled'
  | 'simulator.connection-changed'
  | 'simulator.accessibility-changed'
  | 'simulator.autoplay-changed'
  // Panel
  | 'panel.opened'
  | 'panel.closed'
  | 'panel.tab-changed'
  | 'panel.debug-subtab-changed'
  // Sidebar
  | 'sidebar.search-used'
  | 'sidebar.chapter-expanded'
  | 'sidebar.page-clicked'

export interface SessionEvent {
  id: string
  sessionId: string
  sequenceId: number
  type: EventType
  timestamp: number
  payload: Record<string, unknown>
}

// ─── Cursor ───────────────────────────────────────────────────────────────────

export interface CursorSample {
  sessionId: string
  sequenceId: number
  timestamp: number
  x: number
  y: number
  screenW: number
  screenH: number
  pageId: string
}

// ─── Session metadata ─────────────────────────────────────────────────────────

export interface SessionRemark {
  text: string
  timestamp: number
}

export interface SessionMeta {
  id: string
  name: string
  workspaceId: string
  startTime: number
  endTime?: number
  tags: string[]
  eventCount: number
  cursorSampleCount: number
  remarks: SessionRemark[]
  qualityScore: number
  isTestMode: boolean
  capturedScreenW: number
  capturedScreenH: number
}

// ─── State snapshots ──────────────────────────────────────────────────────────

export interface SessionSnapshot {
  sessionId: string
  sequenceId: number
  activeViewId: string
  db: Record<string, unknown>
  flowState: Record<string, unknown>
  devicePreset: string
  orientation: string
  connectionMode: string
  networkSpeed: string
  colorBlindMode: string
  blurryVision: number
  renderedScreenW: number
  renderedScreenH: number
}

// ─── Channel config ───────────────────────────────────────────────────────────

export interface ChannelConfig {
  interactions: true // always on
  navigation: true // always on
  effects: boolean
  stateChanges: boolean
  simulatorChanges: boolean
  panelActivity: boolean
  sidebarActivity: boolean
  cursorTracking: boolean
  frustratedClicks: boolean
  hoverEvents: boolean
}

export const DEFAULT_CHANNELS: ChannelConfig = {
  interactions: true,
  navigation: true,
  effects: true,
  stateChanges: true,
  simulatorChanges: true,
  panelActivity: true,
  sidebarActivity: true,
  cursorTracking: false,
  frustratedClicks: true,
  hoverEvents: false,
}

// ─── Export format ────────────────────────────────────────────────────────────

export interface SessionExport {
  meta: SessionMeta
  events: SessionEvent[]
  snapshots: SessionSnapshot[]
  cursorSamples?: CursorSample[]
  filters?: Partial<ChannelConfig>
}
