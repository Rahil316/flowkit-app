import type { Chapter } from '@flowkit/types/index'
import type { PaletteItem } from '@flowkit-features/command-palette'
import { CommandPalette } from '@flowkit-features/command-palette'
import { dispatchExplorerCommand } from '@flowkit-shared/utils/explorerCommands'
import { Search } from 'lucide-react'
import { useCallback, useState } from 'react'

import type { GoToItemMeta } from './types'
import { useGoToItems } from './useGoToItems'

interface Props {
  chapters: Chapter[]
  activeViewId: string
  navigateTo: (id: string) => void
  onClose: () => void
}

function useGoToHandlers({ chapters, activeViewId, navigateTo, onClose }: Props) {
  const [query, setQuery] = useState('')
  const groups = useGoToItems({ chapters, activeViewId, query })

  const handleSelect = useCallback(
    (item: PaletteItem) => {
      const meta = item.meta as GoToItemMeta | undefined

      if (meta?.kind === 'page') {
        navigateTo(item.id)
        dispatchExplorerCommand({ type: 'switchTab', tab: 'pages' })
        if (meta.chapterId) {
          dispatchExplorerCommand({
            type: 'expandAndHighlight',
            chapterId: meta.chapterId,
            pageId: item.id,
          })
        }
      } else if (meta?.kind === 'chapter') {
        dispatchExplorerCommand({ type: 'switchTab', tab: 'pages' })
        if (meta.chapterId) {
          const firstPageId = meta.firstPageId ?? ''
          dispatchExplorerCommand({
            type: 'expandAndHighlight',
            chapterId: meta.chapterId,
            pageId: firstPageId,
          })
          if (firstPageId) navigateTo(firstPageId)
        }
      } else if (meta?.kind === 'flowStory') {
        dispatchExplorerCommand({ type: 'switchTab', tab: 'chapters' })
        dispatchExplorerCommand({ type: 'openFlowStoryDetail', flowStoryId: item.id })
      }

      onClose()
    },
    [navigateTo, onClose]
  )

  return { query, groups, handleSelect, setQuery }
}

// ── Inline content (no shell — for BottomSheet / mobile) ─────────────────────

export function GoToOverlayContent({ chapters, activeViewId, navigateTo, onClose }: Props) {
  const { groups, handleSelect, setQuery } = useGoToHandlers({
    chapters,
    activeViewId,
    navigateTo,
    onClose,
  })

  return (
    <CommandPalette
      modal={false}
      headerIcon={Search}
      placeholder="Go to page, chapter, or flow Story"
      source={groups}
      onSelect={handleSelect}
      onClose={onClose}
      grouping="flat"
      filters={{ kinds: true, tags: true }}
      onQueryChange={setQuery}
    />
  )
}

// ── Modal wrapper (desktop overlay) ──────────────────────────────────────────

export default function GoToOverlay({ chapters, activeViewId, navigateTo, onClose }: Props) {
  const { groups, handleSelect, setQuery } = useGoToHandlers({
    chapters,
    activeViewId,
    navigateTo,
    onClose,
  })

  return (
    <CommandPalette
      headerIcon={Search}
      placeholder="Go to page, chapter, or flow story..."
      source={groups}
      onSelect={handleSelect}
      onClose={onClose}
      grouping="flat"
      filters={{ kinds: true, tags: true }}
      onQueryChange={setQuery}
    />
  )
}
