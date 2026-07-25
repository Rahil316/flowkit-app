// Platform command: multi-workspace conversion + workspace CRUD for consumer
// (published-package) projects — the multi-sibling-workspace shape that
// `create-flowkit-mono` scaffolds (each workspace its own sibling folder at
// project root). Distinct from flowkit-app.js (single-implicit-workspace shape)
// and flowkit-engine.js (this monorepo's own internal dev workspaces, unrelated
// to either consumer package).
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
  requireMultiMode,
  requireFlatMode,
  assertScopedConsumerWorkspaceDir,
  workspaceEntryPath,
} from '../helpers/flowkit-manifest.js'
import { parseStringFlag } from '../helpers/args.js'
import { prompt, selectFromList } from '../helpers/prompt.js'
import { g, r, b, d, c } from '../helpers/colors.js'
import {
  writeWorkspaceContent,
  writeMultiWorkspaceViteConfig,
} from '../helpers/workspace-template.js'
import { WORKSPACE_CONFIG_FILENAME } from '../helpers/config-filenames.js'
import {
  validateWorkspaceName,
  WORKSPACE_ENTRIES,
  stagedMove,
} from './workspace-consumer-shared.js'

// Multi-workspace vite.config.ts template lives in workspace-template.js
// (writeMultiWorkspaceViteConfig) — the same shared file both scaffolder
// packages already import from their own `flowkit` devDependency — so this
// command and `create-flowkit-mono` can never drift apart again the way
// they did before (scaffolder wrote a bare `flowkit()` with no options,
// silently producing an empty bundle).
const writeMultiViteConfig = writeMultiWorkspaceViteConfig

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
  // nothing re-validates wsDir — same rationale as flowkit-engine.js's cmdRemoveWorkspace.
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
