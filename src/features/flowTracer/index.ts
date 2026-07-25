// Public API for the flowTracer feature.
// Import from '@flowkit-features/flowTracer' — never reach inside components/.
export { buildSessionExport } from './buildSessionExport'
export {
  DEFAULT_SESSION_SETTINGS,
  type SessionSettings,
  useSessionSettings,
} from './components/useSessionSettings'
export type { RecorderState, SessionRecorderValue, StopOpts } from './context'
export {
  SessionRecorderProvider,
  useSavedSessionCount,
  useSessionRecorder,
  useSessionRecorderOptional,
} from './context'
export { eventsCsvBlob, markdownSummaryBlob, metricsCsvBlob } from './exportBlobs'
export { default as SessionsPanel } from './panel'
export { SessionDb } from './sessionDb'
export {
  type ChapterMetrics,
  computeSessionMetrics,
  type PageMetrics,
  type SessionMetrics,
} from './sessionMetrics'
export type {
  ChannelConfig,
  CursorSample,
  SessionEvent,
  SessionExport,
  SessionMeta,
  SessionSnapshot,
} from './types'
