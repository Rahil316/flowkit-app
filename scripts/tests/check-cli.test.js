// CLI-integration coverage for `flowkit check` / `check:<domain>` — the dispatcher at
// scripts/checks/index.js, exercised end-to-end via the real CLI entry point against a
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
import { FLOW_STORIES_DIRNAME } from '../helpers/config-filenames.js'

const WS = 'twscheck'
const NW_FLAGS = ['--lang:ts', '--kit:none']

describe('Suite C — flowkit check', () => {
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

  it('C1 — check on a freshly scaffolded workspace → exit 0, "all clean"', async () => {
    const result = await spawnCLI(['check', `--workspace:${WS}`])
    assert.equal(result.code, 0, `stderr: ${result.stderr}`)
    assert.match(result.stdout, /all clean/)
  })

  it('C2 — check:pages/check:config/check:components/check:db/check:flowStories each run only their own domain', async () => {
    for (const domain of ['pages', 'config', 'components', 'db', 'flowStories']) {
      const result = await spawnCLI([`check:${domain}:${WS}`])
      assert.equal(result.code, 0, `${domain} — stderr: ${result.stderr}`)
      assert.match(result.stdout, new RegExp(`check:${domain}`), `${domain} — heading missing`)
    }
  })

  it('C3 — check:<unknown-domain> → exit 1, lists valid domains', async () => {
    const result = await spawnCLI([`check:bogus:${WS}`])
    assert.notEqual(result.code, 0)
    assert.match(result.stderr, /Unknown check domain/)
  })

  it('C4 — check --json → valid JSON matching printReportJson shape', async () => {
    const result = await spawnCLI(['check', `--workspace:${WS}`, '--json'])
    assert.equal(result.code, 0, `stderr: ${result.stderr}`)
    const parsed = JSON.parse(result.stdout)
    assert.equal(parsed.workspace, WS)
    assert.equal(parsed.errors, 0)
    assert.deepEqual(parsed.results, [])
  })

  it('C5 — check:flowStories catches a step referencing a nonexistent pageId → exit 1', async () => {
    const fpPath = path.join(ROOT, 'workspaces', WS, FLOW_STORIES_DIRNAME, 'home-flow.ts')
    const original = fs.readFileSync(fpPath, 'utf8')
    try {
      const broken = original.replace(
        /pageId: 'home-flow-home-screen'/,
        "pageId: 'nonexistent-screen'"
      )
      assert.notEqual(broken, original, 'fixture setup failed — pattern not found in home-flow.ts')
      fs.writeFileSync(fpPath, broken)

      const result = await spawnCLI([`check:flowStories:${WS}`])
      assert.notEqual(result.code, 0)
      assert.match(result.stdout, /flowStory\/invalid-page/)
    } finally {
      fs.writeFileSync(fpPath, original)
    }
  })

  it('C6 — check:flowStories flags an existing-but-empty flowStories/ dir → exit 1', async () => {
    const fpDir = path.join(ROOT, 'workspaces', WS, FLOW_STORIES_DIRNAME)
    const backupDir = path.join(ROOT, 'workspaces', WS, `${FLOW_STORIES_DIRNAME}.bak`)
    fs.renameSync(fpDir, backupDir)
    fs.mkdirSync(fpDir)
    try {
      const result = await spawnCLI([`check:flowStories:${WS}`])
      assert.notEqual(result.code, 0)
      assert.match(result.stdout, /flowStory\/empty-workspace/)
    } finally {
      fs.rmSync(fpDir, { recursive: true, force: true })
      fs.renameSync(backupDir, fpDir)
    }
  })

  it('C7 — plan:check / fp:check are fully removed → "Unknown" error', async () => {
    for (const cmd of ['plan:check', 'fp:check']) {
      const result = await spawnCLI([cmd])
      assert.notEqual(result.code, 0)
      assert.match(result.stderr, /Unknown/)
    }
  })
})
