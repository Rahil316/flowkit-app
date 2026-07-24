// Platform command: flat/multi-workspace conversion + workspace CRUD for consumer
// (flat-mode) projects — i.e. anywhere flowkit is installed as a dependency, not
// this repo's own workspaces/. Distinct from scripts/platform/workspace.js (nw/rw/
// watch), which is repo-mode-only and untouched by this file.
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
  requireFlatMode,
  assertScopedConsumerWorkspaceDir,
  workspaceEntryPath,
} from '../helpers/flowkit-manifest.js'
import { parseStringFlag } from '../helpers/args.js'
import { assertKebab, ValidationError } from '../helpers/validate.js'
import { prompt, selectFromList } from '../helpers/prompt.js'
import { g, r, b, d, c } from '../helpers/colors.js'
import {
  writeWorkspaceContent,
  writeMultiWorkspaceViteConfig,
} from '../helpers/workspace-template.js'
import {
  WORKSPACE_CONFIG_FILENAME,
  FLOW_BOOK_DIRNAME,
  FLOW_STORIES_DIRNAME,
} from '../helpers/config-filenames.js'

/**
 * Validate a workspace name at the point it's first accepted, before it
 * becomes a directory name, a package.json flowkit.workspaces entry, or
 * (via any later authoring command touching the workspace config file) a
 * value interpolated into generated source — the earlier a bad name is
 * caught, the fewer downstream files can end up with it baked in. Prints a
 * clean CLI error and exits rather than letting a ValidationError escape raw.
 */
function validateWorkspaceName(name, label) {
  try {
    return assertKebab(name, label)
  } catch (e) {
    if (e instanceof ValidationError) {
      console.error(r(`✗ ${e.message}`))
      process.exit(1)
    }
    throw e
  }
}

// Everything that lives at a workspace's own root and must move/collapse together.
// Found by auditing every wsDir-relative path referenced across scripts/authoring/,
// scripts/authoring-support/, and scripts/platform/ — confirmed live: convert:multi
// originally omitted .flowkit/, leaving a project with lib/components/PriceTag.tsx
// moved into workspace-1/ but .flowkit/components.json (which references it) still
// sitting at the old project root, silently orphaned.
const WORKSPACE_ENTRIES = [
  WORKSPACE_CONFIG_FILENAME,
  'index.ts',
  FLOW_BOOK_DIRNAME,
  FLOW_STORIES_DIRNAME,
  'lib',
  '.flowkit',
  '.agent',
  '.flowkit-feedback.json',
]

// The onwarn suppression is identical in both templates — INEFFECTIVE_DYNAMIC_IMPORT
// is expected/harmless (see either scaffolder's own copy of this comment).
const VITE_CONFIG_BUILD_BLOCK = `  build: {
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        // Screens are both statically listed (for eager type-checking) and
        // dynamically imported (for code-splitting) by the virtual:flowkit/screens
        // module flowkit/vite generates — harmless by design, not a real issue.
        if (warning.code === 'INEFFECTIVE_DYNAMIC_IMPORT') return
        defaultHandler(warning)
      },
    },
  },`

/**
 * Writes the flat-mode vite.config.ts — bare flowkit(), root IS the one
 * implicit workspace. Matches packages/create-flowkit-app/index.js's template
 * exactly; keep both in sync if either changes.
 */
