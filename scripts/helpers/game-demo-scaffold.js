// Single source of truth for the "Game Zone" demo content shipped by every
// scaffolder (repo mode's `flowkit nw:<name>`, `flowkit create:workspace`,
// `create-flowkit-app`, `create-flowkit-workspace`): a splash/welcome intro
// into a hub of 6 playable mini-games (Blackjack, Dice, Tic-Tac-Toe, 2048,
// Memory Match, Math Quiz). Ported verbatim from workspaces/test/ (the
// canonical, correctly-cased/composite-pageId copy — see workspaces/game-zone/
// for the older, now-stale FlowBook/FlowStories-cased copy with bare pageIds,
// kept only as an existing authored workspace, not a scaffold source).
//
// Screens use the repo-mode convention (useDb()/useAppNav() from
// @flowkit-shared/utils) rather than PageProps' injected onAction/db. This is
// intentional, not a shortcut: useDb()/useDashboard() work identically in
// flat/multi-workspace consumer mode too — flowkit/vite's `standalone` alias
// set (scripts/helpers/vite-plugin.js) resolves @flowkit-shared/* straight to
// the same engine source shipped inside node_modules/flowkit/src/, and the
// previous 5-screen onboarding demo (scaffold.js) already relied on exactly
// this for its Setup/Ready/Home/Detail screens. There is no capability gap
// between modes, only a topology difference (workspaces/<name>/ vs a single
// implicit workspace) — do not rewrite these screens to the onAction/db
// convention; that convention exists for authors who want a screen to also
// preview inertly outside any flow, which none of these game screens need to.
//
// If you add/remove a demo chapter or page here, this is genuinely the only
// place to change — scaffold.js and workspace-template.js both call
// gameDemoScaffold() directly instead of hand-porting content, so there is no
// second copy to keep in sync (unlike the old onboarding demo's two
// independent, already-drifted hand-ports).
import { FLOW_BOOK_DIRNAME, FLOW_STORIES_DIRNAME } from './config-filenames.js'

const OVERVIEW_MD = `# {{name}} — Project Overview

## What this is

An arcade demo: a splash/welcome intro into a hub of 6 fully-playable mini-games —
Blackjack, Dice, Tic-Tac-Toe, 2048, Memory Match, and Math Quiz. Navigation is
free/hub-and-spoke via \`useAppNav()\`, not flowStory-driven; flowStories layer small,
optional named journeys on top (see below). Game state (bankroll, high scores,
session tallies) persists to \`db\` at runtime via \`useDb()\`.

## File organization

\`\`\`
workspace.ts                 # chapters[], pageOrder{}, startPage: 'splash-screen'
flowStories/                 # defineFlow() files — one per named journey
flowBook/
  <chapter-name>/
    <page-name>/<PageName>.tsx   # default-exported component + pageMeta
lib/
  components/ui/              # shared, reused across every game screen
  game-logic/                 # pure logic, zero React — one file per game (+ deck.ts, shared)
  data/
    db.ts                    # mock db seeds — named exports become top-level db keys
    simulator.tsx            # always-visible simulator panel controls
  design-system/
    tokens.css               # additive CSS vars + keyframes, layered on platform tokens
  docs/overview.md            # this file
  assets/logo.svg              # workspace switcher-bar icon
\`\`\`

Each page lives in its own folder under its chapter (\`flowBook/<chapter>/<page>/\`),
one \`.tsx\` file per folder, matching the platform's own convention — this is
what lets \`flowkit check\`/\`plan:ls\` discover pages and flowStory \`pageId\`s
by folder name. Pages import shared code via the \`@workspace/lib/...\` alias,
never relative \`../../\` paths, and only ever import \`@flowkit/*\` (read-only
platform types) or plain React — \`db\`/\`navigateTo\` are pulled in via hooks
(\`useDb()\`, \`useAppNav()\`), not injected as props.

\`lib/game-logic/\` is kept free of any component/JSX so each game's rules can
be reasoned about (and in principle unit-tested) independently of how they're
rendered — a game page is mostly \`useState\` + calls into its matching
\`lib/game-logic/<game>.ts\` module, wired to shared UI from \`lib/components/ui/\`.

## Platform

- **Target OS:** iOS / Android
- **Primary device:** iPhone 16 Pro (393×852)
- **Form factor:** Phone-first

## Key chapters

| Chapter           | Pages                                                                                      | Purpose                                           |
| ------------------ | ------------------------------------------------------------------------------------------ | -------------------------------------------------- |
| intro-flow        | splash-screen → welcome-screen → hub-screen                                                | Splash intro into the game hub                    |
| tic-tac-toe-flow  | tic-tac-toe-how-to-play-screen, tic-tac-toe-game-screen                                    | 2-player pass-and-play tic-tac-toe                |
| dice-flow         | dice-how-to-play-screen, dice-game-screen                                                  | Simplified craps — come-out roll, point, resolve  |
| blackjack-flow    | blackjack-how-to-play-screen, blackjack-game-screen                                        | Blackjack vs. dealer — soft/hard aces, 3:2 payout |
| 2048-flow         | 2048-how-to-play-screen, 2048-game-screen, 2048-high-scores-screen                         | Slide-and-merge puzzle, best score persists       |
| memory-match-flow | memory-match-how-to-play-screen, memory-match-game-screen, memory-match-high-scores-screen | 4×4 pair-matching, best moves/time persist        |
| math-quiz-flow    | math-quiz-difficulty-screen, math-quiz-game-screen, math-quiz-how-to-play-screen           | Speed math with scaling difficulty and streaks    |

Hub navigation (\`hub-screen\`) links to each game directly — the chapters above
are organizational groupings of pages, not required playback paths.

## Named journeys (flowStories)

Small, optional journeys layered on top of the free-navigation pages above —
useful for guided demos/reviewers, never required for the app to function:

| FlowStory                          | Path                                                     |
| ---------------------------------- | ---------------------------------------------------------|
| \`intro-flow\`                      | splash → welcome → hub                                   |
| \`journey-play-tic-tac-toe\`        | hub → Tic-Tac-Toe → places a mark                        |
| \`journey-check-memory-high-score\` | hub → Memory Match → high scores screen                  |
| \`journey-play-2048-to-a-win\`      | hub → 2048 → slides a tile                               |
| \`journey-place-a-bet-blackjack\`   | hub → Blackjack → deal → forks on win/lose → deals again |

\`journey-place-a-bet-blackjack\` is the one flowStory with \`simulator.controls\`
(a bankroll \`count\` control, a \`dice.forcedRoll\` \`select\` control) and \`forks[]\`
branching on the hand's outcome — every other journey is a plain linear \`steps[]\`.

## Mock data

Seed data lives in \`lib/data/db.ts\`. Named exports become top-level \`db\` keys:
\`user\`, \`blackjack\` (bankroll), \`dice\` (bankroll, forcedRoll), \`ticTacToe\`
(sessionTally), \`mathQuiz\` (difficulty). \`twentyFortyEight.best\`,
\`memoryMatch.bestMoves\`/\`bestTimeMs\`, \`mathQuiz.score\`, and any \`highScores.*\`
path are deliberately **not** seeded — the 2048 and Memory Match high-scores
pages gate on a hand-rolled \`hasDotPath()\` check against those paths, so they
must stay absent until the player's first game writes them via \`db.update()\`.

Simulator controls for mutating data at runtime are in \`lib/data/simulator.tsx\`.

Pages read/write \`db\` via \`const db = useDb()\` (\`get\`/\`set\`/\`has\`/\`remove\`/
\`update\`/\`reset\`) from \`@flowkit-shared/utils\` — never raw \`updateDb\`.

## Game logic

Pure logic (zero React/JSX), one module per game, in \`lib/game-logic/\`:
\`deck.ts\` (shared: shuffle/deal/hand-value for Blackjack), \`blackjack.ts\`,
\`dice.ts\`, \`ticTacToe.ts\`, \`twentyFortyEight.ts\`, \`memoryMatch.ts\`, \`mathQuiz.ts\`.

## Design system

Tokens live in \`lib/design-system/tokens.css\` — additive on top of the
platform's \`bg-theme-*\`/\`text-theme-*\` vocabulary: card suits, felt green,
dice pips, the 2048 tile ramp, memory card back, plus the \`card-deal-in\` and
\`result-banner-in\` keyframes used by Blackjack's card and hand-result
animations.

Shared UI components in \`lib/components/ui/\` (10 total, reused by every game —
do not recreate a one-off version inline):

| Component          | Purpose                                                                                                     |
| ------------------ | ------------------------------------------------------------------------------------------------------------ |
| \`PrimaryButton\`    | Every CTA (Deal, Play Again, Confirm, Start Playing, Exit to Hub)                                           |
| \`IconButton\`       | Header back/utility buttons (back, how-to-play, high-scores)                                                |
| \`SectionHeader\`    | Consistent header bar for how-to-play/high-scores/difficulty screens                                        |
| \`GameCard\`         | Hub grid — one per game                                                                                     |
| \`Grid\`             | Generic \`columns\` grid — hub, Tic-Tac-Toe board, 2048 board                                                 |
| \`ScoreBadge\`       | Bankroll/score/streak/best displays across every game                                                       |
| \`GameOverModal\`    | End-state overlay (board stays visible behind it); optional \`primaryLabel\` override (2048's "Keep Playing") |
| \`PlayingCard\`      | Blackjack hands — flip animation (face-down→up) + staggered deal-in                                         |
| \`HowToPlayList\`    | Numbered rules list on every how-to-play screen                                                             |
| \`DifficultyPicker\` | Math Quiz's easy/medium/hard segmented control                                                              |

Blackjack is a deliberate exception to \`GameOverModal\`: per-hand outcomes show
an inline result banner (win/lose/push + payout) instead of a full-screen
modal, since a modal on every single hand was too interruptive for repeated
play — the end-of-hand controls are just "Deal (again)" or "Exit to Hub", no
separate confirmation screen.

## Scaffold commands

\`\`\`
flowkit create:page --chapter:<chapter> --name:<page>   # add a page
flowkit create:chapter --name:<chapter>              # add a chapter
flowkit create:component --name:<Name> --path:lib/components/ui
flowkit add:step --flowStory:<id> --page:<pageId> --action:"description"
\`\`\`
`

