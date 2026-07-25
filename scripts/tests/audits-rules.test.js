// Unit coverage for scripts/audits/*.js rule modules — pure functions given a wsDir and a
// report, exercised directly against small on-disk fixtures (no CLI spawn needed). One
// deliberately-broken case per rule family, plus a clean case proving no false positives.
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { after, afterEach, before, beforeEach, describe, it } from 'node:test'

import { createReport } from '../audits/reporter.js'
import { checkPage } from '../audits/page.js'
import { checkDb } from '../audits/db.js'
import { checkStory } from '../audits/story.js'
import { checkChapter } from '../audits/chapter.js'
import { checkComponents } from '../audits/components.js'
import { checkNavigations } from '../audits/navigations.js'
import { FLOW_BOOK_DIRNAME, FLOW_STORIES_DIRNAME } from '../helpers/config-filenames.js'
import { makePageId, parseVariant } from '../../src/shared/utils/pagePathIdentity.js'

const FIXTURES_DIR = path.join(
  path.dirname(new URL(import.meta.url).pathname),
  'fixtures',
  'navigations'
)

let wsDir

function ruleIds(report) {
  return report.findings.map(f => f.ruleId)
}

function write(relPath, content) {
  const full = path.join(wsDir, relPath)
  fs.mkdirSync(path.dirname(full), { recursive: true })
  fs.writeFileSync(full, content)
}

