import type { ErrorInfo, ReactNode } from 'react'
import { useEffect, useState } from 'react'

import PreviewCanvas from './core/canvas/PreviewCanvas'
import { useAppShortcuts } from './core/shortcuts/useKeyboardShortcuts'
import { FeedbackProvider } from './features/feedback/context/FeedbackContext'
import { FigmaExportView } from './features/figma-export'
import { DbHighlightSettingsProvider } from './features/flow-debugger'
import { FlowStorySettingsProvider } from './features/flowStory/FlowStorySettingsContext'
import { FlowPlaybackProvider } from './features/flowStory/FlowPlaybackContext'
import { SessionRecorderProvider, useSessionRecorderOptional } from './features/flowTracer/context'
import Forbidden from './shared/components/errors/Forbidden'
import Maintenance from './shared/components/errors/Maintenance'
import NoPages from './shared/components/errors/NoPages'
import NotFound from './shared/components/errors/NotFound'
import ServerError from './shared/components/errors/ServerError'
import WorkspaceErrorBoundary from './shared/components/errors/WorkspaceErrorBoundary'
import WorkspaceSelector from './shared/components/WorkspaceSelector'
import { ActiveWorkspaceContext } from './shared/contexts/ActiveWorkspaceContext'
import { DashboardProvider } from './shared/contexts/DashboardContext'
import { DevModeProvider } from './shared/contexts/DevModeContext'
import { FlowLensModeProvider } from './shared/contexts/FlowLensModeContext'
import { ThemeProvider } from './shared/contexts/ThemeContext'
import { useWorkspaceHierarchy } from './shared/utils/useWorkspaceHierarchy'
import { listWorkspaceNames, loadWorkspaceTokens } from './shared/utils/workspaceModules'
import { clearStoredWorkspace, getStoredWorkspace, storeWorkspace, workspaces } from './workspaces'

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resolveInitialWorkspace(): string | null {
  const available = listWorkspaceNames()
  if (available.length === 0) return null

  // URL param wins over localStorage
  const urlParam = new URLSearchParams(window.location.search).get('workspace')
  if (urlParam && available.includes(urlParam)) {
    storeWorkspace(urlParam)
    return urlParam
  }

  // Single workspace — auto-select, no picker needed
  if (available.length === 1) {
    storeWorkspace(available[0])
    return available[0]
  }

  // Validate stored value is still present on disk
  const stored = getStoredWorkspace()
  if (stored && available.includes(stored)) return stored

  return null
}

// ─── ConnectedWorkspaceErrorBoundary ───────────────────────────────────────────
// Bridges WorkspaceErrorBoundary (a class component, can't use hooks) to the
// session recorder so a workspace-level crash is captured as session data —
// not just a console.error — when a recording is active. Must render as a
// descendant of SessionRecorderProvider, not a sibling/ancestor of it.

function ConnectedWorkspaceErrorBoundary({
  workspaceName,
  children,
}: {
  workspaceName: string
  children: ReactNode
}) {
  const recorder = useSessionRecorderOptional()

  const handleError = (error: Error, info: ErrorInfo) => {
    recorder?.logEvent('session.error', {
      message: error.message,
      stack: error.stack,
      componentStack: info.componentStack,
      boundary: 'workspace',
    })
  }

  return (
    <WorkspaceErrorBoundary workspaceName={workspaceName} onError={handleError}>
      {children}
    </WorkspaceErrorBoundary>
  )
}

// ─── WorkspaceRunner ──────────────────────────────────────────────────────────
// Only mounts once a workspace is confirmed — prevents any workspace module
// evaluation (db, flows, tokens) before the user has selected one.

interface WorkspaceRunnerProps {
  name: string
  onSwitch: () => void
}

