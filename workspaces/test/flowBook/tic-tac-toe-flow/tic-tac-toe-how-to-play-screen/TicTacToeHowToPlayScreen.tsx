import type { PageMeta } from '@flowkit/types'
import { useAppNav } from '@flowkit-shared/utils'
import HowToPlayList from '@workspace/lib/components/ui/HowToPlayList'
import PrimaryButton from '@workspace/lib/components/ui/PrimaryButton'
import SectionHeader from '@workspace/lib/components/ui/SectionHeader'

const STEPS = [
  'Players take turns as X and O, X goes first.',
  'Tap an empty square to place your mark.',
  'Get three of your marks in a row — across, down, or diagonal — to win.',
  'If all nine squares fill with no winner, the round is a draw.',
]

export default function TicTacToeHowToPlayScreen() {
  const { navigateTo } = useAppNav()

  return (
    <div className="flex flex-col h-full bg-theme-base">
      <SectionHeader
        title="How to Play"
        onBack={() => navigateTo('tic-tac-toe-flow-tic-tac-toe-game-screen')}
        backId="back"
      />
      <div className="flex-1 overflow-y-auto p-4">
        <HowToPlayList steps={STEPS} />
      </div>
      <div className="p-4 pb-8">
        <PrimaryButton id="start-playing" onClick={() => navigateTo('tic-tac-toe-flow-tic-tac-toe-game-screen')}>
          Start Playing
        </PrimaryButton>
      </div>
    </div>
  )
}

export const pageMeta: PageMeta = {
  label: 'Tic-Tac-Toe · How to Play',
  desc: 'Rules explainer for Tic-Tac-Toe.',
}
