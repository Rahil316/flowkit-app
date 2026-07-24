import type {
  AutoPlayConfig,
  ColorBlindMode,
  ConnectionMode,
  DashboardState,
  DevicePreset,
  NetworkSpeed,
} from '@flowkit/types/index'
import type { WorkspaceConfig } from '@flowkit/workspaces'
import { DEVICE_PRESETS } from '@flowkit-shared/components/devices'
import { getWorkspaceDb } from '@flowkit-shared/utils/workspaceModules'
import type { ReactNode } from 'react'
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { useActiveWorkspace } from './ActiveWorkspaceContext'
import { useFlowLensModeOptional } from './FlowLensModeContext'
import { NavigationContext } from './NavigationContext'
import { useSessionRecorderShared } from './SessionRecorderContext'
import { SimulatorContext } from './SimulatorContext'

// Re-export focused hooks so consumers can opt into smaller re-render surfaces
// without changing their import path to DashboardContext.
export { useNavigation } from './NavigationContext'
export { useSimulator } from './SimulatorContext'

export type Orientation = 'portrait' | 'landscape'

export interface TransitionLogEntry {
  timestamp: string
  action: string
  payload?: unknown
  fromPage: string
  toPage: string
  warnings?: string[]
  error?: string
}

export interface FlowDebugInfo {
  history: string[]
  state: Record<string, unknown>
  transitionLog: TransitionLogEntry[]
  effects: string[]
}

export interface DashboardContextValue extends DashboardState {
  orientation: Orientation
  canGoBack: boolean
  navigateTo: (id: string) => void
  /** Per-screen variant override — keyed by view id, value is the selected variant serial. */
  activeVariantByView: Record<string, string>
  setVariantForView: (viewId: string, serial: string) => void
  goBack: () => void
  goHome: () => void
  setDevicePreset: (preset: DevicePreset) => void
  toggleOrientation: () => void
  resetToFirst: () => void

  // Simulator — OS / device conditions
  connectionMode: ConnectionMode
  setConnectionMode: (v: ConnectionMode) => void
  networkSpeed: NetworkSpeed
  setNetworkSpeed: (v: NetworkSpeed) => void
  colorBlindMode: ColorBlindMode
  setColorBlindMode: (v: ColorBlindMode) => void
  blurryVision: number
  setBlurryVision: (v: number) => void

  simulatorEnabled: boolean
  setSimulatorEnabled: (v: boolean) => void

  firstViewId: string
  workspaceConfig: WorkspaceConfig
  /** Active flowStory's declared home screen (FlowStoryDef.homeScreen), or null when unset/no flow active. */
  activeFlowHomeScreen: string | null
  setActiveFlowHomeScreen: (pageId: string | null) => void
  activeFlowDebugInfo: FlowDebugInfo | null
  setActiveFlowDebugInfo: (info: FlowDebugInfo | null) => void
  flowAutoPlayOverride: Partial<AutoPlayConfig> | null
  setFlowAutoPlayOverride: (v: Partial<AutoPlayConfig> | null) => void
  flowAutoPlayPaused: boolean
  setFlowAutoPlayPaused: (v: boolean) => void
  // Flat bindings for SimControl — each writes into flowAutoPlayOverride
  flowAutoPlayEnabled: boolean
  setFlowAutoPlayEnabled: (v: boolean) => void
  flowAutoPlayDelay: number
  setFlowAutoPlayDelay: (v: number) => void
  flowAutoPlayAnimation: string
  setFlowAutoPlayAnimation: (v: string) => void
  flowAutoPlayLoop: boolean
  setFlowAutoPlayLoop: (v: boolean) => void
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db: Record<string, any>
  updateDb: (updater: (db: Record<string, unknown>) => void) => void
  resetDb: () => void
  // FlowLens replay-only setters — drive state WITHOUT re-recording.
  replaySetDb: (next: Record<string, unknown>) => void
  // FlowStory-playback db setter — sets the deep-copied flow db WITHOUT logging a
  // state.db-patch event (automated step patches must not pollute recordings).
  // Callers pass a FULL merged object (use applyDotPathPatch), never a partial.
  flowPlaySetDb: (next: Record<string, unknown>) => void
  switchWorkspace: (name?: string) => void
}

// Preserve the context object across HMR module re-evaluations so consumers
// holding the previous reference don't suddenly read null mid-transition.
if (import.meta.hot && !import.meta.hot.data.DashboardContext) {
  import.meta.hot.data.DashboardContext = createContext<DashboardContextValue | null>(null)
}
const DashboardContext =
  (import.meta.hot?.data.DashboardContext as
    ReturnType<typeof createContext<DashboardContextValue | null>> | undefined) ??
  createContext<DashboardContextValue | null>(null)

