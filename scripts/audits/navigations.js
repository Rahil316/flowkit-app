// flowkit audit:navigations — static analysis of navigation call sites and page
// reachability. The first audit domain that parses page bodies for behavior rather
// than reading config/FlowStory data or export shape — see lib/ast-walk.js's header
// for why a generic recursive walker was needed and didn't already exist.
//
// Four rules, run in sequence within checkNavigations (order matters for 2/3/4 only in
// that they all reuse the same single AST pass's resolved literal targets — rule 4
// additionally needs those targets source-tracked by originating page, not just the
// bare target list rule 3 uses):
//   1. navigations/unguarded-dashboard-navigate (warning)
//   2. navigations/invalid-target (error)
//   3. navigations/unreachable-page (warning, never error) — zero inbound edges from
//      anywhere; a true-island check, ignorant of edge direction/source.
//   4. navigations/unreachable-from-start (warning, never error) — the stronger check:
//      not reachable via any path starting at the resolved startPage, even if it does
//      have an inbound edge from somewhere (rule 3 wouldn't catch that case). Skips any
//      page already flagged by rule 3 to avoid double-reporting — see the rule 4 block
//      below for the full reasoning.
import fs from 'fs'
import path from 'path'
import { parseFull, findCallExpressions } from './lib/ast-walk.js'
import { collectNavBindings, classifyNavCall, isGuardedByIsChapter } from './lib/nav-bindings.js'
import {
  collectAllPageIds,
  resolveStartPageId,
  buildReachabilityGraph,
  buildAdjacencyGraph,
  findReachableFromStart,
} from './lib/reachability.js'
import { readWorkspaceConfig, readFlowStoryModule, FLOW_STORIES_DIRNAME } from './lib/config-io.js'
import { walkPageFiles } from '../helpers/page-walk.js'
import { FLOW_BOOK_DIRNAME } from '../helpers/config-filenames.js'
import {
  resolveVisibility,
  parsePageSegments,
  makePageId,
} from '../../src/shared/utils/pagePathIdentity.js'

function isNavigateToCallee(calleeNode) {
  return (
    (calleeNode.type === 'Identifier' && calleeNode.name === 'navigateTo') ||
    (calleeNode.type === 'MemberExpression' &&
      calleeNode.property?.type === 'Identifier' &&
      calleeNode.property.name === 'navigateTo')
  )
}

/** Extracts a literal string argument, or null if the first argument isn't a plain string literal. */
function literalStringArg(callNode) {
  const arg = callNode.arguments[0]
  if (arg?.type === 'Literal' && typeof arg.value === 'string') return arg.value
  return null
}

function listFlowStoryFiles(wsDir) {
  const dir = path.join(wsDir, FLOW_STORIES_DIRNAME)
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.ts') || f.endsWith('.js'))
    .map(f => path.join(dir, f))
}

