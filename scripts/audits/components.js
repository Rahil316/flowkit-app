// flowkit audit:components — component registry rules.
import fs from 'fs'
import path from 'path'
import { readComponents } from '../authoring-support/agent-state.js'
import { findBarrel } from '../authoring/components.js'

const COMPONENT_EXTS = ['.tsx', '.jsx']

function listComponentFiles(wsDir) {
  const rootDir = path.join(wsDir, 'lib', 'components')
  if (!fs.existsSync(rootDir)) return []
  const results = []
  const walk = dir => {
    for (const entry of fs.readdirSync(dir)) {
      const full = path.join(dir, entry)
      if (fs.statSync(full).isDirectory()) {
        walk(full)
      } else if (
        COMPONENT_EXTS.some(ext => entry.endsWith(ext)) &&
        !COMPONENT_EXTS.some(ext => entry === `index${ext}`)
      ) {
        results.push(path.relative(wsDir, full))
      }
    }
  }
  walk(rootDir)
  return results
}

/** Resolves a registered {path, name} entry to whichever extension actually exists on disk. */
function resolveRegisteredPath(wsDir, c) {
  for (const ext of COMPONENT_EXTS) {
    const rel = path.join(c.path, `${c.name}${ext}`).replace(/\\/g, '/')
    if (fs.existsSync(path.join(wsDir, rel))) return rel
  }
  // Fall back to .tsx (previous default) so a genuinely missing file is still reported.
  return path.join(c.path, `${c.name}.tsx`).replace(/\\/g, '/')
}

/** Reads a barrel's `export { default as Name } from './rel'` lines as a name→file map. */
function readBarrelExports(barrelPath) {
  const exports = new Map()
  if (!barrelPath || !fs.existsSync(barrelPath)) return exports
  const src = fs.readFileSync(barrelPath, 'utf8')
  const re = /export\s*\{\s*default as (\w+)\s*\}\s*from\s*'\.\/([^']+)'/g
  let match
  while ((match = re.exec(src))) {
    exports.set(match[1], match[2])
  }
  return exports
}

/** Runs component-domain rules for one workspace. Appends findings to `report`. */
export function checkComponents(wsDir, report) {
  const registered = readComponents(wsDir)
  const registeredPaths = new Set(registered.map(c => resolveRegisteredPath(wsDir, c)))
  const onDiskFiles = new Set(listComponentFiles(wsDir).map(f => f.replace(/\\/g, '/')))

  // Registered but the file is gone.
  for (const c of registered) {
    const relPath = resolveRegisteredPath(wsDir, c)
    if (!onDiskFiles.has(relPath)) {
      report.add({
        ruleId: 'components/stale-registry',
        severity: 'warning',
        file: '.flowkit/components.json',
        message: `'${c.name}' is registered at ${c.path}, but ${relPath} doesn't exist.`,
        fix: `Remove the stale entry, or restore the file.`,
        clifix: `flowkit remove:component --name:${c.name} --path:${c.path}`,
      })
    }
  }

  // On disk but never registered, and barrel export consistency.
  const checkedBarrels = new Set()
  for (const relPath of onDiskFiles) {
    const dir = path.dirname(relPath)
    const name = path.basename(relPath, path.extname(relPath))

    if (!registeredPaths.has(relPath)) {
      report.add({
        ruleId: 'components/unregistered',
        severity: 'warning',
        file: relPath,
        message: `Component file exists but is not in .flowkit/components.json.`,
        clifix: `flowkit components:scan`,
      })
    }

    const barrelPath = findBarrel(wsDir, dir)
    if (barrelPath) {
      const barrelRel = path.relative(wsDir, barrelPath).replace(/\\/g, '/')
      const barrelExports = readBarrelExports(barrelPath)
      if (!checkedBarrels.has(barrelRel)) {
        checkedBarrels.add(barrelRel)
        // Phantom exports: barrel claims a file that doesn't exist.
        for (const [exportedName, exportedRelFile] of barrelExports) {
          const candidates = COMPONENT_EXTS.map(ext =>
            path.join(path.dirname(barrelPath), `${exportedRelFile}${ext}`).replace(/\\/g, '/')
          )
          const resolvedPath = candidates.find(p => fs.existsSync(p)) ?? candidates[0]
          const resolvedWsRelative = path.relative(wsDir, resolvedPath).replace(/\\/g, '/')
          if (!fs.existsSync(resolvedPath)) {
            report.add({
              ruleId: 'components/barrel-phantom',
              severity: 'error',
              file: barrelRel,
              message: `Exports '${exportedName}' from './${exportedRelFile}', but ${resolvedWsRelative} doesn't exist.`,
              fix: `Remove the stale export line, or restore the file.`,
            })
          }
        }
      }
      if (!barrelExports.has(name)) {
        report.add({
          ruleId: 'components/barrel-gap',
          severity: 'warning',
          file: relPath,
          message: `Not exported from ${barrelRel}.`,
          clifix: `flowkit add:export --barrel:${barrelRel} --name:${name}`,
        })
      }
    }
  }
}
