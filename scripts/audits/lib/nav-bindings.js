// Static, single-file, single-pass analysis of useAppNav()/useDashboard() usage — no
// scope-analysis library, no cross-file resolution. Built specifically for
// navigations.js; kept separate from the domain-agnostic ast-walk.js the same way
// ts-parse.js's domain-shape helpers are kept separate from a generic parser call —
// this file bakes in FlowKit-specific hook knowledge, ast-walk.js has none.
//
// Confirmed via real-code survey (workspaces/test, workspaces/game-zone): every real
// screen uses `const { navigateTo } = useAppNav()`. useAppNav()'s own navigateTo is a
// self-guarding facade (src/shared/utils/useAppNav.ts) that already dispatches
// correctly based on FlowNavCtx presence — it never needs an isChapter guard. Only a
// *direct* useDashboard().navigateTo() call bypasses FlowMaster's commitNavigation and
// needs one. Two real binding shapes exist and both are tracked here:
//   Shape A (destructured):        const { navigateTo } = useAppNav()
//   Shape B (object + prop access): const nav = useAppNav(); nav.navigateTo(...)
import { walkAst } from './ast-walk.js'

const HOOK_NAMES = new Set(['useAppNav', 'useDashboard'])

function isHookCall(node) {
  return (
    node?.type === 'CallExpression' &&
    node.callee?.type === 'Identifier' &&
    HOOK_NAMES.has(node.callee.name)
  )
}

/**
 * Builds the binding tables for one file's AST. Returns:
 *   navigateToBindings: Map<localName, hookSource>   — Shape A only
 *   navObjectBindings:  Map<objectName, hookSource>  — Shape B only
 *   isChapterBindings:  Set<localName>                — Shape A's `isChapter` destructure
 *     (only ever sourced from useAppNav — useDashboard's return has no isChapter field)
 * A call matching neither table is left unclassified deliberately — see module header.
 */
export function collectNavBindings(ast) {
  const navigateToBindings = new Map()
  const navObjectBindings = new Map()
  const isChapterBindings = new Set()

  walkAst(ast, node => {
    if (node.type !== 'VariableDeclarator' || !isHookCall(node.init)) return
    const hookSource = node.init.callee.name

    if (node.id.type === 'ObjectPattern') {
      // Shape A: const { navigateTo, isChapter } = useAppNav()
      for (const prop of node.id.properties) {
        if (prop.type !== 'Property' || prop.key?.type !== 'Identifier') continue
        const localName = prop.value?.type === 'Identifier' ? prop.value.name : undefined
        if (!localName) continue
        if (prop.key.name === 'navigateTo') navigateToBindings.set(localName, hookSource)
        if (prop.key.name === 'isChapter') isChapterBindings.add(localName)
      }
    } else if (node.id.type === 'Identifier') {
      // Shape B: const nav = useAppNav()
      navObjectBindings.set(node.id.name, hookSource)
    }
  })

  return { navigateToBindings, navObjectBindings, isChapterBindings }
}

/**
 * Classifies a CallExpression's callee against the binding tables. Returns the hook
 * source ('useAppNav' | 'useDashboard') if the call resolves to a real navigateTo
 * binding, or null if unclassified (not a nav call, or a same-named unrelated local).
 */
export function classifyNavCall(callNode, bindings) {
  const { callee } = callNode
  if (callee.type === 'Identifier') {
    return bindings.navigateToBindings.get(callee.name) ?? null
  }
  if (
    callee.type === 'MemberExpression' &&
    callee.property?.type === 'Identifier' &&
    callee.property.name === 'navigateTo' &&
    callee.object?.type === 'Identifier'
  ) {
    return bindings.navObjectBindings.get(callee.object.name) ?? null
  }
  return null
}

const FUNCTION_BOUNDARY_TYPES = new Set([
  'FunctionDeclaration',
  'FunctionExpression',
  'ArrowFunctionExpression',
])

function isIsChapterIdentifier(node, isChapterBindings) {
  return node?.type === 'Identifier' && isChapterBindings.has(node.name)
}

function isNegatedIsChapter(node, isChapterBindings) {
  return (
    node?.type === 'UnaryExpression' &&
    node.operator === '!' &&
    isIsChapterIdentifier(node.argument, isChapterBindings)
  )
}

/**
 * v1 guard detection: direct-wrap only. Walks upward from `callNode` via `.parent`
 * (annotated by ast-walk.js's walkAst), stopping at the nearest enclosing function
 * boundary, looking for:
 *   - `isChapter && <call>` (LogicalExpression &&, call in .right, chained ok)
 *   - `isChapter ? <call> : ...` (ConditionalExpression, call in .consequent)
 *   - `!isChapter ? ... : <call>` (ConditionalExpression, call in .alternate)
 *
 * Known gap, deliberate: `if (!isChapter) return` (early return BEFORE the call,
 * not wrapping it) is NOT detected here. Real control-flow-dominance reasoning
 * (which statements after an early return are actually unreachable without it) is
 * meaningfully harder and more false-positive-prone than direct-wrap matching, and
 * this rule's real-world risk is asymmetric: a false negative here just means an
 * already-safe call goes unflagged (no harm), while a false positive would nag on
 * legitimately-guarded code. Ship direct-wrap first; early-return is an acknowledged
 * fast-follow, not attempted in this pass. See the dashboard-direct-early-return
 * fixture in scripts/tests/fixtures/navigations/, which asserts this gap explicitly
 * (the finding currently fires even though the real call is safely guarded) so the
 * gap is a checked, intentional behavior rather than silent missing coverage.
 */
export function isGuardedByIsChapter(callNode, isChapterBindings) {
  let node = callNode
  let parent = callNode.parent

  while (parent && !FUNCTION_BOUNDARY_TYPES.has(parent.type)) {
    if (parent.type === 'LogicalExpression' && parent.operator === '&&' && parent.right === node) {
      if (isIsChapterIdentifier(parent.left, isChapterBindings)) return true
      // Chained `a && isChapter && call(...)` — left side is itself a LogicalExpression;
      // walking further up the parent chain naturally re-checks that case next iteration.
    }
    if (parent.type === 'ConditionalExpression') {
      if (parent.consequent === node && isIsChapterIdentifier(parent.test, isChapterBindings)) {
        return true
      }
      if (parent.alternate === node && isNegatedIsChapter(parent.test, isChapterBindings)) {
        return true
      }
    }
    node = parent
    parent = parent.parent
  }
  return false
}
