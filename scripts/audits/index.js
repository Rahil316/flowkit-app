// flowkit audit / audit:<domain> — the CLI-facing entry point for this directory's rule
// modules. Kept self-contained here (not scripts/platform/) so the whole audit feature —
// rules + reporter + parser + dispatcher — lives in one directory: easy to review, extend,
// or fully remove as a single unit.
import { workspacePath } from '../helpers/paths.js'
import { resolveWorkspaceLoose as resolveWorkspace } from '../helpers/workspace-resolve.js'
import { parseStringFlag } from '../helpers/args.js'
import { createReport, printReport, printReportJson } from './reporter.js'
import { checkPage } from './page.js'
import { checkChapter } from './chapter.js'
import { checkBook } from './book.js'
import { checkStory } from './story.js'
import { checkNavigations } from './navigations.js'
import { checkComponents } from './components.js'
import { checkDb } from './db.js'
import { runFix, runFixMove } from './fix.js'
import { runRebuild } from './rebuild.js'
import { r, d } from '../helpers/colors.js'

// Each fn takes (wsDir, report) and may be sync or async — awaited uniformly below.
const DOMAINS = {
  page: checkPage,
  chapter: checkChapter,
  book: checkBook,
  story: checkStory,
  navigations: checkNavigations,
  components: checkComponents,
  db: checkDb,
}

/**
 * Entry point called from scripts/flowkit.js for `audit` / `audit:<domain>`.
 * `sub` is the colon-parsed value after `audit`. When a domain is given, a workspace
 * can follow as a second colon segment (`audit:page:my-ws`, matching the same
 * `<sub>:<workspace>` convention `sessions:ls:<ws>` already uses). The bare `audit`
 * (all domains) form has no domain segment to piggyback a workspace onto, so it takes
 * `--workspace:<name>` instead, matching the flag convention used by authoring commands.
 *
 * `--fix` and `--rebuild` are boolean flags, not positional words or colon segments —
 * this fits the existing --flag convention every other command in this codebase already
 * uses (see parseStringFlag/args.js), so no new dispatcher parsing primitive is needed.
 *
 * `--fix --move:<pageId> --to:<index>` is a separate, explicit mode of --fix (not a new
 * top-level flag) — repositioning a single page within its chapter's pageOrder, opt-in
 * only when --move is present. This stays scoped to --fix's existing namespace rather
 * than becoming e.g. a standalone `--reorder` flag, per the original design framing
 * ("fix can also reposition on request") — --move: is required, so plain `--fix` (the
 * ghost-drop/orphan-append flow) can never accidentally trigger a reposition. See
 * runFixMove() in fix.js.
 */
export async function dispatchAudit(sub, args) {
  const jsonFlag = args.includes('--json')
  const fixFlag = args.includes('--fix')
  const rebuildFlag = args.includes('--rebuild')
  const confirmFlag = args.includes('--confirm')
  const moveVal = parseStringFlag(args, 'move')

  const colonIdx = sub.indexOf(':')
  const domain = colonIdx === -1 ? sub : sub.slice(0, colonIdx)
  const wsFromSub = colonIdx === -1 ? '' : sub.slice(colonIdx + 1)
  const wsVal = wsFromSub || parseStringFlag(args, 'workspace')

  if (domain && !DOMAINS[domain]) {
    console.error(r(`✗ Unknown audit domain: ${domain}`))
    console.error(d(`  Try: audit or audit:${Object.keys(DOMAINS).join(' · audit:')}`))
    process.exit(1)
  }

  const ws = resolveWorkspace(wsVal)
  const wsDir = workspacePath(ws)

  if (rebuildFlag) {
    await runRebuild(wsDir, ws, domain || null, { confirm: confirmFlag })
    return
  }

  if (fixFlag && moveVal) {
    if (domain && domain !== 'chapter') {
      console.error(r(`✗ --move is only valid for the 'chapter' domain (pageOrder), not '${domain}'.`))
      process.exit(1)
    }
    const toVal = parseStringFlag(args, 'to')
    if (toVal === '') {
      console.error(r('✗ --move requires a matching --to:<index>, e.g. --move:my-page --to:0'))
      process.exit(1)
    }
    await runFixMove(wsDir, ws, moveVal, Number(toVal))
    return
  }

  if (fixFlag) {
    await runFix(wsDir, ws, domain || null)
    return
  }

  if (moveVal) {
    console.error(r('✗ --move requires --fix, e.g. audit:chapter --fix --move:my-page --to:0'))
    process.exit(1)
  }

  const report = createReport()
  const domainsToRun = domain ? [domain] : Object.keys(DOMAINS)
  for (const name of domainsToRun) {
    await DOMAINS[name](wsDir, report)
  }

  if (jsonFlag) printReportJson(report, ws)
  else printReport(report, ws, domain || null)

  if (report.errorCount > 0) process.exit(1)
}
