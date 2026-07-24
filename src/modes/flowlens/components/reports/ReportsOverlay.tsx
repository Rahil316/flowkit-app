import type { PageView } from '@flowkit/types/index'
import { useEffect, useMemo, useState } from 'react'

import { exportMarkdownSummary, exportMetricsCsv } from '../../exportUtils'
import { FLOWLENS_ACCENT } from '../../flowLensTheme'
import type { LibraryEntry } from '../../useSessionLibrary'
import AnalyticsOverlay from '../AnalyticsOverlay'
import { ExportMenu } from '../analyticsPrimitives'
import HeatmapView from '../HeatmapView'
import { combinedFunnel, mergedHeatmaps, rollup } from './aggregate'
import {
  applyFilters,
  collectFacets,
  DEFAULT_FILTERS,
  type ReportFilters,
  type SourcedSession,
} from './sessionFilters'

interface Props {
  entries: LibraryEntry[]
  views: PageView[]
  onClose: () => void
}

function fmtDur(ms: number) {
  const s = Math.round(ms / 1000)
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return s % 60 ? `${m}m ${s % 60}s` : `${m}m`
}

export default function ReportsOverlay({ entries, views, onClose }: Props) {
  const [sessions, setSessions] = useState<SourcedSession[] | null>(null)
  const [filters, setFilters] = useState<ReportFilters>(DEFAULT_FILTERS)

  // Load every entry's full export once (then filter in-memory).
  useEffect(() => {
    let cancelled = false
    Promise.all(
      entries.map(async e => ({ ...(await e.load()), source: e.source, studyId: e.studyId }))
    )
      .then(loaded => {
        if (!cancelled) setSessions(loaded)
      })
      .catch(err => {
        console.error('Failed to load reports overlay sessions:', err)
      })
    return () => {
      cancelled = true
    }
  }, [entries])

  const facets = useMemo(() => (sessions ? collectFacets(sessions) : null), [sessions])
  const filtered = useMemo(
    () => (sessions ? applyFilters(sessions, filters) : []),
    [sessions, filters]
  )
  const stats = useMemo(() => rollup(filtered), [filtered])
  const funnel = useMemo(() => combinedFunnel(filtered), [filtered])
  const heatmaps = useMemo(() => mergedHeatmaps(filtered), [filtered])
  const [heatScreen, setHeatScreen] = useState<string>('')

  const activeHeat = heatmaps.find(h => h.pageId === heatScreen) ?? heatmaps[0]

  const set = <K extends keyof ReportFilters>(k: K, v: ReportFilters[K]) =>
    setFilters(f => ({ ...f, [k]: v }))

  const subtitle = sessions
    ? `${filtered.length} of ${sessions.length} sessions match`
    : 'Loading sessions…'

  return (
    <AnalyticsOverlay
      title="Reports"
      subtitle={subtitle}
      onClose={onClose}
      headerAction={
        filtered.length > 0 ? (
          <ExportMenu
            label="Export cohort"
            items={[
              {
                label: `Metrics CSV (${filtered.length})`,
                onClick: () => exportMetricsCsv(filtered),
              },
              {
                label: `Markdown summary (${filtered.length})`,
                onClick: () => exportMarkdownSummary(filtered),
              },
            ]}
          />
        ) : undefined
      }
    >
      <div className="flex flex-col h-full">
        {/* ── Filter bar ── */}
        <div className="flex flex-wrap gap-2.5 items-center py-3 px-5 border-b border-theme-border shrink-0">
          <Select
            label="Screen"
            value={filters.pageId}
            onChange={v => set('pageId', v)}
            options={facets?.pages ?? []}
            anyLabel="Any screen"
          />
          <Select
            label="Device"
            value={filters.device}
            onChange={v => set('device', v)}
            options={facets?.devices ?? []}
            anyLabel="Any device"
          />
          <Select
            label="Connection"
            value={filters.connection}
            onChange={v => set('connection', v)}
            options={facets?.connections ?? []}
            anyLabel="Any connection"
          />
          <Select
            label="Outcome"
            value={filters.completion}
            onChange={v => set('completion', v as ReportFilters['completion'])}
            options={['completed', 'abandoned']}
            anyLabel="Any outcome"
          />
          <Select
            label="Source"
            value={filters.source === 'any' ? '' : filters.source}
            onChange={v => set('source', (v || 'any') as ReportFilters['source'])}
            options={['library', 'recorded']}
            anyLabel="Any source"
          />
          {(facets?.studyIds.length ?? 0) > 0 && (
            <Select
              label="Study"
              value={filters.studyId}
              onChange={v => set('studyId', v)}
              options={facets?.studyIds ?? []}
              anyLabel="Any study"
            />
          )}
          <label className="flex items-center gap-1.5 text-ui-2xs text-theme-text-secondary">
            Min quality
            <input
              type="range"
              min={0}
              max={100}
              value={filters.minQuality}
              onChange={e => set('minQuality', Number(e.target.value))}
              style={{ accentColor: FLOWLENS_ACCENT }}
              className="w-22.5"
            />
            <span className="min-w-7 tabular-nums">{filters.minQuality}%</span>
          </label>
          <label className="flex items-center gap-1.25 text-ui-2xs text-theme-text-secondary">
            <input
              type="checkbox"
              checked={filters.includeTestMode}
              onChange={e => set('includeTestMode', e.target.checked)}
              style={{ accentColor: FLOWLENS_ACCENT }}
            />
            Include test
          </label>
          <button
            onClick={() => setFilters(DEFAULT_FILTERS)}
            className="ml-auto bg-transparent border border-theme-border rounded-md text-theme-text-secondary text-ui-2xs py-1 px-2.5 cursor-pointer"
          >
            Reset filters
          </button>
        </div>

        {/* ── Body ── */}
        <div className="flex-1 overflow-auto p-5 flex flex-col gap-5.5">
          {/* Roll-up cards */}
          <div className="grid grid-cols-[repeat(auto-fill,minmax(150px,1fr))] gap-2.5">
            <Stat label="Sessions" value={String(stats.sessionCount)} />
            <Stat
              label="Completion rate"
              value={`${Math.round(stats.completionRate * 100)}%`}
              accent
            />
            <Stat label="Avg quality" value={`${stats.avgQuality}%`} />
            <Stat label="Avg duration" value={fmtDur(stats.avgDurationMs)} />
            <Stat label="Frustration / session" value={stats.frustrationRate.toFixed(1)} />
            <Stat label="Avg pages" value={String(stats.avgPagesPerSession)} />
            <Stat label="Total events" value={String(stats.totalEvents)} />
          </div>

          {/* Combined funnel */}
          <Section
            title="Combined funnel"
            hint="Sessions reaching each step (drop-off across the cohort)"
          >
            {funnel.length === 0 ? (
              <Empty />
            ) : (
              <div className="flex flex-col gap-1.5">
                {funnel.map(step => {
                  const pct = stats.sessionCount > 0 ? (step.reached / stats.sessionCount) * 100 : 0
                  return (
                    <div key={step.pageId} className="flex items-center gap-2.5">
                      <span className="w-40 text-xs text-theme-text-primary truncate">
                        {step.pageId}
                      </span>
                      <div className="flex-1 h-5.5 bg-theme-elevated rounded-[5px] overflow-hidden relative">
                        <div
                          className="h-full transition-[width] duration-200"
                          style={{
                            width: `${pct}%`,
                            background: FLOWLENS_ACCENT,
                            minWidth: pct > 0 ? 2 : 0,
                          }}
                        />
                        <span className="absolute left-2 top-0 leading-5.5 text-ui-2xs text-white font-semibold">
                          {step.reached}
                        </span>
                      </div>
                      <span
                        style={{
                          color:
                            step.dropOff > 0
                              ? 'var(--color-accent-red)'
                              : 'var(--color-text-disabled)',
                        }}
                        className="w-16 text-right text-ui-2xs"
                      >
                        {step.dropOff > 0
                          ? `−${step.dropOff} (${Math.round(step.dropOffRate * 100)}%)`
                          : '—'}
                      </span>
                    </div>
                  )
                })}
              </div>
            )}
          </Section>

          {/* Top frustrated pages */}
          {stats.topFrustratedPages.length > 0 && (
            <Section
              title="Most frustrated pages"
              hint="Frustrated clicks pooled across the cohort"
            >
              <div className="flex flex-col gap-1">
                {stats.topFrustratedPages.map(s => (
                  <div
                    key={s.pageId}
                    className="flex justify-between text-xs text-theme-text-primary py-0.75"
                  >
                    <span>{s.pageId}</span>
                    <span className="text-red-500 font-semibold">{s.count}</span>
                  </div>
                ))}
              </div>
            </Section>
          )}

          {/* Merged heatmap */}
          <Section
            title="Combined cursor heatmap"
            hint="Cursor samples pooled per screen across all matching sessions"
          >
            {heatmaps.length === 0 ? (
              <Empty label="No cursor data in this cohort" />
            ) : (
              <>
                <div className="flex gap-1.5 flex-wrap mb-3">
                  {heatmaps.map(h => {
                    const active = activeHeat?.pageId === h.pageId
                    return (
                      <button
                        key={h.pageId}
                        onClick={() => setHeatScreen(h.pageId)}
                        style={{
                          borderColor: active ? FLOWLENS_ACCENT : 'var(--color-bg-border)',
                          background: active ? FLOWLENS_ACCENT : 'transparent',
                        }}
                        className={`text-ui-2xs py-1 px-2.25 rounded-md cursor-pointer border ${
                          active ? 'text-white' : 'text-theme-text-secondary'
                        }`}
                      >
                        {h.pageId} <span className="opacity-70">· {h.samples.length}</span>
                      </button>
                    )
                  })}
                </div>
                {activeHeat && (
                  <div className="h-190">
                    <HeatmapView
                      views={views}
                      pageId={activeHeat.pageId}
                      samples={activeHeat.samples}
                      width={activeHeat.samples[0]?.screenW ?? 393}
                      height={activeHeat.samples[0]?.screenH ?? 852}
                      caption={`${activeHeat.samples.length} samples · ${activeHeat.sessionCount} sessions`}
                    />
                  </div>
                )}
              </>
            )}
          </Section>
        </div>
      </div>
    </AnalyticsOverlay>
  )
}

