// Shared per-workspace content generator — the one source of truth for demo
// workspace content (the workspace config file, flowStories, five screens, db,
// tokens.css) across three call sites: this repo's own `flowkit
// create:workspace` command (scripts/platform/workspace-flat.js), and the two
// standalone scaffolder packages (create-flowkit-app, create-flowkit-workspace),
// which import this file from their own `flowkit` devDependency at scaffold-time
// (i.e. from node_modules/flowkit/scripts/helpers/workspace-template.js, after
// their own `npm install` completes) — they cannot depend on the monorepo
// directly, since both must stay independently publishable with zero runtime
// deps on this repo.
//
// Ported from scripts/helpers/scaffold.js's repo-mode workspaceScaffold() — same
// flows/screens/content, adapted from the useDashboard() hook (repo mode) to the
// PageProps convention (flat mode's documented public API). If you
// add/remove a demo screen or flow here, update scaffold.js too —
// scripts/tests/scaffold-consistency.test.js checks screen/flow counts match,
// not exact ids (naming conventions already differ: this file omits
// scaffold.js's -screen/-flow id suffixes).
//
// NOTE on onAction?.('id') below only working during flow playback: FlowMaster
// injects onAction/onNext/onBack into a screen only while it's rendered inside
// an active flowStory (see PageProps' own JSDoc in src/types/index.ts —
// "automatically injected... by FlowMaster"). These demo screens are correctly
// inert when viewed standalone (e.g. flat mode's Screens-tab-equivalent
// preview) — that's not a bug. A screen author wanting the same interactivity
// outside a flow should call useDashboard() directly instead (repo mode's own
// convention) and wire onClick={() => navigateTo(id)} — that path has no
// dependency on FlowMaster or any flowStory. Don't conflate "these demo buttons
// don't respond outside a flow" with "navigation is broken" — the two
// navigation conventions are independent, and this demo only shows one.
import fs from 'fs'
import path from 'path'
import {
  WORKSPACE_CONFIG_FILENAME,
  FLOW_BOOK_DIRNAME,
  FLOW_STORIES_DIRNAME,
} from './config-filenames.js'

export function writeFlowkitConfig(dir, workspaceName) {
  fs.writeFileSync(
    path.join(dir, WORKSPACE_CONFIG_FILENAME),
    `import { defineConfig } from 'flowkit'

export default defineConfig({
  workspace: { name: '${workspaceName}' },
  chapters: ['onboarding', 'home'],
  pageOrder: {
    onboarding: ['welcome', 'setup', 'ready'],
    home: ['home', 'detail'],
  },
})
`
  )
}

export function writeFlowStories(dir) {
  fs.mkdirSync(path.join(dir, FLOW_STORIES_DIRNAME), { recursive: true })
  fs.writeFileSync(
    path.join(dir, FLOW_STORIES_DIRNAME, 'onboarding.ts'),
    `import { defineFlow } from 'flowkit'

export default defineFlow({
  id: 'onboarding',
  name: 'Onboarding',
  description: 'Guides the user through welcome, profile setup, and into the app.',
  steps: [
    { pageId: 'onboarding-welcome', on: 'get-started', actionNote: 'Taps Get Started' },
    { pageId: 'onboarding-setup', on: 'continue', actionNote: 'Confirms profile and continues' },
    { pageId: 'onboarding-ready', on: 'go-to-home', actionNote: 'Proceeds to home' },
  ],
})
`
  )
  fs.writeFileSync(
    path.join(dir, FLOW_STORIES_DIRNAME, 'home.ts'),
    `import { defineFlow } from 'flowkit'

export default defineFlow({
  id: 'home',
  name: 'Home',
  description: 'Browse the item list and view a detail page.',
  steps: [
    { pageId: 'home-home', on: 'item-1', actionNote: 'Taps the first item' },
    { pageId: 'home-detail', on: 'back', actionNote: 'Goes back to list' },
  ],
})
`
  )
}

// ── Screens ──────────────────────────────────────────────────────────────────

function screenFile(isJs, typeImport, propsType, body) {
  const header = isJs ? '' : `${typeImport}\n\n`
  return `${header}${body.replace('__PROPS__', isJs ? '' : `: ${propsType}`)}`
}

function writeScreen(dir, flow, id, filename, isJs, content) {
  const screenDir = path.join(dir, FLOW_BOOK_DIRNAME, flow, id)
  fs.mkdirSync(screenDir, { recursive: true })
  fs.writeFileSync(path.join(screenDir, `${filename}.${isJs ? 'jsx' : 'tsx'}`), content)
}