function WorkspaceRunner({ name, onSwitch }: WorkspaceRunnerProps) {
  const [canvasMode, setCanvasMode] = useState(false)

  useEffect(() => {
    loadWorkspaceTokens(name)
  }, [name])

  useAppShortcuts({ toggleCanvasMode: () => setCanvasMode(v => !v) })

  const hierarchy = useWorkspaceHierarchy(name)
  const CHAPTERS = hierarchy.stories
  const ALL_VIEWS = hierarchy.views
  const workspaceConfig = workspaces.find(w => w.name === name)?.config ?? {}

  if (!ALL_VIEWS || ALL_VIEWS.length === 0) {
    return (
      <ThemeProvider>
        <NoPages workspaceName={name} onAction={() => window.location.reload()} />
      </ThemeProvider>
    )
  }

  const workspaceLabel = workspaces.find(w => w.name === name)?.label ?? name

  return (
    <ActiveWorkspaceContext.Provider value={name}>
      <SessionRecorderProvider workspaceId={name}>
        <ThemeProvider>
          <DevModeProvider>
            <div style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
              <FlowLensModeProvider>
                <ConnectedWorkspaceErrorBoundary workspaceName={workspaceLabel}>
                  {canvasMode ? (
                    <FigmaExportView views={ALL_VIEWS} />
                  ) : (
                    <DashboardProvider
                      firstViewId={hierarchy.startPageId ?? ALL_VIEWS[0]?.id ?? 'home'}
                      initialDeviceLabel={hierarchy.defaultDeviceLabel}
                      initialOrientation={hierarchy.defaultOrientation}
                      workspaceConfig={workspaceConfig}
                      onSwitchWorkspace={onSwitch}
                    >
                      <FlowStorySettingsProvider>
                        <DbHighlightSettingsProvider>
                          <FlowPlaybackProvider>
                            <FeedbackProvider>
                              <PreviewCanvas chapters={CHAPTERS} views={ALL_VIEWS} />
                            </FeedbackProvider>
                          </FlowPlaybackProvider>
                        </DbHighlightSettingsProvider>
                      </FlowStorySettingsProvider>
                    </DashboardProvider>
                  )}
                </ConnectedWorkspaceErrorBoundary>
              </FlowLensModeProvider>
            </div>
          </DevModeProvider>
        </ThemeProvider>
      </SessionRecorderProvider>
    </ActiveWorkspaceContext.Provider>
  )
}

// ─── App ──────────────────────────────────────────────────────────────────────

export default function App() {
  const [activeWorkspace, setActiveWorkspace] = useState<string | null>(resolveInitialWorkspace)

  const handleSelect = (name: string) => {
    storeWorkspace(name)
    setActiveWorkspace(name)
  }

  const handleSwitch = (name?: string) => {
    if (name) {
      storeWorkspace(name)
      setActiveWorkspace(name)
    } else {
      clearStoredWorkspace()
      setActiveWorkspace(null)
    }
  }

  // Simulated error states via ?status= — resolved before any workspace logic
  const simulatedStatus = (() => {
    const params = new URLSearchParams(window.location.search)
    const status = params.get('status') || params.get('error')
    return status ? status.toLowerCase() : null
  })()

  if (simulatedStatus === '500' || simulatedStatus === 'server-error') {
    return (
      <ThemeProvider>
        <ServerError
          message="Simulated system internal server crash."
          onRetry={() => {
            window.location.search = ''
          }}
        />
      </ThemeProvider>
    )
  }

  if (simulatedStatus === '403' || simulatedStatus === 'forbidden') {
    return (
      <ThemeProvider>
        <Forbidden
          onAction={() => {
            window.location.search = ''
          }}
        />
      </ThemeProvider>
    )
  }

  if (simulatedStatus === 'maintenance') {
    return (
      <ThemeProvider>
        <Maintenance
          onAction={() => {
            window.location.search = ''
          }}
        />
      </ThemeProvider>
    )
  }

  if (simulatedStatus === '404' || simulatedStatus === 'not-found') {
    return (
      <ThemeProvider>
        <NotFound
          onAction={() => {
            window.location.search = ''
          }}
        />
      </ThemeProvider>
    )
  }

  if (!activeWorkspace) {
    return (
      <ThemeProvider>
        <WorkspaceSelector onSelect={handleSelect} />
      </ThemeProvider>
    )
  }

  return <WorkspaceRunner name={activeWorkspace} onSwitch={handleSwitch} />
}
