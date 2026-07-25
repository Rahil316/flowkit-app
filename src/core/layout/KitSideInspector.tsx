import type { PageView } from '@flowkit/types/index'
import {
  FeedbackPanel,
  FeedbackTabProvider,
  useFeedback,
  useFeedbackTabContext,
} from '@flowkit-features/feedback'
import {
  DbInspector,
  type DbViewMode,
  type DebugSubTab,
  FlowDebuggerContent,
} from '@flowkit-features/flow-debugger'
import { useFlowPlaybackOptional } from '@flowkit-features/flowStory/FlowPlaybackContext'
import {
  SessionsPanel,
  useSavedSessionCount,
  useSessionRecorderOptional,
} from '@flowkit-features/flowTracer'
import { CopyScriptButton, generatePageMetaPatch } from '@flowkit-features/script-patch'
import {
  AccessibilitySettings,
  ColorBlindSVGDefs,
  DeviceSettings,
  SIM_SUB_TABS,
  SimControl,
  type SimSubTab,
  SimToggle,
} from '@flowkit-features/simulator'
import PanelErrorBoundary from '@flowkit-shared/components/errors/PanelErrorBoundary'
import Button from '@flowkit-shared/components/ui/Button'
import PanelNoteField from '@flowkit-shared/components/ui/PanelNoteField'
import SegmentedControl from '@flowkit-shared/components/ui/SegmentedControl'
import Toggle from '@flowkit-shared/components/ui/Toggle'
import Tooltip from '@flowkit-shared/components/ui/Tooltip'
import { LS_SESSIONS_ENABLED } from '@flowkit-shared/constants/storageKeys'
import { useActiveWorkspace } from '@flowkit-shared/contexts/ActiveWorkspaceContext'
import { useDashboard } from '@flowkit-shared/contexts/DashboardContext'
import { useDevMode } from '@flowkit-shared/contexts/DevModeContext'
import { useTheme } from '@flowkit-shared/contexts/ThemeContext'
import { getWorkspaceSimulator } from '@flowkit-shared/utils/workspaceModules'
import { FileCode, FileDown, StickyNote, Trash2 } from 'lucide-react'
import {
  type ComponentType,
  createElement,
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'

import { usePanelShortcuts } from '../shortcuts/useKeyboardShortcuts'
import { getVisibleTabs, type InspectorTab, TAB_META } from './inspectorTabs'
import PanelBody from './PanelBody'
import Sidebar from './Sidebar'
import SidebarButton from './SidebarButton'

export { COLOR_BLIND_FILTERS, ColorBlindSVGDefs } from '@flowkit-features/simulator'

// ─── Persistence ──────────────────────────────────────────────────────────────

const STORAGE_ACTIVE_TAB = 'flowkit:panel:tab'
const STORAGE_SIM_SUBTAB = 'flowkit:panel:simSubTab'
export const STORAGE_DEBUG_SUBTAB = 'flowkit:panel:debugSubTab'
const STORAGE_SESSIONS_ENABLED = LS_SESSIONS_ENABLED

export function readStorage<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw === null) return fallback
    return JSON.parse(raw) as T
  } catch {
    return fallback
  }
}

function writeStorage(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value))
  } catch {
    /* quota */
  }
}

// ─── SidebarButton ── see ./SidebarButton.tsx ──────────────────────────────────────

// ─── ContentHeader ────────────────────────────────────────────────────────────

interface ContentHeaderProps {
  title: string
  actions?: React.ReactNode
  theme: ReturnType<typeof useTheme>['theme']
}

function ContentHeader({ title, actions, theme }: ContentHeaderProps) {
  return (
    <div
      className="flex items-center gap-2 px-3 py-2.5 shrink-0 h-12"
      style={{ background: theme.bg.surface, borderBottom: `1px solid ${theme.bg.border}` }}
    >
      <span
        className="font-black flex-1"
        style={{ fontSize: 'var(--font-size-ui-xs)', color: theme.text.muted }}
      >
        {title}
      </span>
      {actions}
    </div>
  )
}

// ─── SubTabBar ────────────────────────────────────────────────────────────────

interface SubTabBarProps<T extends string> {
  tabs: { id: T; label: string; icon: React.ElementType }[]
  active: T
  onSelect: (id: T) => void
}

