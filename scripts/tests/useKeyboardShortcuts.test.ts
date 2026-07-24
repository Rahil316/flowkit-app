/* @vitest-environment jsdom */
import type { Chapter } from '@flowkit/types/index'
import type { InspectorTab } from '@flowkit-core/layout/inspectorTabs'
import {
  useAppShortcuts,
  useCanvasShortcuts,
  useFlowLensPanelShortcuts,
  useFlowLensSidebarShortcuts,
  useGlobalOverlayShortcuts,
  useNavigationShortcuts,
  usePanelShortcuts,
  useSidebarShortcuts,
} from '@flowkit-core/shortcuts/useKeyboardShortcuts'
import React, { act } from 'react'
import { createRoot } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Fire a KeyboardEvent on window and return it. */
function key(
  code: string,
  opts: {
    key?: string
    shiftKey?: boolean
    metaKey?: boolean
    ctrlKey?: boolean
    altKey?: boolean
    target?: EventTarget
  } = {}
): KeyboardEvent {
  const e = new KeyboardEvent('keydown', {
    code,
    key: opts.key ?? code.replace('Digit', '').replace('Key', '').replace('Arrow', ''),
    shiftKey: opts.shiftKey ?? false,
    metaKey: opts.metaKey ?? false,
    ctrlKey: opts.ctrlKey ?? false,
    altKey: opts.altKey ?? false,
    bubbles: true,
    cancelable: true,
  })
  if (opts.target) {
    Object.defineProperty(e, 'target', { value: opts.target, writable: false })
  }
  window.dispatchEvent(e)
  return e
}

/** Make an INPUT element that isEditable() will recognise. */
function makeInput(): HTMLInputElement {
  const el = document.createElement('input')
  document.body.appendChild(el)
  return el
}

/** Mount a React component that calls a hook and returns a cleanup fn. */
let container: HTMLDivElement | null = null
let root: ReturnType<typeof createRoot> | null = null

function mount(component: React.ReactElement) {
  if (!container) {
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
  }
  act(() => {
    root!.render(component)
  })
}

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => {
    root?.render(null)
  })
  container?.remove()
  container = null
  root = null
  // Remove any stray input elements added by makeInput()
  document.querySelectorAll('input').forEach(el => el.remove())
})

// ─── isEditable guard (tested indirectly via each hook) ───────────────────────
// Covered inline in the relevant hook suites below.

// ─── usePanelShortcuts ────────────────────────────────────────────────────────

