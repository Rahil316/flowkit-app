// flowkit audit:db — mock db rules.
//
// Corrected from the original flowlint-strategy.md spec (`db/no-default-export`,
// `db/non-object-export`) after checking real generated db.ts files: BOTH generators
// (scripts/helpers/scaffold.js repo-mode, scripts/helpers/workspace-template.js flat-mode)
// use NAMED exports (`export const user`, `export const items`), never a default export —
// confirmed by the flat-mode template's own doc comment ("Named exports are loaded into the
// platform db object on startup"). The original rule spec would have flagged every
// legitimately-generated db.ts as broken. Rule here instead: db.ts must have at least one
// export (named or default) — an empty file is the actual failure mode worth catching.
import fs from 'fs'
import path from 'path'
import { parseTopLevel } from './ts-parse.js'

/** Runs db-domain rules for one workspace. Appends findings to `report`. */
export function checkDb(wsDir, report) {
  const dbCandidates = ['db.ts', 'db.js'].map(f => path.join(wsDir, 'lib', 'data', f))
  const dbPath = dbCandidates.find(p => fs.existsSync(p))
  if (!dbPath) return // no db file is valid — not every workspace needs mock data

  const relPath = path.relative(wsDir, dbPath)
  const body = parseTopLevel(dbPath)
  if (!body) return // unparseable — tsc/eslint's job, not this rule's

  const hasAnyExport = body.some(
    node => node.type === 'ExportNamedDeclaration' || node.type === 'ExportDefaultDeclaration'
  )
  if (!hasAnyExport) {
    report.add({
      ruleId: 'db/no-exports',
      severity: 'error',
      file: relPath,
      message: `${relPath} has no exports — nothing will load into the platform db object.`,
      fix: `Add at least one named export, e.g. export const user = { ... }`,
    })
  }
}
