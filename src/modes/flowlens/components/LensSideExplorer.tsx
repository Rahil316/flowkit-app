import PanelBody from '@flowkit-core/layout/PanelBody'
import Sidebar from '@flowkit-core/layout/Sidebar'
import SidebarButton from '@flowkit-core/layout/SidebarButton'
import { useFlowLensSidebarShortcuts } from '@flowkit-core/shortcuts/useKeyboardShortcuts'
import EmptyState from '@flowkit-shared/components/ui/EmptyState'
import FilterPanel, {
  type FilterGroup,
  type FilterState,
} from '@flowkit-shared/components/ui/FilterPanel'
import Input from '@flowkit-shared/components/ui/Input'
import { Activity, Archive, CircleDot, Clock, FolderGit2, Search, Upload, X } from 'lucide-react'
import { useMemo, useRef, useState } from 'react'

import { importSessionFromFile, saveToLibrary } from '../exportUtils'
import { FLOWLENS_ACCENT, FLOWLENS_ACCENT_SOFT } from '../flowLensTheme'
import type { LibraryEntry } from '../useSessionLibrary'

type LeftTab = 'library' | 'recorded'

interface Props {
  entries: LibraryEntry[]
  loading: boolean
  selectedId: string | null
  onSelect: (e: LibraryEntry) => void
  onImported: () => void
  onSaved?: () => void
  isOpen: boolean
  onOpenChange: (open: boolean) => void
}

function fmtDate(ts: number) {
  return new Date(ts).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}
function fmtDur(ms: number) {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return s % 60 ? `${m}m ${s % 60}s` : `${m}m`
}