describe('usePanelShortcuts', () => {
  it('Shift+1 activates the first visible tab and opens panel', () => {
    const setActiveTab = vi.fn()
    const setIsOpen = vi.fn()
    const setSimSubTab = vi.fn()
    const setDebugSubTab = vi.fn()
    const visibleTabs = ['feedback', 'info', 'simulator', 'chapter'] as const

    function Comp() {
      usePanelShortcuts({
        activeTab: 'info',
        visibleTabs: visibleTabs as unknown as InspectorTab[],
        setActiveTab,
        setIsOpen,
        setSimSubTab,
        setDebugSubTab,
      })
      return null
    }
    mount(React.createElement(Comp))
    key('Digit1', { shiftKey: true })
    expect(setActiveTab).toHaveBeenCalledWith('feedback')
    expect(setIsOpen).toHaveBeenCalledWith(true)
  })

  it('Shift+3 activates third visible tab', () => {
    const setActiveTab = vi.fn()
    const setIsOpen = vi.fn()
    const visibleTabs = ['feedback', 'info', 'simulator', 'chapter'] as const

    function Comp() {
      usePanelShortcuts({
        activeTab: 'info',
        visibleTabs: visibleTabs as unknown as InspectorTab[],
        setActiveTab,
        setIsOpen,
        setSimSubTab: vi.fn(),
        setDebugSubTab: vi.fn(),
      })
      return null
    }
    mount(React.createElement(Comp))
    key('Digit3', { shiftKey: true })
    expect(setActiveTab).toHaveBeenCalledWith('simulator')
  })

  it('Shift+Num out of range does nothing', () => {
    const setActiveTab = vi.fn()
    function Comp() {
      usePanelShortcuts({
        activeTab: 'info',
        visibleTabs: ['feedback', 'info'] as unknown as InspectorTab[],
        setActiveTab,
        setIsOpen: vi.fn(),
        setSimSubTab: vi.fn(),
        setDebugSubTab: vi.fn(),
      })
      return null
    }
    mount(React.createElement(Comp))
    key('Digit9', { shiftKey: true })
    expect(setActiveTab).not.toHaveBeenCalled()
  })

  it('Shift+. cycles simulator sub-tab forward', () => {
    const setSimSubTab = vi.fn()
    function Comp() {
      usePanelShortcuts({
        activeTab: 'simulator',
        visibleTabs: ['simulator'] as unknown as InspectorTab[],
        setActiveTab: vi.fn(),
        setIsOpen: vi.fn(),
        setSimSubTab,
        setDebugSubTab: vi.fn(),
      })
      return null
    }
    mount(React.createElement(Comp))
    key('Period', { shiftKey: true, key: '>' })
    expect(setSimSubTab).toHaveBeenCalled()
    // Call the updater fn with the first tab to verify direction
    const updater = setSimSubTab.mock.calls[0][0]
    expect(updater('device')).toBe('workspace')
  })

  it('Shift+, cycles simulator sub-tab backward', () => {
    const setSimSubTab = vi.fn()
    function Comp() {
      usePanelShortcuts({
        activeTab: 'simulator',
        visibleTabs: ['simulator'] as unknown as InspectorTab[],
        setActiveTab: vi.fn(),
        setIsOpen: vi.fn(),
        setSimSubTab,
        setDebugSubTab: vi.fn(),
      })
      return null
    }
    mount(React.createElement(Comp))
    key('Comma', { shiftKey: true, key: '<' })
    const updater = setSimSubTab.mock.calls[0][0]
    expect(updater('device')).toBe('workspace') // wraps around
  })

  it('Shift+. cycles flow debugger sub-tab forward', () => {
    const setDebugSubTab = vi.fn()
    function Comp() {
      usePanelShortcuts({
        activeTab: 'chapter',
        visibleTabs: ['chapter'] as unknown as InspectorTab[],
        setActiveTab: vi.fn(),
        setIsOpen: vi.fn(),
        setSimSubTab: vi.fn(),
        setDebugSubTab,
      })
      return null
    }
    mount(React.createElement(Comp))
    key('Period', { shiftKey: true, key: '>' })
    const updater = setDebugSubTab.mock.calls[0][0]
    expect(updater('journey')).toBe('effects')
  })

  it('does not fire when target is an input (isEditable guard)', () => {
    const setActiveTab = vi.fn()
    function Comp() {
      usePanelShortcuts({
        activeTab: 'info',
        visibleTabs: ['feedback', 'info'] as unknown as InspectorTab[],
        setActiveTab,
        setIsOpen: vi.fn(),
        setSimSubTab: vi.fn(),
        setDebugSubTab: vi.fn(),
      })
      return null
    }
    mount(React.createElement(Comp))
    const input = makeInput()
    key('Digit1', { shiftKey: true, target: input })
    expect(setActiveTab).not.toHaveBeenCalled()
  })

  it('does not fire without Shift modifier', () => {
    const setActiveTab = vi.fn()
    function Comp() {
      usePanelShortcuts({
        activeTab: 'info',
        visibleTabs: ['feedback', 'info'] as unknown as InspectorTab[],
        setActiveTab,
        setIsOpen: vi.fn(),
        setSimSubTab: vi.fn(),
        setDebugSubTab: vi.fn(),
      })
      return null
    }
    mount(React.createElement(Comp))
    key('Digit1')
    expect(setActiveTab).not.toHaveBeenCalled()
  })
})

// ─── useSidebarShortcuts ──────────────────────────────────────────────────────

describe('useSidebarShortcuts', () => {
  it('Alt+1 sets the first tab', () => {
    const setTab = vi.fn()
    function Comp() {
      useSidebarShortcuts({ tabs: ['flows', 'screens', 'assets'], setTab, focusSearch: vi.fn() })
      return null
    }
    mount(React.createElement(Comp))
    key('Digit1', { altKey: true })
    expect(setTab).toHaveBeenCalledWith('flows')
  })

  it('Alt+2 sets the second tab', () => {
    const setTab = vi.fn()
    function Comp() {
      useSidebarShortcuts({ tabs: ['flows', 'screens', 'assets'], setTab, focusSearch: vi.fn() })
      return null
    }
    mount(React.createElement(Comp))
    key('Digit2', { altKey: true })
    expect(setTab).toHaveBeenCalledWith('screens')
  })

  it('Alt+Num out of range does nothing', () => {
    const setTab = vi.fn()
    function Comp() {
      useSidebarShortcuts({ tabs: ['flows'], setTab, focusSearch: vi.fn() })
      return null
    }
    mount(React.createElement(Comp))
    key('Digit5', { altKey: true })
    expect(setTab).not.toHaveBeenCalled()
  })

  it('Shift+F calls focusSearch', () => {
    const focusSearch = vi.fn()
    function Comp() {
      useSidebarShortcuts({ tabs: ['flows'], setTab: vi.fn(), focusSearch })
      return null
    }
    mount(React.createElement(Comp))
    key('KeyF', { shiftKey: true, key: 'F' })
    expect(focusSearch).toHaveBeenCalled()
  })

  it('Shift+F does not fire inside an input', () => {
    const focusSearch = vi.fn()
    function Comp() {
      useSidebarShortcuts({ tabs: ['flows'], setTab: vi.fn(), focusSearch })
      return null
    }
    mount(React.createElement(Comp))
    const input = makeInput()
    key('KeyF', { shiftKey: true, key: 'F', target: input })
    expect(focusSearch).not.toHaveBeenCalled()
  })
})

