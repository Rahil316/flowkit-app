/**
 * useWorkspaceHierarchy.ts
 *
 * Workspace reader — supports two layouts:
 *
 *   New (flat):  workspaces/<ws>/flowStories/<Name>.ts
 *                workspaces/<ws>/flowBook/<chapter>/.../<screen>/<File>.tsx (variable depth)
 *
 *   Old (nested): workspaces/<ws>/projects/<proj>/flowStories/<Name>.ts
 *                 workspaces/<ws>/projects/<proj>/flowBook/<chapter>/.../<screen>/<File>.tsx
 *
 * Both layouts are detected automatically. Existing workspaces keep working unchanged.
 * Page identity (chapter/screen/variant/visibility) is derived by the shared,
 * mode-agnostic pagePathIdentity module — see that file for the folder-depth rules.
 *
 * WHY a separate file: import.meta.glob patterns MUST be string literals (Vite
 * resolves them at build time). All globs live here, inline.
 */

import type {
  AnnotationTag,
  Chapter,
  FlowkitConfig,
  FlowStoryDef,
  PageMeta,
  PageView,
  WorkspaceHierarchyNode,
} from '@flowkit/types/index'
import {
  type CompiledFlowStory,
  compileFlowStory,
  type PageResolver,
  type ResolvedPage,
} from '@flowkit-features/flowStory/compileFlowStory'
import { useFlowPlaybackOptional } from '@flowkit-features/flowStory/FlowPlaybackContext'
import { DEVICE_PRESETS } from '@flowkit-shared/components/devices'
import { makePageId, parsePageSegments, pickPageFile } from '@flowkit-shared/utils/pagePathIdentity'
import { getWorkspaceConfig } from '@flowkit-shared/utils/workspaceModules'
import React, { useMemo } from 'react'

// ─── Mode detection ───────────────────────────────────────────────────────────

const isSingle = import.meta.env.VITE_SINGLE_WORKSPACE === 'true'

// ─── Flat mode: virtual module imports ────────────────────────────────────────

import { flowStories as _virtualFlowStories } from 'virtual:flowkit/flowStories'
import { pageList as _virtualPageList, pageMeta as _virtualPageMeta } from 'virtual:flowkit/pages'

// ─── Repo mode: Vite glob maps (string literals only) ────────────────────────
//
// Broad globs match both old (projects/<proj>/...) and new (flat) layouts.
// These return empty objects in flat mode (no workspaces/ dir on disk).

type FlowStoryModule = { default: FlowStoryDef }
type FlowStoryGlobMap = Record<string, FlowStoryModule>
type PageGlobMap = Record<
  string,
  () => Promise<{ default: React.ComponentType; pageMeta?: PageMeta }>
>

const flowStoryModules = import.meta.glob('/workspaces/**/[fF]low[sS]tories/*.ts', {
  eager: true,
}) as FlowStoryGlobMap

const flowBookModules = import.meta.glob('/workspaces/**/[fF]low[bB]ook/**/*.tsx') as PageGlobMap

// Eager named-import of pageMeta only — zero cost for files that don't export it.
const pageMetaModules = import.meta.glob('/workspaces/**/[fF]low[bB]ook/**/*.tsx', {
  eager: true,
  import: 'pageMeta',
}) as Record<string, PageMeta | undefined>

// ─── Path parsing — handles both flat and nested layouts ─────────────────────────

interface PagePathInfo {
  /** "default" for the base file, else the .variant-<serial>/.v-<serial> token. */
  variant: string
  chapter: string
  page: string // the <page> folder name (last folder) — combined with chapter for the id
  componentName: string // whatever the file itself is named, no suffix required
  /** The project segment, or the workspace name for flat-layout workspaces. */
  project: string
  visibility: 'normal' | 'hidden' | 'non-existent'
  fileName: string // for alphabetical tie-break among ambiguous candidates in one folder
}

