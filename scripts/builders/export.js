// Builder: standalone HTML export pipeline. Same guided flow in both modes —
// flowkit export prompts for workspace (only when 2+ candidates exist: repo
// mode with multiple workspaces/, or multi-workspace consumer mode) then
// always prompts for an export profile (reading flowkit.json's
// exportProfiles) — or pass --profile:<name> / --workspace:<name> to skip
// either prompt. No FlowLens on/off distinction right now — every export
// always ships the full codebase (proper feature-gating is a future task).
import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import { ROOT, workspacePath, listWorkspaceDirs, isRepoMode } from '../helpers/paths.js'
import {
  isMultiMode,
  readFlowkitManifest,
  workspaceEntryPath,
} from '../helpers/flowkit-manifest.js'
import { parseStringFlag } from '../helpers/args.js'
import { g, r, b, d, c } from '../helpers/colors.js'
import { selectFromList } from '../helpers/prompt.js'
import { PROJECT_CONFIG_FILENAME } from '../helpers/config-filenames.js'
import { readProjectConfig, runConsumerExport, runRepoExport } from './run-export.js'

function runCheck(label, cmd, cwd) {
  process.stdout.write(`  ${d('checking')} ${label}… `)
  try {
    execSync(cmd, { cwd, stdio: 'pipe' })
    process.stdout.write(g('✓') + '\n')
    return true
  } catch (e) {
    process.stdout.write(r('✗') + '\n')
    const out = (e.stdout?.toString() ?? '') + (e.stderr?.toString() ?? '')
    const lines = out.split('\n').filter(Boolean).slice(0, 40)
    lines.forEach(l => console.log('  ' + d(l)))
    if (out.split('\n').length > 40) console.log(d('  … (truncated)'))
    return false
  }
}

const DEFAULT_PROFILE_LABEL = 'Default (full export)'

/** Resolves --profile:<name> or prompts; always offers the no-profile default. */
async function resolveProfile(args, exportProfiles) {
  const profileFlag = parseStringFlag(args, 'profile')
  let profileName
  if (profileFlag) {
    if (profileFlag !== 'default' && !exportProfiles[profileFlag]) {
      console.error(r(`✗ Profile not found in ${PROJECT_CONFIG_FILENAME}: ${profileFlag}`))
      process.exit(1)
    }
    profileName = profileFlag
  } else {
    const profileKeys = Object.keys(exportProfiles)
    const options = [DEFAULT_PROFILE_LABEL, ...profileKeys]
    let selection
    if (options.length === 1) {
      selection = options[0]
    } else {
      console.log(c('? ') + 'Select export profile (↑↓ Enter):')
      selection = await selectFromList(options)
      console.log('\n')
    }
    profileName = selection === DEFAULT_PROFILE_LABEL ? 'default' : selection
  }
  const profile = profileName === 'default' ? {} : exportProfiles[profileName]
  return { profileName, profile }
}

function reportResult(finalPath, relativeTo) {
  const bytes = fs.statSync(finalPath).size
  const kb = (bytes / 1024).toFixed(1)
  const mb = bytes / (1024 * 1024)
  console.log('')
  console.log(g('✓') + ' Exported: ' + b(path.relative(relativeTo, finalPath)))
  console.log(d(`  ${kb} KB — fully self-contained, open in any browser`))
  if (mb > 10) {
    console.log(
      r(
        `  ⚠ File is ${mb.toFixed(1)} MB — large assets may be inlined. Consider removing static imports of images/fonts.`
      )
    )
  }
}

export async function cmdExport(_val, args = []) {
  if (isRepoMode()) return _cmdExportRepo(args)
  return _cmdExportConsumer(args)
}

// ── Repo mode ────────────────────────────────────────────────────────────────

async function _cmdExportRepo(args) {
  const existing = listWorkspaceDirs()
  if (!existing.length) {
    console.error(r('✗ No workspaces found.'))
    process.exit(1)
  }

  const workspaceFlag = parseStringFlag(args, 'workspace')
  let workspaceName
  if (workspaceFlag) {
    if (!existing.includes(workspaceFlag)) {
      console.error(r(`✗ Workspace not found: ${workspaceFlag}`))
      process.exit(1)
    }
    workspaceName = workspaceFlag
  } else if (existing.length === 1) {
    workspaceName = existing[0]
  } else {
    console.log(c('? ') + 'Select workspace to export (↑↓ Enter):')
    workspaceName = await selectFromList(existing)
    console.log('\n')
  }

  const projectConfig = readProjectConfig(ROOT)
  const { profileName, profile } = await resolveProfile(args, projectConfig.exportProfiles)

  console.log('')
  console.log(b(` Exporting: ${workspaceName}`))
  console.log(d(' ────────────────────────────────────'))

  const wsDir = workspacePath(workspaceName)
  const tscOk = runCheck('TypeScript', 'npx tsc --noEmit', ROOT)
  const lintOk = runCheck('ESLint', `npx eslint "${wsDir}" --max-warnings 0`, ROOT)
  console.log('')

  if (!tscOk || !lintOk) {
    console.error(r(`✗ Export blocked for "${workspaceName}" — fix errors above.`))
    process.exit(1)
  }

  try {
    const { finalPath } = await runRepoExport({
      root: ROOT,
      workspaceName,
      profileName,
      profile,
    })
    reportResult(finalPath, ROOT)
  } catch (e) {
    console.error(r(`✗ Build failed for "${workspaceName}": ${e.message}`))
    process.exit(1)
  }
}

