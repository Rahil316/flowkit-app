// flowkit audit:book — whole-flowBook-spanning rules (workspace-wide page id uniqueness,
// startPage/defaultDevice validity, cross-chapter concerns).
import fs from 'fs'
import path from 'path'
import {
  readWorkspaceConfig,
  readDevicePresetLabels,
  WORKSPACE_CONFIG_FILENAME,
  FLOW_BOOK_DIRNAME,
} from './lib/config-io.js'
import { resolveStartPageId } from './lib/reachability.js'
import { walkPageFiles } from '../helpers/page-walk.js'
import {
  resolveVisibility,
  parsePageSegments,
  makePageId,
  MISC_CHAPTER_ID,
} from '../../src/shared/utils/pagePathIdentity.js'

/**
 * Walks every real page once, tracking every composite id's occurrences (not just a
 * deduped Set) — needed to actually detect duplicates. collectAllPageIds
 * (lib/reachability.js) intentionally returns a Set, which silently collapses
 * duplicates rather than surfacing them; that's the right shape for its own callers
 * (page-existence checks), the wrong shape for this rule.
 */
function collectPageOccurrences(wsDir) {
  const chaptersDir = path.join(wsDir, FLOW_BOOK_DIRNAME)
  const byId = new Map() // id -> [{chapter, page, fullPath}]
  if (!fs.existsSync(chaptersDir)) return byId
  for (const { segments, fullPath } of walkPageFiles(chaptersDir, [])) {
    if (resolveVisibility(segments) === 'non-existent') continue
    const parsed = parsePageSegments(segments)
    if (!parsed) continue
    const id = makePageId(parsed.chapter, parsed.page)
    if (!byId.has(id)) byId.set(id, [])
    byId.get(id).push({ chapter: parsed.chapter, page: parsed.page, fullPath })
  }
  return byId
}

/** Runs book-domain rules for one workspace. Appends findings to `report`. */
export async function checkBook(wsDir, report) {
  const config = await readWorkspaceConfig(wsDir)
  if (!config) return // no config file, or it doesn't parse — nothing to cross-reference

  const chapters = config.chapters ?? []

  // book/no-chapters
  if (chapters.length === 0) {
    report.add({
      ruleId: 'book/no-chapters',
      severity: 'error',
      file: WORKSPACE_CONFIG_FILENAME,
      message: 'chapters[] is empty or missing — this workspace has no navigable content at all.',
      fix: 'flowkit create:chapter --name:<id>',
    })
  }

  // book/duplicate-chapter-id
  const seenChapters = new Set()
  for (const chapterId of chapters) {
    if (seenChapters.has(chapterId)) {
      report.add({
        ruleId: 'book/duplicate-chapter-id',
        severity: 'error',
        file: WORKSPACE_CONFIG_FILENAME,
        message: `chapters[] lists '${chapterId}' more than once — object-key collisions in pageOrder would silently keep only the last one.`,
        fix: 'Remove the duplicate entry.',
      })
    }
    seenChapters.add(chapterId)
  }

  // book/duplicate-composite-id: a real collision class inherent to using '-' as both
  // the chapter/page separator and a legal character inside chapter/page names — e.g.
  // chapter 'a-b' page 'c' and chapter 'a' page 'b-c' both produce composite id 'a-b-c'.
  const occurrences = collectPageOccurrences(wsDir)
  for (const [id, entries] of occurrences) {
    if (entries.length > 1) {
      const locations = entries.map(e => `${e.chapter}/${e.page}`).join(', ')
      report.add({
        ruleId: 'book/duplicate-composite-id',
        severity: 'error',
        file: path.relative(wsDir, entries[0].fullPath),
        message: `Composite id '${id}' is produced by ${entries.length} different chapter/page pairs (${locations}) — chapter/page names containing '-' can collide this way.`,
        fix: 'Rename one of the colliding chapters or pages so their composite ids no longer match.',
      })
    }
  }

  // book/misc-chapter-orphan: pages fell into the 'misc' fallback chapter (depth-0
  // files directly under flowBook/), but chapters[] never declares 'misc' — these
  // pages exist and parse but can never appear in pageOrder-driven navigation UI.
  const hasMiscPage = [...occurrences.values()].some(entries =>
    entries.some(e => e.chapter === MISC_CHAPTER_ID)
  )
  if (hasMiscPage && !chapters.includes(MISC_CHAPTER_ID)) {
    report.add({
      ruleId: 'book/misc-chapter-orphan',
      severity: 'warning',
      file: WORKSPACE_CONFIG_FILENAME,
      message: `One or more pages resolved to the '${MISC_CHAPTER_ID}' fallback chapter (depth-0 files directly under ${FLOW_BOOK_DIRNAME}/), but '${MISC_CHAPTER_ID}' is never listed in chapters[] — these pages can't appear in normal pageOrder-driven navigation.`,
      fix: `Add '${MISC_CHAPTER_ID}' to chapters[] and register its pages in pageOrder, or move the pages into a real chapter folder.`,
    })
  }

  // book/invalid-start-page: unset/unresolved (0 matches) or ambiguous (2+ matches).
  const startPageCandidates = resolveStartPageId(wsDir, config)
  if (config.startPage) {
    if (startPageCandidates.length === 0) {
      report.add({
        ruleId: 'book/invalid-start-page',
        severity: 'error',
        file: WORKSPACE_CONFIG_FILENAME,
        message: `startPage is set to '${config.startPage}', but no real page matches that bare page id anywhere in the workspace.`,
        fix: 'Fix the typo, or point startPage at a real page id.',
      })
    } else if (startPageCandidates.length > 1) {
      const chapterList = startPageCandidates.map(c => c.chapter).join(', ')
      report.add({
        ruleId: 'book/invalid-start-page',
        severity: 'error',
        file: WORKSPACE_CONFIG_FILENAME,
        message: `startPage '${config.startPage}' is ambiguous — it matches a page in ${startPageCandidates.length} different chapters (${chapterList}), and startPage has no chapter field to disambiguate.`,
        fix: 'Rename one of the colliding pages so the bare id is unique across chapters.',
      })
    }
  }

  // book/invalid-default-device: defaultDevice doesn't match any real DevicePreset.label
  // — silently falls back to the platform default today, this makes the typo visible.
  if (config.defaultDevice) {
    const labels = await readDevicePresetLabels()
    if (labels && !labels.includes(config.defaultDevice)) {
      report.add({
        ruleId: 'book/invalid-default-device',
        severity: 'warning',
        file: WORKSPACE_CONFIG_FILENAME,
        message: `defaultDevice is set to '${config.defaultDevice}', which doesn't match any real device preset label. Falls back to the platform default silently.`,
        fix: `Use a real DevicePreset.label, e.g. one of: ${labels.slice(0, 4).join(', ')}, ...`,
      })
    }
  }
}
