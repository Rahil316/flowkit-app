import { defineFlow } from '@flowkit-core/config'

export default defineFlow({
  id: 'journey-place-a-bet-blackjack',
  name: 'Place a Bet in Blackjack',
  description: 'Open Blackjack, deal a hand, and see it through to a win or a loss.',

  simulator: {
    controls: [
      {
        label: 'Bankroll',
        path: 'blackjack.bankroll',
        type: 'count',
        min: 0,
        max: 5000,
        default: 500,
      },
      {
        label: 'Forced Dice Roll',
        path: 'dice.forcedRoll',
        type: 'select',
        options: ['none', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
        default: 'none',
      },
    ],
  },

  steps: [
    { pageId: 'intro-flow-hub-screen', on: 'game-blackjack', actionNote: 'Taps the Blackjack card' },
    {
      pageId: 'blackjack-flow-blackjack-game-screen',
      on: 'deal',
      actionNote: 'Places a bet and deals the hand',
      forks: [
        {
          label: 'Hand wins',
          steps: [
            {
              pageId: 'blackjack-flow-blackjack-game-screen',
              on: 'stand',
              actionNote: 'Stands and wins the hand',
              decisionNote: 'The dealer busts or the player out-values the dealer.',
            },
          ],
          mergesTo: 'next',
        },
        {
          label: 'Hand loses',
          steps: [
            {
              pageId: 'blackjack-flow-blackjack-game-screen',
              on: 'stand',
              actionNote: 'Stands and loses the hand',
              decisionNote: 'The player busts or the dealer out-values the player.',
            },
          ],
          mergesTo: 'next',
        },
      ],
    },
    { pageId: 'blackjack-flow-blackjack-game-screen', on: 'deal', actionNote: 'Hand settled — deals again' },
  ],
})
