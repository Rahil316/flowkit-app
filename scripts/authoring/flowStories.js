// Authoring command: CRUD for flowStories and their steps (create/remove/add/list/info).
import fs from 'fs'
import path from 'path'
import { parseStringFlag } from '../helpers/args.js'
import { resolveWorkspace } from '../helpers/workspace-resolve.js'
import { workspacePath, resolveDefineImport, assertScopedWorkspaceDir } from '../helpers/paths.js'
import { assertKebab } from '../helpers/validate.js'
import { g, r, b, d, c } from '../helpers/colors.js'
import { readWorkspaceConfig } from '../authoring-support/config-patch.js'
import { FLOW_STORIES_DIRNAME } from '../helpers/config-filenames.js'
import { makePageId } from '../../src/shared/utils/pagePathIdentity.js'

function toDisplayName(kebab) {
  return kebab
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function flowplanPath(wsDir, id) {
  return path.join(wsDir, FLOW_STORIES_DIRNAME, `${id}.ts`)
}

/** Parse a flowStory .ts file into a plain object. Returns null on failure. */
function parseFlowplan(filePath) {
  if (!fs.existsSync(filePath)) return null
  let src = fs.readFileSync(filePath, 'utf8')
  src = src.replace(/^import\s+.*\n/gm, '')
  src = src.replace(/export\s+default\s+defineFlow\s*\(/, 'return (')
  try {
    return new Function(src)()
  } catch {
    return null
  }
}

/** Format a single step object back to source. */
function formatStep(step) {
  const parts = [`pageId: '${step.pageId}'`]
  if (step.on) parts.push(`on: '${step.on.replace(/'/g, "\\'")}'`)
  if (step.actionNote) parts.push(`actionNote: '${step.actionNote.replace(/'/g, "\\'")}'`)
  if (step.decisionNote) parts.push(`decisionNote: '${step.decisionNote.replace(/'/g, "\\'")}'`)
  if (step.annotation) parts.push(`annotation: '${step.annotation.replace(/'/g, "\\'")}'`)
  return `    { ${parts.join(', ')} },`
}

/**
 * Replace the steps: [...] block in a flowStory source with regenerated steps.
 *
 * formatStep() only serializes pageId/on/actionNote/decisionNote/annotation —
 * it has no serialization path for a step's `forks`, and the non-greedy regex
 * below only matches up to the first `]`, not the true end of a nested-bracket
 * steps array. Silently proceeding on a flowStory with forks would either drop
 * the fork data or write out a truncated/malformed array. Refuse instead —
 * `promote:chapter` is the one command that correctly bracket-scans nested
 * structures, so route the author there or ask them to hand-edit.
 */
function rewriteSteps(filePath, steps) {
  const forkedIndex = steps.findIndex(s => Array.isArray(s.forks) && s.forks.length > 0)
  if (forkedIndex !== -1) {
    throw new Error(
      `Step [${forkedIndex}] has forks — add:step/remove:step can't safely rewrite a flowStory ` +
        `with forks (only simple, non-nested step arrays are supported). Hand-edit ` +
        `${path.basename(filePath)} directly, or use "flowkit promote:chapter" to extract the fork first.`
    )
  }
  let src = fs.readFileSync(filePath, 'utf8')
  const stepsContent = steps.length > 0 ? '\n' + steps.map(formatStep).join('\n') + '\n  ' : ''
  // Non-greedy match — works for simple step arrays (no fork nesting)
  src = src.replace(/steps:\s*\[[\s\S]*?\]/, `steps: [${stepsContent}]`)
  fs.writeFileSync(filePath, src)
}

function flowplanTemplate(id, displayName) {
  return `${resolveDefineImport('defineFlow')}

export default defineFlow({
  id: '${id}',
  name: '${displayName}',
  description: '',

  steps: [
    // { pageId: 'page-id', on: 'element-id', actionNote: 'What the user does' },
  ],
})
`
}

export async function cmdCreateFlowplan(_val, args = []) {
  const wsName = resolveWorkspace(parseStringFlag(args, 'workspace'))
  const wsDir = workspacePath(wsName)
  assertScopedWorkspaceDir(wsDir, wsName)
  let id = parseStringFlag(args, 'name')

  if (!id) {
    console.error(r('✗ --name:<flowStory-id> is required'))
    console.error(d('  Example: flowkit create:flowStory --name:auth'))
    process.exit(1)
  }

  try {
    id = assertKebab(id, 'name')
  } catch (e) {
    console.error(r(`✗ ${e.message}`))
    process.exit(1)
  }

  const fpPath = flowplanPath(wsDir, id)
  if (fs.existsSync(fpPath)) {
    console.error(r(`✗ Flowplan '${id}' already exists: ${FLOW_STORIES_DIRNAME}/${id}.ts`))
    process.exit(1)
  }

  const fpDir = path.join(wsDir, FLOW_STORIES_DIRNAME)
  if (!fs.existsSync(fpDir)) fs.mkdirSync(fpDir, { recursive: true })

  const displayName = toDisplayName(id)
  fs.writeFileSync(fpPath, flowplanTemplate(id, displayName))

  console.log(g(`✓ Flowplan: ${FLOW_STORIES_DIRNAME}/${id}.ts`))
  console.log('')
  console.log(d(`Next:`))
  console.log(d(`  flowkit add:step --flowStory:${id} --page:<pageId> --action:"User arrives"`))
  console.log(d(`  flowkit list:steps --flowStory:${id}`))
}

export async function cmdRemoveFlowplan(_val, args = []) {
  const wsName = resolveWorkspace(parseStringFlag(args, 'workspace'))
  const wsDir = workspacePath(wsName)
  assertScopedWorkspaceDir(wsDir, wsName)
  const id = parseStringFlag(args, 'name')
  const force = args.includes('--force')

  if (!id) {
    console.error(r('✗ --name:<flowStory-id> is required'))
    process.exit(1)
  }

  const fpPath = flowplanPath(wsDir, id)
  if (!fs.existsSync(fpPath)) {
    console.error(r(`✗ Flowplan not found: ${FLOW_STORIES_DIRNAME}/${id}.ts`))
    process.exit(1)
  }

  if (!force) {
    console.error(r(`✗ Add --force to confirm deletion of ${FLOW_STORIES_DIRNAME}/${id}.ts`))
    process.exit(1)
  }

  fs.unlinkSync(fpPath)
  console.log(g(`✓ Removed: ${FLOW_STORIES_DIRNAME}/${id}.ts`))
}

export async function cmdAddStep(_val, args = []) {
  const wsName = resolveWorkspace(parseStringFlag(args, 'workspace'))
  const wsDir = workspacePath(wsName)
  assertScopedWorkspaceDir(wsDir, wsName)
  const fpId = parseStringFlag(args, 'flowStory')
  const pageId = parseStringFlag(args, 'page')
  const on = parseStringFlag(args, 'on')
  const actionNote = parseStringFlag(args, 'action')
  const positionStr = parseStringFlag(args, 'position')

  if (!fpId || !pageId) {
    console.error(r('✗ --flowStory:<id> and --page:<pageId> are required'))
    process.exit(1)
  }

  // Validate the bare pageId exists in some flow's pageOrder (pageOrder is
  // flow-scoped/bare, per config-patch.js), then build the collision-proof composite
  // id (chapter-page) from whichever flow it's actually registered under — a flowStory's
  // own id is a separate authored concept, not necessarily the same as the target
  // page's chapter folder, so this can't be assumed from fpId.
  const config = readWorkspaceConfig(wsDir)
  const owningFlow = Object.entries(config.pageOrder).find(([, pages]) =>
    pages.includes(pageId)
  )?.[0]
  if (!owningFlow) {
    const allPages = Object.values(config.pageOrder).flat()
    console.error(r(`✗ pageId '${pageId}' not found in workspace flows`))
    const close = allPages.filter(s => s.startsWith(pageId.split('-')[0]))
    if (close.length > 0) console.error(d(`  Did you mean: ${close.join(', ')}`))
    console.error(d(`  Available pages: ${allPages.join(', ')}`))
    process.exit(1)
  }
  const compositePageId = makePageId(owningFlow, pageId)

  const fpPath = flowplanPath(wsDir, fpId)
  if (!fs.existsSync(fpPath)) {
    console.error(r(`✗ Flowplan not found: ${FLOW_STORIES_DIRNAME}/${fpId}.ts`))
    console.error(d(`  Create it first: flowkit create:flowStory --name:${fpId}`))
    process.exit(1)
  }

  const step = { pageId: compositePageId }
  if (on) step.on = on
  if (actionNote) step.actionNote = actionNote

  const fp = parseFlowplan(fpPath)
  if (!fp) {
    console.error(
      r(`✗ Failed to parse ${FLOW_STORIES_DIRNAME}/${fpId}.ts — check for syntax errors`)
    )
    process.exit(1)
  }

  const steps = fp.steps || []
  if (positionStr !== '') {
    const position = parseInt(positionStr, 10)
    if (!isNaN(position)) steps.splice(position, 0, step)
    else steps.push(step)
  } else {
    steps.push(step)
  }
  try {
    rewriteSteps(fpPath, steps)
  } catch (e) {
    console.error(r(`✗ ${e.message}`))
    process.exit(1)
  }

  console.log(g(`✓ Step added to ${FLOW_STORIES_DIRNAME}/${fpId}.ts`))
  console.log(
    `  ${d('page:')} ${pageId}${on ? `  ${d('on:')} ${on}` : ''}${actionNote ? `  ${d('action:')} ${actionNote}` : ''}`
  )
  console.log('')
  console.log(d(`View: flowkit list:steps --flowStory:${fpId}`))
}

export async function cmdRemoveStep(_val, args = []) {
  const wsName = resolveWorkspace(parseStringFlag(args, 'workspace'))
  const wsDir = workspacePath(wsName)
  assertScopedWorkspaceDir(wsDir, wsName)
  const fpId = parseStringFlag(args, 'flowStory')
  const indexStr = parseStringFlag(args, 'index')

  if (!fpId || indexStr === null || indexStr === undefined) {
    console.error(r('✗ --flowStory:<id> and --index:<n> are required (0-based)'))
    process.exit(1)
  }

  const fpPath = flowplanPath(wsDir, fpId)
  if (!fs.existsSync(fpPath)) {
    console.error(r(`✗ Flowplan not found: ${FLOW_STORIES_DIRNAME}/${fpId}.ts`))
    process.exit(1)
  }

  const fp = parseFlowplan(fpPath)
  if (!fp) {
    console.error(r(`✗ Failed to parse ${FLOW_STORIES_DIRNAME}/${fpId}.ts`))
    process.exit(1)
  }

  const idx = parseInt(indexStr, 10)
  const steps = fp.steps || []
  if (idx < 0 || idx >= steps.length) {
    console.error(r(`✗ Index ${idx} out of range (0–${steps.length - 1})`))
    process.exit(1)
  }

  const removed = steps.splice(idx, 1)[0]
  try {
    rewriteSteps(fpPath, steps)
  } catch (e) {
    console.error(r(`✗ ${e.message}`))
    process.exit(1)
  }

  console.log(g(`✓ Removed step [${idx}]: pageId '${removed.pageId}'`))
  if (steps.length > 0) {
    console.log(d(`  Flowplan now has ${steps.length} step${steps.length !== 1 ? 's' : ''}`))
  }
}

export async function cmdListSteps(_val, args = []) {
  const wsName = resolveWorkspace(parseStringFlag(args, 'workspace'))
  const wsDir = workspacePath(wsName)
  assertScopedWorkspaceDir(wsDir, wsName)
  const fpId = parseStringFlag(args, 'flowStory')

  if (!fpId) {
    console.error(r('✗ --flowStory:<id> is required'))
    process.exit(1)
  }

  const fpPath = flowplanPath(wsDir, fpId)
  if (!fs.existsSync(fpPath)) {
    console.error(r(`✗ Flowplan not found: ${FLOW_STORIES_DIRNAME}/${fpId}.ts`))
    process.exit(1)
  }

  const fp = parseFlowplan(fpPath)
  if (!fp) {
    console.error(
      r(`✗ Failed to parse ${FLOW_STORIES_DIRNAME}/${fpId}.ts — check for syntax errors`)
    )
    process.exit(1)
  }

  const steps = fp.steps || []
  console.log(b(`Steps  [${fpId}] — ${fp.name || fpId}\n`))

  if (steps.length === 0) {
    console.log(d('  (no steps)'))
    console.log(d(`  Add one: flowkit add:step --flowStory:${fpId} --page:<pageId>`))
    return
  }

  steps.forEach((step, i) => {
    const idx = String(i).padStart(2)
    const on = step.on ? `  ${d(`on: ${step.on}`)}` : ''
    const note = step.actionNote ? `  ${d(`"${step.actionNote}"`)}` : ''
    console.log(`  [${idx}] ${c(step.pageId)}${on}${note}`)
  })
  console.log('')
  console.log(d(`Total: ${steps.length} step${steps.length !== 1 ? 's' : ''}`))
}

export async function cmdFlowplanInfo(_val, args = []) {
  const wsName = resolveWorkspace(parseStringFlag(args, 'workspace'))
  const wsDir = workspacePath(wsName)
  assertScopedWorkspaceDir(wsDir, wsName)
  const fpId = parseStringFlag(args, 'name')

  if (!fpId) {
    console.error(r('✗ --name:<flowStory-id> is required'))
    process.exit(1)
  }

  const fpPath = flowplanPath(wsDir, fpId)
  if (!fs.existsSync(fpPath)) {
    console.error(r(`✗ Flowplan not found: ${FLOW_STORIES_DIRNAME}/${fpId}.ts`))
    process.exit(1)
  }

  const fp = parseFlowplan(fpPath)
  if (!fp) {
    console.error(
      r(`✗ Failed to parse ${FLOW_STORIES_DIRNAME}/${fpId}.ts — check for syntax errors`)
    )
    process.exit(1)
  }

  const steps = fp.steps || []
  console.log(b(`Flowplan: ${fpId}\n`))
  console.log(`  ID:          ${fp.id || fpId}`)
  console.log(`  Name:        ${fp.name || d('(not set)')}`)
  console.log(`  Description: ${fp.description || d('(not set)')}`)
  console.log(`  Steps:       ${steps.length}`)

  if (steps.length > 0) {
    console.log('')
    console.log(d('  First 5 steps:'))
    steps.slice(0, 5).forEach((step, i) => {
      const on = step.on ? ` → ${step.on}` : ''
      const note = step.actionNote ? ` — "${step.actionNote}"` : ''
      console.log(`    ${i + 1}. ${step.pageId}${on}${d(note)}`)
    })
    if (steps.length > 5) console.log(d(`    … and ${steps.length - 5} more`))
  }
}
