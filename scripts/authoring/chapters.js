// Authoring command: CRUD for chapters (create/remove/list).
import fs from 'fs'
import path from 'path'
import { parseStringFlag } from '../helpers/args.js'
import { resolveWorkspace } from '../helpers/workspace-resolve.js'
import { workspacePath, assertScopedWorkspaceDir } from '../helpers/paths.js'
import { assertKebab } from '../helpers/validate.js'
import { g, r, b, d } from '../helpers/colors.js'
import {
  addChapter,
  removeChapter,
  readWorkspaceConfig,
  chapterExists,
} from '../authoring-support/config-patch.js'
import { prompt, selectFromList } from '../helpers/prompt.js'
import { WORKSPACE_CONFIG_FILENAME, FLOW_BOOK_DIRNAME } from '../helpers/config-filenames.js'

export async function cmdCreateChapter(_val, args = []) {
  const wsName = resolveWorkspace(parseStringFlag(args, 'workspace'))
  const wsDir = workspacePath(wsName)
  assertScopedWorkspaceDir(wsDir, wsName)
  let chapterId = parseStringFlag(args, 'name')

  if (!chapterId) {
    const rl = (await import('readline')).createInterface({
      input: process.stdin,
      output: process.stdout,
    })
    chapterId = await prompt(rl, 'Chapter ID (kebab-case): ')
    rl.close()
    if (!chapterId) {
      console.error(r('✗ Chapter name is required'))
      process.exit(1)
    }
  }

  try {
    chapterId = assertKebab(chapterId, 'name')
  } catch (e) {
    console.error(r(`✗ ${e.message}`))
    process.exit(1)
  }

  if (chapterExists(wsDir, chapterId)) {
    console.error(r(`✗ Chapter '${chapterId}' already exists`))
    process.exit(1)
  }

  const chapterDir = path.join(wsDir, FLOW_BOOK_DIRNAME, chapterId)

  try {
    fs.mkdirSync(chapterDir, { recursive: true })
    addChapter(wsDir, chapterId)
    console.log(g(`✓ Chapter created:  ${FLOW_BOOK_DIRNAME}/${chapterId}/`))
    console.log(g(`✓ Registered:       ${WORKSPACE_CONFIG_FILENAME} → chapters[] + pageOrder`))
    console.log('')
    console.log(
      d(`Next: flowkit create:page --chapter:${chapterId} --name:<first-page> --label:"Page Name"`)
    )
  } catch (e) {
    // Rollback on failure
    if (fs.existsSync(chapterDir)) fs.rmSync(chapterDir, { recursive: true, force: true })
    console.error(r(`✗ Failed: ${e.message}`))
    process.exit(1)
  }
}

export async function cmdRemoveChapter(_val, args = []) {
  const wsName = resolveWorkspace(parseStringFlag(args, 'workspace'))
  const wsDir = workspacePath(wsName)
  assertScopedWorkspaceDir(wsDir, wsName)
  let chapterId = parseStringFlag(args, 'name')
  const force = args.includes('--force')

  if (!chapterId) {
    console.error(r('✗ --name:<chapter-id> is required'))
    process.exit(1)
  }
  try {
    chapterId = assertKebab(chapterId, 'name')
  } catch (e) {
    console.error(r(`✗ ${e.message}`))
    process.exit(1)
  }

  if (!chapterExists(wsDir, chapterId)) {
    console.error(r(`✗ Chapter '${chapterId}' not found in workspace '${wsName}'`))
    process.exit(1)
  }

  const chapterDir = path.join(wsDir, FLOW_BOOK_DIRNAME, chapterId)
  if (fs.existsSync(chapterDir)) {
    const pages = fs
      .readdirSync(chapterDir)
      .filter(f => fs.statSync(path.join(chapterDir, f)).isDirectory())
    if (pages.length > 0 && !force) {
      console.error(
        r(`✗ Chapter '${chapterId}' has ${pages.length} page(s). Use --force to delete them.`)
      )
      process.exit(1)
    }
  }

  removeChapter(wsDir, chapterId)
  if (fs.existsSync(chapterDir)) fs.rmSync(chapterDir, { recursive: true, force: true })
  console.log(g(`✓ Chapter removed:  ${FLOW_BOOK_DIRNAME}/${chapterId}/`))
  console.log(g(`✓ Unregistered:     ${WORKSPACE_CONFIG_FILENAME}`))
}

export async function cmdListChapters(_val, args = []) {
  const wsName = resolveWorkspace(parseStringFlag(args, 'workspace'))
  const wsDir = workspacePath(wsName)
  assertScopedWorkspaceDir(wsDir, wsName)
  const config = readWorkspaceConfig(wsDir)

  if (config.chapters.length === 0) {
    console.log(d(`No chapters in workspace '${wsName}'`))
    console.log(d('Create one: flowkit create:chapter --name:<chapter-id>'))
    return
  }

  console.log(b(`Chapters  [${wsName}]\n`))
  for (const chapterId of config.chapters) {
    const pages = config.pageOrder[chapterId] || []
    const count = String(pages.length).padStart(2)
    console.log(`  ${chapterId.padEnd(28)} ${d(`${count} page${pages.length !== 1 ? 's' : ''}`)}`)
  }
  console.log('')
  console.log(
    d(`Total: ${config.chapters.length} chapter${config.chapters.length !== 1 ? 's' : ''}`)
  )
}
