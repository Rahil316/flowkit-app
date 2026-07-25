import { SessionRecorderCtx } from '@flowkit-shared/contexts/SessionRecorderContext'
import {
  createContext,
  type MutableRefObject,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { SessionDb, sessionWriteBatcher } from '../sessionDb'
import type {
  ChannelConfig,
  CursorSample,
  EventType,
  SessionEvent,
  SessionMeta,
  SessionRemark,
  SessionSnapshot,
} from '../types'
import { DEFAULT_CHANNELS } from '../types'

// ─── State machine ────────────────────────────────────────────────────────────

type RecorderState = 'idle' | 'recording' | 'paused'

interface SessionRecorderValue {
  state: RecorderState
  sessionId: string | null
  channels: ChannelConfig

  // Derived aliases
  isRecording: boolean
  isPaused: boolean
  isTestMode: boolean
  activeSessionId: string | null

  // Live monitor state (cleared on stop)
  recentEvents: SessionEvent[]
  elapsedMs: number
  currentPageId: string | null

  // Lifecycle
  startRecording: (name?: string, tags?: string[], testMode?: boolean) => void
  pauseRecording: () => void
  resumeRecording: () => void
  stopRecording: (opts?: StopOpts) => Promise<SessionMeta | null>

  // Logging — no-ops when idle or paused
  logEvent: (type: EventType, payload?: Record<string, unknown>) => void
  logCursorSample: (sample: Omit<CursorSample, 'sessionId' | 'sequenceId'>) => void
  logCursorSampleXY: (
    x: number,
    y: number,
    screenW: number,
    screenH: number,
    pageId: string
  ) => void
  takeSnapshot: (snap: Omit<SessionSnapshot, 'sessionId' | 'sequenceId'>) => void
  addRemark: (text: string) => void

  // Config
  setChannels: (c: Partial<ChannelConfig>) => void
  setAutoStartOnFlow: (enabled: boolean) => void
  setQualityThreshold: (threshold: number) => void
  setCursorSamplingRateMs: (ms: number) => void
  isTestModeRef: MutableRefObject<boolean>
  autoStartSession: () => void

  // Crash recovery
  crashSession: SessionMeta | null
  dismissCrash: () => void
  recoverCrash: () => void
}

interface StopOpts {
  name?: string
  tags?: string[]
  isTestMode?: boolean
  samplingRateMs?: number
}

const RECENT_EVENTS_CAP = 200

if (import.meta.hot && !import.meta.hot.data.SessionRecorderCtx) {
  import.meta.hot.data.SessionRecorderCtx = createContext<SessionRecorderValue | null>(null)
}
const Ctx =
  (import.meta.hot?.data.SessionRecorderCtx as
    ReturnType<typeof createContext<SessionRecorderValue | null>> | undefined) ??
  createContext<SessionRecorderValue | null>(null)
const INACTIVITY_MS = 5 * 60 * 1000

// ─── Provider ─────────────────────────────────────────────────────────────────

export function SessionRecorderProvider({
  children,
  workspaceId,
}: {
  children: ReactNode
  workspaceId: string
}) {
  const [recState, setRecState] = useState<RecorderState>('idle')
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [channels, setChannelsState] = useState<ChannelConfig>(DEFAULT_CHANNELS)
  const [crashSession, setCrashSession] = useState<SessionMeta | null>(null)
  const autoStartOnFlowRef = useRef(false)
  const qualityThresholdRef = useRef(40)
  const cursorSamplingRateMsRef = useRef(0)
  const lastCursorSampleRef = useRef(0)

  // Live monitor state
  const [recentEvents, setRecentEvents] = useState<SessionEvent[]>([])
  const [elapsedMs, setElapsedMs] = useState(0)
  const [currentPageId, setCurrentPageId] = useState<string | null>(null)
  const recentEventsRef = useRef<SessionEvent[]>([])
  const elapsedIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null)
  const elapsedStartRef = useRef<number>(0)
  const elapsedAccRef = useRef<number>(0) // accumulated ms before pause

  const sessionIdRef = useRef<string | null>(null)
  const sequenceRef = useRef(0)
  const eventCountRef = useRef(0)
  const sessionNameRef = useRef<string>('Untitled session')
  const sessionTagsRef = useRef<string[]>([])
  const remarksRef = useRef<SessionRemark[]>([])
  const chapterEntryCountRef = useRef(0)
  const pageVisitCountRef = useRef(0)
  const startTimeRef = useRef<number>(0)
  const [isTestModeState, setIsTestModeState] = useState<boolean>(false)
  const isTestModeRef = useRef<boolean>(false)
  const inactivityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const recentFlushRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastTapRef = useRef<{ elementId: string; time: number } | null>(null)
  const logEventRef = useRef<SessionRecorderValue['logEvent'] | null>(null)

  // Crash recovery on mount
  useEffect(() => {
    SessionDb.getIncomplete().then(incomplete => {
      const match = incomplete.find(s => s.workspaceId === workspaceId)
      if (match) setCrashSession(match)
    })
  }, [workspaceId])

  // Global safety net: error boundaries only catch render/lifecycle errors.
  // Anything thrown in an event handler, timer, or an unhandled promise
  // rejection is otherwise invisible outside the browser console — capture it
  // as session data too, when a session is active, so a replay isn't missing
  // the one moment that mattered most.
  useEffect(() => {
    const handleError = (event: ErrorEvent) => {
      if (!sessionIdRef.current) return
      logEventRef.current?.('session.error', {
        message: event.message,
        stack: event.error?.stack,
        source: event.filename,
        line: event.lineno,
        column: event.colno,
        boundary: 'window',
      })
    }
    const handleRejection = (event: PromiseRejectionEvent) => {
      if (!sessionIdRef.current) return
      const reason = event.reason
      logEventRef.current?.('session.error', {
        message: reason instanceof Error ? reason.message : String(reason),
        stack: reason instanceof Error ? reason.stack : undefined,
        boundary: 'unhandledrejection',
      })
    }
    window.addEventListener('error', handleError)
    window.addEventListener('unhandledrejection', handleRejection)
    return () => {
      window.removeEventListener('error', handleError)
      window.removeEventListener('unhandledrejection', handleRejection)
    }
  }, [])

  // Elapsed timer — runs while recording, pauses when paused
  useEffect(() => {
    if (recState === 'recording') {
      elapsedStartRef.current = performance.now()
      elapsedIntervalRef.current = setInterval(() => {
        setElapsedMs(elapsedAccRef.current + (performance.now() - elapsedStartRef.current))
      }, 500)
    } else {
      if (elapsedIntervalRef.current) {
        clearInterval(elapsedIntervalRef.current)
        elapsedIntervalRef.current = null
      }
      if (recState === 'paused') {
        elapsedAccRef.current += performance.now() - elapsedStartRef.current
      }
    }
    return () => {
      if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current)
    }
  }, [recState])

  // Cleanup on unmount
  useEffect(
    () => () => {
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current)
      if (elapsedIntervalRef.current) clearInterval(elapsedIntervalRef.current)
      if (recentFlushRef.current) clearTimeout(recentFlushRef.current)
    },
    []
  )

  const nextSeq = () => ++sequenceRef.current

  const resetLiveState = useCallback(() => {
    if (recentFlushRef.current) {
      clearTimeout(recentFlushRef.current)
      recentFlushRef.current = null
    }
    if (inactivityTimerRef.current) {
      clearTimeout(inactivityTimerRef.current)
      inactivityTimerRef.current = null
    }
    recentEventsRef.current = []
    setRecentEvents([])
    setElapsedMs(0)
    setCurrentPageId(null)
    elapsedAccRef.current = 0
  }, [])

  const _autoStartSession = useCallback(() => {
    if (!autoStartOnFlowRef.current) return
    const id = crypto.randomUUID()
    const now = Date.now()
    const autoName = `Auto · ${new Date(now).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}`
    sessionIdRef.current = id
    sequenceRef.current = 0
    eventCountRef.current = 0
    chapterEntryCountRef.current = 0
    pageVisitCountRef.current = 0
    remarksRef.current = []
    sessionNameRef.current = autoName
    sessionTagsRef.current = []
    startTimeRef.current = now
    isTestModeRef.current = false
    setIsTestModeState(false)
    resetLiveState()
    const meta: SessionMeta = {
      id,
      name: autoName,
      workspaceId,
      startTime: now,
      tags: [],
      eventCount: 0,
      cursorSampleCount: 0,
      remarks: [],
      qualityScore: 0,
      isTestMode: false,
      capturedScreenW: window.innerWidth,
      capturedScreenH: window.innerHeight,
    }
    SessionDb.saveMeta(meta)
    void SessionDb.pruneOldSessions(200)
    setSessionId(id)
    setRecState('recording')
  }, [workspaceId, resetLiveState])

  const logEvent = useCallback(
    (type: EventType, payload: Record<string, unknown> = {}) => {
      if (!sessionIdRef.current) return

      // Pause actually pauses: drop everything except the resume signal itself.
      // (session.* lifecycle events still pass so resume/stop/remark work.)
      if (recState === 'paused' && !type.startsWith('session.')) return

      if (!isChannelEnabled(type, channels)) return

      if (type === 'interaction.tap' && payload.elementId) {
        const now = performance.now()
        const last = lastTapRef.current
        if (last && last.elementId === payload.elementId && now - last.time < 1000) return
        lastTapRef.current = { elementId: payload.elementId as string, time: now }
      }

      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current)
      inactivityTimerRef.current = setTimeout(() => {
        const id = sessionIdRef.current
        if (!id) return
        const duration = Date.now() - startTimeRef.current
        const qualityScore = computeQuality({
          chapterEntryCount: chapterEntryCountRef.current,
          pageVisitCount: pageVisitCountRef.current,
          durationMs: duration,
        })
        // Same quality gate as an explicit stop — don't keep junk idle sessions.
        const isAutoSession = sessionNameRef.current.startsWith('Auto ·')
        const reset = () => {
          sessionIdRef.current = null
          setSessionId(null)
          setRecState('idle')
          resetLiveState()
        }
        if (qualityScore < qualityThresholdRef.current || (isAutoSession && qualityScore < 40)) {
          SessionDb.deleteSession(id).finally(reset)
          return
        }
        // Finalize with the REAL cursor sample count (was hard-coded 0).
        SessionDb.getCursorSamples(id)
          .then(cursorSamples => {
            const meta: SessionMeta = {
              id,
              name: sessionNameRef.current,
              workspaceId,
              startTime: startTimeRef.current,
              endTime: Date.now(),
              tags: sessionTagsRef.current,
              eventCount: eventCountRef.current,
              cursorSampleCount: cursorSamples.length,
              remarks: remarksRef.current,
              qualityScore,
              isTestMode: isTestModeRef.current,
              capturedScreenW: window.innerWidth,
              capturedScreenH: window.innerHeight,
            }
            SessionDb.saveMeta(meta)
          })
          .finally(reset)
      }, INACTIVITY_MS)

      const seq = nextSeq()
      eventCountRef.current += 1

      if (type === 'chapter.entered') chapterEntryCountRef.current += 1
      if (type === 'page.visited') {
        pageVisitCountRef.current += 1
        setCurrentPageId((payload.pageId as string) ?? (payload.viewId as string) ?? null)
      }
      if (type === 'session.remark') {
        remarksRef.current.push({ text: (payload.text as string) ?? '', timestamp: Date.now() })
      }

      const event: SessionEvent = {
        id: crypto.randomUUID(),
        sessionId: sessionIdRef.current,
        sequenceId: seq,
        type,
        timestamp: performance.now(),
        payload,
      }

      sessionWriteBatcher.enqueue('events', event)

      // Append to live feed (capped); debounce the React state update to ~150ms
      recentEventsRef.current = [...recentEventsRef.current, event].slice(-RECENT_EVENTS_CAP)
      if (!recentFlushRef.current) {
        recentFlushRef.current = setTimeout(() => {
          recentFlushRef.current = null
          setRecentEvents([...recentEventsRef.current])
        }, 150)
      }
    },
    [recState, channels, workspaceId, resetLiveState]
  )

  useEffect(() => {
    logEventRef.current = logEvent
  }, [logEvent])

  const logCursorSample = useCallback(
    (sample: Omit<CursorSample, 'sessionId' | 'sequenceId'>) => {
      if (recState !== 'recording' || !sessionIdRef.current) return
      if (!channels.cursorTracking) return
      const rateMs = cursorSamplingRateMsRef.current
      if (rateMs > 0) {
        const now = performance.now()
        if (now - lastCursorSampleRef.current < rateMs) return
        lastCursorSampleRef.current = now
      }
      const seq = nextSeq()
      sessionWriteBatcher.enqueue('cursor_samples', {
        ...sample,
        sessionId: sessionIdRef.current,
        sequenceId: seq,
      })
    },
    [recState, channels.cursorTracking]
  )

  const takeSnapshot = useCallback((snap: Omit<SessionSnapshot, 'sessionId' | 'sequenceId'>) => {
    if (!sessionIdRef.current) return
    sessionWriteBatcher.enqueue('snapshots', {
      ...snap,
      sessionId: sessionIdRef.current,
      sequenceId: sequenceRef.current,
    })
  }, [])

  const startRecording = useCallback(
    (name = 'Untitled session', tags: string[] = [], testMode = false) => {
      const id = crypto.randomUUID()
      sessionIdRef.current = id
      sequenceRef.current = 0
      eventCountRef.current = 0
      chapterEntryCountRef.current = 0
      pageVisitCountRef.current = 0
      remarksRef.current = []
      sessionNameRef.current = name
      sessionTagsRef.current = tags
      startTimeRef.current = Date.now()
      isTestModeRef.current = testMode
      setIsTestModeState(testMode)
      resetLiveState()

      const meta: SessionMeta = {
        id,
        name,
        workspaceId,
        startTime: startTimeRef.current,
        tags,
        eventCount: 0,
        cursorSampleCount: 0,
        remarks: [],
        qualityScore: 0,
        isTestMode: testMode,
        capturedScreenW: window.innerWidth,
        capturedScreenH: window.innerHeight,
      }

      SessionDb.saveMeta(meta)
      void SessionDb.pruneOldSessions(200)
      setSessionId(id)
      setRecState('recording')
    },
    [workspaceId, resetLiveState]
  )

  const pauseRecording = useCallback(() => {
    if (recState !== 'recording') return
    setRecState('paused')
  }, [recState])

  const resumeRecording = useCallback(() => {
    if (recState !== 'paused') return
    setRecState('recording')
  }, [recState])

  const stopRecording = useCallback(
    async (opts: StopOpts = {}): Promise<SessionMeta | null> => {
      if (!sessionIdRef.current) return null
      if (inactivityTimerRef.current) clearTimeout(inactivityTimerRef.current)
      await sessionWriteBatcher.flush()
      const id = sessionIdRef.current

      const duration = Date.now() - startTimeRef.current
      const qualityScore = computeQuality({
        chapterEntryCount: chapterEntryCountRef.current,
        pageVisitCount: pageVisitCountRef.current,
        durationMs: duration,
      })

      const isAutoSession = sessionNameRef.current.startsWith('Auto ·')
      if (qualityScore < qualityThresholdRef.current || (isAutoSession && qualityScore < 40)) {
        await SessionDb.deleteSession(id)
        sessionIdRef.current = null
        setSessionId(null)
        setRecState('idle')
        resetLiveState()
        return null
      }

      const cursorSamples = await SessionDb.getCursorSamples(id)
      const meta: SessionMeta = {
        id,
        name: opts.name ?? sessionNameRef.current,
        workspaceId,
        startTime: startTimeRef.current,
        endTime: Date.now(),
        tags: opts.tags ?? sessionTagsRef.current,
        eventCount: eventCountRef.current,
        cursorSampleCount: cursorSamples.length,
        remarks: remarksRef.current,
        qualityScore,
        isTestMode: opts.isTestMode ?? isTestModeRef.current,
        capturedScreenW: window.innerWidth,
        capturedScreenH: window.innerHeight,
      }

      await SessionDb.saveMeta(meta)
      sessionIdRef.current = null
      setSessionId(null)
      setRecState('idle')
      resetLiveState()
      return meta
    },
    [workspaceId, resetLiveState]
  )

  const addRemark = useCallback(
    (text: string) => {
      logEvent('session.remark', { text })
    },
    [logEvent]
  )

  const logCursorSampleXY = useCallback(
    (x: number, y: number, screenW: number, screenH: number, pageId: string) => {
      logCursorSample({ x, y, screenW, screenH, pageId, timestamp: performance.now() })
    },
    [logCursorSample]
  )

  const setChannels = useCallback((patch: Partial<ChannelConfig>) => {
    setChannelsState(prev => {
      const hasChange = (Object.keys(patch) as (keyof ChannelConfig)[]).some(
        k => patch[k] !== prev[k]
      )
      return hasChange ? { ...prev, ...patch } : prev
    })
  }, [])

  const setAutoStartOnFlow = useCallback((enabled: boolean) => {
    autoStartOnFlowRef.current = enabled
  }, [])

  const setQualityThreshold = useCallback((threshold: number) => {
    qualityThresholdRef.current = threshold
  }, [])

  const setCursorSamplingRateMs = useCallback((ms: number) => {
    cursorSamplingRateMsRef.current = ms
  }, [])

  const dismissCrash = useCallback(() => setCrashSession(null), [])

  const recoverCrash = useCallback(async () => {
    if (!crashSession) return
    const id = crashSession.id
    // Recompute from what actually landed in the store — the crashed meta still
    // has its start-of-session values (quality 0, eventCount 0, no cursor count).
    const [events, cursorSamples] = await Promise.all([
      SessionDb.getEvents(id),
      SessionDb.getCursorSamples(id),
    ])
    const chapterEntryCount = events.filter(e => e.type === 'chapter.entered').length
    const pageVisitCount = events.filter(e => e.type === 'page.visited').length
    // event.timestamp is performance.now() from the crashed page load, so it
    // can't be turned into a wall-clock end time on recovery. Estimate duration
    // from the span of recorded timestamps (intra-session deltas are valid).
    const span = events.length
      ? Math.max(0, Math.round(events[events.length - 1].timestamp - events[0].timestamp))
      : 0
    const qualityScore = computeQuality({ chapterEntryCount, pageVisitCount, durationMs: span })
    const firstTs = events[0]?.timestamp ?? 0
    const remarks: SessionRemark[] = events
      .filter(e => e.type === 'session.remark')
      .map(e => ({
        text: (e.payload.text as string) ?? '',
        timestamp: crashSession.startTime + (e.timestamp - firstTs),
      }))
    await SessionDb.saveMeta({
      ...crashSession,
      endTime: crashSession.startTime + span,
      eventCount: events.length,
      cursorSampleCount: cursorSamples.length,
      remarks,
      qualityScore,
    })
    setCrashSession(null)
  }, [crashSession])

  const value: SessionRecorderValue = useMemo(
    () => ({
      state: recState,
      sessionId,
      channels,
      isRecording: recState === 'recording',
      isPaused: recState === 'paused',
      isTestMode: isTestModeState,
      activeSessionId: sessionId,
      recentEvents,
      elapsedMs,
      currentPageId,
      isTestModeRef,
      startRecording,
      pauseRecording,
      resumeRecording,
      stopRecording,
      logEvent,
      logCursorSample,
      logCursorSampleXY,
      takeSnapshot,
      addRemark,
      setChannels,
      setAutoStartOnFlow,
      autoStartSession: _autoStartSession,
      setQualityThreshold,
      setCursorSamplingRateMs,
      crashSession,
      dismissCrash,
      recoverCrash,
    }),
    [
      recState,
      sessionId,
      channels,
      isTestModeState,
      recentEvents,
      elapsedMs,
      currentPageId,
      isTestModeRef,
      startRecording,
      pauseRecording,
      resumeRecording,
      stopRecording,
      logEvent,
      logCursorSample,
      logCursorSampleXY,
      takeSnapshot,
      addRemark,
      setChannels,
      setAutoStartOnFlow,
      _autoStartSession,
      setQualityThreshold,
      setCursorSamplingRateMs,
      crashSession,
      dismissCrash,
      recoverCrash,
    ]
  )

  return (
    <SessionRecorderCtx.Provider value={value}>
      <Ctx.Provider value={value}>{children}</Ctx.Provider>
    </SessionRecorderCtx.Provider>
  )
}

