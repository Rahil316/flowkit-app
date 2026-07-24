// Platform command: workspace lifecycle (new/remove/watch) for developing this monorepo's own
// FlowKit engine — i.e. this checkout's own internal workspaces/ dir. Distinct from
// flowkit-app.js/flowkit-mono.js, which handle the equivalent lifecycle for consumer projects
// that install the published `flowkit` package.
import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { execSync, spawn } from 'child_process'
import {
  ROOT,
  workspacePath,
  requireRepoMode,
  assertScopedWorkspaceDir,
  listWorkspaceDirs,
} from '../helpers/paths.js'
import { g, r, b, d, c } from '../helpers/colors.js'
import { copyDirRecursive } from '../helpers/fs-copy.js'
import {
  writeWorkspaceRegistry,
  syncWorkspaceRegistry,
  workspaceScaffold,
  parseStringFlag,
} from '../helpers/registry.js'
import { prompt, selectFromList } from '../helpers/prompt.js'
import { assertKebab, ValidationError } from '../helpers/validate.js'
import { FLOW_BOOK_DIRNAME } from '../helpers/config-filenames.js'
import { specContext } from './agent-spec.js'
import { renderAgentFiles, renderProjectStub, writeAgentMeta, MEMORY_FILE } from './agent-sync.js'

export function restartVite() {
  try {
    execSync('lsof -ti :5173 | xargs kill -9', { stdio: 'pipe' })
  } catch (_) {}
  const child = spawn('npm', ['run', 'dev'], {
    cwd: ROOT,
    detached: true,
    stdio: 'ignore',
    env: { ...process.env },
  })
  child.unref()
  console.log(g('✓') + ' Dev server restarted on ' + b('http://localhost:5173'))
}

const copyFolderRecursiveSync = copyDirRecursive

