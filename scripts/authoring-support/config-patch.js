/**
 * config-patch.js
 * Surgical read/write helpers for the workspace config file (see WORKSPACE_CONFIG_FILENAME).
 * All operations use read → modify → full regeneration to avoid regex fragility.
 */

import fs from 'fs'
import path from 'path'
import { resolveDefineImport } from '../helpers/paths.js'
import { asJsStringLiteral } from '../helpers/validate.js'
import { WORKSPACE_CONFIG_FILENAME } from '../helpers/config-filenames.js'

function getConfigPath(wsDir) {
  return path.join(wsDir, WORKSPACE_CONFIG_FILENAME)
}

// Fallback import line if a config file somehow has none to preserve (should
// not happen for any real scaffolded file, repo-mode or flat-mode/standalone).
// Resolved per-mode rather than hardcoded — see resolveDefineImport().
function defaultImportLine() {
  return resolveDefineImport('defineConfig')
}

/** Parse the workspace config file into a plain JS object without TypeScript compilation. */
function readConfig(wsDir) {
  const configPath = getConfigPath(wsDir)
  if (!fs.existsSync(configPath))
    throw new Error(`${WORKSPACE_CONFIG_FILENAME} not found at ${configPath}`)

  let src = fs.readFileSync(configPath, 'utf8')
  // Capture the import line verbatim rather than discarding it — repo-mode
  // configs import defineConfig from '@flowkit-core/config', flat/standalone
  // configs import it from the published 'flowkit' package. Hardcoding either
  // one in writeConfig() below would silently break the other mode's build
  // the next time any authoring command mutates the file (confirmed live:
  // create:chapter rewrote a flat-mode project's working import into the
  // repo-mode path, and nothing caught it until `npm run build` failed).
  const importMatch = src.match(/^import\s+.*$/m)
  const importLine = importMatch ? importMatch[0] : defaultImportLine()
  // Strip the import line (always the same single line)
  src = src.replace(/^import\s+.*\n/m, '')
  // Replace `export default defineConfig(` with a returnable expression
  src = src.replace(/export\s+default\s+defineConfig\s*\(/, 'return (')

  const raw = new Function(src)()
  return {
    workspace: raw.workspace || { name: path.basename(wsDir) },
    chapters: raw.chapters || [],
    pageOrder: raw.pageOrder || {},
    startPage: raw.startPage,
    defaultDevice: raw.defaultDevice,
    defaultOrientation: raw.defaultOrientation,
    _importLine: importLine,
  }
}

/** Quote a chapter ID if it's not a valid JS identifier (e.g. contains hyphens). */
function quoteKey(key) {
  return /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key) ? key : `'${key}'`
}

/** Format a pageOrder entry — inline for ≤4 pages, multiline for ≥5. */
function formatScreenArray(pages) {
  if (!pages || pages.length === 0) return '[]'
  if (pages.length <= 4) {
    return `[${pages.map(s => `'${s}'`).join(', ')}]`
  }
  const inner = pages.map(s => `      '${s}',`).join('\n')
  return `[\n${inner}\n    ]`
}

/** Regenerate the entire workspace config file from a plain config object. */
function writeConfig(wsDir, config) {
  const configPath = getConfigPath(wsDir)
  const chaptersStr = config.chapters.map(f => `    '${f}',`).join('\n')

  let soEntries = ''
  if (Object.keys(config.pageOrder).length > 0) {
    soEntries = Object.entries(config.pageOrder)
      .map(([chapter, pages]) => `    ${quoteKey(chapter)}: ${formatScreenArray(pages)},`)
      .join('\n')
  }

  const lines = [
    config._importLine || defaultImportLine(),
    ``,
    `export default defineConfig({`,
    `  workspace: { name: ${asJsStringLiteral(config.workspace.name)} },`,
  ]

  // startPage/defaultDevice/defaultOrientation are optional, hand-authored settings —
  // only emitted when present, so a workspace that never set them doesn't gain them.
  // Comments are regenerated fresh each write (matching FlowkitConfig's own doc comments
  // in src/types/index.ts) rather than preserved verbatim — this file's read→object→
  // regenerate round-trip doesn't carry source comments through, so any custom wording
  // an author added to these specific lines won't survive a write. The alternative
  // (parsing and reattaching original comments) is a much larger undertaking than the
  // actual bug (silently dropping the field values themselves) warrants.
  if (config.startPage !== undefined) {
    lines.push(
      `  // Page loaded by default (cold load, device home button, reset-to-first)`,
      `  // when no flowStory is active. Falls back to the first declared page when unset.`,
      `  startPage: ${asJsStringLiteral(config.startPage)},`
    )
  }
  if (config.defaultDevice !== undefined) {
    lines.push(
      `  // Default device shell shown on load. Must match a DevicePreset.label from`,
      `  // src/shared/components/devices (e.g. "iPhone 16 Pro"). Falls back to the`,
      `  // platform default when unset or unrecognized.`,
      `  defaultDevice: ${asJsStringLiteral(config.defaultDevice)},`
    )
  }
  if (config.defaultOrientation !== undefined) {
    lines.push(
      `  // Default orientation on load. Ignored if the device doesn't support landscape.`,
      `  defaultOrientation: ${asJsStringLiteral(config.defaultOrientation)},`
    )
  }

  lines.push(`  chapters: [`, chaptersStr, `  ],`)

  if (soEntries) {
    lines.push(`  pageOrder: {`)
    lines.push(soEntries)
    lines.push(`  },`)
  }

  lines.push(`})`)
  lines.push(``)

  fs.writeFileSync(configPath, lines.join('\n'))
}

