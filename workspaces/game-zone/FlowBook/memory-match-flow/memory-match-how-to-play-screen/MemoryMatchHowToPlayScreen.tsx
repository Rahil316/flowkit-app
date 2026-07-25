import type { PageMeta } from '@flowkit/types'
import { useAppNav } from '@flowkit-shared/utils'
import HowToPlayList from '@workspace/lib/components/ui/HowToPlayList'
import PrimaryButton from '@workspace/lib/components/ui/PrimaryButton'
import SectionHeader from '@workspace/lib/components/ui/SectionHeader'

const STEPS = [
  'Tap a card to flip it face up.',
  'Tap a second card to look for a match.',
  'A matching pair stays face up. A non-match flips back after a moment.',
  'Find all 8 pairs to finish — fewer moves and less time is a better score.',
]

export default function MemoryMatchHowToPlayScreen() {
  const { navigateTo } = useAppNav()

  return (
    <div className="flex flex-col h-full bg-theme-base">
      <SectionHeader
        title="How to Play"
        onBack={() => navigateTo('memory-match-flow-memory-match-game-screen')}
        backId="back"
      />
      <div className="flex-1 overflow-y-auto p-4">
        <HowToPlayList steps={STEPS} />
      </div>
      <div className="p-4 pb-8">
        <PrimaryButton id="start-playing" onClick={() => navigateTo('memory-match-flow-memory-match-game-screen')}>
          Start Playing
        </PrimaryButton>
      </div>
    </div>
  )
}

export const pageMeta: PageMeta = {
  label: 'Memory Match · How to Play',
  desc: 'Rules explainer for Memory Match.',
}
