import type { FlowkitConfig } from '@flowkit/types/index'
import type React from 'react'

// ─── Mode detection ───────────────────────────────────────────────────────────

const isSingle = import.meta.env.VITE_SINGLE_WORKSPACE === 'true'

// ─── Flat mode: virtual modules (author project, no workspaces/ dir) ──────────

// Imported at top level — tree-shaken in repo mode by Vite when isSingle=false.
// In repo mode the plugin still generates these from the active workspace dir,
// so the imports are always resolvable regardless of mode.
import { config as _virtualConfig } from 'virtual:flowkit/config'
import {
  db as _virtualDb,
  loadSimulator as _virtualSim,
  loadTokens as _virtualTokens,
  workspaceName as _virtualWsName,
} from 'virtual:flowkit/workspace'

// ─── Repo mode: glob maps (empty in flat mode — no workspaces/ dir present) ──

// New layout: lib/data/
const dbModules = import.meta.glob('/workspaces/*/lib/data/db.ts', { eager: true })
const dbModulesJs = import.meta.glob('/workspaces/*/lib/data/db.js', { eager: true })
// Old layout fallback
const dbModulesOld = import.meta.glob('/workspaces/*/data/db.ts', { eager: true })
const dbModulesOldJs = import.meta.glob('/workspaces/*/data/db.js', { eager: true })

const simModules = import.meta.glob('/workspaces/*/lib/data/simulator.tsx')
const simModulesJs = import.meta.glob('/workspaces/*/lib/data/simulator.jsx')
const simModulesOld = import.meta.glob('/workspaces/*/data/simulator.tsx')
const simModulesOldJs = import.meta.glob('/workspaces/*/data/simulator.jsx')

const tokenModulesNew = import.meta.glob('/workspaces/*/lib/design-system/tokens.css', {
  eager: false,
  query: '?inline',
  import: 'default',
}) as Record<string, () => Promise<string>>

const tokenModulesOld = import.meta.glob('/workspaces/*/design-system/tokens.css', {
  eager: false,
  query: '?inline',
  import: 'default',
}) as Record<string, () => Promise<string>>

const configModules = import.meta.glob('/workspaces/*/manifest.ts', {
  eager: true,
}) as Record<string, { default: FlowkitConfig }>

const logoModules = import.meta.glob('/workspaces/*/lib/assets/logo.*', {
  eager: true,
  query: '?url',
  import: 'default',
}) as Record<string, string>

// ─── Public API ───────────────────────────────────────────────────────────────

export function getWorkspaceDb(name: string): Record<string, unknown> {
  if (isSingle) {
    return _virtualDb as Record<string, unknown>
  }
  const key = `/workspaces/${name}/lib/data/db.ts`
  const keyJs = `/workspaces/${name}/lib/data/db.js`
  const keyOld = `/workspaces/${name}/data/db.ts`
  const keyOldJs = `/workspaces/${name}/data/db.js`
  const mod = (dbModules[key] ??
    dbModulesJs[keyJs] ??
    dbModulesOld[keyOld] ??
    dbModulesOldJs[keyOldJs]) as Record<string, unknown> | undefined
  if (!mod) return {}
  const { default: _def, ...named } = mod
  return named
}

export function getWorkspaceSimulator(
  name: string
): (() => Promise<{ default: React.ComponentType }>) | null {
  if (isSingle) {
    return _virtualSim as (() => Promise<{ default: React.ComponentType }>) | null
  }
  const key = `/workspaces/${name}/lib/data/simulator.tsx`
  const keyJs = `/workspaces/${name}/lib/data/simulator.jsx`
  const keyOld = `/workspaces/${name}/data/simulator.tsx`
  const keyOldJs = `/workspaces/${name}/data/simulator.jsx`
  return (simModules[key] ??
    simModulesJs[keyJs] ??
    simModulesOld[keyOld] ??
    simModulesOldJs[keyOldJs]) as (() => Promise<{ default: React.ComponentType }>) | null
}

export function listWorkspaceNames(): string[] {
  if (isSingle) return [_virtualWsName]
  const names = new Set([
    ...Object.keys(tokenModulesNew).map(p => p.split('/')[2]),
    ...Object.keys(tokenModulesOld).map(p => p.split('/')[2]),
  ])
  return [...names]
}

export function getWorkspaceConfig(name: string): FlowkitConfig {
  if (isSingle) return _virtualConfig
  const mod = configModules[`/workspaces/${name}/manifest.ts`]
  return mod?.default ?? {}
}

// Single-workspace/flat mode has no workspace switcher (only one workspace
// exists), so a virtual-module logo path isn't needed here — always null.
export function getWorkspaceLogo(name: string): string | null {
  if (isSingle) return null
  const entry = Object.entries(logoModules).find(([p]) =>
    p.includes(`/workspaces/${name}/lib/assets/logo.`)
  )
  return entry?.[1] ?? null
}

export async function loadWorkspaceTokens(name: string): Promise<void> {
  let css: string | undefined

  if (isSingle) {
    css = _virtualTokens ? await _virtualTokens() : undefined
  } else {
    const keyNew = `/workspaces/${name}/lib/design-system/tokens.css`
    const keyOld = `/workspaces/${name}/design-system/tokens.css`
    const loader = tokenModulesNew[keyNew] ?? tokenModulesOld[keyOld]
    if (!loader) return
    css = await loader()
  }

  if (!css) return
  let tag = document.getElementById('ws-tokens') as HTMLStyleElement | null
  if (!tag) {
    tag = document.createElement('style')
    tag.id = 'ws-tokens'
    document.head.appendChild(tag)
  }
  tag.textContent = css
}
