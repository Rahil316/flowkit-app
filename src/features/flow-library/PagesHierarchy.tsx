import type { AnnotationTag, PageView, WorkspaceHierarchyNode } from '@flowkit/types/index'
import { useFeedback } from '@flowkit-features/feedback'
import Tooltip from '@flowkit-shared/components/ui/Tooltip'
import { useActiveWorkspace } from '@flowkit-shared/contexts/ActiveWorkspaceContext'
import { useNavigation } from '@flowkit-shared/contexts/DashboardContext'
import { useTheme } from '@flowkit-shared/contexts/ThemeContext'
import { useWorkspaceHierarchy } from '@flowkit-shared/utils/useWorkspaceHierarchy'
import { ChevronDown, GitBranch, Layers, MessageSquare, Search, Smartphone } from 'lucide-react'
// ── Annotation tag icon map ───────────────────────────────────────────────────
import {
  CircleDot,
  Eye,
  Flag,
  FlaskConical,
  Sparkles,
  Star,
  Tag as TagIcon,
  Zap,
} from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'

import { useStoryLibrary } from './useStoryLibrary'

const ANNOTATION_ICONS: Record<string, React.ElementType> = {
  FlaskConical,
  Star,
  Zap,
  Eye,
  Sparkles,
  CircleDot,
  Flag,
  Tag: TagIcon,
}

// ── PagesHierarchy ──────────────────────────────────────────────────────────
//
// Screens tab: a project → flow → screen tree with tag filtering, A/B variant
// picker, FlowStory-coverage dimming, and a ▶ "find in Stories" jump.

/** Values matching the `coverage` FilterGroup options in KitSideExplorer. */
export type CoverageFilter = 'all' | 'covered' | 'uncovered'

interface Props {
  /** Called when ▶ on a screen jumps to the Stories filtered by that screen. */
  onFindInLibrary: (pageId: string) => void
  /** Lifted search query from the parent panel header. When provided, hides the internal search bar. */
  search?: string
  /** Lifted tag filter state from the parent panel header. */
  activeTags?: Set<string>
  /** Lifted flowStory-coverage filter from the parent panel header. Defaults to 'all'. */
  coverageFilter?: CoverageFilter
}

import { LS_HIERARCHY_EXPANDED as LS_EXPANDED } from '@flowkit-shared/constants/storageKeys'

