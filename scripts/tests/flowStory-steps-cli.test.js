// CLI-integration coverage for `flowkit add:step` / `remove:step` — specifically the guard
// in scripts/authoring/flowStories.js's rewriteSteps() that refuses to rewrite a flowStory
// containing forks (formatStep() has no serialization path for forks, and the steps-array
// regex only matches up to the first "]", so proceeding would silently corrupt the file).
import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'

import { FLOW_STORIES_DIRNAME } from '../helpers/config-filenames.js'
import {
  backupRegistry,
  cleanupWorkspace,
  registerSnapshotForEmergencyRestore,
  restoreRegistry,
  ROOT,
  spawnCLI,
} from './helpers.js'

const WS = 'twsfpsteps'
const NW_FLAGS = ['--lang:ts', '--kit:none']
const FORKED_PLAN_PATH = path.join(ROOT, 'workspaces', WS, FLOW_STORIES_DIRNAME, 'forked-plan.ts')
// F3 needs a fork-free flowStory — the real scaffolded 'onboarding-flow' plan already has
// steps wired for the fork guard tests above, so a second, separate fixture plan is written
// alongside forked-plan.ts to isolate F3's add:step assertion from F1/F2's fork-guard fixture.
const FORKFREE_PLAN_PATH = path.join(ROOT, 'workspaces', WS, FLOW_STORIES_DIRNAME, 'forkfree-plan.ts')

const FORKED_PLAN_SRC = `import { defineFlow } from '@flowkit-core/config'

export default defineFlow({
  id: 'forked-plan',
  name: 'Forked Plan',
  steps: [
    { screenId: 'welcome-screen', on: 'get-started' },
    {
      screenId: 'setup-screen',
      on: 'continue',
      forks: [
        { label: 'Skip setup', steps: [{ screenId: 'ready-screen' }] },
      ],
    },
  ],
})
`

const FORKFREE_PLAN_SRC = `import { defineFlow } from '@flowkit-core/config'

export default defineFlow({
  id: 'forkfree-plan',
  name: 'Forkfree Plan',
  steps: [
    { screenId: 'welcome-screen', on: 'get-started' },
  ],
})
`

describe('Suite F — flowkit add:step / remove:step', () => {
  let snapshot

  before(async () => {
    snapshot = backupRegistry()
    registerSnapshotForEmergencyRestore(snapshot)
    cleanupWorkspace(WS)
    const result = await spawnCLI([`-nw:${WS}`, ...NW_FLAGS])
    assert.equal(result.code, 0, `workspace ${WS} creation failed: ${result.stderr}`)
    // scaffold.js already creates flowStories/ with the demo onboarding-flow/home-flow plans;
    // these two extra fixture plans are added alongside them for the fork-guard tests below.
    fs.mkdirSync(path.dirname(FORKED_PLAN_PATH), { recursive: true })
    fs.writeFileSync(FORKED_PLAN_PATH, FORKED_PLAN_SRC)
    fs.writeFileSync(FORKFREE_PLAN_PATH, FORKFREE_PLAN_SRC)
  })

  after(() => {
    restoreRegistry(snapshot)
    cleanupWorkspace(WS)
  })

  it('F1 — add:step on a flowStory with forks → exit 1, file byte-for-byte untouched', async () => {
    const before = fs.readFileSync(FORKED_PLAN_PATH, 'utf8')
    const result = await spawnCLI([
      'add:step',
      '--flowStory:forked-plan',
      '--page:ready-screen',
      `--workspace:${WS}`,
    ])
    assert.notEqual(result.code, 0)
    assert.match(result.stderr, /has forks/)
    const after = fs.readFileSync(FORKED_PLAN_PATH, 'utf8')
    assert.equal(after, before, 'flowStory file must be untouched when the fork guard fires')
  })

  it('F2 — remove:step on a flowStory with forks → exit 1, file byte-for-byte untouched', async () => {
    const before = fs.readFileSync(FORKED_PLAN_PATH, 'utf8')
    const result = await spawnCLI([
      'remove:step',
      '--flowStory:forked-plan',
      '--index:0',
      `--workspace:${WS}`,
    ])
    assert.notEqual(result.code, 0)
    assert.match(result.stderr, /has forks/)
    const after = fs.readFileSync(FORKED_PLAN_PATH, 'utf8')
    assert.equal(after, before, 'flowStory file must be untouched when the fork guard fires')
  })

  it('F3 — add:step on a fork-free flowStory still succeeds', async () => {
    const result = await spawnCLI([
      'add:step',
      '--flowStory:forkfree-plan',
      '--page:ready-screen',
      '--action:test step',
      `--workspace:${WS}`,
    ])
    assert.equal(result.code, 0, `stderr: ${result.stderr}`)
    assert.match(result.stdout, /Step added/)
  })
})
