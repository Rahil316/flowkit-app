import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { workspaceScaffold } from '../helpers/scaffold.js'
import { gameDemoScaffold } from '../helpers/game-demo-scaffold.js'
import { FLOW_BOOK_DIRNAME } from '../helpers/config-filenames.js'

// scripts/helpers/scaffold.js (repo mode) and scripts/helpers/workspace-template.js
// (the one shared source used by create-flowkit-app, create-flowkit-workspace, and
// this repo's own `flowkit create:workspace` command) both generate their demo
// content by calling scripts/helpers/game-demo-scaffold.js's gameDemoScaffold()
// directly rather than hand-porting it — so parity between the two call sites is
// now structurally guaranteed by shared code, not by convention. What this test
// guards against instead: scaffold.js silently stops calling gameDemoScaffold()
// (e.g. reverting to a hand-rolled demo, or wiring only for --empty).

describe('Suite N — scaffold.js demo-content parity with the shared game-demo module', () => {
  it('N1 — scaffold.js emits the same demo flow ids as gameDemoScaffold()', () => {
    const files = workspaceScaffold('demo')
    const flowIds = new Set(
      Object.keys(files)
        .filter(p => p.startsWith(`${FLOW_BOOK_DIRNAME}/`) && p.endsWith('.tsx'))
        .map(p => p.split('/')[1])
    )

    const sharedFiles = gameDemoScaffold('demo')
    const sharedFlowIds = new Set(
      Object.keys(sharedFiles)
        .filter(p => p.startsWith(`${FLOW_BOOK_DIRNAME}/`) && p.endsWith('.tsx'))
        .map(p => p.split('/')[1])
    )

    assert.deepEqual(
      [...flowIds].sort(),
      [...sharedFlowIds].sort(),
      'scaffold.js demo flow ids diverged from gameDemoScaffold() — scaffold.js may no longer be calling it'
    )
  })

  it('N2 — scaffold.js emits the same demo screen files as gameDemoScaffold()', () => {
    const files = workspaceScaffold('demo')
    const screenPaths = new Set(
      Object.keys(files).filter(p => p.startsWith(`${FLOW_BOOK_DIRNAME}/`) && p.endsWith('.tsx'))
    )

    const sharedFiles = gameDemoScaffold('demo')
    const sharedScreenPaths = new Set(
      Object.keys(sharedFiles).filter(
        p => p.startsWith(`${FLOW_BOOK_DIRNAME}/`) && p.endsWith('.tsx')
      )
    )

    assert.deepEqual(
      [...screenPaths].sort(),
      [...sharedScreenPaths].sort(),
      'scaffold.js demo screen files diverged from gameDemoScaffold() — scaffold.js may no longer be calling it'
    )
  })
})
