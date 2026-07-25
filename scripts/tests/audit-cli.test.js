// CLI-integration coverage for `flowkit audit` / `audit:<domain>` — the dispatcher at
// scripts/audits/index.js, exercised end-to-end via the real CLI entry point against a
// freshly scaffolded, disposable repo-mode workspace.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'

import {
  backupRegistry,
  cleanupWorkspace,
  registerSnapshotForEmergencyRestore,
  restoreRegistry,
  ROOT,
  spawnCLI,
} from './helpers.js'
import { FLOW_STORIES_DIRNAME, FLOW_BOOK_DIRNAME } from '../helpers/config-filenames.js'

const WS = 'twsaudit'
const NW_FLAGS = ['--kit:none']

describe('Suite C — flowkit audit', () => {
  let snapshot

  before(async () => {
    snapshot = backupRegistry()
    registerSnapshotForEmergencyRestore(snapshot)
    cleanupWorkspace(WS)
    const result = await spawnCLI([`-nw:${WS}`, ...NW_FLAGS])
    assert.equal(result.code, 0, `workspace ${WS} creation failed: ${result.stderr}`)
  })

  after(() => {
    restoreRegistry(snapshot)
    cleanupWorkspace(WS)
  })

  it('C1 — audit on a freshly scaffolded workspace → exit 0, zero errors', async () => {
    // The game-demo scaffold pre-registers every lib/components/ui/*.tsx file in
    // .flowkit/components.json (see game-demo-scaffold.js), so page/chapter/book/
    // story/components/db all report clean. navigations/unreachable-page is the one
    // expected finding: math-quiz-difficulty-screen is only reachable via HubScreen's
    // dynamic navigateTo(game.pageId) call, which the tool correctly can't trace
    // statically (see the accompanying "dynamic navigateTo() call site" notice) —
    // this is a real, known gap in the demo content's static reachability, not a
    // test-fixture bug. Exit 0 confirms it's a warning, not an error.
    const result = await spawnCLI(['audit', `--workspace:${WS}`])
    assert.equal(result.code, 0, `stderr: ${result.stderr}`)
    assert.match(result.stdout, /navigations\/unreachable-page/)
    assert.match(result.stdout, /1 warning/)
    assert.match(result.stdout, /1 dynamic navigateTo\(\) call site/)
  })

  it('C2 — audit:page/audit:chapter/audit:book/audit:story/audit:navigations/audit:components/audit:db each run only their own domain', async () => {
    for (const domain of ['page', 'chapter', 'book', 'story', 'navigations', 'components', 'db']) {
      const result = await spawnCLI([`audit:${domain}:${WS}`])
      assert.equal(result.code, 0, `${domain} — stderr: ${result.stderr}`)
      assert.match(result.stdout, new RegExp(`audit:${domain}`), `${domain} — heading missing`)
    }
  })

  it('C3 — audit:<unknown-domain> → exit 1, lists valid domains', async () => {
    const result = await spawnCLI([`audit:bogus:${WS}`])
    assert.notEqual(result.code, 0)
    assert.match(result.stderr, /Unknown audit domain/)
  })

  it('C4 — audit --json → valid JSON matching printReportJson shape', async () => {
    const result = await spawnCLI(['audit', `--workspace:${WS}`, '--json'])
    assert.equal(result.code, 0, `stderr: ${result.stderr}`)
    const parsed = JSON.parse(result.stdout)
    assert.equal(parsed.workspace, WS)
    assert.equal(parsed.errors, 0)
    // Exactly the one expected navigations/unreachable-page warning — see C1.
    assert.equal(parsed.results.length, 1)
    assert.equal(parsed.results[0].ruleId, 'navigations/unreachable-page')
    assert.equal(parsed.dynamicNavCallSites, 1)
  })

  it('C5 — audit:story catches a step referencing a nonexistent pageId → exit 1', async () => {
    const fpPath = path.join(ROOT, 'workspaces', WS, FLOW_STORIES_DIRNAME, 'intro-flow.ts')
    const original = fs.readFileSync(fpPath, 'utf8')
    try {
      const broken = original.replace(
        /pageId: 'intro-flow-splash-screen'/,
        "pageId: 'nonexistent-screen'"
      )
      assert.notEqual(broken, original, 'fixture setup failed — pattern not found in intro-flow.ts')
      fs.writeFileSync(fpPath, broken)

      const result = await spawnCLI([`audit:story:${WS}`])
      assert.notEqual(result.code, 0)
      assert.match(result.stdout, /story\/invalid-page/)
    } finally {
      fs.writeFileSync(fpPath, original)
    }
  })

  it('C6 — audit:story flags an existing-but-empty flowStories/ dir → exit 1', async () => {
    const fpDir = path.join(ROOT, 'workspaces', WS, FLOW_STORIES_DIRNAME)
    const backupDir = path.join(ROOT, 'workspaces', WS, `${FLOW_STORIES_DIRNAME}.bak`)
    fs.renameSync(fpDir, backupDir)
    fs.mkdirSync(fpDir)
    try {
      const result = await spawnCLI([`audit:story:${WS}`])
      assert.notEqual(result.code, 0)
      assert.match(result.stdout, /story\/empty-workspace/)
    } finally {
      fs.rmSync(fpDir, { recursive: true, force: true })
      fs.renameSync(backupDir, fpDir)
    }
  })

  it('C7 — check / check:pages / plan:check / fp:check are all fully removed → "Unknown" error', async () => {
    for (const cmd of ['check', 'check:pages', 'plan:check', 'fp:check']) {
      const result = await spawnCLI([cmd])
      assert.notEqual(result.code, 0)
      assert.match(result.stderr, /Unknown/)
    }
  })

  it('C8 — audit:chapter --fix drops a ghost pageOrder entry and appends an orphaned disk directory', async () => {
    const wsDir = path.join(ROOT, 'workspaces', WS)
    const manifestPath = path.join(wsDir, 'manifest.ts')
    const original = fs.readFileSync(manifestPath, 'utf8')
    const orphanDir = path.join(wsDir, FLOW_BOOK_DIRNAME, 'intro-flow', 'ghost-orphan-screen')
    try {
      // Introduce a ghost entry: reference a page id in pageOrder that has no folder.
      const withGhost = original.replace(
        "'intro-flow': [",
        "'intro-flow': [\n      'ghost-screen-that-does-not-exist',"
      )
      assert.notEqual(
        withGhost,
        original,
        'fixture setup failed — intro-flow pageOrder pattern not found'
      )
      fs.writeFileSync(manifestPath, withGhost)

      // Introduce an orphan: a real page folder on disk with no pageOrder entry.
      fs.mkdirSync(orphanDir, { recursive: true })
      fs.writeFileSync(
        path.join(orphanDir, 'GhostOrphanScreen.tsx'),
        `export default function GhostOrphanScreen() { return null }\nexport const pageMeta = { label: 'Ghost Orphan' }\n`
      )

      const before = await spawnCLI([`audit:chapter:${WS}`])
      assert.match(before.stdout, /chapter\/orphaned-id/)
      assert.match(before.stdout, /chapter\/orphaned-dir/)

      const fixResult = await spawnCLI([`audit:chapter:${WS}`, '--fix'])
      assert.equal(fixResult.code, 0, `stderr: ${fixResult.stderr}`)

      const after = await spawnCLI([`audit:chapter:${WS}`])
      assert.equal(after.code, 0, `stderr after fix: ${after.stderr}`)
      assert.doesNotMatch(after.stdout, /chapter\/orphaned-id/)
      assert.doesNotMatch(after.stdout, /chapter\/orphaned-dir/)

      const fixedManifest = fs.readFileSync(manifestPath, 'utf8')
      assert.ok(!fixedManifest.includes('ghost-screen-that-does-not-exist'))
      assert.ok(fixedManifest.includes('ghost-orphan-screen'))
    } finally {
      fs.writeFileSync(manifestPath, original)
      fs.rmSync(orphanDir, { recursive: true, force: true })
    }
  })

  it('C9 — audit:chapter --rebuild without --confirm writes nothing; --rebuild --confirm writes', async () => {
    const wsDir = path.join(ROOT, 'workspaces', WS)
    const manifestPath = path.join(wsDir, 'manifest.ts')
    const original = fs.readFileSync(manifestPath, 'utf8')
    try {
      const preview = await spawnCLI([`audit:chapter:${WS}`, '--rebuild'])
      assert.equal(preview.code, 0, `stderr: ${preview.stderr}`)
      assert.match(preview.stdout, /--rebuild --confirm/)
      const afterPreview = fs.readFileSync(manifestPath, 'utf8')
      assert.equal(
        afterPreview,
        original,
        '--rebuild without --confirm must not write to manifest.ts'
      )

      const confirmed = await spawnCLI([`audit:chapter:${WS}`, '--rebuild', '--confirm'])
      assert.equal(confirmed.code, 0, `stderr: ${confirmed.stderr}`)
      assert.match(confirmed.stdout, /Applied\./)
    } finally {
      fs.writeFileSync(manifestPath, original)
    }
  })

  it('C10 — --fix on a domain with no fixable rules reports "no effect" rather than silently no-op', async () => {
    const result = await spawnCLI([`audit:page:${WS}`, '--fix'])
    assert.equal(result.code, 0, `stderr: ${result.stderr}`)
    assert.match(result.stdout, /--fix has no effect on the 'page' domain/)
  })

  it('C11 — audit:chapter --fix --move:<pageId> --to:<index> repositions a single page, leaving the rest untouched', async () => {
    const wsDir = path.join(ROOT, 'workspaces', WS)
    const manifestPath = path.join(wsDir, 'manifest.ts')
    const original = fs.readFileSync(manifestPath, 'utf8')
    try {
      // Starting order: ['splash-screen', 'welcome-screen', 'hub-screen']. Move
      // 'hub-screen' to index 0 — front of the array, other two shift right by one
      // but keep their relative order.
      const result = await spawnCLI([
        `audit:chapter:${WS}`,
        '--fix',
        '--move:hub-screen',
        '--to:0',
      ])
      assert.equal(result.code, 0, `stderr: ${result.stderr}`)
      assert.match(result.stdout, /Moved 'hub-screen' from index 2 to 0/)

      const manifestSrc = fs.readFileSync(manifestPath, 'utf8')
      const introMatch = manifestSrc.match(/'intro-flow':\s*\[([^\]]*)\]/)
      assert.ok(introMatch, 'intro-flow pageOrder entry not found after move')
      const ids = introMatch[1].match(/'([^']+)'/g).map(s => s.slice(1, -1))
      assert.deepEqual(ids, ['hub-screen', 'splash-screen', 'welcome-screen'])
    } finally {
      fs.writeFileSync(manifestPath, original)
    }
  })

  it('C12 — audit:chapter --fix --move:<pageId> --to:<past-the-end> clamps to append rather than erroring', async () => {
    const wsDir = path.join(ROOT, 'workspaces', WS)
    const manifestPath = path.join(wsDir, 'manifest.ts')
    const original = fs.readFileSync(manifestPath, 'utf8')
    try {
      const result = await spawnCLI([
        `audit:chapter:${WS}`,
        '--fix',
        '--move:splash-screen',
        '--to:999',
      ])
      assert.equal(result.code, 0, `stderr: ${result.stderr}`)
      assert.match(result.stdout, /clamped to append/)

      const manifestSrc = fs.readFileSync(manifestPath, 'utf8')
      const introMatch = manifestSrc.match(/'intro-flow':\s*\[([^\]]*)\]/)
      const ids = introMatch[1].match(/'([^']+)'/g).map(s => s.slice(1, -1))
      assert.deepEqual(ids, ['welcome-screen', 'hub-screen', 'splash-screen'])
    } finally {
      fs.writeFileSync(manifestPath, original)
    }
  })

  it('C13 — audit:chapter --fix --move:<unknown-page> --to:0 errors clearly rather than silently no-op', async () => {
    const result = await spawnCLI([
      `audit:chapter:${WS}`,
      '--fix',
      '--move:this-page-does-not-exist',
      '--to:0',
    ])
    assert.notEqual(result.code, 0)
    assert.match(result.stderr, /was not found in any chapter's pageOrder/)
  })

  it('C14 — --move without --fix errors rather than silently falling through to a plain report', async () => {
    const result = await spawnCLI([`audit:chapter:${WS}`, '--move:hub-screen', '--to:0'])
    assert.notEqual(result.code, 0)
    assert.match(result.stderr, /--move requires --fix/)
  })

  it('C15 — plain --fix (no --move) never repositions existing entries', async () => {
    const wsDir = path.join(ROOT, 'workspaces', WS)
    const manifestPath = path.join(wsDir, 'manifest.ts')
    const original = fs.readFileSync(manifestPath, 'utf8')
    try {
      const result = await spawnCLI([`audit:chapter:${WS}`, '--fix'])
      assert.equal(result.code, 0, `stderr: ${result.stderr}`)
      const manifestSrc = fs.readFileSync(manifestPath, 'utf8')
      const introMatch = manifestSrc.match(/'intro-flow':\s*\[([^\]]*)\]/)
      const ids = introMatch[1].match(/'([^']+)'/g).map(s => s.slice(1, -1))
      assert.deepEqual(ids, ['splash-screen', 'welcome-screen', 'hub-screen'])
    } finally {
      fs.writeFileSync(manifestPath, original)
    }
  })
})