const TOKENS_CSS = `/* {{name}} — Design Tokens */
/* Additive layer on top of the platform's bg-theme-/text-theme- vocabulary.
   Tokens here cover things the platform doesn't already have: card suits,
   felt green, dice pips, the 2048 tile ramp, memory card backs. */
:root {
  /* Playing cards */
  --card-suit-red: #d92d2d;
  --card-suit-black: #1a1a1a;
  --card-back: #1e3a5f;
  --card-face-bg: #fdfdfb;

  /* Game table / felt */
  --table-felt: #0b6e4f;
  --table-felt-dark: #08543c;

  /* Dice */
  --dice-face: #f5f5f0;
  --dice-pip: #1a1a1a;

  /* 2048 tile value ramp */
  --tile-2: #eee4da;
  --tile-4: #ede0c8;
  --tile-8: #f2b179;
  --tile-16: #f59563;
  --tile-32: #f67c5f;
  --tile-64: #f65e3b;
  --tile-128: #edcf72;
  --tile-256: #edcc61;
  --tile-512: #edc850;
  --tile-1024: #edc53f;
  --tile-2048: #edc22e;
  --tile-super: #3c3a32;
  --tile-text-light: #f9f6f2;
  --tile-text-dark: #776e65;

  /* Memory match */
  --memory-card-back: #4a3f8f;
}

/* Card deal-in — used by PlayingCard when a new card enters a hand. */
@keyframes card-deal-in {
  from {
    opacity: 0;
    transform: translateY(-16px) scale(0.85);
  }
  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

/* Inline hand-result banner — used by Blackjack at the end of a round. */
@keyframes result-banner-in {
  from {
    opacity: 0;
    transform: translateY(6px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
`

const DB_TS = `// Workspace mock database — all runtime state lives here.
// Named exports are loaded into the platform db object on startup.
// Reset via the simulator's "Reset Database" button.

export const user = {
  id: 'usr_001',
  name: 'Demo Player',
  email: 'demo@example.com',
  plan: 'Free',
}

export const blackjack = {
  bankroll: 500,
}

export const dice = {
  bankroll: 500,
  forcedRoll: 'none',
}

export const ticTacToe = {
  sessionTally: { x: 0, o: 0, draws: 0 },
}

export const mathQuiz = {
  difficulty: 'easy',
}

// twentyFortyEight.best, memoryMatch.bestMoves/bestTimeMs, and mathQuiz.score
// are intentionally NOT seeded here — canEnter guards on the 2048 and Memory
// Match high-scores screens check db.has('highScores.twentyFortyEight') /
// db.has('highScores.memoryMatch.bestMoves'); those paths must be absent
// until the player's first game writes them via db.update().
`

const SIMULATOR_TSX = `import {
  ControlAccordion,
  SimAction,
  SimControl,
  SimSelect,
} from '@flowkit-features/simulator/controls'

export default function WorkspaceSimulatorControls() {
  return (
    <>
      <ControlAccordion label="Blackjack" defaultOpen>
        <SimControl label="Bankroll" bind="db.blackjack.bankroll" />
      </ControlAccordion>

      <ControlAccordion label="Dice">
        <SimControl label="Bankroll" bind="db.dice.bankroll" />
        <SimSelect
          label="Forced roll"
          bind="db.dice.forcedRoll"
          options={['none', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12']}
        />
      </ControlAccordion>

      <ControlAccordion label="Tic-Tac-Toe">
        <SimControl label="Session tally" bind="db.ticTacToe.sessionTally" />
      </ControlAccordion>

      <ControlAccordion label="Math Quiz">
        <SimControl label="Difficulty" bind="db.mathQuiz.difficulty" options={['easy', 'medium', 'hard']} />
      </ControlAccordion>

      <ControlAccordion label="Data">
        <SimAction label="Reset Database" icon="Trash2" badgeColor="red" onClick={ctx => ctx.resetDb()} />
      </ControlAccordion>
    </>
  )
}
`

function workspaceConfig(name, importLine) {
  return `${importLine}

export default defineConfig({
  workspace: { name: '${name}' },
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
`
}

const FLOW_STORY_FILES = {
  'intro-flow.ts': `import { defineFlow } from '@flowkit-core/config'

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
`,
  'journey-play-tic-tac-toe.ts': `import { defineFlow } from '@flowkit-core/config'

export default defineFlow({
  id: 'journey-play-tic-tac-toe',
  name: 'Play Tic-Tac-Toe',
  description: 'From the hub, open Tic-Tac-Toe and play a full round to completion.',

  steps: [
    { pageId: 'intro-flow-hub-screen', on: 'game-tic-tac-toe', actionNote: 'Taps the Tic-Tac-Toe card' },
    {
      pageId: 'tic-tac-toe-flow-tic-tac-toe-game-screen',
      on: 'cell-4',
      actionNote: 'Places a mark on the center square',
    },
  ],
})
`,
  'journey-play-2048-to-a-win.ts': `import { defineFlow } from '@flowkit-core/config'

export default defineFlow({
  id: 'journey-play-2048-to-a-win',
  name: 'Play 2048 to a Win',
  description: 'Open 2048 and slide toward the 2048 tile.',

  steps: [
    { pageId: 'intro-flow-hub-screen', on: 'game-2048', actionNote: 'Taps the 2048 card' },
    { pageId: '2048-flow-2048-game-screen', on: 'move-right', actionNote: 'Slides right to merge tiles' },
  ],
})
`,
  'journey-check-memory-high-score.ts': `import { defineFlow } from '@flowkit-core/config'

export default defineFlow({
  id: 'journey-check-memory-high-score',
  name: 'Check High Score in Memory Match',
  description: 'Open Memory Match and view the best-moves/best-time high scores screen.',

  steps: [
    { pageId: 'intro-flow-hub-screen', on: 'game-memory-match', actionNote: 'Taps the Memory Match card' },
    {
      pageId: 'memory-match-flow-memory-match-game-screen',
      on: 'view-high-scores',
      actionNote: 'Opens the high scores screen',
    },
    {
      pageId: 'memory-match-flow-memory-match-high-scores-screen',
      actionNote: 'Reviews best moves and best time',
    },
  ],
})
`,
  'journey-place-a-bet-blackjack.ts': `import { defineFlow } from '@flowkit-core/config'

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
    {
      pageId: 'blackjack-flow-blackjack-game-screen',
      on: 'deal',
      actionNote: 'Hand settled — deals again',
    },
  ],
})
`,
}

// ── Game logic (pure, zero React) ───────────────────────────────────────────

