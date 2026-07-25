import type { SessionMetrics } from '../analyticsEngine'
import { FLOWLENS_ACCENT } from '../flowLensTheme'

interface Props {
  metrics: SessionMetrics
}

function formatMs(ms: number): string {
  if (ms < 1000) return `${ms}ms`
  const s = Math.round(ms / 100) / 10
  if (s < 60) return `${s}s`
  const m = Math.floor(s / 60)
  return `${m}m ${Math.round(s % 60)}s`
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="bg-theme-elevated border border-theme-border rounded-lg p-2.5">
      <div className="text-ui-2xs text-theme-text-muted mb-1">{label}</div>
      <div className="text-lg font-semibold text-theme-text-primary leading-none">{value}</div>
      {sub && <div className="text-[10px] text-theme-text-disabled mt-1">{sub}</div>}
    </div>
  )
}

export default function MetricsView({ metrics }: Props) {
  const topPages = [...metrics.pageMetrics].sort((a, b) => b.visitCount - a.visitCount).slice(0, 8)

  const topFrustrated = [...metrics.pageMetrics]
    .filter(s => s.frustratedClickCount > 0)
    .sort((a, b) => b.frustratedClickCount - a.frustratedClickCount)
    .slice(0, 5)

  return (
    <div className="h-full overflow-y-auto p-3">
      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-2 mb-4">
        <StatCard label="Duration" value={formatMs(metrics.totalDuration)} />
        <StatCard label="Events" value={String(metrics.eventCount)} />
        <StatCard label="Pages visited" value={String(metrics.uniquePagesVisited)} />
        <StatCard label="Remarks" value={String(metrics.remarksCount)} />
        <StatCard
          label="Chapters completed"
          value={`${metrics.chaptersCompleted.length} / ${metrics.chaptersEntered.length}`}
          sub={
            metrics.chaptersEntered.length > 0
              ? `${Math.round((metrics.chaptersCompleted.length / metrics.chaptersEntered.length) * 100)}% completion`
              : undefined
          }
        />
        <StatCard label="Quality" value={`${metrics.qualityScore}%`} />
      </div>

      {/* Page visit breakdown */}
      <Section title="Page visits">
        {topPages.map(s => (
          <Row
            key={s.pageId}
            label={s.pageId}
            value={`${s.visitCount}×`}
            sub={`avg ${formatMs(s.avgDwellMs)}`}
            bar={topPages[0].visitCount > 0 ? s.visitCount / topPages[0].visitCount : 0}
            barColor={FLOWLENS_ACCENT}
          />
        ))}
      </Section>

      {/* Chapter metrics */}
      {metrics.chapterMetrics.length > 0 && (
        <Section title="Chapter completion">
          {metrics.chapterMetrics.map(f => (
            <Row
              key={f.chapterId}
              label={f.chapterId}
              value={`${Math.round(f.completionRate * 100)}%`}
              sub={`${f.completionCount}/${f.entryCount} entries`}
              bar={f.completionRate}
              barColor="var(--color-accent-green)"
            />
          ))}
        </Section>
      )}

      {/* Frustrated clicks */}
      {topFrustrated.length > 0 && (
        <Section title="Frustrated clicks">
          {topFrustrated.map(s => (
            <Row
              key={s.pageId}
              label={s.pageId}
              value={String(s.frustratedClickCount)}
              bar={
                topFrustrated[0].frustratedClickCount > 0
                  ? s.frustratedClickCount / topFrustrated[0].frustratedClickCount
                  : 0
              }
              barColor="var(--color-accent-red)"
            />
          ))}
        </Section>
      )}

      {/* Navigation breakdown */}
      {Object.keys(metrics.navigationBreakdown).length > 0 && (
        <Section title="Navigation">
          {Object.entries(metrics.navigationBreakdown)
            .sort((a, b) => b[1] - a[1])
            .map(([type, count]) => (
              <Row
                key={type}
                label={type.replace('navigation.', '')}
                value={String(count)}
                bar={0}
                barColor={FLOWLENS_ACCENT}
              />
            ))}
        </Section>
      )}
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-4">
      <div className="text-[10px] font-semibold text-theme-text-muted uppercase tracking-wider mb-1.5">
        {title}
      </div>
      <div className="flex flex-col gap-0.5">{children}</div>
    </div>
  )
}

function Row({
  label,
  value,
  sub,
  bar,
  barColor,
}: {
  label: string
  value: string
  sub?: string
  bar: number
  barColor: string
}) {
  return (
    <div className="flex items-center gap-2 p-1.25 px-2 rounded-md bg-theme-elevated">
      <div className="flex-1 min-w-0">
        <div className="text-ui-2xs text-theme-text-primary truncate">{label}</div>
        {sub && <div className="text-[10px] text-theme-text-muted">{sub}</div>}
        {bar > 0 && (
          <div className="h-0.5 bg-theme-border rounded-sm mt-1">
            <div
              className="h-full rounded-sm"
              style={{
                width: `${bar * 100}%`,
                background: barColor,
              }}
            />
          </div>
        )}
      </div>
      <span className="text-xs text-theme-text-secondary shrink-0 tabular-nums">{value}</span>
    </div>
  )
}