// ─── Public API ───────────────────────────────────────────────────────────────

export { readConfig as readWorkspaceConfig, writeConfig as writeWorkspaceConfig }

export function addChapter(wsDir, chapterId) {
  const config = readConfig(wsDir)
  if (config.chapters.includes(chapterId)) throw new Error(`Chapter '${chapterId}' already exists`)
  config.chapters.push(chapterId)
  config.pageOrder[chapterId] = []
  writeConfig(wsDir, config)
}

export function removeChapter(wsDir, chapterId) {
  const config = readConfig(wsDir)
  config.chapters = config.chapters.filter(f => f !== chapterId)
  delete config.pageOrder[chapterId]
  writeConfig(wsDir, config)
}

export function addPage(wsDir, chapterId, pageId, position) {
  const config = readConfig(wsDir)
  if (!config.pageOrder[chapterId]) config.pageOrder[chapterId] = []
  if (config.pageOrder[chapterId].includes(pageId)) {
    throw new Error(`Page '${pageId}' already exists in chapter '${chapterId}'`)
  }
  if (position !== undefined && position !== null && position >= 0) {
    config.pageOrder[chapterId].splice(position, 0, pageId)
  } else {
    config.pageOrder[chapterId].push(pageId)
  }
  writeConfig(wsDir, config)
}

export function removePage(wsDir, chapterId, pageId) {
  const config = readConfig(wsDir)
  if (!config.pageOrder[chapterId]) return
  config.pageOrder[chapterId] = config.pageOrder[chapterId].filter(s => s !== pageId)
  writeConfig(wsDir, config)
}

export function renamePage(wsDir, chapterId, oldId, newId) {
  const config = readConfig(wsDir)
  const pages = config.pageOrder[chapterId]
  if (!pages) throw new Error(`Chapter '${chapterId}' not found in config`)
  const idx = pages.indexOf(oldId)
  if (idx === -1) throw new Error(`Page '${oldId}' not found in chapter '${chapterId}'`)
  config.pageOrder[chapterId][idx] = newId
  writeConfig(wsDir, config)
}

export function movePage(wsDir, pageId, fromChapterId, toChapterId) {
  if (fromChapterId === toChapterId) {
    throw new Error(`Page '${pageId}' is already in chapter '${fromChapterId}'`)
  }
  const config = readConfig(wsDir)
  const fromPages = config.pageOrder[fromChapterId] || []
  const fromIdx = fromPages.indexOf(pageId)
  if (fromIdx === -1) throw new Error(`Page '${pageId}' not found in chapter '${fromChapterId}'`)
  if (config.pageOrder[toChapterId]?.includes(pageId)) {
    throw new Error(`Page '${pageId}' already exists in chapter '${toChapterId}'`)
  }
  config.pageOrder[fromChapterId].splice(fromIdx, 1)
  if (!config.pageOrder[toChapterId]) config.pageOrder[toChapterId] = []
  config.pageOrder[toChapterId].push(pageId)
  writeConfig(wsDir, config)
}

/** List all pageIds across all chapters (or just one chapter). */
export function listPages(wsDir, chapterId) {
  const config = readConfig(wsDir)
  if (chapterId) {
    return { [chapterId]: config.pageOrder[chapterId] || [] }
  }
  return config.pageOrder
}

/** Check if a pageId exists anywhere in the workspace config. */
export function pageExists(wsDir, pageId) {
  const config = readConfig(wsDir)
  return Object.values(config.pageOrder).some(pages => pages.includes(pageId))
}

/** Check if a chapterId exists in the workspace config. */
export function chapterExists(wsDir, chapterId) {
  const config = readConfig(wsDir)
  return config.chapters.includes(chapterId)
}
