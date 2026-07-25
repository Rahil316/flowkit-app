// Shared workspace-config I/O for flowkit audit's rule modules — the esbuild-bundle-then-
// import() pattern for reading authored .ts files at runtime, plus the page-directory walker
// used to cross-reference manifest.ts's pageOrder against flowBook/ on disk.
//
// Reuses the exact esbuild-bundle-then-import() pattern already implemented in
// scripts/helpers/vite-plugin.js's readFlowkitConfig() — not reinvented here — so reading
// authored .ts files at runtime doesn't require adding tsx/jiti or any new dependency.
import fs from 'fs'
import path from 'path'
import os from 'os'
import { pathToFileURL } from 'url'
import esbuild from 'esbuild'
import {
  WORKSPACE_CONFIG_FILENAME,
  FLOW_BOOK_DIRNAME,
  FLOW_STORIES_DIRNAME,
} from '../../helpers/config-filenames.js'
import { isNonExistent, resolveVisibility } from '../../../src/shared/utils/pagePathIdentity.js'

// Shared shim so esbuild can bundle files that `import { defineConfig, defineFlow } from
// 'flowkit'` (or '@flowkit-core/config' in repo mode) without needing the real package
// resolvable — identity functions are all any of these files actually need at audit-time.
const SHIM_SPECIFIERS = ['flowkit', '@flowkit-core/config']

const PAGE_EXTS = ['.tsx', '.jsx']

/**
 * Finds every page-folder name (the last folder segment directly containing a real
 * page file) anywhere under `chapterDir`, at any depth. `__`-prefixed folders are pruned
 * from traversal entirely (as if they don't exist). Returns a Map<name, visibility> where
 * visibility ('normal'|'hidden') applies parent-dominance over the full segment chain
 * (from directly under chapterDir down to the page folder itself) — e.g. a page folder
 * named 'details' nested under a `_secret/` cosmetic ancestor is itself reported as
 * 'hidden', matching resolveVisibility's semantics used everywhere else in the audits.
 */
export function findPageDirNames(chapterDir) {
  const result = new Map()
  const walk = (dir, segments) => {
    let entries
    try {
      entries = fs.readdirSync(dir)
    } catch {
      return
    }
    const hasPageFile = entries.some(
      e =>
        !isNonExistent(e) &&
        PAGE_EXTS.some(ext => e.endsWith(ext)) &&
        fs.statSync(path.join(dir, e)).isFile()
    )
    if (hasPageFile) {
      const visibility = resolveVisibility(segments)
      if (visibility !== 'non-existent') {
        result.set(path.basename(dir), visibility === 'hidden' ? 'hidden' : 'normal')
      }
    }
    for (const entry of entries) {
      if (isNonExistent(entry)) continue // pruned entirely, as if it doesn't exist
      const full = path.join(dir, entry)
      if (fs.statSync(full).isDirectory()) walk(full, [...segments, entry])
    }
  }
  for (const entry of fs.readdirSync(chapterDir)) {
    if (isNonExistent(entry)) continue
    const full = path.join(chapterDir, entry)
    if (fs.statSync(full).isDirectory()) walk(full, [entry])
  }
  return result
}

async function readTsModule(filePath) {
  if (!fs.existsSync(filePath)) return null

  const shimFile = path.join(os.tmpdir(), 'flowkit-audit-shim.mjs')
  if (!fs.existsSync(shimFile)) {
    fs.writeFileSync(
      shimFile,
      `export const defineConfig = c => c\n` +
        `export const defineFlow = f => f\n` +
        `export const tag = (label, opts) => ({ label, ...opts })\n`
    )
  }

  const hash = filePath.replace(/[^a-z0-9]/gi, '_').slice(-40)
  const outfile = path.join(os.tmpdir(), `flowkit-audit-${hash}.mjs`)
  try {
    await esbuild.build({
      entryPoints: [filePath],
      bundle: true,
      format: 'esm',
      outfile,
      alias: Object.fromEntries(SHIM_SPECIFIERS.map(s => [s, shimFile])),
      external: ['react', 'react-dom'],
      logLevel: 'silent',
    })
  } catch {
    return null // genuine syntax error — tsc/eslint's job to report, not this rule's
  }
  const fileUrl = `${pathToFileURL(outfile).href}?t=${Date.now()}`
  const mod = await import(fileUrl)
  return mod.default ?? mod
}

/** Reads workspace/<WORKSPACE_CONFIG_FILENAME>, returning the evaluated FlowkitConfig object, or null. */
export async function readWorkspaceConfig(wsDir) {
  return readTsModule(path.join(wsDir, WORKSPACE_CONFIG_FILENAME))
}

/** Reads an arbitrary flowStory .ts file, returning the evaluated FlowStoryDef object, or null. */
export async function readFlowStoryModule(filePath) {
  return readTsModule(filePath)
}

export { WORKSPACE_CONFIG_FILENAME, FLOW_BOOK_DIRNAME, FLOW_STORIES_DIRNAME }
