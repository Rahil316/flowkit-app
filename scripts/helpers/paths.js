// Helper: root/mode resolution, workspace path safety, and repo/flat-mode detection.
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { readFlowkitManifest, isMultiMode, workspaceEntryPath } from './flowkit-manifest.js'
import { FLOW_BOOK_DIRNAME } from './config-filenames.js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
export const ROOT = path.resolve(__dirname, '../..')
export const WORKSPACES_DIR = path.join(ROOT, 'workspaces')
export const PLATFORM_WORKSPACES_FILE = path.join(ROOT, 'src', 'workspaces.ts')
export const WORKSPACES_JSON = path.join(ROOT, 'src', 'workspaces.json')

export function readWorkspacesJson() {
  try {
    return JSON.parse(fs.readFileSync(WORKSPACES_JSON, 'utf8'))
  } catch {
    return { workspaces: [], active: null }
  }
}

export function writeWorkspacesJson(data) {
  fs.writeFileSync(WORKSPACES_JSON, JSON.stringify(data, null, 2) + '\n')
}

export function listWorkspaceDirs() {
  if (!fs.existsSync(WORKSPACES_DIR)) return []
  return fs
    .readdirSync(WORKSPACES_DIR)
    .filter(d => fs.statSync(path.join(WORKSPACES_DIR, d)).isDirectory())
}

// ── Flat-mode detection ───────────────────────────────────────────────────────
//
// Repo mode:  flowkit is running from its own source tree (this platform repo).
// Flat mode:  flowkit is installed as a dependency inside an author's project.
//
// History of this check, because it has broken twice for two different reasons:
//
// 1. Originally keyed off whether CWD has a workspaces/ directory. Wrong — this
//    repo can legitimately have zero workspaces (freshly cloned, between `nw`
//    and the first workspace, or mid single-workspace migration) while still
//    being repo mode. When it misfired, `workspacePath()` fell through to its
//    flat-mode branch (`return process.cwd()`), and `flowkit rw` run from the
//    repo root deleted the entire repo.
// 2. Fixed by keying off `node_modules` appearing in ROOT's path (a structural
//    fact of how flowkit was installed, which can't drift the way a
//    directory's contents can) — but this broke too: `npm install` on a
//    `file:` dependency (exactly what create-flowkit-app's --local-dev escape
//    hatch produces, and what `npm link` produces) creates a SYMLINK, not a
//    copy, under node_modules. `import.meta.url` resolves through that symlink
//    to ROOT's realpath, which has no `node_modules` segment at all — so a
//    flat-mode project using a symlinked flowkit dependency was misdetected as
//    repo mode, pointing every workspace-scoped path at the real monorepo on
//    the developer's machine instead of the flat project. Confirmed live by
//    scaffolding via create-flowkit-app and running `flowkit status` from
//    inside it.
//
// Current approach: a marker file (.flowkit-repo-root) at this repo's actual
// root, tracked in git, deliberately excluded from package.json's "files"
// allowlist so it never ships to any real install — npm registry, git dep, or
// `file:` dep, symlinked or copied. Its presence is the one signal that
// distinguishes "the real monorepo checkout" from any way flowkit can be
// consumed as a dependency, and its absence fails toward the SAFE direction
// (repo-only commands get wrongly blocked, not wrongly allowed against the
// wrong ROOT).

const REPO_ROOT_MARKER = path.join(ROOT, '.flowkit-repo-root')

export function isRepoMode() {
  return fs.existsSync(REPO_ROOT_MARKER)
}

/**
 * Resolve the correct import line for a `defineX` helper (defineFlow,
 * defineConfig, etc.) for whichever mode is currently active — repo mode
 * imports from the internal @flowkit-core/config alias, flat/multi-workspace
 * mode imports from the published 'flowkit' package.
 *
 * Single source of truth for this decision. Before this existed, commands
 * that generate a brand-new file from scratch (no existing import line to
 * round-trip, unlike config-patch.js's read-modify-write flow) each hardcoded
 * one mode's import path directly — confirmed live: scripts/authoring/
 * flowStories.js's create:flowStory hardcoded 'flowkit' (wrong in repo mode) and
 * scripts/authoring/promote-flow.js hardcoded '@flowkit-core/config' (wrong
 * in flat/multi-workspace mode), each breaking the opposite mode's build.
 */
