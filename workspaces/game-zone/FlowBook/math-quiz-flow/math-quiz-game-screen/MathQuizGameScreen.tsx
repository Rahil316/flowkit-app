import type { PageMeta } from '@flowkit/types'
import { cn } from '@flowkit-kit/lib/utils'
import { useAppNav, useDb } from '@flowkit-shared/utils'
import GameOverModal from '@workspace/lib/components/ui/GameOverModal'
import IconButton from '@workspace/lib/components/ui/IconButton'
import ScoreBadge from '@workspace/lib/components/ui/ScoreBadge'
import {
  type Difficulty,
  type Equation,
  generateEquation,
  generateOptions,
} from '@workspace/lib/game-logic/mathQuiz'
import { useState } from 'react'

export default function MathQuizGameScreen() {
  const { navigateTo } = useAppNav()
  const db = useDb()
  const difficulty = (db.get<Difficulty>('mathQuiz.difficulty', 'easy') ?? 'easy') as Difficulty

  const [streak, setStreak] = useState(0)
  const [roundScore, setRoundScore] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [gameOver, setGameOver] = useState(false)
  const [equation, setEquation] = useState<Equation>(() => generateEquation(difficulty))
  const [options, setOptions] = useState<number[]>(() => generateOptions(equation.correctAnswer))

  const bestScore = db.get<number>('mathQuiz.score', 0) ?? 0

  function handleSelect(option: number) {
    if (selected !== null) return
    setSelected(option)
    const correct = option === equation.correctAnswer
    setIsCorrect(correct)

    if (correct) {
      const nextScore = roundScore + 1
      setRoundScore(nextScore)
      setStreak(s => s + 1)
      db.update<number>('mathQuiz.score', (v = 0) => Math.max(v, nextScore))
    } else {
      setGameOver(true)
    }
  }

  function handleNext() {
    setSelected(null)
    setIsCorrect(null)
    const nextEquation = generateEquation(difficulty)
    setEquation(nextEquation)
    setOptions(generateOptions(nextEquation.correctAnswer))
  }

  function handlePlayAgain() {
    setStreak(0)
    setRoundScore(0)
    setSelected(null)
    setIsCorrect(null)
    setGameOver(false)
    const nextEquation = generateEquation(difficulty)
    setEquation(nextEquation)
    setOptions(generateOptions(nextEquation.correctAnswer))
  }

  return (
    <div className="flex flex-col h-full bg-theme-base relative">
      <div className="flex items-center justify-between px-4 h-12 border-b border-theme-border-subtle shrink-0">
        <div className="flex items-center gap-2">
          <IconButton
            id="back-to-hub-header"
            icon={<span className="text-ui-md">‹</span>}
            label="Back"
            onClick={() => navigateTo('intro-flow-hub-screen')}
          />
          <span className="text-ui-md font-medium text-theme-text-primary">Math Quiz</span>
        </div>
        <IconButton
          id="how-to-play"
          icon={<span className="text-ui-sm">?</span>}
          label="How to Play"
          onClick={() => navigateTo('math-quiz-flow-math-quiz-how-to-play-screen')}
        />
      </div>

      <div className="flex items-center justify-center gap-3 p-3">
        <ScoreBadge label="Score" value={roundScore} />
        <ScoreBadge label="Streak" value={streak} tone="amber" />
        <ScoreBadge label="Best" value={bestScore} tone="green" />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
        <span className="text-ui-xl font-bold text-theme-text-primary">{equation.text} = ?</span>
        <div className="grid grid-cols-2 gap-2 w-full max-w-64">
          {options.map((option, i) => {
            const isSelected = selected === option
            const showCorrect = selected !== null && option === equation.correctAnswer
            return (
              <button
                key={i}
                id={`option-${i}`}
                onClick={() => handleSelect(option)}
                disabled={selected !== null}
                className={cn(
                  'py-3 rounded-[10px] shadow-theme-card text-ui-md font-semibold disabled:opacity-100',
                  !showCorrect && !isSelected && 'bg-theme-surface text-theme-text-primary'
                )}
                style={{
                  background: showCorrect
                    ? 'var(--tile-2)'
                    : isSelected
                      ? 'var(--card-suit-red)'
                      : undefined,
                  color: showCorrect ? 'var(--tile-text-dark)' : isSelected ? '#fff' : undefined,
                }}
              >
                {option}
              </button>
            )
          })}
        </div>
      </div>

      {isCorrect && !gameOver && (
        <div className="p-4 pb-8">
          <button
            id="next-round"
            onClick={handleNext}
            className="w-full px-3 py-2.5 rounded-md bg-theme-green-dim text-theme-green text-ui-sm font-medium"
          >
            Next
          </button>
        </div>
      )}

      <GameOverModal
        open={gameOver}
        title="Wrong answer"
        message={`You solved ${roundScore} in a row. Best: ${Math.max(bestScore, roundScore)}.`}
        onPlayAgain={handlePlayAgain}
        onBackToHub={() => navigateTo('intro-flow-hub-screen')}
      />
    </div>
  )
}

export const pageMeta: PageMeta = {
  label: 'Math Quiz',
  desc: 'Speed math — equation difficulty scales with the chosen level, streak ends on a miss.',
  tags: ['type:trivia'],
}
