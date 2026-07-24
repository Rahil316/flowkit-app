// Unit coverage for scripts/checks/*.js rule modules — pure functions given a wsDir and a
// report, exercised directly against small on-disk fixtures (no CLI spawn needed). One
// deliberately-broken case per rule family, plus a clean case proving no false positives.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, before, describe, it } from 'node:test'

import { createReport } from '../checks/reporter.js'
import { checkPages } from '../checks/pages.js'
import { checkDb } from '../checks/db.js'
import { checkFlowStories } from '../checks/flowStories.js'
import { checkConfig } from '../checks/config.js'
import { checkComponents } from '../checks/components.js'
import { FLOW_BOOK_DIRNAME, FLOW_STORIES_DIRNAME } from '../helpers/config-filenames.js'
import { makePageId, parseVariant } from '../../src/shared/utils/pagePathIdentity.js'

let wsDir

function ruleIds(report) {
  return report.findings.map(f => f.ruleId)
}

function write(relPath, content) {
  const full = path.join(wsDir, relPath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content)
}

describe('Suite D — scripts/checks/*.js rule modules', () => {
  before(() => {
    wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowkit-check-rules-'))
  })

  after(() => {
    fs.rmSync(wsDir, { recursive: true, force: true })
  })

  it('D1 — checkPages: clean screen → no findings', () => {
    write(
      `${FLOW_BOOK_DIRNAME}/onboarding/welcome/WelcomeScreen.tsx`,
      `export default function WelcomeScreen() { return null }
export const pageMeta = { label: 'Welcome' }
`
    )
    const report = createReport()
    checkPages(wsDir, report)
    assert.deepEqual(ruleIds(report), [])
  })

  it('D2 — checkPages: missing pageMeta → page/missing-meta', () => {
    write(
      `${FLOW_BOOK_DIRNAME}/onboarding/broken/BrokenScreen.tsx`,
      `export default function BrokenScreen() { return null }
`
    )
    const report = createReport()
    checkPages(wsDir, report)
    assert.ok(ruleIds(report).includes('page/missing-meta'))
  })

  it('D3 — checkPages: no default export → page/no-default-export', () => {
    write(
      `${FLOW_BOOK_DIRNAME}/onboarding/nodefault/NoDefaultScreen.tsx`,
      `export const pageMeta = { label: 'No Default' }
`
    )
    const report = createReport()
    checkPages(wsDir, report)
    assert.ok(ruleIds(report).includes('page/no-default-export'))
  })

  it('D4 — checkDb: has an export → no findings', () => {
    write('lib/data/db.ts', `export const user = { name: 'Test' }\n`)
    const report = createReport()
    checkDb(wsDir, report)
    assert.deepEqual(ruleIds(report), [])
  })

  it('D5 — checkDb: no exports → db/no-exports', () => {
    write('lib/data/db.ts', `// nothing here\n`)
    const report = createReport()
    checkDb(wsDir, report)
    assert.ok(ruleIds(report).includes('db/no-exports'))
  })

  it('D6 — checkFlowStories: step referencing a real screen → no findings', async () => {
    // Reuses the same screen fixture from D1 (flowBook/onboarding/welcome),
    // whose composite id is makePageId('onboarding', 'welcome').
    write(
      `${FLOW_STORIES_DIRNAME}/onboarding.ts`,
      `export default {
  id: 'onboarding',
  name: 'Onboarding',
  steps: [
    { pageId: '${makePageId('onboarding', 'welcome')}', on: 'get-started', actionNote: 'Taps Get Started' },
  ],
}
`
    )
    const report = createReport()
    await checkFlowStories(wsDir, report)
    assert.deepEqual(ruleIds(report), [])
  })

  it('D7 — checkFlowStories: step referencing a nonexistent screen → flowStory/invalid-page', async () => {
    write(
      `${FLOW_STORIES_DIRNAME}/broken.ts`,
      `export default {
  id: 'broken',
  name: 'Broken',
  steps: [
    { pageId: 'does-not-exist', actionNote: 'goes nowhere' },
  ],
}
`
    )
    const report = createReport()
    await checkFlowStories(wsDir, report)
    assert.ok(ruleIds(report).includes('flowStory/invalid-page'))
  })

  it('D8 — checkFlowStories: id/filename mismatch → flowStory/id-filename-mismatch', async () => {
    write(
      `${FLOW_STORIES_DIRNAME}/mismatched.ts`,
      `export default {
  id: 'totally-different-id',
  name: 'Mismatched',
  steps: [{ pageId: '${makePageId('onboarding', 'welcome')}' }],
}
`
    )
    const report = createReport()
    await checkFlowStories(wsDir, report)
    assert.ok(ruleIds(report).includes('flowStory/id-filename-mismatch'))
  })

  it('D9 — checkFlowStories: empty flowStories/ dir → flowStory/empty-workspace', async () => {
    const emptyWs = fs.mkdtempSync(path.join(os.tmpdir(), 'flowkit-check-empty-'))
    fs.mkdirSync(path.join(emptyWs, FLOW_STORIES_DIRNAME))
    try {
      const report = createReport()
      await checkFlowStories(emptyWs, report)
      assert.ok(ruleIds(report).includes('flowStory/empty-workspace'))
    } finally {
      fs.rmSync(emptyWs, { recursive: true, force: true })
    }
  })

  it('D10 — checkFlowStories: no flowStories/ dir at all → no findings (not suspicious)', async () => {
    const noDirWs = fs.mkdtempSync(path.join(os.tmpdir(), 'flowkit-check-nodir-'))
    try {
      const report = createReport()
      await checkFlowStories(noDirWs, report)
      assert.deepEqual(ruleIds(report), [])
    } finally {
      fs.rmSync(noDirWs, { recursive: true, force: true })
    }
  })

  it('D11 — checkConfig: pageOrder references a directory that does not exist → config/orphaned-id', async () => {
    const cfgWs = fs.mkdtempSync(path.join(os.tmpdir(), 'flowkit-check-config-'))
    try {
      fs.writeFileSync(
        path.join(cfgWs, 'workspace.ts'),
        `export default {
  workspace: { name: 'test' },
  chapters: ['onboarding'],
  pageOrder: { onboarding: ['ghost-screen'] },
}
`
      )
      const report = createReport()
      await checkConfig(cfgWs, report)
      assert.ok(ruleIds(report).includes('config/orphaned-id'))
    } finally {
      fs.rmSync(cfgWs, { recursive: true, force: true })
    }
  })

  it('D12 — checkComponents: registered component file missing → components/stale-registry', () => {
    const compWs = fs.mkdtempSync(path.join(os.tmpdir(), 'flowkit-check-components-'))
    try {
      fs.mkdirSync(path.join(compWs, '.flowkit'), { recursive: true })
      fs.writeFileSync(
        path.join(compWs, '.flowkit', 'components.json'),
        JSON.stringify([{ name: 'GhostButton', path: 'lib/components/ui', desc: '' }])
      )
      const report = createReport()
      checkComponents(compWs, report)
      assert.ok(ruleIds(report).includes('components/stale-registry'))
    } finally {
      fs.rmSync(compWs, { recursive: true, force: true })
    }
  })

  it('D13 — checkPages: variable-depth (3+ levels) screen still resolves, cosmetic folder ignored', () => {
    write(
      `${FLOW_BOOK_DIRNAME}/onboarding/cosmetic-group/deepscreen/DeepScreen.tsx`,
      `export default function DeepScreen() { return null }
export const pageMeta = { label: 'Deep', id: '${makePageId('onboarding', 'deepscreen')}' }
`
    )
    const report = createReport()
    checkPages(wsDir, report)
    // No meta-id-mismatch (cosmetic segment correctly ignored for identity) and no other findings for this screen.
    const findingsForDeep = ruleIds(report).filter(id => id.startsWith('page/'))
    assert.ok(
      !findingsForDeep.includes('page/meta-id-mismatch'),
      `expected no id mismatch, got: ${JSON.stringify(ruleIds(report))}`
    )
  })

  it('D14 — checkPages: 0-folder root-level screen resolves to flow "misc"', () => {
    const miscWs = fs.mkdtempSync(path.join(os.tmpdir(), 'flowkit-check-misc-'))
    try {
      fs.mkdirSync(path.join(miscWs, FLOW_BOOK_DIRNAME), { recursive: true })
      fs.writeFileSync(
        path.join(miscWs, FLOW_BOOK_DIRNAME, 'RootScreen.tsx'),
        `export default function RootScreen() { return null }
export const pageMeta = { label: 'Root', id: '${makePageId('misc', 'RootScreen')}' }
`
      )
      const report = createReport()
      checkPages(miscWs, report)
      assert.ok(
        !ruleIds(report).includes('page/meta-id-mismatch'),
        `expected misc-flow id to match, got: ${JSON.stringify(ruleIds(report))}`
      )
    } finally {
      fs.rmSync(miscWs, { recursive: true, force: true })
    }
  })

  it('D15 — checkFlowStories/collectAllScreenIds: same screen folder name under two different flows → distinct composite ids, no collision', async () => {
    const dualWs = fs.mkdtempSync(path.join(os.tmpdir(), 'flowkit-check-dual-'))
    const writeIn = (relPath, content) => {
      const full = path.join(dualWs, relPath)
      fs.mkdirSync(path.dirname(full), { recursive: true })
      fs.writeFileSync(full, content)
    }
    try {
      writeIn(
        `${FLOW_BOOK_DIRNAME}/flowA/confirm/ConfirmScreen.tsx`,
        `export default function ConfirmScreen() { return null }\nexport const pageMeta = { label: 'Confirm A' }\n`
      )
      writeIn(
        `${FLOW_BOOK_DIRNAME}/flowB/confirm/ConfirmScreen.tsx`,
        `export default function ConfirmScreen() { return null }\nexport const pageMeta = { label: 'Confirm B' }\n`
      )
      writeIn(
        `${FLOW_STORIES_DIRNAME}/dual.ts`,
        `export default {
  id: 'dual',
  name: 'Dual',
  steps: [
    { pageId: '${makePageId('flowA', 'confirm')}', actionNote: 'a' },
    { pageId: '${makePageId('flowB', 'confirm')}', actionNote: 'b' },
  ],
}
`
      )
      const report = createReport()
      await checkFlowStories(dualWs, report)
      assert.ok(
        !ruleIds(report).includes('flowStory/invalid-page'),
        `expected both distinct composite ids to resolve, got: ${JSON.stringify(report.findings)}`
      )
    } finally {
      fs.rmSync(dualWs, { recursive: true, force: true })
    }
  })

  it('D16 — checkPages: 2+ unprefixed candidate files → page/ambiguous-folder (warning, acknowledgment required)', () => {
    const ambigWs = fs.mkdtempSync(path.join(os.tmpdir(), 'flowkit-check-ambig-'))
    try {
      const dir = path.join(ambigWs, FLOW_BOOK_DIRNAME, 'onboarding', 'landing')
      fs.mkdirSync(dir, { recursive: true })
      fs.writeFileSync(
        path.join(dir, 'AltScreen.tsx'),
        `export default function AltScreen() { return null }\nexport const pageMeta = { label: 'Alt' }\n`
      )
      fs.writeFileSync(
        path.join(dir, 'MainScreen.tsx'),
        `export default function MainScreen() { return null }\nexport const pageMeta = { label: 'Main' }\n`
      )
      const report = createReport()
      checkPages(ambigWs, report)
      const finding = report.findings.find(f => f.ruleId === 'page/ambiguous-folder')
      assert.ok(finding, `expected page/ambiguous-folder, got: ${JSON.stringify(ruleIds(report))}`)
      assert.equal(finding.severity, 'warning')
      assert.equal(finding.requiresAcknowledgment, true)
    } finally {
      fs.rmSync(ambigWs, { recursive: true, force: true })
    }
  })

  it('D17 — checkPages/checkFlowStories: `__`-prefixed folder fully excluded; single `_`-prefix still checked', async () => {
    const hideWs = fs.mkdtempSync(path.join(os.tmpdir(), 'flowkit-check-hide-'))
    try {
      // `__`-prefixed folder — should be pruned entirely, no findings at all, not even valid ones.
      const goneDir = path.join(hideWs, FLOW_BOOK_DIRNAME, 'onboarding', '__gone')
      fs.mkdirSync(goneDir, { recursive: true })
      fs.writeFileSync(
        path.join(goneDir, 'GoneScreen.tsx'),
        `export default function GoneScreen() { return null }\n// deliberately missing pageMeta — must NOT be reported since the folder is non-existent\n`
      )

      // single `_`-prefixed folder — hidden, but still fully checked (missing pageMeta must fire).
      const hiddenDir = path.join(hideWs, FLOW_BOOK_DIRNAME, 'onboarding', '_hidden')
      fs.mkdirSync(hiddenDir, { recursive: true })
      fs.writeFileSync(
        path.join(hiddenDir, 'HiddenScreen.tsx'),
        `export default function HiddenScreen() { return null }\n// deliberately missing pageMeta — folder is only hidden, not non-existent, so this SHOULD fire\n`
      )

      const report = createReport()
      checkPages(hideWs, report)
      const findingFiles = report.findings.map(f => f.file)
      assert.ok(
        !findingFiles.some(f => f.includes('__gone')),
        `__-prefixed folder must be fully excluded, got findings: ${JSON.stringify(report.findings)}`
      )
      assert.ok(
        findingFiles.some(f => f.includes('_hidden')),
        `single _-prefixed folder must still be checked, got findings: ${JSON.stringify(report.findings)}`
      )
      assert.ok(report.findings.some(f => f.file.includes('_hidden') && f.ruleId === 'page/missing-meta'))

      // Also verify checkFlowStories: a step referencing the __-hidden screen must fail invalid-screen
      // (as if the screen doesn't exist), while one referencing the _-hidden screen must resolve fine.
      fs.mkdirSync(path.join(hideWs, FLOW_STORIES_DIRNAME), { recursive: true })
      fs.writeFileSync(
        path.join(hideWs, FLOW_STORIES_DIRNAME, 'hidetest.ts'),
        `export default {
  id: 'hidetest',
  name: 'Hide Test',
  steps: [
    { pageId: '${makePageId('onboarding', '__gone')}', actionNote: 'unreachable' },
    { pageId: '${makePageId('onboarding', '_hidden')}', actionNote: 'reachable but hidden' },
  ],
}
`
      )
      const planReport = createReport()
      await checkFlowStories(hideWs, planReport)
      const invalidScreenFindings = planReport.findings.filter(f => f.ruleId === 'flowStory/invalid-page')
      assert.equal(invalidScreenFindings.length, 1, `expected exactly 1 invalid-screen finding (for __gone), got: ${JSON.stringify(planReport.findings)}`)
      assert.match(invalidScreenFindings[0].message, /__gone/)
    } finally {
      fs.rmSync(hideWs, { recursive: true, force: true })
    }
  })
})

describe('Suite E — screenPathIdentity.js parseVariant()', () => {
  it('E1 — long form `.variant-<serial>` parses componentName/variant', () => {
    assert.deepEqual(parseVariant('WelcomeScreen.variant-red-theme'), {
      componentName: 'WelcomeScreen',
      variant: 'red-theme',
    })
  })

  it('E2 — shorthand `.v-<serial>` parses componentName/variant', () => {
    assert.deepEqual(parseVariant('WelcomeScreen.v-b'), {
      componentName: 'WelcomeScreen',
      variant: 'b',
    })
  })

  it('E3 — no variant suffix → variant defaults to "default"', () => {
    assert.deepEqual(parseVariant('WelcomeScreen'), {
      componentName: 'WelcomeScreen',
      variant: 'default',
    })
  })

  it('E4 — serial itself containing hyphens is captured whole (greedy) for both forms', () => {
    assert.deepEqual(parseVariant('Foo.variant-a-b-c'), {
      componentName: 'Foo',
      variant: 'a-b-c',
    })
    assert.deepEqual(parseVariant('Foo.v-a-b-c'), {
      componentName: 'Foo',
      variant: 'a-b-c',
    })
  })
})
