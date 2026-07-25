// Authoring command: CRUD for shared components (create/remove/find/list/scan/export).
import fs from 'fs'
import path from 'path'
import { parseStringFlag } from '../helpers/args.js'
import { resolveWorkspace } from '../helpers/workspace-resolve.js'
import {
  workspacePath,
  assertScopedWorkspaceDir,
  detectWorkspaceLanguage,
} from '../helpers/paths.js'
import { assertWithinWorkspace, ValidationError } from '../helpers/validate.js'
import { g, r, b, d, c } from '../helpers/colors.js'
import {
  readComponents,
  registerComponent,
  unregisterComponent,
  findComponent,
  writeComponents,
} from '../authoring-support/agent-state.js'

const PASCAL_RE = /^[A-Z][A-Za-z0-9]+$/

function componentTemplate(name, desc, compPath, isJs) {
  // Force the comment onto one line — a newline in --desc would otherwise
  // break out of the `//` comment and inject raw code into the file below it.
  const singleLineDesc = desc ? desc.replace(/[\r\n]+/g, ' ').trim() : ''
  const descLine = singleLineDesc ? `// ${singleLineDesc}\n` : ''
  // Always the direct-file default import — valid regardless of whether a
  // barrel export exists now or later (barrels re-export the default as a
  // named binding, but this file's own self-documentation shouldn't assume
  // barrel state that's decided elsewhere and can change independently).
  const propsBlock = isJs
    ? ''
    : `interface Props {
  className?: string
  children?: React.ReactNode
}

`
  const propsType = isJs ? '' : ': Props'
  return `${descLine}// Usage: import ${name} from '@workspace/${compPath}/${name}'

${propsBlock}export default function ${name}({ className = '', children }${propsType}) {
  return (
    <div className={className}>
      {children}
    </div>
  )
}
`
}

const BARREL_NAMES = ['index.ts', 'index.js']

/** Find the nearest index.ts/index.js barrel relative to a component path. */
export function findBarrel(wsDir, compRelPath) {
  // compRelPath: e.g. 'lib/components/ui'
  for (const barrelName of BARREL_NAMES) {
    const barrelPath = path.join(wsDir, compRelPath, barrelName)
    if (fs.existsSync(barrelPath)) return barrelPath
  }

  // Try parent
  for (const barrelName of BARREL_NAMES) {
    const parentBarrel = path.join(wsDir, path.dirname(compRelPath), barrelName)
    if (fs.existsSync(parentBarrel)) return parentBarrel
  }

  return null
}

/** Append an export line to a barrel file if not already present. */
function appendExportToBarrel(barrelPath, name, relativePath) {
  const exportLine = `export { default as ${name} } from './${relativePath}'`
  const src = fs.existsSync(barrelPath) ? fs.readFileSync(barrelPath, 'utf8') : ''
  if (src.includes(`as ${name} `) || src.includes(`as ${name}\n`)) return false // already exported
  const newSrc = src.endsWith('\n') ? src + exportLine + '\n' : src + '\n' + exportLine + '\n'
  fs.writeFileSync(barrelPath, newSrc)
  return true
}

/** Remove an export line from a barrel file by component name. */
function removeExportFromBarrel(barrelPath, name) {
  if (!fs.existsSync(barrelPath)) return
  const src = fs.readFileSync(barrelPath, 'utf8')
  const lines = src
    .split('\n')
    .filter(line => !(line.includes(`as ${name} `) || line.includes(`as ${name}\``)))
  fs.writeFileSync(barrelPath, lines.join('\n'))
}

