// Helper: workspace registry (src/workspaces.json) read/write/sync.
import fs from 'fs'
import path from 'path'
import {
  workspacePath,
  isRepoMode,
  listWorkspaceDirs,
  readWorkspacesJson,
  writeWorkspacesJson,
  getActiveWorkspaceName,
} from './paths.js'
import { WORKSPACE_CONFIG_FILENAME } from './config-filenames.js'

function readConfigDescription(name) {
  try {
    const configPath = path.join(workspacePath(name), WORKSPACE_CONFIG_FILENAME)
    const src = fs.readFileSync(configPath, 'utf8')
    // Allows an escaped quote (\") inside the description without ending the
    // match early — a plain [^'"`]+ class stops at the first quote character.
    const m =
      src.match(/workspace\s*:\s*\{[^}]*description\s*:\s*'((?:\\'|[^'])*)'/) ||
      src.match(/workspace\s*:\s*\{[^}]*description\s*:\s*"((?:\\"|[^"])*)"/) ||
      src.match(/workspace\s*:\s*\{[^}]*description\s*:\s*`((?:\\`|[^`])*)`/)
    return m ? m[1] : null
  } catch {
    return null
  }
}

// Re-export so flowkit-engine.js can pull the scaffold entry point + registry
// helpers from a single import line — scaffold.js itself is out of scope for
// this file's own naming/cleanup pass.
export { workspaceScaffold } from './scaffold.js'

export function readWorkspaceRegistry() {
  return readWorkspacesJson().workspaces.map(w => w.name)
}

export function writeWorkspaceRegistry(workspaceNames, active, kitMap = {}, language = 'ts') {
  const existing = readWorkspacesJson()
  const existingByName = {}
  for (const w of existing.workspaces) existingByName[w.name] = w

  const workspaces = workspaceNames.map(name => {
    const label = name.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
    const prev = existingByName[name] ?? {}
    const kit = kitMap[name] && kitMap[name] !== 'none' ? kitMap[name] : (prev.kit ?? null)
    const lang = kitMap[name] ? language : (prev.language ?? 'ts')
    const description = readConfigDescription(name) ?? prev.description ?? null
    const entry = { name, label }
    if (description) entry.description = description
    if (kit && kit !== 'none') entry.kit = kit
    if (lang === 'js') entry.language = 'js'
    return entry
  })

  writeWorkspacesJson({ workspaces, active: active ?? null })
}

export function syncWorkspaceRegistry() {
  if (!isRepoMode()) return []
  const existing = listWorkspaceDirs()
  let active = getActiveWorkspaceName()
  if (!existing.includes(active)) active = existing[0] ?? null
  writeWorkspaceRegistry(existing, active)
  return existing
}
