// flowkit audit:chapter — per-chapter manifest.ts consistency rules: does chapters[]/
// pageOrder agree with flowBook/ on disk, at the "one chapter's page list" granularity.
//
// Structural flexibility: this file must never hardcode 'flowBook'/'manifest.ts' as a
// literal string, and must never re-derive _/__ visibility or page-folder identity itself —
// both are delegated to config-filenames.js and pagePathIdentity.js respectively, so a
// future rename/structure change only ever needs to touch those two places.
import fs from 'fs'
import path from 'path'
import {
  readWorkspaceConfig,
  findPageDirNames,
  WORKSPACE_CONFIG_FILENAME,
  FLOW_BOOK_DIRNAME,
} from './lib/config-io.js'

/** Runs chapter-domain rules for one workspace. Appends findings to `report`. */
export async function checkChapter(wsDir, report) {
  const config = await readWorkspaceConfig(wsDir)
  if (!config) return // no config file, or it doesn't parse — nothing to cross-reference

  const chapters = config.chapters ?? []
  const pageOrder = config.pageOrder ?? {}
  const chaptersDir = path.join(wsDir, FLOW_BOOK_DIRNAME)

  for (const chapterId of Object.keys(pageOrder)) {
    if (!chapters.includes(chapterId)) {
      report.add({
        ruleId: 'chapter/chapter-mismatch',
        severity: 'error',
        file: WORKSPACE_CONFIG_FILENAME,
        message: `pageOrder has an entry for chapter '${chapterId}', but it's not listed in chapters[].`,
        fix: `Add '${chapterId}' to chapters[], or remove its pageOrder entry.`,
      })
      continue
    }

    const pageIds = pageOrder[chapterId] ?? []
    if (pageIds.length === 0) {
      report.add({
        ruleId: 'chapter/empty-chapter',
        severity: 'warning',
        file: WORKSPACE_CONFIG_FILENAME,
        message: `Chapter '${chapterId}' has no pages in pageOrder.`,
        fix: `flowkit create:page --chapter:${chapterId} --name:<id>`,
      })
      continue
    }

    // Page folders can now sit at any depth ≥1 under the chapter dir (cosmetic
    // folders in between are allowed) — pageOrder still stores bare, chapter-scoped
    // page ids (the LAST folder segment), so find each one anywhere under chapterDir.
    const chapterDir = path.join(chaptersDir, chapterId)
    const pageDirNames = fs.existsSync(chapterDir) ? findPageDirNames(chapterDir) : new Map()

    for (const pageId of pageIds) {
      if (!pageDirNames.has(pageId)) {
        report.add({
          ruleId: 'chapter/orphaned-id',
          severity: 'error',
          file: WORKSPACE_CONFIG_FILENAME,
          message: `pageOrder.${chapterId} lists '${pageId}', which has no matching directory.`,
          fix: `Expected: ${FLOW_BOOK_DIRNAME}/${chapterId}/.../${pageId}/`,
          clifix: `flowkit create:page --chapter:${chapterId} --name:${pageId}`,
          meta: { chapterId, pageId },
        })
      }
    }

    // Directories present on disk but never registered in pageOrder. `_`/`__`-prefixed
    // folders (or any `_`/`__`-prefixed ancestor of the page folder) are intentionally
    // author-hidden/non-existent, not orphaned — skip both.
    for (const [dirName, visibility] of pageDirNames) {
      if (visibility === 'hidden') continue
      if (!pageIds.includes(dirName)) {
        report.add({
          ruleId: 'chapter/orphaned-dir',
          severity: 'warning',
          file: WORKSPACE_CONFIG_FILENAME,
          message: `A page directory named '${dirName}' exists under ${FLOW_BOOK_DIRNAME}/${chapterId}/ but is not listed in pageOrder.${chapterId}.`,
          fix: `Add '${dirName}' to pageOrder.${chapterId}, or remove the directory if unused.`,
          meta: { chapterId, pageId: dirName },
        })
      }
    }
  }
}
