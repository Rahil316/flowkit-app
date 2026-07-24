// Shared helpers for flowkit-app.js and flowkit-mono.js — the two consumer-mode
// (published-package) workspace lifecycle files. Neither the flat-mode nor
// multi-workspace conversion/CRUD logic is conceptually intertwined with the
// other; they only share these low-level primitives because both need them.
import fs from 'fs'
import path from 'path'
import { assertKebab, ValidationError } from '../helpers/validate.js'
import { r } from '../helpers/colors.js'
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
export function validateWorkspaceName(name, label) {
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
export const WORKSPACE_ENTRIES = [
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
export const VITE_CONFIG_BUILD_BLOCK = `  build: {
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        // Pages are both statically listed (for eager type-checking) and
        // dynamically imported (for code-splitting) by the virtual:flowkit/pages
        // module flowkit/vite generates — harmless by design, not a real issue.
        if (warning.code === 'INEFFECTIVE_DYNAMIC_IMPORT') return
        defaultHandler(warning)
      },
    },
  },`

export function moveEntries(fromDir, toDir, entries) {
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
export function stagedMove(sourceDir, entries, apply) {
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
