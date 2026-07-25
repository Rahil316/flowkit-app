import { type FlowStep, type FlowStoryDef, type Fork, isFlowStoryRef } from '@flowkit/types/index'
import { useFlowPlaybackOptional } from '@flowkit-features/flowStory/FlowPlaybackContext'
import Button from '@flowkit-shared/components/ui/Button'
import SharedEmptyState from '@flowkit-shared/components/ui/EmptyState'
import Tag from '@flowkit-shared/components/ui/Tag'
import { useNavigation } from '@flowkit-shared/contexts/DashboardContext'
import { useExplorerCommands } from '@flowkit-shared/utils/explorerCommands'
import {
  CheckCircle2,
  ChevronLeft,
  Clock,
  GitFork,
  Layers,
  Play,
  Search,
  Square,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import FlowCanvas from './FlowCanvas'
import { readLastRun } from './runHistory'
import { type FlowSummary, useFlowLibrary } from './useFlowLibrary'

// ── Stories ────────────────────────────────────────────────────────────────

interface Props {
  pageFilter?: string | null
  onClearPageFilter?: () => void
  search?: string
  activeTags?: Set<string>
  onDetailChange?: (open: boolean) => void
}

export default function FlowLibrary({
  pageFilter,
  onClearPageFilter,
  search: searchProp,
  activeTags: activeTagsProp,
  onDetailChange,
}: Props) {
  const { navigateTo, firstViewId } = useNavigation()
  const { summaries } = useFlowLibrary()
  const playback = useFlowPlaybackOptional()

  const [selectedId, setSelectedId] = useState<string | null>(null)

  useEffect(() => {
    onDetailChange?.(selectedId !== null)
  }, [selectedId, onDetailChange])

  useExplorerCommands(
    useCallback(cmd => {
      if (cmd.type === 'openFlowStoryDetail') setSelectedId(cmd.flowStoryId)
    }, [])
  )

  const [internalSearch, setInternalSearch] = useState('')
  const search = searchProp ?? internalSearch
  const activeTags = useMemo(() => activeTagsProp ?? new Set<string>(), [activeTagsProp])
  const selected = summaries.find(s => s.id === selectedId) ?? null

  const q = search.toLowerCase()
  const filtered = useMemo(() => {
    return summaries.filter(s => {
      if (
        q &&
        !s.name.toLowerCase().includes(q) &&
        !(s.description ?? '').toLowerCase().includes(q)
      )
        return false
      if (activeTags.size > 0 && s.tags.length > 0 && !s.tags.some(t => activeTags.has(t)))
        return false
      return true
    })
  }, [summaries, q, activeTags])

  const pageGroups = useMemo(() => {
    if (!pageFilter) return null
    const starts = filtered.filter(s => s.firstPageId === pageFilter)
    const includes = filtered.filter(
      s => s.firstPageId !== pageFilter && s.pageIds.includes(pageFilter)
    )
    return { starts, includes }
  }, [filtered, pageFilter])

  if (selected) {
    const isSelectedPlaying =
      playback?.isGating && playback.activeFlowStory?.__flowStory.flowStoryId === selected.id
    const activeSourcePageId = isSelectedPlaying
      ? (playback?.activeFlowStory?.__flowStory.steps[playback.currentStepIndex]?.sourcePageId ??
        null)
      : null
    return (
      <FlowDetail
        summary={selected}
        onBack={() => {
          if (isSelectedPlaying) {
            playback?.exit()
            // Same as onStop below — must navigate OFF the `-play` runner view,
            // otherwise FlowMaster stays mounted with its already-compiled flow
            // and keeps rendering flowStory hints/captions after exit().
            navigateTo(activeSourcePageId ?? firstViewId ?? 'home')
          }
          setSelectedId(null)
        }}
        onPlay={() => navigateTo(`${selected.id}-play`)}
        onStop={() => {
          playback?.exit()
          // Land on the GENERIC (non-flowStory) version of whatever page was
          // active — not home, not back to this list. Known trade-off: the db
          // resets to the workspace default on exit(), so a page authored
          // assuming accumulated flowStory db state may render sparsely here.
          navigateTo(activeSourcePageId ?? firstViewId ?? 'home')
        }}
      />
    )
  }

  return (
    <div className="flex flex-col h-full">
      {searchProp === undefined && (
        <div className="px-3 pt-3 pb-2 shrink-0">
          <div className="relative">
            <Search
              size={13}
              className="absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none text-theme-text-disabled"
            />
            <input
              value={internalSearch}
              onChange={e => setInternalSearch(e.target.value)}
              placeholder="Search flows…"
              className="w-full rounded-lg pl-8 pr-3 py-1.5 outline-none transition-colors text-ui-xs bg-theme-base border border-theme-border text-theme-text-primary"
            />
          </div>
        </div>
      )}

      {pageFilter && (
        <div className="mx-3 mb-2 px-2.5 py-1.5 rounded-lg flex items-center justify-between shrink-0 bg-theme-blue-dim border border-theme-blue/20">
          <span className="text-ui-2xs text-theme-blue">
            Flows with <code className="font-mono">{pageFilter}</code>
          </span>
          <button onClick={onClearPageFilter} className="font-semibold text-ui-2xs text-theme-blue">
            clear
          </button>
        </div>
      )}

      <div className="flex-1 overflow-y-auto px-2 pb-3 flex flex-col gap-1.5 pt-1">
        {pageGroups ? (
          <>
            <Group label="Starts here" list={pageGroups.starts} onSelect={setSelectedId} />
            <Group label="Passes through" list={pageGroups.includes} onSelect={setSelectedId} />
          </>
        ) : filtered.length === 0 ? (
          <EmptyState hasAny={summaries.length > 0} />
        ) : (
          filtered.map(s => (
            <FlowCard key={s.id} summary={s} onSelect={() => setSelectedId(s.id)} />
          ))
        )}
      </div>
    </div>
  )
}

// ─── Group ──────────────────────────────────────────────────────────────────────

interface GroupProps {
  label: string
  list: FlowSummary[]
  onSelect: (id: string) => void
}
function Group({ label, list, onSelect }: GroupProps) {
  if (list.length === 0) return null
  return (
    <div className="flex flex-col gap-1.5">
      <span className="font-semibold tracking-widest uppercase px-1 pt-1 text-ui-2xs text-theme-text-disabled">
        {label}
      </span>
      {list.map(s => (
        <FlowCard key={s.id} summary={s} onSelect={() => onSelect(s.id)} />
      ))}
    </div>
  )
}

// ─── FlowCard ─────────────────────────────────────────────────────────────────

interface FlowCardProps {
  summary: FlowSummary
  onSelect: () => void
}
function FlowCard({ summary, onSelect }: FlowCardProps) {
  const last = readLastRun(summary.id)
  const progress = last && !last.completed ? last.stepsReached / last.totalSteps : null

  return (
    <button
      className="group relative flex flex-col gap-2 rounded-lg text-left w-full transition-colors border border-theme-border bg-theme-elevated px-3 py-2.5"
      onClick={onSelect}
    >
      {/* Name + meta row */}
      <div className="flex items-start justify-between gap-2">
        <span className="font-semibold leading-snug text-ui-sm text-theme-text-primary">
          {summary.name}
        </span>
        <div className="flex items-center gap-1 shrink-0">
          {summary.forkCount > 0 && (
            <Chip icon={<GitFork size={9} />} label={`${summary.forkCount}`} />
          )}
          <Chip icon={<Layers size={9} />} label={`${summary.stepCount}`} />
        </div>
      </div>

      {/* Description — single line, full text on hover */}
      <span
        className={`truncate leading-snug text-ui-xs ${summary.description ? 'text-theme-text-secondary not-italic' : 'text-theme-text-disabled italic'}`}
        title={summary.description ?? undefined}
      >
        {summary.description ?? 'No description available for this flow.'}
      </span>

      {/* Tags — inline dot-separated, no chips */}
      {summary.tags.length > 0 && (
        <span className="truncate text-ui-xs text-theme-text-muted">
          {summary.tags.join(' · ')}
        </span>
      )}

      {/* Last run row */}
      {last && (
        <div className="flex items-center gap-2 mt-0.5">
          {last.completed ? (
            <span className="flex items-center gap-1 text-ui-2xs text-theme-green">
              <CheckCircle2 size={10} />
              Completed {new Date(last.at).toLocaleDateString()}
            </span>
          ) : (
            <div className="flex items-center gap-2 w-full">
              <span className="flex items-center gap-1 shrink-0 text-ui-2xs text-theme-text-muted">
                <Clock size={10} />
                {last.stepsReached}/{last.totalSteps}
              </span>
              {/* Inline progress track */}
              <div className="flex-1 rounded-full overflow-hidden h-0.75 bg-theme-border">
                {progress !== null && (
                  <div
                    className="h-full rounded-full bg-linear-to-r from-[#6366f1] to-[#818cf8]"
                    style={{ width: `${progress * 100}%` }}
                  />
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </button>
  )
}

// Small icon+label chip
function Chip({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="flex items-center gap-0.5 px-1.5 py-0.5 rounded-md font-medium text-ui-2xs text-theme-text-muted bg-theme-base border border-theme-border">
      {icon}
      {label}
    </span>
  )
}

// ─── FlowDetail ─────────────────────────────────────────────────────────────────

interface FlowDetailProps {
  summary: FlowSummary
  onBack: () => void
  onPlay: () => void
  onStop: () => void
}
function FlowDetail({ summary, onBack, onPlay, onStop }: FlowDetailProps) {
  const [view, setView] = useState<'steps' | 'canvas'>('steps')
  const playback = useFlowPlaybackOptional()

  // Resolve the active sourcePageId when this summary's flowStory is playing.
  // compiledSteps[currentStepIndex].pageId is the compiled (possibly namespaced) id;
  // sourcePageId is the authored id that matches def.steps entries.
  const activeSourcePageId = useMemo(() => {
    if (!playback?.isGating) return null
    if (playback.activeFlowStory?.__flowStory.flowStoryId !== summary.id) return null
    const compiledSteps = playback.activeFlowStory.__flowStory.steps
    const idx = playback.currentStepIndex
    return compiledSteps[idx]?.sourcePageId ?? null
  }, [playback, summary.id])

  const isPlaying = activeSourcePageId !== null

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="px-3 pt-3 pb-2.5 shrink-0 flex items-center gap-2 border-b border-theme-border">
        <button
          onClick={onBack}
          className="flex items-center gap-1 transition-colors text-ui-xs text-theme-text-muted"
        >
          <ChevronLeft size={14} />
          Flows
        </button>

        {/* Live playing badge */}
        {isPlaying && (
          <span
            className="flex items-center gap-1 px-2 py-0.5 rounded-full text-ui-2xs font-semibold ml-1"
            style={{
              background: 'rgba(99,102,241,0.15)',
              color: '#818cf8',
              border: '1px solid rgba(99,102,241,0.3)',
            }}
          >
            <span className="rounded-full bg-[#6366f1] animate-pulse size-1.5" />
            Playing
          </span>
        )}

        {isPlaying ? (
          <Button
            size="sm"
            variant="danger"
            icon={<Square size={11} />}
            onClick={onStop}
            className="ml-auto"
          >
            Stop
          </Button>
        ) : (
          <Button
            size="sm"
            variant="accent"
            icon={<Play size={11} />}
            onClick={onPlay}
            className="ml-auto"
          >
            Play
          </Button>
        )}
      </div>

      {/* Title block */}
      <div className="px-3 pt-3 pb-2 shrink-0">
        <h2 className="font-bold leading-tight text-ui-lg text-theme-text-primary">
          {summary.name}
        </h2>
        {summary.description ? (
          <p className="mt-1 leading-relaxed text-ui-xs text-theme-text-secondary">
            {summary.description}
          </p>
        ) : (
          <p className="mt-1 leading-relaxed text-ui-xs text-theme-text-disabled italic">
            No description available for this flow.
          </p>
        )}
        {summary.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {summary.tags.map(t => (
              <Tag key={t} color="neutral">
                {t}
              </Tag>
            ))}
          </div>
        )}

        {/* Stats row */}
        <div className="flex items-center gap-3 mt-2.5">
          <span className="flex items-center gap-1 text-ui-2xs text-theme-text-muted">
            <Layers size={10} /> {summary.stepCount} steps
          </span>
          {summary.forkCount > 0 && (
            <span className="flex items-center gap-1 text-ui-2xs text-theme-text-muted">
              <GitFork size={10} /> {summary.forkCount} forks
            </span>
          )}
        </div>
      </div>

      {/* Underline tab bar */}
      <div className="flex px-3 shrink-0 gap-4 border-b border-theme-border">
        {(['steps', 'canvas'] as const).map(v => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`pb-2 font-semibold capitalize transition-colors text-ui-xs -mb-px border-b-2 ${view === v ? 'text-theme-text-primary border-[#6366f1]' : 'text-theme-text-muted border-transparent'}`}
          >
            {v === 'steps' ? 'Steps' : 'Diagram'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-auto p-3">
        {view === 'steps' ? (
          <StepList
            steps={summary.def.steps}
            depth={0}
            index={[]}
            activeSourcePageId={activeSourcePageId}
          />
        ) : (
          <FlowCanvas steps={summary.def.steps} activeSourcePageId={activeSourcePageId} />
        )}
      </div>
    </div>
  )
}

// ─── StepList (recursive) ────────────────────────────────────────────────────────

interface StepListProps {
  steps: FlowStoryDef['steps']
  depth: number
  index: number[]
  activeSourcePageId: string | null
}
function StepList({ steps, depth, index, activeSourcePageId }: StepListProps) {
  let stepNum = 0
  return (
    <div
      className={`flex flex-col gap-0 ${depth > 0 ? 'pl-3 border-l border-theme-border' : 'pl-0'}`}
    >
      {steps.map((entry, _i) => {
        if (isFlowStoryRef(entry)) {
          return (
            <div key={entry.ref} className="flex items-center gap-2 py-1.5">
              <span
                className={`font-mono shrink-0 text-right select-none text-ui-2xs text-theme-text-disabled ${depth === 0 ? 'min-w-5' : 'min-w-0'}`}
              />
              <div className="flex-1 px-2.5 py-1.5 rounded-lg bg-theme-purple-dim border border-theme-purple/20">
                <span className="text-ui-xs text-theme-purple">
                  ↗ runs <code className="font-mono font-semibold">{entry.ref}</code>
                </span>
              </div>
            </div>
          )
        }

        const step = entry as FlowStep
        stepNum++
        const num = depth === 0 ? stepNum : null
        const isActive = activeSourcePageId !== null && step.pageId === activeSourcePageId

        return (
          <StepRow
            key={`${step.pageId}-${index.join('-')}-${_i}`}
            step={step}
            num={num}
            depth={depth}
            index={index}
            stepNum={stepNum}
            isActive={isActive}
            activeSourcePageId={activeSourcePageId}
          />
        )
      })}
    </div>
  )
}

interface StepRowProps {
  step: FlowStep
  num: number | null
  depth: number
  index: number[]
  stepNum: number
  isActive: boolean
  activeSourcePageId: string | null
}
function StepRow({ step, num, depth, index, stepNum, isActive, activeSourcePageId }: StepRowProps) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (isActive && ref.current) {
      ref.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [isActive])

  return (
    <>
      {/* Step card */}
      <div
        ref={ref}
        className={`relative mt-3 mb-1 rounded-lg px-2.5 py-2 flex flex-col gap-1 transition-all ${isActive ? '' : 'bg-theme-elevated border border-theme-border'}`}
        style={
          isActive
            ? {
                background: 'color-mix(in srgb, var(--color-theme-blue) 10%, transparent)',
                border: '1px solid color-mix(in srgb, var(--color-theme-blue) 45%, transparent)',
                boxShadow: '0 0 0 2px color-mix(in srgb, var(--color-theme-blue) 12%, transparent)',
              }
            : undefined
        }
      >
        {/* Line-number style counter — only at root depth — hangs off the top-left corner */}
        {depth === 0 && (
          <span
            className={`absolute -top-2 -left-1.5 px-1.5 py-px rounded text-[10px] font-mono font-semibold select-none tracking-wider shadow-theme-card ${isActive ? 'text-white bg-theme-blue' : 'text-theme-text-muted bg-theme-elevated border border-theme-border'}`}
          >
            {String(num).padStart(2, '0')}
          </span>
        )}
        {isActive && (
          <span className="absolute -top-2 -right-1.5 flex items-center gap-1 px-1.5 py-px rounded text-[10px] font-semibold text-white bg-theme-blue shadow-theme-card">
            here
          </span>
        )}
        <span className={`font-mono font-semibold text-ui-xs ${isActive ? 'text-theme-blue' : ''}`}>
          {step.pageId}
        </span>
        {step.on && (
          <span className="font-mono self-start px-1.5 py-0.5 rounded text-[10px] text-theme-text-muted bg-theme-base">
            tap #{step.on}
          </span>
        )}

        {step.actionNote && (
          <p className="text-ui-xs text-theme-text-secondary leading-[1.45]">{step.actionNote}</p>
        )}

        {step.annotation && (
          <p className="px-2 py-1 rounded-md italic text-ui-2xs text-theme-amber bg-theme-amber-dim leading-[1.45]">
            {step.annotation}
          </p>
        )}

        {step.db && (
          <p className="font-mono text-ui-2xs text-theme-green">
            db: {Object.keys(step.db).join(', ')}
          </p>
        )}
      </div>

      {/* Forks */}
      {(step.forks as Fork[] | undefined)?.map((fork, fi) => (
        <div key={fi} className="ml-8 mb-1">
          <div className="flex items-center gap-1.5 mb-1 pl-0.5">
            <GitFork size={9} strokeWidth={2.5} className="text-theme-amber" />
            <span className="font-semibold text-ui-2xs text-theme-amber">{fork.label}</span>
            <span
              className={`px-1.5 py-px rounded font-medium text-[10px] ${fork.mergesTo === 'next' ? 'text-theme-green bg-theme-green-dim' : 'text-theme-red bg-theme-red-dim'}`}
            >
              {fork.mergesTo === 'next' ? 'merges' : 'ends'}
            </span>
          </div>
          <StepList
            steps={fork.steps}
            depth={depth + 1}
            index={[...index, stepNum - 1, fi]}
            activeSourcePageId={activeSourcePageId}
          />
        </div>
      ))}
    </>
  )
}

// ─── EmptyState ─────────────────────────────────────────────────────────────────

interface EmptyStateProps {
  hasAny: boolean
}
function EmptyState({ hasAny }: EmptyStateProps) {
  return (
    <SharedEmptyState
      variant="panel"
      icon={<GitFork size={28} />}
      title={hasAny ? 'No flows match this filter.' : 'No flowStories yet'}
      subtitle={hasAny ? undefined : 'Add a defineFlow() file under projects/<p>/flowStories/.'}
    />
  )
}
