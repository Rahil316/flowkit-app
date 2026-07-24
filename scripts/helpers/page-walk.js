// Shared recursive page-file walker, used by scripts/checks/pages.js,
// scripts/checks/flowStories.js, and scripts/platform/sessions/_shared.js. Node-only
// (uses fs/path directly) — kept separate from src/shared/utils/pagePathIdentity.js,
// which is deliberately dependency-free so it can also be imported by the browser bundle.
import fs from 'fs'
import path from 'path'
import { isNonExistent } from '../../src/shared/utils/pagePathIdentity.js'

const PAGE_EXTS = ['.tsx', '.jsx']

/**
 * Recursively walks `dir` (relative segment chain tracked in `segments`) collecting every
 * real page-candidate file found at any depth ≥1. `__`-prefixed folders are pruned
 * entirely (never descended into) rather than filtered post-hoc, matching the "as if it
 * doesn't exist" requirement. Returns a flat list of { segments, fullPath }, where
 * `segments` is the full chain from directly under the flowBook root down to the
 * filename (suitable for both parsePageSegments and resolveVisibility).
 */
export function walkPageFiles(dir, segments) {
  const results = []
  for (const entry of fs.readdirSync(dir)) {
    if (isNonExistent(entry)) continue // prune — never read, never AST-parsed, never reported
    const full = path.join(dir, entry)
    const nextSegments = [...segments, entry]
    if (fs.statSync(full).isDirectory()) {
      results.push(...walkPageFiles(full, nextSegments))
    } else if (PAGE_EXTS.some(ext => entry.endsWith(ext))) {
      results.push({ segments: nextSegments, fullPath: full })
    }
  }
  return results
}