export async function cmdCreateComponent(_val, args = []) {
  const wsName = resolveWorkspace(parseStringFlag(args, 'workspace'))
  const wsDir = workspacePath(wsName)
  assertScopedWorkspaceDir(wsDir, wsName)
  const name = parseStringFlag(args, 'name')
  const compPath = parseStringFlag(args, 'path')
  const desc = parseStringFlag(args, 'desc') || ''

  if (!name || !compPath) {
    console.error(r('✗ --name:<PascalName> and --path:<lib/components/...> are required'))
    console.error(
      d(
        '  Example: flowkit create:component --name:StatusBadge --path:lib/components/ui --desc:"Shows status"'
      )
    )
    process.exit(1)
  }

  if (!PASCAL_RE.test(name)) {
    console.error(r(`✗ Component name '${name}' must be PascalCase (e.g. StatusBadge)`))
    process.exit(1)
  }

  try {
    assertWithinWorkspace(wsDir, compPath, '--path')
  } catch (e) {
    if (e instanceof ValidationError) {
      console.error(r(`✗ ${e.message}`))
      process.exit(1)
    }
    throw e
  }

  const existing = findComponent(wsDir, name)
  if (existing) {
    console.error(r(`✗ Component '${name}' already registered at ${existing.path}`))
    process.exit(1)
  }

  const isJs = detectWorkspaceLanguage(wsDir) === 'js'
  const ext = isJs ? 'jsx' : 'tsx'
  const compDir = path.join(wsDir, compPath)
  const compFile = path.join(compDir, `${name}.${ext}`)

  if (fs.existsSync(compFile)) {
    console.error(r(`✗ File already exists: ${compPath}/${name}.${ext}`))
    process.exit(1)
  }

  try {
    fs.mkdirSync(compDir, { recursive: true })
    fs.writeFileSync(compFile, componentTemplate(name, desc, compPath, isJs))

    const barrelPath = findBarrel(wsDir, compPath)
    let barrelUpdated = false
    if (barrelPath) {
      const barrelRel = path
        .relative(path.dirname(barrelPath), compFile)
        .replace(/\.(tsx|jsx)$/, '')
      barrelUpdated = appendExportToBarrel(barrelPath, name, barrelRel)
    }

    registerComponent(wsDir, { name, path: compPath, desc })

    console.log(g(`✓ Component:  ${compPath}/${name}.${ext}`))
    if (barrelUpdated && barrelPath) {
      const barrelRel = path.relative(wsDir, barrelPath)
      console.log(g(`✓ Exported:   ${barrelRel} → export { default as ${name} }`))
    } else if (!barrelPath) {
      console.log(
        d(
          `  No index.${ext === 'jsx' ? 'js' : 'ts'} found — add export manually or run: flowkit add:export`
        )
      )
    }
    console.log(g(`✓ Registered: .flowkit/components.json`))
    console.log('')
    if (barrelUpdated && barrelPath) {
      const barrelDir = path.relative(wsDir, path.dirname(barrelPath))
      console.log(d(`Usage: import { ${name} } from '@workspace/${barrelDir}'`))
    } else {
      console.log(d(`Usage: import ${name} from '@workspace/${compPath}/${name}'`))
    }
  } catch (e) {
    if (fs.existsSync(compFile)) fs.unlinkSync(compFile)
    console.error(r(`✗ Failed: ${e.message}`))
    process.exit(1)
  }
}

export async function cmdRemoveComponent(_val, args = []) {
  const wsName = resolveWorkspace(parseStringFlag(args, 'workspace'))
  const wsDir = workspacePath(wsName)
  assertScopedWorkspaceDir(wsDir, wsName)
  const name = parseStringFlag(args, 'name')
  const compPath = parseStringFlag(args, 'path')

  if (!name) {
    console.error(r('✗ --name:<ComponentName> is required'))
    process.exit(1)
  }

  const entry = findComponent(wsDir, name)
  const resolvedPath = compPath || entry?.path

  if (!resolvedPath) {
    console.error(
      r(`✗ Component '${name}' not found in registry. Provide --path to remove by file.`)
    )
    process.exit(1)
  }

  try {
    assertWithinWorkspace(wsDir, resolvedPath, '--path')
  } catch (e) {
    if (e instanceof ValidationError) {
      console.error(r(`✗ ${e.message}`))
      process.exit(1)
    }
    throw e
  }

  const compExt = ['tsx', 'jsx'].find(e =>
    fs.existsSync(path.join(wsDir, resolvedPath, `${name}.${e}`))
  )
  const compFile = path.join(wsDir, resolvedPath, `${name}.${compExt ?? 'tsx'}`)
  if (fs.existsSync(compFile)) fs.unlinkSync(compFile)

  const barrelPath = findBarrel(wsDir, resolvedPath)
  if (barrelPath) removeExportFromBarrel(barrelPath, name)

  unregisterComponent(wsDir, name, resolvedPath)

  console.log(g(`✓ Removed:       ${resolvedPath}/${name}.${compExt ?? 'tsx'}`))
  if (barrelPath) console.log(g(`✓ Export removed: ${path.relative(wsDir, barrelPath)}`))
  console.log(g(`✓ Unregistered:  .flowkit/components.json`))
}

