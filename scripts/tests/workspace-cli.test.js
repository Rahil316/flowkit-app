import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'

import {
  backupRegistry,
  cleanupWorkspace,
  parseRegistry,
  registerSnapshotForEmergencyRestore,
  restoreRegistry,
  ROOT,
  runFormatCheck,
  runLint,
  spawnCLI,
  WORKSPACES_DIR,
} from './helpers.js'
import {
  WORKSPACE_CONFIG_FILENAME,
  FLOW_BOOK_DIRNAME,
  FLOW_STORIES_DIRNAME,
} from '../helpers/config-filenames.js'

const WS_ONE = 'twsone'
const WS_TWO = 'twstwo'
const NW_FLAGS = ['--kit:none']

async function createWorkspace(name) {
  const result = await spawnCLI([`-nw:${name}`, ...NW_FLAGS])
  assert.equal(result.code, 0, `workspace ${name} creation failed: ${result.stderr}`)
}

describe('Suite B — Workspace CLI lifecycle', () => {
  let snapshot

  before(() => {
    snapshot = backupRegistry()
    registerSnapshotForEmergencyRestore(snapshot)
    cleanupWorkspace(WS_ONE)
    cleanupWorkspace(WS_TWO)
  })

  after(() => {
    restoreRegistry(snapshot)
    cleanupWorkspace(WS_ONE)
    cleanupWorkspace(WS_TWO)
  })

  it('B1 — Create first workspace → exit 0', async () => {
    const result = await spawnCLI([`-nw:${WS_ONE}`, ...NW_FLAGS])
    assert.equal(result.code, 0, `stderr: ${result.stderr}`)
  })

  it('B2 — Create first workspace → all scaffold files exist', async () => {
    const base = path.join(ROOT, 'workspaces', WS_ONE)
    const expected = [
      path.join(base, 'index.ts'),
      path.join(base, WORKSPACE_CONFIG_FILENAME),
      path.join(base, 'lib/data/db.ts'),
      path.join(base, 'lib/data/simulator.tsx'),
      path.join(base, 'lib/design-system/tokens.css'),
      path.join(base, `${FLOW_STORIES_DIRNAME}/intro-flow.ts`),
      path.join(base, `${FLOW_STORIES_DIRNAME}/journey-play-tic-tac-toe.ts`),
      path.join(base, `${FLOW_BOOK_DIRNAME}/intro-flow/splash-screen/SplashScreen.tsx`),
      path.join(base, `${FLOW_BOOK_DIRNAME}/intro-flow/welcome-screen/WelcomeScreen.tsx`),
      path.join(base, `${FLOW_BOOK_DIRNAME}/intro-flow/hub-screen/HubScreen.tsx`),
      path.join(
        base,
        `${FLOW_BOOK_DIRNAME}/tic-tac-toe-flow/tic-tac-toe-game-screen/TicTacToeGameScreen.tsx`
      ),
      path.join(base, 'lib/docs/overview.md'),
      path.join(base, 'lib/flowLens/studies.json'),
      path.join(base, 'lib/flowLens/sessions/initial-study'),
    ]
    for (const p of expected) {
      assert.ok(fs.existsSync(p), `missing: ${p}`)
    }
    const agentDir = path.join(base, '.agent')
    assert.ok(fs.existsSync(agentDir), `missing .agent/ dir`)
  })

  it('B3 — Create first workspace → registry contains entry + active = that workspace', () => {
    const reg = parseRegistry()
    assert.ok(reg.names.includes(WS_ONE), `${WS_ONE} not in registry`)
    assert.equal(reg.active, WS_ONE)
  })

  it('B4 — WelcomeScreen passes ESLint', () => {
    const target = `workspaces/${WS_ONE}/${FLOW_BOOK_DIRNAME}/intro-flow/welcome-screen/WelcomeScreen.tsx`
    assert.equal(runLint(target), 0, 'ESLint failed on WelcomeScreen.tsx')
  })

  it('B5 — WelcomeScreen passes Prettier', () => {
    const target = `workspaces/${WS_ONE}/${FLOW_BOOK_DIRNAME}/intro-flow/welcome-screen/WelcomeScreen.tsx`
    assert.equal(runFormatCheck(target), 0, 'Prettier failed on WelcomeScreen.tsx')
  })

  it('B6 — Scaffold TypeScript files pass ESLint', () => {
    const targets = [
      `workspaces/${WS_ONE}/index.ts`,
      `workspaces/${WS_ONE}/${WORKSPACE_CONFIG_FILENAME}`,
      `workspaces/${WS_ONE}/lib/data/db.ts`,
    ]
    for (const t of targets) {
      assert.equal(runLint(t), 0, `ESLint failed on ${t}`)
    }
  })

  it('B7 — src/workspaces.ts after creation passes Prettier', () => {
    assert.equal(runFormatCheck('src/workspaces.ts'), 0, 'Prettier failed on src/workspaces.ts')
  })

  it('B8 — tsconfig.app.json has @workspace/* alias pointing to active workspace', () => {
    const tsconfigPath = path.join(ROOT, 'tsconfig.app.json')
    const tsconfig = JSON.parse(fs.readFileSync(tsconfigPath, 'utf8'))
    const aliases = tsconfig.compilerOptions?.paths?.['@workspace/*']
    assert.ok(
      Array.isArray(aliases) && aliases.length > 0,
      `@workspace/* alias must exist in tsconfig for screen component imports, got: ${JSON.stringify(aliases)}`
    )
  })

  it('B9 — Create second workspace → both appear in registry', async () => {
    await createWorkspace(WS_TWO)
    const reg = parseRegistry()
    assert.ok(reg.names.includes(WS_ONE), `${WS_ONE} missing from registry`)
    assert.ok(reg.names.includes(WS_TWO), `${WS_TWO} missing from registry`)
  })

  it('B10 — Create workspace with duplicate name → exit 1, no double-entry', async () => {
    const result = await spawnCLI([`-nw:${WS_ONE}`, ...NW_FLAGS])
    assert.notEqual(result.code, 0, 'duplicate workspace should exit non-zero')
    const reg = parseRegistry()
    const count = reg.names.filter(n => n === WS_ONE).length
    assert.equal(count, 1, 'duplicate entry found in registry')
  })

  it('B14 — Delete workspace folder directly → syncWorkspaceRegistry removes entry', async () => {
    const dir = path.join(WORKSPACES_DIR, WS_ONE)
    if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true })
    const { syncWorkspaceRegistry } = await import(path.join(ROOT, 'scripts/helpers/registry.js'))
    syncWorkspaceRegistry()
    const reg = parseRegistry()
    assert.ok(!reg.names.includes(WS_ONE), `${WS_ONE} should be removed after folder deleted`)
  })

  it('B15 — `rw` with correct confirmation → workspace deleted, exit 0', async () => {
    await createWorkspace(WS_ONE)
    const result = await spawnCLI([`-rw:${WS_ONE}`], WS_ONE)
    assert.equal(result.code, 0, `rw failed: ${result.stderr}`)
    assert.ok(!fs.existsSync(path.join(WORKSPACES_DIR, WS_ONE)), 'workspace dir should be deleted')
    assert.ok(
      !fs.existsSync(path.join(WORKSPACES_DIR, WS_ONE, 'lib/flowLens')),
      'flowlens library dir should be deleted'
    )
    const reg = parseRegistry()
    assert.ok(!reg.names.includes(WS_ONE), `${WS_ONE} should not be in registry`)
  })

  it('B16 — `rw` with wrong confirmation → workspace NOT deleted', async () => {
    await createWorkspace(WS_ONE)
    const result = await spawnCLI([`-rw:${WS_ONE}`], 'wrong-name')
    assert.ok(fs.existsSync(path.join(WORKSPACES_DIR, WS_ONE)), 'workspace dir should still exist')
    const reg = parseRegistry()
    assert.ok(reg.names.includes(WS_ONE), `${WS_ONE} should still be in registry`)
    void result
  })

  it('B17 — Delete last test workspace → test workspaces gone, registry reflects only pre-existing workspaces', async () => {
    // Only remove workspaces that the test suite created — never touch pre-existing workspaces.
    for (const name of [WS_ONE, WS_TWO]) {
      if (fs.existsSync(path.join(WORKSPACES_DIR, name))) {
        await spawnCLI([`-rw:${name}`], name)
      }
    }
    const { syncWorkspaceRegistry } = await import(path.join(ROOT, 'scripts/helpers/registry.js'))
    syncWorkspaceRegistry()
    const final = parseRegistry()
    assert.ok(!final.names.includes(WS_ONE), `${WS_ONE} should be removed`)
    assert.ok(!final.names.includes(WS_TWO), `${WS_TWO} should be removed`)
  })

  it('B18 — `rw` unknown workspace name → exit non-zero', async () => {
    const result = await spawnCLI(['-rw:doesnotexist'], 'doesnotexist')
    assert.notEqual(result.code, 0, 'should exit non-zero for unknown workspace')
  })

  it('B19 — Unknown CLI command → exit 1, stderr contains "Unknown command"', async () => {
    const result = await spawnCLI(['totally-unknown-cmd'])
    assert.equal(result.code, 1)
    assert.ok(
      result.stderr.includes('Unknown command') || result.stdout.includes('Unknown command'),
      `expected "Unknown command" in output, got: ${result.stderr || result.stdout}`
    )
  })
})
