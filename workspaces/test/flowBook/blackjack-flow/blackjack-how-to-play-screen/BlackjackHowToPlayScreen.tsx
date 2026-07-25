import type { PageMeta } from '@flowkit/types'
import { useAppNav } from '@flowkit-shared/utils'
import HowToPlayList from '@workspace/lib/components/ui/HowToPlayList'
import PrimaryButton from '@workspace/lib/components/ui/PrimaryButton'
import SectionHeader from '@workspace/lib/components/ui/SectionHeader'

const STEPS = [
  'Get as close to 21 as possible without going over.',
  'Number cards count as their value, face cards count as 10, aces count as 11 or 1 — whichever keeps your hand alive.',
  'Hit to take another card, or Stand to lock in your total.',
  'The dealer hits until reaching 17 or more, then stops.',
  'A two-card 21 is a blackjack and pays 3:2. Ties are a push — your bet is returned.',
]

export default function BlackjackHowToPlayScreen() {
  const { navigateTo } = useAppNav()

  return (
    <div className="flex flex-col h-full bg-theme-base">
      <SectionHeader
        title="How to Play"
        onBack={() => navigateTo('blackjack-flow-blackjack-game-screen')}
        backId="back"
      />
      <div className="flex-1 overflow-y-auto p-4">
        <HowToPlayList steps={STEPS} />
      </div>
      <div className="p-4 pb-8">
        <PrimaryButton id="start-playing" onClick={() => navigateTo('blackjack-flow-blackjack-game-screen')}>
          Start Playing
        </PrimaryButton>
      </div>
    </div>
  )
}

export const pageMeta: PageMeta = {
  label: 'Blackjack · How to Play',
  desc: 'Rules explainer for Blackjack.',
}