const GAME_LOGIC_FILES = {
  'deck.ts': `export type Suit = '♠' | '♥' | '♦' | '♣'
export type Rank = 'A' | '2' | '3' | '4' | '5' | '6' | '7' | '8' | '9' | '10' | 'J' | 'Q' | 'K'

export interface Card {
  rank: Rank
  suit: Suit
}

const SUITS: Suit[] = ['♠', '♥', '♦', '♣']
const RANKS: Rank[] = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']

export function freshDeck(): Card[] {
  const deck: Card[] = []
  for (const suit of SUITS) {
    for (const rank of RANKS) {
      deck.push({ rank, suit })
    }
  }
  return deck
}

export function shuffle(deck: Card[]): Card[] {
  const shuffled = [...deck]
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
  }
  return shuffled
}

/** Draws \`count\` cards off the top of \`deck\`. Returns the drawn cards and the remaining deck. */
export function deal(deck: Card[], count: number): { drawn: Card[]; remaining: Card[] } {
  return { drawn: deck.slice(0, count), remaining: deck.slice(count) }
}

/** Best blackjack value for a hand, treating aces as 11 or 1 (soft/hard). */
export function handValue(hand: Card[]): { value: number; soft: boolean } {
  let value = 0
  let aces = 0
  for (const card of hand) {
    if (card.rank === 'A') {
      aces += 1
      value += 11
    } else if (card.rank === 'J' || card.rank === 'Q' || card.rank === 'K') {
      value += 10
    } else {
      value += Number(card.rank)
    }
  }
  let soft = aces > 0
  while (value > 21 && aces > 0) {
    value -= 10
    aces -= 1
  }
  if (aces === 0) soft = false
  return { value, soft }
}

export function isBlackjack(hand: Card[]): boolean {
  return hand.length === 2 && handValue(hand).value === 21
}

export function isBust(hand: Card[]): boolean {
  return handValue(hand).value > 21
}
`,
  'blackjack.ts': `import { type Card, handValue, isBust } from './deck'

export type BlackjackResult = 'player-blackjack' | 'player-win' | 'dealer-win' | 'push' | null

/** Dealer hits until a hard 17+ (or any soft total >= 17 — dealer never hits a soft 17+). */
export function dealerShouldHit(hand: Card[]): boolean {
  return handValue(hand).value < 17
}

/** Resolves a finished hand (both player and dealer done acting). */
export function resolveHand(playerHand: Card[], dealerHand: Card[]): BlackjackResult {
  const playerBust = isBust(playerHand)
  const dealerBust = isBust(dealerHand)
  const playerBJ = playerHand.length === 2 && handValue(playerHand).value === 21
  const dealerBJ = dealerHand.length === 2 && handValue(dealerHand).value === 21

  if (playerBust) return 'dealer-win'
  if (dealerBust) return 'player-win'
  if (playerBJ && dealerBJ) return 'push'
  if (playerBJ) return 'player-blackjack'
  if (dealerBJ) return 'dealer-win'

  const playerValue = handValue(playerHand).value
  const dealerValue = handValue(dealerHand).value
  if (playerValue > dealerValue) return 'player-win'
  if (playerValue < dealerValue) return 'dealer-win'
  return 'push'
}

/** Net bankroll delta for a resolved hand given the bet — blackjack pays 3:2, push returns the bet. */
export function payout(result: BlackjackResult, bet: number): number {
  switch (result) {
    case 'player-blackjack':
      return Math.floor(bet * 1.5)
    case 'player-win':
      return bet
    case 'dealer-win':
      return -bet
    case 'push':
    default:
      return 0
  }
}
`,
  'dice.ts': `export type DicePhase = 'come-out' | 'point' | 'resolved'
export type DiceResult = 'win' | 'lose' | null

export function rollDie(): number {
  return Math.floor(Math.random() * 6) + 1
}

export function rollTwo(forced?: number): [number, number, number] {
  if (forced !== undefined && forced >= 2 && forced <= 12) {
    return splitTotal(forced)
  }
  const a = rollDie()
  const b = rollDie()
  return [a, b, a + b]
}

// Splits a forced total into two plausible dice faces (1-6 each).
function splitTotal(total: number): [number, number, number] {
  const lo = Math.max(1, total - 6)
  const hi = Math.min(6, total - 1)
  const first = lo + Math.floor(Math.random() * (hi - lo + 1))
  return [first, total - first, total]
}

/** Come-out roll resolution: 7/11 = instant win, 2/3/12 = instant loss, else establish a point. */
export function resolveComeOut(total: number): { result: DiceResult; establishesPoint: boolean } {
  if (total === 7 || total === 11) return { result: 'win', establishesPoint: false }
  if (total === 2 || total === 3 || total === 12) return { result: 'lose', establishesPoint: false }
  return { result: null, establishesPoint: true }
}

/** Point-phase resolution: matching the point wins, a 7 ("seven-out") loses, else re-roll. */
export function resolvePoint(total: number, point: number): DiceResult {
  if (total === point) return 'win'
  if (total === 7) return 'lose'
  return null
}
`,
  'ticTacToe.ts': `export type Player = 'X' | 'O'
export type Cell = Player | null
export type Board = Cell[]

export const WIN_LINES: [number, number, number][] = [
  [0, 1, 2],
  [3, 4, 5],
  [6, 7, 8], // rows
  [0, 3, 6],
  [1, 4, 7],
  [2, 5, 8], // cols
  [0, 4, 8],
  [2, 4, 6], // diagonals
]

export function emptyBoard(): Board {
  return Array(9).fill(null)
}

export function getWinner(board: Board): Player | null {
  for (const [a, b, c] of WIN_LINES) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a]
    }
  }
  return null
}

export function isDraw(board: Board): boolean {
  return board.every(cell => cell !== null) && getWinner(board) === null
}
`,
  'twentyFortyEight.ts': `export type Grid = number[][] // 0 = empty
export type Direction = 'up' | 'down' | 'left' | 'right'

const SIZE = 4

export function emptyGrid(): Grid {
  return Array.from({ length: SIZE }, () => Array(SIZE).fill(0))
}

function emptyCells(grid: Grid): [number, number][] {
  const cells: [number, number][] = []
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      if (grid[r][c] === 0) cells.push([r, c])
    }
  }
  return cells
}

/** Spawns a 2 (90%) or 4 (10%) in a random empty cell. Returns a new grid. */
export function spawnTile(grid: Grid): Grid {
  const cells = emptyCells(grid)
  if (cells.length === 0) return grid
  const [r, c] = cells[Math.floor(Math.random() * cells.length)]
  const next = grid.map(row => [...row])
  next[r][c] = Math.random() < 0.9 ? 2 : 4
  return next
}

function rotateCW(grid: Grid): Grid {
  const next = emptyGrid()
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      next[c][SIZE - 1 - r] = grid[r][c]
    }
  }
  return next
}

function rotateCCW(grid: Grid): Grid {
  const next = emptyGrid()
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      next[SIZE - 1 - c][r] = grid[r][c]
    }
  }
  return next
}

/** Slides+merges one row toward index 0 (left). Each tile merges at most once. */
function slideRowLeft(row: number[]): { row: number[]; gained: number } {
  const values = row.filter(v => v !== 0)
  const result: number[] = []
  let gained = 0
  for (let i = 0; i < values.length; i++) {
    if (values[i] === values[i + 1]) {
      const merged = values[i] * 2
      result.push(merged)
      gained += merged
      i++
    } else {
      result.push(values[i])
    }
  }
  while (result.length < SIZE) result.push(0)
  return { row: result, gained }
}

/**
 * Applies a move in the given direction. "up"/"down" rotate the grid so the
 * target direction becomes "slide left" along rows, slide, then rotate back —
 * up rotates CCW (top edge becomes the left edge), down rotates CW.
 */
export function move(
  grid: Grid,
  direction: Direction
): { grid: Grid; gained: number; moved: boolean } {
  let rows: number[][]
  if (direction === 'left') {
    rows = grid
  } else if (direction === 'right') {
    rows = grid.map(row => [...row].reverse())
  } else if (direction === 'up') {
    rows = rotateCCW(grid)
  } else {
    rows = rotateCW(grid)
  }

  let gained = 0
  const slidRows = rows.map(row => {
    const { row: newRow, gained: rowGained } = slideRowLeft(row)
    gained += rowGained
    return newRow
  })

  let result: Grid
  if (direction === 'left') {
    result = slidRows
  } else if (direction === 'right') {
    result = slidRows.map(row => [...row].reverse())
  } else if (direction === 'up') {
    result = rotateCW(slidRows)
  } else {
    result = rotateCCW(slidRows)
  }

  const moved = result.some((row, r) => row.some((v, c) => v !== grid[r][c]))
  return { grid: result, gained, moved }
}

export function hasWon(grid: Grid): boolean {
  return grid.some(row => row.some(v => v >= 2048))
}

export function hasMovesLeft(grid: Grid): boolean {
  if (emptyCells(grid).length > 0) return true
  for (let r = 0; r < SIZE; r++) {
    for (let c = 0; c < SIZE; c++) {
      const v = grid[r][c]
      if (c + 1 < SIZE && grid[r][c + 1] === v) return true
      if (r + 1 < SIZE && grid[r + 1][c] === v) return true
    }
  }
  return false
}
`,
  'memoryMatch.ts': `export interface MemoryCard {
  id: number
  symbol: string
  matched: boolean
}

const SYMBOLS = ['🍎', '🍋', '🍇', '🍉', '🍓', '🍒', '🍑', '🥝']

/** 4x4 board: 8 symbol pairs, shuffled. */
export function newBoard(): MemoryCard[] {
  const pairs = SYMBOLS.flatMap((symbol, i) => [
    { id: i * 2, symbol, matched: false },
    { id: i * 2 + 1, symbol, matched: false },
  ])
  return shuffle(pairs)
}

function shuffle<T>(items: T[]): T[] {
  const result = [...items]
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[result[i], result[j]] = [result[j], result[i]]
  }
  return result
}

export function isMatch(cards: MemoryCard[], a: number, b: number): boolean {
  return cards[a].symbol === cards[b].symbol
}

export function isComplete(cards: MemoryCard[]): boolean {
  return cards.every(c => c.matched)
}
`,
  'mathQuiz.ts': `export type Difficulty = 'easy' | 'medium' | 'hard'
export type Operator = '+' | '-' | '×' | '÷'

export interface Equation {
  text: string
  correctAnswer: number
}

const OPERATORS_BY_DIFFICULTY: Record<Difficulty, Operator[]> = {
  easy: ['+', '-'],
  medium: ['+', '-', '×'],
  hard: ['+', '-', '×', '÷'],
}

const OPERAND_COUNT: Record<Difficulty, number> = {
  easy: 1,
  medium: 2,
  hard: 3,
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min
}

function applyOp(a: number, op: Operator, b: number): number {
  switch (op) {
    case '+':
      return a + b
    case '-':
      return a - b
    case '×':
      return a * b
    case '÷':
      return a / b
  }
}

/** Generates an equation whose length/operator mix scales with difficulty. */
export function generateEquation(difficulty: Difficulty): Equation {
  const operatorCount = OPERAND_COUNT[difficulty]
  const availableOps = OPERATORS_BY_DIFFICULTY[difficulty]
  const maxOperand = difficulty === 'easy' ? 12 : difficulty === 'medium' ? 15 : 20

  let value = randomInt(2, maxOperand)
  let text = String(value)

  for (let i = 0; i < operatorCount; i++) {
    const op = availableOps[randomInt(0, availableOps.length - 1)]
    let operand = randomInt(2, maxOperand)

    // Clean division only: pick an operand that evenly divides the running value.
    if (op === '÷') {
      const divisors = divisorsOf(value)
      if (divisors.length === 0) {
        // no clean divisor available — fall back to addition for this step
        text += \` + \${operand}\`
        value += operand
        continue
      }
      operand = divisors[randomInt(0, divisors.length - 1)]
    }

    text += \` \${op} \${operand}\`
    value = applyOp(value, op, operand)
  }

  return { text, correctAnswer: value }
}

function divisorsOf(n: number): number[] {
  const divisors: number[] = []
  for (let d = 2; d <= Math.abs(n); d++) {
    if (n % d === 0) divisors.push(d)
  }
  return divisors
}

/**
 * Generates \`count\` wrong answers as round(correct * (1 + offsetPct)) for
 * varied offsets, with a dedupe/collision guard (reject a candidate equal to
 * the correct answer or an already-chosen wrong answer, retry with a new
 * offset) and a zero-guard (percentage offsets degenerate to 0 when
 * correctAnswer === 0 — fall back to fixed additive offsets in that case).
 */
export function generateWrongAnswers(correctAnswer: number, count: number): number[] {
  const wrongAnswers = new Set<number>()
  const percentOffsets = [-0.5, -0.3, -0.15, 0.15, 0.3, 0.5, 0.75, -0.75]
  // Additive fallback — needed whenever correctAnswer is small enough (including
  // 0) that percentage offsets round back to the same value or collide with
  // each other, not just the exact correctAnswer === 0 case.
  const additiveOffsets = [-3, -2, -1, 1, 2, 3, 4, -4, 5, -5, 6, -6]

  let percentIndex = 0
  while (wrongAnswers.size < count && percentIndex < percentOffsets.length) {
    const candidate = Math.round(correctAnswer * (1 + percentOffsets[percentIndex]))
    percentIndex++
    if (candidate === correctAnswer || wrongAnswers.has(candidate)) continue
    wrongAnswers.add(candidate)
  }

  let additiveIndex = 0
  while (wrongAnswers.size < count && additiveIndex < additiveOffsets.length) {
    const candidate = correctAnswer + additiveOffsets[additiveIndex]
    additiveIndex++
    if (candidate === correctAnswer || wrongAnswers.has(candidate)) continue
    wrongAnswers.add(candidate)
  }

  return [...wrongAnswers]
}

/** Full set of options (correct + wrong answers) in randomized order. */
export function generateOptions(correctAnswer: number): number[] {
  const wrong = generateWrongAnswers(correctAnswer, 3)
  const options = [correctAnswer, ...wrong]
  for (let i = options.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[options[i], options[j]] = [options[j], options[i]]
  }
  return options
}
`,
}

