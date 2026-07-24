import {
  LS_FLOWPLAN_BLIND_MODE,
  LS_FLOWPLAN_DIVERGED_HINT,
  LS_FLOWPLAN_HINT_POSITION,
  LS_FLOWPLAN_SHOW_HINTS,
  LS_FLOWPLAN_SHOW_WRONG_CLICK,
  LS_FLOWPLAN_STRICT_MODE,
  LS_FLOWPLAN_WRONG_CLICK_COLOR,
} from '@flowkit-shared/constants/storageKeys'
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'

// ── FlowplanSettingsContext ─────────────────────────────────────────────────────
//
// Shared, real-time-synced settings for flowStory playback (Strict Mode, hint
// visibility/appearance, Blind Mode). MUST be a Context, not independent
// per-component useState — Settings.tsx (an overlay layered on top of the
// still-mounted canvas) and FlowMaster.tsx (rendering underneath it) are
// simultaneously mounted, so two separate localStorage-backed useState copies
// would silently desync: toggling Strict Mode in Settings would not affect the
// already-mounted FlowMaster until it remounts. A single Provider instance
// guarantees every consumer re-renders in lockstep.
//
// localStorage is a persistence side-channel only, written on every setter call;
// the source of truth at runtime is always the React state.

export type HighlightColor = 'orange' | 'red' | 'purple' | 'yellow'
export type HintPosition = 'top' | 'bottom'

export interface FlowplanSettingsValue {
  strictMode: boolean
  setStrictMode: (v: boolean) => void
  showHints: boolean
  setShowHints: (v: boolean) => void
  blindMode: boolean
  setBlindMode: (v: boolean) => void
  divergedHint: boolean
  setDivergedHint: (v: boolean) => void
  showWrongClickHighlight: boolean
  setShowWrongClickHighlight: (v: boolean) => void
  wrongClickColor: HighlightColor
  setWrongClickColor: (v: HighlightColor) => void
  hintPosition: HintPosition
  setHintPosition: (v: HintPosition) => void
}

function readBool(key: string, fallback: boolean): boolean {
  const raw = localStorage.getItem(key)
  return raw === null ? fallback : raw === 'true'
}

if (import.meta.hot && !import.meta.hot.data.FlowplanSettingsContext) {
  import.meta.hot.data.FlowplanSettingsContext = createContext<FlowplanSettingsValue | null>(null)
}
const FlowplanSettingsContext =
  (import.meta.hot?.data.FlowplanSettingsContext as
    ReturnType<typeof createContext<FlowplanSettingsValue | null>> | undefined) ??
  createContext<FlowplanSettingsValue | null>(null)

export function FlowplanSettingsProvider({ children }: { children: React.ReactNode }) {
  const [strictMode, setStrictModeState] = useState(() => readBool(LS_FLOWPLAN_STRICT_MODE, false))
  const [showHints, setShowHintsState] = useState(() => readBool(LS_FLOWPLAN_SHOW_HINTS, true))
  const [blindMode, setBlindModeState] = useState(() => readBool(LS_FLOWPLAN_BLIND_MODE, false))
  const [divergedHint, setDivergedHintState] = useState(() =>
    readBool(LS_FLOWPLAN_DIVERGED_HINT, true)
  )
  const [showWrongClickHighlight, setShowWrongClickHighlightState] = useState(() =>
    readBool(LS_FLOWPLAN_SHOW_WRONG_CLICK, true)
  )
  const [wrongClickColor, setWrongClickColorState] = useState<HighlightColor>(
    () => (localStorage.getItem(LS_FLOWPLAN_WRONG_CLICK_COLOR) as HighlightColor | null) ?? 'orange'
  )
  const [hintPosition, setHintPositionState] = useState<HintPosition>(
    () => (localStorage.getItem(LS_FLOWPLAN_HINT_POSITION) as HintPosition | null) ?? 'bottom'
  )

  const setStrictMode = useCallback((v: boolean) => {
    localStorage.setItem(LS_FLOWPLAN_STRICT_MODE, String(v))
    setStrictModeState(v)
  }, [])
  const setShowHints = useCallback((v: boolean) => {
    localStorage.setItem(LS_FLOWPLAN_SHOW_HINTS, String(v))
    setShowHintsState(v)
  }, [])
  const setBlindMode = useCallback((v: boolean) => {
    localStorage.setItem(LS_FLOWPLAN_BLIND_MODE, String(v))
    setBlindModeState(v)
  }, [])
  const setDivergedHint = useCallback((v: boolean) => {
    localStorage.setItem(LS_FLOWPLAN_DIVERGED_HINT, String(v))
    setDivergedHintState(v)
  }, [])
  const setShowWrongClickHighlight = useCallback((v: boolean) => {
    localStorage.setItem(LS_FLOWPLAN_SHOW_WRONG_CLICK, String(v))
    setShowWrongClickHighlightState(v)
  }, [])
  const setWrongClickColor = useCallback((v: HighlightColor) => {
    localStorage.setItem(LS_FLOWPLAN_WRONG_CLICK_COLOR, v)
    setWrongClickColorState(v)
  }, [])
  const setHintPosition = useCallback((v: HintPosition) => {
    localStorage.setItem(LS_FLOWPLAN_HINT_POSITION, v)
    setHintPositionState(v)
  }, [])

  const value = useMemo<FlowplanSettingsValue>(
    () => ({
      strictMode,
      setStrictMode,
      showHints,
      setShowHints,
      blindMode,
      setBlindMode,
      divergedHint,
      setDivergedHint,
      showWrongClickHighlight,
      setShowWrongClickHighlight,
      wrongClickColor,
      setWrongClickColor,
      hintPosition,
      setHintPosition,
    }),
    [
      strictMode,
      setStrictMode,
      showHints,
      setShowHints,
      blindMode,
      setBlindMode,
      divergedHint,
      setDivergedHint,
      showWrongClickHighlight,
      setShowWrongClickHighlight,
      wrongClickColor,
      setWrongClickColor,
      hintPosition,
      setHintPosition,
    ]
  )

  return (
    <FlowplanSettingsContext.Provider value={value}>{children}</FlowplanSettingsContext.Provider>
  )
}

/** Access flowStory playback settings. Throws outside the provider. */
export function useFlowplanSettings(): FlowplanSettingsValue {
  const ctx = useContext(FlowplanSettingsContext)
  if (!ctx) throw new Error('useFlowplanSettings() must be used within a FlowplanSettingsProvider')
  return ctx
}
