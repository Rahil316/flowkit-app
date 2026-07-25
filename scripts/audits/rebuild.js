// flowkit audit:chapter --rebuild [--confirm] — full regenerate of chapters[]/pageOrder
// purely from flowBook/ on disk. Destructive to authored order by nature (the entire point
// of --rebuild), gated behind an explicit two-step confirmation so it can never run by
// accident:
//   Step 1 (--rebuild alone): computes the disk-derived structure, prints a preview diff
//     against the current authored config, writes NOTHING.
//   Step 2 (--rebuild --confirm): recomputes fresh (never trusts state between
//     invocations) and writes.
// `chapter` is the only domain --rebuild has an effect on in Phase 1.
import fs from 'fs'
import path from 'path'
import {
  readWorkspaceConfig as readConfigRaw,
  writeWorkspaceConfig as writeConfigRaw,
} from '../authoring-support/config-patch.js'
import { FLOW_BOOK_DIRNAME } from '../helpers/config-filenames.js'
import { findPageDirNames } from './lib/config-io.js'
import { g, r, d, b } from '../helpers/colors.js'

/**
 * Walks flowBook/ on disk and derives a fresh { chapters, pageOrder } shape — one chapter
 * per top-level folder, each chapter's page list from findPageDirNames (which already
 * delegates all _/__ visibility and nested-folder handling to pagePathIdentity.js). Page
 * order within a chapter follows fs.readdirSync's own directory-listing order, which is
 * filesystem/locale-dependent — a known, accepted limitation of --rebuild in this phase,
 * not something this function attempts to normalize.
 */
function deriveFromDisk(wsDir) {
  const chaptersDir = path.join(wsDir, FLOW_BOOK_DIRNAME)
  if (!fs.existsSync(chaptersDir)) return { chapters: [], pageOrder: {} }

  const chapters = fs
    .readdirSync(chaptersDir)
    .filter(entry => fs.statSync(path.join(chaptersDir, entry)).isDirectory())

  const pageOrder = {}
  for (const chapterId of chapters) {
    const pageDirNames = findPageDirNames(path.join(chaptersDir, chapterId))
    pageOrder[chapterId] = [...pageDirNames.keys()]
  }
  return { chapters, pageOrder }
}

function printDiff(current, derived, applied) {
  const allChapters = [...new Set([...current.chapters, ...derived.chapters])]
  for (const chapterId of allChapters) {
    const before = current.pageOrder[chapterId] ?? null
    const after = derived.pageOrder[chapterId] ?? null
    if (!current.chapters.includes(chapterId)) {
      console.log(g(`  + chapter '${chapterId}' (found on disk, not in chapters[])`))
    } else if (!derived.chapters.includes(chapterId)) {
      console.log(r(`  - chapter '${chapterId}' (in chapters[], not found on disk)`))
    }
    const beforeStr = before ? before.join(', ') : '(none)'
    const afterStr = after ? after.join(', ') : '(none)'
    if (beforeStr !== afterStr) {
      console.log(b(`  ${chapterId}:`))
      console.log(d(`    before: [${beforeStr}]`))
      console.log(d(`    after:  [${afterStr}]`))
    }
  }
  console.log('')
  console.log(
    applied
      ? g('  Applied.')
      : d(
          '  This would discard the current authored order shown above. Re-run with --rebuild --confirm to apply.'
        )
  )
}

/** Runs --rebuild for one domain (or all domains) against one workspace. */
export async function runRebuild(wsDir, wsName, domain, { confirm }) {
  if (domain && domain !== 'chapter') {
    console.log(d(`--rebuild has no effect on the '${domain}' domain.`))
    return
  }

  const current = readConfigRaw(wsDir)
  const derived = deriveFromDisk(wsDir)

  console.log('')
  console.log(b(`flowkit audit:chapter --rebuild — ${wsName}`))
  console.log(d(' ────────────────────────────────────────────'))

  if (!confirm) {
    printDiff(current, derived, false)
    return
  }

  // Recompute fresh — never trust the `current`/`derived` read above across the
  // conceptual "two steps," since --rebuild --confirm is its own separate invocation.
  const freshCurrent = readConfigRaw(wsDir)
  const freshDerived = deriveFromDisk(wsDir)
  freshCurrent.chapters = freshDerived.chapters
  freshCurrent.pageOrder = freshDerived.pageOrder
  writeConfigRaw(wsDir, freshCurrent)

  printDiff(current, derived, true)
}