export function resolveDefineImport(exportName) {
  return isRepoMode()
    ? `import { ${exportName} } from '@flowkit-core/config'`
    : `import { ${exportName} } from 'flowkit'`
}

/**
 * Same mode-branch as resolveDefineImport(), for type-only imports whose
 * repo-mode home is @flowkit/types rather than @flowkit-core/config (e.g.
 * PageProps) — both resolve to the published 'flowkit' package's own
 * public entry point in flat/multi-workspace consumer mode.
 */
export function resolveTypeImport(typeName) {
  return isRepoMode()
    ? `import type { ${typeName} } from '@flowkit/types'`
    : `import type { ${typeName} } from 'flowkit'`
}

/**
 * Resolve the root directory for a workspace's files.
 * Repo mode: ROOT/workspaces/<name>
 * Flat mode (consumer project, no flowkit.mode: "multi" declared): process.cwd()
 *   — the author project root is the one implicit workspace; `name` is ignored,
 *   same as always.
 * Multi-workspace mode (consumer project, flowkit.mode: "multi" in package.json):
 *   process.cwd()/<declared path> if `name` is a real entry in flowkit.workspaces,
 *   else process.cwd()/<first workspace's declared path> — matches the same
 *   "first entry" convention the generated vite.config.ts uses
 *   (scripts/helpers/workspace-template.js's callers), so `flowkit create:chapter`
 *   (no --workspace flag) and `npm run dev` target the same workspace by
 *   default. The declared `path` (not just the workspace name) is what's
 *   joined onto cwd — see workspaceEntryPath() — so a workspace whose folder
 *   doesn't match its own name still resolves correctly.
 *
 * Without this branch, every authoring command (create:chapter, create:page,
 * components:ls, etc.) run from a multi-workspace project's root always
 * resolved to root itself — never a named workspace subfolder — silently
 * operating on nothing or the wrong directory. Confirmed live: components:ls
 * reported zero components immediately after `convert:multi` moved
 * .flowkit/components.json into workspace-1/, because workspacePath('workspace-1')
 * returned project root, not workspace-1/.
 */
export function workspacePath(name) {
  if (isRepoMode()) return path.join(ROOT, 'workspaces', name ?? '')
  const cwd = process.cwd()
  if (!isMultiMode(cwd)) return cwd
  const manifest = readFlowkitManifest(cwd)
  const resolvedName =
    name && manifest.workspaceNames.includes(name) ? name : manifest.workspaceNames[0]
  if (!resolvedName) return cwd
  return path.join(cwd, workspaceEntryPath(manifest, resolvedName))
}

/**
 * Resolve the active workspace's display name.
 * Flat mode: the author project has exactly one implicit workspace — use its
 * directory's own name rather than a hardcoded placeholder.
 * Multi-workspace mode: the first entry in flowkit.workspaces (see workspacePath()
 * above for why "first entry" is the shared default convention).
 * Repo mode: read from src/workspaces.json, falling back to the first
 * workspace directory found.
 */
export function getActiveWorkspaceName() {
  if (!isRepoMode()) {
    const cwd = process.cwd()
    if (isMultiMode(cwd)) {
      const { workspaceNames } = readFlowkitManifest(cwd)
      if (workspaceNames[0]) return workspaceNames[0]
    }
    return path.basename(cwd)
  }
  try {
    const data = readWorkspacesJson()
    if (data.active && fs.existsSync(path.join(WORKSPACES_DIR, data.active))) {
      return data.active
    }
  } catch {
    /* fallthrough */
  }
  const dirs = listWorkspaceDirs()
  return dirs[0] ?? null
}

/**
 * Call at the top of any CLI command that only makes sense in repo mode.
 * Prints a consistent flat-mode message and exits — replaces hand-copied
 * console.log blocks per command.
 */
export function requireRepoMode(commandLabel, flatModeHint) {
  if (isRepoMode()) return
  console.log('')
  console.log(`✗ ${commandLabel} is not available in author (flat) projects.`)
  if (flatModeHint) console.log(`  ${flatModeHint}`)
  console.log('')
  process.exit(1)
}

