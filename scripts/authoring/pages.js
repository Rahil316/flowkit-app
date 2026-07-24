// Authoring command: CRUD for pages within a flow (create/remove/rename/move/list/info).
import fs from 'fs'
import path from 'path'
import { parseStringFlag } from '../helpers/args.js'
import { resolveWorkspace } from '../helpers/workspace-resolve.js'
import {
  workspacePath,
  assertScopedWorkspaceDir,
  resolveTypeImport,
  detectWorkspaceLanguage,
} from '../helpers/paths.js'
import { asJsStringLiteral, assertKebab } from '../helpers/validate.js'
import { g, r, b, d, c } from '../helpers/colors.js'
import {
  readWorkspaceConfig,
  addPage,
  removePage,
  renamePage,
  movePage,
  pageExists,
  listPages,
} from '../authoring-support/config-patch.js'
import {
  WORKSPACE_CONFIG_FILENAME,
  FLOW_BOOK_DIRNAME,
  FLOW_STORIES_DIRNAME,
} from '../helpers/config-filenames.js'
import {
  makePageId,
  isNonExistent,
  isHidden,
  pickPageFile,
} from '../../src/shared/utils/pagePathIdentity.js'

const PAGE_EXTS = ['.tsx', '.jsx']

/** kebab-case → PascalCase: 'sign-in' → 'SignIn' */
function toPascal(kebab) {
  return kebab
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join('')
}

/**
 * Finds the real page component file inside a page folder, regardless of filename
 * convention (the CLI's own create:page generates `${Pascal(pageId)}Page.ext`, but
 * hand-authored or differently-scaffolded pages — e.g. scripts/helpers/scaffold.js's
 * demo content, which drops the redundant "Screen"/"Page" suffix — may not follow that
 * exact pattern; identity is folder-derived, not filename-derived, per
 * pagePathIdentity.js). Reuses the same pickPageFile() tie-break as the runtime/checks
 * use for ambiguous folders. Returns { fileName, ext } or null if no candidate exists.
 */
function findPageFile(pageDir) {
  if (!fs.existsSync(pageDir)) return null
  const candidates = fs
    .readdirSync(pageDir)
    .filter(f => !isNonExistent(f) && PAGE_EXTS.some(ext => f.endsWith(ext)))
    .filter(f => fs.statSync(path.join(pageDir, f)).isFile())
  const { chosen } = pickPageFile(candidates)
  if (!chosen) return null
  return { fileName: chosen, ext: path.extname(chosen).slice(1) }
}

