// Platform command: flat-mode workspace lifecycle for consumer (published-package)
// projects — the single-implicit-workspace shape that `create-flowkit-app` scaffolds
// (project root IS the one workspace, no sibling workspace folders). Distinct from
// flowkit-mono.js (multi-sibling-workspace shape) and flowkit-engine.js (this
// monorepo's own internal dev workspaces, unrelated to either consumer package).
//
// Mode/workspace-list are declared in the consumer's package.json under a
// "flowkit" key (see scripts/helpers/flowkit-manifest.js) — never inferred from
// folder shape, mirroring the reasoning documented above isRepoMode() in
// scripts/helpers/paths.js.
import fs from 'fs'
import path from 'path'
import readline from 'readline'
import {
  readFlowkitManifest,
  writeFlowkitManifest,
  clearFlowkitManifest,
  requireMultiMode,
  assertScopedConsumerWorkspaceDir,
  workspaceEntryPath,
} from '../helpers/flowkit-manifest.js'
import { parseStringFlag } from '../helpers/args.js'
import { prompt } from '../helpers/prompt.js'
import { g, r, b, d } from '../helpers/colors.js'
import {
  WORKSPACE_ENTRIES,
  VITE_CONFIG_BUILD_BLOCK,
  moveEntries,
  stagedMove,
} from './workspace-consumer-shared.js'

/**
 * Writes the flat-mode vite.config.ts — bare flowkit(), root IS the one
 * implicit workspace. Matches packages/create-flowkit-app/index.js's template
 * exactly; keep both in sync if either changes.
 */
export function writeFlatViteConfig(cwd) {
  fs.writeFileSync(
    path.join(cwd, 'vite.config.ts'),
    `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { flowkit } from 'flowkit/vite'

export default defineConfig({
  plugins: [react(), flowkit()],
${VITE_CONFIG_BUILD_BLOCK}
})
`
  )
}

async function resolveConvertFlatSource(args) {
  const cwd = process.cwd()
  const manifest = readFlowkitManifest(cwd)
  const fromFlag = parseStringFlag(args, 'from')
  const allFlag = args.includes('--all')

  if (fromFlag) {
    if (!manifest.workspaceNames.includes(fromFlag)) {
      console.error(r(`✗ Workspace not found in flowkit.workspaces: ${fromFlag}`))
      process.exit(1)
    }
    const others = manifest.workspaceNames.filter(w => w !== fromFlag)
    if (others.length && !allFlag) {
      console.error(
        r(
          `✗ Other workspaces still exist: ${others.join(', ')}. ` +
            `Pass --all to delete them, or remove them first.`
        )
      )
      process.exit(1)
    }
    return { survivor: fromFlag, toDelete: allFlag ? others : [] }
  }

  if (manifest.workspaceNames.length === 1) {
    return { survivor: manifest.workspaceNames[0], toDelete: [] }
  }

  if (allFlag) {
    console.error(
      r(
        `✗ Multiple workspaces exist (${manifest.workspaceNames.join(', ')}). ` +
          `Pass --from <name> alongside --all to say which one survives.`
      )
    )
    process.exit(1)
  }

  console.error(
    r(
      `✗ Multiple workspaces exist (${manifest.workspaceNames.join(', ')}). ` +
        `Pass --from <name> to pick a survivor, or --from <name> --all to delete the rest.`
    )
  )
  process.exit(1)
}

export async function cmdConvertFlat(_val, args = []) {
  const cwd = process.cwd()
  requireMultiMode('flowkit convert:flat', cwd)

  const manifest = readFlowkitManifest(cwd)
  const { survivor, toDelete } = await resolveConvertFlatSource(args)

  if (toDelete.length) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    console.log(
      `  ${r('WARNING:')} This permanently deletes: ${toDelete.map(w => b(w)).join(', ')}`
    )
    const confirm = (await prompt(rl, `  Type "${toDelete.join(',')}" to confirm: `)).trim()
    rl.close()
    if (confirm !== toDelete.join(',')) {
      console.log(d('  Aborted — confirmation did not match.'))
      return
    }
    // Persist the manifest after each successful delete rather than once at
    // the end — if a later entry in toDelete throws (e.g. a permissions
    // error), earlier ones are already gone from disk and must not remain
    // listed in flowkit.workspaces as a phantom entry.
    let remainingWorkspaces = manifest.workspaces
    for (const name of toDelete) {
      const wsDir = path.join(cwd, workspaceEntryPath(manifest, name))
      assertScopedConsumerWorkspaceDir(wsDir, name, cwd)
      if (fs.existsSync(wsDir)) fs.rmSync(wsDir, { recursive: true, force: true })
      const { [name]: _removed, ...rest } = remainingWorkspaces
      remainingWorkspaces = rest
      writeFlowkitManifest({ workspaces: remainingWorkspaces }, cwd)
    }
    manifest.workspaces = remainingWorkspaces
    manifest.workspaceNames = Object.keys(remainingWorkspaces)
  }

  const survivorDir = path.join(cwd, workspaceEntryPath(manifest, survivor))
  assertScopedConsumerWorkspaceDir(survivorDir, survivor, cwd)
  if (!fs.existsSync(survivorDir)) {
    console.error(r(`✗ Workspace folder not found: ${survivorDir}`))
    process.exit(1)
  }

  const collisions = WORKSPACE_ENTRIES.filter(entry => fs.existsSync(path.join(cwd, entry)))
  if (collisions.length) {
    console.error(
      r(
        `✗ Project root already has: ${collisions.join(', ')}. ` +
          `Refusing to overwrite — remove or rename these first.`
      )
    )
    process.exit(1)
  }

  try {
    stagedMove(survivorDir, WORKSPACE_ENTRIES, tmpDir => {
      // Collisions were checked above, before anything was staged, so this
      // final move (last step) shouldn't hit an existing-destination error.
      // If it still throws partway (e.g. a permissions error), stagedMove's
      // catch rolls back whatever's left in tmpDir — but entries already
      // moved to `cwd` by this point won't un-move. Checking collisions
      // upfront is what keeps that window narrow, not eliminates it entirely.
      moveEntries(tmpDir, cwd, WORKSPACE_ENTRIES)
      fs.rmSync(survivorDir, { recursive: true, force: true })
      clearFlowkitManifest(cwd)
    })
  } catch (err) {
    console.error(r(`✗ Conversion failed: ${err.message}`))
    process.exit(1)
  }

  // Same reasoning as convert:multi's writeMultiViteConfig() call (flowkit-mono.js) —
  // vite.config.ts must be rewritten to the flat-mode template (no workspaceRoot) or
  // the dev server/build keeps looking for a workspaceRoot subfolder that no longer exists.
  try {
    writeFlatViteConfig(cwd)
  } catch (err) {
    console.error(r(`✗ Files moved, but failed to update vite.config.ts: ${err.message}`))
    console.error(d(`  Fix manually: flowkit() with no options`))
    process.exit(1)
  }

  console.log(g('✓') + ' Converted to flat mode')
  console.log(g('✓') + ' Workspace content moved to project root')
}