export function writeWelcomeScreen(dir, language) {
  const isJs = language === 'js'
  const content = screenFile(
    isJs,
    `import type { PageProps } from 'flowkit'`,
    'PageProps',
    `export default function WelcomePage({ onAction }__PROPS__) {
  return (
    <div className="flex flex-col h-full bg-theme-base">
      <div className="flex flex-col items-center justify-center flex-1 gap-4 p-6">
        <div className="w-16 h-16 rounded-full bg-theme-blue-dim flex items-center justify-center">
          <span className="text-2xl">👋</span>
        </div>
        <h1 className="text-ui-xl font-bold text-theme-text-primary text-center">
          Welcome to FlowKit
        </h1>
        <p className="text-ui-sm text-theme-text-secondary text-center max-w-xs">
          This project shows how pages read from db, use theme tokens, and wire interactions via
          flowStory steps.
        </p>
      </div>
      <div className="p-4 pb-8">
        <button
          onClick={() => onAction?.('get-started')}
          className="w-full px-3 py-2.5 rounded-md bg-theme-blue-dim text-theme-blue text-ui-sm font-medium"
        >
          Get Started
        </button>
      </div>
    </div>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const pageMeta = {
  id: 'welcome',
  label: 'Welcome Screen',
  // Annotation badges (ephemeral review markers shown in the Screens panel):
  // annotations: [{ label: 'new', color: 'green', icon: 'Star' }],
}
`
  )
  writeScreen(dir, 'onboarding', 'welcome', 'WelcomePage', isJs, content)
}

export function writeSetupScreen(dir, language) {
  const isJs = language === 'js'
  const content = screenFile(
    isJs,
    `import type { PageProps } from 'flowkit'`,
    'PageProps',
    `export default function SetupPage({ onAction, db }__PROPS__) {
  // db is typed Record<string, unknown> in PageProps — loosen it here,
  // same convention repo-mode's useDashboard() hook already uses (db: Record<string, any>).
  const anyDb = ${isJs ? 'db' : 'db as any // eslint-disable-line @typescript-eslint/no-explicit-any'}

  return (
    <div className="flex flex-col h-full bg-theme-base">
      <div className="flex items-center px-4 h-12 border-b border-theme-border-subtle">
        <span className="text-ui-md font-medium text-theme-text-primary">Your Profile</span>
      </div>
      <div className="flex flex-col gap-3 p-4">
        <div className="rounded-[10px] bg-theme-surface shadow-theme-card p-3 flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-theme-blue-dim flex items-center justify-center text-ui-sm font-bold text-theme-blue">
            {anyDb?.user?.name?.[0] ?? 'U'}
          </div>
          <div>
            <p className="text-ui-sm font-medium text-theme-text-primary">{anyDb?.user?.name ?? 'User'}</p>
            <p className="text-ui-xs text-theme-text-muted">{anyDb?.user?.email ?? ''}</p>
          </div>
        </div>
        <div className="rounded-[10px] bg-theme-surface shadow-theme-card divide-y divide-theme-border-subtle">
          {['Notifications', 'Privacy', 'Display'].map((item) => (
            <div key={item} className="flex items-center justify-between px-3 py-2.5">
              <span className="text-ui-sm text-theme-text-primary">{item}</span>
              <span className="text-ui-xs text-theme-text-muted">›</span>
            </div>
          ))}
        </div>
      </div>
      <div className="mt-auto p-4 pb-8">
        <button
          onClick={() => onAction?.('continue')}
          className="w-full px-3 py-2.5 rounded-md bg-theme-blue-dim text-theme-blue text-ui-sm font-medium"
        >
          Continue
        </button>
      </div>
    </div>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const pageMeta = { id: 'setup', label: 'Setup Screen' }
`
  )
  writeScreen(dir, 'onboarding', 'setup', 'SetupPage', isJs, content)
}

export function writeReadyScreen(dir, language) {
  const isJs = language === 'js'
  const content = screenFile(
    isJs,
    `import type { PageProps } from 'flowkit'`,
    'PageProps',
    `export default function ReadyPage({ onAction, db }__PROPS__) {
  // db is typed Record<string, unknown> in PageProps — loosen it here,
  // same convention repo-mode's useDashboard() hook already uses (db: Record<string, any>).
  const anyDb = ${isJs ? 'db' : 'db as any // eslint-disable-line @typescript-eslint/no-explicit-any'}

  return (
    <div className="flex flex-col h-full bg-theme-base items-center justify-center gap-6 p-6">
      <div className="w-16 h-16 rounded-full bg-theme-green-dim flex items-center justify-center">
        <span className="text-2xl">✓</span>
      </div>
      <div className="flex flex-col items-center gap-2 text-center">
        <h1 className="text-ui-xl font-bold text-theme-text-primary">You're all set</h1>
        <p className="text-ui-sm text-theme-text-secondary">
          {anyDb?.user?.name ?? 'User'}, your project is ready.
        </p>
      </div>
      <button
        onClick={() => onAction?.('go-to-home')}
        className="px-4 py-2.5 rounded-md bg-theme-blue-dim text-theme-blue text-ui-sm font-medium"
      >
        Go to Home
      </button>
    </div>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const pageMeta = { id: 'ready', label: 'Ready Screen' }
`
  )
  writeScreen(dir, 'onboarding', 'ready', 'ReadyPage', isJs, content)
}