export async function cmdNewWorkspace(val) {
  requireRepoMode(
    'flowkit nw',
    'To create a new FlowKit project, run:\n    npm create flowkit-app@latest <project-name>'
  )
  let wsName = (val || '').trim()
  if (!wsName) {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    wsName = (await prompt(rl, c('? ') + 'Workspace name (e.g. my-app-ios): ')).trim()
    rl.close()
  }
  if (!wsName) {
    console.error(r('✗ Workspace name required.'))
    process.exit(1)
  }
  try {
    wsName = assertKebab(wsName, 'Workspace name')
  } catch (e) {
    if (e instanceof ValidationError) {
      console.error(r(`✗ ${e.message}`))
      process.exit(1)
    }
    throw e
  }

  const wsDir = workspacePath(wsName)
  assertScopedWorkspaceDir(wsDir, wsName)
  if (fs.existsSync(wsDir)) {
    console.error(r(`✗ Workspace already exists: workspaces/${wsName}/`))
    process.exit(1)
  }

  const THEMES_DIR = path.join(ROOT, 'src/kits/shared/tokens/themes')
  const STANDALONE_DIR = path.join(ROOT, 'src/kits/standalone')

  // ── Kit ──────────────────────────────────────────────────────────────────
  const sharedKits = fs.existsSync(THEMES_DIR)
    ? fs
        .readdirSync(THEMES_DIR)
        .filter(f => f.endsWith('.css'))
        .map(f => f.replace(/\.css$/, ''))
        .sort()
    : []

  const standaloneKits = fs.existsSync(STANDALONE_DIR)
    ? fs
        .readdirSync(STANDALONE_DIR)
        .filter(d => {
          const p = path.join(STANDALONE_DIR, d)
          return fs.statSync(p).isDirectory() && fs.existsSync(path.join(p, 'index.css'))
        })
        .sort()
    : []

  const allKitSlugs = [...sharedKits, ...standaloneKits]
  const kitOptions = [
    'none — plain tokens, no kit theme',
    ...sharedKits.map(k => `${k} — shared kit`),
    ...standaloneKits.map(k => {
      let label = k
      const metaPath = path.join(STANDALONE_DIR, k, 'kit.json')
      if (fs.existsSync(metaPath)) {
        try {
          label = JSON.parse(fs.readFileSync(metaPath, 'utf8')).name ?? k
        } catch {
          /* use slug */
        }
      }
      return `${k} — standalone  (${label})`
    }),
  ]

  let selectedKit = 'none'
  const kitFlag = parseStringFlag(process.argv, 'kit')
  if (kitFlag) {
    const cleanFlag = kitFlag.toLowerCase().trim()
    if (cleanFlag === 'none' || allKitSlugs.includes(cleanFlag)) {
      selectedKit = cleanFlag
    } else {
      console.error(
        r(`✗ Invalid kit: ${kitFlag}. Supported: ${[...allKitSlugs, 'none'].join(', ')}.`)
      )
      process.exit(1)
    }
  } else {
    console.log(c('? ') + 'Design kit (↑↓ Enter):')
    const selection = await selectFromList(kitOptions, null)
    console.log('\n')
    selectedKit = selection.split(' —')[0].trim()
  }

  const isStandaloneKit = standaloneKits.includes(selectedKit)
  const emptyFlag = process.argv.includes('--empty')
  const scaffold = workspaceScaffold(wsName, selectedKit, isStandaloneKit, emptyFlag)
  for (const [relPath, content] of Object.entries(scaffold)) {
    const fullPath = path.join(wsDir, relPath)
    try {
      fs.mkdirSync(path.dirname(fullPath), { recursive: true })
      fs.writeFileSync(fullPath, content)
    } catch (err) {
      console.error(r(`✗ Write failed (${relPath}): ${err.message}`))
      console.log(d('  Rolling back — removing partial workspace…'))
      fs.rmSync(wsDir, { recursive: true, force: true })
      process.exit(1)
    }
    console.log(g('✓') + ' ' + b(`workspaces/${wsName}/${relPath}`))
  }

  for (const dir of [
    'lib/components/ui',
    'lib/components/layout',
    'lib/components/navigation',
    'lib/components/forms',
    'lib/hooks',
    'lib/assets',
  ]) {
    fs.mkdirSync(path.join(wsDir, dir), { recursive: true })
    fs.writeFileSync(path.join(wsDir, dir, '.gitkeep'), '')
  }

  // Stub logo — replace with workspace-specific asset to customise the switcher avatar.
  const stubLogo = path.join(ROOT, 'assets/logos/flowKit/app_icon.png')
  const logoDir = path.join(wsDir, 'lib/assets')
  if (fs.existsSync(stubLogo)) {
    fs.copyFileSync(stubLogo, path.join(logoDir, 'logo.png'))
    console.log(
      g('✓') +
        ' ' +
        b(`workspaces/${wsName}/lib/assets/logo.png`) +
        d(' (stub — replace with your own)')
    )
  }

  // FlowLens session library — workspace-scoped, lives with workspace data.
  const flowLensBase = path.join(workspacePath(wsName), 'lib', 'flowLens')
  fs.mkdirSync(path.join(flowLensBase, 'sessions', 'initial-study'), { recursive: true })
  fs.mkdirSync(path.join(flowLensBase, 'reports'), { recursive: true })
  fs.writeFileSync(
    path.join(flowLensBase, 'studies.json'),
    JSON.stringify(
      {
        workspace: wsName,
        activeStudyId: 'initial-study',
        studies: [
          {
            id: 'initial-study',
            name: 'Initial Study',
            status: 'active',
            createdAt: new Date().toISOString(),
            archivedAt: null,
            description: '',
          },
        ],
      },
      null,
      2
    ) + '\n'
  )
  fs.writeFileSync(path.join(flowLensBase, 'sessions', 'initial-study', '.gitkeep'), '')
  console.log(g('✓') + ' FlowLens library: ' + b(`workspaces/${wsName}/lib/flowLens/`))

  // ── Agent files — generated from the single-source spec for the chosen agent ──
  const agentCtx = specContext({
    name: wsName,
    kit: selectedKit,
    isStandalone: isStandaloneKit,
  })
  const agentFiles = renderAgentFiles(agentCtx)
  for (const [rel, content] of Object.entries(agentFiles)) {
    const full = path.join(wsDir, rel)
    fs.mkdirSync(path.dirname(full), { recursive: true })
    fs.writeFileSync(full, content)
    console.log(g('✓') + ' ' + b(`workspaces/${wsName}/${rel}`))
  }
  // project.md is hand-owned — write the stub once, never regenerated.
  fs.writeFileSync(path.join(wsDir, '.agent', 'project.md'), renderProjectStub(wsName))
  console.log(g('✓') + ' ' + b(`workspaces/${wsName}/.agent/project.md`))
  writeAgentMeta(wsName, agentCtx)
  console.log(g('✓') + ' Agent: ' + b(MEMORY_FILE))

  if (selectedKit !== 'none') {
    const kitType = isStandaloneKit ? 'standalone' : 'shared'
    const cssPath = isStandaloneKit
      ? `@flowkit/kits/standalone/${selectedKit}/index.css`
      : '@kit/index.css'
    console.log(g('✓') + ' Kit: ' + b(`[${selectedKit}]`) + d(` — ${kitType}, via ${cssPath}`))
  }
  console.log(g('✓') + ' Demo content: ' + b(emptyFlag ? 'empty (--empty)' : 'game demo'))

  const existing = listWorkspaceDirs()
  const kitMap = {}
  if (selectedKit !== 'none') kitMap[wsName] = selectedKit
  writeWorkspaceRegistry(
    existing.includes(wsName) ? existing : [...existing, wsName],
    wsName,
    kitMap
  )
  console.log('')
  console.log(g('✓') + ' Workspace created: ' + b(`workspaces/${wsName}/`))
  console.log(d(`  Platform registry updated: src/workspaces.ts`))
  console.log(
    d(`  Open `) +
      b('http://localhost:5173') +
      d(` and select "${wsName}" from the workspace switcher.`)
  )
}

