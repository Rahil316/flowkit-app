// flowkit audit:story — flowStory rules. Real successor to plan:check's previous
// string-presence-only implementation (scripts/platform/plans.js's cmdPlanCheck now
// delegates here, via check:flowStories's earlier successor).
//
// `story/invalid-page` below only validates top-level `steps[].pageId` — it does not
// walk into `step.forks[].steps[]`. Fork-nested pageId validation is instead its own
// separate rule, `story/fork-invalid-page` (see checkForkSteps below),
// which recurses into forks at any nesting depth (forks can contain forks), using the
// same recursion shape as lib/reachability.js's walkStepsForEdges (built for a
// different purpose — edge-counting, not validation — read there for the established
// pattern). This was previously a documented, deliberate gap; it no longer is.
//
// Deliberately NOT extended into forks: `story/weak-step` (missing actionNote/on).
// Fork branches are terminal/rare content in every workspace today, and weak-step is a
// style warning, not a correctness check — folding it in was judged not worth the
// added noise for this pass. Revisit if fork usage becomes common.
import fs from 'fs'
import path from 'path'
import { readFlowStoryModule, FLOW_STORIES_DIRNAME } from './lib/config-io.js'
import { collectAllPageIds } from './lib/reachability.js'

function listFlowStoryFiles(wsDir) {
  const dir = path.join(wsDir, FLOW_STORIES_DIRNAME)
  if (!fs.existsSync(dir)) return []
  return fs
    .readdirSync(dir)
    .filter(f => f.endsWith('.ts') || f.endsWith('.js'))
    .map(f => ({ file: f, fullPath: path.join(dir, f) }))
}

/** True for a plain FlowStep entry (has pageId) — excludes FlowStoryRef ({ ref }) entries. */
function isPageStep(entry) {
  return entry && typeof entry === 'object' && typeof entry.pageId === 'string'
}

/**
 * Recursively validates fork-nested steps' pageIds against `knownPageIds`, at any
 * fork-nesting depth (Fork.steps can itself contain steps with their own `forks`).
 * Mirrors lib/reachability.js's walkStepsForEdges recursion shape, but emits findings
 * instead of counting edges. `pathLabels` accumulates the chain of enclosing fork
 * labels (outermost first) so a deeply-nested finding's message can say exactly which
 * fork branch it's in, not just the innermost one.
 */
function checkForkSteps(steps, { relPath, knownPageIds, report, pathLabels }) {
  for (const step of steps ?? []) {
    if (isPageStep(step) && !knownPageIds.has(step.pageId)) {
      report.add({
        ruleId: 'story/fork-invalid-page',
        severity: 'error',
        file: relPath,
        message: `A step inside fork "${pathLabels.join(' > ')}" has pageId '${step.pageId}', which is not a real page in this workspace. Expected the 'chapter-page' composite id form (see makePageId).`,
        fix: 'Update the fork-nested step to reference a real, composite chapter-page id.',
      })
    }
    for (const fork of step.forks ?? []) {
      checkForkSteps(fork.steps, {
        relPath,
        knownPageIds,
        report,
        pathLabels: [...pathLabels, fork.label],
      })
    }
  }
}

/** Runs story-domain rules for one workspace. Appends findings to `report`. */
export async function checkStory(wsDir, report) {
  const files = listFlowStoryFiles(wsDir)
  if (files.length === 0) {
    // A flowStories/ dir that exists but is empty is suspicious enough to fail the
    // prebuild gate rather than silently pass — mirrors plan:check's old behavior
    // (the naive string-check command this rule module supersedes).
    if (fs.existsSync(path.join(wsDir, FLOW_STORIES_DIRNAME))) {
      report.add({
        ruleId: 'story/empty-workspace',
        severity: 'error',
        file: `${FLOW_STORIES_DIRNAME}/`,
        message: `${FLOW_STORIES_DIRNAME}/ directory exists but contains no .ts/.js plans.`,
        fix: 'flowkit create:flowStory --name:<id>',
      })
    }
    return
  }

  const { ids: knownPageIds } = collectAllPageIds(wsDir)

  for (const { file, fullPath } of files) {
    const relPath = path.relative(wsDir, fullPath)
    const flowStory = await readFlowStoryModule(fullPath)
    if (!flowStory) {
      report.add({
        ruleId: 'story/unreadable',
        severity: 'error',
        file: relPath,
        message: 'Could not be parsed/evaluated — check for a syntax error.',
      })
      continue
    }

    const expectedId = file.replace(/\.(ts|js)$/, '')
    if (flowStory.id && flowStory.id !== expectedId) {
      report.add({
        ruleId: 'story/id-filename-mismatch',
        severity: 'error',
        file: relPath,
        message: `defineFlow's id is '${flowStory.id}' but the filename implies '${expectedId}'.`,
        fix: `Set id to '${expectedId}', or rename the file to match.`,
      })
    }

    const steps = flowStory.steps ?? []
    if (steps.length === 0) {
      report.add({
        ruleId: 'story/empty-steps',
        severity: 'warning',
        file: relPath,
        message: 'FlowStory has zero steps.',
        fix: `flowkit add:step --flowStory:${expectedId} --page:<id>`,
      })
      continue
    }

    steps.forEach((step, i) => {
      if (!isPageStep(step)) return // a FlowStoryRef ({ ref }) — nothing to validate here

      if (!knownPageIds.has(step.pageId)) {
        report.add({
          ruleId: 'story/invalid-page',
          severity: 'error',
          file: relPath,
          message: `step[${i}]'s pageId '${step.pageId}' is not a real page in this workspace. Expected the 'chapter-page' composite id form (see makePageId).`,
          fix: 'Update the step to reference a real, composite chapter-page id.',
        })
      }

      if (!step.actionNote && !step.on) {
        report.add({
          ruleId: 'story/weak-step',
          severity: 'warning',
          file: relPath,
          message: `step[${i}] has no actionNote and no 'on' handler — playback shows no guidance.`,
          fix: `Add actionNote: 'describe what the user does here'`,
        })
      }

      for (const fork of step.forks ?? []) {
        checkForkSteps(fork.steps, {
          relPath,
          knownPageIds,
          report,
          pathLabels: [fork.label],
        })
      }
    })
  }
}
