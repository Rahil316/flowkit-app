import { defineFlow } from '@flowkit-core/config'

export default defineFlow({
  id: 'journey-play-2048-to-a-win',
  name: 'Play 2048 to a Win',
  description: 'Open 2048 and slide toward the 2048 tile.',

  steps: [
    { pageId: 'intro-flow-hub-screen', on: 'game-2048', actionNote: 'Taps the 2048 card' },
    { pageId: '2048-flow-2048-game-screen', on: 'move-right', actionNote: 'Slides right to merge tiles' },
  ],
})
