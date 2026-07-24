import type { DevicePreset, PageView } from '@flowkit/types/index'
import { DashboardProvider } from '@flowkit-shared/contexts/DashboardContext'

import type { GroupBy, LabelField } from './FigmaExportSidebar'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface GroupedSection {
  key: string
  label: string
  pages: PageView[]
}

// ─── Constants ────────────────────────────────────────────────────────────────

const GAP = 48
const FIGMA_GAP = 80
const LABEL_H = 36

// ─── Grouping ─────────────────────────────────────────────────────────────────

export function groupPages(screens: PageView[], groupBy: GroupBy): GroupedSection[] {
  if (groupBy === 'flat') return [{ key: '__flat__', label: '', pages: screens }]

  const UNGROUPED = '(Ungrouped)'
  const map = new Map<string, PageView[]>()

  for (const view of screens) {
    let key: string
    if (groupBy === 'chapter') {
      key = view.chapter ?? UNGROUPED
    } else if (groupBy === 'project') {
      key = view.project ?? UNGROUPED
    } else {
      const tags = view.meta?.tags ?? []
      key = tags.length ? tags[0] : UNGROUPED
    }
    const existing = map.get(key) ?? []
    map.set(key, [...existing, view])
  }

  return [...map.entries()]
    .sort(([a], [b]) => (a === UNGROUPED ? 1 : b === UNGROUPED ? -1 : a.localeCompare(b)))
    .map(([key, sectionScreens]) => ({ key, label: key, pages: sectionScreens }))
}

// ─── GroupHeader ──────────────────────────────────────────────────────────────

function GroupHeader({
  label,
  count,
  width,
  isFirst,
}: {
  label: string
  count: number
  width: number
  isFirst: boolean
}) {
  return (
    <div style={{ width, marginTop: isFirst ? 0 : 48, marginBottom: 20 }}>
      {/* Full-width rule above the label */}
      {!isFirst && <div className="h-px bg-theme-border mb-5" />}
      <div className="flex items-center gap-3">
        {/* Accent bar */}
        <div className="w-0.75 h-4 rounded-full bg-theme-blue shrink-0" />
        <span className="text-ui-sm font-bold text-theme-text-primary tracking-tight">{label}</span>
        {/* Count badge */}
        <span className="text-ui-2xs font-semibold px-1.5 py-0.5 rounded bg-theme-elevated border border-theme-border text-theme-text-muted">
          {count}
        </span>
        {/* Trailing rule */}
        <div className="flex-1 h-px bg-theme-border" />
      </div>
    </div>
  )
}

// ─── PageCell ─────────────────────────────────────────────────────────────────

interface PageCellProps {
  view: PageView
  W: number
  H: number
  scaledW: number
  scaledH: number
  activeScale: number
  figmaMode: boolean
  showBorder: boolean
  showShadow: boolean
  effectiveRadius: number
  showLabels: boolean
  labelFields: LabelField[]
  scale: number
}

function PageCell({
  view,
  W,
  H,
  scaledW,
  scaledH,
  activeScale,
  figmaMode,
  showBorder,
  showShadow,
  effectiveRadius,
  showLabels,
  labelFields,
  scale,
}: PageCellProps) {
  const Component = view.component

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: figmaMode ? 12 : Math.round(8 * scale),
      }}
    >
      {/* Frame */}
      <div
        className={[
          !figmaMode && showBorder ? 'border border-theme-border' : '',
          !figmaMode && showShadow ? 'shadow-card' : '',
        ]
          .filter(Boolean)
          .join(' ')}
        style={{
          width: scaledW,
          height: scaledH,
          overflow: 'hidden',
          borderRadius: effectiveRadius,
          flexShrink: 0,
          position: 'relative',
        }}
      >
        <div
          style={{
            width: W,
            height: H,
            transformOrigin: 'top left',
            transform: `scale(${activeScale})`,
            pointerEvents: 'none',
            position: 'absolute',
            top: 0,
            left: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          <DashboardProvider firstViewId={view.id}>
            <div className="flex-1 min-h-0 flex flex-col">
              <Component />
            </div>
          </DashboardProvider>
        </div>
      </div>

      {/* Label */}
      {!figmaMode && showLabels && (
        <div
          className="flex flex-col gap-0.5"
          style={{ minHeight: Math.round(LABEL_H * scale), paddingLeft: 2 }}
        >
          {labelFields.includes('label') && (
            <div
              className="font-bold text-theme-text-primary truncate leading-snug"
              style={{ fontSize: Math.max(10, Math.round(12 * scale)) }}
            >
              {view.label}
            </div>
          )}
          {labelFields.includes('id') && (
            <div
              className="font-mono text-theme-text-muted truncate leading-snug"
              style={{
                fontSize: Math.max(8, Math.round(9 * scale)),
                fontWeight: 500,
                opacity: 0.75,
              }}
            >
              {view.id}
            </div>
          )}
          {labelFields.includes('description') && view.meta?.desc && (
            <div
              className="text-theme-text-muted truncate leading-snug"
              style={{
                fontSize: Math.max(8, Math.round(9 * scale)),
                opacity: 0.6,
                fontStyle: 'italic',
              }}
            >
              {view.meta.desc}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ─── FigmaExportGrid ──────────────────────────────────────────────────────────

interface FigmaExportGridProps {
  sections: GroupedSection[]
  groupBy: GroupBy
  preset: DevicePreset
  scale: number
  figmaMode: boolean
  showLabels: boolean
  labelFields: LabelField[]
  showBorder: boolean
  showShadow: boolean
  cornerRadiusOverride: number | null
  gridAreaWidth: number
}

export default function FigmaExportGrid({
  sections,
  groupBy,
  preset,
  scale,
  figmaMode,
  showLabels,
  labelFields,
  showBorder,
  showShadow,
  cornerRadiusOverride,
  gridAreaWidth,
}: FigmaExportGridProps) {
  const W = preset.width
  const H = preset.height

  const activeScale = figmaMode ? 1 : scale
  const activeGap = figmaMode ? FIGMA_GAP : Math.round(GAP * scale)
  const padding = figmaMode ? FIGMA_GAP : GAP

  const scaledW = Math.round(W * activeScale)
  const scaledH = Math.round(H * activeScale)

  const COLS = Math.max(1, Math.floor((gridAreaWidth - padding * 2) / (scaledW + activeGap)))
  const gridW = COLS * scaledW + (COLS - 1) * activeGap

  const effectiveRadius = Math.round(
    (cornerRadiusOverride ?? preset.screenRadius ?? preset.cornerRadius) * activeScale
  )

  return (
    <div className="flex flex-col" style={{ padding }}>
      {sections.map((section, i) => (
        <div key={section.key}>
          {groupBy !== 'flat' && section.label && (
            <GroupHeader
              label={section.label}
              count={section.pages.length}
              width={gridW}
              isFirst={i === 0}
            />
          )}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${COLS}, ${scaledW}px)`,
              gap: activeGap,
              width: gridW,
            }}
          >
            {section.pages.map(view => (
              <PageCell
                key={view.id}
                view={view}
                W={W}
                H={H}
                scaledW={scaledW}
                scaledH={scaledH}
                activeScale={activeScale}
                figmaMode={figmaMode}
                showBorder={showBorder}
                showShadow={showShadow}
                effectiveRadius={effectiveRadius}
                showLabels={showLabels}
                labelFields={labelFields}
                scale={scale}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}
