// Platform command: read-only health snapshot of a workspace (chapters, sessions, feedback, agent).
import fs from 'fs'
import path from 'path'
import { workspacePath, isRepoMode, ROOT, getActiveWorkspaceName } from '../helpers/paths.js'
import { b, c, d, g, r } from '../helpers/colors.js'
import { flowLensModuleExists } from './sessions/index.js'
import { FLOW_BOOK_DIRNAME, FLOW_STORIES_DIRNAME } from '../helpers/config-filenames.js'
import { isHidden, isNonExistent } from '../../src/shared/utils/pagePathIdentity.js'

export function cmdStatus(wsArg) {
  const ws = (wsArg || '').trim() || getActiveWorkspaceName()
  if (!ws) {
    console.error(r('✗ No active workspace.'))
    process.exit(1)
  }

  const wsDir = workspacePath(ws)
  if (!fs.existsSync(wsDir)) {
    console.error(r(`✗ Workspace not found: ${wsDir}`))
    process.exit(1)
  }

  const chaptersDir = path.join(wsDir, FLOW_BOOK_DIRNAME)
  console.log('')
  console.log(b(` Status — ${ws}`))
  console.log(d(' ────────────────────────────────────────────'))

  const flatPlansDir = path.join(wsDir, FLOW_STORIES_DIRNAME)

  // Recursively walks a chapter folder (variable depth, mirroring
  // scripts/checks/screens.js's walkScreenFiles) counting real screen files.
  // `__`-prefixed segments are pruned entirely (never descended into); `_`-prefixed
  // segments are still counted here (status counts total authored screens, not just
  // visible ones) — excluded only when non-existent.
  function countScreenFiles(dir) {
    let count = 0
    for (const entry of fs.readdirSync(dir)) {
      if (isNonExistent(entry)) continue
      const full = path.join(dir, entry)
      if (fs.statSync(full).isDirectory()) {
        count += countScreenFiles(full)
      } else if (
        (entry.endsWith('.tsx') || entry.endsWith('.jsx')) &&
        !isHidden(entry) &&
        !isNonExistent(entry)
      ) {
        count++
      }
    }
    return count
  }

  // Chapters + screens: flowBook/<chapter>/.../<screen>/<Screen>.tsx (variable depth)
  let chapterCount = 0,
    screenCount = 0
  if (fs.existsSync(chaptersDir)) {
    for (const folder of fs.readdirSync(chaptersDir)) {
      if (isNonExistent(folder)) continue
      const full = path.join(chaptersDir, folder)
      if (!fs.statSync(full).isDirectory()) continue
      const total = countScreenFiles(full)
      if (total > 0) {
        chapterCount++
        screenCount += total
      }
    }
  }
  console.log(`  Chapters:        ${b(chapterCount)}  (${screenCount} screens total)`)

  // FlowStories
  if (fs.existsSync(flatPlansDir)) {
    const planCount = fs
      .readdirSync(flatPlansDir)
      .filter(f => f.endsWith('.ts') || f.endsWith('.js')).length
    console.log(`  FlowStories:       ${b(planCount)}`)
  }

  // Session library — sessions/<study>/*.json under lib/flowLens/
  const sessionsBase = path.join(wsDir, 'lib', 'flowLens', 'sessions')
  if (fs.existsSync(sessionsBase)) {
    const sessionFiles = fs
      .readdirSync(sessionsBase, { recursive: true })
      .filter(f => f.endsWith('.json'))
    const lensPresent = flowLensModuleExists()
    console.log(
      `  Sessions:        ${b(sessionFiles.length)}  ${lensPresent ? g('(FlowLens available)') : c('(FlowLens module not found)')}`
    )
  } else {
    console.log(`  Sessions:        ${d('no library  — use sessions:import to add sessions')}`)
  }

  // Feedback snapshot
  const feedbackPath = path.join(wsDir, '.flowkit-feedback.json')
  if (fs.existsSync(feedbackPath)) {
    try {
      const fb = JSON.parse(fs.readFileSync(feedbackPath, 'utf8'))
      const count = (fb.comments ?? []).length
      console.log(`  Feedback:        ${b(count)} committed comment${count !== 1 ? 's' : ''}`)
    } catch {
      console.log(`  Feedback:        ${r('unreadable .flowkit-feedback.json')}`)
    }
  } else {
    console.log(`  Feedback:        ${d('none committed')}`)
  }

  // Agent files
  const agentMetaPath = path.join(wsDir, '.agent', '.agent-meta.json')
  if (fs.existsSync(agentMetaPath)) {
    try {
      const meta = JSON.parse(fs.readFileSync(agentMetaPath, 'utf8'))
      console.log(`  Agent:           ${b(meta.agent ?? '?')}  spec v${meta.specVersion ?? '?'}`)
    } catch {
      console.log(`  Agent:           ${r('unreadable .agent-meta.json')}`)
    }
  } else {
    console.log(`  Agent:           ${d('not synced — run flowkit agent:sync')}`)
  }

  console.log('')
}
