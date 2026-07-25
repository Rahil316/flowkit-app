import type { Chapter } from '@flowkit/types/index'
import { DEBUG_SUB_TABS, type DebugSubTab } from '@flowkit-features/flow-debugger/debugSubTabs'
import { SIM_SUB_TABS, type SimSubTab } from '@flowkit-features/simulator/simSubTabs'
import { type Dispatch, type SetStateAction, useEffect, useMemo } from 'react'

import { type InspectorTab } from '../layout/inspectorTabs'

// ─── Guard ────────────────────────────────────────────────────────────────────
// Returns true when the event target is an editable field — shortcuts should
// not fire there to avoid hijacking normal typing.

export function isEditable(e: KeyboardEvent): boolean {
  const t = e.target as HTMLElement
  return t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable
}

// ─── Right-panel shortcuts ────────────────────────────────────────────────────
//
//   Shift+1–N       Jump to panel tab by position (ALL_TABS order, no fixed mapping)
//   Shift+,         Previous sub-tab of the active parent tab
//   Shift+.         Next sub-tab of the active parent tab

const DIGIT_CODES = [
  'Digit1',
  'Digit2',
  'Digit3',
  'Digit4',
  'Digit5',
  'Digit6',
  'Digit7',
  'Digit8',
  'Digit9',
]

interface PanelShortcutActions {
  activeTab: InspectorTab
  visibleTabs: InspectorTab[]
  setActiveTab: (tab: InspectorTab) => void
  setIsOpen: (open: boolean) => void
  setSimSubTab: Dispatch<SetStateAction<SimSubTab>>
  setDebugSubTab: Dispatch<SetStateAction<DebugSubTab>>
}

export function usePanelShortcuts({
  activeTab,
  visibleTabs,
  setActiveTab,
  setIsOpen,
  setSimSubTab,
  setDebugSubTab,
}: PanelShortcutActions) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return
      if (isEditable(e)) return

      // Shift+1–N → panel tab by position in visibleTabs (feature-flag-aware)
      const digit = DIGIT_CODES.indexOf(e.code)
      if (digit !== -1 && digit < visibleTabs.length) {
        e.preventDefault()
        setActiveTab(visibleTabs[digit])
        setIsOpen(true)
        return
      }

      // Shift+, / Shift+. → prev / next sub-tab (Shift+, = "<", Shift+. = ">")
      if (e.code === 'Comma' || e.code === 'Period') {
        e.preventDefault()
        const dir = e.code === 'Comma' ? -1 : 1
        if (activeTab === 'simulator') {
          setSimSubTab(cur => {
            const idx = SIM_SUB_TABS.findIndex(s => s.id === cur)
            return SIM_SUB_TABS[(idx + dir + SIM_SUB_TABS.length) % SIM_SUB_TABS.length].id
          })
        } else if (activeTab === 'chapter') {
          setDebugSubTab(cur => {
            const idx = DEBUG_SUB_TABS.findIndex(s => s.id === cur)
            return DEBUG_SUB_TABS[(idx + dir + DEBUG_SUB_TABS.length) % DEBUG_SUB_TABS.length].id
          })
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [activeTab, visibleTabs, setActiveTab, setIsOpen, setSimSubTab, setDebugSubTab])
}

// ─── Left-panel shortcuts ─────────────────────────────────────────────────────
//
//   Alt+1–N         Jump to left-panel tab by position (tabs array order)
//   Shift+F         Focus the screen search input

interface SidebarShortcutActions {
  tabs: string[]
  setTab: (tab: string) => void
  focusSearch: () => void
}

// ─── Navigation shortcuts ─────────────────────────────────────────────────────
//
//   ArrowLeft / ArrowRight     Previous / next screen within the current flow
//   Shift+ArrowLeft / Right    Previous / next flow (lands on its first screen)

interface NavigationShortcutActions {
  chapters: Chapter[]
  activeViewId: string
  navigateTo: (id: string) => void
}