/**
 * Call at the top of any repo-mode command that needs a real active
 * workspace and can't proceed without one. Returns the resolved name, or
 * prints a consistent message and exits.
 *
 * getActiveWorkspaceName() used to fall back to the hardcoded literal
 * 'demo' when zero workspaces existed, defeating every caller's own "no
 * active workspace" guard — confirmed live: `flowkit help` reported "Active
 * workspace: demo" and `flowkit status` then failed with "Workspace not
 * found" for a workspace that was never real. This is the replacement
 * chokepoint callers that truly can't proceed without one should use.
 */
export function requireActiveWorkspace(commandLabel) {
  const ws = getActiveWorkspaceName()
  if (ws) return ws
  console.log('')
  console.log(`✗ ${commandLabel}: no workspace exists yet.`)
  console.log(`  Create one: flowkit nw <name>`)
  console.log('')
  process.exit(1)
}

/**
 * Hard safety net for any code path about to recursively delete a named
 * workspace's directory. Throws rather than deleting if the resolved path
 * collapses onto ROOT or a filesystem root — which should never happen for a
 * *named* workspace, and only would if isRepoMode()/workspacePath() regress
 * the way they did once before (see note above isRepoMode()).
 *
 * process.cwd() is unsafe to flag unconditionally: in repo mode a named
 * workspace should always be a subdirectory of ROOT, never cwd itself, so
 * cwd collapsing onto wsDir is a real misresolution. In flat mode, though,
 * workspacePath() correctly returns process.cwd() for every call — the
 * author project root IS the one implicit workspace by design — so this
 * guard must not treat that as unsafe there, or every authoring/CRUD command
 * (create:chapter, create:page, etc.) refuses to run in a real flat-mode
 * project. Confirmed by running the authoring commands end-to-end against a
 * flat-mode scaffold: this guard fired on the very first call before the fix.
 */
export function assertScopedWorkspaceDir(wsDir, name) {
  const resolved = path.resolve(wsDir)
  const unsafe = [ROOT, path.dirname(ROOT), path.parse(resolved).root]
  // Only repo mode expects a named workspace to be a SUBdirectory of cwd —
  // flat mode's workspacePath() correctly resolves to cwd itself.
  if (isRepoMode()) unsafe.push(process.cwd())
  if (!name || unsafe.some(p => path.resolve(p) === resolved)) {
    throw new Error(
      `Refusing to delete unsafe path "${resolved}" for workspace "${name}". ` +
        `isRepoMode()/workspacePath() may be misresolving — investigate before retrying.`
    )
  }
}

/**
 * Resolve the active workspace name.
 * Flat mode: read from the workspace config file's workspace.name, or use dirname.
 */
export function activeWorkspaceDir() {
  if (isRepoMode()) {
    const name = getActiveWorkspaceName()
    return path.join(ROOT, 'workspaces', name)
  }
  return process.cwd()
}

const STATE_FILE = path.join(ROOT, 'scripts', '.flowkit-state.json')

export function readState() {
  try {
    return JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'))
  } catch {
    return {}
  }
}

export function writeState(patch) {
  const current = readState()
  fs.writeFileSync(STATE_FILE, JSON.stringify({ ...current, ...patch }, null, 2))
}

/**
 * Detects whether a workspace's authored content is TS or plain JS, by
 * inspecting what's actually on disk under flows/ — not every mode tracks a
 * `language` field the same way (repo mode's src/workspaces.json does; flat/
 * multi-workspace mode's package.json flowkit.workspaces does not), so
 * detection-by-file-extension is the one signal available in every mode.
 * Defaults to 'ts' when the workspace is empty/ambiguous, matching every
 * existing scaffold's own default.
 */
export function detectWorkspaceLanguage(wsDir) {
  const chaptersDir = path.join(wsDir, FLOW_BOOK_DIRNAME)
  if (!fs.existsSync(chaptersDir)) return 'ts'

  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name)
      if (entry.isDirectory()) {
        const found = walk(full)
        if (found) return found
      } else if (entry.name.endsWith('.jsx') || entry.name.endsWith('.js')) {
        return 'js'
      } else if (entry.name.endsWith('.tsx') || entry.name.endsWith('.ts')) {
        return 'ts'
      }
    }
    return null
  }

  return walk(chaptersDir) ?? 'ts'
}