/** Extracts the exported default function's name from a page file's source, or null. */
function findDefaultExportName(src) {
  const m = src.match(/export default function (\w+)\s*\(/)
  return m ? m[1] : null
}

/** kebab-case → Title Case label: 'sign-in' → 'Sign In' */
function toTitleLabel(kebab) {
  return kebab
    .split('-')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ')
}

function pageTemplate(pascalName, label, isJs) {
  // onNext/db are prefixed with _ — the placeholder body doesn't use either yet,
  // and this project's tsconfig has noUnusedLocals: true, which flags unused
  // destructured bindings (TS6198) even though they're real, usable props the
  // author will wire up as they build the page out. Not applicable in JS
  // mode (no tsconfig noUnusedLocals to satisfy), so the JS variant skips it.
  const header = isJs ? '' : `${resolveTypeImport('PageProps')}\n\n`
  const propsDestructure = isJs ? '{ onNext, db }' : '{ onNext: _onNext, db: _db }'
  const propsType = isJs ? '' : ': PageProps'
  return `${header}export default function ${pascalName}Page(${propsDestructure}${propsType}) {
  return (
    <div className="flex flex-col h-full bg-theme-base">
      {/* Build your page here */}
    </div>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const pageMeta = { label: ${asJsStringLiteral(label)}, desc: '' }
`
}

/** Scan all flowStory files for any step referencing pageId (composite chapter-page form,
 * since that's what add:step writes into steps). Returns list of flowStory ids. */
function findFlowplanRefs(wsDir, chapterId, pageId) {
  const compositePageId = makePageId(chapterId, pageId)
  const fpDir = path.join(wsDir, FLOW_STORIES_DIRNAME)
  if (!fs.existsSync(fpDir)) return []
  return fs
    .readdirSync(fpDir)
    .filter(f => f.endsWith('.ts'))
    .filter(f => {
      const src = fs.readFileSync(path.join(fpDir, f), 'utf8')
      return (
        src.includes(`pageId: '${compositePageId}'`) || src.includes(`pageId: "${compositePageId}"`)
      )
    })
    .map(f => f.replace('.ts', ''))
}

export async function cmdCreatePage(_val, args = []) {
  const wsName = resolveWorkspace(parseStringFlag(args, 'workspace'))
  const wsDir = workspacePath(wsName)
  assertScopedWorkspaceDir(wsDir, wsName)
  let flowId = parseStringFlag(args, 'flow')
  let pageId = parseStringFlag(args, 'name')
  let label = parseStringFlag(args, 'label')

  if (!flowId || !pageId) {
    console.error(r('✗ --flow:<flow-id> and --name:<page-id> are required'))
    console.error(d('  Example: flowkit create:page --flow:auth --name:sign-in --label:"Sign In"'))
    process.exit(1)
  }

  try {
    flowId = assertKebab(flowId, 'flow')
    pageId = assertKebab(pageId, 'page name')
  } catch (e) {
    console.error(r(`✗ ${e.message}`))
    process.exit(1)
  }

  const config = readWorkspaceConfig(wsDir)
  if (!config.chapters.includes(flowId)) {
    console.error(r(`✗ Flow '${flowId}' not found in workspace '${wsName}'`))
    console.error(d(`  Create it first: flowkit create:chapter --name:${flowId}`))
    process.exit(1)
  }

  if (pageExists(wsDir, pageId)) {
    console.error(r(`✗ Page '${pageId}' already exists in workspace '${wsName}'`))
    process.exit(1)
  }

  if (!label) label = toTitleLabel(pageId)

  const isJs = detectWorkspaceLanguage(wsDir) === 'js'
  const ext = isJs ? 'jsx' : 'tsx'
  const pascalName = toPascal(pageId)
  // The CLI always creates the standard 2-level shape (flow/page, no cosmetic
  // folders in between) — variable-depth nesting is a hand-authoring capability,
  // not something this command needs to produce itself.
  const pageDir = path.join(wsDir, FLOW_BOOK_DIRNAME, flowId, pageId)
  // "Page" suffix is no longer REQUIRED anywhere (pagePathIdentity.js derives
  // identity from folders, not filename) — but we keep generating it as the CLI's
  // own friendly convention default, since it costs nothing and reads clearly.
  const pageFile = path.join(pageDir, `${pascalName}Page.${ext}`)
  // Collision-proof display/registration id: `${flowId}-${pageId}` — see
  // pagePathIdentity.js's makePageId(). config-patch.js's pageOrder map is
  // already flow-scoped (pageOrder[flowId] = [...]) so it stores the bare
  // pageId internally without risk of cross-flow collision; makePageId is
  // only needed where an id is shown to the user or would be compared globally.
  const fullPageId = makePageId(flowId, pageId)

  try {
    fs.mkdirSync(pageDir, { recursive: true })
    fs.writeFileSync(pageFile, pageTemplate(pascalName, label, isJs))
    addPage(wsDir, flowId, pageId)
    console.log(g(`✓ Directory:  ${FLOW_BOOK_DIRNAME}/${flowId}/${pageId}/`))
    console.log(
      g(`✓ Page:       ${FLOW_BOOK_DIRNAME}/${flowId}/${pageId}/${pascalName}Page.${ext}`)
    )
    console.log(
      g(`✓ Registered: ${WORKSPACE_CONFIG_FILENAME} → pageOrder.${flowId}[] (id: ${fullPageId})`)
    )
    console.log('')
    console.log(
      d(
        `Next: flowkit add:step --flowStory:<flowStory-id> --page:${pageId} --action:"User arrives at ${label}"`
      )
    )
  } catch (e) {
    if (fs.existsSync(pageDir)) fs.rmSync(pageDir, { recursive: true, force: true })
    console.error(r(`✗ Failed: ${e.message}`))
    process.exit(1)
  }
}

export async function cmdRemovePage(_val, args = []) {
  const wsName = resolveWorkspace(parseStringFlag(args, 'workspace'))
  const wsDir = workspacePath(wsName)
  assertScopedWorkspaceDir(wsDir, wsName)
  let flowId = parseStringFlag(args, 'flow')
  let pageId = parseStringFlag(args, 'name')

  if (!flowId || !pageId) {
    console.error(r('✗ --flow:<flow-id> and --name:<page-id> are required'))
    process.exit(1)
  }
  try {
    flowId = assertKebab(flowId, 'flow')
    pageId = assertKebab(pageId, 'page name')
  } catch (e) {
    console.error(r(`✗ ${e.message}`))
    process.exit(1)
  }

  const refs = findFlowplanRefs(wsDir, flowId, pageId)
  if (refs.length > 0) {
    console.log(r(`⚠  Warning: flowStory(s) reference '${pageId}': ${refs.join(', ')}`))
    console.log(r('   Update those flowStories after removing this page.'))
  }

  removePage(wsDir, flowId, pageId)

  // Keeping the CLI's own 2-level assumption for locating the folder to delete
  // (flowBook/<flow>/<page>/) — a page this command created is always
  // here; a hand-authored page nested deeper (cosmetic folders in between)
  // is an advanced/manual case this command does not attempt to locate or
  // remove in this pass.
  const pageDir = path.join(wsDir, FLOW_BOOK_DIRNAME, flowId, pageId)
  if (fs.existsSync(pageDir)) fs.rmSync(pageDir, { recursive: true, force: true })

  const fullPageId = makePageId(flowId, pageId)
  console.log(g(`✓ Removed:      ${FLOW_BOOK_DIRNAME}/${flowId}/${pageId}/`))
  console.log(
    g(`✓ Unregistered: ${WORKSPACE_CONFIG_FILENAME} → pageOrder.${flowId}[] (id: ${fullPageId})`)
  )
}

export async function cmdRenamePage(_val, args = []) {
  const wsName = resolveWorkspace(parseStringFlag(args, 'workspace'))
  const wsDir = workspacePath(wsName)
  assertScopedWorkspaceDir(wsDir, wsName)
  let flowId = parseStringFlag(args, 'flow')
  let oldId = parseStringFlag(args, 'name')
  let newId = parseStringFlag(args, 'to')

  if (!flowId || !oldId || !newId) {
    console.error(r('✗ --flow:<id> --name:<old-id> --to:<new-id> are required'))
    process.exit(1)
  }

  try {
    flowId = assertKebab(flowId, 'flow')
    oldId = assertKebab(oldId, 'name')
    newId = assertKebab(newId, 'new name')
  } catch (e) {
    console.error(r(`✗ ${e.message}`))
    process.exit(1)
  }

  // Same 2-level assumption as cmdRemovePage/cmdMovePage — see comment there.
  const oldDir = path.join(wsDir, FLOW_BOOK_DIRNAME, flowId, oldId)
  const newDir = path.join(wsDir, FLOW_BOOK_DIRNAME, flowId, newId)

  if (!fs.existsSync(oldDir)) {
    console.error(r(`✗ Page directory not found: ${FLOW_BOOK_DIRNAME}/${flowId}/${oldId}/`))
    process.exit(1)
  }
  if (newId !== oldId && pageExists(wsDir, newId)) {
    console.error(r(`✗ Page '${newId}' already exists in workspace '${wsName}'`))
    process.exit(1)
  }

  // The real page file is found by scanning the folder (pickPageFile — same
  // tie-break the runtime/checks use for ambiguous folders) rather than assuming an
  // exact filename, since identity is folder-derived, not filename-derived
  // (pagePathIdentity.js) — the CLI's own create:page generates `${Pascal(id)}Page.ext`,
  // but other content (e.g. scaffold.js's demo pages) uses different conventions and
  // there's no reliable way to derive a "new" file/function name from an arbitrary old
  // one. So: only rename the file and patch the function name when the file matches the
  // CLI's own generated pattern exactly (oldPascal + 'Page') — for anything else, rename
  // the folder and registration (which is what identity actually depends on) and leave
  // the file/function name as-is, flagging it so the author can rename by hand if wanted.
  const oldPascal = toPascal(oldId)
  const newPascal = toPascal(newId)
  const found = findPageFile(oldDir)
  const oldFile = found ? path.join(oldDir, found.fileName) : null
  const matchesCliConvention = found?.fileName === `${oldPascal}Page.${found.ext}`
  const newFile = matchesCliConvention
    ? path.join(oldDir, `${newPascal}Page.${found.ext}`)
    : oldFile

  // Steps below mutate the filesystem and then the config; if any step past
  // the first throws, roll back everything already applied so a failure never
  // leaves the page file/dir renamed while workspace.ts still points at the
  // old id (or vice versa).
  let fileContentPatched = false
  let filePatchedBackup = null
  let fileRenamed = false
  let dirRenamed = false
  try {
    if (matchesCliConvention && oldFile && fs.existsSync(oldFile)) {
      filePatchedBackup = fs.readFileSync(oldFile, 'utf8')
      const patched = filePatchedBackup.replace(
        new RegExp(`export default function ${oldPascal}Page\\b`),
        `export default function ${newPascal}Page`
      )
      fs.writeFileSync(oldFile, patched)
      fileContentPatched = true
      if (oldFile !== newFile) {
        fs.renameSync(oldFile, newFile)
        fileRenamed = true
      }
    }
    fs.renameSync(oldDir, newDir)
    dirRenamed = true
    renamePage(wsDir, flowId, oldId, newId)
  } catch (e) {
    if (dirRenamed) fs.renameSync(newDir, oldDir)
    if (fileRenamed) fs.renameSync(newFile, oldFile)
    if (fileContentPatched && filePatchedBackup !== null) {
      fs.writeFileSync(oldFile, filePatchedBackup)
    }
    console.error(r(`✗ Rename failed, rolled back: ${e.message}`))
    process.exit(1)
  }

  const refs = findFlowplanRefs(wsDir, flowId, oldId)
  if (refs.length > 0) {
    console.log(r(`⚠  Warning: flowStory(s) still reference '${oldId}': ${refs.join(', ')}`))
    console.log(r(`   Update step pageIds from '${oldId}' to '${newId}'.`))
  }

  console.log(
    g(
      `✓ Renamed:   ${FLOW_BOOK_DIRNAME}/${flowId}/${oldId}/ → ${FLOW_BOOK_DIRNAME}/${flowId}/${newId}/`
    )
  )
  if (matchesCliConvention && oldFile) {
    console.log(g(`✓ Renamed:   ${path.basename(oldFile)} → ${path.basename(newFile)}`))
  } else if (oldFile) {
    console.log(
      d(
        `  Note:      ${path.basename(oldFile)} doesn't match the CLI's generated naming ` +
          `pattern — left as-is. Rename it by hand if you'd like it to match '${newId}'.`
      )
    )
  }
  console.log(
    g(
      `✓ Updated:   ${WORKSPACE_CONFIG_FILENAME} → pageOrder.${flowId}[] (id: ${makePageId(flowId, oldId)} → ${makePageId(flowId, newId)})`
    )
  )
}

export async function cmdMovePage(_val, args = []) {
  const wsName = resolveWorkspace(parseStringFlag(args, 'workspace'))
  const wsDir = workspacePath(wsName)
  assertScopedWorkspaceDir(wsDir, wsName)
  let pageId = parseStringFlag(args, 'name')
  let fromFlow = parseStringFlag(args, 'from-flow')
  let toFlow = parseStringFlag(args, 'to-flow')

  if (!pageId || !fromFlow || !toFlow) {
    console.error(r('✗ --name:<page-id> --from-flow:<id> --to-flow:<id> are required'))
    process.exit(1)
  }
  try {
    pageId = assertKebab(pageId, 'name')
    fromFlow = assertKebab(fromFlow, 'from-flow')
    toFlow = assertKebab(toFlow, 'to-flow')
  } catch (e) {
    console.error(r(`✗ ${e.message}`))
    process.exit(1)
  }

  if (fromFlow === toFlow) {
    console.error(r(`✗ Page '${pageId}' is already in flow '${fromFlow}'`))
    process.exit(1)
  }

  // Same 2-level assumption as cmdRemovePage/cmdRenamePage — see comment there.
  const fromDir = path.join(wsDir, FLOW_BOOK_DIRNAME, fromFlow, pageId)
  const toDir = path.join(wsDir, FLOW_BOOK_DIRNAME, toFlow, pageId)

  if (!fs.existsSync(fromDir)) {
    console.error(r(`✗ Page not found: ${FLOW_BOOK_DIRNAME}/${fromFlow}/${pageId}/`))
    process.exit(1)
  }
  if (fs.existsSync(toDir)) {
    console.error(
      r(`✗ Page already exists at destination: ${FLOW_BOOK_DIRNAME}/${toFlow}/${pageId}/`)
    )
    process.exit(1)
  }

  const toFlowDir = path.join(wsDir, FLOW_BOOK_DIRNAME, toFlow)
  if (!fs.existsSync(toFlowDir)) {
    console.error(r(`✗ Destination flow '${toFlow}' directory not found`))
    console.error(d(`  Create it first: flowkit create:chapter --name:${toFlow}`))
    process.exit(1)
  }

  fs.renameSync(fromDir, toDir)
  movePage(wsDir, pageId, fromFlow, toFlow)

  console.log(
    g(
      `✓ Moved:   ${FLOW_BOOK_DIRNAME}/${fromFlow}/${pageId}/ → ${FLOW_BOOK_DIRNAME}/${toFlow}/${pageId}/`
    )
  )
  console.log(
    g(
      `✓ Updated: ${WORKSPACE_CONFIG_FILENAME} (removed '${makePageId(fromFlow, pageId)}' from '${fromFlow}', added '${makePageId(toFlow, pageId)}' to '${toFlow}')`
    )
  )
}

/**
 * Registered pageIds are the bare page-folder name (pageOrder is keyed
 * per-flow already, so no makePageId() prefix is stored internally — see
 * config-patch.js). A hidden page's folder is literally named '_something',
 * so the registered pageId itself carries the single-'_' prefix; this just
 * re-uses pagePathIdentity.js's isHidden() on that raw id string.
 */
function isHiddenPageId(pageId) {
  return isHidden(pageId)
}

/**
 * Walks flowBook/ on disk looking for '__'-prefixed folder/file segments —
 * non-existent items are excluded from pageOrder entirely (they're not
 * "registered" pages at all, by design), so `--gone` is the one listing mode
 * that can't be answered from workspace config and must scan the filesystem
 * directly. Returns a flat list of { flow, relPath } — relPath is the path
 * under flowBook/<flow>/ for display, kept as raw segments (not otherwise
 * parsed/identified) since a non-existent item has no real page id.
 */
function findGoneItems(wsDir) {
  const root = path.join(wsDir, FLOW_BOOK_DIRNAME)
  if (!fs.existsSync(root)) return []
  const results = []

  function walk(flow, dir, segmentsSoFar) {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      const segs = [...segmentsSoFar, entry.name]
      if (isNonExistent(entry.name)) {
        results.push({ flow, relPath: segs.join('/') })
        // Don't recurse further in — everything below a '__' segment is
        // already covered by parent-dominance (resolveVisibility), no need
        // to enumerate it item-by-item as separate "gone" entries.
        continue
      }
      if (entry.isDirectory()) {
        walk(flow, path.join(dir, entry.name), segs)
      }
    }
  }

  for (const flowEntry of fs.readdirSync(root, { withFileTypes: true })) {
    if (!flowEntry.isDirectory()) continue
    if (isNonExistent(flowEntry.name)) {
      results.push({ flow: flowEntry.name, relPath: '' })
      continue
    }
    walk(flowEntry.name, path.join(root, flowEntry.name), [])
  }
  return results
}