// ── Small UI helpers ────────────────────────────────────────────────────────────

function Select({
  label,
  value,
  onChange,
  options,
  anyLabel,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  options: string[]
  anyLabel: string
}) {
  return (
    <label className="flex items-center gap-1.25 text-ui-2xs text-theme-text-secondary">
      {label}
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="bg-theme-elevated border border-theme-border rounded-[5px] text-theme-text-primary text-ui-2xs py-1 px-1.5 cursor-pointer max-w-37.5 outline-none"
      >
        <option value="">{anyLabel}</option>
        {options.map(o => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </label>
  )
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="bg-theme-elevated border border-theme-border rounded-nlg p-3">
      <div
        style={{
          color: accent ? FLOWLENS_ACCENT : undefined,
        }}
        className="text-2xl font-bold tabular-nums text-theme-text-primary"
      >
        {value}
      </div>
      <div className="text-ui-2xs text-theme-text-muted mt-0.5">{label}</div>
    </div>
  )
}

function Section({
  title,
  hint,
  children,
}: {
  title: string
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <div className="mb-2.5">
        <div className="text-sm font-semibold text-theme-text-primary">{title}</div>
        {hint && <div className="text-ui-2xs text-theme-text-muted mt-px">{hint}</div>}
      </div>
      {children}
    </div>
  )
}

function Empty({ label = 'No data for the current filters' }: { label?: string }) {
  return <div className="text-theme-text-disabled text-xs py-4">{label}</div>
}