// ─── useNavigationShortcuts ───────────────────────────────────────────────────

describe('useNavigationShortcuts', () => {
  const chapters = [
    {
      id: 'onboarding',
      children: [
        { id: 'onboarding-welcome' },
        { id: 'onboarding-setup' },
        { id: 'onboarding-play' }, // filtered out
      ],
    },
    {
      id: 'home',
      children: [{ id: 'home-dashboard' }, { id: 'home-settings' }],
    },
  ] as unknown as Chapter[]

  it('ArrowRight navigates to the next screen', () => {
    const navigateTo = vi.fn()
    function Comp() {
      useNavigationShortcuts({ chapters, activeViewId: 'onboarding-welcome', navigateTo })
      return null
    }
    mount(React.createElement(Comp))
    key('ArrowRight', { key: 'ArrowRight' })
    expect(navigateTo).toHaveBeenCalledWith('onboarding-setup')
  })

  it('ArrowLeft navigates to the previous screen', () => {
    const navigateTo = vi.fn()
    function Comp() {
      useNavigationShortcuts({ chapters, activeViewId: 'onboarding-setup', navigateTo })
      return null
    }
    mount(React.createElement(Comp))
    key('ArrowLeft', { key: 'ArrowLeft' })
    expect(navigateTo).toHaveBeenCalledWith('onboarding-welcome')
  })

  it('Shift+ArrowRight jumps to next flow', () => {
    const navigateTo = vi.fn()
    function Comp() {
      useNavigationShortcuts({ chapters, activeViewId: 'onboarding-welcome', navigateTo })
      return null
    }
    mount(React.createElement(Comp))
    key('ArrowRight', { key: 'ArrowRight', shiftKey: true })
    expect(navigateTo).toHaveBeenCalledWith('home-dashboard')
  })

  it('Shift+ArrowLeft on the first flow does nothing (no prev flow)', () => {
    const navigateTo = vi.fn()
    function Comp() {
      useNavigationShortcuts({ chapters, activeViewId: 'onboarding-welcome', navigateTo })
      return null
    }
    mount(React.createElement(Comp))
    key('ArrowLeft', { key: 'ArrowLeft', shiftKey: true })
    expect(navigateTo).not.toHaveBeenCalled()
  })

  it('-play screens are skipped', () => {
    const navigateTo = vi.fn()
    function Comp() {
      useNavigationShortcuts({ chapters, activeViewId: 'onboarding-setup', navigateTo })
      return null
    }
    mount(React.createElement(Comp))
    key('ArrowRight', { key: 'ArrowRight' })
    // onboarding-play is skipped, lands on home-dashboard
    expect(navigateTo).toHaveBeenCalledWith('home-dashboard')
  })

  it('does not fire with Cmd modifier', () => {
    const navigateTo = vi.fn()
    function Comp() {
      useNavigationShortcuts({ chapters, activeViewId: 'onboarding-welcome', navigateTo })
      return null
    }
    mount(React.createElement(Comp))
    key('ArrowRight', { key: 'ArrowRight', metaKey: true })
    expect(navigateTo).not.toHaveBeenCalled()
  })

  it('does not fire inside an input', () => {
    const navigateTo = vi.fn()
    function Comp() {
      useNavigationShortcuts({ chapters, activeViewId: 'onboarding-welcome', navigateTo })
      return null
    }
    mount(React.createElement(Comp))
    const input = makeInput()
    key('ArrowRight', { key: 'ArrowRight', target: input })
    expect(navigateTo).not.toHaveBeenCalled()
  })
})