export function useNavigationShortcuts({
  chapters,
  activeViewId,
  navigateTo,
}: NavigationShortcutActions) {
  // Flat list of all non-play screens, grouped by flow
  const allPages = useMemo(
    () => chapters.flatMap(f => (f.children ?? []).filter(v => !v.id.endsWith('-play'))),
    [chapters]
  )

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey || e.ctrlKey || e.altKey) return
      if (isEditable(e)) return
      if (e.code !== 'ArrowLeft' && e.code !== 'ArrowRight') return

      e.preventDefault()
      const dir = e.code === 'ArrowLeft' ? -1 : 1

      if (e.shiftKey) {
        // Jump to the first screen of the prev / next flow
        const chapterIdx = chapters.findIndex(f => activeViewId.startsWith(f.id))
        if (chapterIdx === -1) return
        const nextFlow = chapters[chapterIdx + dir]
        if (!nextFlow) return
        const firstScreen = (nextFlow.children ?? []).find(v => !v.id.endsWith('-play'))
        if (firstScreen) navigateTo(firstScreen.id)
      } else {
        // Cycle screens within all screens (wraps across chapters)
        const idx = allPages.findIndex(v => v.id === activeViewId)
        if (idx === -1) return
        const next = allPages[idx + dir]
        if (next) navigateTo(next.id)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [chapters, allPages, activeViewId, navigateTo])
}

// ─── Global overlay shortcuts ─────────────────────────────────────────────────
//
//   Shift+G          → open Go-To modal
//   Cmd+/ (no shift) → open Action Center
//   Cmd+Shift+/      → open Help

interface OverlayShortcutActions {
  openGoTo: () => void
  openActions: () => void
  openHelp: () => void
  openSettings: () => void
  openCommentForm: () => void
}

export function useGlobalOverlayShortcuts({
  openGoTo,
  openActions,
  openHelp,
  openSettings,
  openCommentForm,
}: OverlayShortcutActions) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Cmd+K → open feedback tab + comment form (always, regardless of panel state)
      if (e.code === 'KeyK' && (e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey) {
        e.preventDefault()
        openCommentForm()
        return
      }
      // Cmd+, → Settings
      if (e.code === 'Comma' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault()
        openSettings()
        return
      }
      // Shift+G → Go-To (no meta/ctrl/alt)
      if (
        e.code === 'KeyG' &&
        e.shiftKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !isEditable(e)
      ) {
        e.preventDefault()
        openGoTo()
        return
      }
      // Cmd+Shift+/ → Help (must check shift first, before the plain Cmd+/ branch)
      if (e.code === 'Slash' && (e.metaKey || e.ctrlKey) && e.shiftKey) {
        e.preventDefault()
        openHelp()
        return
      }
      // Cmd+/ → Action Center
      if (e.code === 'Slash' && (e.metaKey || e.ctrlKey) && !e.shiftKey) {
        e.preventDefault()
        openActions()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [openGoTo, openActions, openHelp, openSettings, openCommentForm])
}

export function useSidebarShortcuts({ tabs, setTab, focusSearch }: SidebarShortcutActions) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // Shift+F → focus search (no meta/ctrl/alt)
      if (
        e.shiftKey &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        e.code === 'KeyF' &&
        !isEditable(e)
      ) {
        e.preventDefault()
        focusSearch()
        return
      }

      // Alt+1–N → left-panel tab by position
      if (e.altKey && !e.metaKey && !e.ctrlKey && !e.shiftKey && !isEditable(e)) {
        const digit = DIGIT_CODES.indexOf(e.code)
        if (digit !== -1 && digit < tabs.length) {
          e.preventDefault()
          setTab(tabs[digit])
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tabs, setTab, focusSearch])
}

// ─── FlowLens right-panel shortcuts ──────────────────────────────────────────
//
//   Shift+1–N   Jump to FlowLens inspector tab by position
//               Heatmap tab is only visible when the session has cursor samples.

interface FlowLensPanelShortcutActions {
  setTab: (t: string) => void
  setOpen: (v: boolean) => void
  hasCursorSamples: boolean
}