/**
 * Parse a page file path. Returns null if it's not a recognized page-file
 * extension at all (not a *.tsx/*.jsx). Delegates the actual chapter/page/variant/
 * visibility derivation to the shared, mode-agnostic pagePathIdentity module —
 * see that file for the folder-depth/identity rules (variable depth, first folder =
 * chapter, last folder = page, misc fallback, _/__ visibility).
 *
 * Handles two layouts:
 *   Flat:   flowBook/<chapter>/.../<page>/<File>[.variant-<x>|.v-<x>].tsx
 *   Nested: projects/<proj>/flowBook/<chapter>/.../<page>/<File>[...].tsx
 */
function parsePagePath(filePath: string, wsPrefix: string, wsName: string): PagePathInfo | null {
  if (!filePath.startsWith(wsPrefix)) return null
  const rest = filePath.slice(wsPrefix.length)
  const parts = rest.split('/')

  // Find the 'flowBook' segment — works for both flat (idx 0) and nested (idx >= 1) layouts
  const storiesIdx = parts.findIndex(p => p.toLowerCase() === 'flowbook')
  if (storiesIdx === -1) return null

  // Project: everything before 'flowBook' (excluding 'projects/' prefix), or wsName for flat
  const beforeFlows = parts.slice(0, storiesIdx)
  let project: string
  if (beforeFlows[0] === 'projects') {
    project = beforeFlows.slice(1).join('/') || wsName
  } else if (beforeFlows.length === 0) {
    project = wsName
  } else {
    return null // unexpected prefix — not a recognized layout
  }

  const segments = parts.slice(storiesIdx + 1)
  const info = parsePageSegments(segments)
  if (!info) return null

  return {
    project,
    chapter: info.chapter,
    page: info.page,
    variant: info.variant,
    componentName: info.componentName,
    visibility: info.visibility,
    fileName: segments[segments.length - 1],
  }
}

function derivePageLabel(folderOrName: string): string {
  return folderOrName
    .replace(/[-_]/g, ' ')
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase())
}

