// Generic ESTree traversal — shared by any audit rule that needs to inspect code
// behavior, not just top-level export shape. Deliberately separate from ts-parse.js:
// that file's helpers (parseTopLevel/hasDefaultFunctionExport/findExportedObjectLiteral)
// only ever look at top-level body statements, by design, for the page/*.js rules that
// use them — this file exists for callers that need to recurse into function bodies,
// JSX, and nested expressions (first consumer: navigations.js).
//
// No visitor-keys table (estraverse-style) — a plain property-driven recursive walk is
// enough for "find every CallExpression, then inspect a few call sites' parent chain."
// A keys table would need to enumerate JSX node types by hand and keep them in sync with
// parser upgrades; walking every object/array-valued property generically handles new
// node shapes for free, at the cost of visiting a few non-AST plain-data properties that
// happen to look node-shaped (harmless — see the `typeof node.type !== 'string'` guard).
import fs from 'fs'
import { parse } from '@typescript-eslint/parser'

/**
 * Parses a .tsx/.ts file into its full AST (not just top-level body, unlike
 * ts-parse.js's parseTopLevel). Returns null on a parse error rather than throwing —
 * a syntactically broken file is tsc's/eslint's job to report, not this tool's.
 */
export function parseFull(filePath) {
  let src
  try {
    src = fs.readFileSync(filePath, 'utf8')
  } catch {
    return null
  }
  try {
    return parse(src, {
      sourceType: 'module',
      ecmaFeatures: { jsx: true },
      range: true,
    })
  } catch {
    return null
  }
}

/**
 * Recursively visits every ESTree node reachable from `root` in DFS pre-order, calling
 * `visitor(node, parent)` once per node. Annotates each node with `.parent` in place
 * during the walk (mirroring ESLint's own rule-API shape) so callers can walk upward
 * from a found node (e.g. to look for an enclosing guard) without threading their own
 * ancestor stack through every call site.
 */
export function walkAst(root, visitor) {
  visit(root, null, visitor)
}

function visit(node, parent, visitor) {
  if (node === null || typeof node !== 'object') return
  if (Array.isArray(node)) {
    for (const item of node) visit(item, parent, visitor)
    return
  }
  if (typeof node.type !== 'string') return // not an ESTree node — a plain data property

  node.parent = parent
  visitor(node, parent)

  for (const key of Object.keys(node)) {
    if (key === 'parent' || key === 'loc' || key === 'range') continue
    visit(node[key], node, visitor)
  }
}

/**
 * Convenience helper: collects every CallExpression in `root` whose callee satisfies
 * `calleeMatches`. Order is insensitive to callers (rule 2/3 only need the set of
 * matching call sites, not traversal order).
 */
export function findCallExpressions(root, calleeMatches) {
  const results = []
  walkAst(root, node => {
    if (node.type === 'CallExpression' && calleeMatches(node.callee)) {
      results.push(node)
    }
  })
  return results
}
