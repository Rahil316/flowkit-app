import type { PageMeta } from '@flowkit/types'
import { useAppNav, useDb } from '@flowkit-shared/utils'
import ScoreBadge from '@workspace/lib/components/ui/ScoreBadge'
import SectionHeader from '@workspace/lib/components/ui/SectionHeader'

export default function TwentyFortyEightHighScoresScreen() {
  const { navigateTo } = useAppNav()
  const db = useDb()
  const best = db.get<number>('twentyFortyEight.best', 0) ?? 0

  return (
    <div className="flex flex-col h-full bg-theme-base">
      <SectionHeader
        title="High Scores"
        onBack={() => navigateTo('2048-flow-2048-game-screen')}
        backId="back"
      />
      <div className="flex-1 flex items-center justify-center p-4">
        <ScoreBadge label="Best Score" value={best} tone="green" />
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
  label: '2048 · High Scores',
  desc: "Shows the player's best 2048 score, live from db. Locked until the player finishes a first game.",
  canEnter: ({ db }) => hasDotPath(db, 'highScores.twentyFortyEight'),
  tags: ['type:puzzle'],
}