export function useFlowLensPanelShortcuts({
  setTab,
  setOpen,
  hasCursorSamples,
}: FlowLensPanelShortcutActions) {
  useEffect(() => {
    const SESSION_TABS = ['overview', 'timeline', 'paths', 'funnel', 'heatmap']
    const visibleTabs = SESSION_TABS.filter(t => t !== 'heatmap' || hasCursorSamples)
    function onKey(e: KeyboardEvent) {
      if (!e.shiftKey || e.metaKey || e.ctrlKey || e.altKey) return
      if (isEditable(e)) return
      const digit = DIGIT_CODES.indexOf(e.code)
      if (digit !== -1 && digit < visibleTabs.length) {
        e.preventDefault()
        setTab(visibleTabs[digit])
        setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [setTab, setOpen, hasCursorSamples])
}

// ─── FlowLens left-panel shortcuts ───────────────────────────────────────────
//
//   Alt+1–N   Jump to FlowLens explorer tab by position

interface FlowLensSidebarShortcutActions {
  tabs: string[]
  activateTab: (t: string) => void
}

export function useFlowLensSidebarShortcuts({
  tabs,
  activateTab,
}: FlowLensSidebarShortcutActions) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!e.altKey || e.metaKey || e.ctrlKey || e.shiftKey) return
      if (isEditable(e)) return
      const digit = DIGIT_CODES.indexOf(e.code)
      if (digit !== -1 && digit < tabs.length) {
        e.preventDefault()
        activateTab(tabs[digit])
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [tabs, activateTab])
}

// ─── Canvas shortcuts ─────────────────────────────────────────────────────────
//
//   Cmd+=          Zoom in
//   Cmd+-          Zoom out
//   Cmd+0          Reset zoom
//   Cmd+Shift+0    Toggle keep-fit
//   0              Toggle keep-fit
//   F              Toggle fullscreen
//   \              Toggle orientation
//   R              Reset to first screen (or restart flowStory)
//   Escape         Exit fullscreen
//   ArrowUp/Down   Blocked when keep-fit is active (prevents scroll interference)

interface CanvasShortcutActions {
  zoomIn: () => void
  zoomOut: () => void
  resetZoom: () => void
  toggleKeepFit: () => void
  toggleFullscreen: () => void
  toggleOrientation: () => void
  resetToFirst: () => void
  isFullscreen: () => boolean
  isKeepFit: () => boolean
  flowPlayback: { isGating: boolean; restart: () => void } | null | undefined
}

export function useCanvasShortcuts({
  zoomIn,
  zoomOut,
  resetZoom,
  toggleKeepFit,
  toggleFullscreen,
  toggleOrientation,
  resetToFirst,
  isFullscreen,
  isKeepFit,
  flowPlayback,
}: CanvasShortcutActions) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (isKeepFit() && (e.key === 'ArrowUp' || e.key === 'ArrowDown') && !isEditable(e)) {
        e.preventDefault()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '=') {
        e.preventDefault()
        zoomIn()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '-') {
        e.preventDefault()
        zoomOut()
        return
      }
      if (e.key === '0' && !e.metaKey && !e.ctrlKey && !e.altKey && !e.shiftKey) {
        toggleKeepFit()
        return
      }
      if ((e.key === 'f' || e.key === 'F') && !e.metaKey && !e.ctrlKey && !e.altKey) {
        if (isEditable(e)) return
        toggleFullscreen()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.shiftKey && e.key === '0') {
        e.preventDefault()
        toggleKeepFit()
        return
      }
      if ((e.metaKey || e.ctrlKey) && e.key === '0') {
        e.preventDefault()
        resetZoom()
        return
      }
      if (e.code === 'Backslash' && !e.metaKey && !e.ctrlKey && !e.altKey && !isEditable(e)) {
        e.preventDefault()
        toggleOrientation()
        return
      }
      if (
        (e.key === 'r' || e.key === 'R') &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey &&
        !e.shiftKey &&
        !isEditable(e)
      ) {
        e.preventDefault()
        if (flowPlayback?.isGating) flowPlayback.restart()
        else resetToFirst()
        return
      }
      if (e.key === 'Escape' && isFullscreen()) {
        toggleFullscreen()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [
    zoomIn,
    zoomOut,
    resetZoom,
    toggleKeepFit,
    toggleFullscreen,
    toggleOrientation,
    resetToFirst,
    isFullscreen,
    isKeepFit,
    flowPlayback,
  ])
}

// ─── App-level shortcuts ──────────────────────────────────────────────────────
//
//   Cmd+Alt+Shift+P   Toggle canvas / preview mode

interface AppShortcutActions {
  toggleCanvasMode: () => void
}

export function useAppShortcuts({ toggleCanvasMode }: AppShortcutActions) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.metaKey && e.altKey && e.shiftKey && e.code === 'KeyP') {
        e.preventDefault()
        toggleCanvasMode()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [toggleCanvasMode])
}
