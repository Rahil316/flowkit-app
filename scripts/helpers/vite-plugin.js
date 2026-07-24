/**
 * flowkit/vite — Vite plugin for FlowKit author projects.
 *
 * Generates virtual modules that replace all import.meta.glob patterns
 * which hardcode workspaces/<name>/... paths. In flat-layout author projects
 * the workspaces/ directory does not exist — the plugin reconstructs the same
 * data from the workspace config file (see WORKSPACE_CONFIG_FILENAME) + direct
 * filesystem globs from CWD.
 *
 * Virtual modules produced:
 *   virtual:flowkit/config      — parsed FlowkitConfig object
 *   virtual:flowkit/pages       — lazy screen import map, pageList, pageMeta
 *   virtual:flowkit/flowStories   — eager flowStory import map
 *   virtual:flowkit/workspace   — db, simulator, tokens, logos, tags, sessions
 */

import esbuild from 'esbuild'
import fs from 'fs'
import { glob } from 'fs/promises'
import os from 'os'
import path from 'path'
import { fileURLToPath, pathToFileURL } from 'url'

import { handleSaveSession } from './flowlens-session.js'
import {
  WORKSPACE_CONFIG_FILENAME,
  FLOW_BOOK_DIRNAME,
  FLOW_STORIES_DIRNAME,
} from './config-filenames.js'
import {
  makePageId,
  parsePageSegments,
  pickPageFile,
} from '../../src/shared/utils/pagePathIdentity.js'

// src/ directory of the flowkit package — resolved relative to this plugin file.
// In flat mode (author project) all @flowkit/* aliases point here.
const ENGINE_SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src')

// ── Config reader ──────────────────────────────────────────────────────────────

// Repo-mode workspace files import defineConfig/defineFlow from
// '@flowkit-core/config'; flat/standalone-mode ones import from 'flowkit'.
// Both must shim to the same identity-function stand-in — this plugin runs
// against workspace config files in both modes (e.g. from the standalone
// export build, which eagerly bundles everything reachable, unlike the dev
// server's lazy virtual-module resolution).
const SHIM_SPECIFIERS = ['flowkit', '@flowkit-core/config']

async function readFlowkitConfig(cwd) {
  const configPath = path.join(cwd, WORKSPACE_CONFIG_FILENAME)
  if (!fs.existsSync(configPath)) return {}

  // Provide a shim so esbuild can bundle either import style inline.
  // The real package/alias may not be resolvable from /tmp (repo mode) or may
  // not be installed yet (scaffold time). Identity functions are all the
  // config file uses.
  const shimFile = path.join(os.tmpdir(), 'flowkit-shim.mjs')
  if (!fs.existsSync(shimFile)) {
    fs.writeFileSync(
      shimFile,
      `export const defineConfig = c => c\n` +
        `export const defineFlow = f => f\n` +
        `export const tag = (label, opts) => ({ label, ...opts })\n`
    )
  }

  const hash = configPath.replace(/[^a-z0-9]/gi, '_').slice(-40)
  const outfile = path.join(os.tmpdir(), `flowkit-config-${hash}.mjs`)
  await esbuild.build({
    entryPoints: [configPath],
    bundle: true,
    format: 'esm',
    outfile,
    alias: Object.fromEntries(SHIM_SPECIFIERS.map(s => [s, shimFile])),
    external: ['react', 'react-dom'],
    logLevel: 'silent',
  })
  const fileUrl = `${pathToFileURL(outfile).href}?t=${Date.now()}`
  const mod = await import(fileUrl)
  return mod.default ?? mod
}

// ── Glob helpers ───────────────────────────────────────────────────────────────

async function globFiles(pattern, cwd) {
  const results = []
  try {
    for await (const f of glob(pattern, { cwd })) {
      results.push(f)
    }
  } catch {}
  return results
}

// ── Virtual module IDs ─────────────────────────────────────────────────────────

const VIRTUALS = {
  config: 'virtual:flowkit/config',
  pages: 'virtual:flowkit/pages',
  flowStories: 'virtual:flowkit/flowStories',
  workspace: 'virtual:flowkit/workspace',
}

function resolve(id) {
  if (Object.values(VIRTUALS).includes(id)) return '\0' + id
}

// ── Code generators ────────────────────────────────────────────────────────────

function genConfig(config) {
  return `export const config = ${JSON.stringify(config, null, 2)}`
}