export async function cmdListPages(_val, args = []) {
  const wsName = resolveWorkspace(parseStringFlag(args, 'workspace'))
  const wsDir = workspacePath(wsName)
  assertScopedWorkspaceDir(wsDir, wsName)
  const filterFlow = parseStringFlag(args, 'flow')
  // Presence-flags, consistent with the `args.includes('--flag')` convention
  // used elsewhere in this codebase (e.g. scripts/checks/index.js's --json,
  // scripts/authoring/chapters.js's --force) — no dedicated boolean-flag helper
  // exists in helpers/args.js, so this matches existing practice rather than
  // inventing a new one.
  const showHidden = args.includes('--hidden')
  const showAll = args.includes('--all')
  const showGoneOnly = args.includes('--gone')

  const config = readWorkspaceConfig(wsDir)
  const pageOrder = listPages(wsDir, filterFlow || undefined)
  const flows = filterFlow ? [filterFlow] : config.chapters

  // --gone is a fully separate mode: registered pageOrder has no concept of
  // non-existent items (they're excluded from config by definition), so this
  // branch never touches pageOrder at all and returns early.
  if (showGoneOnly) {
    const gone = findGoneItems(wsDir).filter(item => !filterFlow || item.flow === filterFlow)
    console.log(b(`Non-existent (__)  [${wsName}]${filterFlow ? ` — flow: ${filterFlow}` : ''}\n`))
    if (gone.length === 0) {
      console.log(d('  (none found)'))
      return
    }
    for (const item of gone) {
      console.log(`  ${c(item.flow)}/${item.relPath ? item.relPath : d('(entire flow folder)')}`)
    }
    console.log('')
    console.log(d(`Total: ${gone.length} non-existent item${gone.length !== 1 ? 's' : ''}`))
    return
  }

  if (flows.length === 0) {
    console.log(d(`No flows in workspace '${wsName}'`))
    return
  }

  // registered pageOrder only ever contains normal + hidden pages (never
  // '__' ones) — visibility here is folder-name-only (single '_' prefix on the
  // pageId's own folder segment). This does not walk cosmetic in-between
  // folders for hidden-ness the way pagePathIdentity.js's full
  // resolveVisibility() does, since the CLI's own registered pages are
  // always the plain 2-level shape; a hand-authored deeper path with a hidden
  // cosmetic ancestor folder isn't reflected in pageOrder in the first place.
  const modeLabel = showAll ? ' — all tiers' : showHidden ? ' — including hidden' : ''
  console.log(b(`Pages  [${wsName}]${filterFlow ? ` — flow: ${filterFlow}` : ''}${modeLabel}\n`))

  let total = 0
  let hiddenTotal = 0
  for (const flowId of flows) {
    const pages = pageOrder[flowId] || []
    const visible = pages.filter(
      s => !isNonExistent(s) && (showAll || showHidden || !isHiddenPageId(s))
    )
    console.log(`  ${c(flowId)}  ${d(`(${visible.length})`)}`)
    visible.forEach((s, i) => {
      const hiddenTag = isHiddenPageId(s) ? d(' (hidden)') : ''
      console.log(`    ${d(`${i + 1}.`)} ${s}${hiddenTag}`)
      if (isHiddenPageId(s)) hiddenTotal++
    })
    if (visible.length === 0) console.log(d('    (no pages)'))
    total += visible.length
    console.log('')
  }

  if (showAll) {
    const gone = findGoneItems(wsDir).filter(item => !filterFlow || item.flow === filterFlow)
    if (gone.length > 0) {
      console.log(`  ${d('Non-existent (__):')}`)
      gone.forEach(item =>
        console.log(`    ${d(`${item.flow}/${item.relPath || '(entire flow folder)'} (gone)`)}`)
      )
      console.log('')
    }
  }

  console.log(
    d(
      `Total: ${total} page${total !== 1 ? 's' : ''} across ${flows.length} flow${flows.length !== 1 ? 's' : ''}` +
        (hiddenTotal > 0 ? ` (${hiddenTotal} hidden)` : '')
    )
  )
}