export async function cmdRemoveWorkspace(val) {
  requireRepoMode(
    'flowkit rw',
    'An author project is a single workspace — there is nothing to remove this way.\n' +
      '  Delete the project directory yourself if you want to start over.'
  )

  const existing = listWorkspaceDirs()

  let wsName = val
  if (!wsName) {
    if (!existing.length) {
      console.log(d('  No workspaces found.'))
      return
    }
    console.log(c('? ') + 'Select workspace to remove (↑↓ Enter):')
    wsName = await selectFromList(existing, null)
    console.log('\n')
  }

  const wsDir = workspacePath(wsName)
  assertScopedWorkspaceDir(wsDir, wsName)
  if (!fs.existsSync(wsDir)) {
    console.error(r(`✗ Workspace not found: ${wsDir}`))
    process.exit(1)
  }

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  console.log(`  ${r('WARNING:')} This permanently deletes all files in ${b(wsDir)}`)
  const confirm = (await prompt(rl, `  Type the workspace name to confirm: `)).trim()
  rl.close()
  if (confirm !== wsName) {
    console.log(d('  Aborted — name did not match.'))
    return
  }

  // Re-checked post-confirmation: the prompt's async readline await is a window
  // where nothing re-validates wsDir. Cheap insurance against any future caller
  // that races a workspace rename/removal between the two checks above.
  assertScopedWorkspaceDir(wsDir, wsName)
  fs.rmSync(wsDir, { recursive: true, force: true })
  console.log(g('✓') + ' Removed: ' + b(wsDir))

  // Sessions live in workspaces/<ws>/lib/flowLens/ — already removed by wsDir rmSync above.
  syncWorkspaceRegistry()
  console.log(g('✓') + ' Platform registry updated: src/workspaces.ts')
}

export async function cmdWatch(val) {
  requireRepoMode(
    'flowkit watch',
    `\`npm run dev\` already watches your ${FLOW_BOOK_DIRNAME}/ — no separate watcher needed.`
  )

  const existing = listWorkspaceDirs()

  let wsName = val
  if (!wsName) {
    if (!existing.length) {
      console.error(r('✗ No workspaces found.'))
      process.exit(1)
    }
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
    console.log(c('? ') + 'Select workspace to watch (↑↓ Enter):')
    wsName = await selectFromList(existing, null)
    rl.close()
    console.log('\n')
  }

  if (!existing.includes(wsName)) {
    console.error(r(`✗ Workspace not found: workspaces/${wsName}/`))
    process.exit(1)
  }

  writeWorkspaceRegistry(existing, wsName)
  console.log(g('✓') + ' Active workspace: ' + b(wsName))
  restartVite()

  const watchDir = path.join(workspacePath(wsName), FLOW_BOOK_DIRNAME)
  console.log(d(`  Watching ${b(`workspaces/${wsName}/${FLOW_BOOK_DIRNAME}/`)} for changes…`))
  console.log(d('  Vite handles hot reload — save any screen file to trigger a refresh.'))
  fs.watch(watchDir, { recursive: true }, (_event, filename) => {
    if (!filename || (!filename.endsWith('.ts') && !filename.endsWith('.tsx'))) return
    process.stdout.write(d(`  [watch] ${filename} changed\n`))
  })

  process.stdin.resume()
  process.on('SIGINT', () => {
    console.log('\n' + d('  Watch stopped.'))
    process.exit(0)
  })
}