async function genScreens(config, cwd) {
  const pageOrder = config.pageOrder ?? {}

  // Scan the whole flowBook/ tree — chapter id is now derived from path position
  // (via the shared pagePathIdentity module), not assumed from config.chapters/
  // pageOrder keys. Node's fs/promises glob() matches both depth-0
  // (flowBook/File.tsx) and deeper nesting with a single `**/*.tsx` pattern —
  // verified directly, no `{*,**/*}` workaround needed.
  const found = await globFiles(`${FLOW_BOOK_DIRNAME}/**/*.tsx`, cwd)

  // Parse every candidate file via the shared identity module, drop non-existent
  // ('__') entries entirely, and group by (chapter, page, variant) so ambiguous
  // folders (multiple real candidate files for the same slot) can be resolved
  // deterministically via pickPageFile — same as repo mode.
  const bySlot = new Map() // `${chapter}::${page}::${variant}` -> [{ rel, abs, fileName, info }]
  for (const rel of found) {
    const segments = rel.split(/[/\\]/).slice(1) // drop the flowBook/ root segment
    const info = parsePageSegments(segments)
    if (!info) continue // not a recognized page-file extension
    if (info.visibility === 'non-existent') continue // '__' — excluded entirely

    const fileName = segments[segments.length - 1]
    const slotKey = `${info.chapter}::${info.page}::${info.variant}`
    const list = bySlot.get(slotKey) ?? []
    list.push({ rel, abs: path.resolve(cwd, rel), fileName, info })
    bySlot.set(slotKey, list)
  }

  // Collect structured page entries — one per resolved (chapter, page, variant) slot.
  const entries = [] // { key, flow, pageId, abs, visibility }
  for (const [, candidates] of bySlot) {
    const { chosen } = pickPageFile(candidates.map(c => c.fileName))
    const winner = candidates.find(c => c.fileName === chosen) ?? candidates[0]
    const { chapter, page, visibility } = winner.info
    const key = makePageId(chapter, page)
    entries.push({ key, flow: chapter, pageId: page, abs: winner.abs, visibility })
  }

  // Apply declared pageOrder (per flow) as a display-order hint, same convention
  // as before — screens not mentioned keep their discovery order, appended after.
  entries.sort((a, b) => {
    if (a.flow !== b.flow) return 0
    const order = pageOrder[a.flow] ?? []
    const ai = order.indexOf(a.pageId)
    const bi = order.indexOf(b.pageId)
    if (ai === -1 && bi === -1) return 0
    if (ai === -1) return 1
    if (bi === -1) return -1
    return ai - bi
  })

  const loaderLines = entries.map(
    e => `  ${JSON.stringify(e.key)}: () => import(${JSON.stringify(e.abs)})`
  )
  const metaImports = entries.map(
    (e, i) => `import { pageMeta as _meta${i} } from ${JSON.stringify(e.abs)}`
  )
  const metaLines = entries.map((e, i) => `  ${JSON.stringify(e.key)}: _meta${i}`)
  const listLines = entries.map(
    e =>
      `  { key: ${JSON.stringify(e.key)}, flow: ${JSON.stringify(e.flow)}, pageId: ${JSON.stringify(e.pageId)}, loader: screens[${JSON.stringify(e.key)}]${e.visibility === 'hidden' ? `, visibility: 'hidden'` : ''} }`
  )

  return `import { lazy } from 'react'
${metaImports.join('\n')}

export const screens = {
${loaderLines.join(',\n')}
}

export const lazyScreens = Object.fromEntries(
  Object.entries(screens).map(([k, loader]) => [k, lazy(loader)])
)

export const pageMeta = {
${metaLines.join(',\n')}
}

export const pageList = [
${listLines.join(',\n')}
]`
}

async function genFlowStories(cwd) {
  const files = await globFiles(`${FLOW_STORIES_DIRNAME}/*.ts`, cwd)
  const lines = files.map((rel, i) => {
    const abs = path.resolve(cwd, rel)
    return `import _fp${i} from ${JSON.stringify(abs)}\nexports.push(_fp${i})`
  })
  return `const exports = []
${lines.join('\n')}
export const flowStories = exports`
}

