// Page-id collection, startPage resolution, and navigation-reachability graphs — shared
// by story.js and navigations.js. Relocated here (was collectAllPageIds in story.js)
// so both domain files can use it without importing each other — domain files only
// ever import from lib/helpers, never from one another, an existing rule in this
// codebase's audit architecture.
//
// Two distinct graph shapes live here, backing two distinct rules:
//   - buildReachabilityGraph -> Map<pageId, inDegree count>. Powers
//     navigations/unreachable-page: "does ANYTHING at all link to this page." A true
//     island check only — doesn't care whether the thing linking to it is itself
//     reachable from anywhere real.
//   - buildAdjacencyGraph + findReachableFromStart -> Map<pageId, Set<pageId>> (real
//     edge direction/source) + BFS. Powers navigations/unreachable-from-start, the
//     stronger check: "can you actually get here by following edges starting from the
//     resolved startPage." A page can have a nonzero in-degree (so unreachable-page
//     passes it) while still failing this — e.g. its only inbound edge comes from a
//     page that is itself unreachable from start. See navigations.js for how the two
//     rules are combined without double-reporting the same underlying problem.
import fs from 'fs'
import path from 'path'
import { FLOW_BOOK_DIRNAME } from '../../helpers/config-filenames.js'
import { walkPageFiles } from '../../helpers/page-walk.js'
import {
  resolveVisibility,
  parsePageSegments,
  makePageId,
} from '../../../src/shared/utils/pagePathIdentity.js'

/**
 * Collects every known page id, in the collision-proof `chapter-page` composite form
 * (makePageId), across the whole workspace. `__`-hidden pages are never included.
 * Returns { ids: Set<string>, pathById: Map<string, string> } — pathById gives the
 * absolute file path for a given composite id, needed by rule 3's `file` field
 * without a second walkPageFiles pass over the same directory.
 */
export function collectAllPageIds(wsDir) {
  const chaptersDir = path.join(wsDir, FLOW_BOOK_DIRNAME)
  const ids = new Set()
  const pathById = new Map()
  if (!fs.existsSync(chaptersDir)) return { ids, pathById }
  for (const { segments, fullPath } of walkPageFiles(chaptersDir, [])) {
    if (resolveVisibility(segments) === 'non-existent') continue // belt-and-suspenders
    const parsed = parsePageSegments(segments)
    if (!parsed) continue
    const id = makePageId(parsed.chapter, parsed.page)
    ids.add(id)
    pathById.set(id, fullPath)
  }
  return { ids, pathById }
}

/**
 * Resolves manifest.ts's bare `startPage` (e.g. 'splash-screen', no chapter field) to
 * its composite id. startPage is stored bare, so this scans every chapter's pages for
 * one whose bare page segment matches — the same walk collectAllPageIds performs
 * internally, just matched on `.page` instead of building every composite id.
 * Returns null if startPage is unset or doesn't resolve to any real page (a separate
 * concern, tracked as backlog item book/invalid-start-page — this function just
 * reports "no edge contributed," it never throws).
 */
export function resolveStartPageId(wsDir, config) {
  if (!config?.startPage) return null
  const chaptersDir = path.join(wsDir, FLOW_BOOK_DIRNAME)
  if (!fs.existsSync(chaptersDir)) return null
  for (const { segments } of walkPageFiles(chaptersDir, [])) {
    if (resolveVisibility(segments) === 'non-existent') continue
    const parsed = parsePageSegments(segments)
    if (parsed && parsed.page === config.startPage) {
      return makePageId(parsed.chapter, parsed.page)
    }
  }
  return null
}

/** True for a plain FlowStep entry (has pageId) — excludes FlowStoryRef ({ ref }) entries. */
function isPageStep(entry) {
  return entry && typeof entry === 'object' && typeof entry.pageId === 'string'
}

/**
 * Recursively walks a FlowStory's steps, including fork-nested steps at any depth
 * (FlowStep.forks?: Fork[], Fork.steps: FlowStep[] — see src/types/index.ts), calling
 * `bump(pageId)` for every page-step encountered. Independent of story.js's own
 * story/invalid-page rule, which does NOT walk forks (documented gap, tracked
 * separately as story/fork-invalid-page) — edge-collection here can see fork-nested
 * steps regardless, since it works off readFlowStoryModule's fully-evaluated object,
 * not text/regex matching.
 */
function walkStepsForEdges(steps, bump) {
  for (const step of steps ?? []) {
    if (isPageStep(step)) bump(step.pageId)
    for (const fork of step.forks ?? []) {
      walkStepsForEdges(fork.steps, bump)
    }
  }
}

/**
 * Same recursive shape as walkStepsForEdges, but directed: calls `link(fromPageId,
 * toPageId)` for each sequential step transition (step[i].pageId -> step[i+1].pageId)
 * — this models the path a player actually follows through the FlowStory, not just "is
 * this page referenced." Fork handling: the step that owns the fork links to each
 * fork's first step (branching out from the same page the fork is attached to), and
 * steps within a fork chain sequentially among themselves, exactly like the top level.
 * `prevPageId` is the last page-step id seen so far in the current chain (threaded
 * through recursive fork calls so a fork's first step correctly links back to the
 * pre-fork page, not just to other steps inside the same fork) — null until the first
 * page-step is seen, in which case there's nothing to link yet.
 */
