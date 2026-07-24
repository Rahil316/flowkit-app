#!/usr/bin/env node
// Dev tooling: mechanical setup for the repeatable Agent-DX study
// (.claude/skills/agent-dx-study/). Scaffolds a fresh flat-mode consumer
// project via create-flowkit-app --local-dev, verifies it boots correctly,
// and hands back the paths + monorepo commit the skill needs to run a study
// round and write its numbered report. Never overwrites a prior run — each
// invocation gets the next free `temp-test[-NN]` dir and matching
// `temp-docs/agent-dx-study-<NN>.md` report number.
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { fileURLToPath } from 'url'
import { g, r, b, d, c } from '../helpers/colors.js'
import { WORKSPACE_CONFIG_FILENAME } from '../helpers/config-filenames.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.resolve(__dirname, '../..')
const TEMP_DOCS_DIR = path.join(ROOT, 'temp-docs')

function parseStringFlag(argv, name) {
  const hit = argv.find(a => a.startsWith(`--${name}:`))
  return hit ? hit.slice(name.length + 3) : null
}

const args = process.argv.slice(2)
const label = parseStringFlag(args, 'name')

// ── 1. Find the next free scaffold dir + matching report number ─────────────
// temp-test, temp-test-02, temp-test-03, ... paired 1:1 with
// temp-docs/agent-dx-study-01.md, -02.md, ... — run N always uses report
// number N, so the two numbering schemes never drift apart.

// A scaffold dir only counts as "usable" if it actually has scaffolded
// content — an empty or partially-cleaned-out directory (e.g. node_modules
// wiped but the folder left behind) must not be mistaken for a valid reuse
// candidate, or the precondition check below fails confusingly instead of
// this function just scaffolding fresh into it.
function isUsableScaffold(dir) {
  return (
    fs.existsSync(path.join(dir, 'package.json')) &&
    fs.existsSync(path.join(dir, WORKSPACE_CONFIG_FILENAME))
  )
}

function nextRun() {
  let n = 1
  for (;;) {
    const dirName = n === 1 ? 'temp-test' : `temp-test-${String(n).padStart(2, '0')}`
    const scaffoldDir = path.join(ROOT, dirName)
    const reportPath = path.join(TEMP_DOCS_DIR, `agent-dx-study-${String(n).padStart(2, '0')}.md`)
    const dirExists = fs.existsSync(scaffoldDir)
    const usable = dirExists && isUsableScaffold(scaffoldDir)
    const reportExists = fs.existsSync(reportPath)
    // A run is "taken" if a report already exists for it — that means this
    // number was already used for a completed study, even if its scaffold
    // was later cleaned up manually.
    if (reportExists) {
      n++
      continue
    }
    if (!dirExists) {
      return { n, scaffoldDir, dirName, reportPath }
    }
    if (usable) {
      // Existing, content-bearing scaffold with no report yet — reuse it
      // rather than orphaning it or skipping to the next number.
      return { n, scaffoldDir, dirName, reportPath, reuseExisting: true }
    }
    // Directory exists but is empty/stale (e.g. node_modules wiped, or a
    // failed partial scaffold) — clear it and scaffold fresh into the same
    // slot rather than skipping to the next number, since nothing of value
    // is being discarded.
    console.log(
      d(`  ${dirName}/ exists but has no usable scaffold content — clearing and rescaffolding.`)
    )
    fs.rmSync(scaffoldDir, { recursive: true, force: true })
    return { n, scaffoldDir, dirName, reportPath }
  }
}

const run = nextRun()

// ── 2. Scaffold (or reuse) ───────────────────────────────────────────────────

function verifyScaffold(dir) {
  const binPath = path.join(dir, 'node_modules', '.bin', 'flowkit')
  if (!fs.existsSync(binPath)) {
    return {
      ok: false,
      reason: `flowkit bin not found at ${binPath} — dependencies not installed?`,
    }
  }
  let helpOutput
  try {
    helpOutput = execSync(`"${binPath}" help`, { cwd: dir, encoding: 'utf8' })
  } catch (e) {
    return { ok: false, reason: `flowkit help exited non-zero: ${e.message}` }
  }
  if (!helpOutput.includes('Mode: consumer')) {
    return {
      ok: false,
      reason: `flowkit help did not report "Mode: consumer" — mode detection may be broken. Output:\n${helpOutput}`,
    }
  }
  return { ok: true }
}

if (run.reuseExisting) {
  console.log(d(`Reusing existing scaffold: ${run.dirName}/ (no report written for it yet)`))
} else {
  console.log(b(`Scaffolding fresh flat-mode project: ${run.dirName}/`))
  const nameFlag = label ? ` (label: ${label})` : ''
  console.log(d(`  via create-flowkit-app --local-dev${nameFlag}`))
  try {
    execSync(
      `FLOWKIT_LOCAL_DEV=1 node "${path.join(ROOT, 'packages/create-flowkit-app/index.js')}" ${run.dirName}`,
      { cwd: ROOT, stdio: 'inherit' }
    )
  } catch (e) {
    console.error(r(`✗ Scaffold failed: ${e.message}`))
    process.exit(1)
  }
}

// ── 3. Precondition checks — fail loudly, never let a broken scaffold ───────
//    silently become a confusing study result.

console.log(d('Verifying scaffold preconditions...'))
const check = verifyScaffold(run.scaffoldDir)
if (!check.ok) {
  console.error(r(`✗ Precondition check failed: ${check.reason}`))
  console.error(
    d('  The study cannot proceed against a broken scaffold. Fix the scaffold or delete')
  )
  console.error(d(`  ${run.dirName}/ and re-run this script to scaffold fresh.`))
  process.exit(1)
}
console.log(g('✓') + ' Scaffold verified: flowkit bin works, mode detection correct')

// ── 4. Record monorepo commit + run metadata for the report's header ────────

let commitHash = 'unknown'
try {
  commitHash = execSync('git rev-parse HEAD', { cwd: ROOT, encoding: 'utf8' }).trim()
} catch {
  // Not fatal — report will just say "unknown", still runnable outside git.
}

const meta = {
  runNumber: run.n,
  label: label ?? null,
  scaffoldDir: run.dirName,
  reportPath: path.relative(ROOT, run.reportPath),
  monorepoCommit: commitHash,
  scaffoldedAt: new Date().toISOString(),
}
fs.writeFileSync(
  path.join(run.scaffoldDir, '.study-meta.json'),
  JSON.stringify(meta, null, 2) + '\n'
)

// ── 5. Report back to the invoking skill ─────────────────────────────────────

console.log('')
console.log(b('Ready for study run ' + run.n + '.'))
console.log(c('Scaffold dir: ') + run.scaffoldDir)
console.log(c('Report path:  ') + run.reportPath)
console.log(c('Monorepo commit: ') + commitHash)
console.log('')
console.log(
  d(
    'Next: spawn the sub-agent against the scaffold dir above, per .claude/skills/agent-dx-study/SKILL.md.'
  )
)
