// Shared AST-walk helpers for flowkit audit's page-domain rules, using
// @typescript-eslint/parser (already a transitive dependency of typescript-eslint —
// no new dependency needed).
//
// Scope, deliberately: this reliably detects the ONE export shape the CLI itself
// generates for screens (scripts/helpers/workspace-template.js's writeXScreen functions,
// scripts/helpers/scaffold.js's repo-mode equivalent) — an inline
// `export default function Name(...) { ... }` plus a sibling
// `export const pageMeta = { ... }`. Hand-written screens using other valid-but-uncommon
// export shapes (re-exports, `export { x as default }`, conditional exports) are
// best-effort, not guaranteed — this catches drift in CLI-generated content, not general
// arbitrary TypeScript.
import fs from 'fs'
import { parse } from '@typescript-eslint/parser'

/**
 * Parses a .tsx/.ts file's top-level body. Returns null on a parse error rather than
 * throwing — a syntactically broken file is tsc's/eslint's job to report, not this tool's.
 */
export function parseTopLevel(filePath) {
  let src
  try {
    src = fs.readFileSync(filePath, 'utf8')
  } catch {
    return null
  }
  try {
    const ast = parse(src, {
      sourceType: 'module',
      ecmaFeatures: { jsx: true },
      range: true,
    })
    return ast.body
  } catch {
    return null
  }
}

/** True if the file has `export default function Name(...) { ... }` at the top level. */
export function hasDefaultFunctionExport(body) {
  return body.some(
    node =>
      node.type === 'ExportDefaultDeclaration' && node.declaration.type === 'FunctionDeclaration'
  )
}

/**
 * Finds a top-level `export const <exportName> = { ... }` object literal and returns its
 * properties as a plain key→value map (string/number/boolean literal values only — nested
 * objects/arrays are returned as `undefined` for that key, since callers here only ever need
 * to check simple fields like `pageMeta.id`).
 */
export function findExportedObjectLiteral(body, exportName) {
  for (const node of body) {
    if (node.type !== 'ExportNamedDeclaration' || !node.declaration) continue
    if (node.declaration.type !== 'VariableDeclaration') continue
    for (const decl of node.declaration.declarations) {
      if (decl.id?.name !== exportName) continue
      if (decl.init?.type !== 'ObjectExpression') continue
      const result = {}
      for (const prop of decl.init.properties) {
        if (prop.type !== 'Property' || prop.key?.type !== 'Identifier') continue
        result[prop.key.name] = prop.value?.type === 'Literal' ? prop.value.value : undefined
      }
      return result
    }
  }
  return null
}