function walkStepsForAdjacency(steps, prevPageId, link) {
  for (const step of steps ?? []) {
    let currentPageId = prevPageId
    if (isPageStep(step)) {
      if (prevPageId) link(prevPageId, step.pageId)
      currentPageId = step.pageId
    }
    for (const fork of step.forks ?? []) {
      walkStepsForAdjacency(fork.steps, currentPageId, link)
    }
    prevPageId = currentPageId
  }
}

/**
 * Builds the in-degree-zero reachability graph: Map<pageId, count>, seeded at 0 for
 * every known page id, incremented per inbound edge. This is in-degree-zero only —
 * NOT a BFS-from-startPage reachability check (that stronger version is a distinct,
 * out-of-scope future rule, navigations/unreachable-from-start). Edge sources:
 *   (a) FlowStory step pageIds, at any fork-nesting depth
 *   (b) resolved literal navigateTo() targets, passed in by the caller (rule 2 already
 *       resolves these while walking every page file — reusing that list here avoids
 *       a second AST pass over every screen)
 *   (c) the resolved startPage
 * Deliberately NOT an edge: pageOrder membership alone (a page can be listed and
 * orderable in the Screens tab while never being navigated to or step'd through) —
 * this is the single most consequential modeling decision in this module; do not
 * add pageOrder as an edge source without re-confirming that decision.
 */
export function buildReachabilityGraph({
  knownIds,
  flowStories,
  resolvedLiteralTargets,
  startPageId,
}) {
  const inDegree = new Map()
  for (const id of knownIds) inDegree.set(id, 0)

  const bump = id => {
    if (inDegree.has(id)) inDegree.set(id, inDegree.get(id) + 1)
    // else: edge target isn't a real page — story/invalid-page or navigations/invalid-target
    // already reports this separately; silently ignored here to avoid double-reporting the
    // same underlying problem under a second rule id.
  }

  for (const flowStory of flowStories) {
    walkStepsForEdges(flowStory.steps, bump)
  }
  for (const target of resolvedLiteralTargets) bump(target)
  if (startPageId) bump(startPageId)

  return inDegree
}

/**
 * Builds a directed adjacency list (Map<pageId, Set<pageId>>, seeded with an empty Set
 * for every known page id) so navigations/unreachable-from-start can run a real
 * BFS/DFS from startPageId — unlike buildReachabilityGraph's in-degree counts, edge
 * *direction* and *source* matter here. Edge sources, same two as buildReachabilityGraph
 * minus the startPage bump (start is a traversal root, not an edge target):
 *   (a) FlowStory step sequence transitions (step[i].pageId -> step[i+1].pageId,
 *       including fork branch-out and in-fork sequencing — see walkStepsForAdjacency)
 *   (b) resolved literal navigateTo() call sites, now source-tracked as
 *       `{ from, to }` pairs (`from` = the composite id of the page file containing the
 *       call, `to` = the resolved target) instead of buildReachabilityGraph's bare
 *       target-only list — direction is the whole point of this graph, so the caller
 *       must pass source info here rather than the flat resolvedLiteralTargets array.
 * Edges whose `from` or `to` isn't a known page id are dropped silently, same
 * reasoning as buildReachabilityGraph's `bump`: story/invalid-page and
 * navigations/invalid-target already report unresolvable targets under their own rule
 * id, and an edge sourced from a page that doesn't exist can't happen in practice
 * (the source is always a page we're actively walking).
 */
export function buildAdjacencyGraph({ knownIds, flowStories, literalTargetEdges }) {
  const adjacency = new Map()
  for (const id of knownIds) adjacency.set(id, new Set())

  const link = (from, to) => {
    if (!adjacency.has(from) || !adjacency.has(to)) return
    adjacency.get(from).add(to)
  }

  for (const flowStory of flowStories) {
    walkStepsForAdjacency(flowStory.steps, null, link)
  }
  for (const { from, to } of literalTargetEdges) link(from, to)

  return adjacency
}

/**
 * Standard BFS over an adjacency list (as built by buildAdjacencyGraph), returning the
 * Set of every pageId reachable from `startPageId` (startPageId itself included, since
 * it's trivially "reached" by definition). Returns an empty Set if startPageId is null
 * or isn't a key in the graph — callers should treat that as "traversal can't run,"
 * not "nothing is reachable"; see navigations.js's unreachable-from-start rule for how
 * it handles that distinction (it skips the rule entirely rather than flagging every
 * page in the workspace).
 */
export function findReachableFromStart(adjacency, startPageId) {
  const reachable = new Set()
  if (!startPageId || !adjacency.has(startPageId)) return reachable

  const queue = [startPageId]
  reachable.add(startPageId)
  while (queue.length > 0) {
    const current = queue.shift()
    for (const next of adjacency.get(current) ?? []) {
      if (!reachable.has(next)) {
        reachable.add(next)
        queue.push(next)
      }
    }
  }
  return reachable
}
