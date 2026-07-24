import type {
  ChapterConfig,
  FlowStoryDef,
  FlowStep,
  Fork,
  InteractionRule,
  SimulatorControl,
} from '@flowkit/types/index'
import { isFlowStoryRef } from '@flowkit/types/index'
import { get } from '@flowkit-shared/utils/dbHelpers'

// ── compileFlowStory ─────────────────────────────────────────────────────────────
//
// Turns an authored FlowStoryDef into the runtime ChapterConfig that the EXISTING
// useFlowEngine/FlowMaster already accept. The engine is never modified — this
// compiler is the single seam where FlowStory concepts (forks, refs, step db
// patches) map onto the engine's primitives:
//
//   • steps[]            → ChapterConfig.pages[]  (flat, ordered, deduped)
//   • sequential advance → interactions["<advanceId>"] = { goTo: "<nextPageId>" }
//   • forks              → a function-valued goTo (engine calls it with {db,flowState})
//   • mergesTo:"next"    → last branch step advances to the parent's next step
//   • terminal fork      → last branch step advances to "__complete__"
//   • flowStory refs      → referenced plan's steps inlined here, ids namespaced
//
// The compiler also emits a parallel `__flowStory.steps` array (CompiledStep[])
// that the FlowPlaybackContext reads to apply per-step db patches, show
// actionNotes, and drive gating. The engine ignores that extra field.
//
// PURE: no React, no DOM, no loader imports. Screens + the plan registry are
// injected so this is fully unit-testable.

/** Minimal resolved-page shape the compiler needs from the workspace loader. */
export interface ResolvedPage {
  id: string
  label: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  component: React.ComponentType<any>
}

export type PageResolver = (pageId: string) => ResolvedPage | undefined

/**
 * Per-screen playback metadata, indexed by the COMPILED screen id (which may be
 * namespaced for ref'd plans). Read by FlowPlaybackContext during playback.
 */
export interface CompiledStep {
  /** The compiled (possibly namespaced) screen id this step renders. */
  pageId: string
  /** Original authored pageId (pre-namespacing) — for resolver/debug. */
  sourcePageId: string
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  db?: Record<string, any>
  actionNote?: string
  decisionNote?: string
  annotation?: string
  /**
   * The element id whose tap advances this step (from FlowStep.on). Undefined =
   * advance on tap-anywhere. Phase 4 gating treats this as the planned tap.
   */
  on?: string
  /**
   * Resolved advance target: a compiled screen id, "__complete__", or a fork
   * resolver function. Used by FlowMaster to advance tap-anywhere steps and by
   * gating to know where a planned tap leads.
   */
  next: InteractionRule['goTo']
}

/** A ChapterConfig plus the FlowStory playback metadata that rides alongside it. */
export interface CompiledFlowStory extends ChapterConfig {
  __flowStory: {
    flowStoryId: string
    steps: CompiledStep[]
    /** Flow-level simulator controls shown during playback (F4.4). */
    simulatorControls: SimulatorControl[]
    /** Screen id the home button should target while this flowStory plays. */
    homeScreen?: string
  }
}

class FlowStoryCompileError extends Error {}

// A fully-resolved linear step with an explicit advance target. `next` is either
// a compiled page id, "__complete__", or a function (fork) returning one.
interface FlatStep {
  compiledId: string
  sourcePageId: string
  page: ResolvedPage
  step: FlowStep
  next: InteractionRule['goTo']
}

/**
 * Recursively flatten step entries into FlatSteps with correct advance targets.
 *
 * @param entries     the steps to flatten (a plan's steps, or a fork's steps)
 * @param parentNext  where the LAST step of this list should advance to
 *                    (the parent sequence's continuation, or "__complete__")
 */
