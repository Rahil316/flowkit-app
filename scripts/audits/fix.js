// flowkit audit:chapter --fix — existence-only reconciliation between manifest.ts's
// pageOrder and what's actually on disk under flowBook/. Two operations only, per domain,
// with no extra flags:
//   1. Drop ghost entries (chapter/orphaned-id) — a pageOrder[chapterId] entry with no
//      matching directory on disk.
//   2. Append orphaned entries (chapter/orphaned-dir) — a real, visible page directory with
//      no pageOrder entry, always appended to the END of that chapter's array. Never
//      repositions an existing entry as part of THIS flow — order stays 100% author-
//      controlled unless a reposition is explicitly requested (see runFixMove below).
//
// `chapter` is the only domain with fixable findings in Phase 1 — page/story/components/db
// have none, book ships empty. Passing --fix with any other domain (or none) reports that
// explicitly rather than silently no-op'ing.
//
// --fix --move:<pageId> --to:<index> — explicit, opt-in reposition of a single page within
// its own chapter's pageOrder array. Deliberately gated behind its own required flag pair so
// it can never fire as a side effect of the plain ghost-drop/orphan-append flow above — see
// runFixMove(). This is NOT --rebuild: it touches exactly one entry, leaves every other
// entry's relative order untouched, and never re-derives order from disk.
import { createReport, printReport } from './reporter.js'
import { checkChapter } from './chapter.js'
import {
  readWorkspaceConfig as readConfigRaw,
  writeWorkspaceConfig as writeConfigRaw,
} from '../authoring-support/config-patch.js'
import { g, r, d, b } from '../helpers/colors.js'

const FIXABLE_RULE_IDS = new Set(['chapter/orphaned-id', 'chapter/orphaned-dir'])

/**
 * Applies the two fixable rule classes to an in-memory config object, mutating it
 * in place. Returns the list of findings actually acted on. Relies on `finding.meta`
 * (attached by chapter.js) rather than parsing the human-readable `message` string,
 * so this stays correct even if message wording changes independently.
 */
function applyChapterFixes(config, findings) {
  const applied = []
  for (const f of findings) {
    if (!f.meta) continue
    const { chapterId, pageId } = f.meta
    if (f.ruleId === 'chapter/orphaned-id') {
      if (!config.pageOrder[chapterId]) continue
      config.pageOrder[chapterId] = config.pageOrder[chapterId].filter(id => id !== pageId)
      applied.push(f)
    } else if (f.ruleId === 'chapter/orphaned-dir') {
      if (!config.pageOrder[chapterId]) config.pageOrder[chapterId] = []
      if (!config.pageOrder[chapterId].includes(pageId)) {
        config.pageOrder[chapterId].push(pageId)
      }
      applied.push(f)
    }
  }
  return applied
}

/** Runs --fix for one domain (or all domains) against one workspace. */
export async function runFix(wsDir, wsName, domain) {
  if (domain && domain !== 'chapter') {
    console.log(
      d(`--fix has no effect on the '${domain}' domain — nothing is auto-fixable there yet.`)
    )
    return
  }

  const before = createReport()
  await checkChapter(wsDir, before)

  const fixable = before.findings.filter(f => FIXABLE_RULE_IDS.has(f.ruleId))
  const unfixable = before.findings.filter(f => !FIXABLE_RULE_IDS.has(f.ruleId))

  if (fixable.length > 0) {
    const config = readConfigRaw(wsDir)
    applyChapterFixes(config, fixable)
    writeConfigRaw(wsDir, config)
  }

  const after = createReport()
  await checkChapter(wsDir, after)
  printReport(after, wsName, 'chapter')

  if (unfixable.length > 0) {
    const ids = [...new Set(unfixable.map(f => f.ruleId))]
    console.log(r(`--fix has no effect on ${unfixable.length} finding(s): ${ids.join(', ')}`))
  } else if (fixable.length === 0) {
    console.log(g('  Nothing to fix.'))
  }

  if (after.errorCount > 0) process.exit(1)
}

/**
 * Runs --fix --move:<pageId> --to:<index> for one workspace — an explicit, opt-in
 * reposition of a single page within its own chapter's pageOrder array. Unlike
 * runFix() above, this never runs implicitly: it requires --move to be present, so a
 * user cleaning up ghosts/orphans via plain `--fix` can never accidentally trigger a
 * reorder.
 *
 * Only ever touches ONE page's position — every other entry's relative order is
 * preserved exactly. `toIndex` is clamped to the array's valid append position (i.e.
 * an index >= the (post-removal) array length moves the page to the end, matching
 * Array.prototype.splice's own clamping behavior) rather than erroring, since "move
 * past the end" has one unambiguous, harmless interpretation: append. A negative
 * index is rejected outright — there's no equally unambiguous interpretation for it.
 *
 * `pageId` must already exist in some chapter's pageOrder (this is a reposition, not
 * a create — chapter/orphaned-dir + a plain --fix is the tool for adding a missing
 * entry). Errors out clearly rather than silently no-op'ing when the page isn't found.
 */
export async function runFixMove(wsDir, wsName, pageId, toIndex) {
  if (!pageId) {
    console.error(r('✗ --move requires a page id, e.g. --move:my-page --to:0'))
    process.exit(1)
  }
  if (!Number.isInteger(toIndex) || toIndex < 0) {
    console.error(r(`✗ --to must be a non-negative integer index (got: ${toIndex})`))
    process.exit(1)
  }

  const config = readConfigRaw(wsDir)
  const chapterId = Object.keys(config.pageOrder).find(cid =>
    config.pageOrder[cid].includes(pageId)
  )

  if (!chapterId) {
    console.error(
      r(
        `✗ Page '${pageId}' was not found in any chapter's pageOrder — nothing to reposition.`
      )
    )
    process.exit(1)
  }

  const pages = config.pageOrder[chapterId]
  const before = [...pages]
  const fromIndex = pages.indexOf(pageId)

  pages.splice(fromIndex, 1)
  const clampedIndex = Math.min(toIndex, pages.length)
  pages.splice(clampedIndex, 0, pageId)

  writeConfigRaw(wsDir, config)

  console.log('')
  console.log(b(`flowkit audit:chapter --fix --move:${pageId} — ${wsName}`))
  console.log(d(' ────────────────────────────────────────────'))
  console.log(b(`  ${chapterId}:`))
  console.log(d(`    before: [${before.join(', ')}]`))
  console.log(d(`    after:  [${pages.join(', ')}]`))
  if (clampedIndex !== toIndex) {
    console.log(
      d(
        `    (--to:${toIndex} was past the end of the array; clamped to append at index ${clampedIndex})`
      )
    )
  }
  console.log(g(`  Moved '${pageId}' from index ${fromIndex} to ${clampedIndex}.`))
  console.log('')
}