export function SubTabBar<T extends string>({ tabs, active, onSelect }: SubTabBarProps<T>) {
  return (
    <div className="px-2 py-1.5 shrink-0 border-b border-theme-border bg-theme-elevated">
      <SegmentedControl value={active} onChange={v => onSelect(v as T)} activeColor="blue">
        {tabs.map(({ id, label, icon: Icon }) => (
          <SegmentedControl.Segment key={id} value={id} title={label} iconLeft>
            <SegmentedControl.Icon>
              <Icon size={11} />
            </SegmentedControl.Icon>
            <SegmentedControl.Label>{label}</SegmentedControl.Label>
          </SegmentedControl.Segment>
        ))}
      </SegmentedControl>
    </div>
  )
}

// ─── AutoPlayAccordion ────────────────────────────────────────────────────────

function AutoPlayAccordion() {
  const { flowAutoPlayEnabled, setFlowAutoPlayEnabled } = useDashboard()
  const { theme, scale } = useTheme()

  return (
    <div
      className="flex flex-col rounded-lg overflow-hidden animate-fade-in min-h-fit"
      style={{ border: `1px solid ${theme.bg.border}` }}
    >
      {/* Header — toggle IS the expand/collapse + enable/disable control */}
      <div
        className="flex items-center justify-between px-3 py-2.5"
        style={{ backgroundColor: theme.bg.elevated }}
      >
        <span className="font-black" style={{ fontSize: scale.text.xxs, color: theme.text.muted }}>
          AUTO-PLAY
        </span>
        <Toggle
          size="sm"
          checked={flowAutoPlayEnabled}
          onChange={e => setFlowAutoPlayEnabled(e.target.checked)}
        />
      </div>

      {/* Settings — only visible when enabled */}
      {flowAutoPlayEnabled && (
        <div className="flex flex-col gap-2.5 p-2" style={{ backgroundColor: theme.bg.base }}>
          <SimControl
            label="Delay"
            bind="flowAutoPlayDelay"
            options={['500', '1000', '1500', '2000', '3000', '5000']}
            description="ms between screens"
          />
          <SimControl
            label="Animation"
            bind="flowAutoPlayAnimation"
            options={[
              'fade',
              'slide-left',
              'slide-right',
              'slide-up',
              'slide-down',
              'scale',
              'none',
            ]}
          />
          <SimToggle label="Loop" bind="flowAutoPlayLoop" />
        </div>
      )}
    </div>
  )
}

// ─── Named content exports (for MobileCanvas bottom sheets) ──────────────────

