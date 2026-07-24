import type { DevicePreset, PageView } from '@flowkit/types/index'
import { DEVICE_PRESETS } from '@flowkit-shared/components/devices'
import { Z } from '@flowkit-shared/constants/zIndex'
import { PanelLeft } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'

import FigmaExportGrid, { groupPages } from './FigmaExportGrid'
import type { CanvasBg, GroupBy, LabelField } from './FigmaExportSidebar'
import FigmaExportSidebar, { SIDEBAR_W } from './FigmaExportSidebar'

// ─── Constants ────────────────────────────────────────────────────────────────

const DEFAULT_PRESET: DevicePreset =
  DEVICE_PRESETS.find(p => p.type === 'phone') ?? DEVICE_PRESETS[0]

const BG_MAP: Record<CanvasBg, string> = {
  theme: 'var(--color-theme-base)',
  dark: '#111113',
  light: '#f4f4f5',
  white: '#ffffff',
}

// ─── FigmaIcon (for figma mode banner) ────────────────────────────────────────

function FigmaIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 38 57"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M19 28.5A9.5 9.5 0 1 1 28.5 19 9.5 9.5 0 0 1 19 28.5z"
        fill="currentColor"
        opacity="0.9"
      />
      <path
        d="M9.5 57A9.5 9.5 0 0 0 19 47.5V38H9.5a9.5 9.5 0 0 0 0 19z"
        fill="currentColor"
        opacity="0.6"
      />
      <path d="M9.5 19H19V0H9.5a9.5 9.5 0 0 0 0 19z" fill="currentColor" opacity="0.6" />
      <path d="M19 0h9.5a9.5 9.5 0 0 1 0 19H19z" fill="currentColor" opacity="0.8" />
      <path
        d="M28.5 19A9.5 9.5 0 0 1 19 28.5V38h9.5a9.5 9.5 0 0 0 0-19z"
        fill="currentColor"
        opacity="0.7"
      />
    </svg>
  )
}

// ─── FigmaExportView ──────────────────────────────────────────────────────────

