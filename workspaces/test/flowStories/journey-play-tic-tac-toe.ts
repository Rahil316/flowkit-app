import { defineFlow } from '@flowkit-core/config'

export default defineFlow({
  id: 'journey-play-tic-tac-toe',
  name: 'Play Tic-Tac-Toe',
  description: 'From the hub, open Tic-Tac-Toe and play a full round to completion.',

  steps: [
    { pageId: 'intro-flow-hub-screen', on: 'game-tic-tac-toe', actionNote: 'Taps the Tic-Tac-Toe card' },
    { pageId: 'tic-tac-toe-flow-tic-tac-toe-game-screen', on: 'cell-4', actionNote: 'Places a mark on the center square' },
  ],
})