// ── Shared UI components ────────────────────────────────────────────────────

const COMPONENT_FILES = {
  'PrimaryButton.tsx': `import { cn } from '@flowkit-kit/lib/utils'
import type { ButtonHTMLAttributes } from 'react'

interface PrimaryButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'danger'
}

export default function PrimaryButton({
  variant = 'default',
  className,
  children,
  ...props
}: PrimaryButtonProps) {
  return (
    <button
      className={cn(
        'w-full px-3 py-2.5 rounded-md text-ui-sm font-medium transition-colors duration-150',
        variant === 'default' && 'bg-theme-blue-dim text-theme-blue',
        variant === 'danger' && 'bg-theme-red-dim text-theme-red',
        'disabled:opacity-50 disabled:pointer-events-none',
        className
      )}
      {...props}
    >
      {children}
    </button>
  )
}
`,
  'IconButton.tsx': `import { cn } from '@flowkit-kit/lib/utils'
import type { ButtonHTMLAttributes, ReactNode } from 'react'

interface IconButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: ReactNode
  label: string
}

export default function IconButton({ icon, label, className, ...props }: IconButtonProps) {
  return (
    <button
      aria-label={label}
      className={cn(
        'size-8 rounded-md flex items-center justify-center text-theme-text-secondary',
        'hover:bg-theme-hover transition-colors duration-120',
        className
      )}
      {...props}
    >
      {icon}
    </button>
  )
}
`,
  'SectionHeader.tsx': `import IconButton from './IconButton'

interface SectionHeaderProps {
  title: string
  onBack?: () => void
  backId?: string
}

export default function SectionHeader({ title, onBack, backId }: SectionHeaderProps) {
  return (
    <div className="flex items-center gap-2 px-4 h-12 border-b border-theme-border-subtle shrink-0">
      {onBack && (
        <IconButton
          id={backId}
          icon={<span className="text-ui-md">‹</span>}
          label="Back"
          onClick={onBack}
        />
      )}
      <span className="text-ui-md font-medium text-theme-text-primary">{title}</span>
    </div>
  )
}
`,
  'GameCard.tsx': `interface GameCardProps {
  id?: string
  title: string
  icon: string
  blurb: string
  onClick?: () => void
}

export default function GameCard({ id, title, icon, blurb, onClick }: GameCardProps) {
  return (
    <button
      id={id}
      onClick={onClick}
      className="flex flex-col items-start gap-1.5 p-3 rounded-[10px] bg-theme-surface shadow-theme-card text-left hover:bg-theme-hover transition-colors duration-150 w-full min-h-full"
    >
      <span className="text-2xl">{icon}</span>
      <span className="text-ui-sm font-semibold text-theme-text-primary">{title}</span>
      <span className="text-ui-xs text-theme-text-muted">{blurb}</span>
    </button>
  )
}
`,
  'Grid.tsx': `import { cn } from '@flowkit-kit/lib/utils'
import type { ReactNode } from 'react'

interface GridProps<T> {
  items: T[]
  columns: number
  renderItem: (item: T, index: number) => ReactNode
  gap?: string
  className?: string
}

export default function Grid<T>({
  items,
  columns,
  renderItem,
  gap = 'gap-2',
  className,
}: GridProps<T>) {
  return (
    <div
      className={cn('grid', gap, className)}
      style={{ gridTemplateColumns: \`repeat(\${columns}, minmax(0, 1fr))\` }}
    >
      {items.map((item, index) => (
        <div key={index}>{renderItem(item, index)}</div>
      ))}
    </div>
  )
}
`,
  'ScoreBadge.tsx': `import { cn } from '@flowkit-kit/lib/utils'

interface ScoreBadgeProps {
  label: string
  value: string | number
  tone?: 'default' | 'green' | 'red' | 'amber'
}

const TONE_CLASSES: Record<NonNullable<ScoreBadgeProps['tone']>, string> = {
  default: 'text-theme-text-primary',
  green: 'text-theme-green',
  red: 'text-theme-red',
  amber: 'text-theme-amber',
}

export default function ScoreBadge({ label, value, tone = 'default' }: ScoreBadgeProps) {
  return (
    <div className="flex flex-col items-center px-2 py-1 rounded-md bg-theme-surface">
      <span className="text-ui-2xs uppercase tracking-[0.04em] text-theme-text-muted">{label}</span>
      <span className={cn('text-ui-md font-bold', TONE_CLASSES[tone])}>{value}</span>
    </div>
  )
}
`,
  'GameOverModal.tsx': `import { Z } from '@flowkit-shared/constants/zIndex'

import PrimaryButton from './PrimaryButton'

interface GameOverModalProps {
  open: boolean
  title: string
  message: string
  onPlayAgain?: () => void
  /** Label for the primary action button. Default: "Play Again". */
  primaryLabel?: string
  onBackToHub?: () => void
}

export default function GameOverModal({
  open,
  title,
  message,
  onPlayAgain,
  primaryLabel = 'Play Again',
  onBackToHub,
}: GameOverModalProps) {
  if (!open) return null

  return (
    <div
      className="absolute inset-0 flex items-center justify-center bg-black/50 p-4"
      style={{ zIndex: Z.modal }}
    >
      <div className="w-full max-w-xs rounded-xl bg-theme-elevated shadow-theme-float p-4 flex flex-col gap-3">
        <h2 className="text-ui-xl font-bold text-theme-text-primary text-center">{title}</h2>
        <p className="text-ui-sm text-theme-text-secondary text-center">{message}</p>
        <div className="flex flex-col gap-2 mt-1">
          {onPlayAgain && (
            <PrimaryButton id="play-again" onClick={onPlayAgain}>
              {primaryLabel}
            </PrimaryButton>
          )}
          {onBackToHub && (
            <PrimaryButton id="back-to-hub" variant="danger" onClick={onBackToHub}>
              Back to Hub
            </PrimaryButton>
          )}
        </div>
      </div>
    </div>
  )
}
`,
  'PlayingCard.tsx': `import { cn } from '@flowkit-kit/lib/utils'

export interface Card {
  rank: string
  suit: '♠' | '♥' | '♦' | '♣'
}

interface PlayingCardProps {
  card: Card
  faceDown?: boolean
  /** Staggers the deal-in animation — index of this card within its hand. */
  dealIndex?: number
}

export default function PlayingCard({ card, faceDown, dealIndex = 0 }: PlayingCardProps) {
  const isRed = card.suit === '♥' || card.suit === '♦'
  const dealStyle = {
    animation: 'card-deal-in 220ms ease-out backwards',
    animationDelay: \`\${dealIndex * 90}ms\`,
  }

  return (
    <div className="w-12 h-16 perspective-[400px]" style={dealStyle}>
      <div
        className="relative w-full h-full transition-transform duration-300 transform-3d"
        style={{ transform: faceDown ? 'rotateY(0deg)' : 'rotateY(180deg)' }}
      >
        <div
          className="absolute inset-0 rounded-md shadow-theme-card backface-hidden"
          style={{ background: 'var(--card-back)' }}
        />
        <div
          className="absolute inset-0 rounded-md shadow-theme-card flex flex-col items-center justify-center gap-0.5 backface-hidden"
          style={{ background: 'var(--card-face-bg)', transform: 'rotateY(180deg)' }}
        >
          <span
            className={cn('text-ui-sm font-bold')}
            style={{ color: isRed ? 'var(--card-suit-red)' : 'var(--card-suit-black)' }}
          >
            {card.rank}
          </span>
          <span style={{ color: isRed ? 'var(--card-suit-red)' : 'var(--card-suit-black)' }}>
            {card.suit}
          </span>
        </div>
      </div>
    </div>
  )
}
`,
  'HowToPlayList.tsx': `interface HowToPlayListProps {
  steps: string[]
}

export default function HowToPlayList({ steps }: HowToPlayListProps) {
  return (
    <ol className="flex flex-col gap-2">
      {steps.map((step, index) => (
        <li key={index} className="flex gap-2 items-start">
          <span className="shrink-0 size-5 rounded-full bg-theme-blue-dim text-theme-blue text-ui-2xs font-bold flex items-center justify-center">
            {index + 1}
          </span>
          <span className="text-ui-sm text-theme-text-secondary">{step}</span>
        </li>
      ))}
    </ol>
  )
}
`,
  'DifficultyPicker.tsx': `import { cn } from '@flowkit-kit/lib/utils'

export type Difficulty = 'easy' | 'medium' | 'hard'

const OPTIONS: { value: Difficulty; label: string }[] = [
  { value: 'easy', label: 'Easy' },
  { value: 'medium', label: 'Medium' },
  { value: 'hard', label: 'Hard' },
]

interface DifficultyPickerProps {
  value: Difficulty
  onSelect?: (value: Difficulty) => void
}

export default function DifficultyPicker({ value, onSelect }: DifficultyPickerProps) {
  return (
    <div className="flex rounded-md bg-theme-surface p-0.5 gap-0.5">
      {OPTIONS.map(opt => (
        <button
          key={opt.value}
          id={\`difficulty-\${opt.value}\`}
          onClick={() => onSelect?.(opt.value)}
          className={cn(
            'flex-1 px-2 py-1 rounded-md text-ui-xs font-medium transition-colors duration-150',
            value === opt.value
              ? 'bg-theme-blue-dim text-theme-blue'
              : 'text-theme-text-secondary hover:bg-theme-hover'
          )}
        >
          {opt.label}
        </button>
      ))}
    </div>
  )
}
`,
}

