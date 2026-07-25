import type { PageMeta } from '@flowkit/types'
import { useAppNav } from '@flowkit-shared/utils'
import HowToPlayList from '@workspace/lib/components/ui/HowToPlayList'
import PrimaryButton from '@workspace/lib/components/ui/PrimaryButton'
import SectionHeader from '@workspace/lib/components/ui/SectionHeader'

const STEPS = [
  'Roll two dice for your come-out roll.',
  'A 7 or 11 wins immediately. A 2, 3, or 12 loses immediately.',
  'Any other total establishes "the point" — keep rolling.',
  'Roll the point again before a 7 shows up and you win.',
  'Roll a 7 before the point ("seven-out") and you lose.',
]

export default function DiceHowToPlayScreen() {
  const { navigateTo } = useAppNav()

  return (
    <div className="flex flex-col h-full bg-theme-base">
      <SectionHeader
        title="How to Play"
        onBack={() => navigateTo('dice-flow-dice-game-screen')}
        backId="back"
      />
      <div className="flex-1 overflow-y-auto p-4">
        <HowToPlayList steps={STEPS} />
      </div>
      <div className="p-4 pb-8">
        <PrimaryButton id="start-playing" onClick={() => navigateTo('dice-flow-dice-game-screen')}>
          Start Playing
        </PrimaryButton>
      </div>
    </div>
  )
}

export const pageMeta: PageMeta = {
  label: 'Dice · How to Play',
  desc: 'Rules explainer for the simplified craps Dice game.',
}
