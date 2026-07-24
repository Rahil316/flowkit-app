import { defineFlow } from '@flowkit-core/config'

export default defineFlow({
  id: 'intro-flow',
  name: 'Intro Flow',
  description: 'Splash into welcome into the game hub.',
  homeScreen: 'intro-flow-hub-screen',

  steps: [
    { pageId: 'intro-flow-splash-screen', actionNote: 'Splash auto-advances' },
    { pageId: 'intro-flow-welcome-screen', on: 'play', actionNote: 'Taps Play' },
    { pageId: 'intro-flow-hub-screen', actionNote: 'Arrives at the game hub' },
  ],
})