// ── Pages (repo-mode convention: useAppNav()/useDb() from @flowkit-shared/utils) ──

const PAGE_FILES = {
  'intro-flow/splash-screen/SplashScreen.tsx': `import type { PageMeta } from '@flowkit/types'
import { useAppNav } from '@flowkit-shared/utils'
import { useEffect } from 'react'

export default function SplashScreen() {
  const { navigateTo } = useAppNav()

  useEffect(() => {
    const timer = setTimeout(() => navigateTo('welcome-screen'), 1400)
    return () => clearTimeout(timer)
  }, [navigateTo])

  return (
    <div
      className="flex flex-col h-full items-center justify-center gap-4"
      style={{ background: 'var(--table-felt-dark)' }}
    >
      <span className="text-5xl">🕹️</span>
      <h1 className="text-ui-xl font-bold" style={{ color: 'var(--tile-text-light)' }}>
        Game Zone
      </h1>
    </div>
  )
}

export const pageMeta: PageMeta = {
  label: 'Splash Screen',
  desc: 'Auto-advancing intro splash — arcade logo, no interaction required.',
  isStandalone: true,
}
`,
  'intro-flow/welcome-screen/WelcomeScreen.tsx': `import type { PageMeta } from '@flowkit/types'
import { useAppNav } from '@flowkit-shared/utils'
import PrimaryButton from '@workspace/lib/components/ui/PrimaryButton'

export default function WelcomeScreen() {
  const { navigateTo } = useAppNav()

  return (
    <div className="flex flex-col h-full bg-theme-base">
      <div className="flex flex-col items-center justify-center flex-1 gap-4 p-6">
        <div className="size-16 rounded-full bg-theme-blue-dim flex items-center justify-center">
          <span className="text-2xl">🎮</span>
        </div>
        <h1 className="text-ui-xl font-bold text-theme-text-primary text-center">
          Welcome to Game Zone
        </h1>
        <p className="text-ui-sm text-theme-text-secondary text-center max-w-xs">
          Six mini-games, one hub. Blackjack, Dice, Tic-Tac-Toe, 2048, Memory Match, and Math Quiz —
          pick a game and play.
        </p>
      </div>
      <div className="p-4 pb-8">
        <PrimaryButton id="play" onClick={() => navigateTo('hub-screen')}>
          Play
        </PrimaryButton>
      </div>
    </div>
  )
}

export const pageMeta: PageMeta = {
  label: 'Welcome Screen',
  desc: 'Entry point — introduces the arcade and prompts the player to enter the hub.',
}
`,
  'intro-flow/hub-screen/HubScreen.tsx': `import type { PageMeta } from '@flowkit/types'
import { useAppNav } from '@flowkit-shared/utils'
import GameCard from '@workspace/lib/components/ui/GameCard'
import Grid from '@workspace/lib/components/ui/Grid'

interface GameEntry {
  id: string
  title: string
  icon: string
  blurb: string
  pageId: string
}

const GAMES: GameEntry[] = [
  {
    id: 'game-blackjack',
    title: 'Blackjack',
    icon: '🃏',
    blurb: 'Beat the dealer to 21',
    pageId: 'blackjack-game-screen',
  },
  {
    id: 'game-dice',
    title: 'Dice',
    icon: '🎲',
    blurb: 'Roll for the point',
    pageId: 'dice-game-screen',
  },
  {
    id: 'game-tic-tac-toe',
    title: 'Tic-Tac-Toe',
    icon: '⭕',
    blurb: '2-player pass and play',
    pageId: 'tic-tac-toe-game-screen',
  },
  {
    id: 'game-2048',
    title: '2048',
    icon: '🔢',
    blurb: 'Slide to the target tile',
    pageId: '2048-game-screen',
  },
  {
    id: 'game-memory-match',
    title: 'Memory Match',
    icon: '🧠',
    blurb: 'Find every pair',
    pageId: 'memory-match-game-screen',
  },
  {
    id: 'game-math-quiz',
    title: 'Math Quiz',
    icon: '➗',
    blurb: 'Beat the clock on speed math',
    pageId: 'math-quiz-difficulty-screen',
  },
]

export default function HubScreen() {
  const { navigateTo } = useAppNav()

  return (
    <div className="flex flex-col h-full bg-theme-base">
      <div className="flex items-center px-4 h-12 border-b border-theme-border-subtle shrink-0">
        <span className="text-ui-md font-medium text-theme-text-primary">Game Zone</span>
      </div>
      <div className="flex-1 overflow-y-auto p-4">
        <Grid
          items={GAMES}
          columns={2}
          renderItem={game => (
            <GameCard
              id={game.id}
              title={game.title}
              icon={game.icon}
              blurb={game.blurb}
              onClick={() => navigateTo(game.pageId)}
            />
          )}
        />
      </div>
    </div>
  )
}

export const pageMeta: PageMeta = {
  label: 'Hub Screen',
  desc: 'Grid of all 6 games — free navigation via useAppNav(), no flowStory required.',
}
`,
  'tic-tac-toe-flow/tic-tac-toe-how-to-play-screen/TicTacToeHowToPlayScreen.tsx': `import type { PageMeta } from '@flowkit/types'
import { useAppNav } from '@flowkit-shared/utils'
import HowToPlayList from '@workspace/lib/components/ui/HowToPlayList'
import PrimaryButton from '@workspace/lib/components/ui/PrimaryButton'
import SectionHeader from '@workspace/lib/components/ui/SectionHeader'

const STEPS = [
  'Players take turns as X and O, X goes first.',
  'Tap an empty square to place your mark.',
  'Get three of your marks in a row — across, down, or diagonal — to win.',
  'If all nine squares fill with no winner, the round is a draw.',
]

export default function TicTacToeHowToPlayScreen() {
  const { navigateTo } = useAppNav()

  return (
    <div className="flex flex-col h-full bg-theme-base">
      <SectionHeader
        title="How to Play"
        onBack={() => navigateTo('tic-tac-toe-game-screen')}
        backId="back"
      />
      <div className="flex-1 overflow-y-auto p-4">
        <HowToPlayList steps={STEPS} />
      </div>
      <div className="p-4 pb-8">
        <PrimaryButton id="start-playing" onClick={() => navigateTo('tic-tac-toe-game-screen')}>
          Start Playing
        </PrimaryButton>
      </div>
    </div>
  )
}

export const pageMeta: PageMeta = {
  label: 'Tic-Tac-Toe · How to Play',
  desc: 'Rules explainer for Tic-Tac-Toe.',
}
`,
  'tic-tac-toe-flow/tic-tac-toe-game-screen/TicTacToeGameScreen.tsx': `import type { PageMeta } from '@flowkit/types'
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
            onClick={() => navigateTo('hub-screen')}
          />
          <span className="text-ui-md font-medium text-theme-text-primary">Tic-Tac-Toe</span>
        </div>
        <IconButton
          id="how-to-play"
          icon={<span className="text-ui-sm">?</span>}
          label="How to Play"
          onClick={() => navigateTo('tic-tac-toe-how-to-play-screen')}
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
                id={\`cell-\${index}\`}
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
        {gameOver ? '' : \`\${currentPlayer}'s turn\`}
      </p>
      <GameOverModal
        open={gameOver}
        title={winner ? \`\${winner} wins!\` : "It's a draw"}
        message={winner ? \`Player \${winner} takes this round.\` : 'Nobody gets it this time.'}
        onPlayAgain={handlePlayAgain}
        onBackToHub={() => navigateTo('hub-screen')}
      />
    </div>
  )
}

export const pageMeta: PageMeta = {
  label: 'Tic-Tac-Toe',
  desc: '2-player pass-and-play tic-tac-toe with a session win/draw tally.',
  tags: ['type:strategy'],
}
`,
  'dice-flow/dice-how-to-play-screen/DiceHowToPlayScreen.tsx': `import type { PageMeta } from '@flowkit/types'
import { useAppNav } from '@flowkit-shared/utils'
import HowToPlayList from '@workspace/lib/components/ui/HowToPlayList'
import PrimaryButton from '@workspace/lib/components/ui/PrimaryButton'
import SectionHeader from '@workspace/lib/components/ui/SectionHeader'

const STEPS = [
  'Roll two dice for your come-out roll.',
  'A 7 or 11 wins immediately. A 2, 3, or 12 loses immediately.',
  'Any other total establishes "the point" — keep rolling.',
  'Roll the point again before a 7 shows up and you win.',
  'Roll a 7 before the point ("seven-out") and you lose.',
]

export default function DiceHowToPlayScreen() {
  const { navigateTo } = useAppNav()

  return (
    <div className="flex flex-col h-full bg-theme-base">
      <SectionHeader
        title="How to Play"
        onBack={() => navigateTo('dice-game-screen')}
        backId="back"
      />
      <div className="flex-1 overflow-y-auto p-4">
        <HowToPlayList steps={STEPS} />
      </div>
      <div className="p-4 pb-8">
        <PrimaryButton id="start-playing" onClick={() => navigateTo('dice-game-screen')}>
          Start Playing
        </PrimaryButton>
      </div>
    </div>
  )
}

export const pageMeta: PageMeta = {
  label: 'Dice · How to Play',
  desc: 'Rules explainer for the simplified craps Dice game.',
}
`,
  'dice-flow/dice-game-screen/DiceGameScreen.tsx': `import type { PageMeta } from '@flowkit/types'
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
            onClick={() => navigateTo('hub-screen')}
          />
          <span className="text-ui-md font-medium" style={{ color: 'var(--tile-text-light)' }}>
            Dice
          </span>
        </div>
        <IconButton
          id="how-to-play"
          icon={<span className="text-ui-sm">?</span>}
          label="How to Play"
          onClick={() => navigateTo('dice-how-to-play-screen')}
        />
      </div>

      <div className="flex items-center justify-center gap-3 p-3">
        <ScoreBadge
          label="Bankroll"
          value={\`$\${bankroll}\`}
          tone={bankroll >= 500 ? 'green' : 'red'}
        />
        <ScoreBadge
          label="Phase"
          value={
            phase === 'come-out' ? 'Come Out' : phase === 'point' ? \`Point \${point}\` : 'Resolved'
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
          result === 'win' ? \`+$\${BET} added to your bankroll.\` : \`-$\${BET} from your bankroll.\`
        }
        onPlayAgain={handlePlayAgain}
        onBackToHub={() => navigateTo('hub-screen')}
      />
    </div>
  )
}

export const pageMeta: PageMeta = {
  label: 'Dice',
  desc: 'Simplified craps — come-out roll, establish a point, resolve on point or seven-out.',
  tags: ['type:dice'],
}
`,
  'blackjack-flow/blackjack-how-to-play-screen/BlackjackHowToPlayScreen.tsx': `import type { PageMeta } from '@flowkit/types'
import { useAppNav } from '@flowkit-shared/utils'
import HowToPlayList from '@workspace/lib/components/ui/HowToPlayList'
import PrimaryButton from '@workspace/lib/components/ui/PrimaryButton'
import SectionHeader from '@workspace/lib/components/ui/SectionHeader'

const STEPS = [
  'Get as close to 21 as possible without going over.',
  'Number cards count as their value, face cards count as 10, aces count as 11 or 1 — whichever keeps your hand alive.',
  'Hit to take another card, or Stand to lock in your total.',
  'The dealer hits until reaching 17 or more, then stops.',
  'A two-card 21 is a blackjack and pays 3:2. Ties are a push — your bet is returned.',
]

export default function BlackjackHowToPlayScreen() {
  const { navigateTo } = useAppNav()

  return (
    <div className="flex flex-col h-full bg-theme-base">
      <SectionHeader
        title="How to Play"
        onBack={() => navigateTo('blackjack-game-screen')}
        backId="back"
      />
      <div className="flex-1 overflow-y-auto p-4">
        <HowToPlayList steps={STEPS} />
      </div>
      <div className="p-4 pb-8">
        <PrimaryButton id="start-playing" onClick={() => navigateTo('blackjack-game-screen')}>
          Start Playing
        </PrimaryButton>
      </div>
    </div>
  )
}

export const pageMeta: PageMeta = {
  label: 'Blackjack · How to Play',
  desc: 'Rules explainer for Blackjack.',
}
`,
  'blackjack-flow/blackjack-game-screen/BlackjackGameScreen.tsx': `import type { PageMeta } from '@flowkit/types'
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
            onClick={() => navigateTo('hub-screen')}
          />
          <span className="text-ui-md font-medium" style={{ color: 'var(--tile-text-light)' }}>
            Blackjack
          </span>
        </div>
        <IconButton
          id="how-to-play"
          icon={<span className="text-ui-sm">?</span>}
          label="How to Play"
          onClick={() => navigateTo('blackjack-how-to-play-screen')}
        />
      </div>

      <div className="flex items-center justify-center gap-3 p-3">
        <ScoreBadge
          label="Bankroll"
          value={\`$\${bankroll}\`}
          tone={bankroll >= 500 ? 'green' : 'red'}
        />
        {bet > 0 && <ScoreBadge label="Bet" value={\`$\${bet}\`} tone="amber" />}
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
              ? \`\${playerValue.value}\${playerValue.soft ? ' (soft)' : ''}\`
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
                ? \`-$\${bet}\`
                : \`+$\${payout(result, bet)}\`}
          </span>
        </div>
      )}

      <div className="p-4 pb-8 flex flex-col gap-2">
        {phase === 'betting' && (
          <PrimaryButton id="deal" onClick={startHand} disabled={bankroll < BET_AMOUNT}>
            Deal (\${BET_AMOUNT})
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
              Deal (\${BET_AMOUNT})
            </PrimaryButton>
            <PrimaryButton
              id="exit-to-hub"
              variant="danger"
              onClick={() => navigateTo('hub-screen')}
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
`,
  '2048-flow/2048-how-to-play-screen/TwentyFortyEightHowToPlayScreen.tsx': `import type { PageMeta } from '@flowkit/types'
import { useAppNav } from '@flowkit-shared/utils'
import HowToPlayList from '@workspace/lib/components/ui/HowToPlayList'
import PrimaryButton from '@workspace/lib/components/ui/PrimaryButton'
import SectionHeader from '@workspace/lib/components/ui/SectionHeader'

const STEPS = [
  'Swipe or tap an arrow to slide every tile in that direction.',
  'Two tiles with the same number merge into one when they collide.',
  'A new tile (2 or, occasionally, 4) spawns after every move.',
  'Reach the 2048 tile to win — or keep playing for a higher score.',
  'The game ends when the grid is full and no more merges are possible.',
]

export default function TwentyFortyEightHowToPlayScreen() {
  const { navigateTo } = useAppNav()

  return (
    <div className="flex flex-col h-full bg-theme-base">
      <SectionHeader
        title="How to Play"
        onBack={() => navigateTo('2048-game-screen')}
        backId="back"
      />
      <div className="flex-1 overflow-y-auto p-4">
        <HowToPlayList steps={STEPS} />
      </div>
      <div className="p-4 pb-8">
        <PrimaryButton id="start-playing" onClick={() => navigateTo('2048-game-screen')}>
          Start Playing
        </PrimaryButton>
      </div>
    </div>
  )
}

export const pageMeta: PageMeta = {
  label: '2048 · How to Play',
  desc: 'Rules explainer for 2048.',
}
`,
  '2048-flow/2048-game-screen/TwentyFortyEightGameScreen.tsx': `import type { PageMeta } from '@flowkit/types'
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
            onClick={() => navigateTo('hub-screen')}
          />
          <span className="text-ui-md font-medium text-theme-text-primary">2048</span>
        </div>
        <div className="flex items-center gap-1">
          <IconButton
            id="view-high-scores"
            icon={<span className="text-ui-sm">🏆</span>}
            label="High Scores"
            onClick={() => navigateTo('2048-high-scores-screen')}
          />
          <IconButton
            id="how-to-play"
            icon={<span className="text-ui-sm">?</span>}
            label="How to Play"
            onClick={() => navigateTo('2048-how-to-play-screen')}
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
          onBackToHub={() => navigateTo('hub-screen')}
        />
      )}
      <GameOverModal
        open={gameOver}
        title="Game Over"
        message={\`No more moves left. Final score: \${score}.\`}
        onPlayAgain={handlePlayAgain}
        onBackToHub={() => navigateTo('hub-screen')}
      />
    </div>
  )
}

export const pageMeta: PageMeta = {
  label: '2048',
  desc: 'Slide-and-merge puzzle — reach the 2048 tile before the grid fills up.',
  tags: ['type:puzzle'],
}
`,
  '2048-flow/2048-high-scores-screen/TwentyFortyEightHighScoresScreen.tsx': `import type { PageMeta } from '@flowkit/types'
import { useAppNav, useDb } from '@flowkit-shared/utils'
import ScoreBadge from '@workspace/lib/components/ui/ScoreBadge'
import SectionHeader from '@workspace/lib/components/ui/SectionHeader'

export default function TwentyFortyEightHighScoresScreen() {
  const { navigateTo } = useAppNav()
  const db = useDb()
  const best = db.get<number>('twentyFortyEight.best', 0) ?? 0

  return (
    <div className="flex flex-col h-full bg-theme-base">
      <SectionHeader
        title="High Scores"
        onBack={() => navigateTo('2048-game-screen')}
        backId="back"
      />
      <div className="flex-1 flex items-center justify-center p-4">
        <ScoreBadge label="Best Score" value={best} tone="green" />
      </div>
    </div>
  )
}

function hasDotPath(db: Record<string, unknown>, path: string): boolean {
  let cursor: unknown = db
  for (const part of path.split('.')) {
    if (cursor === null || typeof cursor !== 'object' || !(part in (cursor as object))) return false
    cursor = (cursor as Record<string, unknown>)[part]
  }
  return true
}

export const pageMeta: PageMeta = {
  label: '2048 · High Scores',
  desc: "Shows the player's best 2048 score, live from db. Locked until the player finishes a first game.",
  canEnter: ({ db }) => hasDotPath(db, 'highScores.twentyFortyEight'),
  tags: ['type:puzzle'],
}
`,
  'memory-match-flow/memory-match-how-to-play-screen/MemoryMatchHowToPlayScreen.tsx': `import type { PageMeta } from '@flowkit/types'
import { useAppNav } from '@flowkit-shared/utils'
import HowToPlayList from '@workspace/lib/components/ui/HowToPlayList'
import PrimaryButton from '@workspace/lib/components/ui/PrimaryButton'
import SectionHeader from '@workspace/lib/components/ui/SectionHeader'

const STEPS = [
  'Tap a card to flip it face up.',
  'Tap a second card to look for a match.',
  'A matching pair stays face up. A non-match flips back after a moment.',
  'Find all 8 pairs to finish — fewer moves and less time is a better score.',
]

export default function MemoryMatchHowToPlayScreen() {
  const { navigateTo } = useAppNav()

  return (
    <div className="flex flex-col h-full bg-theme-base">
      <SectionHeader
        title="How to Play"
        onBack={() => navigateTo('memory-match-game-screen')}
        backId="back"
      />
      <div className="flex-1 overflow-y-auto p-4">
        <HowToPlayList steps={STEPS} />
      </div>
      <div className="p-4 pb-8">
        <PrimaryButton id="start-playing" onClick={() => navigateTo('memory-match-game-screen')}>
          Start Playing
        </PrimaryButton>
      </div>
    </div>
  )
}

export const pageMeta: PageMeta = {
  label: 'Memory Match · How to Play',
  desc: 'Rules explainer for Memory Match.',
}
`,
  'memory-match-flow/memory-match-game-screen/MemoryMatchGameScreen.tsx': `import type { PageMeta } from '@flowkit/types'
import { useAppNav, useDb } from '@flowkit-shared/utils'
import GameOverModal from '@workspace/lib/components/ui/GameOverModal'
import IconButton from '@workspace/lib/components/ui/IconButton'
import ScoreBadge from '@workspace/lib/components/ui/ScoreBadge'
import {
  isComplete,
  isMatch,
  type MemoryCard,
  newBoard,
} from '@workspace/lib/game-logic/memoryMatch'
import { useEffect, useRef, useState } from 'react'

const FLIP_BACK_DELAY_MS = 900

function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return \`\${m}:\${s.toString().padStart(2, '0')}\`
}

export default function MemoryMatchGameScreen() {
  const { navigateTo } = useAppNav()
  const db = useDb()
  const [cards, setCards] = useState<MemoryCard[]>(newBoard)
  const [selected, setSelected] = useState<number[]>([])
  const [moves, setMoves] = useState(0)
  const [startedAt] = useState(() => Date.now())
  const [elapsedMs, setElapsedMs] = useState(0)
  const flipBackTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const gameOver = isComplete(cards)
  const bestMoves = db.get<number>('memoryMatch.bestMoves', 0) ?? 0
  const bestTimeMs = db.get<number>('memoryMatch.bestTimeMs', 0) ?? 0

  useEffect(() => {
    if (gameOver) return
    const interval = setInterval(() => setElapsedMs(Date.now() - startedAt), 250)
    return () => clearInterval(interval)
  }, [gameOver, startedAt])

  useEffect(() => {
    return () => {
      if (flipBackTimer.current) clearTimeout(flipBackTimer.current)
    }
  }, [])

  useEffect(() => {
    if (gameOver) {
      db.update<number>('memoryMatch.bestMoves', (v = 0) => (v === 0 ? moves : Math.min(v, moves)))
      db.update<number>('memoryMatch.bestTimeMs', (v = 0) =>
        v === 0 ? elapsedMs : Math.min(v, elapsedMs)
      )
      db.set('highScores.memoryMatch.bestMoves', true)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [gameOver])

  function handleCardClick(index: number) {
    if (cards[index].matched || selected.includes(index) || selected.length === 2) return

    const nextSelected = [...selected, index]
    setSelected(nextSelected)

    if (nextSelected.length === 2) {
      setMoves(m => m + 1)
      const [a, b] = nextSelected
      if (isMatch(cards, a, b)) {
        setCards(prev => prev.map((c, i) => (i === a || i === b ? { ...c, matched: true } : c)))
        setSelected([])
      } else {
        flipBackTimer.current = setTimeout(() => setSelected([]), FLIP_BACK_DELAY_MS)
      }
    }
  }

  function handlePlayAgain() {
    setCards(newBoard())
    setSelected([])
    setMoves(0)
    setElapsedMs(0)
  }

  return (
    <div className="flex flex-col h-full bg-theme-base relative">
      <div className="flex items-center justify-between px-4 h-12 border-b border-theme-border-subtle shrink-0">
        <div className="flex items-center gap-2">
          <IconButton
            id="back-to-hub-header"
            icon={<span className="text-ui-md">‹</span>}
            label="Back"
            onClick={() => navigateTo('hub-screen')}
          />
          <span className="text-ui-md font-medium text-theme-text-primary">Memory Match</span>
        </div>
        <div className="flex items-center gap-1">
          <IconButton
            id="view-high-scores"
            icon={<span className="text-ui-sm">🏆</span>}
            label="High Scores"
            onClick={() => navigateTo('memory-match-high-scores-screen')}
          />
          <IconButton
            id="how-to-play"
            icon={<span className="text-ui-sm">?</span>}
            label="How to Play"
            onClick={() => navigateTo('memory-match-how-to-play-screen')}
          />
        </div>
      </div>

      <div className="flex items-center justify-center gap-3 p-3">
        <ScoreBadge label="Moves" value={moves} />
        <ScoreBadge label="Time" value={formatTime(elapsedMs)} />
        <ScoreBadge label="Best" value={bestMoves > 0 ? \`\${bestMoves}mv\` : '—'} tone="green" />
      </div>

      <div className="flex-1 flex items-center justify-center p-4">
        <div className="grid grid-cols-4 gap-2 w-full max-w-72">
          {cards.map((card, index) => {
            const isFaceUp = card.matched || selected.includes(index)
            return (
              <button
                key={card.id}
                id={\`card-\${index}\`}
                onClick={() => handleCardClick(index)}
                disabled={isFaceUp}
                className="aspect-square rounded-md shadow-theme-card flex items-center justify-center text-ui-lg disabled:opacity-100"
                style={{ background: isFaceUp ? 'var(--card-face-bg)' : 'var(--memory-card-back)' }}
              >
                {isFaceUp ? card.symbol : ''}
              </button>
            )
          })}
        </div>
      </div>

      <GameOverModal
        open={gameOver}
        title="All matched!"
        message={\`Finished in \${moves} moves, \${formatTime(elapsedMs)}.\${bestTimeMs > 0 ? \` Best: \${bestMoves} moves.\` : ''}\`}
        onPlayAgain={handlePlayAgain}
        onBackToHub={() => navigateTo('hub-screen')}
      />
    </div>
  )
}

export const pageMeta: PageMeta = {
  label: 'Memory Match',
  desc: 'Flip pairs of cards to find every match — tracks moves and elapsed time.',
  tags: ['type:memory'],
}
`,
  'memory-match-flow/memory-match-high-scores-screen/MemoryMatchHighScoresScreen.tsx': `import type { PageMeta } from '@flowkit/types'
import { useAppNav, useDb } from '@flowkit-shared/utils'
import ScoreBadge from '@workspace/lib/components/ui/ScoreBadge'
import SectionHeader from '@workspace/lib/components/ui/SectionHeader'

function formatTime(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const m = Math.floor(seconds / 60)
  const s = seconds % 60
  return \`\${m}:\${s.toString().padStart(2, '0')}\`
}

export default function MemoryMatchHighScoresScreen() {
  const { navigateTo } = useAppNav()
  const db = useDb()
  const bestMoves = db.get<number>('memoryMatch.bestMoves', 0) ?? 0
  const bestTimeMs = db.get<number>('memoryMatch.bestTimeMs', 0) ?? 0

  return (
    <div className="flex flex-col h-full bg-theme-base">
      <SectionHeader
        title="High Scores"
        onBack={() => navigateTo('memory-match-game-screen')}
        backId="back"
      />
      <div className="flex-1 flex items-center justify-center gap-3 p-4">
        <ScoreBadge label="Best Moves" value={bestMoves} tone="green" />
        <ScoreBadge label="Best Time" value={formatTime(bestTimeMs)} tone="green" />
      </div>
    </div>
  )
}

function hasDotPath(db: Record<string, unknown>, path: string): boolean {
  let cursor: unknown = db
  for (const part of path.split('.')) {
    if (cursor === null || typeof cursor !== 'object' || !(part in (cursor as object))) return false
    cursor = (cursor as Record<string, unknown>)[part]
  }
  return true
}

export const pageMeta: PageMeta = {
  label: 'Memory Match · High Scores',
  desc: "Shows the player's best moves/time for Memory Match, live from db. Locked until first game.",
  canEnter: ({ db }) => hasDotPath(db, 'highScores.memoryMatch.bestMoves'),
  tags: ['type:memory'],
}
`,
  'math-quiz-flow/math-quiz-difficulty-screen/MathQuizDifficultyScreen.tsx': `import type { PageMeta } from '@flowkit/types'
import { useAppNav, useDb } from '@flowkit-shared/utils'
import DifficultyPicker, { type Difficulty } from '@workspace/lib/components/ui/DifficultyPicker'
import PrimaryButton from '@workspace/lib/components/ui/PrimaryButton'
import SectionHeader from '@workspace/lib/components/ui/SectionHeader'

export default function MathQuizDifficultyScreen() {
  const { navigateTo } = useAppNav()
  const db = useDb()
  const difficulty = (db.get<Difficulty>('mathQuiz.difficulty', 'easy') ?? 'easy') as Difficulty

  return (
    <div className="flex flex-col h-full bg-theme-base">
      <SectionHeader
        title="Math Quiz"
        onBack={() => navigateTo('hub-screen')}
        backId="back-to-hub"
      />
      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
        <span className="text-4xl">➗</span>
        <div className="flex flex-col items-center gap-2">
          <h1 className="text-ui-lg font-bold text-theme-text-primary">Pick a difficulty</h1>
          <p className="text-ui-sm text-theme-text-secondary text-center max-w-xs">
            Solve as many equations as you can before you get one wrong.
          </p>
        </div>
        <DifficultyPicker
          value={difficulty}
          onSelect={value => db.set('mathQuiz.difficulty', value)}
        />
      </div>
      <div className="p-4 pb-8">
        <PrimaryButton id="start-quiz" onClick={() => navigateTo('math-quiz-game-screen')}>
          Start
        </PrimaryButton>
      </div>
    </div>
  )
}

export const pageMeta: PageMeta = {
  label: 'Math Quiz · Difficulty',
  desc: 'Difficulty picker for Math Quiz — persists the choice to db.',
}
`,
  'math-quiz-flow/math-quiz-game-screen/MathQuizGameScreen.tsx': `import type { PageMeta } from '@flowkit/types'
import { cn } from '@flowkit-kit/lib/utils'
import { useAppNav, useDb } from '@flowkit-shared/utils'
import GameOverModal from '@workspace/lib/components/ui/GameOverModal'
import IconButton from '@workspace/lib/components/ui/IconButton'
import ScoreBadge from '@workspace/lib/components/ui/ScoreBadge'
import {
  type Difficulty,
  type Equation,
  generateEquation,
  generateOptions,
} from '@workspace/lib/game-logic/mathQuiz'
import { useState } from 'react'

export default function MathQuizGameScreen() {
  const { navigateTo } = useAppNav()
  const db = useDb()
  const difficulty = (db.get<Difficulty>('mathQuiz.difficulty', 'easy') ?? 'easy') as Difficulty

  const [streak, setStreak] = useState(0)
  const [roundScore, setRoundScore] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null)
  const [gameOver, setGameOver] = useState(false)
  const [equation, setEquation] = useState<Equation>(() => generateEquation(difficulty))
  const [options, setOptions] = useState<number[]>(() => generateOptions(equation.correctAnswer))

  const bestScore = db.get<number>('mathQuiz.score', 0) ?? 0

  function handleSelect(option: number) {
    if (selected !== null) return
    setSelected(option)
    const correct = option === equation.correctAnswer
    setIsCorrect(correct)

    if (correct) {
      const nextScore = roundScore + 1
      setRoundScore(nextScore)
      setStreak(s => s + 1)
      db.update<number>('mathQuiz.score', (v = 0) => Math.max(v, nextScore))
    } else {
      setGameOver(true)
    }
  }

  function handleNext() {
    setSelected(null)
    setIsCorrect(null)
    const nextEquation = generateEquation(difficulty)
    setEquation(nextEquation)
    setOptions(generateOptions(nextEquation.correctAnswer))
  }

  function handlePlayAgain() {
    setStreak(0)
    setRoundScore(0)
    setSelected(null)
    setIsCorrect(null)
    setGameOver(false)
    const nextEquation = generateEquation(difficulty)
    setEquation(nextEquation)
    setOptions(generateOptions(nextEquation.correctAnswer))
  }

  return (
    <div className="flex flex-col h-full bg-theme-base relative">
      <div className="flex items-center justify-between px-4 h-12 border-b border-theme-border-subtle shrink-0">
        <div className="flex items-center gap-2">
          <IconButton
            id="back-to-hub-header"
            icon={<span className="text-ui-md">‹</span>}
            label="Back"
            onClick={() => navigateTo('hub-screen')}
          />
          <span className="text-ui-md font-medium text-theme-text-primary">Math Quiz</span>
        </div>
        <IconButton
          id="how-to-play"
          icon={<span className="text-ui-sm">?</span>}
          label="How to Play"
          onClick={() => navigateTo('math-quiz-how-to-play-screen')}
        />
      </div>

      <div className="flex items-center justify-center gap-3 p-3">
        <ScoreBadge label="Score" value={roundScore} />
        <ScoreBadge label="Streak" value={streak} tone="amber" />
        <ScoreBadge label="Best" value={bestScore} tone="green" />
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-6 p-6">
        <span className="text-ui-xl font-bold text-theme-text-primary">{equation.text} = ?</span>
        <div className="grid grid-cols-2 gap-2 w-full max-w-64">
          {options.map((option, i) => {
            const isSelected = selected === option
            const showCorrect = selected !== null && option === equation.correctAnswer
            return (
              <button
                key={i}
                id={\`option-\${i}\`}
                onClick={() => handleSelect(option)}
                disabled={selected !== null}
                className={cn(
                  'py-3 rounded-[10px] shadow-theme-card text-ui-md font-semibold disabled:opacity-100',
                  !showCorrect && !isSelected && 'bg-theme-surface text-theme-text-primary'
                )}
                style={{
                  background: showCorrect
                    ? 'var(--tile-2)'
                    : isSelected
                      ? 'var(--card-suit-red)'
                      : undefined,
                  color: showCorrect ? 'var(--tile-text-dark)' : isSelected ? '#fff' : undefined,
                }}
              >
                {option}
              </button>
            )
          })}
        </div>
      </div>

      {isCorrect && !gameOver && (
        <div className="p-4 pb-8">
          <button
            id="next-round"
            onClick={handleNext}
            className="w-full px-3 py-2.5 rounded-md bg-theme-green-dim text-theme-green text-ui-sm font-medium"
          >
            Next
          </button>
        </div>
      )}

      <GameOverModal
        open={gameOver}
        title="Wrong answer"
        message={\`You solved \${roundScore} in a row. Best: \${Math.max(bestScore, roundScore)}.\`}
        onPlayAgain={handlePlayAgain}
        onBackToHub={() => navigateTo('hub-screen')}
      />
    </div>
  )
}

export const pageMeta: PageMeta = {
  label: 'Math Quiz',
  desc: 'Speed math — equation difficulty scales with the chosen level, streak ends on a miss.',
  tags: ['type:trivia'],
}
`,
  'math-quiz-flow/math-quiz-how-to-play-screen/MathQuizHowToPlayScreen.tsx': `import type { PageMeta } from '@flowkit/types'
import { useAppNav } from '@flowkit-shared/utils'
import HowToPlayList from '@workspace/lib/components/ui/HowToPlayList'
import PrimaryButton from '@workspace/lib/components/ui/PrimaryButton'
import SectionHeader from '@workspace/lib/components/ui/SectionHeader'

const STEPS = [
  'Pick a difficulty — Easy, Medium, or Hard.',
  'Solve the equation and tap the correct answer from four choices.',
  'A correct answer extends your streak and moves you to the next equation.',
  'A wrong answer ends the round — your best streak is saved.',
]

export default function MathQuizHowToPlayScreen() {
  const { navigateTo } = useAppNav()

  return (
    <div className="flex flex-col h-full bg-theme-base">
      <SectionHeader
        title="How to Play"
        onBack={() => navigateTo('math-quiz-game-screen')}
        backId="back"
      />
      <div className="flex-1 overflow-y-auto p-4">
        <HowToPlayList steps={STEPS} />
      </div>
      <div className="p-4 pb-8">
        <PrimaryButton id="start-playing" onClick={() => navigateTo('math-quiz-game-screen')}>
          Start Playing
        </PrimaryButton>
      </div>
    </div>
  )
}

export const pageMeta: PageMeta = {
  label: 'Math Quiz · How to Play',
  desc: 'Rules explainer for Math Quiz.',
}
`,
}