export function writeHomeScreen(dir, language) {
  const isJs = language === 'js'
  const itemsType = isJs
    ? ''
    : `: Array<{ id: number; title: string; desc: string; status: string }>`
  const dbCast = isJs ? 'db' : 'db as any // eslint-disable-line @typescript-eslint/no-explicit-any'
  const content = screenFile(
    isJs,
    `import type { PageProps } from 'flowkit'`,
    'PageProps',
    `export default function HomePage({ onAction, db }__PROPS__) {
  // db is typed Record<string, unknown> in PageProps — loosen it here,
  // same convention repo-mode's useDashboard() hook already uses (db: Record<string, any>).
  const anyDb = ${dbCast}
  const items${itemsType} = anyDb?.items ?? []

  return (
    <div className="flex flex-col h-full bg-theme-base">
      <div className="flex items-center justify-between px-4 h-12 border-b border-theme-border-subtle">
        <span className="text-ui-md font-medium text-theme-text-primary">Home</span>
        <span className="text-ui-xs text-theme-text-muted">{items.length} items</span>
      </div>
      <div className="flex flex-col gap-2 p-4">
        {items.map((item) => {
          const badgeClass =
            item.status === 'active'
              ? 'bg-theme-green-dim text-theme-green'
              : 'bg-theme-amber-dim text-theme-amber'
          return (
            <div
              key={item.id}
              onClick={() => onAction?.('item-' + item.id)}
              className="rounded-[10px] bg-theme-surface shadow-theme-card p-3 flex items-center justify-between gap-3 cursor-pointer"
            >
              <div className="flex flex-col gap-0.5 min-w-0">
                <p className="text-ui-sm font-medium text-theme-text-primary truncate">{item.title}</p>
                <p className="text-ui-xs text-theme-text-muted truncate">{item.desc}</p>
              </div>
              <span className={'text-ui-2xs font-bold uppercase tracking-[0.04em] px-1.5 py-0.5 rounded-full shrink-0 ' + badgeClass}>
                {item.status}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const pageMeta = { id: 'home', label: 'Home Screen' }
`
  )
  writeScreen(dir, 'home', 'home', 'HomePage', isJs, content)
}

export function writeDetailScreen(dir, language) {
  const isJs = language === 'js'
  const dbCast = isJs ? 'db' : 'db as any // eslint-disable-line @typescript-eslint/no-explicit-any'
  const content = screenFile(
    isJs,
    `import type { PageProps } from 'flowkit'`,
    'PageProps',
    `export default function DetailPage({ onAction, db }__PROPS__) {
  // db is typed Record<string, unknown> in PageProps — loosen it here,
  // same convention repo-mode's useDashboard() hook already uses (db: Record<string, any>).
  const anyDb = ${dbCast}
  const item = anyDb?.items?.[0]
  const badgeClass =
    item?.status === 'active'
      ? 'bg-theme-green-dim text-theme-green'
      : 'bg-theme-amber-dim text-theme-amber'

  return (
    <div className="flex flex-col h-full bg-theme-base">
      <div className="flex items-center gap-2 px-4 h-12 border-b border-theme-border-subtle">
        <button onClick={() => onAction?.('back')} className="text-ui-sm text-theme-blue">
          ← Back
        </button>
        <span className="flex-1 text-center text-ui-sm font-medium text-theme-text-primary">Detail</span>
        <div className="w-12" />
      </div>
      <div className="flex flex-col gap-4 p-4">
        <div className="rounded-xl bg-theme-surface shadow-theme-card p-4 flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-ui-lg font-bold text-theme-text-primary">{item?.title ?? 'Item'}</h2>
            <span className={'text-ui-2xs font-bold uppercase tracking-[0.04em] px-1.5 py-0.5 rounded-full shrink-0 ' + badgeClass}>
              {item?.status}
            </span>
          </div>
          <p className="text-ui-sm text-theme-text-secondary">{item?.desc ?? ''}</p>
          <div className="pt-2 border-t border-theme-border-subtle">
            <p className="text-ui-2xs font-bold uppercase tracking-[0.04em] text-theme-text-muted mb-1">Item ID</p>
            <p className="text-ui-sm text-theme-text-primary">{item?.id ?? '—'}</p>
          </div>
        </div>
      </div>
    </div>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const pageMeta = { id: 'detail', label: 'Detail Screen' }
`
  )
  writeScreen(dir, 'home', 'detail', 'DetailPage', isJs, content)
}

