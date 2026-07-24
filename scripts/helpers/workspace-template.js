// Shared per-workspace content generator — the one source of truth for demo
// workspace content across three call sites: this repo's own `flowkit
// create:workspace` command (scripts/platform/flowkit-mono.js), and the two
// standalone scaffolder packages (create-flowkit-app, create-flowkit-workspace),
// which import this file from their own `flowkit` devDependency at scaffold-time
// (i.e. from node_modules/flowkit/scripts/helpers/workspace-template.js, after
// their own `npm install` completes) — they cannot depend on the monorepo
// directly, since both must stay independently publishable with zero runtime
// deps on this repo.
//
// Demo content (config chapters/pages, flowStories, screens, db, game-logic,
// components) comes from the shared scripts/helpers/game-demo-scaffold.js
// module — the same one scripts/helpers/scaffold.js (repo mode) uses. There is
// only one copy of the demo content to maintain; this file's own job is just
// the flat/multi-workspace-specific mechanics (writing files to disk,
// vite.config.ts generation).
//
// Screens use the repo-mode convention (useDb()/useAppNav() from
// @flowkit-shared/utils), not PageProps' injected onAction/db — this works
// identically in flat/multi-workspace consumer mode: flowkit/vite's
// `standalone` alias set (scripts/helpers/vite-plugin.js) resolves
// @flowkit-shared/* straight to the same engine source shipped inside
// node_modules/flowkit/src/. There is no capability gap between modes, only a
// topology difference (workspaces/<name>/ vs a single implicit workspace, or
// a named sibling folder in multi-workspace mode).
import fs from 'fs'
import path from 'path'
import { WORKSPACE_CONFIG_FILENAME } from './config-filenames.js'
import { gameDemoScaffold, gameDemoWorkspaceConfig } from './game-demo-scaffold.js'

function writeFile(dir, relPath, content) {
  const fullPath = path.join(dir, relPath)
  fs.mkdirSync(path.dirname(fullPath), { recursive: true })
  fs.writeFileSync(fullPath, content)
}

/** Bare, essential-only scaffold — no demo chapters/pages/flowStories/components.
 * Used by --empty. Still a fully valid, buildable workspace: config declares
 * zero chapters (an author's first `flowkit create:chapter` populates it). */
function emptyWorkspaceContent(dir, workspaceName) {
  writeFile(
    dir,
    WORKSPACE_CONFIG_FILENAME,
    `import { defineConfig } from 'flowkit'

export default defineConfig({
  workspace: { name: '${workspaceName}' },
  chapters: [],
  pageOrder: {},
})
`
  )
  writeFile(
    dir,
    'lib/data/db.ts',
    `/** Initial mock database state. Mutate freely — these are just plain exports. */
export const user = {
  name: 'Demo User',
}
`
  )
  writeFile(
    dir,
    'lib/design-system/tokens.css',
    `/* ${workspaceName} — Design Tokens */\n/* No UI kit is pre-installed. Add your own CSS variables here, or ask\n   Flowaid (see CLAUDE.md) to help you pick and wire up a component approach. */\n:root {\n  /* --my-brand: #1a1a2e; */\n}\n`
  )
}

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
 * Single source of truth for this template — both scripts/platform/flowkit-mono.js
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

/** Writes the full demo content set (config, flowStories, pages, db, tokens,
 * game-logic, components) for one workspace folder, or the bare --empty set
 * when `empty` is true. */
export function writeWorkspaceContent(dir, workspaceName, empty = false) {
  if (empty) {
    emptyWorkspaceContent(dir, workspaceName)
    return
  }
  writeFile(
    dir,
    WORKSPACE_CONFIG_FILENAME,
    gameDemoWorkspaceConfig(workspaceName, `import { defineConfig } from 'flowkit'`)
  )
  const files = gameDemoScaffold(workspaceName, '', `import { defineFlow } from 'flowkit'`)
  for (const [relPath, content] of Object.entries(files)) {
    writeFile(dir, relPath, content)
  }
}
