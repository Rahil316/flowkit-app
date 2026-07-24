# FlowMaster — Developer Walkthrough

FlowMaster is Flowkit's flow engine — a proper state machine giving you conditional branching, isolated per-flow state, global mock database access, and a live debugger panel, all driven by flowplan files.

**This doc covers all three deployment modes** (repo, flat, and multi-workspace consumer). Examples use repo-mode imports (`@flowkit-core/config`). In consumer mode (flat/multi-workspace), import `defineFlow` from `'flowkit'` instead — the API is identical. See [CLI.md](CLI.md#import-aliases) for details.

---

## Mental model

- **Pages are dumb** — they render UI. They never know what page comes next.
- **Flowplans are smart** — `flowStories/<flow>.ts` owns all routing logic via `steps[]`. FlowMaster reads it and drives navigation.
- **Two kinds of state** — `flowState` (per-chapter sandbox, reset when the chapter exits) and `db` (global mock db, persists across the session).

---

## File structure

```
workspaces/<ws>/
  flowStories/                ← was `flowplans/`
    auth.ts               ← defineFlow({ id, steps: […] })
    checkout.ts
  flowBook/             ← was `flows/`
    auth/
      sign-in/
        SignInScreen.tsx
      sign-up/
        SignUpScreen.tsx
    checkout/
      cart/
        CartScreen.tsx
      payment/
        PaymentScreen.tsx
      confirmation/
        ConfirmationScreen.tsx
```

Pages are discovered at runtime by `useWorkspaceHierarchy()` via Vite glob — no router file is generated or needed. Page folders can nest to any depth under `flowBook/<flow>/` (extra cosmetic folders in between are ignored for identity), and the registered, cross-chapter-unique page id is the composite `${flowId}-${pageId}` — see [FLOWKIT.md](FLOWKIT.md#page-authoring-folders-identity-and-visibility) for the full identity/visibility rules. The step examples below use bare ids for brevity; in a real flowplan, `pageId` values are the composite form.

---

## Flowplan — full config reference

```ts
import { defineFlow } from '@flowkit-core/config'

export default defineFlow({
  id: 'checkout',
  name: 'Checkout',
  description: 'Full purchase flow',
  tags: ['buyer', 'status:approved'],

  // Flow-level db baseline — deep-copied on play, restored on exit.
  // Keys are dot-paths; objects deep-merge, arrays replace entirely.
  db: {
    user: { id: 'u1', verified: true },
    cart: { count: 1 },
  },

  // Flow-level simulator controls shown during playback.
  simulator: {
    controls: [
      { label: 'Cart items', path: 'cart.count', type: 'count', min: 0, max: 10 },
      { label: 'Online', path: 'local.isOnline', type: 'boolean', default: true },
    ],
  },

  steps: [
    {
      pageId: 'cart', // required — id of the screen to show
      on: 'checkout-btn', // element id whose tap advances this step (omit = tap-anywhere)
      actionNote: 'Taps Checkout', // what the user does (shown during playback)
      decisionNote: 'Entry point.',
      annotation: 'Free-text sticky note shown on the canvas node.',
      db: { 'cart.count': 1 }, // step-level db patch applied when this step activates
    },
    {
      pageId: 'payment',
      on: 'submit-btn',
      actionNote: 'Reviews cart, submits payment',
      forks: [
        {
          label: 'Empty cart',
          db: { 'cart.count': 0 },
          steps: [{ pageId: 'cart-empty', actionNote: 'Sees empty state' }],
          // mergesTo: 'next',  // rejoin the main flow after the fork; omit = terminal branch
        },
      ],
    },
    {
      pageId: 'confirmation',
      actionNote: 'Sees confirmation',
      decisionNote: 'End of happy path.',
    },

    // Inline another plan's steps (screen ids namespaced as "other-plan-id::screen-id"):
    // { ref: 'quick-reorder-flow' },
  ],
})
```

### Step fields

| Field          | Purpose                                                             |
| -------------- | ------------------------------------------------------------------- |
| `pageId`       | Composite `${flowId}-${pageId}` id of the screen to show (required) |
| `on`           | Element id whose tap advances this step; omit for tap-anywhere      |
| `actionNote`   | What the user does — shown as caption during playback               |
| `decisionNote` | Narrative note shown in the step list                               |
| `annotation`   | Free-text sticky note shown on canvas node and step list            |
| `db`           | Dot-path patch applied to the flow db when this step activates      |
| `simulator`    | Per-step simulator control visibility (add/hide/exclusive)          |
| `forks`        | Inline conditional branches (see below)                             |

### Fork fields

| Field      | Purpose                                                                     |
| ---------- | --------------------------------------------------------------------------- |
| `label`    | Display name for the branch                                                 |
| `db`       | Db condition patch — evaluated against current db to select this branch     |
| `steps`    | Steps to run on this branch                                                 |
| `mergesTo` | `"next"` to rejoin the main flow after the fork; omit for a terminal branch |

### Plan composition

`{ ref: 'plan-id' }` inlines another plan's steps at that position. The referenced plan's screen ids are namespaced as `plan-id::screen-id` to avoid collisions.

---

## Page component

Pages render UI and give elements ids. Navigation is wired in the flowplan — pages never import routing logic.

```tsx
import type { PageProps } from '@flowkit/types'

interface MyDb {
  auth: { isLoggedIn: boolean }
  user: { name: string }
}

export default function CartPage({ db }: PageProps<unknown, MyDb>) {
  return (
    <div>
      <p>Hello, {db?.user?.name}</p>
      <button id="checkout-btn">Checkout</button>
      <button id="back-btn">Back</button>
    </div>
  )
}

export const pageMeta = {
  desc: 'Shopping cart view',
  isStandalone: true, // entry point — not reached via back-nav
  canEnter: ({ db }) => db.auth.isLoggedIn,
  // canNotEnter: ({ db }) => db.auth.isGuestUser,
}
```

### `PageProps` fields

| Prop        | Type                       | Description                                                                  |
| ----------- | -------------------------- | ---------------------------------------------------------------------------- |
| `isChapter` | `boolean`                  | `true` when rendered inside FlowMaster                                       |
| `flowState` | `TState`                   | Local sandbox state for this chapter                                         |
| `db`        | `TDb`                      | Global mock db (live reference)                                              |
| `onAction`  | `(name, payload?) => void` | Trigger a named interaction programmatically (form submits, async callbacks) |
| `onNext`    | `() => void`               | Advance to the next page in order                                            |
| `onBack`    | `() => void`               | Go to the previous page                                                      |

> Prefer element `id` + flowplan `on:` over `onAction`/`onNext`/`onBack` for simple taps — it keeps pages free of routing logic.

> **Screens tab vs. Flows tab:** `onAction`/`onNext`/`onBack` are only wired up during flowplan playback (Flows tab / FlowMaster) — those callbacks are `undefined` when a page is viewed standalone from the **Screens tab**, so `onClick={() => onNext?.()}`-style handlers no-op silently there. That's by design, not a bug. If a page should also be freely clickable from the Screens tab, use `useAppNav()` instead: `const { navigateTo } = useAppNav(); onClick={() => navigateTo(id)}` (see "Navigate from screen logic" below). `useAppNav()` picks the flow-aware `navigateTo` automatically when the page is rendered inside a chapter, so it's always safe to call unconditionally — no `isChapter` check needed in the page's own code.

### `pageMeta` fields

| Field          | Type                  | Purpose                                                                         |
| -------------- | --------------------- | ------------------------------------------------------------------------------- |
| `id`           | `string`              | Page identifier (optional; auto-derived from file name if omitted)              |
| `label`        | `string`              | Display name (optional; defaults to derived from component name)                |
| `desc`         | `string`              | Short description shown in the sidebar                                          |
| `devNotes`     | `string`              | Developer notes (not shown in sidebar)                                          |
| `tags`         | `string[]`            | Filtering tags. Conventions: `role:`, `type:`, `state:`, `platform:`, `status:` |
| `hasTag`       | `string`              | Sidebar badge label                                                             |
| `isStandalone` | `boolean`             | Entry-point page — not reached via back-nav                                     |
| `canEnter`     | `({ db }) => boolean` | Allow guard — sidebar shows lock icon when `false`                              |
| `canNotEnter`  | `({ db }) => boolean` | Block guard — sidebar shows lock icon when `true`                               |
| `variantLabel` | `string`              | Human-readable label for A/B variants (only for `.variant.<serial>.tsx` files)  |
| `variantOrder` | `number`              | Sort position for A/B variants (lower = earlier; default = Infinity)            |

---

## Entry guards

Guards receive the live `db` and return a boolean. Both can coexist — if either blocks, the guard fails.

```ts
export const pageMeta = {
  desc: 'Pro feature',
  canEnter: ({ db }) => db.user.plan === 'pro',
  canNotEnter: ({ db }) => !db.auth.isLoggedIn,
}
```

Page-level guards are surfaced in the sidebar as a lock icon.

---

## Navigate from screen logic

For state-driven or async navigation (after a form submit, API call, etc.) use `useNav()`:

```ts
import { useNav } from '@flowkit-shared/utils'

const { navigateTo, goNext, goBack } = useNav()

const submit = async () => {
  await save()
  navigateTo('confirmation')
}
```

Targets: a page id, `"next"`, `"back"`, or `"complete"`.

> **During flow playback**, use `useNav()`, not `useDashboard()`'s `navigateTo` — guards, animations, and session replay only fire through FlowMaster's `commitNavigation`. `useNav()` itself throws if called from a page with no `FlowMaster` ancestor (i.e. previewed standalone from the Screens tab), so it isn't a drop-in replacement there.
>
> A page that should **also** be freely clickable from the Screens tab (no chapter active) should call `useAppNav()` (`@flowkit-shared/utils`) instead of `useNav()` or `useDashboard()` directly: `const { navigateTo } = useAppNav(); onClick={() => navigateTo(id)}`. `useAppNav()` reads whichever navigation context actually applies — FlowMaster's flow-aware one when rendered inside a chapter, `DashboardContext`'s otherwise — so the same call is correct in both places with no `isChapter` check written by the page. See `scripts/helpers/scaffold.js`'s demo pages for the pattern.

---

## Flow debugger

The debugger panel (right sidebar → Debugger tab) shows:

- **Journey** — page navigation log with timestamps
- **Rules** — fired step interactions and their resolved targets
- **State** — current `flowState` snapshot
- **Logs** — `updateDb` calls with before/after snapshots

---

## Analytics & recording (FlowTracer)

FlowMaster emits an event stream to the session recorder (FlowTracer) as the user moves through a flow — these power FlowLens replay & analytics. Key events:

- `flow.entered` / `flow.completed` / `flow.exited-early` / `flow.blocked`
- `screen.visited` / `screen.dwell-end` / `screen.blocked`
- `interaction.tap` / `interaction.double-tap` / `interaction.hover` / `interaction.swipe` / `interaction.effect` / `interaction.frustrated-click`
- `navigation.auto-advance`
- **`flow.transition`** — emitted when a navigation resolves with a problem: a screen guard **blocks** it, or a step resolver **throws**. Carries `{ action, from, to, blocked?/error?, warnings[] }` so FlowLens replay shows _why_ a tap misbehaved, not just that it happened.

Cursor positions are sampled (rAF, throttled) when the `cursorTracking` channel is on. Recording is always available; replaying it is the **FlowLens** mode. See [FLOWLENS.md](FLOWLENS.md).

---

## CLI

```bash
flowkit flowStory:ls       # list all flowStories
flowkit check:flowStories  # validates flowStory structure/step references; also runs as prebuild gate
flowkit status             # workspace health: chapters, pages, flowStories, sessions
```

Add pages manually: create `flowBook/<flow>/<screen>/<ScreenName>.tsx` (the filename doesn't need the `Screen`/`Page` suffix — identity comes from the folder, not the file), add a step to `flowStories/<flow>.ts`. `useWorkspaceHierarchy()` discovers pages automatically — no build step needed.
