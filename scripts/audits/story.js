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
import { readFlowStoryModule, FLOW_BOOK_DIRNAME, FLOW_STORIES_DIRNAME } from './lib/config-io.js'
import { collectAllPageIds } from './lib/reachability.js'
import { walkPageFiles } from '../helpers/page-walk.js'
import { resolveVisibility, parsePageSegments } from '../../src/shared/utils/pagePathIdentity.js'

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

/** True for a FlowStoryRef entry ({ ref }) — mirrors isPageStep's hand-rolled style
 * rather than importing isFlowStoryRef from src/types/index.ts, which is only
 * reachable via the Vite-only @flowkit/types alias plain Node can't resolve. */
function isRefStep(entry) {
  return entry && typeof entry === 'object' && typeof entry.ref === 'string'
}

/**
 * Workspace-wide bare page ids, per chapter (a bare id is only meaningful within its
 * own chapter's scope — the same bare name can legitimately exist in two different
 * chapters). Returns Set<string> of every bare `page` value seen anywhere, used by
 * story/bare-id-in-step to recognize "this looks like a leftover bare id from
 * pre-composite-id content," not to resolve it to a specific chapter.
 */
function collectBarePageIds(wsDir) {
  const chaptersDir = path.join(wsDir, FLOW_BOOK_DIRNAME)
  const bareIds = new Set()
  if (!fs.existsSync(chaptersDir)) return bareIds
  for (const { segments } of walkPageFiles(chaptersDir, [])) {
    if (resolveVisibility(segments) === 'non-existent') continue
    const parsed = parsePageSegments(segments)
    if (parsed) bareIds.add(parsed.page)
  }
  return bareIds
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
  const bareIds = collectBarePageIds(wsDir)

  // First pass: read every FlowStory once, up front — story/ref-target-missing and
  // story/unused-flowStory both need the full set of ids/refs across ALL files, not
  // just the one file currently being validated in the second pass below.
  const parsedFlowStories = []
  const allFlowStoryIds = new Set()
  const allRefTargets = new Set()

  for (const { file, fullPath } of files) {
    const relPath = path.relative(wsDir, fullPath)
    const flowStory = await readFlowStoryModule(fullPath)
    const expectedId = file.replace(/\.(ts|js)$/, '')
    parsedFlowStories.push({ relPath, expectedId, flowStory })
    if (flowStory) {
      allFlowStoryIds.add(flowStory.id ?? expectedId)
      for (const step of flowStory.steps ?? []) {
        if (isRefStep(step)) allRefTargets.add(step.ref)
      }
    }
  }

  for (const { relPath, expectedId, flowStory } of parsedFlowStories) {
    if (!flowStory) {
      report.add({
        ruleId: 'story/unreadable',
        severity: 'error',
        file: relPath,
        message: 'Could not be parsed/evaluated — check for a syntax error.',
      })
      continue
    }

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

    let previousPageStepId = null
    let previousStepHadForks = false

    steps.forEach((step, i) => {
      if (isRefStep(step)) {
        // story/ref-target-missing: a { ref } entry pointing at a FlowStory id that
        // doesn't exist anywhere in the workspace.
        if (!allFlowStoryIds.has(step.ref)) {
          report.add({
            ruleId: 'story/ref-target-missing',
            severity: 'error',
            file: relPath,
            message: `step[${i}]'s ref '${step.ref}' does not match any FlowStory id in this workspace.`,
            fix: 'Fix the ref, or create the missing FlowStory.',
          })
        }
        return // nothing else to validate on a ref entry
      }
      if (!isPageStep(step)) return

      if (!knownPageIds.has(step.pageId)) {
        report.add({
          ruleId: 'story/invalid-page',
          severity: 'error',
          file: relPath,
          message: `step[${i}]'s pageId '${step.pageId}' is not a real page in this workspace. Expected the 'chapter-page' composite id form (see makePageId).`,
          fix: 'Update the step to reference a real, composite chapter-page id.',
        })

        // story/bare-id-in-step: a specific, actionable diagnostic on the same
        // failure — this pageId isn't a valid composite id, but it DOES match some
        // chapter's bare page id exactly, the documented "left over from pre-
        // composite-id content" failure mode (CLAUDE.md: some checked-in demo
        // content "still uses bare ids... fails check:flowStories").
        if (bareIds.has(step.pageId)) {
          report.add({
            ruleId: 'story/bare-id-in-step',
            severity: 'error',
            file: relPath,
            message: `step[${i}]'s pageId '${step.pageId}' looks like a bare page id left over from pre-composite-id content — it matches a real page's bare folder name, but not in the required 'chapter-page' composite form.`,
            fix: `Prefix with the correct chapter id, e.g. '<chapter>-${step.pageId}'.`,
          })
        }
      }

      // story/duplicate-consecutive-step: same page targeted twice in a row — near-
      // certainly a duplicate add:step invocation, currently invisible. Skipped when
      // either step has forks attached: a fork branching out and merging back to the
      // same page (e.g. "deal hand" -> [fork: hand wins / hand loses] -> "deal again",
      // all on the same table screen) is a normal, common authored pattern, not a
      // copy-paste mistake — confirmed against real content (journey-place-a-bet-
      // blackjack.ts's win/lose fork legitimately re-targets the same page before and
      // after the fork).
      const hasForks = (step.forks ?? []).length > 0
      if (
        previousPageStepId !== null &&
        step.pageId === previousPageStepId &&
        !hasForks &&
        !previousStepHadForks
      ) {
        report.add({
          ruleId: 'story/duplicate-consecutive-step',
          severity: 'warning',
          file: relPath,
          message: `step[${i}] targets the same pageId ('${step.pageId}') as the immediately preceding step.`,
          fix: 'Remove the duplicate step, or confirm the repeat is intentional.',
        })
      }
      previousPageStepId = step.pageId
      previousStepHadForks = hasForks

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

  // story/unused-flowStory: a FlowStory never referenced by any other FlowStory's ref.
  // Low-confidence by design — a standalone top-level story (never ref'd by anything
  // else) is a valid, common case, not a mistake; the message says so explicitly.
  for (const { relPath, expectedId, flowStory } of parsedFlowStories) {
    if (!flowStory) continue
    const id = flowStory.id ?? expectedId
    if (!allRefTargets.has(id)) {
      report.add({
        ruleId: 'story/unused-flowStory',
        severity: 'warning',
        file: relPath,
        message: `FlowStory '${id}' is never referenced by any other FlowStory's ref. This may be intentional (a standalone top-level story) — not necessarily a mistake.`,
      })
    }
  }
}
