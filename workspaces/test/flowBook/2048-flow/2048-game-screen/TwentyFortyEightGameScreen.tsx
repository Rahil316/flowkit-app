import type { PageMeta } from '@flowkit/types'
import { useAppNav, useDb } from '@flowkit-shared/utils'
import GameOverModal from '@workspace/lib/components/ui/GameOverModal'
import IconButton from '@workspace/lib/components/ui/IconButton'
import ScoreBadge from '@workspace/lib/components/ui/ScoreBadge'
import {
  type Direction,
  emptyGrid,
  type Grid,
  hasMovesLeft,
  hasWon,
  move,
  spawnTile,
} from '@workspace/lib/game-logic/twentyFortyEight'
import { useEffect, useState } from 'react'

const TILE_BG: Record<number, string> = {
  2: 'var(--tile-2)',
  4: 'var(--tile-4)',
  8: 'var(--tile-8)',
  16: 'var(--tile-16)',
  32: 'var(--tile-32)',
  64: 'var(--tile-64)',
  128: 'var(--tile-128)',
  256: 'var(--tile-256)',
  512: 'var(--tile-512)',
  1024: 'var(--tile-1024)',
  2048: 'var(--tile-2048)',
}

function tileBg(value: number): string {
  return TILE_BG[value] ?? 'var(--tile-super)'
}

function tileText(value: number): string {
  return value <= 4 ? 'var(--tile-text-dark)' : 'var(--tile-text-light)'
}

function initGrid(): Grid {
  return spawnTile(spawnTile(emptyGrid()))
}

export default function TwentyFortyEightGameScreen() {
  const { navigateTo } = useAppNav()
  const db = useDb()
  const [grid, setGrid] = useState<Grid>(initGrid)
  const [score, setScore] = useState(0)
  const [gameOver, setGameOver] = useState(false)
  const [won, setWon] = useState(false)
  const [continuedPastWin, setContinuedPastWin] = useState(false)

  const best = db.get<number>('twentyFortyEight.best', 0) ?? 0

  useEffect(() => {
    function handleKey(e: KeyboardEvent) {
      const map: Record<string, Direction> = {
        ArrowUp: 'up',
        ArrowDown: 'down',
        ArrowLeft: 'left',
        ArrowRight: 'right',
      }
      const direction = map[e.key]
      if (direction) {
        e.preventDefault()
        handleMove(direction)
      }
    }
    window.addEventListener('keydown', handleKey)
    return () => window.removeEventListener('keydown', handleKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [grid, gameOver, won, continuedPastWin])

  function handleMove(direction: Direction) {
    if (gameOver || (won && !continuedPastWin)) return
    const { grid: nextGrid, gained, moved } = move(grid, direction)
    if (!moved) return

    const withSpawn = spawnTile(nextGrid)
    const nextScore = score + gained
    setGrid(withSpawn)
    setScore(nextScore)
    db.update<number>('twentyFortyEight.best', (v = 0) => Math.max(v, nextScore))

    if (!won && hasWon(withSpawn)) {
      setWon(true)
      db.set('highScores.twentyFortyEight', true)
    } else if (!hasMovesLeft(withSpawn)) {
      setGameOver(true)
      db.set('highScores.twentyFortyEight', true)
    }
  }

  function handlePlayAgain() {
    setGrid(initGrid())
    setScore(0)
    setGameOver(false)
    setWon(false)
    setContinuedPastWin(false)
  }

  function handleKeepPlaying() {
    setContinuedPastWin(true)
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
          <span className="text-ui-md font-medium text-theme-text-primary">2048</span>
        </div>
        <div className="flex items-center gap-1">
          <IconButton
            id="view-high-scores"
            icon={<span className="text-ui-sm">🏆</span>}
            label="High Scores"
            onClick={() => navigateTo('2048-flow-2048-high-scores-screen')}
          />
          <IconButton
            id="how-to-play"
            icon={<span className="text-ui-sm">?</span>}
            label="How to Play"
            onClick={() => navigateTo('2048-flow-2048-how-to-play-screen')}
          />
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 p-3">
        <ScoreBadge label="Score" value={score} />
        <ScoreBadge label="Best" value={Math.max(best, score)} tone="green" />
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div
          className="grid grid-cols-4 gap-1.5 p-1.5 rounded-[10px] w-full max-w-72"
          style={{ background: 'var(--tile-super)' }}
        >
          {grid.flat().map((value, i) => (
            <div
              key={i}
              className="aspect-square rounded-md flex items-center justify-center text-ui-md font-bold"
              style={{
                background: value === 0 ? 'rgba(255,255,255,0.08)' : tileBg(value),
                color: value === 0 ? 'transparent' : tileText(value),
              }}
            >
              {value || ''}
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 pb-8 flex justify-center">
        <div className="grid grid-cols-3 grid-rows-3 gap-1.5 w-36">
          <div />
          <button
            id="move-up"
            onClick={() => handleMove('up')}
            className="size-10 rounded-md bg-theme-surface shadow-theme-card flex items-center justify-center text-ui-sm text-theme-text-primary"
          >
            ↑
          </button>
          <div />
          <button
            id="move-left"
            onClick={() => handleMove('left')}
            className="size-10 rounded-md bg-theme-surface shadow-theme-card flex items-center justify-center text-ui-sm text-theme-text-primary"
          >
            ←
          </button>
          <div />
          <button
            id="move-right"
            onClick={() => handleMove('right')}
            className="size-10 rounded-md bg-theme-surface shadow-theme-card flex items-center justify-center text-ui-sm text-theme-text-primary"
          >
            →
          </button>
          <div />
          <button
            id="move-down"
            onClick={() => handleMove('down')}
            className="size-10 rounded-md bg-theme-surface shadow-theme-card flex items-center justify-center text-ui-sm text-theme-text-primary"
          >
            ↓
          </button>
          <div />
        </div>
      </div>

      {won && !continuedPastWin && (
        <GameOverModal
          open
          title="You reached 2048!"
          message="Keep playing to push your score even higher, or head back to the hub."
          onPlayAgain={handleKeepPlaying}
          primaryLabel="Keep Playing"
          onBackToHub={() => navigateTo('intro-flow-hub-screen')}
        />
      )}
      <GameOverModal
        open={gameOver}
        title="Game Over"
        message={`No more moves left. Final score: ${score}.`}
        onPlayAgain={handlePlayAgain}
        onBackToHub={() => navigateTo('intro-flow-hub-screen')}
      />
    </div>
  )
}

export const pageMeta: PageMeta = {
  label: '2048',
  desc: 'Slide-and-merge puzzle — reach the 2048 tile before the grid fills up.',
  tags: ['type:puzzle'],
}
