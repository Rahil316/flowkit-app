import type { PageMeta } from '@flowkit/types'
import { useAppNav } from '@flowkit-shared/utils'
import HowToPlayList from '@workspace/lib/components/ui/HowToPlayList'
import PrimaryButton from '@workspace/lib/components/ui/PrimaryButton'
import SectionHeader from '@workspace/lib/components/ui/SectionHeader'

const STEPS = [
  'Pick a difficulty — Easy, Medium, or Hard.',
  'Solve the equation and tap the correct answer from four choices.',
  'A correct answer extends your streak and moves you to the next equation.',
  'A wrong answer ends the round — your best streak is saved.',
]

export default function MathQuizHowToPlayScreen() {
  const { navigateTo } = useAppNav()

  return (
    <div className="flex flex-col h-full bg-theme-base">
      <SectionHeader
        title="How to Play"
        onBack={() => navigateTo('math-quiz-flow-math-quiz-game-screen')}
        backId="back"
      />
      <div className="flex-1 overflow-y-auto p-4">
        <HowToPlayList steps={STEPS} />
      </div>
      <div className="p-4 pb-8">
        <PrimaryButton id="start-playing" onClick={() => navigateTo('math-quiz-flow-math-quiz-game-screen')}>
          Start Playing
        </PrimaryButton>
      </div>
    </div>
  )
}

export const pageMeta: PageMeta = {
  label: 'Math Quiz · How to Play',
  desc: 'Rules explainer for Math Quiz.',
}
