// flowkit check:plans — flowStory rules. Real successor to plan:check's previous
// string-presence-only implementation (scripts/platform/plans.js's cmdPlanCheck now
// delegates here).
//
// Known gap, deliberate: fork-nested steps (the `label:`+`steps:[...]` sub-objects
// scripts/authoring/promote-flow.js text-matches by regex) are NOT walked by
// `flowStory/invalid-page` below — forks aren't part of FlowplanDef's typed `steps[]`
// union (src/types/index.ts's FlowplanStepEntry is FlowStep | FlowplanRef, neither of
// which models a fork's nested structure), and promote-flow.js's own fork-detection is
// itself regex-based rather than a stable, reusable AST shape. Revisit once forks have a
// first-class typed representation to validate against.
import fs from 'fs'
import path from 'path'
import { readFlowplanModule } from './config.js'
import { FLOW_BOOK_DIRNAME, FLOW_STORIES_DIRNAME } from '../helpers/config-filenames.js'
import { walkPageFiles } from '../helpers/page-walk.js'
import {
  resolveVisibility,
  parsePageSegments,
  makePageId,
} from '../../src/shared/utils/pagePathIdentity.js'

function listFlowplanFiles(wsDir) {
  const dir = path.join(wsDir, FLOW_STORIES_DIRNAME)
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.ts') || f.endsWith('.js'))
    .map(f => ({ file: f, fullPath: path.join(dir, f) }))
}

/** True for a plain FlowStep entry (has pageId) — excludes FlowplanRef ({ ref }) entries. */
function isPageStep(entry) {
  return entry && typeof entry === 'object' && typeof entry.pageId === 'string'
}

/** Collects every known page id, in the collision-proof `chapters-page` composite form
 * (makePageId), across the whole workspace. `__`-hidden screens are never included. */
function collectAllPageIds(wsDir) {
  const chaptersDir = path.join(wsDir, FLOW_BOOK_DIRNAME)
  const ids = new Set()
  if (!fs.existsSync(chaptersDir)) return ids
  for (const { segments } of walkPageFiles(chaptersDir, [])) {
    if (resolveVisibility(segments) === 'non-existent') continue // belt-and-suspenders
    const parsed = parsePageSegments(segments)
    if (!parsed) continue
    ids.add(makePageId(parsed.chapter, parsed.page))
  }
  return ids
}

/** Runs flowStory-domain rules for one workspace. Appends findings to `report`. */
export async function checkFlowplans(wsDir, report) {
  const files = listFlowplanFiles(wsDir)
  if (files.length === 0) {
    // A flowStories/ dir that exists but is empty is suspicious enough to fail the
    // prebuild gate rather than silently pass — mirrors plan:check's old behavior
    // (the naive string-check command this rule module supersedes).
    if (fs.existsSync(path.join(wsDir, FLOW_STORIES_DIRNAME))) {
      report.add({
        ruleId: 'flowStory/empty-workspace',
        severity: 'error',
        file: `${FLOW_STORIES_DIRNAME}/`,
        message: `${FLOW_STORIES_DIRNAME}/ directory exists but contains no .ts/.js plans.`,
        fix: 'flowkit create:flowStory --name:<id>',
      })
    }
    return
  }

  const knownPageIds = collectAllPageIds(wsDir)

  for (const { file, fullPath } of files) {
    const relPath = path.relative(wsDir, fullPath)
    const flowStory = await readFlowplanModule(fullPath)
    if (!flowStory) {
      report.add({
        ruleId: 'flowStory/unreadable',
        severity: 'error',
        file: relPath,
        message: 'Could not be parsed/evaluated — check for a syntax error.',
      })
      continue
    }

    const expectedId = file.replace(/\.(ts|js)$/, '')
    if (flowStory.id && flowStory.id !== expectedId) {
      report.add({
        ruleId: 'flowStory/id-filename-mismatch',
        severity: 'error',
        file: relPath,
        message: `defineFlow's id is '${flowStory.id}' but the filename implies '${expectedId}'.`,
        fix: `Set id to '${expectedId}', or rename the file to match.`,
      })
    }

    const steps = flowStory.steps ?? []
    if (steps.length === 0) {
      report.add({
        ruleId: 'flowStory/empty-steps',
        severity: 'warning',
        file: relPath,
        message: 'Flowplan has zero steps.',
        fix: `flowkit add:step --flowStory:${expectedId} --page:<id>`,
      })
      continue
    }

    steps.forEach((step, i) => {
      if (!isPageStep(step)) return // a FlowplanRef ({ ref }) — nothing to validate here

      if (!knownPageIds.has(step.pageId)) {
        report.add({
          ruleId: 'flowStory/invalid-page',
          severity: 'error',
          file: relPath,
          message: `step[${i}]'s pageId '${step.pageId}' is not a real page in this workspace. Expected the 'chapter-page' composite id form (see makePageId).`,
          fix: 'Update the step to reference a real, composite chapter-page id.',
        })
      }

      if (!step.actionNote && !step.on) {
        report.add({
          ruleId: 'flowStory/weak-step',
          severity: 'warning',
          file: relPath,
          message: `step[${i}] has no actionNote and no 'on' handler — playback shows no guidance.`,
          fix: `Add actionNote: 'describe what the user does here'`,
        })
      }
    })
  }
}