export default function LensSideExplorer({
  entries,
  onSelect,
  onImported,
  onSaved,
  selectedId,
  loading,
  isOpen,
  onOpenChange,
}: Props) {
  const [tab, setTab] = useState<LeftTab>('library')

  useFlowLensSidebarShortcuts({
    tabs: ['library', 'recorded'],
    activateTab: t => setTab(t as LeftTab),
  })

  const [search, setSearch] = useState('')
  const [filterState, setFilterState] = useState<FilterState>({})
  const searchRef = useRef<HTMLInputElement>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [importError, setImportError] = useState<string | null>(null)

  const libraryEntries = entries.filter(e => e.source === 'library')
  const recordedEntries = entries.filter(e => e.source === 'recorded')
  const visibleEntries = tab === 'library' ? libraryEntries : recordedEntries

  // Build filter groups from tags present in the current tab's entries
  const filterGroups = useMemo((): FilterGroup[] => {
    const tags = [...new Set(visibleEntries.flatMap(e => e.meta.tags))].sort()
    const groups: FilterGroup[] = []
    if (tags.length > 0) {
      groups.push({
        key: 'tags',
        label: 'Tags',
        type: 'multi',
        options: tags.map(t => ({ value: t, label: t })),
      })
    }
    groups.push({
      key: 'quality',
      label: 'Quality',
      type: 'single',
      noneValue: 'all',
      options: [
        { value: 'all', label: 'All' },
        { value: 'high', label: 'High (≥70%)' },
        { value: 'medium', label: 'Medium (≥40%)' },
        { value: 'low', label: 'Low (<40%)' },
      ],
    })
    return groups
  }, [visibleEntries])

  const filteredEntries = useMemo(() => {
    const q = search.toLowerCase()
    const activeTags = (filterState['tags'] as Set<string> | undefined) ?? new Set<string>()
    const quality = (filterState['quality'] as string | null) ?? 'all'
    return visibleEntries.filter(e => {
      if (q && !e.meta.name.toLowerCase().includes(q)) return false
      if (activeTags.size > 0 && !e.meta.tags.some(t => activeTags.has(t))) return false
      if (quality === 'high' && e.meta.qualityScore < 70) return false
      if (quality === 'medium' && (e.meta.qualityScore < 40 || e.meta.qualityScore >= 70))
        return false
      if (quality === 'low' && e.meta.qualityScore >= 40) return false
      return true
    })
  }, [visibleEntries, search, filterState])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    e.target.value = ''
    setImportError(null)
    try {
      await importSessionFromFile(file)
      onImported()
    } catch (err) {
      setImportError(err instanceof Error ? err.message : 'Import failed.')
    }
  }

  async function handleSaveToLibrary(entry: LibraryEntry) {
    const session = await entry.load()
    await saveToLibrary(session)
    onSaved?.()
  }

  function activateTab(t: LeftTab) {
    if (t === tab && isOpen) {
      onOpenChange(false)
    } else {
      if (t !== tab) {
        setSearch('')
        setFilterState({})
      }
      setTab(t)
      onOpenChange(true)
    }
  }

  const contentPane = isOpen ? (
    <PanelBody
      side="left"
      toolbar={
        <div className="p-2 flex items-center gap-2">
          <Input
            ref={searchRef}
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={tab === 'library' ? 'Search library…' : 'Search recorded…'}
            leftIcon={<Search size={13} />}
            rightIcon={
              search ? (
                <button
                  onClick={() => setSearch('')}
                  className="flex items-center justify-center text-theme-text-disabled hover:text-theme-text-primary transition-colors"
                >
                  <X size={11} />
                </button>
              ) : undefined
            }
            style={{ fontSize: 'var(--font-size-ui-xs)' }}
          />
          <FilterPanel
            groups={filterGroups}
            value={filterState}
            onChange={setFilterState}
            label="Filter"
            panelWidth={200}
          />
          {tab === 'recorded' && (
            <button
              onClick={() => fileInputRef.current?.click()}
              title="Import session JSON"
              className="flex items-center gap-1 text-ui-2xs font-semibold text-theme-text-muted bg-transparent border border-theme-border rounded-md py-0.75 px-2 cursor-pointer hover:text-theme-text-secondary transition-colors shrink-0"
            >
              <Upload size={11} />
            </button>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>
      }
    >
      {importError && (
        <div className="text-[10px] text-theme-red p-[6px_12px] leading-tight shrink-0">
          {importError}
        </div>
      )}
      <div className="p-2 flex flex-col gap-1.5">
        {loading && filteredEntries.length === 0 && <EmptyState variant="panel" title="Loading…" />}
        {!loading && visibleEntries.length === 0 && (
          <EmptyState
            variant="panel"
            title={tab === 'library' ? 'No committed sessions yet' : 'No recorded sessions yet'}
            subtitle={
              tab === 'library'
                ? 'Use "Save to library" on a recorded session, or import via CLI.'
                : 'Record one in the app, or use the Import button to load a .json file.'
            }
          />
        )}
        {!loading && visibleEntries.length > 0 && filteredEntries.length === 0 && (
          <EmptyState
            variant="panel"
            title="No results"
            subtitle="No results match your search or filters."
          />
        )}
        {filteredEntries.map(e => (
          <SessionRow
            key={e.meta.id}
            entry={e}
            selected={e.meta.id === selectedId}
            onClick={() => onSelect(e)}
            onSave={
              import.meta.env.DEV && e.source === 'recorded'
                ? () => handleSaveToLibrary(e)
                : undefined
            }
          />
        ))}
      </div>
    </PanelBody>
  ) : null

  return (
    <div className="flex flex-1 flex-row pointer-events-auto size-full">
      <Sidebar side="left" isOpen={isOpen} onToggle={() => onOpenChange(!isOpen)}>
        <SidebarButton
          label="Library"
          icon={FolderGit2}
          isActive={tab === 'library' && isOpen}
          onClick={() => activateTab('library')}
          activeColor={FLOWLENS_ACCENT}
        />
        <SidebarButton
          label="Recorded"
          icon={CircleDot}
          isActive={tab === 'recorded' && isOpen}
          badge={recordedEntries.length || undefined}
          onClick={() => activateTab('recorded')}
          activeColor={FLOWLENS_ACCENT}
        />
      </Sidebar>
      {contentPane}
    </div>
  )
}

// ── Session row ───────────────────────────────────────────────────────────────

function SessionRow({
  entry,
  selected,
  onClick,
  onSave,
}: {
  entry: LibraryEntry
  selected: boolean
  onClick: () => void
  onSave?: () => void
}) {
  const [hover, setHover] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const { meta } = entry
  const duration = meta.endTime ? meta.endTime - meta.startTime : null
  const qColorClass =
    meta.qualityScore >= 70
      ? 'text-theme-green'
      : meta.qualityScore >= 40
        ? 'text-theme-amber'
        : 'text-theme-red'
  const isActive = selected || hover

  async function handleSave(e: React.MouseEvent) {
    e.stopPropagation()
    setSaving(true)
    setSaveError(null)
    try {
      await onSave?.()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Save failed')
    } finally {
      setSaving(false)
    }
  }

  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      aria-pressed={selected}
      className={`text-left w-full p-[9px_11px] rounded-lg cursor-pointer flex flex-col gap-1.5 transition-colors duration-120 ${selected ? '' : hover ? 'bg-theme-hover' : 'bg-theme-elevated'} ${isActive ? '' : 'border border-theme-border'}`}
      style={{
        background: selected ? FLOWLENS_ACCENT_SOFT : undefined,
        border: isActive ? `1px solid ${FLOWLENS_ACCENT}` : undefined,
      }}
    >
      <div className="flex items-center gap-1.5 w-full min-w-0">
        <span className="text-ui-xs font-semibold text-theme-text-primary truncate flex-1">
          {meta.name}
        </span>
        {entry.source === 'library' && entry.studyId && (
          <span className="text-ui-2xs text-theme-text-disabled shrink-0 truncate max-w-20">
            {entry.studyId}
          </span>
        )}
        {onSave && (
          <button
            onClick={handleSave}
            disabled={saving}
            title="Save to library"
            className="shrink-0 flex items-center gap-0.5 text-ui-2xs text-theme-text-disabled hover:text-theme-blue transition-colors disabled:opacity-50"
          >
            <Archive size={10} />
          </button>
        )}
      </div>
      <div className="flex items-center gap-2.5 flex-wrap text-[10.5px] text-theme-text-muted">
        <span className="flex items-center gap-0.5">
          <Clock size={10} /> {fmtDate(meta.startTime)}
        </span>
        {duration !== null && <span>{fmtDur(duration)}</span>}
        <span className="flex items-center gap-0.5">
          <Activity size={10} /> {meta.eventCount}
        </span>
        <span className={`font-bold ${qColorClass}`}>{meta.qualityScore}%</span>
      </div>
      {saveError && <span className="text-[10px] text-theme-red leading-tight">{saveError}</span>}
    </button>
  )
}