function flatten(
  entries: FlowStoryDef['steps'],
  parentNext: InteractionRule['goTo'],
  resolve: PageResolver,
  registry: Map<string, FlowStoryDef>,
  visited: Set<string>,
  prefix: string,
  out: FlatStep[]
): void {
  // First pass: resolve this level's real steps (inlining refs) so we know each
  // step's sequential successor before wiring forks.
  const level: {
    compiledId: string
    sourcePageId: string
    page: ResolvedPage
    step: FlowStep
  }[] = []

  const expand = (es: FlowStoryDef['steps'], pfx: string, vis: Set<string>) => {
    for (const entry of es) {
      if (isFlowStoryRef(entry)) {
        const refId = entry.ref
        if (vis.has(refId)) {
          throw new FlowStoryCompileError(
            `circular flowStory reference: ${[...vis, refId].join(' → ')}`
          )
        }
        const refPlan = registry.get(refId)
        if (!refPlan) throw new FlowStoryCompileError(`flowStory not found: "${refId}"`)
        expand(refPlan.steps, `${pfx}${refId}::`, new Set([...vis, refId]))
        continue
      }
      const page = resolve(entry.pageId)
      if (!page) throw new FlowStoryCompileError(`page not found: "${entry.pageId}"`)
      level.push({
        compiledId: `${pfx}${entry.pageId}`,
        sourcePageId: entry.pageId,
        page,
        step: entry,
      })
    }
  }
  expand(entries, prefix, visited)

  // Second pass: emit each step with its advance target. Sequential target is the
  // next step in THIS level; the last step uses parentNext. Forks override.
  for (let i = 0; i < level.length; i++) {
    const cur = level[i]
    const sequentialNext = i + 1 < level.length ? level[i + 1].compiledId : parentNext

    let next: InteractionRule['goTo']
    if (cur.step.forks && cur.step.forks.length > 0) {
      next = buildForkResolver(cur.step.forks, sequentialNext, resolve, registry, visited, prefix)
    } else {
      next = sequentialNext
    }

    out.push({
      compiledId: cur.compiledId,
      sourcePageId: cur.sourcePageId,
      page: cur.page,
      step: cur.step,
      next,
    })

    // Emit the fork branches' steps (they reference screens that must exist in
    // screens[]). Each branch's last step advances per mergesTo.
    if (cur.step.forks) {
      for (const fork of cur.step.forks) {
        // mergesTo:"next" → rejoin parent at the step after this fork entry.
        // terminal (no mergesTo) → end the flow.
        const branchEnd: InteractionRule['goTo'] =
          fork.mergesTo === 'next' ? sequentialNext : '__complete__'
        flatten(fork.steps, branchEnd, resolve, registry, visited, prefix, out)
      }
    }
  }
}

/**
 * Build a function-valued goTo for a forked step. The engine calls it with
 * { db, flowState }; we pick the first fork whose entry db-condition matches the
 * live db and jump to that branch's first screen, else fall through to the
 * sequential next step.
 */
function buildForkResolver(
  forks: Fork[],
  fallback: InteractionRule['goTo'],
  resolve: PageResolver,
  registry: Map<string, FlowStoryDef>,
  visited: Set<string>,
  prefix: string
): InteractionRule['goTo'] {
  // Precompute each fork's first compiled screen id (respecting ref namespacing).
  const branches = forks.map(fork => ({
    fork,
    firstId: firstCompiledPageId(fork, resolve, registry, visited, prefix),
  }))
  const fallbackStr = typeof fallback === 'string' ? fallback : undefined
  return ({ db }) => {
    for (const b of branches) {
      if (forkMatches(b.fork, db) && b.firstId) return b.firstId
    }
    // fallback may itself be a function (nested fork at the parent boundary).
    if (typeof fallback === 'function') return fallback({ db, flowState: {} })
    return fallbackStr ?? '__complete__'
  }
}

/** Resolve the compiled id of a fork branch's first screen (for navigation). */
function firstCompiledPageId(
  fork: Fork,
  _resolve: PageResolver,
  registry: Map<string, FlowStoryDef>,
  _visited: Set<string>,
  prefix: string
): string | undefined {
  const first = fork.steps[0]
  if (!first) return undefined
  if (isFlowStoryRef(first)) {
    const refPlan = registry.get(first.ref)
    const firstStep = refPlan?.steps[0]
    if (!firstStep || isFlowStoryRef(firstStep)) return undefined
    return `${prefix}${first.ref}::${firstStep.pageId}`
  }
  return `${prefix}${first.pageId}`
}