export function ScreenInfoContent({
  views,
  touch = false,
}: {
  views: PageView[]
  /** Renders explicit copy-filename/copy-path buttons with inline feedback instead of the hover tooltip (mobile has no hover). */
  touch?: boolean
}) {
  const activeWorkspace = useActiveWorkspace()
  const ctx = useDashboard()
  const { theme, scale } = useTheme()
  const { activeViewId } = ctx
  const { devMode, toggleDevMode, pendingEdits, setEdit, clearEdits } = useDevMode()
  const isPlayNode = activeViewId.endsWith('-play')
  const activeView =
    views.find(v => v.id === activeViewId.replace('-play', '')) ??
    views.find(v => v.id === activeViewId)
  const meta = activeView?.meta
  const derivedFilename = activeView
    ? `${activeView.label.replace(/[^a-zA-Z0-9]/g, '')}Screen.tsx`
    : `${activeViewId}Screen.tsx`
  const derivedPath = activeView?.filePath
    ? `workspaces/${activeWorkspace}/${activeView.filePath}`
    : `workspaces/${activeWorkspace}/flowBook/${activeViewId.split('-')[0] ?? ''}/${derivedFilename}`
  const pendingEdit = activeView ? pendingEdits.get(activeView.id) : undefined
  const [copiedText, setCopiedText] = useState<string | null>(null)
  const [tagInput, setTagInput] = useState('')

  // ── derived current values (pending overrides saved meta) ──────────────────
  const cleanViewId = activeViewId.replace('-play', '')
  const variants = activeView?.variants ?? []
  const activeVariant = ctx.activeVariantByView[cleanViewId] ?? 'default'
  const hasGuard = !!(meta?.canEnter ?? meta?.canNotEnter)
  const guardAllowed = hasGuard
    ? (meta?.canEnter?.({ db: ctx.db }) ?? true) && !(meta?.canNotEnter?.({ db: ctx.db }) ?? false)
    : true

  const currentIsStandalone = pendingEdit?.isStandalone ?? meta?.isStandalone ?? false
  const currentHasTag = pendingEdit?.hasTag ?? meta?.hasTag ?? ''
  const currentTags = pendingEdit?.tags ?? meta?.tags ?? []
  const currentDesc = pendingEdit?.desc ?? meta?.desc ?? ''
  const currentDevNotes = pendingEdit?.devNotes ?? meta?.devNotes ?? ''

  // ── helpers ────────────────────────────────────────────────────────────────
  function copyText(text: string) {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedText(text)
      setTimeout(() => setCopiedText(null), 1500)
    })
  }

  function handleCopy(e: React.MouseEvent) {
    const text = e.shiftKey ? derivedPath : derivedFilename
    navigator.clipboard.writeText(text).then(() => {
      setCopiedText(text)
      setTimeout(() => setCopiedText(null), 1500)
    })
  }

  function patch(updates: Partial<typeof pendingEdit>) {
    if (!activeView) return
    setEdit(activeView.id, {
      desc: currentDesc,
      devNotes: currentDevNotes,
      isStandalone: currentIsStandalone,
      hasTag: currentHasTag,
      tags: currentTags,
      filePath: derivedPath,
      pageLabel: activeView.label,
      ...updates,
    })
  }

  function addTag(raw: string) {
    const tag = raw.trim()
    if (!tag || currentTags.includes(tag)) return
    patch({ tags: [...currentTags, tag] })
    setTagInput('')
  }

  function removeTag(tag: string) {
    patch({ tags: currentTags.filter(t => t !== tag) })
  }

  const editing = devMode && !isPlayNode

  // ── shared row style helpers ───────────────────────────────────────────────
  const sectionLabel = (
    <span
      className="text-ui-2xs font-black uppercase tracking-[0.04em]"
      style={{ color: theme.text.muted }}
    />
  )
  void sectionLabel

  return (
    <>
      <div className="overflow-y-auto p-3 flex flex-col gap-3 text-xs font-semibold leading-relaxed h-full">
        {/* ── Filename ───────────────────────────────────────────────────── */}
        {touch ? (
          <div className="flex flex-col gap-1 px-1">
            <div className="flex items-center gap-1.5">
              <FileCode size={14} className="shrink-0 text-theme-green" />
              <span className="truncate text-ui-md font-bold tracking-tight text-theme-green flex-1 min-w-0">
                {derivedFilename}
              </span>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                onClick={() => copyText(derivedFilename)}
                className="text-ui-2xs font-bold px-1.5 py-0.5 rounded-sm"
                style={{ background: theme.bg.elevated, color: theme.text.secondary }}
              >
                {copiedText === derivedFilename ? 'Copied ✓' : 'Copy filename'}
              </button>
              <button
                onClick={() => copyText(derivedPath)}
                className="text-ui-2xs font-bold px-1.5 py-0.5 rounded-sm"
                style={{ background: theme.bg.elevated, color: theme.text.secondary }}
              >
                {copiedText === derivedPath ? 'Copied ✓' : 'Copy path'}
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-1.5 px-1">
            <Tooltip
              content={
                copiedText ? `Copied: ${copiedText}` : 'Copy filename · Shift+click for path'
              }
              placement="top"
              wrap={!!copiedText}
            >
              <span
                onClick={handleCopy}
                className="flex items-center gap-1.5 text-ui-md font-bold tracking-tight flex-1 min-w-0 cursor-pointer text-theme-green"
              >
                <FileCode size={14} className="shrink-0" />
                <span className="truncate">{derivedFilename}</span>
              </span>
            </Tooltip>
          </div>
        )}

        {/* ── Edit mode toggle ─────────────────────────────────────────────── */}
        {!isPlayNode && (
          <button
            onClick={toggleDevMode}
            className="flex items-center justify-center gap-1.5 px-2 py-1 rounded-md text-ui-xs font-bold self-start"
            style={
              editing
                ? { background: theme.accent.blueDim, color: theme.accent.blue }
                : { background: theme.bg.elevated, color: theme.text.secondary }
            }
          >
            {editing ? 'Editing on' : 'Edit metadata'}
          </button>
        )}

        {/* ── Access guard (read-only — runtime fn) ──────────────────────── */}
        {hasGuard && (
          <div
            className="flex items-center gap-2 px-2 py-1.5 rounded-md"
            style={{
              background: guardAllowed ? theme.accent.greenDim : theme.accent.redDim,
              border: `1px solid ${guardAllowed ? theme.accent.green + '33' : theme.accent.red + '33'}`,
            }}
          >
            <span
              style={{ color: guardAllowed ? theme.accent.green : theme.accent.red, fontSize: 11 }}
            >
              {guardAllowed ? '✓' : '✕'}
            </span>
            <span
              className="text-ui-2xs font-bold"
              style={{ color: guardAllowed ? theme.accent.green : theme.accent.red }}
            >
              {guardAllowed ? 'Accessible' : 'Blocked by guard'}
            </span>
            <span className="ml-auto text-ui-2xs" style={{ color: theme.text.disabled }}>
              {meta?.canEnter && meta?.canNotEnter
                ? 'canEnter + canNotEnter'
                : meta?.canEnter
                  ? 'canEnter'
                  : 'canNotEnter'}
            </span>
          </div>
        )}

        {/* ── Variant selector ───────────────────────────────────────────── */}
        {variants.length > 1 && (
          <div className="flex items-center gap-2 px-1">
            <span
              className="text-ui-2xs font-black tracking-widest uppercase flex-1"
              style={{ color: theme.text.muted }}
            >
              Variant
            </span>
            <div
              className="flex gap-0.5 p-0.5 rounded-md"
              style={{ background: theme.bg.base, border: `1px solid ${theme.bg.border}` }}
            >
              {variants.map(v => (
                <button
                  key={v.serial}
                  onClick={() => ctx.setVariantForView(cleanViewId, v.serial)}
                  className="text-ui-2xs font-bold px-2 py-0.5 rounded-sm transition-colors duration-120"
                  style={{
                    background: activeVariant === v.serial ? theme.bg.elevated : 'transparent',
                    color: activeVariant === v.serial ? theme.text.primary : theme.text.muted,
                  }}
                >
                  {v.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* ── Entry point (isStandalone) ─────────────────────────────────── */}
        <div className="flex items-center justify-between px-1 gap-2">
          <div className="flex flex-col min-w-0">
            <span
              className="text-ui-2xs font-black uppercase tracking-[0.04em]"
              style={{ color: theme.text.muted }}
            >
              Entry point
            </span>
            <span className="text-ui-2xs font-normal" style={{ color: theme.text.disabled }}>
              Screen reached without back-nav
            </span>
          </div>
          {editing ? (
            <Toggle
              size="sm"
              checked={currentIsStandalone}
              onChange={e => patch({ isStandalone: e.target.checked })}
            />
          ) : (
            <span
              className="text-ui-2xs font-bold px-1.5 py-0.5 rounded-sm"
              style={
                currentIsStandalone
                  ? { background: theme.accent.amberDim, color: theme.accent.amber }
                  : { background: theme.bg.elevated, color: theme.text.disabled }
              }
            >
              {currentIsStandalone ? 'Yes' : 'No'}
            </span>
          )}
        </div>

        {/* ── Badge tag (hasTag) ─────────────────────────────────────────── */}
        <div className="flex flex-col gap-1 px-1">
          <span
            className="text-ui-2xs font-black uppercase tracking-[0.04em]"
            style={{ color: theme.text.muted }}
          >
            Badge tag
          </span>
          {editing ? (
            <input
              value={currentHasTag}
              onChange={e => patch({ hasTag: e.target.value })}
              placeholder="e.g. WIP, Beta, New"
              className="w-full px-2 py-1 rounded-md text-ui-xs font-medium outline-none transition-colors"
              style={{
                background: theme.bg.base,
                border: `1px solid ${theme.bg.border}`,
                color: theme.text.primary,
              }}
              onFocus={e => {
                e.currentTarget.style.borderColor = theme.accent.blue
              }}
              onBlur={e => {
                e.currentTarget.style.borderColor = theme.bg.border
              }}
            />
          ) : (
            <span
              className="text-ui-xs font-medium px-2 py-0.5 rounded-sm self-start"
              style={
                currentHasTag
                  ? {
                      background: theme.bg.elevated,
                      color: theme.text.secondary,
                      border: `1px solid ${theme.bg.border}`,
                    }
                  : { color: theme.text.disabled }
              }
            >
              {currentHasTag || '—'}
            </span>
          )}
        </div>

        {/* ── Filter tags ────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-1.5 px-1">
          <span
            className="text-ui-2xs font-black uppercase tracking-[0.04em]"
            style={{ color: theme.text.muted }}
          >
            Tags
          </span>
          <div className="flex flex-wrap gap-1">
            {currentTags.map(tag => (
              <span
                key={tag}
                className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-ui-2xs font-medium"
                style={{
                  background: theme.bg.elevated,
                  color: theme.text.muted,
                  border: `1px solid ${theme.bg.border}`,
                }}
              >
                {tag}
                {editing && (
                  <button
                    onClick={() => removeTag(tag)}
                    className="flex items-center justify-center transition-colors"
                    style={{ color: theme.text.disabled, lineHeight: 1 }}
                    onMouseEnter={e => {
                      e.currentTarget.style.color = theme.accent.red
                    }}
                    onMouseLeave={e => {
                      e.currentTarget.style.color = theme.text.disabled
                    }}
                  >
                    ×
                  </button>
                )}
              </span>
            ))}
            {editing && (
              <input
                value={tagInput}
                onChange={e => setTagInput(e.target.value)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault()
                    addTag(tagInput)
                  }
                  if (e.key === 'Backspace' && !tagInput && currentTags.length > 0)
                    removeTag(currentTags[currentTags.length - 1])
                }}
                onBlur={() => {
                  if (tagInput.trim()) addTag(tagInput)
                }}
                placeholder={currentTags.length === 0 ? 'Add tag…' : '+'}
                className="px-1.5 py-0.5 rounded-full text-ui-2xs outline-none min-w-15 flex-1"
                style={{
                  background: theme.bg.base,
                  border: `1px solid ${theme.bg.border}`,
                  color: theme.text.primary,
                }}
              />
            )}
            {!editing && currentTags.length === 0 && (
              <span className="text-ui-xs font-medium" style={{ color: theme.text.disabled }}>
                —
              </span>
            )}
          </div>
        </div>

        {/* ── Description ────────────────────────────────────────────────── */}
        <PanelNoteField
          label="Description"
          editing={editing}
          value={meta?.desc}
          pendingValue={pendingEdit?.desc}
          rows={3}
          placeholder="Describe what this screen does and its role in the flow…"
          onChange={v => patch({ desc: v })}
          emptyHint={
            <>
              No description. Export a <code className="not-italic font-mono">pageMeta</code> from
              this screen&apos;s <code className="not-italic font-mono">.tsx</code>.
            </>
          }
        />

        {/* ── Dev notes ──────────────────────────────────────────────────── */}
        <PanelNoteField
          label="Notes"
          icon={<StickyNote size={10} />}
          editing={editing}
          value={meta?.devNotes}
          pendingValue={pendingEdit?.devNotes}
          rows={4}
          placeholder="Implementation notes, edge cases, API dependencies…"
          onChange={v => patch({ devNotes: v })}
          emptyHint={
            <>
              Add a <code className="not-italic font-mono">devNotes</code> field to{' '}
              <code className="not-italic font-mono">pageMeta</code>.
            </>
          }
        />
      </div>

      {devMode && pendingEdits.size > 0 && (
        <div
          className="flex flex-col gap-2 p-3"
          style={{ borderTop: `1px solid ${theme.bg.border}`, background: theme.bg.elevated }}
        >
          <div className="flex items-center justify-between">
            <span
              className="font-black tracking-widest"
              style={{ fontSize: scale.text.xxs, color: theme.accent.green }}
            >
              {pendingEdits.size} SCREEN{pendingEdits.size !== 1 ? 'S' : ''} EDITED
            </span>
            <button
              onClick={clearEdits}
              className="flex items-center gap-1 px-2 py-1 rounded"
              style={{ fontSize: scale.text.xxs, color: theme.text.muted }}
              onMouseEnter={e => {
                e.currentTarget.style.color = theme.text.primary
              }}
              onMouseLeave={e => {
                e.currentTarget.style.color = theme.text.muted
              }}
            >
              <Trash2 size={10} />
              Clear
            </button>
          </div>
          <CopyScriptButton
            patch={generatePageMetaPatch([...pendingEdits.values()], activeWorkspace)}
          />
          <p
            className="text-center italic"
            style={{ fontSize: scale.text.xxs, color: theme.text.disabled }}
          >
            Paste in terminal at project root
          </p>
        </div>
      )}
    </>
  )
}

// Module-level cache of lazy-loaded simulator components keyed by workspace name.
// Defined at module scope so React never sees them as "created during render".
const _lazySimulatorCache = new Map<string, ComponentType>()
function getOrCreateLazySimulator(workspace: string): ComponentType | null {
  const loader = getWorkspaceSimulator(workspace)
  if (!loader) return null
  if (!_lazySimulatorCache.has(workspace)) {
    _lazySimulatorCache.set(
      workspace,
      lazy(() => loader().then(m => ({ default: m.default as ComponentType })))
    )
  }
  return _lazySimulatorCache.get(workspace)!
}

function WorkspaceSimulatorControlsSlot({ workspace }: { workspace: string }) {
  const ctrl = getOrCreateLazySimulator(workspace)
  if (!ctrl) return null
  // React.createElement avoids JSX identifier syntax so the react-hooks/static-components
  // rule (which only inspects JsxExpression tags) does not flag the dynamic component type.
  return createElement(Suspense, { fallback: null }, createElement(ctrl))
}

interface SimulatorContentProps {
  hideDevice?: boolean
  /** Controlled sub-tab — provided by KitSideInspector so keyboard shortcuts stay in sync. */
  subTab?: SimSubTab
  onSubTabChange?: (tab: SimSubTab) => void
}

export function SimulatorContent({
  hideDevice,
  subTab: controlledSubTab,
  onSubTabChange,
}: SimulatorContentProps) {
  const activeWorkspace = useActiveWorkspace()
  const ctx = useDashboard()
  const { activeViewId } = ctx
  // Fall back to internal state when used standalone (e.g. MobileCanvas bottom sheet).
  const [internalSubTab, setInternalSubTab] = useState<SimSubTab>(
    () => readStorage(STORAGE_SIM_SUBTAB, 'device') as SimSubTab
  )
  const simSubTab = controlledSubTab ?? internalSubTab
  const setSimSubTab = (tab: SimSubTab) => {
    setInternalSubTab(tab)
    onSubTabChange?.(tab)
  }

  const visibleSimTabs = hideDevice ? SIM_SUB_TABS.filter(t => t.id !== 'device') : SIM_SUB_TABS
  const isPlayNode = activeViewId.endsWith('-play')

  // F4.4 — during FlowStory playback, swap workspace controls for flow-declared
  // ones. Device controls (the "device" sub-tab) are always available.
  const playback = useFlowPlaybackOptional()
  const flowControls = playback?.activeFlowStory?.__flowStory.simulatorControls ?? []
  const inFlowMode = !!playback?.activeFlowStory

  return (
    <>
      <SubTabBar tabs={visibleSimTabs} active={simSubTab} onSelect={setSimSubTab} />
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-2">
        {simSubTab === 'device' ? (
          <>
            <DeviceSettings />
            <AccessibilitySettings />
          </>
        ) : inFlowMode ? (
          <>
            <div className="px-2 py-1.5 rounded-md bg-theme-blue-dim border border-theme-blue/25">
              <span className="text-ui-2xs text-theme-blue">
                Flow active — showing flow controls
              </span>
            </div>
            {isPlayNode && <AutoPlayAccordion />}
            <FlowDeclaredControls controls={flowControls} />
          </>
        ) : (
          <>
            {isPlayNode && <AutoPlayAccordion />}
            <SimControl label="Enable Simulator" bind="simulatorEnabled" />
            <div
              className="flex flex-col gap-2 transition-opacity duration-200"
              style={{
                opacity: ctx.simulatorEnabled ? 1 : 0.35,
                pointerEvents: ctx.simulatorEnabled ? 'auto' : 'none',
              }}
            >
              <WorkspaceSimulatorControlsSlot workspace={activeWorkspace} />
            </div>
          </>
        )}
      </div>
    </>
  )
}

// Maps a FlowStory's declared SimulatorControl[] onto the existing SimControl UI.
// `path` ("local.isOnline") binds to db via SimControl's bind="db.<path>".
function FlowDeclaredControls({
  controls,
}: {
  controls: import('@flowkit/types/index').SimulatorControl[]
}) {
  if (controls.length === 0) {
    return (
      <span className="text-ui-2xs text-theme-text-muted">This flow declares no controls.</span>
    )
  }
  return (
    <>
      {controls.map(c => (
        <SimControl
          key={c.label}
          label={c.label}
          bind={`db.${c.path}`}
          options={c.options}
          description={
            c.type === 'count' && (c.min !== undefined || c.max !== undefined)
              ? `${c.min ?? 0}–${c.max ?? '∞'}`
              : undefined
          }
        />
      ))}
    </>
  )
}

export function FeedbackContent({ views }: { views: PageView[] }) {
  const recorder = useSessionRecorderOptional()

  return (
    <PanelErrorBoundary
      fallback={
        <div className="flex flex-col flex-1 items-center justify-center text-xs opacity-40 p-4">
          Feedback unavailable — check the console
        </div>
      }
      onError={(error, info) =>
        recorder?.logEvent('session.error', {
          message: error.message,
          stack: error.stack,
          componentStack: info.componentStack,
          boundary: 'panel:feedback',
        })
      }
    >
      <div className="flex flex-col flex-1 min-h-0">
        <div className="flex-1 min-h-0 overflow-y-auto">
          <FeedbackPanel views={views} />
        </div>
      </div>
    </PanelErrorBoundary>
  )
}

export function DbContent() {
  const ctx = useDashboard()
  const [viewMode, setViewMode] = useState<DbViewMode>('styled')
  const [forceExpand, setForceExpand] = useState(false)
  return (
    <DbInspector
      db={ctx.db as Record<string, unknown>}
      viewMode={viewMode}
      setViewMode={setViewMode}
      forceExpand={forceExpand}
      setForceExpand={setForceExpand}
      onReset={ctx.resetDb}
    />
  )
}

export function SessionsContent() {
  return (
    <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
      <SessionsPanel />
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export { RAIL_W } from './sidebarConfig'

interface KitSideInspectorProps {
  views: PageView[]
  /** Controlled open state — owned by the parent (DesktopCanvas via usePanelLayout). */
  isOpen: boolean
  onOpenChange: (isOpen: boolean) => void
  sessionsFeatureEnabled?: boolean
}

function KitSideInspectorInner({
  views,
  isOpen,
  onOpenChange,
  sessionsFeatureEnabled,
}: KitSideInspectorProps) {
  const ctx = useDashboard()
  const { setShowExportModal } = useFeedbackTabContext()
  const recorder = useSessionRecorderOptional()
  const savedSessionCount = useSavedSessionCount()
  const { theme } = useTheme()
  const { totalCommentCount, setOpenFeedbackTab } = useFeedback()
  const { devMode, toggleDevMode } = useDevMode()
  const isPlayNode = ctx.activeViewId.endsWith('-play')

  // ── Persisted state ──────────────────────────────────────────────────────────
  const [activeTab, setActiveTab] = useState<InspectorTab>(
    () => readStorage(STORAGE_ACTIVE_TAB, 'info') as InspectorTab
  )
  const [showSessionsFeatureLocal] = useState(() => readStorage(STORAGE_SESSIONS_ENABLED, false))
  const showSessionsFeature = sessionsFeatureEnabled ?? showSessionsFeatureLocal
  const visibleTabs = useMemo(() => getVisibleTabs(showSessionsFeature), [showSessionsFeature])

  const [simSubTab, setSimSubTab] = useState<SimSubTab>(
    () => readStorage(STORAGE_SIM_SUBTAB, 'device') as SimSubTab
  )
  const [debugSubTab, setDebugSubTab] = useState<DebugSubTab>(
    () => readStorage(STORAGE_DEBUG_SUBTAB, 'journey') as DebugSubTab
  )
  const [dbViewMode, setDbViewMode] = useState<DbViewMode>('styled')
  const [dbForceExpand, setDbForceExpand] = useState(false)

  useEffect(() => {
    writeStorage(STORAGE_ACTIVE_TAB, activeTab)
  }, [activeTab])
  useEffect(() => {
    writeStorage(STORAGE_SIM_SUBTAB, simSubTab)
  }, [simSubTab])
  useEffect(() => {
    writeStorage(STORAGE_DEBUG_SUBTAB, debugSubTab)
  }, [debugSubTab])
  // ── Keyboard shortcuts ───────────────────────────────────────────────────────
  usePanelShortcuts({
    activeTab,
    visibleTabs,
    setActiveTab,
    setIsOpen: onOpenChange,
    setSimSubTab,
    setDebugSubTab,
  })

  // ── Feedback tab API ─────────────────────────────────────────────────────────
  useEffect(() => {
    setOpenFeedbackTab(() => {
      setActiveTab('feedback')
      onOpenChange(true)
    })
  }, [setOpenFeedbackTab, onOpenChange])

  // ── Rail tab activation ──────────────────────────────────────────────────────
  const activateTab = useCallback(
    (tab: InspectorTab) => {
      if (tab === activeTab && isOpen) {
        onOpenChange(false)
        recorder?.logEvent('panel.closed', { tab })
      } else {
        setActiveTab(tab)
        onOpenChange(true)
        recorder?.logEvent(isOpen ? 'panel.tab-changed' : 'panel.opened', { tab })
      }
    },
    [activeTab, isOpen, recorder, onOpenChange]
  )

  // ── Sessions export ──────────────────────────────────────────────────────────
  const sessionsExportTriggerRef = useRef<(() => void) | null>(null)

  // ── Content pane ─────────────────────────────────────────────────────────────
  const activeTabMeta = TAB_META[activeTab]
  const tabTitle =
    activeTab === 'feedback'
      ? totalCommentCount > 0
        ? `Feedback · ${totalCommentCount}`
        : 'Feedback'
      : activeTabMeta.label

  const tabActions =
    activeTab === 'feedback' ? (
      <Button
        size="sm"
        onClick={() => setShowExportModal(true)}
        icon={<FileDown size={13} />}
        disabled={totalCommentCount === 0}
      >
        Export
      </Button>
    ) : activeTab === 'sessions' ? (
      <Button
        size="sm"
        onClick={() => sessionsExportTriggerRef.current?.()}
        icon={<FileDown size={13} />}
        disabled={savedSessionCount === 0}
      >
        Export
      </Button>
    ) : activeTab === 'info' && !isPlayNode ? (
      <Button size="sm" onClick={toggleDevMode} variant={devMode ? 'danger' : 'ghost'}>
        {devMode ? 'Cancel' : 'Edit'}
      </Button>
    ) : undefined

  const contentPane = isOpen ? (
    <PanelBody
      side="right"
      className="flex-1"
      scrollable={false}
      toolbar={<ContentHeader title={tabTitle} actions={tabActions} theme={theme} />}
    >
      <ColorBlindSVGDefs />

      {/* Screen Info */}
      {activeTab === 'info' && <ScreenInfoContent views={views} />}

      {/* Simulator */}
      {activeTab === 'simulator' && (
        <SimulatorContent subTab={simSubTab} onSubTabChange={setSimSubTab} />
      )}

      {/* Flow Debugger */}
      {activeTab === 'chapter' && (
        <FlowDebuggerContent subTab={debugSubTab} onSubTabChange={setDebugSubTab} />
      )}

      {/* Database */}
      {activeTab === 'db' && (
        <DbInspector
          db={ctx.db as Record<string, unknown>}
          viewMode={dbViewMode}
          setViewMode={setDbViewMode}
          forceExpand={dbForceExpand}
          setForceExpand={setDbForceExpand}
          onReset={ctx.resetDb}
        />
      )}

      {/* Feedback — always mounted to preserve filter/scroll state */}
      <div
        className={activeTab === 'feedback' ? 'flex flex-col flex-1 min-h-0 size-full' : 'hidden'}
      >
        <div className="flex-1 min-h-0 overflow-y-auto">
          <FeedbackPanel views={views} />
        </div>
      </div>

      {/* Sessions */}
      {activeTab === 'sessions' && showSessionsFeature && (
        <div className="flex flex-col flex-1 min-h-0 overflow-hidden">
          <SessionsPanel
            onExportRequest={trigger => {
              sessionsExportTriggerRef.current = trigger
            }}
          />
        </div>
      )}
    </PanelBody>
  ) : null

  return (
    <div className="relative flex justify-end size-full">
      {contentPane}
      <Sidebar side="right" isOpen={isOpen} onToggle={() => onOpenChange(!isOpen)}>
        {visibleTabs.map(t => (
          <div key={t} className="w-full">
            <SidebarButton
              label={TAB_META[t].label}
              icon={TAB_META[t].icon}
              isActive={t === activeTab && isOpen}
              badge={
                t === 'feedback'
                  ? totalCommentCount || undefined
                  : t === 'sessions'
                    ? savedSessionCount || undefined
                    : undefined
              }
              onClick={() => activateTab(t)}
              activeColor="var(--theme-accent-blue)"
            />
          </div>
        ))}
      </Sidebar>
    </div>
  )
}

export default function KitSideInspector(props: KitSideInspectorProps) {
  return (
    <FeedbackTabProvider views={props.views}>
      <KitSideInspectorInner {...props} />
    </FeedbackTabProvider>
  )
}