export async function cmdComponentsFind(_val, args = []) {
  const wsName = resolveWorkspace(parseStringFlag(args, 'workspace'))
  const wsDir = workspacePath(wsName)
  assertScopedWorkspaceDir(wsDir, wsName)
  const name = parseStringFlag(args, 'name')

  if (!name) {
    console.error(r('✗ --name:<ComponentName> is required'))
    process.exit(1)
  }

  const entry = findComponent(wsDir, name)
  if (entry) {
    const foundExt = ['tsx', 'jsx'].find(e =>
      fs.existsSync(path.join(wsDir, entry.path, `${name}.${e}`))
    )
    console.log(g(`✓ Found: ${name}`))
    console.log(`  Path:       ${entry.path}/${name}.${foundExt ?? 'tsx'}`)
    console.log(`  Desc:       ${entry.desc || d('(no description)')}`)
    console.log(
      `  Registered: ${foundExt ? g('yes') : r('yes (but file missing — run components:scan)')}`
    )
    return
  }

  // Disk fallback
  const libDir = path.join(wsDir, 'lib', 'components')
  if (fs.existsSync(libDir)) {
    const found = []
    const walk = dir => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) walk(path.join(dir, entry.name))
        else if (entry.name === `${name}.tsx` || entry.name === `${name}.jsx`)
          found.push(path.join(dir, entry.name))
      }
    }
    walk(libDir)
    if (found.length > 0) {
      const rel = path.relative(wsDir, found[0])
      console.log(d(`⚠️️  Found on disk (not in registry): ${rel}`))
      console.log(d(`   Register it: flowkit components:scan`))
      return
    }
  }

  console.log(r(`✗ Not found: ${name}`))
  console.log(d(`  No component named '${name}' exists in this workspace.`))
  console.log(d(`  Create it: flowkit create:component --name:${name} --path:lib/components/ui`))
}

export async function cmdComponentsLs(_val, args = []) {
  const wsName = resolveWorkspace(parseStringFlag(args, 'workspace'))
  const wsDir = workspacePath(wsName)
  assertScopedWorkspaceDir(wsDir, wsName)
  const filterPath = parseStringFlag(args, 'path')

  let entries = readComponents(wsDir)
  if (filterPath) entries = entries.filter(e => e.path.startsWith(filterPath))

  console.log(b(`Components  [${wsName}]${filterPath ? ` — path: ${filterPath}` : ''}\n`))

  if (entries.length === 0) {
    console.log(d('  No components registered.'))
    console.log(d('  Scan for existing: flowkit components:scan'))
    console.log(
      d('  Create new:        flowkit create:component --name:<Name> --path:lib/components/ui')
    )
    return
  }

  for (const e of entries) {
    const fileOk =
      fs.existsSync(path.join(wsDir, e.path, `${e.name}.tsx`)) ||
      fs.existsSync(path.join(wsDir, e.path, `${e.name}.jsx`))
    const status = fileOk ? g('✓') : r('✗')
    console.log(`  ${status} ${c(e.name).padEnd(32)} ${d(e.path)}`)
    if (e.desc) console.log(`     ${d(e.desc)}`)
  }
  console.log('')
  console.log(d(`Total: ${entries.length} component${entries.length !== 1 ? 's' : ''}`))
}

export async function cmdComponentsScan(_val, args = []) {
  const wsName = resolveWorkspace(parseStringFlag(args, 'workspace'))
  const wsDir = workspacePath(wsName)
  assertScopedWorkspaceDir(wsDir, wsName)

  const libDir = path.join(wsDir, 'lib', 'components')
  if (!fs.existsSync(libDir)) {
    console.log(d(`No lib/components/ directory found in workspace '${wsName}'`))
    return
  }

  const found = []
  const walk = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.isDirectory()) walk(path.join(dir, entry.name))
      else if (
        (entry.name.endsWith('.tsx') || entry.name.endsWith('.jsx')) &&
        !entry.name.startsWith('index')
      ) {
        const name = entry.name.replace(/\.(tsx|jsx)$/, '')
        if (/^[A-Z]/.test(name)) {
          found.push({ name, path: path.relative(wsDir, dir) })
        }
      }
    }
  }
  walk(libDir)

  const existing = readComponents(wsDir)
  const existingKeys = new Set(existing.map(e => `${e.name}:${e.path}`))

  let added = 0
  for (const { name, path: compPath } of found) {
    const key = `${name}:${compPath}`
    if (!existingKeys.has(key)) {
      existing.push({ name, path: compPath, desc: '', createdAt: new Date().toISOString() })
      added++
    }
  }

  writeComponents(wsDir, existing)

  console.log(b(`Scan complete  [${wsName}]\n`))
  console.log(`  Found on disk:   ${found.length} component${found.length !== 1 ? 's' : ''}`)
  console.log(`  Already known:   ${existing.length - added}`)
  console.log(g(`  Newly added:     ${added}`))
  console.log('')
  if (added > 0) console.log(d('  Run components:ls to see full registry.'))
}

