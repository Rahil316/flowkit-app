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
import { resolveStartPageId } from './lib/reachability.js'
import { walkPageFiles } from '../helpers/page-walk.js'
import {
  makePageId,
  resolveVisibility,
  parsePageSegments,
} from '../../src/shared/utils/pagePathIdentity.js'

// Deliberately more permissive than scripts/helpers/validate.js's assertKebab (which
// requires a leading letter, for CLI-created ids) — real, shipped chapter ids like
// '2048-flow' (hardcoded into game-demo-scaffold.js's template, never run through the
// CLI's own assertKebab) legitimately start with a digit. This rule only flags ids
// that couldn't have been produced by any authoring path at all (uppercase,
// underscores, spaces, etc.), not the CLI-vs-hand-authored leading-character gap.
const KEBAB_RE = /^[a-z0-9][a-z0-9-]*$/

/**
 * Workspace-wide {chapter, page} pairs, structured (never a joined/composite string) —
 * needed by chapter/bare-id-collision-with-composite to answer "does this bare id
 * collide with a real composite id belonging to a DIFFERENT chapter," which requires
 * knowing which chapter a composite id actually decomposes to. collectAllPageIds
 * (lib/reachability.js) only returns the composite Set, not the per-pair breakdown —
 * the wrong shape for this specific check, so this is a small, separate local walk
 * (mirrors page.js's collectWorkspacePagePairs).
 */
function collectWorkspacePagePairs(wsDir) {
  const chaptersDir = path.join(wsDir, FLOW_BOOK_DIRNAME)
  const pairs = []
  if (!fs.existsSync(chaptersDir)) return pairs
  const seen = new Set()
  for (const { segments } of walkPageFiles(chaptersDir, [])) {
    if (resolveVisibility(segments) === 'non-existent') continue
    const parsed = parsePageSegments(segments)
    if (!parsed) continue
    const dedupKey = `${parsed.chapter} ${parsed.page}`
    if (seen.has(dedupKey)) continue
    seen.add(dedupKey)
    pairs.push({ chapter: parsed.chapter, page: parsed.page })
  }
  return pairs
}

/** Runs chapter-domain rules for one workspace. Appends findings to `report`. */
export async function checkChapter(wsDir, report) {
  const config = await readWorkspaceConfig(wsDir)
  if (!config) return // no config file, or it doesn't parse — nothing to cross-reference

  const chapters = config.chapters ?? []
  const pageOrder = config.pageOrder ?? {}
  const chaptersDir = path.join(wsDir, FLOW_BOOK_DIRNAME)

  // chapter/id-not-kebab: checked once per declared chapter, independent of pageOrder.
  for (const chapterId of chapters) {
    if (!KEBAB_RE.test(chapterId)) {
      report.add({
        ruleId: 'chapter/id-not-kebab',
        severity: 'warning',
        file: WORKSPACE_CONFIG_FILENAME,
        message: `Chapter id '${chapterId}' isn't kebab-case (lowercase, hyphen-separated) — only reachable by hand-editing manifest.ts, since the CLI always scaffolds kebab-case ids.`,
        fix: `Rename to a kebab-case id, e.g. '${chapterId
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, '-')
          .replace(/^-+|-+$/g, '')}'.`,
      })
    }
  }

  // chapter/bare-id-collision-with-composite: precomputed once, workspace-wide — for
  // every bare pageOrder entry, does that exact string happen to ALSO be a valid
  // composite id belonging to some OTHER chapter? This is the documented footgun
  // (CLAUDE.md's "Bare vs. composite page ids") where pasting a composite id into
  // pageOrder silently fails to resolve — this rule catches it proactively.
  const workspacePagePairs = collectWorkspacePagePairs(wsDir)

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

    // chapter/pageOrder-duplicate-entry: same bare page id listed twice in one
    // chapter's array. Produces duplicate rendering/ordering with no signal today.
    const seenInChapter = new Set()
    for (const pageId of pageIds) {
      if (seenInChapter.has(pageId)) {
        report.add({
          ruleId: 'chapter/pageOrder-duplicate-entry',
          severity: 'error',
          file: WORKSPACE_CONFIG_FILENAME,
          message: `pageOrder.${chapterId} lists '${pageId}' more than once.`,
          fix: `Remove the duplicate entry.`,
        })
      }
      seenInChapter.add(pageId)

      // A bare pageOrder entry that's ALSO a valid composite id — but for a DIFFERENT
      // chapter than the one it's actually declared in. Checked against structured
      // {chapter, page} pairs (never a joined string) so this can correctly tell "a
      // different chapter's composite id" apart from this chapter's own page whose
      // bare id happens to contain a hyphen matching another chapter's name.
      for (const { chapter: otherChapter, page: otherPage } of workspacePagePairs) {
        if (otherChapter === chapterId) continue // this chapter's own pages, not "another" chapter
        if (makePageId(otherChapter, otherPage) === pageId) {
          report.add({
            ruleId: 'chapter/bare-id-collision-with-composite',
            severity: 'error',
            file: WORKSPACE_CONFIG_FILENAME,
            message: `pageOrder.${chapterId} lists '${pageId}', which looks like a bare id here but is actually a real composite page id belonging to chapter '${otherChapter}' — likely a composite id pasted where a bare one was expected. It will silently fail to resolve.`,
            fix: `Use the correct bare page id for chapter '${chapterId}', not a composite id from elsewhere.`,
          })
          break
        }
      }
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

  // chapter/startPage-wrong-chapter-scope: legal but visually surprising — startPage's
  // chapter isn't chapters[0], even though chapter order visually implies flow order.
  // Only meaningful when startPage resolves unambiguously (2+ matches is
  // book/invalid-start-page's territory, not this rule's — don't double-report).
  const startPageCandidates = resolveStartPageId(wsDir, config)
  if (startPageCandidates.length === 1 && chapters.length > 0) {
    const [{ chapter: startChapter }] = startPageCandidates
    if (startChapter !== chapters[0]) {
      report.add({
        ruleId: 'chapter/startPage-wrong-chapter-scope',
        severity: 'warning',
        file: WORKSPACE_CONFIG_FILENAME,
        message: `startPage resolves to chapter '${startChapter}', but chapters[0] is '${chapters[0]}' — chapter order visually implies flow order, so this may be an easy-to-miss authoring surprise.`,
        fix: `Reorder chapters[] so '${startChapter}' comes first, or confirm this is intentional.`,
      })
    }
  }
}