// ─── useGlobalOverlayShortcuts ────────────────────────────────────────────────

describe('useGlobalOverlayShortcuts', () => {
  function makeActions() {
    return {
      openGoTo: vi.fn(),
      openActions: vi.fn(),
      openHelp: vi.fn(),
      openSettings: vi.fn(),
      openCommentForm: vi.fn(),
    }
  }

  function Comp(actions: ReturnType<typeof makeActions>) {
    useGlobalOverlayShortcuts(actions)
    return null
  }

  it('Cmd+K opens comment form', () => {
    const actions = makeActions()
    mount(React.createElement(Comp, actions))
    key('KeyK', { key: 'k', metaKey: true })
    expect(actions.openCommentForm).toHaveBeenCalled()
  })

  it('Cmd+, opens settings', () => {
    const actions = makeActions()
    mount(React.createElement(Comp, actions))
    key('Comma', { key: ',', metaKey: true })
    expect(actions.openSettings).toHaveBeenCalled()
  })

  it('Shift+G opens go-to', () => {
    const actions = makeActions()
    mount(React.createElement(Comp, actions))
    key('KeyG', { key: 'G', shiftKey: true })
    expect(actions.openGoTo).toHaveBeenCalled()
  })

  it('Shift+G does not fire inside an input', () => {
    const actions = makeActions()
    mount(React.createElement(Comp, actions))
    const input = makeInput()
    key('KeyG', { key: 'G', shiftKey: true, target: input })
    expect(actions.openGoTo).not.toHaveBeenCalled()
  })

  it('Cmd+/ opens action center', () => {
    const actions = makeActions()
    mount(React.createElement(Comp, actions))
    key('Slash', { key: '/', metaKey: true })
    expect(actions.openActions).toHaveBeenCalled()
  })

  it('Cmd+Shift+/ opens help (not action center)', () => {
    const actions = makeActions()
    mount(React.createElement(Comp, actions))
    key('Slash', { key: '/', metaKey: true, shiftKey: true })
    expect(actions.openHelp).toHaveBeenCalled()
    expect(actions.openActions).not.toHaveBeenCalled()
  })
})

// ─── useFlowLensPanelShortcuts ────────────────────────────────────────────────

describe('useFlowLensPanelShortcuts', () => {
  it('Shift+1 sets overview tab and opens panel', () => {
    const setTab = vi.fn()
    const setOpen = vi.fn()
    function Comp() {
      useFlowLensPanelShortcuts({ tab: 'overview', setTab, setOpen, hasCursorSamples: false })
      return null
    }
    mount(React.createElement(Comp))
    key('Digit1', { shiftKey: true })
    expect(setTab).toHaveBeenCalledWith('overview')
    expect(setOpen).toHaveBeenCalledWith(true)
  })

  it('Shift+5 sets heatmap tab when cursor samples exist', () => {
    const setTab = vi.fn()
    function Comp() {
      useFlowLensPanelShortcuts({
        tab: 'overview',
        setTab,
        setOpen: vi.fn(),
        hasCursorSamples: true,
      })
      return null
    }
    mount(React.createElement(Comp))
    key('Digit5', { shiftKey: true })
    expect(setTab).toHaveBeenCalledWith('heatmap')
  })

  it('Shift+5 does nothing when no cursor samples (heatmap hidden)', () => {
    const setTab = vi.fn()
    function Comp() {
      useFlowLensPanelShortcuts({
        tab: 'overview',
        setTab,
        setOpen: vi.fn(),
        hasCursorSamples: false,
      })
      return null
    }
    mount(React.createElement(Comp))
    key('Digit5', { shiftKey: true })
    expect(setTab).not.toHaveBeenCalled()
  })

  it('Shift+4 sets funnel tab (4th of 4 without heatmap)', () => {
    const setTab = vi.fn()
    function Comp() {
      useFlowLensPanelShortcuts({
        tab: 'overview',
        setTab,
        setOpen: vi.fn(),
        hasCursorSamples: false,
      })
      return null
    }
    mount(React.createElement(Comp))
    key('Digit4', { shiftKey: true })
    expect(setTab).toHaveBeenCalledWith('funnel')
  })

  it('does not fire inside an input', () => {
    const setTab = vi.fn()
    function Comp() {
      useFlowLensPanelShortcuts({
        tab: 'overview',
        setTab,
        setOpen: vi.fn(),
        hasCursorSamples: true,
      })
      return null
    }
    mount(React.createElement(Comp))
    const input = makeInput()
    key('Digit1', { shiftKey: true, target: input })
    expect(setTab).not.toHaveBeenCalled()
  })
})

