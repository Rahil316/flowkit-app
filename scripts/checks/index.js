// flowkit check / check:<domain> — the CLI-facing entry point for this directory's rule
// modules. Kept self-contained here (not scripts/platform/) so the whole check feature —
// rules + reporter + parser + dispatcher — lives in one directory: easy to review, extend,
// or fully remove as a single unit.
import { workspacePath } from '../helpers/paths.js'
import { resolveWorkspaceLoose as resolveWorkspace } from '../helpers/workspace-resolve.js'
import { parseStringFlag } from '../helpers/args.js'
import { createReport, printReport, printReportJson } from './reporter.js'
import { checkPages } from './pages.js'
import { checkConfig } from './config.js'
import { checkComponents } from './components.js'
import { checkDb } from './db.js'
import { checkFlowStories } from './flowStories.js'
import { r, d } from '../helpers/colors.js'

// Each fn takes (wsDir, report) and may be sync or async — awaited uniformly below.
const DOMAINS = {
  pages: checkPages,
  config: checkConfig,
  components: checkComponents,
  db: checkDb,
  flowStories: checkFlowStories,
}

/**
 * Entry point called from scripts/flowkit.js for `check` / `check:<domain>`.
 * `sub` is the colon-parsed value after `check`. When a domain is given, a workspace
 * can follow as a second colon segment (`check:screens:my-ws`, matching the same
 * `<sub>:<workspace>` convention `sessions:ls:<ws>` already uses). The bare `check`
 * (all domains) form has no domain segment to piggyback a workspace onto, so it takes
 * `--workspace:<name>` instead, matching the flag convention used by authoring commands.
 */
export async function dispatchCheck(sub, args) {
  const jsonFlag = args.includes('--json')
  const colonIdx = sub.indexOf(':')
  const domain = colonIdx === -1 ? sub : sub.slice(0, colonIdx)
  const wsFromSub = colonIdx === -1 ? '' : sub.slice(colonIdx + 1)
  const wsVal = wsFromSub || parseStringFlag(args, 'workspace')

  if (domain && !DOMAINS[domain]) {
    console.error(r(`✗ Unknown check domain: ${domain}`))
    console.error(d(`  Try: check or check:${Object.keys(DOMAINS).join(' · check:')}`))
    process.exit(1)
  }

  const ws = resolveWorkspace(wsVal)
  const wsDir = workspacePath(ws)

  const report = createReport()
  const domainsToRun = domain ? [domain] : Object.keys(DOMAINS)
  for (const name of domainsToRun) {
    await DOMAINS[name](wsDir, report)
  }

  if (jsonFlag) printReportJson(report, ws)
  else printReport(report, ws, domain || null)

  if (report.errorCount > 0) process.exit(1)
}