/**
 * Whether a fork's entry condition is satisfied by the live db. Phase 1: a fork
 * "matches" when every key in its entry `db` patch already equals that value in
 * the live db. Forks with no db always match (unconditional — author ordering
 * decides). The branch's own `db` patch is applied on entry by the playback layer.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function forkMatches(fork: Fork, db: Record<string, any>): boolean {
  if (!fork.db || Object.keys(fork.db).length === 0) return true
  for (const path of Object.keys(fork.db)) {
    if (get(db, path) !== fork.db[path]) return false
  }
  return true
}

/**
 * Compile a FlowStory into a runtime CompiledFlowStory (ChapterConfig + playback
 * metadata). Throws FlowStoryCompileError on missing screen, missing ref, or a
 * circular ref.
 */
export function compileFlowStory(
  plan: FlowStoryDef,
  resolve: PageResolver,
  registry: Map<string, FlowStoryDef>,
  visited: Set<string> = new Set([plan.id])
): CompiledFlowStory {
  const flat: FlatStep[] = []
  flatten(plan.steps, '__complete__', resolve, registry, visited, '', flat)

  if (flat.length === 0) {
    throw new FlowStoryCompileError(`flowStory "${plan.id}" has no steps`)
  }

  // pages[] — dedupe compiled ids (a page may repeat; engine matches by id).
  const pages: ChapterConfig['pages'] = []
  const seen = new Set<string>()
  for (const fs of flat) {
    if (seen.has(fs.compiledId)) continue
    seen.add(fs.compiledId)
    pages.push({ id: fs.compiledId, label: fs.page.label, component: fs.page.component })
  }

  // interactions[] — a step with `on` advances when its named element is tapped
  // (the engine matches element id → interaction). Steps without `on` advance on
  // tap-anywhere, handled by FlowMaster via CompiledStep.next — they emit no
  // interaction entry here.
  //
  // NOTE: at RUNTIME, flowStory advancement is driven entirely by the active
  // step (FlowMaster reads CompiledStep.on/next), NOT by this interactions map —
  // because the same element id can appear at two journey positions (e.g. a ref'd
  // flow) and would collide here. This map is retained as informational metadata
  // (and asserted by the compiler tests) but is not the advance path.
  const interactions: Record<string, InteractionRule | InteractionRule[]> = {}
  const steps: CompiledStep[] = []
  // Warn in dev when the same `on` id appears more than once in a non-ref context
  // (i.e. same compiledId prefix), which would silently misfire at runtime.
  const onIdsByScreen = new Map<string, string>()
  for (const fs of flat) {
    if (fs.step.on) {
      const prev = onIdsByScreen.get(fs.step.on)
      if (prev !== undefined && prev === fs.compiledId.split('/')[0]) {
        if (import.meta.env.DEV) {
          console.warn(
            `[Flowkit] Duplicate interaction id "${fs.step.on}" in flow "${plan.id}". ` +
              `Both steps target the same screen prefix — the second will be silently ignored.`
          )
        }
      }
      onIdsByScreen.set(fs.step.on, fs.compiledId.split('/')[0])
      interactions[fs.step.on] = { trigger: 'tap', goTo: fs.next }
    }
    steps.push({
      pageId: fs.compiledId,
      sourcePageId: fs.sourcePageId,
      db: fs.step.db,
      actionNote: fs.step.actionNote,
      decisionNote: fs.step.decisionNote,
      annotation: fs.step.annotation,
      on: fs.step.on,
      next: fs.next,
    })
  }

  return {
    id: plan.id,
    label: plan.name,
    pages,
    // Only include interactions when at least one step declares `on`; an
    // all-tap-anywhere flow leaves interactions undefined so FlowMaster's
    // sequential mode can also work as a fallback.
    interactions: Object.keys(interactions).length > 0 ? interactions : undefined,
    initialPage: flat[0].compiledId,
    __flowStory: {
      flowStoryId: plan.id,
      steps,
      simulatorControls: plan.simulator?.controls ?? [],
      homeScreen: plan.homeScreen,
    },
  }
}

export { FlowStoryCompileError }