export default function FigmaExportView({ views }: { views: PageView[] }) {
  const pages = useMemo(() => views.filter(v => !v.id.endsWith('-play')), [views])

  // ── Device ──────────────────────────────────────────────────────────────────
  const [preset, setPreset] = useState<DevicePreset>(DEFAULT_PRESET)

  // ── Sidebar ─────────────────────────────────────────────────────────────────
  const [sidebarOpen, setSidebarOpen] = useState(true)

  // ── Scale ───────────────────────────────────────────────────────────────────
  const [scale, setScale] = useState(0.5)

  // ── Figma export mode ────────────────────────────────────────────────────────
  const [figmaMode, setFigmaMode] = useState(false)

  // ── Canvas ───────────────────────────────────────────────────────────────────
  const [canvasBg, setCanvasBg] = useState<CanvasBg>('theme')

  // ── Frame ────────────────────────────────────────────────────────────────────
  const [showBorder, setShowBorder] = useState(true)
  const [showShadow, setShowShadow] = useState(true)
  const [cornerRadiusOverride, setCornerRadiusOverride] = useState<number | null>(null)

  // ── Labels ───────────────────────────────────────────────────────────────────
  const [showLabels, setShowLabels] = useState(true)
  const [labelFields, setLabelFields] = useState<LabelField[]>(['label', 'id'])

  // ── Window width (updated on resize) ────────────────────────────────────────
  const [windowWidth, setWindowWidth] = useState(window.innerWidth)
  useEffect(() => {
    const onResize = () => setWindowWidth(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // ── Grouping ─────────────────────────────────────────────────────────────────
  const [groupBy, setGroupBy] = useState<GroupBy>('flat')

  // ── Filtering ────────────────────────────────────────────────────────────────
  const [searchQuery, setSearchQuery] = useState('')
  const [filterChapter, setFilterChapter] = useState<string | null>(null)
  const [filterTags, setFilterTags] = useState<Set<string>>(new Set())

  // ── Derived filter options ───────────────────────────────────────────────────
  const allTags = useMemo(
    () => [...new Set(pages.flatMap(v => v.meta?.tags ?? []))].sort(),
    [pages]
  )
  const allChapters = useMemo(
    () => [...new Set(pages.map(v => v.chapter).filter((f): f is string => Boolean(f)))].sort(),
    [pages]
  )

  // ── Filtered + grouped pages ─────────────────────────────────────────────────
  const filteredPages = useMemo(
    () =>
      pages.filter(view => {
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase()
          if (!view.label.toLowerCase().includes(q) && !view.id.toLowerCase().includes(q))
            return false
        }
        if (filterChapter !== null && (view.chapter ?? null) !== filterChapter) return false
        if (filterTags.size > 0) {
          const tags = view.meta?.tags ?? []
          if (!tags.some(t => filterTags.has(t))) return false
        }
        return true
      }),
    [pages, searchQuery, filterChapter, filterTags]
  )

  const sections = useMemo(() => groupPages(filteredPages, groupBy), [filteredPages, groupBy])

  // ── Grid area width ──────────────────────────────────────────────────────────
  const gridAreaWidth = windowWidth - (sidebarOpen && !figmaMode ? SIDEBAR_W : 0)

  return (
    <div className="flex flex-row h-screen w-screen overflow-hidden">
      {/* Sidebar */}
      <FigmaExportSidebar
        open={sidebarOpen && !figmaMode}
        preset={preset}
        onPresetChange={setPreset}
        scale={scale}
        onScaleChange={setScale}
        canvasBg={canvasBg}
        onCanvasBgChange={setCanvasBg}
        showBorder={showBorder}
        onShowBorderChange={setShowBorder}
        showShadow={showShadow}
        onShowShadowChange={setShowShadow}
        cornerRadiusOverride={cornerRadiusOverride}
        onCornerRadiusOverrideChange={setCornerRadiusOverride}
        showLabels={showLabels}
        onShowLabelsChange={setShowLabels}
        labelFields={labelFields}
        onLabelFieldsChange={setLabelFields}
        groupBy={groupBy}
        onGroupByChange={setGroupBy}
        searchQuery={searchQuery}
        onSearchQueryChange={setSearchQuery}
        filterChapter={filterChapter}
        onFilterChapterChange={setFilterChapter}
        filterTags={filterTags}
        onFilterTagsChange={setFilterTags}
        allChapters={allChapters}
        allTags={allTags}
        onFigmaExport={() => setFigmaMode(true)}
      />

      {/* Grid area */}
      <div
        className="flex-1 overflow-auto flex flex-col"
        style={{ background: figmaMode ? '#ffffff' : BG_MAP[canvasBg] }}
      >
        {/* Minimal info strip */}
        {!figmaMode && (
          <div
            className="sticky top-0 z-10 flex items-center gap-2 px-3 py-2 border-b border-theme-border shrink-0"
            style={{ background: BG_MAP[canvasBg] }}
          >
            <button
              onClick={() => setSidebarOpen(o => !o)}
              className={[
                'flex items-center justify-center w-6 h-6 rounded-[5px] transition-colors duration-120 shrink-0',
                sidebarOpen
                  ? 'bg-theme-blue-dim text-theme-blue'
                  : 'text-theme-text-muted hover:bg-theme-hover hover:text-theme-text-secondary',
              ].join(' ')}
              title={sidebarOpen ? 'Hide sidebar' : 'Show sidebar'}
            >
              <PanelLeft size={13} />
            </button>
            <span className="text-ui-2xs font-semibold text-theme-text-muted">
              {filteredPages.length === pages.length
                ? `${pages.length} pages`
                : `${filteredPages.length} of ${pages.length} pages`}
              {' · '}
              {preset.label}
              {' · '}⌘⌥⇧P to close
            </span>
          </div>
        )}

        {/* Figma mode banner */}
        {figmaMode && (
          <div
            className="fixed top-0 inset-x-0 flex items-center justify-between px-6 py-2.5 text-white shrink-0"
            style={{
              zIndex: Z.banner,
              background: 'rgba(37,99,235,0.95)',
              backdropFilter: 'blur(8px)',
              boxShadow: '0 2px 12px rgba(37,99,235,0.35)',
            }}
          >
            <div className="flex items-center gap-2.5">
              <FigmaIcon size={16} />
              <span className="font-bold text-ui-sm">Figma Export Mode</span>
              <span className="text-ui-2xs opacity-75">
                Pages are at 1:1 on white. Run the Web to Figma plugin now, then click Done.
              </span>
            </div>
            <button
              onClick={() => setFigmaMode(false)}
              className="text-ui-2xs font-bold px-3.5 py-1.25 rounded-md cursor-pointer bg-white/20 border border-white/35 text-white hover:bg-white/30 transition-colors duration-150"
            >
              Done
            </button>
          </div>
        )}

        {/* Grid */}
        <FigmaExportGrid
          sections={sections}
          groupBy={groupBy}
          preset={preset}
          scale={scale}
          figmaMode={figmaMode}
          showLabels={showLabels}
          labelFields={labelFields}
          showBorder={showBorder}
          showShadow={showShadow}
          cornerRadiusOverride={cornerRadiusOverride}
          gridAreaWidth={gridAreaWidth}
        />
      </div>
    </div>
  )
}
