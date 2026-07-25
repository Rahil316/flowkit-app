import type { Chapter } from '@flowkit/types/index'
import { ToolbarTooltipContent } from '@flowkit-core/canvas/ToolbarBtn'
import PanelBody from '@flowkit-core/layout/PanelBody'
import { FlowLibrary, PagesHierarchy } from '@flowkit-features/flow-library'
import { useFlowLibrary } from '@flowkit-features/flow-library'
import { useSessionRecorderOptional } from '@flowkit-features/flowTracer/context'
import { DEVICE_PRESETS } from '@flowkit-shared/components/devices'
import FilterPanel, {
  type FilterGroup,
  type FilterState,
} from '@flowkit-shared/components/ui/FilterPanel'
import Input from '@flowkit-shared/components/ui/Input'
import SegmentedControl from '@flowkit-shared/components/ui/SegmentedControl'
import Select from '@flowkit-shared/components/ui/Select'
import Tooltip from '@flowkit-shared/components/ui/Tooltip'
import { useActiveWorkspace } from '@flowkit-shared/contexts/ActiveWorkspaceContext'
import { useDashboard } from '@flowkit-shared/contexts/DashboardContext'
import { useTheme } from '@flowkit-shared/contexts/ThemeContext'
import { useExplorerCommands } from '@flowkit-shared/utils/explorerCommands'
import { useWorkspaceHierarchy } from '@flowkit-shared/utils/useWorkspaceHierarchy'
import { GitBranch, Layers, Search, Smartphone, Tablet, X } from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useNavigationShortcuts, useSidebarShortcuts } from '../shortcuts/useKeyboardShortcuts'
import Sidebar from './Sidebar'
import SidebarButton from './SidebarButton'

// ── Persistence ───────────────────────────────────────────────────────────────

const STORAGE_LEFT_TAB = 'flowkit:left-panel:tab'