// ─── Hooks ────────────────────────────────────────────────────────────────────

export function useSessionRecorder(): SessionRecorderValue {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useSessionRecorder must be used inside SessionRecorderProvider')
  return ctx
}

export function useSessionRecorderOptional(): SessionRecorderValue | null {
  return useContext(Ctx)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function isChannelEnabled(type: EventType, ch: ChannelConfig): boolean {
  // Always-on channels (interactions & navigation) — but sub-types below may override
  if (type.startsWith('flow.') || type.startsWith('screen.') || type.startsWith('session.'))
    return true
  if (type.startsWith('state.')) return ch.stateChanges
  if (type.startsWith('simulator.')) return ch.simulatorChanges
  if (type.startsWith('panel.')) return ch.panelActivity
  if (type.startsWith('sidebar.')) return ch.sidebarActivity
  if (type === 'interaction.effect') return ch.effects
  if (type === 'interaction.hover') return ch.hoverEvents
  if (type === 'interaction.frustrated-click') return ch.frustratedClicks
  // All other interaction.* and navigation.* are always on
  if (type.startsWith('interaction.') || type.startsWith('navigation.')) return true
  return true
}

function computeQuality({
  chapterEntryCount,
  pageVisitCount,
  durationMs,
}: {
  chapterEntryCount: number
  pageVisitCount: number
  durationMs: number
}): number {
  let score = 0
  if (chapterEntryCount >= 1) score += 40
  if (pageVisitCount >= 3) score += 30
  if (durationMs >= 30_000) score += 30
  return score
}

export type { RecorderState, SessionRecorderValue, StopOpts }

// ─── useSavedSessionCount ─────────────────────────────────────────────────────
// Returns the number of completed sessions in IndexedDB.
// Re-fetches whenever recording transitions back to idle (a session just saved).

export function useSavedSessionCount(): number {
  const recorder = useSessionRecorderOptional()
  const [count, setCount] = useState(0)

  useEffect(() => {
    SessionDb.getAllMeta().then(all => setCount(all.filter(s => s.endTime).length))
  }, [])

  const prevState = useRef(recorder?.state)
  useEffect(() => {
    if (prevState.current !== 'idle' && recorder?.state === 'idle') {
      SessionDb.getAllMeta().then(all => setCount(all.filter(s => s.endTime).length))
    }
    prevState.current = recorder?.state
  }, [recorder?.state])

  return count
}