function titleCase(s: string): string {
  return s.replace(/[-_]/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
}

// ─── Lazy screen wrapper ─────────────────────────────────────────────────────────

function buildLazyComponent(
  loader: () => Promise<{ default: React.ComponentType; pageMeta?: PageMeta }>
): React.ComponentType {
  const LazyScreen = React.lazy(async () => {
    const mod = await loader()
    return { default: mod.default }
  })
  return function WrappedLazyScreen(props: Record<string, unknown>) {
    return React.createElement(
      React.Suspense,
      { fallback: null },
      React.createElement(LazyScreen, props)
    )
  }
}

// ─── Result shape ───────────────────────────────────────────────────────────────

export interface WorkspaceHierarchyResult {
  /** Flow library: one Chapter per FlowStory (with a `-play` runner child). */
  stories: Chapter[]
  /** All screens as flat views (merged into ALL_VIEWS by App). */
  views: PageView[]
  /** Project → chapter → screen tree for the Screens tab. */
  tree: WorkspaceHierarchyNode[]
  /** id → raw FlowStoryDef (for the Flow Library + ref resolution). */
  registry: Map<string, FlowStoryDef>
  /** Whether this workspace uses the hierarchy at all. */
  hasHierarchy: boolean
  /** pageId → active annotation tags (expiresAt filtered). */
  tagsByPage: Map<string, AnnotationTag[]>
  /** Author-set default screen id from workspace.ts (`startPage`), if any. */
  startPageId?: string
  /** Author-set default device preset label from workspace.ts (`defaultDevice`), if valid. */
  defaultDeviceLabel?: string
  /** Author-set default orientation from workspace.ts (`defaultOrientation`), if any. */
  defaultOrientation?: 'portrait' | 'landscape'
}

/** Resolves the author-set startPage/defaultDevice/defaultOrientation config fields
 *  against real screens/device presets. Shared by both the flat and nested builders. */
function resolveConfigDefaults(
  config: FlowkitConfig,
  pagesById: Map<string, unknown>
): {
  startPageId?: string
  defaultDeviceLabel?: string
  defaultOrientation?: 'portrait' | 'landscape'
} {
  const startPageId =
    config.startPage && pagesById.has(config.startPage) ? config.startPage : undefined

  const resolvedDevicePreset = config.defaultDevice
    ? DEVICE_PRESETS.find(p => p.label === config.defaultDevice)
    : undefined
  const defaultDeviceLabel = resolvedDevicePreset?.label
  const defaultOrientation: 'portrait' | 'landscape' | undefined =
    config.defaultOrientation === 'landscape' && (resolvedDevicePreset?.supportsLandscape ?? true)
      ? 'landscape'
      : config.defaultOrientation === 'portrait'
        ? 'portrait'
        : undefined

  return { startPageId, defaultDeviceLabel, defaultOrientation }
}

// ─── Flat mode builder (uses virtual modules, no path parsing needed) ───────────

function buildFlatHierarchy(activeWorkspace: string): WorkspaceHierarchyResult {
  const config = getWorkspaceConfig(activeWorkspace)

  // 1. Build pages from virtual:flowkit/pages pageList. genPages() (flat-mode's
  //    vite-plugin.js) already derives chapter/pageId via the same shared pagePathIdentity
  //    module used here, and pre-filters '__' (non-existent) entries before they ever reach
  //    this list — so no visibility check needed here, only the id/path construction.
  const pagesById = new Map<string, PageRec>()
  for (const entry of _virtualPageList) {
    const { chapter, pageId, loader } = entry
    const meta = _virtualPageMeta[entry.key]
    const label = meta?.label ?? derivePageLabel(pageId)
    const component = buildLazyComponent(loader)
    const id = makePageId(chapter, pageId)
    const filePath = `flowBook/${chapter}/${pageId}`
    const view: PageView = {
      id,
      label,
      component,
      filePath,
      variants: [{ serial: 'default', label, component, filePath }],
      chapter,
      project: activeWorkspace,
    }
    pagesById.set(id, {
      id,
      label,
      project: activeWorkspace,
      chapter,
      component,
      view,
      visibility: entry.visibility ?? 'normal',
    })
  }

  // 2. FlowStory registry from virtual:flowkit/flowStories
  const registry = new Map<string, FlowStoryDef>()
  for (const def of _virtualFlowStories) {
    if (def?.id) registry.set(def.id, def)
  }

  const hasHierarchy = pagesById.size > 0 || registry.size > 0

  // 3. Screen resolver
  const resolve: PageResolver = (pageId: string): ResolvedPage | undefined => {
    const rec = pagesById.get(pageId)
    if (!rec) return undefined
    return { id: rec.id, label: rec.label, component: rec.component }
  }

  // 4. Flow library Chapters
  const declaredIds =
    config.chapters ??
    Object.values(config.projects ?? {}).flatMap(p => p.chapters ?? p.modules ?? [])
  const allDefs = [...registry.values()]
  const orderedDefs = [
    ...declaredIds.filter(id => registry.has(id)).map(id => registry.get(id)!),
    ...allDefs.filter(d => !declaredIds.includes(d.id)),
  ]
  const stories: Chapter[] = []
  for (const def of orderedDefs) {
    const playNode: PageView = {
      id: `${def.id}-play`,
      label: 'Play Flow ➔',
      component: makeFlowStoryRunner(def, resolve, registry),
    }
    stories.push({ id: def.id, label: def.name, children: [playNode] })
  }

  // 5. Views
  const views: PageView[] = [
    ...[...pagesById.values()].map(r => r.view),
    ...stories.flatMap(f => f.children ?? []),
  ]

  // 6. Tree
  const tree = buildTree([...pagesById.values()], config, activeWorkspace)

  // 7. Tags — sourced directly from each screen's own pageMeta.annotations.
  const metaByPageId = new Map<string, PageMeta | undefined>()
  for (const entry of _virtualPageList) {
    metaByPageId.set(makePageId(entry.chapter, entry.pageId), _virtualPageMeta[entry.key])
  }
  const tagsByPage = buildTagsMap(metaByPageId)

  return {
    stories,
    views,
    tree,
    registry,
    hasHierarchy,
    tagsByPage,
    ...resolveConfigDefaults(config, pagesById),
  }
}

// ─── Builder (pure given the globs) ─────────────────────────────────────────────

interface PageRec {
  id: string // = `${chapter}-${screen}` — collision-proof across stories
  label: string
  project: string
  chapter: string
  component: React.ComponentType // default variant
  view: PageView // includes variants[]
  visibility: 'normal' | 'hidden' | 'non-existent'
}

function buildHierarchy(activeWorkspace: string): WorkspaceHierarchyResult {
  if (isSingle) return buildFlatHierarchy(activeWorkspace)
  const wsPrefix = `/workspaces/${activeWorkspace}/`
  const config = getWorkspaceConfig(activeWorkspace)

  // 1. Group page files by their (chapter, page) folder pair, collecting variants.
  //    Keying by chapter+page together (not page alone) is what makes two different
  //    chapters' same-named page folders (e.g. both having a "confirm" folder) resolve
  //    to two distinct pages instead of silently colliding into one.
  interface VariantFile {
    serial: string
    component: React.ComponentType
    filePath: string
    project: string
    chapter: string
    screen: string
    componentName: string
    fileName: string
    visibility: 'normal' | 'hidden' | 'non-existent'
  }
  const variantsByScreenKey = new Map<string, VariantFile[]>()

  for (const [path, loader] of Object.entries(flowBookModules)) {
    const info = parsePagePath(path, wsPrefix, activeWorkspace)
    if (!info) continue
    if (info.visibility === 'non-existent') continue // '__' — practically non-existent, skip entirely
    const key = `${info.chapter}::${info.page}::${info.variant}`
    const list = variantsByScreenKey.get(key) ?? []
    list.push({
      serial: info.variant,
      component: buildLazyComponent(loader),
      filePath: path.slice(wsPrefix.length),
      project: info.project,
      chapter: info.chapter,
      screen: info.page,
      componentName: info.componentName,
      fileName: info.fileName,
      visibility: info.visibility,
    })
    variantsByScreenKey.set(key, list)
  }

  // 1b. Within each (chapter, page, variant) bucket, more than one candidate file means
  //     an ambiguous folder (two unprefixed .tsx files claiming the same page/variant
  //     slot) — deterministically pick the alphabetically-first file. The soft
  //     page/ambiguous-folder warning for this case is raised by `flowkit check:pages`,
  //     not here; this hook only needs a stable, working page to render.
  const variantsByScreen = new Map<string, VariantFile[]>()
  for (const [key, candidates] of variantsByScreenKey) {
    const { chosen } = pickPageFile(candidates.map(c => c.fileName))
    const winner = candidates.find(c => c.fileName === chosen) ?? candidates[0]
    const [chapter, screen] = key.split('::')
    const screenKey = `${chapter}::${screen}`
    const list = variantsByScreen.get(screenKey) ?? []
    list.push(winner)
    variantsByScreen.set(screenKey, list)
  }

  // 2. Build a PageRec per (chapter, page) pair.
  const pagesById = new Map<string, PageRec>()
  for (const [screenKey, files] of variantsByScreen) {
    const [chapter, screen] = screenKey.split('::')
    const pageId = makePageId(chapter, screen)
    const def = files.find(f => f.serial === 'default') ?? files[0]
    const label = derivePageLabel(screen)
    const variants = files
      .slice()
      .sort((a, b) => {
        if (a.serial === 'default') return -1
        if (b.serial === 'default') return 1
        const aKey = `${wsPrefix}${a.filePath}`
        const bKey = `${wsPrefix}${b.filePath}`
        const aOrder = pageMetaModules[aKey]?.variantOrder ?? Infinity
        const bOrder = pageMetaModules[bKey]?.variantOrder ?? Infinity
        if (aOrder !== bOrder) return aOrder - bOrder
        return a.serial.localeCompare(b.serial)
      })
      .map(f => {
        const metaKey = `${wsPrefix}${f.filePath}`
        const meta = pageMetaModules[metaKey]
        return {
          serial: f.serial,
          label: f.serial === 'default' ? label : (meta?.variantLabel ?? `${label} · ${f.serial}`),
          component: f.component,
          filePath: f.filePath,
        }
      })
    const view: PageView = {
      id: pageId,
      label,
      component: def.component,
      filePath: def.filePath,
      variants,
      chapter: def.chapter,
      project: def.project,
    }
    pagesById.set(pageId, {
      id: pageId,
      label,
      project: def.project,
      chapter: def.chapter,
      component: def.component,
      view,
      visibility: def.visibility,
    })
  }

  // 3. FlowStory registry for this workspace.
  const registry = new Map<string, FlowStoryDef>()
  for (const [path, mod] of Object.entries(flowStoryModules)) {
    if (!path.startsWith(wsPrefix)) continue
    const def = mod.default
    if (def && def.id) registry.set(def.id, def)
  }

  const hasHierarchy = pagesById.size > 0 || registry.size > 0

  // 4. Screen resolver injected into the compiler.
  const resolve: PageResolver = (pageId: string): ResolvedPage | undefined => {
    const rec = pagesById.get(pageId)
    if (!rec) return undefined
    return { id: rec.id, label: rec.label, component: rec.component }
  }

  // 5. Flow library Chapters — one per flowStory, with a `-play` runner child.
  //    Flat layout: order from config.stories[]. Nested: from config.projects[*].stories[].
  const declaredIds =
    config.chapters ??
    Object.values(config.projects ?? {}).flatMap(p => p.chapters ?? p.modules ?? [])
  const allDefs = [...registry.values()]
  const orderedDefs = [
    ...declaredIds.filter(id => registry.has(id)).map(id => registry.get(id)!),
    ...allDefs.filter(d => !declaredIds.includes(d.id)),
  ]
  const stories: Chapter[] = []
  for (const def of orderedDefs) {
    const playNode: PageView = {
      id: `${def.id}-play`,
      label: 'Play Flow ➔',
      component: makeFlowStoryRunner(def, resolve, registry),
    }
    stories.push({ id: def.id, label: def.name, children: [playNode] })
  }

  // 6. Flat views = all screens + every flow's play node.
  const views: PageView[] = [
    ...[...pagesById.values()].map(r => r.view),
    ...stories.flatMap(f => f.children ?? []),
  ]

  // 7. Tree: project → chapter → screen.
  const tree = buildTree([...pagesById.values()], config, activeWorkspace)

  // 8. Tags — sourced directly from each screen's own pageMeta.annotations
  //    (pageMetaModules is already eagerly globbed above, keyed by full workspace path).
  const metaByPageId = new Map<string, PageMeta | undefined>()
  for (const [screenKey, files] of variantsByScreen) {
    const [chapter, screen] = screenKey.split('::')
    const def = files.find(f => f.serial === 'default') ?? files[0]
    const metaKey = `${wsPrefix}${def.filePath}`
    metaByPageId.set(makePageId(chapter, screen), pageMetaModules[metaKey])
  }
  const tagsByPage = buildTagsMap(metaByPageId)

  return {
    stories,
    views,
    tree,
    registry,
    hasHierarchy,
    tagsByPage,
    ...resolveConfigDefaults(config, pagesById),
  }
}

function buildTree(
  pages: PageRec[],
  config: FlowkitConfig,
  wsName: string
): WorkspaceHierarchyNode[] {
  const projects = new Map<string, Map<string, PageView[]>>()
  for (const s of pages) {
    if (!projects.has(s.project)) projects.set(s.project, new Map())
    const storiesMap = projects.get(s.project)!
    if (!storiesMap.has(s.chapter)) storiesMap.set(s.chapter, [])
    storiesMap.get(s.chapter)!.push(s.view)
  }

  const projectNodes: WorkspaceHierarchyNode[] = []
  for (const [project, storiesMap] of projects) {
    // Flat layout: top-level config.stories + config.pageOrder (project === wsName)
    // Nested layout: config.projects[project].stories + .pageOrder
    const projCfg = config.projects?.[project]
    const declaredOrder: string[] =
      (project === wsName ? config.chapters : undefined) ??
      projCfg?.chapters ??
      projCfg?.modules ??
      []
    const chapterEntries = [...storiesMap.entries()]
    const orderedChapters: [string, PageView[]][] = [
      ...declaredOrder
        .filter(c => storiesMap.has(c))
        .map(c => [c, storiesMap.get(c)!] as [string, PageView[]]),
      ...chapterEntries.filter(([c]) => !declaredOrder.includes(c)),
    ]
    const chapterNodes: WorkspaceHierarchyNode[] = []
    for (const [chapter, chapterViews] of orderedChapters) {
      const declaredPages: string[] =
        (project === wsName ? config.pageOrder?.[chapter] : undefined) ??
        projCfg?.pageOrder?.[chapter] ??
        []
      const sortedViews =
        declaredPages.length === 0
          ? chapterViews
          : [
              ...declaredPages
                .filter(slug => chapterViews.some(v => v.id.endsWith(slug)))
                .map(slug => chapterViews.find(v => v.id.endsWith(slug))!),
              ...chapterViews
                .filter(v => !declaredPages.some(slug => v.id.endsWith(slug)))
                .sort((a, b) => a.label.localeCompare(b.label)),
            ]
      chapterNodes.push({
        kind: 'chapter',
        id: chapter,
        label: titleCase(chapter),
        children: sortedViews.map(v => ({
          kind: 'page' as const,
          id: v.id,
          label: v.label,
          view: v,
        })),
      })
    }
    projectNodes.push({
      kind: 'project',
      id: project,
      label: titleCase(project),
      children: chapterNodes,
    })
  }
  return projectNodes
}

// ─── Play-time FlowStoryRunner (compiles on mount, renders FlowMaster) ───────────

function makeFlowStoryRunner(
  def: FlowStoryDef,
  resolve: PageResolver,
  registry: Map<string, FlowStoryDef>
): React.ComponentType {
  return function FlowStoryRunner() {
    const [FlowMasterComp, setComp] = React.useState<React.ComponentType<{
      flow: CompiledFlowStory
    }> | null>(null)
    const [error, setError] = React.useState<string | null>(null)
    const playback = useFlowPlaybackOptional()

    // Compile at PLAY time (registry + screens fully available by mount).
    const { compiled, compilationError } = useMemo(() => {
      try {
        return { compiled: compileFlowStory(def, resolve, registry), compilationError: null }
      } catch (e) {
        return { compiled: null, compilationError: e instanceof Error ? e.message : String(e) }
      }
    }, [])

    React.useEffect(() => {
      if (compilationError) setError(compilationError)
    }, [compilationError])

    React.useEffect(() => {
      import('@flowkit-core/layout/FlowMaster')
        .then(m => setComp(() => m.default as React.ComponentType<{ flow: CompiledFlowStory }>))
        .catch(err => setError(String(err)))
    }, [])

    const enter = playback?.enter
    const exit = playback?.exit
    React.useEffect(() => {
      if (!compiled || !enter || !exit) return
      const rawDb = typeof def.db === 'object' && def.db !== null ? def.db : {}
      enter(compiled, rawDb as Record<string, unknown>)
      return () => exit()
    }, [compiled, enter, exit])

    if (error) {
      return React.createElement(
        'div',
        { style: { padding: 16, color: 'red', fontSize: 13 } },
        `FlowStory error: ${error}`
      )
    }
    if (!FlowMasterComp || !compiled) return null
    return React.createElement(FlowMasterComp, { flow: compiled })
  }
}

// ─── Hook ────────────────────────────────────────────────────────────────────────

/**
 * Builds pageId → active annotations (expiresAt filtered) directly from each screen's
 * own pageMeta.annotations — replaces the old workspace-level `_tags.ts` sidecar file.
 * `metaByPageId` maps a screen's final id (flowname-screenname) to its parsed PageMeta.
 */
function buildTagsMap(
  metaByPageId: Map<string, PageMeta | undefined>
): Map<string, AnnotationTag[]> {
  const today = new Date().toISOString().slice(0, 10)
  const map = new Map<string, AnnotationTag[]>()
  for (const [pageId, meta] of metaByPageId) {
    const active = (meta?.annotations ?? []).filter(t => !t.expiresAt || t.expiresAt > today)
    if (active.length > 0) map.set(pageId, active)
  }
  return map
}

export function useWorkspaceHierarchy(activeWorkspace: string): WorkspaceHierarchyResult {
  const hierarchy = useMemo(() => buildHierarchy(activeWorkspace), [activeWorkspace])
  return hierarchy
}
