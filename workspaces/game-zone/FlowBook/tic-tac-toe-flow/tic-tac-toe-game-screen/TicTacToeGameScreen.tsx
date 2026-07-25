import type { PageMeta } from '@flowkit/types'
import { useAppNav, useDb } from '@flowkit-shared/utils'
import GameOverModal from '@workspace/lib/components/ui/GameOverModal'
import Grid from '@workspace/lib/components/ui/Grid'
import IconButton from '@workspace/lib/components/ui/IconButton'
import ScoreBadge from '@workspace/lib/components/ui/ScoreBadge'
import {
  type Board,
  emptyBoard,
  getWinner,
  isDraw,
  type Player,
} from '@workspace/lib/game-logic/ticTacToe'
import { useState } from 'react'

interface SessionTally {
  x: number
  o: number
  draws: number
}

export default function TicTacToeGameScreen() {
  const { navigateTo } = useAppNav()
  const db = useDb()
  const [board, setBoard] = useState<Board>(emptyBoard())
  const [currentPlayer, setCurrentPlayer] = useState<Player>('X')

  const winner = getWinner(board)
  const draw = isDraw(board)
  const gameOver = winner !== null || draw

  function handleCellClick(index: number) {
    if (board[index] !== null || gameOver) return
    const next = [...board]
    next[index] = currentPlayer
    setBoard(next)

    const nextWinner = getWinner(next)
    if (nextWinner) {
      const key = nextWinner.toLowerCase() as 'x' | 'o'
      db.update<SessionTally>('ticTacToe.sessionTally', (tally = { x: 0, o: 0, draws: 0 }) => ({
        ...tally,
        [key]: tally[key] + 1,
      }))
    } else if (isDraw(next)) {
      db.update<SessionTally>('ticTacToe.sessionTally', (tally = { x: 0, o: 0, draws: 0 }) => ({
        ...tally,
        draws: tally.draws + 1,
      }))
    } else {
      setCurrentPlayer(currentPlayer === 'X' ? 'O' : 'X')
    }
  }

  function handlePlayAgain() {
    setBoard(emptyBoard())
    setCurrentPlayer('X')
  }

  const tally = db.get<SessionTally>('ticTacToe.sessionTally', { x: 0, o: 0, draws: 0 })

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
          <span className="text-ui-md font-medium text-theme-text-primary">Tic-Tac-Toe</span>
        </div>
        <IconButton
          id="how-to-play"
          icon={<span className="text-ui-sm">?</span>}
          label="How to Play"
          onClick={() => navigateTo('tic-tac-toe-flow-tic-tac-toe-how-to-play-screen')}
        />
      </div>
      <div className="flex items-center justify-center gap-3 p-3">
        <ScoreBadge label="X wins" value={tally?.x ?? 0} tone="default" />
        <ScoreBadge label="O wins" value={tally?.o ?? 0} tone="default" />
        <ScoreBadge label="Draws" value={tally?.draws ?? 0} tone="amber" />
      </div>
      <div className="flex-1 flex items-center justify-center p-4">
        <div className="w-full max-w-60">
          <Grid
            items={board}
            columns={3}
            gap="gap-1.5"
            renderItem={(cell, index) => (
              <button
                id={`cell-${index}`}
                onClick={() => handleCellClick(index)}
                disabled={cell !== null || gameOver}
                className="aspect-square w-full rounded-[10px] bg-theme-surface shadow-theme-card flex items-center justify-center text-ui-xl font-bold text-theme-text-primary disabled:opacity-100"
              >
                {cell}
              </button>
            )}
          />
        </div>
      </div>
      <p className="text-ui-xs text-theme-text-muted text-center pb-4">
        {gameOver ? '' : `${currentPlayer}'s turn`}
      </p>
      <GameOverModal
        open={gameOver}
        title={winner ? `${winner} wins!` : "It's a draw"}
        message={winner ? `Player ${winner} takes this round.` : 'Nobody gets it this time.'}
        onPlayAgain={handlePlayAgain}
        onBackToHub={() => navigateTo('intro-flow-hub-screen')}
      />
    </div>
  )
}

export const pageMeta: PageMeta = {
  label: 'Tic-Tac-Toe',
  desc: '2-player pass-and-play tic-tac-toe with a session win/draw tally.',
  tags: ['type:strategy'],
}
