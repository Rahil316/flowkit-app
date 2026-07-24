import { defineFlow } from '@flowkit-core/config'

export default defineFlow({
  id: 'journey-check-memory-high-score',
  name: 'Check High Score in Memory Match',
  description: 'Open Memory Match and view the best-moves/best-time high scores screen.',

  steps: [
    { pageId: 'intro-flow-hub-screen', on: 'game-memory-match', actionNote: 'Taps the Memory Match card' },
    { pageId: 'memory-match-flow-memory-match-game-screen', on: 'view-high-scores', actionNote: 'Opens the high scores screen' },
    { pageId: 'memory-match-flow-memory-match-high-scores-screen', actionNote: 'Reviews best moves and best time' },
  ],
})