export default function PagesHierarchy({
  onFindInLibrary,
  search: searchProp,
  activeTags: activeTagsProp,
  coverageFilter = 'all',
}: Props) {
  const activeWorkspace = useActiveWorkspace()
  const { theme } = useTheme()
  const { activeViewId, navigateTo } = useNavigation()
  const { tree, tagsByPage } = useWorkspaceHierarchy(activeWorkspace)
  const { coveredPageIds } = useStoryLibrary()

  const { comments } = useFeedback()
  const commentedPageIds = useMemo(() => new Set(comments.map(c => c.pageId)), [comments])

  const [internalSearch, setInternalSearch] = useState('')
  const search = searchProp ?? internalSearch
  const activeTags = useMemo(() => activeTagsProp ?? new Set<string>(), [activeTagsProp])
  const [expanded, setExpanded] = useState<Set<string>>(() => {
    try {
      const raw = localStorage.getItem(LS_EXPANDED)
      if (raw) return new Set(JSON.parse(raw) as string[])
    } catch {
      /* ignore */
    }
    return new Set()
  })

  // Default-expand all on first load if nothing persisted.
  const allNodeIds = useMemo(() => collectExpandableIds(tree), [tree])
  const baseExpanded = useMemo(
    () => (expanded.size === 0 ? new Set(allNodeIds) : expanded),
    [expanded, allNodeIds]
  )

  // The active page's containing chapter(s) auto-expand on navigation, even if not in
  // persisted `expanded` state — otherwise navigating to a page inside a collapsed
  // chapter leaves no visual trail back to it. But this is a one-time nudge, not a
  // standing rule: if the user then explicitly collapses that same chapter (tracked in
  // collapsedWhileActive, reset whenever activeViewId changes), their click wins and it
  // stays closed — otherwise the auto-expand would instantly re-open it every render,
  // making the active chapter's accordion impossible to collapse.
  const activeChain = useMemo(
    () =>
      findAncestorChain(
        tree.flatMap(project => (project.kind === 'project' ? (project.children ?? []) : [project])),
        activeViewId
      ) ?? [],
    [tree, activeViewId]
  )
  const [collapsedWhileActive, setCollapsedWhileActive] = useState<Set<string>>(new Set())
  // Reset during render (not an effect) when activeViewId changes — the React-recommended
  // pattern for state that should reset in response to a prop/derived-value change; calling
  // both setters here is coalesced into the same render pass, no extra effect-triggered one.
  const [lastActiveViewId, setLastActiveViewId] = useState(activeViewId)
  if (activeViewId !== lastActiveViewId) {
    setLastActiveViewId(activeViewId)
    setCollapsedWhileActive(new Set())
  }

  const effectiveExpanded = useMemo(() => {
    const next = new Set(baseExpanded)
    activeChain.forEach(key => next.add(key))
    collapsedWhileActive.forEach(key => next.delete(key))
    return next
  }, [baseExpanded, activeChain, collapsedWhileActive])

  function toggle(id: string) {
    const willBeOpen = !effectiveExpanded.has(id)
    if (activeChain.includes(id)) {
      setCollapsedWhileActive(prev => {
        const next = new Set(prev)
        if (willBeOpen) next.delete(id)
        else next.add(id)
        return next
      })
    }
    setExpanded(() => {
      const next = new Set(baseExpanded)
      if (willBeOpen) next.add(id)
      else next.delete(id)
      try {
        localStorage.setItem(LS_EXPANDED, JSON.stringify([...next]))
      } catch {
        /* ignore */
      }
      return next
    })
  }

  // Scroll the active row into view once per navigation. Depends on effectiveExpanded
  // too (not just activeViewId) so it re-fires after the auto-expand above has painted
  // the row into the DOM — but the scrolledForRef guard stops it from re-scrolling every
  // time the user manually toggles some other, unrelated chapter afterward.
  const navRef = useRef<HTMLElement>(null)
  const scrolledForRef = useRef<string | null>(null)
  useEffect(() => {
    if (scrolledForRef.current === activeViewId) return
    const row = navRef.current?.querySelector(`[data-page-row="${CSS.escape(activeViewId)}"]`)
    if (!row) return // containing chapter not yet expanded/painted — wait for next run
    const raf = requestAnimationFrame(() => {
      row.scrollIntoView({ block: 'nearest' })
    })
    scrolledForRef.current = activeViewId
    return () => cancelAnimationFrame(raf)
  }, [activeViewId, effectiveExpanded])

  const q = search.toLowerCase()
  function pageMatches(v: PageView): boolean {
    if (q && !v.label.toLowerCase().includes(q) && !v.id.toLowerCase().includes(q)) return false
    const tags = v.meta?.tags ?? []
    // Inclusive-OR; untagged always shown.
    if (activeTags.size > 0 && tags.length > 0 && !tags.some(t => activeTags.has(t))) return false
    if (coverageFilter === 'covered' && !coveredPageIds.has(v.id)) return false
    if (coverageFilter === 'uncovered' && coveredPageIds.has(v.id)) return false
    return true
  }

  return (
    <div className="flex flex-col h-full">
      {/* Internal search — only when parent doesn't lift search */}
      {searchProp === undefined && (
        <div className="px-3 pt-3 pb-2 shrink-0">
          <div className="relative">
            <Search
              size={14}
              className="absolute left-2 top-1/2 -translate-y-1/2"
              style={{ color: theme.text.disabled }}
            />
            <input
              value={internalSearch}
              onChange={e => setInternalSearch(e.target.value)}
              placeholder="Search pages…"
              className="w-full rounded-md pl-7 pr-3 py-1.5 text-xs outline-none"
              style={{
                background: theme.bg.base,
                border: `1px solid ${theme.bg.border}`,
                color: theme.text.primary,
              }}
            />
          </div>
        </div>
      )}

      {/* Tree */}
      <nav ref={navRef} className="flex-1 overflow-y-auto p-2">
        {tree
          .flatMap(project => (project.kind === 'project' ? (project.children ?? []) : [project]))
          .map(node => (
            <TreeNode
              key={node.id}
              node={node}
              expanded={effectiveExpanded}
              toggle={toggle}
              activeViewId={activeViewId}
              navigateTo={navigateTo}
              screenMatches={pageMatches}
              commentedScreens={commentedPageIds}
              tagsByPage={tagsByPage}
              coveredPageIds={coveredPageIds}
              onFindInLibrary={onFindInLibrary}
            />
          ))}
      </nav>
    </div>
  )
}

