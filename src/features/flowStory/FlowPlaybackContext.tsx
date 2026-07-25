import type { CompiledFlowStory, CompiledStep } from '@flowkit-features/flowStory/compileFlowStory'
import { useDashboard } from '@flowkit-shared/contexts/DashboardContext'
import { useFlowLensModeOptional } from '@flowkit-shared/contexts/FlowLensModeContext'
import { useSessionRecorderShared } from '@flowkit-shared/contexts/SessionRecorderContext'
import { applyDotPathPatch } from '@flowkit-shared/utils/applyDotPathPatch'
import React, { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'

// ── FlowPlaybackContext ─────────────────────────────────────────────────────────
//
// Holds the state for an ACTIVE FlowStory playback session — kept separate from the
// already-overloaded DashboardContext. This is the cohesive home that F4/F5 and
// Phase 2 (visual editor) keep extending.
//
// Responsibilities:
//   • Track the active compiled flowStory + current step + gating flag.
//   • Inject the flowStory's deep-copied baseline db on enter (silent — via
//     DashboardContext.flowPlaySetDb, so recordings aren't polluted).
//   • Apply per-step db patches as the flow navigates (Phase 4 calls applyStepByPageId).
//   • Restore the workspace db on exit (resetDb).
//
// RB4 guard: playback is disabled while FlowLens replay is active (two silent db
// setters must not fight).

export interface FlowPlaybackValue {
  /** The compiled flowStory currently playing, or null. */
  activeFlowStory: CompiledFlowStory | null
  /** Index into __flowStory.steps of the current step, or -1. */
  currentStepIndex: number
  /** The current step's metadata (db patch, actionNote, …), or null. */
  currentStep: CompiledStep | null
  /** True while a flowStory is playing — gating is active (Phase 4 reads this). */
  isGating: boolean
  /** Whether playback is allowed (false during FlowLens replay). */
  canPlay: boolean

  /** Begin playback of a compiled flowStory: inject its baseline db, gate on. */
  enter: (compiled: CompiledFlowStory, rawDb: Record<string, unknown>) => void
  /** End playback: restore workspace db, clear state. */
  exit: () => void
  /**
   * Incremented each time restart() is called. FlowMaster watches this value and
   * calls engine.resetEngine() in response, ensuring execution state is reset
   * without FlowPlaybackContext needing to reach into the engine directly.
   */
  restartSignal: number
  /** Restart the active flowStory from step 0 — re-injects the baseline db and signals FlowMaster to reset the engine. No-op when no flowStory is active. */
  restart: () => void
  /**
   * Called by FlowMaster when the flow navigates to a step. Sets currentStepIndex
   * and applies that step's db patch (silently). FlowMaster owns step resolution
   * (it derives the active step synchronously), so it passes both here — the
   * context never looks the step up itself. Safe to call repeatedly (idempotent
   * patches set absolute values).
   */
  applyStep: (index: number, db?: Record<string, unknown>) => void
}

if (import.meta.hot && !import.meta.hot.data.FlowPlaybackContext) {
  import.meta.hot.data.FlowPlaybackContext = createContext<FlowPlaybackValue | null>(null)
}
const FlowPlaybackContext =
  (import.meta.hot?.data.FlowPlaybackContext as
    ReturnType<typeof createContext<FlowPlaybackValue | null>> | undefined) ??
  createContext<FlowPlaybackValue | null>(null)

export function FlowPlaybackProvider({ children }: { children: React.ReactNode }) {
  const { flowPlaySetDb, resetDb, setActiveStoryStart } = useDashboard()
  const flowLens = useFlowLensModeOptional()
  const recorder = useSessionRecorderShared()
  const replayActive = flowLens?.replayActive ?? false

  const [activeFlowStory, setActiveFlowStory] = useState<CompiledFlowStory | null>(null)
  const [currentStepIndex, setCurrentStepIndex] = useState(-1)
  const [restartSignal, setRestartSignal] = useState(0)

  // The flow's working db copy lives in DashboardContext.db; we keep a ref to the
  // last value we wrote so successive step patches stack onto the right base.
  const workingDbRef = useRef<Record<string, unknown>>({})
  // Snapshot of the raw db passed to enter(), used to restore baseline on restart.
  const baselineDbRef = useRef<Record<string, unknown>>({})

  const enter = useCallback(
    (compiled: CompiledFlowStory, rawDb: Record<string, unknown>) => {
      if (replayActive) return // RB4: don't fight FlowLens replay.
      // Inject a deep copy of the baseline db (source flowStory is never mutated).
      // Step 0's patch is NOT applied here — FlowMaster's per-screen effect fires
      // applyStepByPageId for the first screen on mount, so every step's patch
      // (including step 0) flows through ONE code path (no double-application).
      const copy = applyDotPathPatch(rawDb, {}) // returns a fresh clone
      baselineDbRef.current = rawDb
      workingDbRef.current = copy
      flowPlaySetDb(copy)
      setActiveFlowStory(compiled)
      setActiveStoryStart(compiled.__flowStory.homeScreen ?? null)
      setCurrentStepIndex(0)
      // Auto-record: only fires when the ActionCenter toggle is ON (recorder.setAutoStartOnFlow syncs it).
      if (recorder && !recorder.isRecording) recorder.autoStartSession()
    },
    [replayActive, flowPlaySetDb, recorder, setActiveStoryStart]
  )

  const exit = useCallback(() => {
    setActiveFlowStory(null)
    setActiveStoryStart(null)
    setCurrentStepIndex(-1)
    workingDbRef.current = {}
    baselineDbRef.current = {}
    resetDb()
  }, [resetDb, setActiveStoryStart])

  const restart = useCallback(() => {
    if (!activeFlowStory) return
    // Re-inject a fresh clone of the baseline db so step patches start clean.
    const copy = applyDotPathPatch(baselineDbRef.current, {})
    workingDbRef.current = copy
    flowPlaySetDb(copy)
    setCurrentStepIndex(0)
    // Signal FlowMaster to reset the engine. FlowMaster watches restartSignal and
    // calls engine.resetEngine(), which returns activeScreenIndex to 0 and clears
    // history/localState/log/effects/animClass without a navigateTo() call.
    setRestartSignal(s => s + 1)
  }, [activeFlowStory, flowPlaySetDb])

  const applyStep = useCallback(
    (index: number, db?: Record<string, unknown>) => {
      setCurrentStepIndex(index)
      if (db) {
        const patched = applyDotPathPatch(workingDbRef.current, db)
        workingDbRef.current = patched
        flowPlaySetDb(patched)
      }
    },
    [flowPlaySetDb]
  )

  const value = useMemo<FlowPlaybackValue>(() => {
    const currentStep =
      activeFlowStory && currentStepIndex >= 0
        ? (activeFlowStory.__flowStory.steps[currentStepIndex] ?? null)
        : null
    return {
      activeFlowStory,
      currentStepIndex,
      currentStep,
      restartSignal,
      isGating: activeFlowStory !== null,
      canPlay: !replayActive,
      enter,
      exit,
      restart,
      applyStep,
    }
  }, [
    activeFlowStory,
    currentStepIndex,
    restartSignal,
    replayActive,
    enter,
    exit,
    restart,
    applyStep,
  ])

  return <FlowPlaybackContext.Provider value={value}>{children}</FlowPlaybackContext.Provider>
}

/** Access flow-playback state. Returns null outside the provider (optional use). */
export function useFlowPlaybackOptional(): FlowPlaybackValue | null {
  return useContext(FlowPlaybackContext)
}

/** Access flow-playback state. Throws outside the provider. */
export function useFlowPlayback(): FlowPlaybackValue {
  const ctx = useContext(FlowPlaybackContext)
  if (!ctx) throw new Error('useFlowPlayback() must be used within a FlowPlaybackProvider')
  return ctx
}