export async function cmdPageInfo(_val, args = []) {
  const wsName = resolveWorkspace(parseStringFlag(args, 'workspace'))
  const wsDir = workspacePath(wsName)
  assertScopedWorkspaceDir(wsDir, wsName)
  const flowId = parseStringFlag(args, 'flow')
  const pageId = parseStringFlag(args, 'name')

  if (!flowId || !pageId) {
    console.error(r('✗ --flow:<id> and --name:<page-id> are required'))
    process.exit(1)
  }

  // Same 2-level assumption as remove/rename/move — see comment on cmdRemovePage.
  // The real page file is found by scanning the folder (findPageFile) rather than
  // assuming an exact filename — see the comment in cmdRenamePage for why.
  const pageDir = path.join(wsDir, FLOW_BOOK_DIRNAME, flowId, pageId)
  const found = findPageFile(pageDir)

  if (!found) {
    console.error(r(`✗ No page file found: ${FLOW_BOOK_DIRNAME}/${flowId}/${pageId}/`))
    process.exit(1)
  }
  const pageFile = path.join(pageDir, found.fileName)

  const src = fs.readFileSync(pageFile, 'utf8')

  const labelMatch = src.match(/label:\s*['"]([^'"]+)['"]/)
  const descMatch = src.match(/desc:\s*['"]([^'"]*)['"]/)
  const imports = [...src.matchAll(/^import\s+.*from\s+['"]([^'"]+)['"]/gm)].map(m => m[1])
  const defaultName = findDefaultExportName(src)

  const fullPageId = makePageId(flowId, pageId)
  console.log(b(`Page: ${defaultName ?? found.fileName}\n`))
  console.log(`  Flow:      ${flowId}`)
  console.log(`  Page ID:   ${pageId}  ${d(`(${fullPageId})`)}`)
  console.log(`  File:      ${FLOW_BOOK_DIRNAME}/${flowId}/${pageId}/${found.fileName}`)
  console.log(`  Label:     ${labelMatch ? labelMatch[1] : d('(not set)')}`)
  console.log(`  Desc:      ${descMatch && descMatch[1] ? descMatch[1] : d('(not set)')}`)
  if (imports.length > 0) {
    console.log(`  Imports:`)
    imports.forEach(imp => console.log(`    ${d(imp)}`))
  }
}