async function genWorkspace(config, cwd) {
  const name = config.workspace?.name ?? path.basename(cwd)

  // db
  const dbCandidates = ['lib/data/db.ts', 'lib/data/db.js', 'data/db.ts', 'data/db.js']
  const dbFile = dbCandidates.map(p => path.join(cwd, p)).find(p => fs.existsSync(p))

  // simulator
  const simCandidates = [
    'lib/data/simulator.tsx',
    'lib/data/simulator.jsx',
    'data/simulator.tsx',
    'data/simulator.jsx',
  ]
  const simFile = simCandidates.map(p => path.join(cwd, p)).find(p => fs.existsSync(p))

  // tokens css
  const tokenCandidates = ['lib/design-system/tokens.css', 'design-system/tokens.css']
  const tokenFile = tokenCandidates.map(p => path.join(cwd, p)).find(p => fs.existsSync(p))

  // logo
  const logoExts = ['svg', 'png', 'jpg', 'jpeg', 'webp']
  const logoFile = logoExts
    .map(e => path.join(cwd, `lib/assets/logo.${e}`))
    .find(p => fs.existsSync(p))

  // sessions
  const sessionFiles = await globFiles('lib/flowLens/sessions/**/*.json', cwd)

  const parts = []

  parts.push(`export const workspaceName = ${JSON.stringify(name)}`)

  if (dbFile) {
    // db.ts uses named exports (no default) — import all and re-export as one object
    parts.push(
      `import * as _dbAll from ${JSON.stringify(dbFile)}\n` +
        `const { default: _dbDefault, ..._dbNamed } = _dbAll\n` +
        `export const db = Object.keys(_dbNamed).length ? _dbNamed : (_dbDefault ?? {})`
    )
  } else {
    parts.push(`export const db = {}`)
  }

  if (simFile) {
    parts.push(`export const loadSimulator = () => import(${JSON.stringify(simFile)})`)
  } else {
    parts.push(`export const loadSimulator = null`)
  }

  if (tokenFile) {
    // Declared as () => Promise<string> in vite-env.d.ts — a ?inline CSS import
    // resolves to a module namespace object ({ default: "css text" }), so unwrap
    // .default here rather than leaking the object to every caller.
    parts.push(
      `export const loadTokens = () => import(${JSON.stringify(tokenFile + '?inline')}).then(m => m.default)`
    )
  } else {
    parts.push(`export const loadTokens = null`)
  }

  if (logoFile) {
    parts.push(`import _logo from ${JSON.stringify(logoFile + '?url')}\nexport const logo = _logo`)
  } else {
    parts.push(`export const logo = null`)
  }

  if (sessionFiles.length) {
    const sessionImports = sessionFiles.map((f, i) => {
      const abs = path.resolve(cwd, f)
      return `import _sess${i} from ${JSON.stringify(abs)}\nsessions[${JSON.stringify(abs)}] = _sess${i}`
    })
    parts.push(`const sessions = {}\n${sessionImports.join('\n')}\nexport { sessions }`)
  } else {
    parts.push(`export const sessions = {}`)
  }

  return parts.join('\n\n')
}

// ── Plugin ─────────────────────────────────────────────────────────────────────

