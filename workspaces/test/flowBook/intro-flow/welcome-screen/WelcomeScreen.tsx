import type { PageMeta } from '@flowkit/types'
import { useAppNav } from '@flowkit-shared/utils'
import PrimaryButton from '@workspace/lib/components/ui/PrimaryButton'

export default function WelcomeScreen() {
  const { navigateTo } = useAppNav()

  return (
    <div className="flex flex-col h-full bg-theme-base">
      <div className="flex flex-col items-center justify-center flex-1 gap-4 p-6">
        <div className="size-16 rounded-full bg-theme-blue-dim flex items-center justify-center">
          <span className="text-2xl">🎮</span>
        </div>
        <h1 className="text-ui-xl font-bold text-theme-text-primary text-center">
          Welcome to Game Zone
        </h1>
        <p className="text-ui-sm text-theme-text-secondary text-center max-w-xs">
          Six mini-games, one hub. Blackjack, Dice, Tic-Tac-Toe, 2048, Memory Match, and Math Quiz —
          pick a game and play.
        </p>
      </div>
      <div className="p-4 pb-8">
        <PrimaryButton id="play" onClick={() => navigateTo('intro-flow-hub-screen')}>
          Play
        </PrimaryButton>
      </div>
    </div>
  )
}

export const pageMeta: PageMeta = {
  label: 'Welcome Screen',
  desc: 'Entry point — introduces the arcade and prompts the player to enter the hub.',
}