/**
 * Returns the full game-demo file map (relative path → content) for one
 * workspace, ready to be merged with each generator's own config/db output.
 * `name` interpolates into workspace.ts/tokens.css/overview.md only — every
 * other file is name-agnostic and copied verbatim. TypeScript only —
 * FlowKit scaffolding no longer offers a JavaScript output mode.
 *
 * `tokensCssPrefix`, if given, is prepended to the game's own additive
 * tokens.css (e.g. repo mode's kit `@import` line + workspace-level override
 * block) — the two are layered, not one replacing the other, since a chosen
 * kit's CSS import and this demo's card/dice/tile vars are both additive on
 * top of the platform's bg-theme / text-theme token vocabulary.
 *
 * `defineFlowImportLine`, if given, replaces each flowStory file's
 * `import { defineFlow } from '@flowkit-core/config'` line — flat/multi-workspace
 * consumer mode passes `"import { defineFlow } from 'flowkit'"` (repo mode
 * never calls this with an override; @flowkit-core/config is its real home).
 */
export function gameDemoScaffold(name, tokensCssPrefix = '', defineFlowImportLine = null) {
  const files = {}

  files['index.ts'] =
    '// Workspace barrel — add shared exports here as needed.\n// The platform reads pages via the flowBook/ glob; no router required.\n'
  files['lib/data/db.ts'] = DB_TS
  files['lib/data/simulator.tsx'] = SIMULATOR_TSX
  files['lib/design-system/tokens.css'] =
    tokensCssPrefix + TOKENS_CSS.replace(/\{\{name\}\}/g, name)
  files['lib/docs/overview.md'] = OVERVIEW_MD.replace(/\{\{name\}\}/g, name)
  // Pre-registered so a fresh scaffold passes `flowkit check` clean — otherwise
  // every one of the 10 shared UI components below trips a components/unregistered
  // warning until the author manually runs `flowkit components:scan`.
  const createdAt = new Date().toISOString()
  files['.flowkit/components.json'] =
    JSON.stringify(
      Object.keys(COMPONENT_FILES).map(filename => ({
        name: filename.replace(/\.tsx$/, ''),
        path: 'lib/components/ui',
        desc: '',
        createdAt,
      })),
      null,
      2
    ) + '\n'

  for (const [filename, content] of Object.entries(FLOW_STORY_FILES)) {
    files[`${FLOW_STORIES_DIRNAME}/${filename}`] = defineFlowImportLine
      ? content.replace(`import { defineFlow } from '@flowkit-core/config'`, defineFlowImportLine)
      : content
  }
  for (const [filename, content] of Object.entries(GAME_LOGIC_FILES)) {
    files[`lib/game-logic/${filename}`] = content
  }
  for (const [filename, content] of Object.entries(COMPONENT_FILES)) {
    files[`lib/components/ui/${filename}`] = content
  }
  for (const [relPath, content] of Object.entries(PAGE_FILES)) {
    files[`${FLOW_BOOK_DIRNAME}/${relPath}`] = content
  }

  return files
}

/** Just the workspace config file. `importLine` defaults to repo mode's
 * `@flowkit-core/config` import — pass `"import { defineConfig } from 'flowkit'"`
 * explicitly for flat/multi-workspace consumer mode (workspace-template.js
 * always does; it never runs in repo mode). */
export function gameDemoWorkspaceConfig(
  name,
  importLine = `import { defineConfig } from '@flowkit-core/config'`
) {
  return workspaceConfig(name, importLine)
}