function readStorage<T>(key: string, fallback: T): T {
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

// ── Left panel tabs ───────────────────────────────────────────────────────────

type LeftTab = 'screens' | 'chapters'

const LEFT_TAB_META: Record<LeftTab, { label: string; icon: React.ElementType }> = {
  screens: { label: 'Screens', icon: Layers },
  chapters: { label: 'Stories', icon: GitBranch },
}

// ── Props ─────────────────────────────────────────────────────────────────────

interface Props {
  chapters: Chapter[]
  /** Controlled open state — owned by the parent (DesktopCanvas via usePanelLayout). Required unless bare=true. */
  isOpen?: boolean
  onOpenChange?: (isOpen: boolean) => void
  onOpenSettings?: () => void
  hideDeviceControls?: boolean
  /** Mobile mode: skip the Sidebar wrapper and always show content expanded */
  bare?: boolean
}

// ── Main component ────────────────────────────────────────────────────────────

export default function KitSideExplorer({
  chapters,
  isOpen = false,
  onOpenChange = () => {},
  onOpenSettings,
  hideDeviceControls = false,
  bare = false,
}: Props) {
  const { theme } = useTheme()
  const {
    activeViewId,
    navigateTo,
    devicePreset,
    setDevicePreset,
    orientation,
    toggleOrientation,
  } = useDashboard()
  const recorder = useSessionRecorderOptional()

  const activeWorkspaceName = useActiveWorkspace()
  const [tab, setTab] = useState<LeftTab>(() => readStorage(STORAGE_LEFT_TAB, 'screens') as LeftTab)
  const [pageFilter, setPageFilter] = useState<string | null>(null)
  const [filterState, setFilterState] = useState<FilterState>({})

  const { hasHierarchy, tree } = useWorkspaceHierarchy(activeWorkspaceName)
  const { allTags: flowTags } = useFlowLibrary()

  // Collect page tags from hierarchy tree
  const screenTags = useMemo(() => {
    const set = new Set<string>()
    function walk(nodes: typeof tree) {
      for (const n of nodes) {
        if (n.kind === 'page') (n.view?.meta?.tags ?? []).forEach(t => set.add(t))
        else if (n.children) walk(n.children)
      }
    }
    walk(tree)
    return [...set].sort()
  }, [tree])

  // Build filter groups per tab
  const filterGroups = useMemo((): FilterGroup[] => {
    const tags = tab === 'chapters' ? flowTags : screenTags
    const groups: FilterGroup[] = []
    if (tags.length > 0) {
      groups.push({
        key: 'tags',
        label: 'Tags',
        type: 'multi',
        options: tags.map(t => ({ value: t, label: t })),
      })
    }
    if (tab === 'screens') {
      groups.push({
        key: 'coverage',
        label: 'Coverage',
        type: 'single',
        noneValue: 'all',
        options: [
          { value: 'all', label: 'All screens' },
          { value: 'covered', label: 'Covered by a flow' },
          { value: 'uncovered', label: 'Not in any flow' },
        ],
      })
    }
    return groups
  }, [tab, flowTags, screenTags])

  const activeTags = (filterState['tags'] as Set<string> | undefined) ?? new Set<string>()

  useEffect(() => {
    writeStorage(STORAGE_LEFT_TAB, tab)
  }, [tab])

  const [search, setSearch] = useState('')
  const [flowDetailOpen, setFlowDetailOpen] = useState(false)
  const searchRef = useRef<HTMLInputElement>(null)
  const focusSearch = useCallback(() => searchRef.current?.focus(), [])

  const activateTab = useCallback(
    (t: LeftTab) => {
      if (t === tab && isOpen) {
        onOpenChange(false)
      } else {
        if (t !== tab) {
          setFilterState({})
          setFlowDetailOpen(false)
        }
        setTab(t)
        onOpenChange(true)
      }
    },
    [tab, isOpen, onOpenChange]
  )

  useSidebarShortcuts({
    tabs: Object.keys(LEFT_TAB_META) as LeftTab[],
    setTab: t => {
      if (t !== tab) setFlowDetailOpen(false)
      setTab(t as LeftTab)
    },
    focusSearch,
  })
  useNavigationShortcuts({ chapters, activeViewId, navigateTo })

  useExplorerCommands(
    useCallback(
      cmd => {
        if (cmd.type === 'switchTab') {
          const isFullscreen = !!document.fullscreenElement
          if (isFullscreen || bare) return
          setFlowDetailOpen(false)
          setTab(cmd.tab)
          onOpenChange(true)
        }
      },
      [bare, onOpenChange]
    )
  )

  const searchPlaceholder = tab === 'chapters' ? 'Search chapters…' : 'Search screens…'

  // ── Content pane ──────────────────────────────────────────────────────────────
  const contentPane =
    isOpen || bare ? (
      <PanelBody
        side="left"
        className="flex-1"
        scrollable={false}
        toolbar={
          <div
            className="p-2 flex items-center gap-2"
            style={{ display: tab === 'chapters' && flowDetailOpen ? 'none' : undefined }}
          >
            <Input
              ref={searchRef}
              value={search}
              onChange={e => {
                setSearch(e.target.value)
                if (e.target.value)
                  recorder?.logEvent('sidebar.search-used', { query: e.target.value })
              }}
              placeholder={searchPlaceholder}
              leftIcon={<Search size={13} />}
              rightIcon={
                search ? (
                  <button
                    onClick={() => setSearch('')}
                    className="flex items-center justify-center transition-colors hover:text-theme-text-primary"
                    style={{ color: theme.text.disabled }}
                  >
                    <X size={11} />
                  </button>
                ) : undefined
              }
              style={{ fontSize: 'var(--font-size-ui-xs)' }}
            />
            {filterGroups.length > 0 && (
              <FilterPanel
                groups={filterGroups}
                value={filterState}
                onChange={setFilterState}
                label="Filter"
                panelWidth={200}
              />
            )}
          </div>
        }
        footer={
          !hideDeviceControls ? (
            <div className="flex flex-col gap-2 p-3">
              <div className="flex items-center gap-1.5">
                <Select
                  value={devicePreset.label}
                  onChange={e => {
                    const preset = DEVICE_PRESETS.find(p => p.label === e.target.value)
                    if (preset) setDevicePreset(preset)
                  }}
                  style={{ flex: 1, minWidth: 0 }}
                >
                  {(['phone', 'tablet', 'desktop', 'wearable'] as const).map(type => {
                    const group = DEVICE_PRESETS.filter(p => p.type === type)
                    if (!group.length) return null
                    const label = type.charAt(0).toUpperCase() + type.slice(1) + 's'
                    return (
                      <optgroup key={type} label={label}>
                        {group.map(p => (
                          <option key={p.label} value={p.label}>
                            {p.label}
                          </option>
                        ))}
                      </optgroup>
                    )
                  })}
                </Select>
                {devicePreset.supportsLandscape !== false && (
                  <Tooltip
                    content={<ToolbarTooltipContent label="Toggle orientation" shortcut="\" />}
                    placement="top"
                    showDelay={1500}
                  >
                    <SegmentedControl
                      value={orientation}
                      onChange={v => v !== orientation && toggleOrientation()}
                      activeColor="blue"
                    >
                      <SegmentedControl.Segment value="portrait">
                        <Smartphone size={12} strokeWidth={2} />
                      </SegmentedControl.Segment>
                      <SegmentedControl.Segment value="landscape">
                        <Tablet size={12} strokeWidth={2} style={{ transform: 'rotate(90deg)' }} />
                      </SegmentedControl.Segment>
                    </SegmentedControl>
                  </Tooltip>
                )}
              </div>
            </div>
          ) : undefined
        }
      >
        {/* Stories */}
        {tab === 'chapters' && (
          <div className="flex-1 min-h-0 overflow-y-auto">
            <FlowLibrary
              pageFilter={pageFilter}
              onClearPageFilter={() => setPageFilter(null)}
              search={search}
              activeTags={activeTags}
              onDetailChange={setFlowDetailOpen}
            />
          </div>
        )}

        {/* Screens — hierarchy */}
        {tab === 'screens' && hasHierarchy && (
          <PagesHierarchy
            search={search}
            activeTags={activeTags}
            onFindInLibrary={(pageId: string) => {
              setPageFilter(pageId)
              setTab('chapters')
            }}
          />
        )}
      </PanelBody>
    ) : null

  if (bare) {
    return (
      <div className="flex flex-row size-full">
        {/* Mobile sub-tab rail — desktop SidebarButton style */}
        <div className="w-11 shrink-0 flex flex-col border-r border-theme-border bg-theme-elevated">
          {(['screens', 'chapters'] as LeftTab[]).map(t => {
            const active = tab === t
            const Icon = LEFT_TAB_META[t].icon
            return (
              <button
                key={t}
                onClick={() => {
                  if (t !== tab) setFlowDetailOpen(false)
                  setTab(t)
                }}
                title={LEFT_TAB_META[t].label}
                className={`relative w-full h-11 flex items-center justify-center border-none cursor-pointer transition-colors duration-120 ${active ? 'bg-theme-base text-theme-blue' : 'bg-transparent text-theme-text-muted hover:text-theme-text-secondary'}`}
              >
                <Icon size={16} />
                {active && (
                  <span className="absolute right-0 w-0.5 rounded-l bg-theme-blue inset-y-2" />
                )}
              </button>
            )
          })}
        </div>
        <div className="flex-1 min-w-0 overflow-hidden">{contentPane}</div>
      </div>
    )
  }

  return (
    <aside className="flex flex-row size-full">
      <Sidebar
        side="left"
        isOpen={isOpen}
        onToggle={() => onOpenChange(!isOpen)}
        onOpenSettings={onOpenSettings}
      >
        {(['screens', 'chapters'] as LeftTab[]).map(t => (
          <SidebarButton
            key={t}
            label={LEFT_TAB_META[t].label}
            icon={LEFT_TAB_META[t].icon}
            isActive={t === tab && isOpen}
            onClick={() => activateTab(t)}
            activeColor="var(--theme-accent-blue)"
          />
        ))}
      </Sidebar>
      {contentPane}
    </aside>
  )
}