function writeFlatViteConfig(cwd) {
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

// Multi-workspace vite.config.ts template lives in workspace-template.js
// (writeMultiWorkspaceViteConfig) — the same shared file both scaffolder
// packages already import from their own `flowkit` devDependency — so this
// command and `create-flowkit-workspace` can never drift apart again the way
// they did before (scaffolder wrote a bare `flowkit()` with no options,
// silently producing an empty bundle).
const writeMultiViteConfig = writeMultiWorkspaceViteConfig

function moveEntries(fromDir, toDir, entries) {
  fs.mkdirSync(toDir, { recursive: true })
  for (const entry of entries) {
    const src = path.join(fromDir, entry)
    if (fs.existsSync(src)) {
      fs.renameSync(src, path.join(toDir, entry))
    }
  }
}

/**
 * Stage entries out of `sourceDir` into a temp sibling dir first, so a mid-move
 * failure never leaves `sourceDir` half-emptied. Calls `apply(tmpDir)` once
 * staging succeeds; on any error, moves the staged files back into `sourceDir`
 * and removes the temp dir, leaving `sourceDir` exactly as it was.
 */
function stagedMove(sourceDir, entries, apply) {
  const tmpDir = path.join(sourceDir, '.flowkit-convert-tmp')
  if (fs.existsSync(tmpDir)) fs.rmSync(tmpDir, { recursive: true, force: true })
  fs.mkdirSync(tmpDir, { recursive: true })
  try {
    moveEntries(sourceDir, tmpDir, entries)
    apply(tmpDir)
  } catch (err) {
    // Roll back: move anything already staged back to its original spot, then remove tmpDir.
    moveEntries(tmpDir, sourceDir, entries)
    fs.rmSync(tmpDir, { recursive: true, force: true })
    throw err
  }
}

export async function cmdConvertMulti(_val, args = []) {
  const cwd = process.cwd()
  requireFlatMode('flowkit convert:multi', cwd)

  if (!fs.existsSync(path.join(cwd, WORKSPACE_CONFIG_FILENAME))) {
    console.error(
      r(`✗ No ${WORKSPACE_CONFIG_FILENAME} found at project root — nothing to convert.`)
    )
    process.exit(1)
  }

  const name = validateWorkspaceName(
    parseStringFlag(args, 'name') || 'workspace-1',
    'Workspace name'
  )
  const targetDir = path.join(cwd, name)
  assertScopedConsumerWorkspaceDir(targetDir, name, cwd)

  if (fs.existsSync(targetDir)) {
    console.error(r(`✗ A folder named "${name}" already exists at project root.`))
    process.exit(1)
  }

  try {
    stagedMove(cwd, WORKSPACE_ENTRIES, tmpDir => {
      // Write the manifest before the final rename: if this throws, tmpDir is
      // still at its expected staged location and stagedMove's catch can roll
      // it back cleanly. Renaming first would leave nothing at tmpDir to roll
      // back if the manifest write failed right after.
      writeFlowkitManifest({ mode: 'multi', workspaces: { [name]: { path: name } } }, cwd)
      fs.renameSync(tmpDir, targetDir)
    })
  } catch (err) {
    console.error(r(`✗ Conversion failed: ${err.message}`))
    process.exit(1)
  }

  // vite.config.ts stays at project root (never part of WORKSPACE_ENTRIES —
  // it describes the project, not a workspace) but its CONTENT must change:
  // the flat-mode template has no workspaceRoot, so without rewriting it here
  // the dev server/build silently reads nothing (no workspace config file left at
  // root) and produces an empty bundle instead of erroring. Confirmed live —
  // this was the exact failure mode that originally motivated this fix.
  try {
    writeMultiViteConfig(cwd)
  } catch (err) {
    console.error(r(`✗ Files moved, but failed to update vite.config.ts: ${err.message}`))
    console.error(d(`  Fix manually: flowkit({ workspaceRoot: '${name}', standalone: true })`))
    process.exit(1)
  }

  console.log(g('✓') + ' Converted to multi-workspace mode')
  console.log(g('✓') + ' Workspace: ' + b(`${name}/`))
  console.log('')
  console.log(d(`  Add another workspace any time: `) + c(`flowkit create:workspace --name:<name>`))
}

async function resolveNewWorkspaceName(args) {
  let name = parseStringFlag(args, 'name') || args.find(a => !a.startsWith('--'))
  if (!name) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    name = (await prompt(rl, c('? ') + 'Workspace name (e.g. app-b): ')).trim()
    rl.close()
  }
  if (!name) {
    console.error(r('✗ Workspace name required.'))
    process.exit(1)
  }
  return validateWorkspaceName(name, 'Workspace name')
}

export async function cmdAddWorkspace(_val, args = []) {
  const cwd = process.cwd()
  requireMultiMode('flowkit create:workspace', cwd)

  const name = await resolveNewWorkspaceName(args)
  const manifest = readFlowkitManifest(cwd)
  if (manifest.workspaceNames.includes(name)) {
    console.error(r(`✗ Workspace "${name}" already exists in flowkit.workspaces.`))
    process.exit(1)
  }

  const wsDir = path.join(cwd, name)
  assertScopedConsumerWorkspaceDir(wsDir, name, cwd)
  if (fs.existsSync(wsDir)) {
    console.error(r(`✗ A folder named "${name}" already exists at project root.`))
    process.exit(1)
  }

  const emptyFlag = args.includes('--empty')

  try {
    fs.mkdirSync(wsDir, { recursive: true })
    writeWorkspaceContent(wsDir, name, emptyFlag)
  } catch (err) {
    console.error(r(`✗ Scaffold failed: ${err.message}`))
    fs.rmSync(wsDir, { recursive: true, force: true })
    process.exit(1)
  }

  writeFlowkitManifest({ workspaces: { ...manifest.workspaces, [name]: { path: name } } }, cwd)

  console.log(g('✓') + ' Workspace created: ' + b(`${name}/`))
  console.log(g('✓') + ' Demo content: ' + b(emptyFlag ? 'empty (--empty)' : 'game demo'))
  console.log(d(`  package.json flowkit.workspaces updated.`))
}

