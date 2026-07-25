// flowkit audit:page — page-domain rules.
//
// Forbidden cross-layer imports are NOT checked here — that's enforced by
// eslint-plugin-boundaries' `workspace` element/policy in eslint.config.js instead (resolved
// decision: reuse existing, already-configured infra rather than duplicate the same concern
// in a second, parallel rule engine). This module only covers what ESLint structurally
// cannot see: the page's own export shape and pageMeta consistency.
import fs from 'fs'
import path from 'path'
import { parseTopLevel, hasDefaultFunctionExport, findExportedObjectLiteral } from './ts-parse.js'
import { FLOW_BOOK_DIRNAME } from '../helpers/config-filenames.js'
import { walkPageFiles } from '../helpers/page-walk.js'
import {
  resolveVisibility,
  parsePageSegments,
  makePageId,
  pickPageFile,
} from '../../src/shared/utils/pagePathIdentity.js'

/** Runs page-domain rules for one workspace. Appends findings to `report`. */
export function checkPage(wsDir, report) {
  const chaptersDir = path.join(wsDir, FLOW_BOOK_DIRNAME)
  if (!fs.existsSync(chaptersDir)) return

  const allFiles = walkPageFiles(chaptersDir, [])

  // Group real (non-hidden-by-__, since walkPageFiles already pruned those) files by
  // (chapter, page) so multi-candidate folders can be resolved via pickPageFile.
  const groups = new Map() // key: `${chapter}::${page}` -> [{segments, fullPath, parsed}]

  for (const entry of allFiles) {
    const visibility = resolveVisibility(entry.segments)
    if (visibility === 'non-existent') continue // belt-and-suspenders; walk already pruned __ dirs

    const parsed = parsePageSegments(entry.segments)
    if (!parsed) continue // not a recognized page-file extension (shouldn't happen given the walk filter)

    const key = `${parsed.chapter}::${parsed.page}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push({ ...entry, parsed })
  }

  for (const [, candidates] of groups) {
    const { chapter, page } = candidates[0].parsed
    const relDir = path.relative(wsDir, path.dirname(candidates[0].fullPath))

    let winnerFileName
    if (candidates.length > 1) {
      const filenames = candidates.map(c => path.basename(c.fullPath))
      const { chosen, ambiguous } = pickPageFile(filenames)
      winnerFileName = chosen
      if (ambiguous) {
        const losers = filenames.filter(f => f !== chosen)
        report.add({
          ruleId: 'page/ambiguous-folder',
          severity: 'warning',
          file: relDir,
          message: `Multiple candidate page files found; '${chosen}' was picked as the real page (alphabetically first).`,
          fix: `Prefix the other file(s) with '__' or delete/rename them to remove the ambiguity: ${losers.join(', ')}`,
          requiresAcknowledgment: true,
        })
      }
    } else {
      winnerFileName = path.basename(candidates[0].fullPath)
    }

    const winner = candidates.find(c => path.basename(c.fullPath) === winnerFileName)
    const filePath = winner.fullPath
    const relPath = path.relative(wsDir, filePath)
    const expectedId = makePageId(chapter, page)

    const body = parseTopLevel(filePath)
    if (!body) continue // unparseable — tsc/eslint's job to report syntax errors, not this rule's

    if (!hasDefaultFunctionExport(body)) {
      report.add({
        ruleId: 'page/no-default-export',
        severity: 'error',
        file: relPath,
        message: 'No `export default function PageName(...)` found.',
        fix: 'Add a default-exported function component.',
      })
    }

    const meta = findExportedObjectLiteral(body, 'pageMeta')
    if (!meta) {
      report.add({
        ruleId: 'page/missing-meta',
        severity: 'error',
        file: relPath,
        message: 'No `export const pageMeta` found.',
        fix: `Add: export const pageMeta = { label: '...', desc: '...' }`,
      })
      continue
    }

    // id is optional (repo-mode's own scaffold.js omits it entirely) — only flag a
    // genuine mismatch, never flag mere absence.
    if (meta.id !== undefined && meta.id !== expectedId) {
      report.add({
        ruleId: 'page/meta-id-mismatch',
        severity: 'error',
        file: relPath,
        message: `pageMeta.id is '${meta.id}' but the derived page id is '${expectedId}'.`,
        fix: `Set pageMeta.id to '${expectedId}', or rename the directory to match.`,
      })
    }

    if (!meta.label) {
      report.add({
        ruleId: 'page/meta-missing-label',
        severity: 'warning',
        file: relPath,
        message: 'pageMeta has no `label` field.',
        fix: `Add a label: pageMeta.label = 'Some Title'`,
      })
    }
  }
}
