import type { PageMeta } from '@flowkit/types'
import { useAppNav } from '@flowkit-shared/utils'
import HowToPlayList from '@workspace/lib/components/ui/HowToPlayList'
import PrimaryButton from '@workspace/lib/components/ui/PrimaryButton'
import SectionHeader from '@workspace/lib/components/ui/SectionHeader'

const STEPS = [
  'Swipe or tap an arrow to slide every tile in that direction.',
  'Two tiles with the same number merge into one when they collide.',
  'A new tile (2 or, occasionally, 4) spawns after every move.',
  'Reach the 2048 tile to win — or keep playing for a higher score.',
  'The game ends when the grid is full and no more merges are possible.',
]

export default function TwentyFortyEightHowToPlayScreen() {
  const { navigateTo } = useAppNav()

  return (
    <div className="flex flex-col h-full bg-theme-base">
      <SectionHeader
        title="How to Play"
        onBack={() => navigateTo('2048-flow-2048-game-screen')}
        backId="back"
      />
      <div className="flex-1 overflow-y-auto p-4">
        <HowToPlayList steps={STEPS} />
      </div>
      <div className="p-4 pb-8">
        <PrimaryButton id="start-playing" onClick={() => navigateTo('2048-flow-2048-game-screen')}>
          Start Playing
        </PrimaryButton>
      </div>
    </div>
  )
}

export const pageMeta: PageMeta = {
  label: '2048 · How to Play',
  desc: 'Rules explainer for 2048.',
}