/** Runs navigations-domain rules for one workspace. Appends findings to `report`. */
export async function checkNavigations(wsDir, report) {
  const chaptersDir = path.join(wsDir, FLOW_BOOK_DIRNAME)
  if (!fs.existsSync(chaptersDir)) return

  const { ids: knownIds, pathById } = collectAllPageIds(wsDir)
  const resolvedLiteralTargets = []
  // Source-tracked pairs for rule 4's adjacency graph — { from: composite id of the
  // page file containing the call, to: the resolved target }. Rule 3's
  // resolvedLiteralTargets is direction-less (just the target); rule 4 needs the
  // source too, so this is collected in the same pass rather than re-parsing every
  // page file a second time.
  const literalTargetEdges = []

  for (const { segments, fullPath } of walkPageFiles(chaptersDir, [])) {
    const relPath = path.relative(wsDir, fullPath)
    const ast = parseFull(fullPath)
    if (!ast) continue // unparseable — tsc/eslint's job to report syntax errors, not this rule's

    const parsedSelf =
      resolveVisibility(segments) === 'non-existent' ? null : parsePageSegments(segments)
    const selfPageId = parsedSelf ? makePageId(parsedSelf.chapter, parsedSelf.page) : null

    const bindings = collectNavBindings(ast)
    const navCalls = findCallExpressions(ast, isNavigateToCallee)

    for (const callNode of navCalls) {
      const source = classifyNavCall(callNode, bindings)
      if (!source) continue // not a real navigateTo() call we can trace — see nav-bindings.js header

      // Rule 1: only direct useDashboard().navigateTo() calls need an isChapter guard —
      // useAppNav()'s own navigateTo is a self-guarding facade that never needs one.
      if (
        source === 'useDashboard' &&
        !isGuardedByIsChapter(callNode, bindings.isChapterBindings)
      ) {
        report.add({
          ruleId: 'navigations/unguarded-dashboard-navigate',
          severity: 'warning',
          file: relPath,
          message:
            'Direct useDashboard().navigateTo() call with no isChapter guard — bypasses ' +
            "FlowMaster's commitNavigation (guards/animations/debugger/recording) when " +
            'rendered inside an active flow. Prefer useAppNav().navigateTo(), which ' +
            'dispatches correctly on its own.',
          fix: 'Guard with isChapter from useAppNav(), or switch to useAppNav().navigateTo() entirely.',
        })
      }

      // Rule 2: literal targets must resolve to a real page. Non-literal arguments are
      // statically unresolvable — tracked as a disclosed coverage gap, never flagged.
      const literal = literalStringArg(callNode)
      if (literal === null) {
        report.addDynamicNavCallSite()
        continue
      }
      if (!knownIds.has(literal)) {
        report.add({
          ruleId: 'navigations/invalid-target',
          severity: 'error',
          file: relPath,
          message: `navigateTo('${literal}') does not resolve to a real page in this workspace.`,
          fix: 'Fix the target id, or create the missing page.',
        })
      } else {
        resolvedLiteralTargets.push(literal)
        if (selfPageId) literalTargetEdges.push({ from: selfPageId, to: literal })
      }
    }
  }

  // Rule 3: reachability. Reuses rule 2's resolvedLiteralTargets as edges — no second
  // AST pass over every page file.
  const config = await readWorkspaceConfig(wsDir)
  // resolveStartPageId now returns every candidate match (ambiguity is a real
  // finding book/invalid-start-page cares about) — this BFS root only needs "resolved
  // to something, pick any one," so the first candidate is sufficient here.
  const startPageId = resolveStartPageId(wsDir, config)[0]?.id ?? null

  const flowStoryPaths = listFlowStoryFiles(wsDir)
  const flowStories = []
  for (const fsPath of flowStoryPaths) {
    const flowStory = await readFlowStoryModule(fsPath)
    if (flowStory) flowStories.push(flowStory)
  }

  const inDegree = buildReachabilityGraph({
    knownIds,
    flowStories,
    resolvedLiteralTargets,
    startPageId,
  })

  const flaggedByRule3 = new Set()
  for (const [pageId, count] of inDegree) {
    if (count > 0) continue
    flaggedByRule3.add(pageId)
    report.add({
      ruleId: 'navigations/unreachable-page',
      severity: 'warning',
      file: path.relative(wsDir, pathById.get(pageId) ?? ''),
      message: `'${pageId}' has no inbound navigation edge — no FlowStory step, static navigateTo() call, or startPage reference targets it. (Being listed in pageOrder does not count as an edge.)`,
      meta: { pageId },
    })
  }

  // Rule 4: reachable-from-start. Skips a workspace with no resolvable startPage
  // entirely (findReachableFromStart returns an empty Set for a null/unresolved
  // startPageId, which would otherwise make every single known page look
  // "unreachable" — that's "traversal can't run," not a real finding, so this rule
  // simply doesn't run rather than flagging the whole workspace).
  if (startPageId) {
    const adjacency = buildAdjacencyGraph({ knownIds, flowStories, literalTargetEdges })
    const reachable = findReachableFromStart(adjacency, startPageId)

    for (const pageId of knownIds) {
      if (reachable.has(pageId)) continue
      // Already flagged as a true island by rule 3 — same underlying problem,
      // don't double-report it under a second rule id.
      if (flaggedByRule3.has(pageId)) continue
      report.add({
        ruleId: 'navigations/unreachable-from-start',
        severity: 'warning',
        file: path.relative(wsDir, pathById.get(pageId) ?? ''),
        message: `'${pageId}' has an inbound navigation edge, but no path from the resolved startPage ('${startPageId}') reaches it — the page(s) linking to it aren't themselves reachable from start.`,
        meta: { pageId },
      })
    }
  }
}