// ─── useFlowLensSidebarShortcuts ──────────────────────────────────────────────

describe('useFlowLensSidebarShortcuts', () => {
  it('Alt+1 activates the library tab', () => {
    const activateTab = vi.fn()
    function Comp() {
      useFlowLensSidebarShortcuts({
        tabs: ['library', 'imports'],
        tab: 'library',
        activateTab,
        isOpen: true,
      })
      return null
    }
    mount(React.createElement(Comp))
    key('Digit1', { altKey: true })
    expect(activateTab).toHaveBeenCalledWith('library')
  })

  it('Alt+2 activates the imports tab', () => {
    const activateTab = vi.fn()
    function Comp() {
      useFlowLensSidebarShortcuts({
        tabs: ['library', 'imports'],
        tab: 'library',
        activateTab,
        isOpen: true,
      })
      return null
    }
    mount(React.createElement(Comp))
    key('Digit2', { altKey: true })
    expect(activateTab).toHaveBeenCalledWith('imports')
  })

  it('Alt+3 out of range does nothing', () => {
    const activateTab = vi.fn()
    function Comp() {
      useFlowLensSidebarShortcuts({
        tabs: ['library', 'imports'],
        tab: 'library',
        activateTab,
        isOpen: true,
      })
      return null
    }
    mount(React.createElement(Comp))
    key('Digit3', { altKey: true })
    expect(activateTab).not.toHaveBeenCalled()
  })

  it('does not fire inside an input', () => {
    const activateTab = vi.fn()
    function Comp() {
      useFlowLensSidebarShortcuts({
        tabs: ['library', 'imports'],
        tab: 'library',
        activateTab,
        isOpen: true,
      })
      return null
    }
    mount(React.createElement(Comp))
    const input = makeInput()
    key('Digit1', { altKey: true, target: input })
    expect(activateTab).not.toHaveBeenCalled()
  })
})

// ─── useCanvasShortcuts ───────────────────────────────────────────────────────