export async function cmdAddExport(_val, args = []) {
  const wsName = resolveWorkspace(parseStringFlag(args, 'workspace'))
  const wsDir = workspacePath(wsName)
  assertScopedWorkspaceDir(wsDir, wsName)
  const barrelRel = parseStringFlag(args, 'barrel')
  const name = parseStringFlag(args, 'name')

  if (!barrelRel || !name) {
    console.error(r('✗ --barrel:<path/to/index.ts> and --name:<ExportName> are required'))
    process.exit(1)
  }

  try {
    assertWithinWorkspace(wsDir, barrelRel, '--barrel')
  } catch (e) {
    if (e instanceof ValidationError) {
      console.error(r(`✗ ${e.message}`))
      process.exit(1)
    }
    throw e
  }

  const barrelPath = path.join(wsDir, barrelRel)
  if (!fs.existsSync(barrelPath)) {
    console.error(r(`✗ Barrel file not found: ${barrelRel}`))
    process.exit(1)
  }

  // Validate source file exists relative to the barrel
  const barrelDir = path.dirname(barrelPath)
  const srcFile = path.join(barrelDir, `${name}.tsx`)
  const srcExists = ['tsx', 'jsx', 'ts'].some(ext =>
    fs.existsSync(path.join(barrelDir, `${name}.${ext}`))
  )
  if (!srcExists) {
    console.error(r(`✗ Source file not found: ${path.relative(wsDir, srcFile)}`))
    console.error(
      d(
        `  Create component first: flowkit create:component --name:${name} --path:${path.relative(wsDir, barrelDir)}`
      )
    )
    process.exit(1)
  }

  const added = appendExportToBarrel(barrelPath, name, name)
  if (!added) {
    console.log(d(`  '${name}' is already exported from ${barrelRel}`))
    return
  }

  console.log(g(`✓ Added: export { default as ${name} } from './${name}'`))
  console.log(d(`  Barrel: ${barrelRel}`))
}

export async function cmdListExports(_val, args = []) {
  const wsName = resolveWorkspace(parseStringFlag(args, 'workspace'))
  const wsDir = workspacePath(wsName)
  assertScopedWorkspaceDir(wsDir, wsName)
  const barrelRel = parseStringFlag(args, 'barrel')

  if (!barrelRel) {
    console.error(r('✗ --barrel:<path/to/index.ts> is required'))
    process.exit(1)
  }

  try {
    assertWithinWorkspace(wsDir, barrelRel, '--barrel')
  } catch (e) {
    if (e instanceof ValidationError) {
      console.error(r(`✗ ${e.message}`))
      process.exit(1)
    }
    throw e
  }

  const barrelPath = path.join(wsDir, barrelRel)
  if (!fs.existsSync(barrelPath)) {
    console.error(r(`✗ Barrel file not found: ${barrelRel}`))
    process.exit(1)
  }

  const src = fs.readFileSync(barrelPath, 'utf8')
  const exports = [...src.matchAll(/export\s+\{[^}]+\}\s+from\s+['"]([^'"]+)['"]/g)].map(m =>
    m[0].trim()
  )

  console.log(b(`Exports  [${barrelRel}]\n`))
  if (exports.length === 0) {
    console.log(d('  (no named exports found)'))
    return
  }

  exports.forEach(e => console.log(`  ${d(e)}`))
  console.log('')
  console.log(d(`Total: ${exports.length} export${exports.length !== 1 ? 's' : ''}`))
}
