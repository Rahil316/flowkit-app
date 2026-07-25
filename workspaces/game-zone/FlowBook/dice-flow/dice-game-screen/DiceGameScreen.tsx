import type { PageMeta } from '@flowkit/types'
import { useAppNav, useDb } from '@flowkit-shared/utils'
import GameOverModal from '@workspace/lib/components/ui/GameOverModal'
import IconButton from '@workspace/lib/components/ui/IconButton'
import PrimaryButton from '@workspace/lib/components/ui/PrimaryButton'
import ScoreBadge from '@workspace/lib/components/ui/ScoreBadge'
import {
  type DicePhase,
  type DiceResult,
  resolveComeOut,
  resolvePoint,
  rollTwo,
} from '@workspace/lib/game-logic/dice'
import { useState } from 'react'

const BET = 50

export default function DiceGameScreen() {
  const { navigateTo } = useAppNav()
  const db = useDb()
  const [phase, setPhase] = useState<DicePhase>('come-out')
  const [point, setPoint] = useState<number | null>(null)
  const [lastRoll, setLastRoll] = useState<[number, number, number] | null>(null)
  const [result, setResult] = useState<DiceResult>(null)
  const [rollHistory, setRollHistory] = useState<number[]>([])

  const bankroll = db.get<number>('dice.bankroll', 500) ?? 500

  function settle(outcome: 'win' | 'lose') {
    db.update<number>('dice.bankroll', (v = 500) => (outcome === 'win' ? v + BET : v - BET))
  }

  function handleRoll() {
    const forcedRaw = db.get<string>('dice.forcedRoll', 'none')
    const forced = forcedRaw && forcedRaw !== 'none' ? Number(forcedRaw) : undefined
    const roll = rollTwo(forced)
    setLastRoll(roll)
    setRollHistory(h => [...h, roll[2]])

    if (phase === 'come-out') {
      const { result: comeOutResult, establishesPoint } = resolveComeOut(roll[2])
      if (establishesPoint) {
        setPoint(roll[2])
        setPhase('point')
        return
      }
      setResult(comeOutResult)
      setPhase('resolved')
      if (comeOutResult) settle(comeOutResult)
    } else if (phase === 'point' && point !== null) {
      const pointResult = resolvePoint(roll[2], point)
      if (pointResult) {
        setResult(pointResult)
        setPhase('resolved')
        settle(pointResult)
      }
      // else: no resolution, stay in point phase, re-roll
    }
  }

  function handlePlayAgain() {
    setPhase('come-out')
    setPoint(null)
    setLastRoll(null)
    setResult(null)
    setRollHistory([])
  }

  return (
    <div className="flex flex-col h-full relative" style={{ background: 'var(--table-felt)' }}>
      <div className="flex items-center justify-between px-4 h-12 border-b border-theme-border-subtle shrink-0">
        <div className="flex items-center gap-2">
          <IconButton
            id="back-to-hub-header"
            icon={<span className="text-ui-md">‹</span>}
            label="Back"
            onClick={() => navigateTo('intro-flow-hub-screen')}
          />
          <span className="text-ui-md font-medium" style={{ color: 'var(--tile-text-light)' }}>
            Dice
          </span>
        </div>
        <IconButton
          id="how-to-play"
          icon={<span className="text-ui-sm">?</span>}
          label="How to Play"
          onClick={() => navigateTo('dice-flow-dice-how-to-play-screen')}
        />
      </div>

      <div className="flex items-center justify-center gap-3 p-3">
        <ScoreBadge
          label="Bankroll"
          value={`$${bankroll}`}
          tone={bankroll >= 500 ? 'green' : 'red'}
        />
        <ScoreBadge
          label="Phase"
          value={
            phase === 'come-out' ? 'Come Out' : phase === 'point' ? `Point ${point}` : 'Resolved'
          }
        />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-4">
        <div className="flex gap-3">
          {(lastRoll ? [lastRoll[0], lastRoll[1]] : [null, null]).map((face, i) => (
            <div
              key={i}
              className="size-16 rounded-[10px] shadow-theme-card flex items-center justify-center text-ui-xl font-bold"
              style={{ background: 'var(--dice-face)', color: 'var(--dice-pip)' }}
            >
              {face ?? '–'}
            </div>
          ))}
        </div>
        {rollHistory.length > 0 && (
          <p className="text-ui-xs" style={{ color: 'var(--tile-text-light)' }}>
            History: {rollHistory.join(', ')}
          </p>
        )}
      </div>

      <div className="p-4 pb-8">
        {phase !== 'resolved' && (
          <PrimaryButton id="roll" onClick={handleRoll}>
            Roll
          </PrimaryButton>
        )}
      </div>

      <GameOverModal
        open={phase === 'resolved'}
        title={result === 'win' ? 'You win!' : 'Seven-out'}
        message={
          result === 'win' ? `+$${BET} added to your bankroll.` : `-$${BET} from your bankroll.`
        }
        onPlayAgain={handlePlayAgain}
        onBackToHub={() => navigateTo('intro-flow-hub-screen')}
      />
    </div>
  )
}

export const pageMeta: PageMeta = {
  label: 'Dice',
  desc: 'Simplified craps — come-out roll, establish a point, resolve on point or seven-out.',
  tags: ['type:dice'],
}