describe('Suite D — scripts/audits/*.js rule modules', () => {
  before(() => {
    wsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowkit-audit-rules-'))
  })

  after(() => {
    fs.rmSync(wsDir, { recursive: true, force: true })
  })

  it('D1 — checkPage: clean screen → no findings', () => {
    write(
      `${FLOW_BOOK_DIRNAME}/onboarding/welcome/WelcomeScreen.tsx`,
      `export default function WelcomeScreen() { return null }
export const pageMeta = { label: 'Welcome' }
`
    )
    const report = createReport()
    checkPage(wsDir, report)
    assert.deepEqual(ruleIds(report), [])
  })

  it('D2 — checkPage: missing pageMeta → page/missing-meta', () => {
    write(
      `${FLOW_BOOK_DIRNAME}/onboarding/broken/BrokenScreen.tsx`,
      `export default function BrokenScreen() { return null }
`
    )
    const report = createReport()
    checkPage(wsDir, report)
    assert.ok(ruleIds(report).includes('page/missing-meta'))
  })

  it('D3 — checkPage: no default export → page/no-default-export', () => {
    write(
      `${FLOW_BOOK_DIRNAME}/onboarding/nodefault/NoDefaultScreen.tsx`,
      `export const pageMeta = { label: 'No Default' }
`
    )
    const report = createReport()
    checkPage(wsDir, report)
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

  it('D6 — checkStory: step referencing a real screen → no findings', async () => {
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
    await checkStory(wsDir, report)
    assert.deepEqual(ruleIds(report), [])
  })

  it('D7 — checkStory: step referencing a nonexistent screen → story/invalid-page', async () => {
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
    await checkStory(wsDir, report)
    assert.ok(ruleIds(report).includes('story/invalid-page'))
  })

  it('D8 — checkStory: id/filename mismatch → story/id-filename-mismatch', async () => {
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
    await checkStory(wsDir, report)
    assert.ok(ruleIds(report).includes('story/id-filename-mismatch'))
  })

  it('D9 — checkStory: empty flowStories/ dir → story/empty-workspace', async () => {
    const emptyWs = fs.mkdtempSync(path.join(os.tmpdir(), 'flowkit-audit-empty-'))
    fs.mkdirSync(path.join(emptyWs, FLOW_STORIES_DIRNAME))
    try {
      const report = createReport()
      await checkStory(emptyWs, report)
      assert.ok(ruleIds(report).includes('story/empty-workspace'))
    } finally {
      fs.rmSync(emptyWs, { recursive: true, force: true })
    }
  })

  it('D10 — checkStory: no flowStories/ dir at all → no findings (not suspicious)', async () => {
    const noDirWs = fs.mkdtempSync(path.join(os.tmpdir(), 'flowkit-audit-nodir-'))
    try {
      const report = createReport()
      await checkStory(noDirWs, report)
      assert.deepEqual(ruleIds(report), [])
    } finally {
      fs.rmSync(noDirWs, { recursive: true, force: true })
    }
  })

  it('D11 — checkChapter: pageOrder references a directory that does not exist → chapter/orphaned-id', async () => {
    const cfgWs = fs.mkdtempSync(path.join(os.tmpdir(), 'flowkit-audit-config-'))
    try {
      fs.writeFileSync(
        path.join(cfgWs, 'manifest.ts'),
        `export default {
  workspace: { name: 'test' },
  chapters: ['onboarding'],
  pageOrder: { onboarding: ['ghost-screen'] },
}
`
      )
      const report = createReport()
      await checkChapter(cfgWs, report)
      assert.ok(ruleIds(report).includes('chapter/orphaned-id'))
    } finally {
      fs.rmSync(cfgWs, { recursive: true, force: true })
    }
  })

  it('D12 — checkComponents: registered component file missing → components/stale-registry', () => {
    const compWs = fs.mkdtempSync(path.join(os.tmpdir(), 'flowkit-audit-components-'))
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

  it('D13 — checkPage: variable-depth (3+ levels) screen still resolves, cosmetic folder ignored', () => {
    write(
      `${FLOW_BOOK_DIRNAME}/onboarding/cosmetic-group/deepscreen/DeepScreen.tsx`,
      `export default function DeepScreen() { return null }
export const pageMeta = { label: 'Deep', id: '${makePageId('onboarding', 'deepscreen')}' }
`
    )
    const report = createReport()
    checkPage(wsDir, report)
    // No meta-id-mismatch (cosmetic segment correctly ignored for identity) and no other findings for this screen.
    const findingsForDeep = ruleIds(report).filter(id => id.startsWith('page/'))
    assert.ok(
      !findingsForDeep.includes('page/meta-id-mismatch'),
      `expected no id mismatch, got: ${JSON.stringify(ruleIds(report))}`
    )
  })

  it('D14 — checkPage: 0-folder root-level screen resolves to flow "misc"', () => {
    const miscWs = fs.mkdtempSync(path.join(os.tmpdir(), 'flowkit-audit-misc-'))
    try {
      fs.mkdirSync(path.join(miscWs, FLOW_BOOK_DIRNAME), { recursive: true })
      fs.writeFileSync(
        path.join(miscWs, FLOW_BOOK_DIRNAME, 'RootScreen.tsx'),
        `export default function RootScreen() { return null }
export const pageMeta = { label: 'Root', id: '${makePageId('misc', 'RootScreen')}' }
`
      )
      const report = createReport()
      checkPage(miscWs, report)
      assert.ok(
        !ruleIds(report).includes('page/meta-id-mismatch'),
        `expected misc-flow id to match, got: ${JSON.stringify(ruleIds(report))}`
      )
    } finally {
      fs.rmSync(miscWs, { recursive: true, force: true })
    }
  })

  it('D15 — checkStory/collectAllPageIds: same screen folder name under two different flows → distinct composite ids, no collision', async () => {
    const dualWs = fs.mkdtempSync(path.join(os.tmpdir(), 'flowkit-audit-dual-'))
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
      await checkStory(dualWs, report)
      assert.ok(
        !ruleIds(report).includes('story/invalid-page'),
        `expected both distinct composite ids to resolve, got: ${JSON.stringify(report.findings)}`
      )
    } finally {
      fs.rmSync(dualWs, { recursive: true, force: true })
    }
  })

  it('D16 — checkPage: 2+ unprefixed candidate files → page/ambiguous-folder (warning, acknowledgment required)', () => {
    const ambigWs = fs.mkdtempSync(path.join(os.tmpdir(), 'flowkit-audit-ambig-'))
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
      checkPage(ambigWs, report)
      const finding = report.findings.find(f => f.ruleId === 'page/ambiguous-folder')
      assert.ok(finding, `expected page/ambiguous-folder, got: ${JSON.stringify(ruleIds(report))}`)
      assert.equal(finding.severity, 'warning')
      assert.equal(finding.requiresAcknowledgment, true)
    } finally {
      fs.rmSync(ambigWs, { recursive: true, force: true })
    }
  })

  it('D17 — checkPage/checkStory: `__`-prefixed folder fully excluded; single `_`-prefix still checked', async () => {
    const hideWs = fs.mkdtempSync(path.join(os.tmpdir(), 'flowkit-audit-hide-'))
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
      checkPage(hideWs, report)
      const findingFiles = report.findings.map(f => f.file)
      assert.ok(
        !findingFiles.some(f => f.includes('__gone')),
        `__-prefixed folder must be fully excluded, got findings: ${JSON.stringify(report.findings)}`
      )
      assert.ok(
        findingFiles.some(f => f.includes('_hidden')),
        `single _-prefixed folder must still be checked, got findings: ${JSON.stringify(report.findings)}`
      )
      assert.ok(
        report.findings.some(f => f.file.includes('_hidden') && f.ruleId === 'page/missing-meta')
      )

      // Also verify checkStory: a step referencing the __-hidden screen must fail invalid-page
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
      await checkStory(hideWs, planReport)
      const invalidScreenFindings = planReport.findings.filter(
        f => f.ruleId === 'story/invalid-page'
      )
      assert.equal(
        invalidScreenFindings.length,
        1,
        `expected exactly 1 invalid-screen finding (for __gone), got: ${JSON.stringify(planReport.findings)}`
      )
      assert.match(invalidScreenFindings[0].message, /__gone/)
    } finally {
      fs.rmSync(hideWs, { recursive: true, force: true })
    }
  })

  it('D18 — checkStory: fork-nested step with a valid pageId → no findings', async () => {
    write(
      `${FLOW_STORIES_DIRNAME}/forked-valid.ts`,
      `export default {
  id: 'forked-valid',
  name: 'Forked Valid',
  steps: [
    {
      pageId: '${makePageId('onboarding', 'welcome')}',
      actionNote: 'Taps Get Started',
      on: 'get-started',
      forks: [
        {
          label: 'Happy path',
          steps: [
            { pageId: '${makePageId('onboarding', 'welcome')}', actionNote: 'Still fine', on: 'continue' },
          ],
        },
      ],
    },
  ],
}
`
    )
    const report = createReport()
    await checkStory(wsDir, report)
    const ownFile = `${FLOW_STORIES_DIRNAME}/forked-valid.ts`
    assert.deepEqual(
      report.findings.filter(f => f.file === ownFile && f.ruleId.startsWith('story/fork')),
      []
    )
  })

  it('D19 — checkStory: fork-nested step with an invalid pageId → story/fork-invalid-page', async () => {
    write(
      `${FLOW_STORIES_DIRNAME}/forked-invalid.ts`,
      `export default {
  id: 'forked-invalid',
  name: 'Forked Invalid',
  steps: [
    {
      pageId: '${makePageId('onboarding', 'welcome')}',
      actionNote: 'Taps Get Started',
      on: 'get-started',
      forks: [
        {
          label: 'Payment fails',
          steps: [
            { pageId: 'does-not-exist-either', actionNote: 'goes nowhere' },
          ],
        },
      ],
    },
  ],
}
`
    )
    const report = createReport()
    await checkStory(wsDir, report)
    // wsDir is shared/cumulative across Suite D — scope every assertion to this test's
    // own fixture file so earlier fixtures' findings (e.g. D7's broken.ts) can't leak in.
    const ownFile = `${FLOW_STORIES_DIRNAME}/forked-invalid.ts`
    const ownFindings = report.findings.filter(f => f.file === ownFile)
    const forkFindings = ownFindings.filter(f => f.ruleId === 'story/fork-invalid-page')
    assert.equal(forkFindings.length, 1)
    assert.match(forkFindings[0].message, /does-not-exist-either/)
    assert.match(forkFindings[0].message, /Payment fails/)
    // Top-level story/invalid-page must NOT fire for this — the bad pageId lives only
    // inside the fork, not in the top-level steps[] array.
    assert.ok(!ownFindings.some(f => f.ruleId === 'story/invalid-page'))
  })

  it('D20 — checkStory: fork nested inside a fork (two levels deep) is still walked', async () => {
    write(
      `${FLOW_STORIES_DIRNAME}/forked-nested.ts`,
      `export default {
  id: 'forked-nested',
  name: 'Forked Nested',
  steps: [
    {
      pageId: '${makePageId('onboarding', 'welcome')}',
      actionNote: 'Taps Get Started',
      on: 'get-started',
      forks: [
        {
          label: 'Outer fork',
          steps: [
            {
              pageId: '${makePageId('onboarding', 'welcome')}',
              actionNote: 'Still in outer fork',
              on: 'continue',
              forks: [
                {
                  label: 'Inner fork',
                  steps: [
                    { pageId: 'deeply-nested-bad-id', actionNote: 'goes nowhere' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  ],
}
`
    )
    const report = createReport()
    await checkStory(wsDir, report)
    // Scoped to this test's own fixture file — see D19's comment on wsDir being
    // cumulative across Suite D.
    const ownFile = `${FLOW_STORIES_DIRNAME}/forked-nested.ts`
    const forkFindings = report.findings.filter(
      f => f.file === ownFile && f.ruleId === 'story/fork-invalid-page'
    )
    assert.equal(forkFindings.length, 1)
    assert.match(forkFindings[0].message, /deeply-nested-bad-id/)
    // Message should mention both enclosing fork labels, outermost first, proving the
    // recursion actually descended two levels rather than stopping at the first fork.
    assert.match(forkFindings[0].message, /Outer fork.*Inner fork/)
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

describe('Suite M — scripts/audits/navigations.js (unguarded-dashboard-navigate, invalid-target, unreachable-page)', () => {
  let navWsDir

  beforeEach(() => {
    navWsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'flowkit-audit-nav-'))
  })

  afterEach(() => {
    fs.rmSync(navWsDir, { recursive: true, force: true })
  })

  /** Writes a minimal, valid manifest.ts so readWorkspaceConfig() has something to read. */
  function writeManifest({ startPage } = {}) {
    fs.writeFileSync(
      path.join(navWsDir, 'manifest.ts'),
      `export default {
  workspace: { name: 'nav-test' },
  ${startPage ? `startPage: '${startPage}',` : ''}
  chapters: ['chapter-one'],
  pageOrder: { 'chapter-one': [] },
}
`
    )
  }

  /**
   * Copies a fixture into flowBook/chapter-one/<pageName>/<PageName>.tsx, substituting
   * TARGET_ID_A/TARGET_ID_B placeholders with real composite ids for the given target
   * page names (also created as real, valid page files so they resolve).
   */
  function placeFixture(fixtureName, pageName, targets = {}) {
    const src = fs.readFileSync(path.join(FIXTURES_DIR, fixtureName), 'utf8')
    let content = src
    for (const [placeholder, targetPageName] of Object.entries(targets)) {
      content = content.replaceAll(placeholder, makePageId('chapter-one', targetPageName))
    }
    const dir = path.join(navWsDir, FLOW_BOOK_DIRNAME, 'chapter-one', pageName)
    fs.mkdirSync(dir, { recursive: true })
    const ext = fixtureName.endsWith('.ts') ? '.ts' : '.tsx'
    fs.writeFileSync(path.join(dir, `Page${ext}`), content)
  }

  function writeTargetPage(pageName) {
    const dir = path.join(navWsDir, FLOW_BOOK_DIRNAME, 'chapter-one', pageName)
    fs.mkdirSync(dir, { recursive: true })
    fs.writeFileSync(path.join(dir, 'Page.tsx'), `export default function Page() { return null }\n`)
  }

  it('M1 — app-nav-inline-jsx: useAppNav().navigateTo() literal targets resolve, no unguarded finding', async () => {
    // startPage: 'caller' gives the calling page itself a legitimate reachability
    // edge, so this test's assertion isn't polluted by an unrelated, correct
    // unreachable-page finding on the caller — the point of this test is the two
    // outbound navigateTo() calls, not the caller's own reachability.
    writeManifest({ startPage: 'caller' })
    writeTargetPage('target-a')
    writeTargetPage('target-b')
    placeFixture('app-nav-inline-jsx.tsx', 'caller', {
      TARGET_ID_A: 'target-a',
      TARGET_ID_B: 'target-b',
    })
    const report = createReport()
    await checkNavigations(navWsDir, report)
    assert.deepEqual(
      report.findings.map(f => f.ruleId).filter(id => id.startsWith('navigations/')),
      []
    )
  })

  it('M2 — app-nav-object-form: nav.navigateTo() member-access binding shape resolves identically to destructured form', async () => {
    writeManifest({ startPage: 'caller' })
    writeTargetPage('target-a')
    placeFixture('app-nav-object-form.tsx', 'caller', { TARGET_ID_A: 'target-a' })
    const report = createReport()
    await checkNavigations(navWsDir, report)
    assert.deepEqual(report.findings, [])
  })

  it('M3 — dashboard-direct-unguarded: direct useDashboard().navigateTo() with no isChapter guard → navigations/unguarded-dashboard-navigate', async () => {
    writeManifest()
    writeTargetPage('target-a')
    placeFixture('dashboard-direct-unguarded.tsx', 'caller', { TARGET_ID_A: 'target-a' })
    const report = createReport()
    await checkNavigations(navWsDir, report)
    assert.ok(report.findings.some(f => f.ruleId === 'navigations/unguarded-dashboard-navigate'))
  })

  it('M4 — dashboard-direct-guarded-and: `isChapter && dashNav(...)` suppresses the unguarded finding', async () => {
    writeManifest()
    writeTargetPage('target-a')
    placeFixture('dashboard-direct-guarded-and.tsx', 'caller', { TARGET_ID_A: 'target-a' })
    const report = createReport()
    await checkNavigations(navWsDir, report)
    assert.ok(!report.findings.some(f => f.ruleId === 'navigations/unguarded-dashboard-navigate'))
  })

  it('M5 — dashboard-direct-guarded-ternary: both ternary polarities suppress the unguarded finding', async () => {
    writeManifest()
    writeTargetPage('target-a')
    placeFixture('dashboard-direct-guarded-ternary.tsx', 'caller', { TARGET_ID_A: 'target-a' })
    const report = createReport()
    await checkNavigations(navWsDir, report)
    assert.ok(!report.findings.some(f => f.ruleId === 'navigations/unguarded-dashboard-navigate'))
  })

  it('M6 — dashboard-direct-early-return: acknowledged v1 gap — finding fires even though the real call is safely guarded', async () => {
    writeManifest()
    writeTargetPage('target-a')
    placeFixture('dashboard-direct-early-return.tsx', 'caller', { TARGET_ID_A: 'target-a' })
    const report = createReport()
    await checkNavigations(navWsDir, report)
    assert.ok(
      report.findings.some(f => f.ruleId === 'navigations/unguarded-dashboard-navigate'),
      'expected the documented early-return gap to still fire — if this now fails, early-return detection may have been added; update this test to assert suppression instead'
    )
  })

  it('M7 — invalid-target-literal: navigateTo() literal that matches no real page → navigations/invalid-target (error)', async () => {
    writeManifest()
    placeFixture('invalid-target-literal.tsx', 'caller', {})
    const report = createReport()
    await checkNavigations(navWsDir, report)
    const finding = report.findings.find(f => f.ruleId === 'navigations/invalid-target')
    assert.ok(finding)
    assert.equal(finding.severity, 'error')
  })

  it('M8 — dynamic-target-member-expr: non-literal navigateTo(game.pageId) argument is never flagged invalid, and increments the dynamic-call-site count', async () => {
    writeManifest()
    writeTargetPage('target-a')
    placeFixture('dynamic-target-member-expr.tsx', 'caller', { TARGET_ID_A: 'target-a' })
    const report = createReport()
    await checkNavigations(navWsDir, report)
    assert.ok(!report.findings.some(f => f.ruleId === 'navigations/invalid-target'))
    assert.equal(report.dynamicNavCallSites, 1)
  })

  it('M9 — settimeout-wrapped-call: the AST walker reaches calls nested inside setTimeout inside useEffect, not just JSX-prop arrow functions', async () => {
    writeManifest()
    writeTargetPage('target-a')
    placeFixture('settimeout-wrapped-call.tsx', 'caller', { TARGET_ID_A: 'target-a' })
    const report = createReport()
    await checkNavigations(navWsDir, report)
    // target-a is reachable via this call — proving the walker found it — so it must
    // NOT show up as unreachable-page.
    const targetId = makePageId('chapter-one', 'target-a')
    assert.ok(
      !report.findings.some(
        f => f.ruleId === 'navigations/unreachable-page' && f.meta?.pageId === targetId
      )
    )
  })

  it('M10 — fork-nested-flowstory: a page only reachable via a fork-nested step is NOT flagged unreachable', async () => {
    writeManifest()
    writeTargetPage('top-level-target')
    writeTargetPage('nested-fork-target')
    const fsDir = path.join(navWsDir, FLOW_STORIES_DIRNAME)
    fs.mkdirSync(fsDir, { recursive: true })
    const src = fs
      .readFileSync(path.join(FIXTURES_DIR, 'fork-nested-flowstory.ts'), 'utf8')
      .replaceAll('TOP_LEVEL_TARGET', makePageId('chapter-one', 'top-level-target'))
      .replaceAll('NESTED_FORK_TARGET', makePageId('chapter-one', 'nested-fork-target'))
    fs.writeFileSync(path.join(fsDir, 'fork-nested-flowstory.ts'), src)

    const report = createReport()
    await checkNavigations(navWsDir, report)
    const nestedId = makePageId('chapter-one', 'nested-fork-target')
    assert.ok(
      !report.findings.some(
        f => f.ruleId === 'navigations/unreachable-page' && f.meta?.pageId === nestedId
      ),
      'a page only reachable via a fork-nested step must not be flagged unreachable'
    )
  })

  it('M11 — unreachable-orphan-page: a page with zero inbound edges → navigations/unreachable-page (warning, not error)', async () => {
    writeManifest()
    placeFixture('unreachable-orphan-page.tsx', 'orphan', {})
    const report = createReport()
    await checkNavigations(navWsDir, report)
    const orphanId = makePageId('chapter-one', 'orphan')
    const finding = report.findings.find(
      f => f.ruleId === 'navigations/unreachable-page' && f.meta?.pageId === orphanId
    )
    assert.ok(finding)
    assert.equal(finding.severity, 'warning')
  })

  it('M12 — pageOrder listing alone does not count as a reachability edge', async () => {
    // Same fixture as M11, but this time the page IS listed in pageOrder — must still
    // be flagged unreachable, since pageOrder membership is explicitly not an edge.
    fs.writeFileSync(
      path.join(navWsDir, 'manifest.ts'),
      `export default {
  workspace: { name: 'nav-test' },
  chapters: ['chapter-one'],
  pageOrder: { 'chapter-one': ['orphan'] },
}
`
    )
    placeFixture('unreachable-orphan-page.tsx', 'orphan', {})
    const report = createReport()
    await checkNavigations(navWsDir, report)
    const orphanId = makePageId('chapter-one', 'orphan')
    assert.ok(
      report.findings.some(
        f => f.ruleId === 'navigations/unreachable-page' && f.meta?.pageId === orphanId
      ),
      'a pageOrder-listed page with no real navigation edge must still be flagged unreachable'
    )
  })

  it('M13 — start-page-target: resolveStartPageId composes the correct id, and the resolved startPage counts as reachable with zero other references', async () => {
    writeManifest({ startPage: 'start-page-target' })
    placeFixture('start-page-target.tsx', 'start-page-target', {})
    const report = createReport()
    await checkNavigations(navWsDir, report)
    const startId = makePageId('chapter-one', 'start-page-target')
    assert.ok(
      !report.findings.some(
        f => f.ruleId === 'navigations/unreachable-page' && f.meta?.pageId === startId
      ),
      'the resolved startPage must count as reachable even with zero other inbound edges'
    )
  })
})