export function DashboardProvider({
  children,
  firstViewId,
  initialDeviceLabel,
  initialOrientation,
  workspaceConfig,
  onSwitchWorkspace,
}: {
  children: ReactNode
  firstViewId: string
  /** Author-set default device preset label (workspace.ts `defaultDevice`). Falls back to DEVICE_PRESETS[0]. */
  initialDeviceLabel?: string
  /** Author-set default orientation (workspace.ts `defaultOrientation`). Falls back to "portrait". */
  initialOrientation?: Orientation
  workspaceConfig?: WorkspaceConfig
  onSwitchWorkspace?: (name?: string) => void
}) {
  const activeWorkspace = useActiveWorkspace()
  const [history, setHistory] = useState<string[]>([firstViewId])
  const [activeVariantByView, setActiveVariantByView] = useState<Record<string, string>>({})
  const setVariantForView = useCallback((viewId: string, serial: string) => {
    setActiveVariantByView(prev => ({ ...prev, [viewId]: serial }))
  }, [])
  const [devicePreset, setDevicePresetState] = useState<DevicePreset>(
    () => DEVICE_PRESETS.find(p => p.label === initialDeviceLabel) ?? DEVICE_PRESETS[0]
  )
  const [orientation, setOrientation] = useState<Orientation>(initialOrientation ?? 'portrait')

  const [connectionMode, setConnectionModeState] = useState<ConnectionMode>('wifi')
  const [networkSpeed, setNetworkSpeedState] = useState<NetworkSpeed>('strong')
  const [colorBlindMode, setColorBlindModeState] = useState<ColorBlindMode>('none')
  const [blurryVision, setBlurryVision] = useState<number>(0)
  const [simulatorEnabled, setSimulatorEnabled] = useState(false)

  // FlowMaster states
  const [activeFlowDebugInfo, setActiveFlowDebugInfo] = useState<FlowDebugInfo | null>(null)
  const [activeFlowHomeScreen, setActiveFlowHomeScreen] = useState<string | null>(null)
  const [flowAutoPlayOverride, setFlowAutoPlayOverride] = useState<Partial<AutoPlayConfig> | null>(
    null
  )
  const [flowAutoPlayPaused, setFlowAutoPlayPaused] = useState(false)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [db, setDb] = useState<Record<string, any>>(() => getWorkspaceDb(activeWorkspace))

  const activeViewId = history[history.length - 1]
  const canGoBack = history.length > 1

  const recorder = useSessionRecorderShared()

  // When FlowLens replay is driving the context, replayed setters must NOT
  // re-record events. Mirror replayActive into a ref so the callbacks below can
  // read it without taking it as a dependency (keeps their identities stable).
  const flowLens = useFlowLensModeOptional()
  const replayActive = flowLens?.replayActive ?? false
  const replayActiveRef = useRef(replayActive)
  useLayoutEffect(() => {
    replayActiveRef.current = replayActive
  })
  const rec = useCallback(
    (...args: Parameters<NonNullable<typeof recorder>['logEvent']>) => {
      if (replayActiveRef.current) return
      recorder?.logEvent(...args)
    },
    [recorder]
  )

  // ── db-init capture ───────────────────────────────────────────────────────
  // When a recording starts, snapshot the current db ONLY if it differs from the
  // workspace default. FlowLens replay seeds from this so screens render with the
  // user's real data, not defaults. (If it matches the default, nothing is logged
  // — replay falls back to the default db, which is identical.)
  const dbRef = useRef(db)
  useLayoutEffect(() => {
    dbRef.current = db
  })
  const recState = recorder?.state ?? 'idle'
  const prevRecState = useRef(recState)
  useEffect(() => {
    if (prevRecState.current === 'idle' && recState === 'recording') {
      const current = dbRef.current
      const def = getWorkspaceDb(activeWorkspace)
      if (JSON.stringify(current) !== JSON.stringify(def)) {
        recorder?.logEvent('state.db-init', { db: current })
      }
    }
    prevRecState.current = recState
  }, [recState, recorder, activeWorkspace])

  const updateDb = useCallback(
    (updater: (db: Record<string, unknown>) => void) => {
      setDb(prev => {
        const clone = JSON.parse(JSON.stringify(prev))
        updater(clone)
        // Record only the changed top-level keys as a small diff so FlowLens can
        // fold them forward and reconstruct the exact db at any point in replay.
        const patch: Record<string, unknown> = {}
        for (const k of Object.keys(clone)) {
          if (JSON.stringify(clone[k]) !== JSON.stringify(prev[k])) patch[k] = clone[k]
        }
        if (Object.keys(patch).length > 0) rec('state.db-patch', { patch })
        return clone
      })
    },
    [rec]
  )

  // Replay-only db setter — sets db WITHOUT logging (used by FlowLens to drive
  // the shared context during playback without re-recording).
  const replaySetDb = useCallback((next: Record<string, unknown>) => {
    setDb(next)
  }, [])

  // FlowStory-playback db setter — silent (no state.db-patch), so automated step
  // patches during a FlowStory don't pollute a session recording. The caller owns
  // the merge (flowPlaySetDb(applyDotPathPatch(db, patch))) and passes a full object.
  const flowPlaySetDb = useCallback((next: Record<string, unknown>) => {
    setDb(next)
  }, [])

  const resetDb = useCallback(() => {
    setDb(getWorkspaceDb(activeWorkspace))
    rec('state.db-reset', {})
  }, [rec, activeWorkspace])

  const navigateTo = useCallback(
    (id: string) => {
      if (id === activeViewId) return
      setActiveFlowDebugInfo(null)
      setHistory(h => [...h, id])
      rec('navigation.programmatic', { to: id, from: activeViewId })
      // state.chapter-set fires whenever navigation targets a flow play node
      if (id.endsWith('-play') || id.endsWith('-flow')) {
        rec('state.chapter-set', { flowId: id })
      }
    },
    [activeViewId, rec]
  )

  const goBack = useCallback(() => {
    setActiveFlowDebugInfo(null)
    setHistory(h => (h.length > 1 ? h.slice(0, -1) : h))
  }, [])

  const activeFlowHomeScreenRef = useRef(activeFlowHomeScreen)
  useLayoutEffect(() => {
    activeFlowHomeScreenRef.current = activeFlowHomeScreen
  })

  const goHome = useCallback(() => {
    setActiveFlowDebugInfo(null)
    setHistory([activeFlowHomeScreenRef.current ?? firstViewId])
  }, [firstViewId])

  const resetToFirst = useCallback(() => {
    setActiveFlowDebugInfo(null)
    setHistory([activeFlowHomeScreenRef.current ?? firstViewId])
  }, [firstViewId])

  const setDevicePreset = useCallback(
    (preset: DevicePreset) => {
      setDevicePresetState(preset)
      rec('simulator.device-changed', { preset: preset.label })
    },
    [rec]
  )

  const toggleOrientation = useCallback(() => {
    setOrientation(o => {
      const next = o === 'portrait' ? 'landscape' : 'portrait'
      rec('simulator.orientation-toggled', { orientation: next })
      return next
    })
  }, [rec])

  const setConnectionMode = useCallback(
    (v: ConnectionMode) => {
      setConnectionModeState(v)
      rec('simulator.connection-changed', { mode: v })
    },
    [rec]
  )

  const setNetworkSpeed = useCallback(
    (v: NetworkSpeed) => {
      setNetworkSpeedState(v)
      rec('simulator.connection-changed', { networkSpeed: v })
    },
    [rec]
  )

  const setColorBlindMode = useCallback(
    (v: ColorBlindMode) => {
      setColorBlindModeState(v)
      rec('simulator.accessibility-changed', { colorBlindMode: v })
    },
    [rec]
  )

  // Flat SimControl-bindable setters — each patches flowAutoPlayOverride
  const setFlowAutoPlayEnabled = useCallback(
    (v: boolean) => {
      setFlowAutoPlayOverride(p => ({ ...p, enabled: v }))
      rec('simulator.autoplay-changed', { enabled: v })
    },
    [rec]
  )
  const setFlowAutoPlayDelay = useCallback(
    (v: number) => {
      setFlowAutoPlayOverride(p => ({ ...p, delay: v }))
      rec('simulator.autoplay-changed', { delay: v })
    },
    [rec]
  )
  const setFlowAutoPlayAnimation = useCallback(
    (v: string) => {
      setFlowAutoPlayOverride(p => ({ ...p, animation: v as AutoPlayConfig['animation'] }))
      rec('simulator.autoplay-changed', { animation: v })
    },
    [rec]
  )
  const setFlowAutoPlayLoop = useCallback(
    (v: boolean) => {
      setFlowAutoPlayOverride(p => ({ ...p, loop: v }))
      rec('simulator.autoplay-changed', { loop: v })
    },
    [rec]
  )

  const contextValue = useMemo(
    () => ({
      activeViewId,
      orientation,
      canGoBack,
      devicePreset,
      navigateTo,
      goBack,
      goHome,
      setDevicePreset,
      toggleOrientation,
      resetToFirst,
      connectionMode,
      setConnectionMode,
      networkSpeed,
      setNetworkSpeed,
      colorBlindMode,
      setColorBlindMode,
      blurryVision,
      setBlurryVision,
      simulatorEnabled,
      setSimulatorEnabled,
      firstViewId,
      workspaceConfig: workspaceConfig ?? {},
      activeFlowHomeScreen,
      setActiveFlowHomeScreen,
      activeFlowDebugInfo,
      setActiveFlowDebugInfo,
      flowAutoPlayOverride,
      setFlowAutoPlayOverride,
      flowAutoPlayPaused,
      setFlowAutoPlayPaused,
      flowAutoPlayEnabled: flowAutoPlayOverride?.enabled ?? false,
      setFlowAutoPlayEnabled,
      flowAutoPlayDelay: flowAutoPlayOverride?.delay ?? 2000,
      setFlowAutoPlayDelay,
      flowAutoPlayAnimation: flowAutoPlayOverride?.animation ?? 'fade',
      setFlowAutoPlayAnimation,
      flowAutoPlayLoop: flowAutoPlayOverride?.loop ?? false,
      setFlowAutoPlayLoop,
      activeVariantByView,
      setVariantForView,
      db,
      updateDb,
      resetDb,
      replaySetDb,
      flowPlaySetDb,
      switchWorkspace: onSwitchWorkspace ?? (() => {}),
    }),
    [
      activeViewId,
      orientation,
      canGoBack,
      devicePreset,
      navigateTo,
      goBack,
      goHome,
      setDevicePreset,
      toggleOrientation,
      resetToFirst,
      connectionMode,
      setConnectionMode,
      networkSpeed,
      setNetworkSpeed,
      colorBlindMode,
      setColorBlindMode,
      blurryVision,
      setBlurryVision,
      simulatorEnabled,
      setSimulatorEnabled,
      firstViewId,
      workspaceConfig,
      activeFlowHomeScreen,
      activeFlowDebugInfo,
      setActiveFlowDebugInfo,
      flowAutoPlayOverride,
      flowAutoPlayPaused,
      setFlowAutoPlayEnabled,
      setFlowAutoPlayDelay,
      setFlowAutoPlayAnimation,
      setFlowAutoPlayLoop,
      activeVariantByView,
      setVariantForView,
      db,
      updateDb,
      resetDb,
      replaySetDb,
      flowPlaySetDb,
      onSwitchWorkspace,
    ]
  )

  const navigationValue = useMemo(
    () => ({
      activeViewId,
      firstViewId,
      canGoBack,
      activeVariantByView,
      navigateTo,
      goBack,
      goHome,
      resetToFirst,
      setVariantForView,
      orientation,
      toggleOrientation,
    }),
    [
      activeViewId,
      firstViewId,
      canGoBack,
      activeVariantByView,
      navigateTo,
      goBack,
      goHome,
      resetToFirst,
      setVariantForView,
      orientation,
      toggleOrientation,
    ]
  )

  const simulatorValue = useMemo(
    () => ({
      devicePreset,
      setDevicePreset,
      connectionMode,
      setConnectionMode,
      networkSpeed,
      setNetworkSpeed,
      colorBlindMode,
      setColorBlindMode,
      blurryVision,
      setBlurryVision,
      simulatorEnabled,
      setSimulatorEnabled,
      flowAutoPlayOverride,
      setFlowAutoPlayOverride,
      flowAutoPlayPaused,
      setFlowAutoPlayPaused,
      flowAutoPlayEnabled: flowAutoPlayOverride?.enabled ?? false,
      setFlowAutoPlayEnabled,
      flowAutoPlayDelay: flowAutoPlayOverride?.delay ?? 2000,
      setFlowAutoPlayDelay,
      flowAutoPlayAnimation: flowAutoPlayOverride?.animation ?? 'fade',
      setFlowAutoPlayAnimation,
      flowAutoPlayLoop: flowAutoPlayOverride?.loop ?? false,
      setFlowAutoPlayLoop,
    }),
    [
      devicePreset,
      setDevicePreset,
      connectionMode,
      setConnectionMode,
      networkSpeed,
      setNetworkSpeed,
      colorBlindMode,
      setColorBlindMode,
      blurryVision,
      setBlurryVision,
      simulatorEnabled,
      setSimulatorEnabled,
      flowAutoPlayOverride,
      flowAutoPlayPaused,
      setFlowAutoPlayEnabled,
      setFlowAutoPlayDelay,
      setFlowAutoPlayAnimation,
      setFlowAutoPlayLoop,
    ]
  )

  return (
    <NavigationContext.Provider value={navigationValue}>
      <SimulatorContext.Provider value={simulatorValue}>
        <DashboardContext.Provider value={contextValue}>{children}</DashboardContext.Provider>
      </SimulatorContext.Provider>
    </NavigationContext.Provider>
  )
}

export function useDashboard() {
  const ctx = useContext(DashboardContext)
  if (!ctx) throw new Error('useDashboard must be used within DashboardProvider')
  return ctx
}
