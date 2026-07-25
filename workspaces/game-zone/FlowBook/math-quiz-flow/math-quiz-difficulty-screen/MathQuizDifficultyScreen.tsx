import type { PageMeta } from '@flowkit/types'
import { useAppNav, useDb } from '@flowkit-shared/utils'
import DifficultyPicker, { type Difficulty } from '@workspace/lib/components/ui/DifficultyPicker'
import PrimaryButton from '@workspace/lib/components/ui/PrimaryButton'
import SectionHeader from '@workspace/lib/components/ui/SectionHeader'

export default function MathQuizDifficultyScreen() {
  const { navigateTo } = useAppNav()
  const db = useDb()
  const difficulty = (db.get<Difficulty>('mathQuiz.difficulty', 'easy') ?? 'easy') as Difficulty

  return (
    <div className="flex flex-col h-full bg-theme-base">
      <SectionHeader
        title="Math Quiz"
        onBack={() => navigateTo('intro-flow-hub-screen')}
        backId="back-to-hub"
      />
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
        <span className="text-4xl">➗</span>
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-ui-lg font-bold text-theme-text-primary">Pick a difficulty</h1>
          <p className="text-ui-sm text-theme-text-secondary text-center max-w-xs">
            Solve as many equations as you can before you get one wrong.
          </p>
        </div>
        <DifficultyPicker
          value={difficulty}
          onSelect={value => db.set('mathQuiz.difficulty', value)}
        />
      </div>
      <div className="p-4 pb-8">
        <PrimaryButton id="start-quiz" onClick={() => navigateTo('math-quiz-flow-math-quiz-game-screen')}>
          Start
        </PrimaryButton>
      </div>
    </div>
  )
}

export const pageMeta: PageMeta = {
  label: 'Math Quiz · Difficulty',
  desc: 'Difficulty picker for Math Quiz — persists the choice to db.',
}
