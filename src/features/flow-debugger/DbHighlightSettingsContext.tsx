import {
  LS_DEBUG_HIGHLIGHT_BG,
  LS_DEBUG_HIGHLIGHT_OPACITY,
  LS_DEBUG_HIGHLIGHT_RADIUS,
  LS_DEBUG_HIGHLIGHT_TEXT,
} from '@flowkit-shared/constants/storageKeys'
import React, { createContext, useCallback, useContext, useMemo, useState } from 'react'

// ── DbHighlightSettingsContext ──────────────────────────────────────────────────
//
// Shared, real-time-synced appearance settings for DbInspector's search-match
// highlight (<mark> background/text color, opacity, corner radius). Must be a
// Context, not a local useState — Settings.tsx (the overlay that edits these
// values) and DbInspector (the already-mounted panel that renders them) are
// simultaneously mounted, so two independent localStorage-backed useState
// copies would desync: editing color in Settings wouldn't reach the still-open
// Debug tab until it remounted. Same reasoning as FlowStorySettingsContext.

export const DEFAULT_HIGHLIGHT_BG = '#f59e0b' // amber
export const DEFAULT_HIGHLIGHT_TEXT = '#f59e0b'
export const DEFAULT_HIGHLIGHT_OPACITY = 20 // %
export const DEFAULT_HIGHLIGHT_RADIUS = 3 // px

export interface DbHighlightSettingsValue {
  highlightBg: string
  setHighlightBg: (v: string) => void
  highlightText: string
  setHighlightText: (v: string) => void
  highlightOpacity: number
  setHighlightOpacity: (v: number) => void
  highlightRadius: number
  setHighlightRadius: (v: number) => void
}

function readNumber(key: string, fallback: number): number {
  const raw = localStorage.getItem(key)
  if (raw === null) return fallback
  const n = Number(raw)
  return Number.isFinite(n) ? n : fallback
}

if (import.meta.hot && !import.meta.hot.data.DbHighlightSettingsContext) {
  import.meta.hot.data.DbHighlightSettingsContext = createContext<DbHighlightSettingsValue | null>(
    null
  )
}
const DbHighlightSettingsContext =
  (import.meta.hot?.data.DbHighlightSettingsContext as
    ReturnType<typeof createContext<DbHighlightSettingsValue | null>> | undefined) ??
  createContext<DbHighlightSettingsValue | null>(null)

export function DbHighlightSettingsProvider({ children }: { children: React.ReactNode }) {
  const [highlightBg, setHighlightBgState] = useState<string>(
    () => localStorage.getItem(LS_DEBUG_HIGHLIGHT_BG) ?? DEFAULT_HIGHLIGHT_BG
  )
  const [highlightText, setHighlightTextState] = useState<string>(
    () => localStorage.getItem(LS_DEBUG_HIGHLIGHT_TEXT) ?? DEFAULT_HIGHLIGHT_TEXT
  )
  const [highlightOpacity, setHighlightOpacityState] = useState<number>(() =>
    readNumber(LS_DEBUG_HIGHLIGHT_OPACITY, DEFAULT_HIGHLIGHT_OPACITY)
  )
  const [highlightRadius, setHighlightRadiusState] = useState<number>(() =>
    readNumber(LS_DEBUG_HIGHLIGHT_RADIUS, DEFAULT_HIGHLIGHT_RADIUS)
  )

  const setHighlightBg = useCallback((v: string) => {
    localStorage.setItem(LS_DEBUG_HIGHLIGHT_BG, v)
    setHighlightBgState(v)
  }, [])
  const setHighlightText = useCallback((v: string) => {
    localStorage.setItem(LS_DEBUG_HIGHLIGHT_TEXT, v)
    setHighlightTextState(v)
  }, [])
  const setHighlightOpacity = useCallback((v: number) => {
    localStorage.setItem(LS_DEBUG_HIGHLIGHT_OPACITY, String(v))
    setHighlightOpacityState(v)
  }, [])
  const setHighlightRadius = useCallback((v: number) => {
    localStorage.setItem(LS_DEBUG_HIGHLIGHT_RADIUS, String(v))
    setHighlightRadiusState(v)
  }, [])

  const value = useMemo<DbHighlightSettingsValue>(
    () => ({
      highlightBg,
      setHighlightBg,
      highlightText,
      setHighlightText,
      highlightOpacity,
      setHighlightOpacity,
      highlightRadius,
      setHighlightRadius,
    }),
    [
      highlightBg,
      setHighlightBg,
      highlightText,
      setHighlightText,
      highlightOpacity,
      setHighlightOpacity,
      highlightRadius,
      setHighlightRadius,
    ]
  )

  return (
    <DbHighlightSettingsContext.Provider value={value}>
      {children}
    </DbHighlightSettingsContext.Provider>
  )
}

/** Access DbInspector highlight appearance settings. Throws outside the provider. */
export function useDbHighlightSettings(): DbHighlightSettingsValue {
  const ctx = useContext(DbHighlightSettingsContext)
  if (!ctx) {
    throw new Error('useDbHighlightSettings() must be used within a DbHighlightSettingsProvider')
  }
  return ctx
}
