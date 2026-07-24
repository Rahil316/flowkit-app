// Platform command: read-only flowStory/project discovery (plan:ls, project:ls). FlowStory
// validation lives in scripts/checks/flowStories.js — see `flowkit check:flowStories`.
import fs from 'fs'
import path from 'path'
import { workspacePath } from '../helpers/paths.js'
import { b, d } from '../helpers/colors.js'
import { resolveWorkspaceLoose as resolveWorkspace } from '../helpers/workspace-resolve.js'
import { FLOW_STORIES_DIRNAME } from '../helpers/config-filenames.js'

function findProjectsDir(ws) {
  return path.join(workspacePath(ws), 'projects')
}

function listProjects(ws) {
  const dir = findProjectsDir(ws)
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir).filter(f => fs.statSync(path.join(dir, f)).isDirectory())
}

// ─── Format-aware flowStory resolver (R1) ──────────────────────────────────────
// Checks the flat layout (workspaces/<ws>/flowStories/) first, then falls back
// to the legacy nested layout (workspaces/<ws>/projects/<proj>/flowStories/).
// This is the single source of truth for ALL plan-discovery commands.

function resolveFlowStories(ws, project) {
  const results = []

  // Flat layout — used by nClarity and all post-refactor workspaces
  if (!project) {
    const flatDir = path.join(workspacePath(ws), FLOW_STORIES_DIRNAME)
    if (fs.existsSync(flatDir)) {
      for (const f of fs.readdirSync(flatDir)) {
        if (!f.endsWith('.ts') && !f.endsWith('.js')) continue
        results.push({ project: null, file: f, fullPath: path.join(flatDir, f), flat: true })
      }
      if (results.length > 0) return results
    }
  }

  // Legacy nested layout — projects/<proj>/flowStories/
  const projectsDir = findProjectsDir(ws)
  if (!fs.existsSync(projectsDir)) return results
  const projects = project ? [project] : listProjects(ws)
  for (const proj of projects) {
    const plansDir = path.join(projectsDir, proj, FLOW_STORIES_DIRNAME)
    if (!fs.existsSync(plansDir)) continue
    for (const f of fs.readdirSync(plansDir)) {
      if (!f.endsWith('.ts') && !f.endsWith('.js')) continue
      results.push({ project: proj, file: f, fullPath: path.join(plansDir, f), flat: false })
    }
  }
  return results
}

function listFlowStories(ws, project) {
  return resolveFlowStories(ws, project)
}

// ─── plan:ls ──────────────────────────────────────────────────────────────────

export function cmdPlanLs(val, args) {
  const ws = resolveWorkspace(val)
  const projectFlag = (args.find(a => a.startsWith('--project:')) || '').slice('--project:'.length)
  const plans = listFlowStories(ws, projectFlag || null)

  console.log('')
  console.log(b(` FlowStories — ${ws}`) + (projectFlag ? d(`  (project: ${projectFlag})`) : ''))
  console.log(d(' ────────────────────────────────────────────'))

  if (plans.length === 0) {
    console.log(
      d(`  No flowStories found. Drop a .ts file into ${FLOW_STORIES_DIRNAME}/ to add one.`)
    )
    console.log('')
    return
  }

  for (const { project, file, fullPath, flat } of plans) {
    const rel = path.relative(workspacePath(ws), fullPath)
    const loc = flat ? d(`  · ${FLOW_STORIES_DIRNAME}/${file}`) : d(`  · ${project}  · ${rel}`)
    console.log('  ' + b(file.replace(/\.(ts|js)$/, '')) + loc)
  }
  console.log(d(' ────────────────────────────────────────────'))
  console.log(d(`  ${plans.length} plan${plans.length !== 1 ? 's' : ''}`))
  console.log('')
}

// ─── project:ls ───────────────────────────────────────────────────────────────

export function cmdProjectLs(val) {
  const ws = resolveWorkspace(val)
  const projectsDir = findProjectsDir(ws)
  const projects = listProjects(ws)

  console.log('')
  console.log(b(` Projects — ${ws}`))
  console.log(d(' ────────────────────────────────────────────'))

  if (projects.length === 0) {
    const plans = resolveFlowStories(ws, null)
    if (plans.length > 0 && plans[0].flat) {
      console.log(
        d(
          `  Flat workspace — no projects layer. ${plans.length} flowStory${plans.length !== 1 ? 's' : ''} in ${FLOW_STORIES_DIRNAME}/`
        )
      )
    } else {
      console.log(d('  No projects found.'))
    }
    console.log('')
    return
  }

  for (const proj of projects) {
    const plansDir = path.join(projectsDir, proj, FLOW_STORIES_DIRNAME)
    const planCount = fs.existsSync(plansDir)
      ? fs.readdirSync(plansDir).filter(f => f.endsWith('.ts') || f.endsWith('.js')).length
      : 0
    console.log('  ' + b(proj) + d(`  · ${planCount} plan${planCount !== 1 ? 's' : ''}`))
  }
  console.log(d(' ────────────────────────────────────────────'))
  console.log(d(`  ${projects.length} project${projects.length !== 1 ? 's' : ''}`))
  console.log('')
}
