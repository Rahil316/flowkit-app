import {
  type FlowStep,
  type FlowStoryDef,
  type Fork,
  isFlowStoryRef,
  type PageView,
} from '@flowkit/types/index'
import { useActiveWorkspace } from '@flowkit-shared/contexts/ActiveWorkspaceContext'
import { useWorkspaceHierarchy } from '@flowkit-shared/utils/useWorkspaceHierarchy'
import { getWorkspaceConfig } from '@flowkit-shared/utils/workspaceModules'
import { useMemo } from 'react'

// ── useStoryLibrary ──────────────────────────────────────────────────────────────
//
// Reads the discovered FlowStory registry (from the workspace hierarchy) and
// derives display summaries for the Stories UI. Pure-ish: counts are computed
// from the raw FlowStoryDef, no compilation needed for the list view.

export interface StorySummary {
  id: string
  name: string
  description?: string
  tags: string[]
  stepCount: number
  forkCount: number
  /** Compiled screen ids this flow touches (Starts/Includes filtering). */
  pageIds: string[]
  /** First step's pageId (for the "Starts" group). */
  firstPageId?: string
  def: FlowStoryDef
}

/** Recursively count steps + forks and collect screen ids in a flowStory. */
function analyze(
  steps: FlowStoryDef['steps'],
  registry: Map<string, FlowStoryDef>,
  seen: Set<string>,
  acc: { steps: number; forks: number; pages: Set<string> }
): void {
  for (const entry of steps) {
    if (isFlowStoryRef(entry)) {
      if (seen.has(entry.ref)) continue
      const ref = registry.get(entry.ref)
      if (ref) analyze(ref.steps, registry, new Set([...seen, entry.ref]), acc)
      continue
    }
    const step = entry as FlowStep
    acc.steps += 1
    acc.pages.add(step.pageId)
    if (step.forks) {
      for (const fork of step.forks as Fork[]) {
        acc.forks += 1
        analyze(fork.steps, registry, seen, acc)
      }
    }
  }
}

function firstPageId(
  def: FlowStoryDef,
  registry: Map<string, FlowStoryDef>,
  seen: Set<string>
): string | undefined {
  const first = def.steps[0]
  if (!first) return undefined
  if (isFlowStoryRef(first)) {
    if (seen.has(first.ref)) return undefined
    const ref = registry.get(first.ref)
    return ref ? firstPageId(ref, registry, new Set([...seen, first.ref])) : undefined
  }
  return (first as FlowStep).pageId
}

export interface StoryLibraryData {
  summaries: StorySummary[]
  /** All tags across all flowStories (for the filter bar). */
  allTags: string[]
  /**
   * Union of all page ids referenced by any flowStory step.
   * Used by PagesHierarchy to dim uncovered pages.
   */
  coveredPageIds: Set<string>
  /** O(1) page lookup by id. Derived from views. */
  pageById: Map<string, PageView>
}

export function useStoryLibrary(): StoryLibraryData {
  const activeWorkspace = useActiveWorkspace()
  const { registry, views } = useWorkspaceHierarchy(activeWorkspace)

  return useMemo(() => {
    const config = getWorkspaceConfig(activeWorkspace)
    const order = Object.values(config.projects ?? {}).flatMap(p => p.chapters ?? p.modules ?? [])

    const summaries: StorySummary[] = []
    const tagSet = new Set<string>()
    const coveredPageIds = new Set<string>()

    for (const def of registry.values()) {
      const acc = { steps: 0, forks: 0, pages: new Set<string>() }
      analyze(def.steps, registry, new Set([def.id]), acc)
      ;(def.tags ?? []).forEach(t => tagSet.add(t))
      acc.pages.forEach(id => coveredPageIds.add(id))
      summaries.push({
        id: def.id,
        name: def.name,
        description: def.description,
        tags: def.tags ?? [],
        stepCount: acc.steps,
        forkCount: acc.forks,
        pageIds: [...acc.pages],
        firstPageId: firstPageId(def, registry, new Set([def.id])),
        def,
      })
    }

    summaries.sort((a, b) => {
      const ai = order.indexOf(a.id)
      const bi = order.indexOf(b.id)
      if (ai !== -1 && bi !== -1) return ai - bi
      if (ai !== -1) return -1
      if (bi !== -1) return 1
      return a.name.localeCompare(b.name)
    })

    const pageById = new Map<string, PageView>(views.map(v => [v.id, v]))

    return { summaries, allTags: [...tagSet].sort(), coveredPageIds, pageById }
  }, [registry, views, activeWorkspace])
}
