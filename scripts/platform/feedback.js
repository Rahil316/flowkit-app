// Platform command: feedback management (import/dump/list).
import fs from 'fs'
import path from 'path'
import { workspacePath } from '../helpers/paths.js'
import { g, r, b, d, c } from '../helpers/colors.js'
import { localDatePart, fmtDate } from '../helpers/dates.js'
import { resolveWorkspaceLoose } from '../helpers/workspace-resolve.js'
import { readJson } from '../helpers/json.js'

const FEEDBACK_FILE = '.flowkit-feedback.json'

function feedbackPath(ws) {
  return path.join(workspacePath(ws), FEEDBACK_FILE)
}

function readFeedback(ws) {
  return readJson(feedbackPath(ws))
}

// ─── feedback:import ──────────────────────────────────────────────────────────

export function cmdFeedbackImport(val, args) {
  const ws = resolveWorkspaceLoose(val)
  const file = args.find(a => !a.startsWith('--'))
  if (!file) {
    console.error(r('✗ Usage: flowkit feedback:import <file.json>'))
    process.exit(1)
  }

  const src = path.isAbsolute(file) ? file : path.join(process.cwd(), file)
  if (!fs.existsSync(src)) {
    console.error(r(`✗ File not found: ${file}`))
    process.exit(1)
  }

  let data
  try {
    data = JSON.parse(fs.readFileSync(src, 'utf8'))
  } catch (e) {
    console.error(r(`✗ Invalid JSON: ${e.message}`))
    process.exit(1)
  }

  if (!data || !Array.isArray(data.comments)) {
    console.error(r('✗ Invalid feedback export — expected { comments: [...] }'))
    process.exit(1)
  }

  const dest = feedbackPath(ws)
  const snapshot = { workspace: ws, importedAt: new Date().toISOString(), comments: data.comments }
  fs.writeFileSync(dest, JSON.stringify(snapshot, null, 2))
  console.log(g('✓') + ' Feedback imported ' + d(`→ workspaces/${ws}/${FEEDBACK_FILE}`))
  console.log(d(`  ${data.comments.length} comment${data.comments.length !== 1 ? 's' : ''}`))
}

// ─── feedback:dump ────────────────────────────────────────────────────────────

export function cmdFeedbackDump(val, args) {
  const ws = resolveWorkspaceLoose(val)
  const destFlag = (() => {
    const i = args.indexOf('--dest')
    return i !== -1 ? args[i + 1] : null
  })()

  const data = readFeedback(ws)
  if (!data) {
    console.error(r(`✗ No committed feedback found for workspace "${ws}"`))
    console.log(d(`  Import feedback with: `) + c(`flowkit feedback:import <file.json>`))
    process.exit(1)
  }

  const datePart = localDatePart()
  const outName = `feedback-${ws}-${datePart}.json`
  const dest = destFlag
    ? destFlag.endsWith('.json')
      ? destFlag
      : path.join(destFlag, outName)
    : path.join(process.cwd(), outName)

  fs.mkdirSync(path.dirname(dest), { recursive: true })
  fs.writeFileSync(dest, JSON.stringify(data, null, 2))
  console.log(g('✓') + ' Feedback exported ' + d(`→ ${dest}`))
  console.log(
    d(`  ${(data.comments ?? []).length} comment${(data.comments ?? []).length !== 1 ? 's' : ''}`)
  )
}

// ─── feedback:ls ──────────────────────────────────────────────────────────────

export function cmdFeedbackLs(val) {
  const ws = resolveWorkspaceLoose(val)
  const data = readFeedback(ws)

  console.log('')
  console.log(b(` Feedback — ${ws}`))
  console.log(d(' ────────────────────────────────────────────'))

  if (!data || !Array.isArray(data.comments) || data.comments.length === 0) {
    console.log(
      d('  No committed feedback. Import with: ') + c(`flowkit feedback:import <file.json>`)
    )
    console.log('')
    return
  }

  for (const cm of data.comments) {
    const reviewer = cm.reviewer ?? cm.author ?? '—'
    const screen = cm.pageId ?? cm.page ?? '—'
    const status = cm.status ?? 'open'
    const text = (cm.text ?? cm.body ?? '').slice(0, 80)
    const date = fmtDate(cm.createdAt ?? cm.timestamp ?? null)
    const statusColor = status === 'resolved' ? d : status === 'in-progress' ? c : s => s
    console.log(
      `  ${statusColor(status.padEnd(11))} ${b(reviewer.padEnd(14))} ${d(screen.padEnd(20))} ${date}`
    )
    if (text) console.log(`             ${d(text)}`)
  }

  console.log(d(' ────────────────────────────────────────────'))
  console.log(
    d(`  ${data.comments.length} comment${data.comments.length !== 1 ? 's' : ''}`) +
      (data.importedAt ? d(`  · imported ${fmtDate(data.importedAt)}`) : '')
  )
  console.log('')
}