export async function cmdRemoveWorkspace(_val, args = []) {
  const cwd = process.cwd()
  requireMultiMode('flowkit remove:workspace', cwd)

  const manifest = readFlowkitManifest(cwd)
  let name = parseStringFlag(args, 'name') || args.find(a => !a.startsWith('--'))
  if (!name) {
    if (!manifest.workspaceNames.length) {
      console.log(d('  No workspaces found.'))
      return
    }
    console.log(c('? ') + 'Select workspace to remove (↑↓ Enter):')
    name = await selectFromList(manifest.workspaceNames)
    console.log('\n')
  }

  if (!manifest.workspaceNames.includes(name)) {
    console.error(r(`✗ Workspace not found in flowkit.workspaces: ${name}`))
    process.exit(1)
  }

  const wsDir = path.join(cwd, workspaceEntryPath(manifest, name))
  assertScopedConsumerWorkspaceDir(wsDir, name, cwd)
  if (!fs.existsSync(wsDir)) {
    console.error(r(`✗ Workspace folder not found: ${wsDir}`))
    process.exit(1)
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  console.log(`  ${r('WARNING:')} This permanently deletes all files in ${b(wsDir)}`)
  const confirm = (await prompt(rl, `  Type the workspace name to confirm: `)).trim()
  rl.close()
  if (confirm !== name) {
    console.log(d('  Aborted — name did not match.'))
    return
  }

  // Re-checked post-confirmation: the async readline await is a window where
  // nothing re-validates wsDir — same rationale as workspace.js's cmdRemoveWorkspace.
  assertScopedConsumerWorkspaceDir(wsDir, name, cwd)
  fs.rmSync(wsDir, { recursive: true, force: true })

  const { [name]: _removed, ...remainingWorkspaces } = manifest.workspaces
  writeFlowkitManifest({ workspaces: remainingWorkspaces }, cwd)

  console.log(g('✓') + ' Removed: ' + b(wsDir))
  console.log(d(`  package.json flowkit.workspaces updated.`))
}

export async function cmdRenameWorkspace(_val, args = []) {
  const cwd = process.cwd()
  requireMultiMode('flowkit rename:workspace', cwd)

  const positional = args.filter(a => !a.startsWith('--'))
  const oldName = parseStringFlag(args, 'from') || positional[0]
  let newName = parseStringFlag(args, 'to') || positional[1]

  if (!oldName || !newName) {
    console.error(r('✗ Usage: flowkit rename:workspace <old> <new>'))
    process.exit(1)
  }
  newName = validateWorkspaceName(newName, 'New workspace name')

  const manifest = readFlowkitManifest(cwd)
  if (!manifest.workspaceNames.includes(oldName)) {
    console.error(r(`✗ Workspace not found in flowkit.workspaces: ${oldName}`))
    process.exit(1)
  }
  if (manifest.workspaceNames.includes(newName)) {
    console.error(r(`✗ Workspace "${newName}" already exists in flowkit.workspaces.`))
    process.exit(1)
  }

  const oldDir = path.join(cwd, workspaceEntryPath(manifest, oldName))
  const newDir = path.join(cwd, newName)
  assertScopedConsumerWorkspaceDir(oldDir, oldName, cwd)
  assertScopedConsumerWorkspaceDir(newDir, newName, cwd)

  if (!fs.existsSync(oldDir)) {
    console.error(r(`✗ Workspace folder not found: ${oldDir}`))
    process.exit(1)
  }
  if (fs.existsSync(newDir)) {
    console.error(r(`✗ A folder named "${newName}" already exists at project root.`))
    process.exit(1)
  }

  fs.renameSync(oldDir, newDir)
  const { [oldName]: _renamed, ...otherWorkspaces } = manifest.workspaces
  writeFlowkitManifest({ workspaces: { ...otherWorkspaces, [newName]: { path: newName } } }, cwd)

  console.log(g('✓') + ' Renamed: ' + b(`${oldName}/`) + ' → ' + b(`${newName}/`))
  console.log(d(`  package.json flowkit.workspaces updated.`))
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

  // Same reasoning as convert:multi's writeMultiViteConfig() call — vite.config.ts
  // must be rewritten to the flat-mode template (no workspaceRoot) or the dev
  // server/build keeps looking for a workspaceRoot subfolder that no longer exists.
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
