import type { PageMeta } from '@flowkit/types'
import { useAppNav, useDb } from '@flowkit-shared/utils'
import GameOverModal from '@workspace/lib/components/ui/GameOverModal'
import IconButton from '@workspace/lib/components/ui/IconButton'
import ScoreBadge from '@workspace/lib/components/ui/ScoreBadge'
import {
  isComplete,
  isMatch,
  type MemoryCard,
  newBoard,
} from '@workspace/lib/game-logic/memoryMatch'
import { useEffect, useRef, useState } from 'react'

const FLIP_BACK_DELAY_MS = 900

function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return `${m}:${s.toString().padStart(2, '0')}`
}

export default function MemoryMatchGameScreen() {
  const { navigateTo } = useAppNav()
  const db = useDb()
  const [cards, setCards] = useState<MemoryCard[]>(newBoard)
  const [selected, setSelected] = useState<number[]>([])
  const [moves, setMoves] = useState(0)
  const [startedAt] = useState(() => Date.now())
  const [elapsedMs, setElapsedMs] = useState(0)
  const flipBackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const gameOver = isComplete(cards)
  const bestMoves = db.get<number>('memoryMatch.bestMoves', 0) ?? 0
  const bestTimeMs = db.get<number>('memoryMatch.bestTimeMs', 0) ?? 0

  useEffect(() => {
    if (gameOver) return
    const interval = setInterval(() => setElapsedMs(Date.now() - startedAt), 250)
    return () => clearInterval(interval)
  }, [gameOver, startedAt])

  useEffect(() => {
    return () => {
      if (flipBackTimer.current) clearTimeout(flipBackTimer.current)
    }
  }, [])

  useEffect(() => {
    if (gameOver) {
      db.update<number>('memoryMatch.bestMoves', (v = 0) => (v === 0 ? moves : Math.min(v, moves)))
      db.update<number>('memoryMatch.bestTimeMs', (v = 0) =>
        v === 0 ? elapsedMs : Math.min(v, elapsedMs)
      )
      db.set('highScores.memoryMatch.bestMoves', true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameOver])

  function handleCardClick(index: number) {
    if (cards[index].matched || selected.includes(index) || selected.length === 2) return

    const nextSelected = [...selected, index]
    setSelected(nextSelected)

    if (nextSelected.length === 2) {
      setMoves(m => m + 1)
      const [a, b] = nextSelected
      if (isMatch(cards, a, b)) {
        setCards(prev => prev.map((c, i) => (i === a || i === b ? { ...c, matched: true } : c)))
        setSelected([])
      } else {
        flipBackTimer.current = setTimeout(() => setSelected([]), FLIP_BACK_DELAY_MS)
      }
    }
  }

  function handlePlayAgain() {
    setCards(newBoard())
    setSelected([])
    setMoves(0)
    setElapsedMs(0)
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
          <span className="text-ui-md font-medium text-theme-text-primary">Memory Match</span>
        </div>
        <div className="flex items-center gap-1">
          <IconButton
            id="view-high-scores"
            icon={<span className="text-ui-sm">🏆</span>}
            label="High Scores"
            onClick={() => navigateTo('memory-match-flow-memory-match-high-scores-screen')}
          />
          <IconButton
            id="how-to-play"
            icon={<span className="text-ui-sm">?</span>}
            label="How to Play"
            onClick={() => navigateTo('memory-match-flow-memory-match-how-to-play-screen')}
          />
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 p-3">
        <ScoreBadge label="Moves" value={moves} />
        <ScoreBadge label="Time" value={formatTime(elapsedMs)} />
        <ScoreBadge label="Best" value={bestMoves > 0 ? `${bestMoves}mv` : '—'} tone="green" />
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="grid grid-cols-4 gap-2 w-full max-w-72">
          {cards.map((card, index) => {
            const isFaceUp = card.matched || selected.includes(index)
            return (
              <button
                key={card.id}
                id={`card-${index}`}
                onClick={() => handleCardClick(index)}
                disabled={isFaceUp}
                className="aspect-square rounded-md shadow-theme-card flex items-center justify-center text-ui-lg disabled:opacity-100"
                style={{ background: isFaceUp ? 'var(--card-face-bg)' : 'var(--memory-card-back)' }}
              >
                {isFaceUp ? card.symbol : ''}
              </button>
            )
          })}
        </div>
      </div>

      <GameOverModal
        open={gameOver}
        title="All matched!"
        message={`Finished in ${moves} moves, ${formatTime(elapsedMs)}.${bestTimeMs > 0 ? ` Best: ${bestMoves} moves.` : ''}`}
        onPlayAgain={handlePlayAgain}
        onBackToHub={() => navigateTo('intro-flow-hub-screen')}
      />
    </div>
  )
}

export const pageMeta: PageMeta = {
  label: 'Memory Match',
  desc: 'Flip pairs of cards to find every match — tracks moves and elapsed time.',
  tags: ['type:memory'],
}