// ── Consumer mode (flat/multi-workspace) ────────────────────────────────────

/**
 * Checks the consumer project's own node_modules for vite-plugin-singlefile;
 * installs it if missing.
 *
 * If flowkit itself is currently installed via a `file:` spec as a real
 * directory copy (--local-dev / contributor testing, per each scaffolder's
 * own documented --install-links rationale), a plain `npm install` here
 * would silently re-resolve it back into a symlink, which breaks
 * isRepoMode() detection (see scripts/helpers/paths.js). Re-apply
 * --install-links in that case so this install doesn't undo that.
 */
function ensureSinglefilePlugin(projectRoot) {
  const pluginPath = path.join(projectRoot, 'node_modules', 'vite-plugin-singlefile')
  if (fs.existsSync(pluginPath)) return
  console.log(d('  Installing vite-plugin-singlefile (first standalone export)...'))
  const flowkitLinkPath = path.join(projectRoot, 'node_modules', 'flowkit')
  const isFlowkitRealDir =
    fs.existsSync(flowkitLinkPath) && !fs.lstatSync(flowkitLinkPath).isSymbolicLink()
  const installLinksFlag = isFlowkitRealDir ? ' --install-links' : ''
  execSync(`npm install --save-dev vite-plugin-singlefile${installLinksFlag}`, {
    cwd: projectRoot,
    stdio: 'inherit',
  })
}

async function _cmdExportConsumer(args) {
  const projectRoot = process.cwd()

  // ── Workspace step — only asked in multi-mode with 2+ workspaces ──────────
  let workspaceName
  const workspaceFlag = parseStringFlag(args, 'workspace')
  if (isMultiMode(projectRoot)) {
    const manifest = readFlowkitManifest(projectRoot)
    if (!manifest.workspaceNames.length) {
      console.error(r('✗ No workspaces found.'))
      process.exit(1)
    }
    if (workspaceFlag) {
      if (!manifest.workspaceNames.includes(workspaceFlag)) {
        console.error(r(`✗ Workspace not found in flowkit.workspaces: ${workspaceFlag}`))
        process.exit(1)
      }
      workspaceName = workspaceFlag
    } else if (manifest.workspaceNames.length === 1) {
      workspaceName = manifest.workspaceNames[0]
    } else {
      console.log(c('? ') + 'Select workspace to export (↑↓ Enter):')
      workspaceName = await selectFromList(manifest.workspaceNames)
      console.log('\n')
    }
  } else {
    workspaceName = path.basename(projectRoot)
  }
  const resolvedWorkspacePath = isMultiMode(projectRoot)
    ? workspaceEntryPath(readFlowkitManifest(projectRoot), workspaceName)
    : '.'

  const projectConfig = readProjectConfig(projectRoot)
  const { profileName, profile } = await resolveProfile(args, projectConfig.exportProfiles)

  // ── Pre-flight checks (reused, already mode-safe) ─────────────────────────
  const wsDir = workspacePath(workspaceName)
  const tscOk = runCheck('TypeScript', 'npx tsc --noEmit', projectRoot)
  // Scaffolded consumer projects don't ship an ESLint config today — skip the
  // check entirely rather than hard-fail on a missing-config crash unrelated
  // to real code errors. tsc still gates the export.
  const hasEslintConfig = [
    'eslint.config.js',
    'eslint.config.mjs',
    'eslint.config.cjs',
    '.eslintrc.json',
    '.eslintrc.js',
    '.eslintrc.cjs',
  ].some(f => fs.existsSync(path.join(projectRoot, f)))
  let lintOk = true
  if (hasEslintConfig) {
    lintOk = runCheck('ESLint', `npx eslint "${wsDir}" --max-warnings 0`, projectRoot)
  } else {
    console.log(`  ${d('checking')} ESLint… ${d('skipped (no eslint config found)')}`)
  }
  console.log('')
  if (!tscOk || !lintOk) {
    console.error(r('✗ Export blocked — fix errors above.'))
    process.exit(1)
  }

  ensureSinglefilePlugin(projectRoot)

  try {
    const { finalPath } = await runConsumerExport({
      projectRoot,
      workspacePath: resolvedWorkspacePath,
      workspaceName,
      profileName,
      profile,
    })
    reportResult(finalPath, projectRoot)
  } catch (e) {
    console.error(r(`✗ Build failed: ${e.message}`))
    process.exit(1)
  }
}
