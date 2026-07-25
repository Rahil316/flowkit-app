import type { Chapter, PageView } from '@flowkit/types/index'
import type { PaletteGroup, PaletteItem } from '@flowkit-features/command-palette'
import { PALETTE_ACCENT_COLORS } from '@flowkit-features/command-palette'
import { useStoryLibrary } from '@flowkit-features/flow-library'
import { useActiveWorkspace } from '@flowkit-shared/contexts/ActiveWorkspaceContext'
import { useWorkspaceHierarchy } from '@flowkit-shared/utils/useWorkspaceHierarchy'
import { Folder, GitBranch, Smartphone } from 'lucide-react'
import { useMemo } from 'react'

import type { GoToItemMeta } from './types'

// Pages  = blue [0], Chapters = green [1], flowStories = purple [2]
const PAGE_COLOR = PALETTE_ACCENT_COLORS[0]
const CHAPTER_COLOR = PALETTE_ACCENT_COLORS[1]
const FLOWSTORY_COLOR = PALETTE_ACCENT_COLORS[2]

interface Options {
  chapters: Chapter[]
  activeViewId: string
  query: string
}

export function useGoToItems({ chapters, activeViewId, query }: Options): PaletteGroup[] {
  const activeWorkspace = useActiveWorkspace()
  const { summaries } = useStoryLibrary()
  const { tree, hasHierarchy } = useWorkspaceHierarchy(activeWorkspace)
  const q = query.toLowerCase()

  return useMemo<PaletteGroup[]>(() => {
    const pageItems: PaletteItem[] = []
    const chapterItems: PaletteItem[] = []

    if (hasHierarchy) {
      for (const projectNode of tree) {
        for (const chapterNode of projectNode.children ?? []) {
          if (chapterNode.kind !== 'chapter') continue
          const chapterId = chapterNode.id
          const chapterLabel = chapterNode.label
          const pageChildren = (chapterNode.children ?? []).filter(n => n.kind === 'page')

          if (!q || chapterLabel.toLowerCase().includes(q)) {
            const firstPageId = pageChildren[0]?.id
            const meta: GoToItemMeta = { kind: 'chapter', chapterId, firstPageId }
            chapterItems.push({
              id: `flow:${chapterId}`, // Keep command prefix
              label: chapterLabel,
              subtitle: `${pageChildren.length} page${pageChildren.length !== 1 ? 's' : ''}`,
              icon: Folder,
              iconColor: CHAPTER_COLOR,
              meta: meta as unknown as Record<string, unknown>,
            })
          }

          for (const pageNode of pageChildren) {
            if (!pageNode.view) continue
            const label = pageNode.label
            if (q && !label.toLowerCase().includes(q) && !chapterLabel.toLowerCase().includes(q))
              continue
            const meta: GoToItemMeta = { kind: 'page', chapterId }
            const pageTags = pageNode.view.meta?.tags ?? []
            pageItems.push({
              id: pageNode.id,
              label,
              subtitle: chapterLabel,
              icon: Smartphone,
              iconColor: PAGE_COLOR,
              tags: pageTags,
              badges:
                pageNode.id === activeViewId ? [{ label: 'current', style: 'green' }] : undefined,
              meta: meta as unknown as Record<string, unknown>,
            })
          }
        }
      }
    } else {
      for (const chapter of chapters) {
        const pages = (chapter.children ?? []).filter((v: PageView) => !v.id.endsWith('-play'))

        if (!q || chapter.label.toLowerCase().includes(q)) {
          const meta: GoToItemMeta = {
            kind: 'chapter',
            chapterId: chapter.id,
            firstPageId: pages[0]?.id,
          }
          chapterItems.push({
            id: `flow:${chapter.id}`,
            label: chapter.label,
            subtitle: `${pages.length} page${pages.length !== 1 ? 's' : ''}`,
            icon: Folder,
            iconColor: CHAPTER_COLOR,
            meta: meta as unknown as Record<string, unknown>,
          })
        }

        const matched = q
          ? pages.filter(
              (s: PageView) =>
                s.label.toLowerCase().includes(q) || chapter.label.toLowerCase().includes(q)
            )
          : pages
        for (const s of matched) {
          const meta: GoToItemMeta = { kind: 'page', chapterId: chapter.id }
          pageItems.push({
            id: s.id,
            label: s.label,
            subtitle: chapter.label,
            icon: Smartphone,
            iconColor: PAGE_COLOR,
            tags: s.meta?.tags ?? [],
            badges: s.id === activeViewId ? [{ label: 'current', style: 'green' }] : undefined,
            meta: meta as unknown as Record<string, unknown>,
          })
        }
      }
    }

    const flowStoryItems: PaletteItem[] = []
    for (const summary of summaries) {
      if (
        q &&
        !summary.name.toLowerCase().includes(q) &&
        !(summary.description ?? '').toLowerCase().includes(q)
      )
        continue
      const meta: GoToItemMeta = { kind: 'flowStory' }
      const subtitle =
        summary.tags.length > 0 ? summary.tags.slice(0, 3).join(', ') : `${summary.stepCount} steps`
      flowStoryItems.push({
        id: summary.id,
        label: summary.name,
        subtitle,
        icon: GitBranch,
        iconColor: FLOWSTORY_COLOR,
        tags: summary.tags,
        meta: meta as unknown as Record<string, unknown>,
      })
    }

    return [
      { id: 'pages', label: 'Pages', items: pageItems, color: PAGE_COLOR },
      { id: 'flows', label: 'Chapters', items: chapterItems, color: CHAPTER_COLOR },
      { id: 'flowStories', label: 'Flow Stories', items: flowStoryItems, color: FLOWSTORY_COLOR },
    ]
  }, [chapters, tree, hasHierarchy, summaries, q, activeViewId])
}