export function writeDb(dir) {
  fs.mkdirSync(path.join(dir, 'lib', 'data'), { recursive: true })
  fs.writeFileSync(
    path.join(dir, 'lib', 'data', 'db.ts'),
    `/** Initial mock database state. Mutate freely — these are just plain exports. */
export const user = {
  name: 'Alex',
  email: 'alex@example.com',
}

export const items = [
  { id: 1, title: 'First Item', desc: 'A sample item to demonstrate db reads.', status: 'active' },
  { id: 2, title: 'Second Item', desc: 'Another item showing list rendering.', status: 'pending' },
  { id: 3, title: 'Third Item', desc: 'More items can be added in db.ts.', status: 'active' },
]
`
  )
}

export function writeTokensCss(dir, workspaceName) {
  fs.mkdirSync(path.join(dir, 'lib', 'design-system'), { recursive: true })
  const content = `/* ${workspaceName} — Design Tokens */\n/* No UI kit is pre-installed. Add your own CSS variables here, or ask\n   Flowaid (see CLAUDE.md) to help you pick and wire up a component approach. */\n:root {\n  /* --my-brand: #1a1a2e; */\n}\n`
  fs.writeFileSync(path.join(dir, 'lib', 'design-system', 'tokens.css'), content)
}

// The onwarn suppression is identical everywhere this build block is used —
// INEFFECTIVE_DYNAMIC_IMPORT is expected/harmless: screens are both statically
// listed (for eager type-checking) and dynamically imported (for code-splitting)
// by the virtual:flowkit/screens module flowkit/vite generates.
const VITE_CONFIG_BUILD_BLOCK = `  build: {
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        if (warning.code === 'INEFFECTIVE_DYNAMIC_IMPORT') return
        defaultHandler(warning)
      },
    },
  },`

/**
 * Writes the multi-workspace project's vite.config.ts — flowkit({ workspaceRoot,
 * standalone: true }), reading the active workspace's declared path from
 * package.json's flowkit.workspaces (the first entry, by key order) on every
 * config load (so create:workspace/remove:workspace/rename:workspace take
 * effect without hand-editing this file).
 *
 * Single source of truth for this template — both scripts/platform/workspace-flat.js
 * (flowkit convert:multi, run against this monorepo's own consumer-mode helpers)
 * and packages/create-flowkit-workspace/index.js (scaffolding a brand-new project)
 * must produce byte-identical output, or a freshly scaffolded multi-workspace
 * project silently diverges from what `convert:multi` produces from a flat one —
 * confirmed as a real bug: the scaffolder used to write a bare `flowkit()` with
 * no options, which builds an empty bundle (no workspaceRoot, no standalone) since
 * nothing else in a from-scratch project supplies the platform aliases.
 */
export function writeMultiWorkspaceViteConfig(dir) {
  fs.writeFileSync(
    path.join(dir, 'vite.config.ts'),
    `import fs from 'fs'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { flowkit } from 'flowkit/vite'

// Multi-workspace mode: the flowkit/vite plugin needs to know which workspace
// folder to serve/build (there's no root-level workspace config file here —
// each workspace has its own, nested one level down). Until a real active-workspace
// switcher exists, this always resolves to the first entry in package.json's
// flowkit.workspaces (an object keyed by workspace name with an explicit path,
// not a plain name array) — re-read on every config load so \`flowkit
// create:workspace\`/\`remove:workspace\`/\`rename:workspace\` take effect without
// editing this file by hand.
const pkg = JSON.parse(fs.readFileSync('./package.json', 'utf8'))
const workspaces = pkg.flowkit?.workspaces ?? {}
const activeWorkspaceName = Object.keys(workspaces)[0]
const activeWorkspace = activeWorkspaceName ? workspaces[activeWorkspaceName].path : undefined

if (!activeWorkspace) {
  throw new Error(
    'No workspace found in package.json\\'s flowkit.workspaces — run \`flowkit create:workspace <name>\` first.'
  )
}

export default defineConfig({
  plugins: [react(), flowkit({ workspaceRoot: activeWorkspace, standalone: true })],
${VITE_CONFIG_BUILD_BLOCK}
})
`
  )
}

/** Writes the full demo content set (config, flowStories, five screens, db, tokens) for one workspace folder. */
export function writeWorkspaceContent(dir, workspaceName, language) {
  writeFlowkitConfig(dir, workspaceName)
  writeFlowStories(dir)
  writeWelcomeScreen(dir, language)
  writeSetupScreen(dir, language)
  writeReadyScreen(dir, language)
  writeHomeScreen(dir, language)
  writeDetailScreen(dir, language)
  writeDb(dir)
  writeTokensCss(dir, workspaceName)
}
