import { defineConfig } from '@flowkit-core/config'

export default defineConfig({
  workspace: { name: 'test' },
  // Page loaded by default (cold load, device home button, reset-to-first)
  // when no flowStory is active. Falls back to the first declared page when unset.
  startPage: 'splash-screen',
  // Default device shell shown on load. Must match a DevicePreset.label from
  // src/shared/components/devices (e.g. "iPhone 16 Pro"). Falls back to the
  // platform default when unset or unrecognized.
  defaultDevice: 'Compact',
  // Default orientation on load. Ignored if the device doesn't support landscape.
  defaultOrientation: 'portrait',
  chapters: [
    'intro-flow',
    'tic-tac-toe-flow',
    'dice-flow',
    'blackjack-flow',
    '2048-flow',
    'memory-match-flow',
    'math-quiz-flow',
  ],
  pageOrder: {
    'intro-flow': ['splash-screen', 'welcome-screen', 'hub-screen'],
    'tic-tac-toe-flow': ['tic-tac-toe-how-to-play-screen', 'tic-tac-toe-game-screen'],
    'dice-flow': ['dice-how-to-play-screen', 'dice-game-screen'],
    'blackjack-flow': ['blackjack-how-to-play-screen', 'blackjack-game-screen'],
    '2048-flow': ['2048-how-to-play-screen', '2048-game-screen', '2048-high-scores-screen'],
    'memory-match-flow': [
      'memory-match-how-to-play-screen',
      'memory-match-game-screen',
      'memory-match-high-scores-screen',
    ],
    'math-quiz-flow': [
      'math-quiz-difficulty-screen',
      'math-quiz-game-screen',
      'math-quiz-how-to-play-screen',
    ],
  },
})