export function flowkit(options = {}) {
  const cwd = options.workspaceRoot
    ? path.resolve(process.cwd(), options.workspaceRoot)
    : process.cwd()
  // Two independent things `workspaceRoot` used to conflate into one flag:
  //   1. which folder to read the workspace config file/flowBook/flowStories/lib from (cwd, above)
  //   2. whether flat-mode aliases (@flowkit/@flowkit-core/@flowkit-features/etc) need supplying
  // Repo mode passes workspaceRoot AND already supplies its own aliases in the
  // host vite.config.ts (see this repo's own vite.config.ts) — standalone
  // defaults to false there. A standalone multi-workspace consumer project
  // (create-flowkit-workspace) has no host vite.config.ts of its own to supply
  // aliases, even though it still needs workspaceRoot to pick which workspace
  // folder to serve — pass `standalone: true` explicitly for that case.
  const standalone = options.standalone ?? !options.workspaceRoot
  let config = {}
  // Cache generated virtual module source; cleared on relevant file changes
  const cache = new Map()

  async function getConfig() {
    if (!cache.has('config-obj')) {
      cache.set('config-obj', await readFlowkitConfig(cwd))
    }
    return cache.get('config-obj')
  }

  async function generateVirtual(id) {
    const cacheKey = id
    if (cache.has(cacheKey)) return cache.get(cacheKey)

    const cfg = await getConfig()
    let code

    if (id === VIRTUALS.config) {
      code = genConfig(cfg)
    } else if (id === VIRTUALS.pages) {
      code = await genScreens(cfg, cwd)
    } else if (id === VIRTUALS.flowStories) {
      code = await genFlowStories(cwd)
    } else if (id === VIRTUALS.workspace) {
      code = await genWorkspace(cfg, cwd)
    }

    if (code) cache.set(cacheKey, code)
    return code
  }

  function invalidate(server) {
    cache.clear()
    for (const virtual of Object.values(VIRTUALS)) {
      const mod = server.moduleGraph.getModuleById('\0' + virtual)
      if (mod) server.moduleGraph.invalidateModule(mod)
    }
  }

  return {
    name: 'flowkit',

    config() {
      // In standalone mode, engine source lives in node_modules/flowkit/src (or a
      // symlink to it), resolved from the actual project root (process.cwd()) —
      // NOT from `cwd`, which may be a workspace subfolder in the multi-workspace
      // case, not the directory containing node_modules. Point all @flowkit/*
      // aliases at the logical symlink path so that react/react-dom resolve from
      // the author project's node_modules rather than the symlink target's
      // directory. preserveSymlinks: true enforces this.
      const engineSrc = standalone
        ? path.join(process.cwd(), 'node_modules/flowkit/src')
        : ENGINE_SRC
      const flatAliases = standalone
        ? {
            '@flowkit': engineSrc,
            '@flowkit-core': path.join(engineSrc, 'core'),
            '@flowkit-features': path.join(engineSrc, 'features'),
            '@flowkit-shared': path.join(engineSrc, 'shared'),
            '@flowlens': path.join(engineSrc, 'modes/flowlens'),
            '@flowkit-kit': path.join(engineSrc, 'kits/shared'),
            flowkit: path.join(engineSrc, 'core/config/index.ts'),
          }
        : {}
      return {
        define: standalone
          ? { 'import.meta.env.VITE_SINGLE_WORKSPACE': JSON.stringify('true') }
          : {},
        resolve: {
          alias: { '@workspace': cwd, ...flatAliases },
          dedupe: ['react', 'react-dom', 'react/jsx-runtime'],
          // Keep symlink identity intact so react/react-dom resolve from the
          // author project's node_modules, not the symlink target's directory.
          preserveSymlinks: standalone,
        },
        optimizeDeps: {
          // Do not pre-bundle flowkit or any of its internal alias paths.
          // Pre-bundling causes dual module instances: App.tsx loads FeedbackContext
          // via a relative path (raw ESM) while KitSideInspector loads via @flowkit
          // alias (pre-bundled chunk) → two createContext() calls → Provider/hook mismatch.
          exclude: standalone
            ? [
                'flowkit',
                '@flowkit',
                '@flowkit-core',
                '@flowkit-features',
                '@flowkit-shared',
                '@flowkit-kit',
                '@flowlens',
              ]
            : [],
        },
        server: {
          fs: {
            // cwd = where the workspace config file/flowBook/flowStories/lib live — the
            // project root itself (flat mode, single-workspace standalone),
            // or a workspace subfolder under the project root (multi-workspace
            // standalone, or repo mode's active workspace dir).
            // process.cwd() = the actual project root where vite.config.ts and
            // node_modules live — always needed so Vite can serve index.html
            // and resolve node_modules, even when cwd above is a subfolder of it.
            // dirname(ENGINE_SRC) = wherever flowkit's own source physically
            // lives: node_modules/flowkit (standalone mode) or this repo's own
            // root (repo mode, since ENGINE_SRC is computed from this plugin
            // file's own location — see top of file). In repo mode this MUST
            // resolve to the real repo root, not the workspace subdirectory,
            // or Vite can't serve the root index.html once a workspace is
            // active (server.fs.allow narrows away from it → 403).
            allow: [cwd, process.cwd(), path.dirname(ENGINE_SRC)],
          },
        },
      }
    },

    resolveId(id) {
      return resolve(id)
    },

    async load(id) {
      if (!id.startsWith('\0virtual:flowkit/')) return
      const virtual = id.slice(1) // strip leading \0
      return generateVirtual(virtual)
    },

    configureServer(server) {
      // Watch author project files — invalidate virtuals on any change
      const watchDirs = [
        path.join(cwd, FLOW_BOOK_DIRNAME),
        path.join(cwd, FLOW_STORIES_DIRNAME),
        path.join(cwd, 'lib'),
        path.join(cwd, WORKSPACE_CONFIG_FILENAME),
      ]
      server.watcher.add(watchDirs)

      server.watcher.on('all', (event, file) => {
        const isRelevant = watchDirs.some(d => file.startsWith(d))
        if (isRelevant) invalidate(server)
      })

      // FlowLens session recording — repo mode has its own copy of this same
      // middleware in vite.config.ts (workspace-scoped, since a repo-mode dev
      // server can have many workspaces). This is the flat-mode equivalent:
      // one author project == one implicit workspace, so everything is
      // relative to cwd. Author projects only ever load this plugin, never
      // this repo's own vite.config.ts, so without this flat-mode sessions
      // had no way to be saved at all.
      server.middlewares.use('/__flowlens/save-session', (req, res) =>
        handleSaveSession(req, res, path.join(cwd, 'lib', 'flowLens'))
      )
    },

    async handleHotUpdate({ file, server }) {
      const watchDirs = [
        path.join(cwd, FLOW_BOOK_DIRNAME),
        path.join(cwd, FLOW_STORIES_DIRNAME),
        path.join(cwd, 'lib'),
      ]
      const isRelevant =
        file === path.join(cwd, WORKSPACE_CONFIG_FILENAME) ||
        watchDirs.some(d => file.startsWith(d))

      if (isRelevant) {
        invalidate(server)
        // Force full reload so virtual module consumers re-execute
        server.ws.send({ type: 'full-reload' })
        return []
      }
    },
  }
}