// ─── Recursive tree node ────────────────────────────────────────────────────────

function TreeNode({
  node,
  expanded,
  toggle,
  activeViewId,
  navigateTo,
  screenMatches,
  commentedScreens,
  tagsByPage,
  coveredPageIds,
  onFindInLibrary,
}: {
  node: WorkspaceHierarchyNode
  expanded: Set<string>
  toggle: (id: string) => void
  activeViewId: string
  navigateTo: (id: string) => void
  screenMatches: (v: PageView) => boolean
  commentedScreens: Set<string>
  tagsByPage: Map<string, AnnotationTag[]>
  coveredPageIds: Set<string>
  onFindInLibrary: (pageId: string) => void
}) {
  const { theme, scale } = useTheme()

  if (node.kind === 'page' && node.view) {
    if (!screenMatches(node.view)) return null
    return (
      <PageRow
        view={node.view}
        active={activeViewId === node.view.id}
        hasComments={commentedScreens.has(node.view.id)}
        annotationTags={tagsByPage.get(node.view.id) ?? []}
        isCovered={coveredPageIds.has(node.view.id)}
        onNavigate={() => navigateTo(node.view!.id)}
        onFindInLibrary={() => onFindInLibrary(node.view!.id)}
      />
    )
  }

  // Container node (project / chapter). Hide if all descendant pages filtered out.
  const nodeKey = `${node.kind}:${node.id}`
  const isOpen = expanded.has(nodeKey)
  const visibleChildren = (node.children ?? []).filter(c => hasVisiblePage(c, screenMatches))
  if (visibleChildren.length === 0) return null

  const childHasComments = hasDescendantComment(node, commentedScreens)
  const childAnnotationTags = collectDescendantAnnotationTags(node, tagsByPage)
  const containsActive = hasDescendantActive(node, activeViewId)

  return (
    <div className="mb-0.5">
      <button
        onClick={() => toggle(nodeKey)}
        onKeyDown={e => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            toggle(nodeKey)
          }
        }}
        data-active-chapter={containsActive || undefined}
        className="relative w-full flex items-center gap-2 px-2 py-1.5 rounded-md text-left transition-colors duration-120 focus-visible:outline-none focus-visible:ring-1"
        style={{
          color: containsActive ? theme.accent.blue : theme.text.secondary,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          ['--tw-ring-color' as any]: theme.accent.blue,
        }}
        onMouseEnter={e => {
          ;(e.currentTarget as HTMLElement).style.background = theme.bg.hover
        }}
        onMouseLeave={e => {
          ;(e.currentTarget as HTMLElement).style.background = 'transparent'
        }}
      >
        {containsActive && (
          <span
            className="absolute left-0 inset-y-1.5 w-0.5 rounded-r"
            style={{ background: theme.accent.blue }}
          />
        )}
        <ChevronDown
          size={12}
          className={`shrink-0 transition-transform duration-150 ${isOpen ? '' : '-rotate-90'}`}
        />
        <span className="min-w-0 flex-1 text-ui-sm font-semibold truncate" title={node.label}>
          {node.label}
        </span>
        {!isOpen && childHasComments && (
          <MessageSquare size={11} className="shrink-0" style={{ color: theme.accent.green }} />
        )}
        <div className="ml-auto flex items-center gap-1 shrink-0">
          {!isOpen && childAnnotationTags.map(t => <AnnotationTagBadge key={t.label} tag={t} />)}
          <span style={{ fontSize: scale.text.xxs, color: theme.text.disabled }}>
            {countPages(node)}
          </span>
        </div>
      </button>
      {isOpen && (
        <div className="ml-3.25 border-l" style={{ borderColor: theme.bg.borderSubtle }}>
          {visibleChildren.map(c => (
            <TreeNode
              key={`${c.kind}:${c.id}`}
              node={c}
              expanded={expanded}
              toggle={toggle}
              activeViewId={activeViewId}
              navigateTo={navigateTo}
              screenMatches={screenMatches}
              commentedScreens={commentedScreens}
              tagsByPage={tagsByPage}
              coveredPageIds={coveredPageIds}
              onFindInLibrary={onFindInLibrary}
            />
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Page row (with variant picker + coverage dim + find-in-library) ─────────────

function PageRow({
  view,
  active,
  hasComments,
  annotationTags,
  isCovered,
  onNavigate,
  onFindInLibrary,
}: {
  view: PageView
  active: boolean
  hasComments: boolean
  annotationTags: AnnotationTag[]
  isCovered: boolean
  onNavigate: () => void
  onFindInLibrary: () => void
}) {
  const { theme, scale } = useTheme()
  const { activeVariantByView, setVariantForView, navigateTo } = useNavigation()
  const [showVariants, setShowVariants] = useState(false)
  const variants = view.variants ?? []
  const hasVariants = variants.length > 1
  const activeSerial = activeVariantByView[view.id] ?? 'default'

  return (
    <div className="mb-0.5" data-page-row={view.id}>
      <div
        className="group relative flex items-center rounded-md transition-colors duration-120"
        style={{
          background: active ? theme.accent.blueDim : 'transparent',
        }}
        onMouseEnter={e => {
          if (!active) (e.currentTarget as HTMLElement).style.background = theme.bg.hover
        }}
        onMouseLeave={e => {
          if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'
        }}
      >
        {/* Active left accent bar */}
        {active && (
          <span
            className="absolute left-0 inset-y-1.5 w-0.5 rounded-r"
            style={{ background: theme.accent.blue }}
          />
        )}
        <button
          onClick={onNavigate}
          className="min-w-0 flex-1 flex items-center gap-2 pl-3 pr-1 py-1.5 text-left focus-visible:outline-none"
          style={{ color: active ? theme.accent.blue : theme.text.secondary }}
        >
          <Smartphone size={13} className="shrink-0" />
          <span className="min-w-0 flex-1 text-ui-sm truncate">{view.label}</span>
          {hasComments && (
            <Tooltip content="Has feedback comments" placement="top" showDelay={1500}>
              <MessageSquare size={11} className="shrink-0" style={{ color: theme.accent.green }} />
            </Tooltip>
          )}
          {annotationTags.map(t => (
            <AnnotationTagBadge key={t.label} tag={t} />
          ))}
          {hasVariants && (
            <span
              className="px-1 rounded shrink-0"
              style={{
                fontSize: scale.text.xxs,
                background: theme.bg.elevated,
                color: theme.text.muted,
              }}
            >
              {variants.length}v
            </span>
          )}
        </button>
        {/* Action buttons — only claim row width on hover; collapsed to zero width the
            rest of the time so the label can use that space instead of truncating early. */}
        <div className="flex items-center gap-0.5 pr-1 w-0 opacity-0 overflow-hidden group-hover:w-auto group-hover:opacity-100 group-hover:overflow-visible group-focus-within:w-auto group-focus-within:opacity-100 group-focus-within:overflow-visible transition-[width,opacity] duration-120 shrink-0">
          {isCovered && (
            <Tooltip content="Find stories that use this page" placement="right" showDelay={1500}>
              <button
                onClick={onFindInLibrary}
                className="p-1 rounded transition-colors duration-120"
                style={{ color: theme.text.muted }}
                onMouseEnter={e => ((e.currentTarget as HTMLElement).style.color = theme.accent.blue)}
                onMouseLeave={e => ((e.currentTarget as HTMLElement).style.color = theme.text.muted)}
              >
                <GitBranch size={12} />
              </button>
            </Tooltip>
          )}
          {hasVariants && (
            <button
              onClick={() => setShowVariants(v => !v)}
              className="p-1 rounded transition-colors duration-120"
              style={{ color: showVariants ? theme.accent.blue : theme.text.muted }}
              title="Show variants"
            >
              <Layers size={12} />
            </button>
          )}
        </div>
      </div>
      {/* Variant picker */}
      {hasVariants && showVariants && (
        <div className="ml-6 flex flex-col gap-0.5 mb-1">
          {variants.map(v => {
            const selected = v.serial === activeSerial
            return (
              <button
                key={v.serial}
                onClick={() => {
                  setVariantForView(view.id, v.serial)
                  navigateTo(view.id)
                }}
                className="px-2 py-1 rounded text-left w-full transition-colors"
                style={{
                  fontSize: scale.text.xxs,
                  color: selected ? theme.accent.blue : theme.text.muted,
                  background: selected ? theme.accent.blueDim : theme.bg.elevated,
                  fontWeight: selected ? 600 : 400,
                }}
              >
                {selected ? '● ' : '○ '}
                {v.serial === 'default' ? 'default' : `variant ${v.serial}`}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function collectExpandableIds(nodes: WorkspaceHierarchyNode[]): string[] {
  const ids: string[] = []
  const walk = (ns: WorkspaceHierarchyNode[]) => {
    for (const n of ns) {
      if (n.kind !== 'page') {
        ids.push(`${n.kind}:${n.id}`)
        if (n.children) walk(n.children)
      }
    }
  }
  walk(nodes)
  return ids
}

function hasVisiblePage(node: WorkspaceHierarchyNode, matches: (v: PageView) => boolean): boolean {
  if (node.kind === 'page' && node.view) return matches(node.view)
  return (node.children ?? []).some(c => hasVisiblePage(c, matches))
}

/** Node-keys (`${kind}:${id}`) of every container ancestor of the page matching
 *  `activeViewId`, root-first, or `null` if no page in the tree matches. */
function findAncestorChain(
  nodes: WorkspaceHierarchyNode[],
  activeViewId: string,
  path: string[] = []
): string[] | null {
  for (const node of nodes) {
    if (node.kind === 'page') {
      if (node.view?.id === activeViewId) return path
      continue
    }
    const nodeKey = `${node.kind}:${node.id}`
    const found = findAncestorChain(node.children ?? [], activeViewId, [...path, nodeKey])
    if (found) return found
  }
  return null
}

function countPages(node: WorkspaceHierarchyNode): number {
  if (node.kind === 'page') return 1
  return (node.children ?? []).reduce((sum, c) => sum + countPages(c), 0)
}

function hasDescendantComment(node: WorkspaceHierarchyNode, commented: Set<string>): boolean {
  if (node.kind === 'page' && node.view) return commented.has(node.view.id)
  return (node.children ?? []).some(c => hasDescendantComment(c, commented))
}

function hasDescendantActive(node: WorkspaceHierarchyNode, activeViewId: string): boolean {
  if (node.kind === 'page' && node.view) return node.view.id === activeViewId
  return (node.children ?? []).some(c => hasDescendantActive(c, activeViewId))
}

function collectDescendantAnnotationTags(
  node: WorkspaceHierarchyNode,
  tagsByPage: Map<string, AnnotationTag[]>
): AnnotationTag[] {
  const seen = new Set<string>()
  const result: AnnotationTag[] = []
  const walk = (n: WorkspaceHierarchyNode) => {
    if (n.kind === 'page' && n.view) {
      for (const t of tagsByPage.get(n.view.id) ?? []) {
        if (!seen.has(t.label)) {
          seen.add(t.label)
          result.push(t)
        }
      }
    } else {
      ;(n.children ?? []).forEach(walk)
    }
  }
  walk(node)
  return result
}

// ─── Annotation tag badge ─────────────────────────────────────────────────────

const TAG_COLOR_MAP: Record<string, { bg: string; text: string }> = {
  blue: { bg: 'var(--color-theme-blue-dim)', text: 'var(--color-theme-blue)' },
  green: { bg: 'var(--color-theme-green-dim)', text: 'var(--color-theme-green)' },
  red: { bg: 'var(--color-theme-red-dim)', text: 'var(--color-theme-red)' },
  amber: { bg: 'var(--color-theme-amber-dim)', text: 'var(--color-theme-amber)' },
  purple: { bg: 'var(--color-theme-purple-dim)', text: 'var(--color-theme-purple)' },
}

function AnnotationTagBadge({ tag }: { tag: AnnotationTag }) {
  const { scale } = useTheme()
  const Icon = tag.icon ? ANNOTATION_ICONS[tag.icon] : null
  const colors = TAG_COLOR_MAP[tag.color ?? 'blue']

  const badge = (
    <span
      className={`flex items-center gap-0.5 px-1 rounded shrink-0 ${tag.pulse ? 'animate-pulse' : ''}`}
      style={{ fontSize: scale.text.xxs, background: colors.bg, color: colors.text }}
    >
      {Icon && <Icon size={9} />}
      {tag.label}
    </span>
  )

  return tag.note ? (
    <Tooltip content={tag.note} placement="top" showDelay={1500}>
      {badge}
    </Tooltip>
  ) : (
    badge
  )
}