describe('useCanvasShortcuts', () => {
  function makeActions(overrides: Partial<Parameters<typeof useCanvasShortcuts>[0]> = {}) {
    return {
      zoomIn: vi.fn(),
      zoomOut: vi.fn(),
      resetZoom: vi.fn(),
      toggleKeepFit: vi.fn(),
      toggleFullscreen: vi.fn(),
      toggleOrientation: vi.fn(),
      resetToFirst: vi.fn(),
      isFullscreen: vi.fn(() => false),
      isKeepFit: vi.fn(() => false),
      flowPlayback: null,
      ...overrides,
    }
  }

  it('Cmd+= zooms in', () => {
    const a = makeActions()
    mount(
      React.createElement(() => {
        useCanvasShortcuts(a)
        return null
      })
    )
    key('Equal', { key: '=', metaKey: true })
    expect(a.zoomIn).toHaveBeenCalled()
  })

  it('Cmd+- zooms out', () => {
    const a = makeActions()
    mount(
      React.createElement(() => {
        useCanvasShortcuts(a)
        return null
      })
    )
    key('Minus', { key: '-', metaKey: true })
    expect(a.zoomOut).toHaveBeenCalled()
  })

  it('Cmd+0 resets zoom', () => {
    const a = makeActions()
    mount(
      React.createElement(() => {
        useCanvasShortcuts(a)
        return null
      })
    )
    key('Digit0', { key: '0', metaKey: true })
    expect(a.resetZoom).toHaveBeenCalled()
  })

  it('0 (bare) toggles keep-fit', () => {
    const a = makeActions()
    mount(
      React.createElement(() => {
        useCanvasShortcuts(a)
        return null
      })
    )
    key('Digit0', { key: '0' })
    expect(a.toggleKeepFit).toHaveBeenCalled()
  })

  it('Cmd+Shift+0 toggles keep-fit', () => {
    const a = makeActions()
    mount(
      React.createElement(() => {
        useCanvasShortcuts(a)
        return null
      })
    )
    key('Digit0', { key: '0', metaKey: true, shiftKey: true })
    expect(a.toggleKeepFit).toHaveBeenCalled()
  })

  it('F toggles fullscreen', () => {
    const a = makeActions()
    mount(
      React.createElement(() => {
        useCanvasShortcuts(a)
        return null
      })
    )
    key('KeyF', { key: 'f' })
    expect(a.toggleFullscreen).toHaveBeenCalled()
  })

  it('F does not toggle fullscreen inside an input', () => {
    const a = makeActions()
    mount(
      React.createElement(() => {
        useCanvasShortcuts(a)
        return null
      })
    )
    const input = makeInput()
    key('KeyF', { key: 'f', target: input })
    expect(a.toggleFullscreen).not.toHaveBeenCalled()
  })

  it('\\ toggles orientation', () => {
    const a = makeActions()
    mount(
      React.createElement(() => {
        useCanvasShortcuts(a)
        return null
      })
    )
    key('Backslash', { key: '\\' })
    expect(a.toggleOrientation).toHaveBeenCalled()
  })

  it('R resets to first screen', () => {
    const a = makeActions()
    mount(
      React.createElement(() => {
        useCanvasShortcuts(a)
        return null
      })
    )
    key('KeyR', { key: 'r' })
    expect(a.resetToFirst).toHaveBeenCalled()
  })

  it('R restarts flowStory when gating', () => {
    const restart = vi.fn()
    const a = makeActions({ flowPlayback: { isGating: true, restart } })
    mount(
      React.createElement(() => {
        useCanvasShortcuts(a)
        return null
      })
    )
    key('KeyR', { key: 'r' })
    expect(restart).toHaveBeenCalled()
    expect(a.resetToFirst).not.toHaveBeenCalled()
  })

  it('R calls resetToFirst when flowStory not gating', () => {
    const a = makeActions({ flowPlayback: { isGating: false, restart: vi.fn() } })
    mount(
      React.createElement(() => {
        useCanvasShortcuts(a)
        return null
      })
    )
    key('KeyR', { key: 'r' })
    expect(a.resetToFirst).toHaveBeenCalled()
  })

  it('Escape exits fullscreen when fullscreen is active', () => {
    const a = makeActions({ isFullscreen: () => true })
    mount(
      React.createElement(() => {
        useCanvasShortcuts(a)
        return null
      })
    )
    key('Escape', { key: 'Escape' })
    expect(a.toggleFullscreen).toHaveBeenCalled()
  })

  it('Escape does nothing when not fullscreen', () => {
    const a = makeActions({ isFullscreen: () => false })
    mount(
      React.createElement(() => {
        useCanvasShortcuts(a)
        return null
      })
    )
    key('Escape', { key: 'Escape' })
    expect(a.toggleFullscreen).not.toHaveBeenCalled()
  })

  it('ArrowUp is blocked when keep-fit is active', () => {
    const a = makeActions({ isKeepFit: () => true })
    mount(
      React.createElement(() => {
        useCanvasShortcuts(a)
        return null
      })
    )
    const e = new KeyboardEvent('keydown', {
      key: 'ArrowUp',
      code: 'ArrowUp',
      cancelable: true,
      bubbles: true,
    })
    window.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(true)
  })

  it('ArrowUp is not blocked when keep-fit is off', () => {
    const a = makeActions({ isKeepFit: () => false })
    mount(
      React.createElement(() => {
        useCanvasShortcuts(a)
        return null
      })
    )
    const e = new KeyboardEvent('keydown', {
      key: 'ArrowUp',
      code: 'ArrowUp',
      cancelable: true,
      bubbles: true,
    })
    window.dispatchEvent(e)
    expect(e.defaultPrevented).toBe(false)
  })
})

// ─── useAppShortcuts ──────────────────────────────────────────────────────────

describe('useAppShortcuts', () => {
  it('Cmd+Alt+Shift+P calls toggleCanvasMode', () => {
    const toggleCanvasMode = vi.fn()
    mount(
      React.createElement(() => {
        useAppShortcuts({ toggleCanvasMode })
        return null
      })
    )
    key('KeyP', { metaKey: true, altKey: true, shiftKey: true })
    expect(toggleCanvasMode).toHaveBeenCalled()
  })

  it('Cmd+Shift+P without Alt does nothing', () => {
    const toggleCanvasMode = vi.fn()
    mount(
      React.createElement(() => {
        useAppShortcuts({ toggleCanvasMode })
        return null
      })
    )
    key('KeyP', { metaKey: true, shiftKey: true })
    expect(toggleCanvasMode).not.toHaveBeenCalled()
  })

  it('P bare does nothing', () => {
    const toggleCanvasMode = vi.fn()
    mount(
      React.createElement(() => {
        useAppShortcuts({ toggleCanvasMode })
        return null
      })
    )
    key('KeyP', { key: 'p' })
    expect(toggleCanvasMode).not.toHaveBeenCalled()
  })
})
