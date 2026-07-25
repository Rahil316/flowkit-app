import type { PageMeta } from '@flowkit/types'
import { useAppNav } from '@flowkit-shared/utils'
import GameCard from '@workspace/lib/components/ui/GameCard'
import Grid from '@workspace/lib/components/ui/Grid'

interface GameEntry {
  id: string
  title: string
  icon: string
  blurb: string
  pageId: string
}

const GAMES: GameEntry[] = [
  {
    id: 'game-blackjack',
    title: 'Blackjack',
    icon: '🃏',
    blurb: 'Beat the dealer to 21',
    pageId: 'blackjack-flow-blackjack-game-screen',
  },
  {
    id: 'game-dice',
    title: 'Dice',
    icon: '🎲',
    blurb: 'Roll for the point',
    pageId: 'dice-flow-dice-game-screen',
  },
  {
    id: 'game-tic-tac-toe',
    title: 'Tic-Tac-Toe',
    icon: '⭕',
    blurb: '2-player pass and play',
    pageId: 'tic-tac-toe-flow-tic-tac-toe-game-screen',
  },
  {
    id: 'game-2048',
    title: '2048',
    icon: '🔢',
    blurb: 'Slide to the target tile',
    pageId: '2048-flow-2048-game-screen',
  },
  {
    id: 'game-memory-match',
    title: 'Memory Match',
    icon: '🧠',
    blurb: 'Find every pair',
    pageId: 'memory-match-flow-memory-match-game-screen',
  },
  {
    id: 'game-math-quiz',
    title: 'Math Quiz',
    icon: '➗',
    blurb: 'Beat the clock on speed math',
    pageId: 'math-quiz-flow-math-quiz-difficulty-screen',
  },
]

export default function HubScreen() {
  const { navigateTo } = useAppNav()

  return (
    <div className="flex flex-col h-full bg-theme-base">
      <div className="flex items-center px-4 h-12 border-b border-theme-border-subtle shrink-0">
        <span className="text-ui-md font-medium text-theme-text-primary">Game Zone</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <Grid
          items={GAMES}
          columns={2}
          renderItem={game => (
            <GameCard
              id={game.id}
              title={game.title}
              icon={game.icon}
              blurb={game.blurb}
              onClick={() => navigateTo(game.pageId)}
            />
          )}
        />
      </div>
    </div>
  )
}

export const pageMeta: PageMeta = {
  label: 'Hub Screen',
  desc: 'Grid of all 6 games — free navigation via useAppNav(), no flowStory required.',
}
