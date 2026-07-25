import type { PageMeta } from '@flowkit/types'
import { useAppNav, useDb } from '@flowkit-shared/utils'
import ScoreBadge from '@workspace/lib/components/ui/ScoreBadge'
import SectionHeader from '@workspace/lib/components/ui/SectionHeader'

function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function MemoryMatchHighScoresScreen() {
  const { navigateTo } = useAppNav()
  const db = useDb()
  const bestMoves = db.get<number>('memoryMatch.bestMoves', 0) ?? 0
  const bestTimeMs = db.get<number>('memoryMatch.bestTimeMs', 0) ?? 0

  return (
    <div className="flex flex-col h-full bg-theme-base">
      <SectionHeader
        title="High Scores"
        onBack={() => navigateTo('memory-match-flow-memory-match-game-screen')}
        backId="back"
      />
      <div className="flex-1 flex items-center justify-center gap-3 p-4">
        <ScoreBadge label="Best Moves" value={bestMoves} tone="green" />
        <ScoreBadge label="Best Time" value={formatTime(bestTimeMs)} tone="green" />
      </div>
    </div>
  )
}

function hasDotPath(db: Record<string, unknown>, path: string): boolean {
  let cursor: unknown = db
  for (const part of path.split('.')) {
    if (cursor === null || typeof cursor !== 'object' || !(part in (cursor as object))) return false
    cursor = (cursor as Record<string, unknown>)[part]
  }
  return true
}

export const pageMeta: PageMeta = {
  label: 'Memory Match · High Scores',
  desc: "Shows the player's best moves/time for Memory Match, live from db. Locked until first game.",
  canEnter: ({ db }) => hasDotPath(db, 'highScores.memoryMatch.bestMoves'),
  tags: ['type:memory'],
}
