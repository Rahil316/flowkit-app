// Platform command: read-only flowStory/project discovery (flowStory:ls, project:ls). FlowStory
// validation lives in scripts/checks/flowStories.js — see `flowkit check:flowStories`.
import fs from 'fs'
import path from 'path'
import { workspacePath } from '../helpers/paths.js'
import { b, d } from '../helpers/colors.js'
import { resolveWorkspaceLoose as resolveWorkspace } from '../helpers/workspace-resolve.js'
import { FLOW_STORIES_DIRNAME } from '../helpers/config-filenames.js'
import { parseStringFlag } from '../helpers/args.js'

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
// This is the single source of truth for ALL flowStory-discovery commands.

function resolveFlowStories(ws, project) {
  const results = []

  // Flat layout — used by all post-refactor workspaces
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
    const storiesDir = path.join(projectsDir, proj, FLOW_STORIES_DIRNAME)
    if (!fs.existsSync(storiesDir)) continue
    for (const f of fs.readdirSync(storiesDir)) {
      if (!f.endsWith('.ts') && !f.endsWith('.js')) continue
      results.push({ project: proj, file: f, fullPath: path.join(storiesDir, f), flat: false })
    }
  }
  return results
}

function listFlowStories(ws, project) {
  return resolveFlowStories(ws, project)
}

// ─── flowStory:ls ───────────────────────────────────────────────────────────────

export function cmdFlowStoryLs(val, args = []) {
  const ws = resolveWorkspace(parseStringFlag(args, 'workspace') || val)
  const projectFlag = (args.find(a => a.startsWith('--project:')) || '').slice('--project:'.length)
  const stories = listFlowStories(ws, projectFlag || null)

  console.log('')
  console.log(b(` FlowStories — ${ws}`) + (projectFlag ? d(`  (project: ${projectFlag})`) : ''))
  console.log(d(' ────────────────────────────────────────────'))

  if (stories.length === 0) {
    console.log(
      d(`  No flowStories found. Drop a .ts file into ${FLOW_STORIES_DIRNAME}/ to add one.`)
    )
    console.log('')
    return
  }

  for (const { project, file, fullPath, flat } of stories) {
    const rel = path.relative(workspacePath(ws), fullPath)
    const loc = flat ? d(`  · ${FLOW_STORIES_DIRNAME}/${file}`) : d(`  · ${project}  · ${rel}`)
    console.log('  ' + b(file.replace(/\.(ts|js)$/, '')) + loc)
  }
  console.log(d(' ────────────────────────────────────────────'))
  console.log(d(`  ${stories.length} flowStor${stories.length !== 1 ? 'ies' : 'y'}`))
  console.log('')
}

// ─── project:ls ───────────────────────────────────────────────────────────────

export function cmdProjectLs(val, args = []) {
  const ws = resolveWorkspace(parseStringFlag(args, 'workspace') || val)
  const projectsDir = findProjectsDir(ws)
  const projects = listProjects(ws)

  console.log('')
  console.log(b(` Projects — ${ws}`))
  console.log(d(' ────────────────────────────────────────────'))

  if (projects.length === 0) {
    const stories = resolveFlowStories(ws, null)
    if (stories.length > 0 && stories[0].flat) {
      console.log(
        d(
          `  Flat workspace — no projects layer. ${stories.length} flowStor${stories.length !== 1 ? 'ies' : 'y'} in ${FLOW_STORIES_DIRNAME}/`
        )
      )
    } else {
      console.log(d('  No projects found.'))
    }
    console.log('')
    return
  }

  for (const proj of projects) {
    const storiesDir = path.join(projectsDir, proj, FLOW_STORIES_DIRNAME)
    const storyCount = fs.existsSync(storiesDir)
      ? fs.readdirSync(storiesDir).filter(f => f.endsWith('.ts') || f.endsWith('.js')).length
      : 0
    console.log('  ' + b(proj) + d(`  · ${storyCount} flowStor${storyCount !== 1 ? 'ies' : 'y'}`))
  }
  console.log(d(' ────────────────────────────────────────────'))
  console.log(d(`  ${projects.length} project${projects.length !== 1 ? 's' : ''}`))
  console.log('')
}
