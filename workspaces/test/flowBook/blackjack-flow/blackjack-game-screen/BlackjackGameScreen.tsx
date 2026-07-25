import type { PageMeta } from '@flowkit/types'
import { useAppNav, useDb } from '@flowkit-shared/utils'
import IconButton from '@workspace/lib/components/ui/IconButton'
import PlayingCard from '@workspace/lib/components/ui/PlayingCard'
import PrimaryButton from '@workspace/lib/components/ui/PrimaryButton'
import ScoreBadge from '@workspace/lib/components/ui/ScoreBadge'
import {
  type BlackjackResult,
  dealerShouldHit,
  payout,
  resolveHand,
} from '@workspace/lib/game-logic/blackjack'
import { type Card, deal, freshDeck, handValue, shuffle } from '@workspace/lib/game-logic/deck'
import { useState } from 'react'

type Phase = 'betting' | 'player-turn' | 'dealer-turn' | 'resolved'

const BET_AMOUNT = 25

const RESULT_LABEL: Record<NonNullable<BlackjackResult>, string> = {
  'player-blackjack': 'Blackjack!',
  'player-win': 'You win!',
  'dealer-win': 'Dealer wins',
  push: 'Push',
}

export default function BlackjackGameScreen() {
  const { navigateTo } = useAppNav()
  const db = useDb()
  const [phase, setPhase] = useState<Phase>('betting')
  const [deck, setDeck] = useState<Card[]>([])
  const [playerHand, setPlayerHand] = useState<Card[]>([])
  const [dealerHand, setDealerHand] = useState<Card[]>([])
  const [bet, setBet] = useState(0)
  const [result, setResult] = useState<BlackjackResult>(null)

  const bankroll = db.get<number>('blackjack.bankroll', 500) ?? 500

  function startHand() {
    const shuffled = shuffle(freshDeck())
    const { drawn: playerDrawn, remaining: afterPlayer } = deal(shuffled, 2)
    const { drawn: dealerDrawn, remaining: afterDealer } = deal(afterPlayer, 2)

    db.update<number>('blackjack.bankroll', (v = 500) => v - BET_AMOUNT)
    setBet(BET_AMOUNT)
    setDeck(afterDealer)
    setPlayerHand(playerDrawn)
    setDealerHand(dealerDrawn)
    setResult(null)
    setPhase('player-turn')
  }

  function settle(finalPlayerHand: Card[], finalDealerHand: Card[]) {
    const handResult = resolveHand(finalPlayerHand, finalDealerHand)
    setResult(handResult)
    setPhase('resolved')
    const delta = payout(handResult, bet) + bet // return the original bet on non-loss outcomes
    if (handResult !== 'dealer-win') {
      db.update<number>('blackjack.bankroll', (v = 500) => v + delta)
    }
  }

  function playDealer(startingDeck: Card[], finalPlayerHand: Card[]) {
    let currentDealerHand = [...dealerHand]
    let currentDeck = startingDeck
    while (dealerShouldHit(currentDealerHand)) {
      const { drawn, remaining } = deal(currentDeck, 1)
      currentDealerHand = [...currentDealerHand, ...drawn]
      currentDeck = remaining
    }
    setDealerHand(currentDealerHand)
    setDeck(currentDeck)
    settle(finalPlayerHand, currentDealerHand)
  }

  function handleHit() {
    const { drawn, remaining } = deal(deck, 1)
    const nextHand = [...playerHand, ...drawn]
    setPlayerHand(nextHand)
    setDeck(remaining)
    if (handValue(nextHand).value > 21) {
      settle(nextHand, dealerHand)
    }
  }

  function handleStand() {
    setPhase('dealer-turn')
    playDealer(deck, playerHand)
  }

  const playerValue = handValue(playerHand)
  const dealerRevealed = phase === 'dealer-turn' || phase === 'resolved'

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
            Blackjack
          </span>
        </div>
        <IconButton
          id="how-to-play"
          icon={<span className="text-ui-sm">?</span>}
          label="How to Play"
          onClick={() => navigateTo('blackjack-flow-blackjack-how-to-play-screen')}
        />
      </div>

      <div className="flex items-center justify-center gap-3 p-3">
        <ScoreBadge
          label="Bankroll"
          value={`$${bankroll}`}
          tone={bankroll >= 500 ? 'green' : 'red'}
        />
        {bet > 0 && <ScoreBadge label="Bet" value={`$${bet}`} tone="amber" />}
      </div>

      <div className="flex-1 flex flex-col justify-between p-4">
        <div className="flex flex-col items-center gap-2">
          <span className="text-ui-xs" style={{ color: 'var(--tile-text-light)' }}>
            Dealer {dealerRevealed ? handValue(dealerHand).value : ''}
          </span>
          <div className="flex gap-2">
            {dealerHand.map((card, i) => (
              <PlayingCard
                key={i}
                card={card}
                faceDown={i === 1 && !dealerRevealed}
                dealIndex={i}
              />
            ))}
          </div>
        </div>

        <div className="flex flex-col items-center gap-2">
          <div className="flex gap-2">
            {playerHand.map((card, i) => (
              <PlayingCard key={i} card={card} dealIndex={i} />
            ))}
          </div>
          <span className="text-ui-xs" style={{ color: 'var(--tile-text-light)' }}>
            You{' '}
            {playerHand.length > 0
              ? `${playerValue.value}${playerValue.soft ? ' (soft)' : ''}`
              : ''}
          </span>
        </div>
      </div>

      {phase === 'resolved' && result && (
        <div
          key={result}
          className="mx-4 mb-3 rounded-[10px] shadow-theme-card px-3 py-2 flex items-center justify-between gap-2"
          style={{
            background: 'var(--card-face-bg)',
            animation: 'result-banner-in 220ms ease-out',
          }}
        >
          <span className="text-ui-sm font-semibold" style={{ color: 'var(--tile-text-dark)' }}>
            {RESULT_LABEL[result]}
          </span>
          <span className="text-ui-sm font-medium" style={{ color: 'var(--tile-text-dark)' }}>
            {result === 'push'
              ? 'Bet returned'
              : result === 'dealer-win'
                ? `-$${bet}`
                : `+$${payout(result, bet)}`}
          </span>
        </div>
      )}

      <div className="p-4 pb-8 flex flex-col gap-2">
        {phase === 'betting' && (
          <PrimaryButton id="deal" onClick={startHand} disabled={bankroll < BET_AMOUNT}>
            Deal (${BET_AMOUNT})
          </PrimaryButton>
        )}
        {phase === 'player-turn' && (
          <div className="flex gap-2">
            <PrimaryButton id="hit" onClick={handleHit}>
              Hit
            </PrimaryButton>
            <PrimaryButton id="stand" onClick={handleStand}>
              Stand
            </PrimaryButton>
          </div>
        )}
        {phase === 'resolved' && (
          <div className="flex gap-2">
            <PrimaryButton id="deal" onClick={startHand} disabled={bankroll < BET_AMOUNT}>
              Deal (${BET_AMOUNT})
            </PrimaryButton>
            <PrimaryButton
              id="exit-to-hub"
              variant="danger"
              onClick={() => navigateTo('intro-flow-hub-screen')}
            >
              Exit to Hub
            </PrimaryButton>
          </div>
        )}
      </div>
    </div>
  )
}

export const pageMeta: PageMeta = {
  label: 'Blackjack',
  desc: 'Classic blackjack against the dealer — soft/hard aces, dealer hits to 17, blackjack pays 3:2.',
  tags: ['type:card'],
}
