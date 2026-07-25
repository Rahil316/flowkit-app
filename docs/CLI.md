# flowkit CLI

Command-line interface for managing workspaces, chapters, pages, FlowStories, sessions, and workspace data.

**This CLI runs in three modes**, and most of this doc's examples use repo-mode paths (`workspaces/<ws>/...`). Where a command behaves differently or isn't available in a mode, it's called out explicitly.

| Mode                     | Where it applies                                                                               | Layout                                                                                                                     |
| ------------------------ | ---------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **Repo mode**            | This monorepo checkout                                                                         | `workspaces/<name>/` — multiple workspaces, switched via browser UI                                                        |
| **Flat mode**            | A project scaffolded by `create-flowkit-app`                                                   | Project root IS the one workspace — no `workspaces/` dir                                                                   |
| **Multi-workspace mode** | A project scaffolded by `create-flowkit-mono`, or a flat project after `flowkit convert:multi` | Sibling workspace folders at project root (`workspace-1/`, `app-b/`, …), declared in `package.json`'s `flowkit.workspaces` |

Flat and multi-workspace mode are collectively "consumer mode" below. See [Workspaces (flat/multi-workspace consumer mode)](#workspaces-flatmulti-workspace-consumer-mode) for the commands specific to those two.

## Setup

**Repo mode:**

```bash
npm install
npm link          # makes `flowkit` available globally in your shell
```

Or run without linking:

```bash
node scripts/flowkit.js <command>
```

**Consumer mode** — `flowkit` is a `devDependency` installed by the scaffolder, already on your `PATH` via `node_modules/.bin`:

```bash
npx create-flowkit-app@latest my-app          # flat mode
npx create-flowkit-mono@latest my-project      # multi-workspace mode
cd my-app  # or my-project
flowkit <command>
```

---

## Syntax

Every command has a **short alias** and a **long-form name** — both always work:

```bash
flowkit nw              # short alias, guided
flowkit new-workspace   # long form, guided
flowkit nw:<name>       # express: value after colon, guided fallback for missing flags
flowkit new-workspace:<name> --kit:apple   # fully express
```

`--agent:` and per-tool memory-file targets (Claude/Cursor/etc.) previously existed here and were removed — every workspace now gets one agent-agnostic `AGENTS.md`, matching the consumer-mode scaffolders (`create-flowkit-app`/`create-flowkit-mono`), which never offered a per-tool choice.

**Flags** follow the same `:` pattern: `--kit:apple`. Workspaces are TypeScript-only — there is no language flag.

**Help** — any of these work:

```bash
flowkit
flowkit -h
flowkit help
```

**Version:**

```bash
flowkit -v
flowkit --version
flowkit version
```

---

## Workspaces (repo mode)

> **`nw`/`rw`/`watch` are repo-mode only** — they manage `workspaces/<name>/` directories inside this monorepo checkout and exit with an error pointing at the consumer-mode equivalents if run elsewhere. `status` (bottom of this section) is the exception — confirmed working in all three modes, included here because it's a workspace-lifecycle command, not because it's repo-mode-specific. See [Workspaces (flat/multi-workspace consumer mode)](#workspaces-flatmulti-workspace-consumer-mode) for the consumer-mode equivalents of `nw`/`rw`.

### `nw` / `new-workspace` — Create workspace

```bash
flowkit nw
flowkit nw:<name>
flowkit nw:<name> --kit:<name> --empty
```

Creates a new workspace under `workspaces/<name>/` with the full folder structure, mock db, design tokens, and demo content. Switches the active workspace immediately and builds the router.

By default the demo content is a playable 7-chapter arcade ("Game Zone" — a splash/welcome
intro into a hub of 6 mini-games: Blackjack, Dice, Tic-Tac-Toe, 2048, Memory Match, Math
Quiz), sourced from `scripts/demoBooks/game-demo-scaffold.js` — the single shared module also
used by `create:workspace`/`create-flowkit-app`/`create-flowkit-mono`, so all four
scaffolding entry points ship byte-identical demo content. Pass `--empty` for a bare,
zero-chapter workspace instead (see the flags table below).

**Scaffolded structure (default, non-`--empty`):**

```
workspaces/<name>/
  flowBook/
    intro-flow/{splash,welcome,hub}-screen/
    tic-tac-toe-flow/, dice-flow/, blackjack-flow/, 2048-flow/,
    memory-match-flow/, math-quiz-flow/    ← one folder per page, <PageName>.tsx inside
  flowStories/                            ← intro-flow.ts + 4 journey-*.ts named playback scripts
  lib/
    components/ui/          ← 10 shared game-UI components (PrimaryButton, ScoreBadge, ...)
    components/{layout,navigation,forms}/  ← empty, .gitkeep only
    game-logic/              ← pure logic, one file per game (deck.ts, blackjack.ts, ...)
    data/db.ts
    data/simulator.tsx
    design-system/tokens.css
    docs/overview.md
    hooks/                  ← empty, .gitkeep only
    assets/logo.png          ← stub, replace with your own
  .flowkit/components.json   ← pre-registers the 10 shared UI components
  .agent/
    INDEX.md
    rules.md
    platform.md
    project.md             ← hand-owned; never regenerated
    .agent-meta.json
  AGENTS.md                ← agent memory file (one agent-agnostic file, no per-tool choice)
  manifest.ts
  index.ts

workspaces/<name>/lib/flowLens/       ← committed session library + studies.json (created alongside workspace)
```

`--empty` skips `flowBook/`, `flowStories/`, `lib/game-logic/`, and `lib/components/ui/`
entirely — `manifest.ts` declares zero chapters (an author's first `flowkit
create:chapter` populates it), and `lib/data/db.ts`/`lib/data/simulator.tsx` are minimal
stubs. Still a fully valid, buildable workspace — `flowkit audit` passes clean either way.

**Optional flags:**

| Flag                  | Description                                                        |
| --------------------- | ------------------------------------------------------------------ |
| `--kit:apple`         | iOS HIG style — system blue, SF Pro, soft surfaces, generous radii |
| `--kit:material`      | Material Design 3 — purple brand, Roboto, tonal surfaces           |
| `--kit:neo-brutalism` | Sharp edges, black borders, hard offset shadows                    |
| `--kit:none`          | No kit — base structural styles only (default)                     |
| `--empty`             | Bare scaffold — no demo chapters/pages/flowStories/components      |

Kits are applied via the `@flowkit-kit` CSS alias — no files are copied into the workspace. The selected kit is stored in `src/workspaces.ts` and applied as a `data-kit` attribute on the preview canvas at runtime.

### `manifest.ts` anatomy

The workspace manifest is authored with `defineConfig()` — imported from `@flowkit-core/config` in repo mode, or from `'flowkit'` in consumer mode (flat/multi-workspace):

```typescript
// repo mode
import { defineConfig } from '@flowkit-core/config'
// consumer mode (flat/multi-workspace)
import { defineConfig } from 'flowkit'

export default defineConfig({
  workspace: { name: 'MyApp', description: 'What this prototype is.' }, // optional

  // Page loaded by default — cold load, device home button, reset-to-first —
  // when no flowStory is active. Optional; falls back to the first declared page when unset.
  startPage: 'welcome-screen',

  // Default device shell/mockup shown on load. Must match a DevicePreset.label
  // from src/shared/components/devices (e.g. "iPhone 16 Pro", "iPad Mini", "Compact").
  // Optional; falls back to the platform default (DEVICE_PRESETS[0]) when unset or unrecognized.
  defaultDevice: 'iPhone 16 Pro',

  // Default orientation on load. Optional; falls back to "portrait". Ignored if the
  // resolved device preset doesn't support landscape (DevicePreset.supportsLandscape).
  defaultOrientation: 'portrait',

  // Explicit chapter ordering for the Screens tab and Stories.
  // Unlisted chapters are appended after declared ones in discovery order.
  chapters: ['onboarding-flow', 'home-flow'],

  // Explicit page ordering within each chapter for the Screens tab sidebar.
  // Unlisted pages are appended after declared ones, alphabetically.
  // NOTE: unlike flowStory step `pageId`s (which use the composite
  // `${chapterId}-${pageId}` form), pageOrder's arrays stay BARE page ids —
  // this map is already chapter-scoped by its own outer key, so no prefix is
  // needed to avoid collisions here. See Screen identity below.
  pageOrder: {
    'onboarding-flow': ['welcome-screen', 'setup-screen', 'ready-screen'],
    'home-flow': ['home-screen', 'detail-screen'],
  },
})
```

**Field summary:**

| Field                | Purpose                                                                            |
| -------------------- | ---------------------------------------------------------------------------------- |
| `workspace`          | Display `name` / `description` shown in the workspace picker                       |
| `startPage`          | Default page id — cold load, device home button, reset-to-first (optional)         |
| `defaultDevice`      | Default device shell/mockup label, must match a `DevicePreset.label` (optional)    |
| `defaultOrientation` | Default orientation, `"portrait"` or `"landscape"` (optional)                      |
| `chapters`           | Explicit chapter ordering (flat-layout workspaces — see note below)                |
| `pageOrder`          | Explicit per-chapter page ordering, keyed by chapter id                            |
| `projects`           | Nested-layout only — per-project `chapters`/`pageOrder` (skip for flat workspaces) |

> **"Flat-layout" here is unrelated to flat _mode_.** `chapters`/`pageOrder` vs. `projects` describes whether a single workspace has a `projects/` subdivision layer inside it — a repo-mode-and-consumer-mode-agnostic authoring choice. It has nothing to do with flat mode (one implicit workspace, no `workspaces/` dir) vs. multi-workspace mode (sibling workspace folders) described elsewhere in this doc. Both `flat-layout` and `nested-layout` workspaces exist identically in repo mode, flat mode, and multi-workspace mode.

Per-flowStory playback can override the home-button target for the duration of that flow via `homeScreen` — see [FlowStory anatomy](#flowstory-anatomy) below.

Workspace switching happens in the browser UI — open `http://localhost:5173` and select a workspace. Your selection is saved automatically in `localStorage`.

### `rw` / `remove-workspace` — Remove workspace

```bash
flowkit rw
flowkit rw:<name>
flowkit remove-workspace:<name>
```

Removes `workspaces/<name>/` entirely. Requires `y` confirmation. If the removed workspace was active, prompts to switch to another.

### `watch` / `watch:flows` — Watch mode

```bash
flowkit watch
flowkit watch:<name>
flowkit watch:flows:<name>   # same — the "flows:" prefix is stripped
```

Switches to the workspace, starts the dev server (`npm run dev`), then watches `workspaces/<name>/flowBook/` for `.ts`/`.tsx` changes. Press `Ctrl+C` to stop.

> The `watch` / `watch:flows` command names are unchanged even though the folder they watch was renamed from `flows/` to `flowBook/` — this is intentional, not an inconsistency to fix.

> This is the CLI-level watcher (Node.js `fs.watch`). The Vite plugin watcher (`VITE_ENABLE_FLOWKIT_WATCH=true`) is a separate mechanism that runs inside the dev server.

### `status` — Workspace health snapshot

Works in all three modes — confirmed via live test in flat and multi-workspace mode. Takes the workspace name via colon-suffix only (`status:<name>`), not the `--workspace:<name>` flag the Authoring family uses.

```bash
flowkit status
flowkit status:<name>
```

Prints a compact health report for the active workspace:

- Chapter count + total page count (counts page files under `flowBook/<flow>/`, at any nesting depth; hidden `_`-prefixed items are counted, non-existent `__`-prefixed items are not — see [Screen visibility](#screen-visibility-hidden-vs-non-existent) below)
- FlowStory count (from `flowStories/*.ts`)
- Session library: count + whether FlowLens module is present
- Feedback: committed comment count (from `.flowkit-feedback.json`)
- Agent: agent type + spec version (from `.agent/.agent-meta.json`)

---

## Workspaces (flat/multi-workspace consumer mode)

Consumer-mode equivalent of the repo-mode `nw`/`rw`/`watch` commands above. Mode and workspace list are declared explicitly in the consumer project's `package.json` under a `flowkit` key — never inferred from folder shape:

```json
{
  "flowkit": {
    "mode": "multi",
    "workspaces": ["workspace-1", "app-b"]
  }
}
```

Absent `flowkit` key (or `mode` omitted) means flat mode — the project root itself is the one implicit workspace.

### `convert:multi` — Convert flat mode to multi-workspace mode

```bash
flowkit convert:multi
flowkit convert:multi --name:my-workspace
```

Wraps the project root's `manifest.ts`/`index.ts`/`flowBook/`/`flowStories/`/`lib/` (plus `.flowkit/`, `.agent/`, `.flowkit-feedback.json` if present) into a new folder — `workspace-1/` by default, or `--name:<id>`. Rewrites `vite.config.ts` to the multi-workspace template and sets `package.json`'s `flowkit.mode`/`flowkit.workspaces` accordingly. Staged move with rollback — a failure partway through leaves the project exactly as it was before running the command, confirmed via induced-failure test.

Prints a hint for adding another workspace afterward; does **not** scaffold a second workspace itself.

### `convert:flat` — Collapse multi-workspace mode back to flat

```bash
flowkit convert:flat                    # only valid with exactly one workspace left
flowkit convert:flat --from:app-b       # pick which workspace survives (others must not exist, or pass --all)
flowkit convert:flat --from:app-b --all # delete every other workspace first, then collapse app-b to root
```

Moves the chosen workspace's content back up to project root, rewrites `vite.config.ts` to the flat template, and clears `package.json`'s `flowkit` key entirely. Refuses (rather than guessing) if multiple workspaces exist and neither `--from` nor `--all` disambiguates which one survives. `--all` requires typed confirmation before deleting the non-surviving workspaces.

### `create:workspace` — Add a workspace

```bash
flowkit create:workspace --name:app-b
flowkit create:workspace          # prompts for name interactively
flowkit create:workspace --name:app-b --empty  # bare scaffold, no demo content
```

Multi-workspace mode only. Scaffolds a new sibling folder with the same demo content as `create-flowkit-mono`'s own initial workspace, and appends it to `package.json`'s `flowkit.workspaces`. This is the primary way to add a workspace — hand-creating a folder and manually editing `flowkit.workspaces` works too, but there's no discovery: an unlisted folder is not a workspace no matter what's inside it.

### `remove:workspace` — Remove a workspace

```bash
flowkit remove:workspace --name:app-b
flowkit remove:workspace          # prompts to select from the list
```

Multi-workspace mode only. Requires typed confirmation (the workspace name, not just `y`/`n`) before deleting — same pattern as repo-mode's `rw`. Removes the folder and its entry in `flowkit.workspaces`.

### `rename:workspace` — Rename a workspace

```bash
flowkit rename:workspace app-b app-c
```

Multi-workspace mode only. Renames the folder and updates `flowkit.workspaces` in place; the workspace's own `manifest.ts` `workspace.name` field is not required to match and isn't auto-updated.

---

## FlowStories

FlowStories are TypeScript files that define scripted journeys with conditional forks, db patches, and action notes. They are compiled at runtime by `compileFlowStory.ts`.

**Storage location:** `workspaces/<ws>/flowStories/<Name>.ts` (repo mode) or `flowStories/<Name>.ts` at the workspace root (consumer mode — flat: project root; multi-workspace: inside the workspace's own folder). (Directory renamed from `flowplans/`; the check domain was renamed from `check:flowplans` to `check:flowStories`, and later from `check:flowStories` to `audit:story` as part of the broader `check`→`audit` rename; the discovery verb itself was renamed 2026-07-24 from `plan:ls`/`fp:ls` to `flowStory:ls`/`fs:ls` — a breaking change, no back-compat alias.)

### FlowStory anatomy

A FlowStory is authored with `defineFlow()` — imported from `@flowkit-core/config` in repo mode, or from `'flowkit'` in consumer mode:

```typescript
// repo mode
import { defineFlow } from '@flowkit-core/config'
// consumer mode (flat/multi-workspace)
import { defineFlow } from 'flowkit'

export default defineFlow({
  id: 'checkout-flow', // required — unique flowStory id
  name: 'Checkout', // required — display name
  description: 'Happy path.', // optional
  tags: ['buyer', 'status:approved'], // optional — prefixes: role: type: state: status:

  // Screen the device home button targets while this flowStory is playing.
  // Optional — falls back to the workspace's `startPage` (see manifest.ts) when unset.
  homeScreen: 'product-detail',

  // Chapter-level db baseline — deep-copied on play, restored on exit.
  // Keys are dot-paths; objects deep-merge, arrays replace entirely.
  db: {
    user: { id: 'u1', verified: true },
    cart: { count: 1 },
  },

  // Chapter-level simulator controls shown during playback.
  simulator: {
    controls: [
      { label: 'Cart items', path: 'cart.count', type: 'count', min: 0, max: 10 },
      { label: 'Online', path: 'local.isOnline', type: 'boolean', default: true },
    ],
  },

  steps: [
    {
      pageId: 'checkout-flow-product-detail', // required — composite `${chapterId}-${pageId}` id of the screen to show
      on: 'add-to-cart', // element id whose tap advances this step (omit = tap-anywhere)
      actionNote: 'Taps Add to Cart', // what the user does (shown during playback)
      decisionNote: 'Entry point.', // narrative context (shown in step list)
      annotation: 'Free-text sticky note shown on the canvas node.',
      db: { 'cart.count': 1 }, // step-level db patch applied when this step activates
    },
    {
      pageId: 'checkout-flow-cart',
      on: 'checkout',
      actionNote: 'Reviews cart, taps Checkout',
      // Conditional branch — forks are evaluated using the db at this step
      forks: [
        {
          label: 'Empty cart',
          db: { 'cart.count': 0 }, // db condition that takes this branch
          steps: [{ pageId: 'checkout-flow-cart-empty', actionNote: 'Sees empty state' }],
          // mergesTo: "next",  // rejoin the main flow after the fork; omit = terminal branch
        },
      ],
    },
    {
      pageId: 'checkout-flow-order-confirmation',
      actionNote: 'Sees confirmation',
      decisionNote: 'End of happy path.',
    },

    // Inline another flowStory's steps (page ids namespaced as "other-flowStory-id::page-id"):
    // { ref: "quick-reorder-flow" },
  ],
})
```

**Step fields summary:**

| Field          | Purpose                                                                                                                              |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------ |
| `pageId`       | Composite `${chapterId}-${pageId}` id of the screen to show (required) — see [Screen identity](#screen-identity-composite-ids) below |
| `on`           | Element id whose tap advances this step; omit for tap-anywhere                                                                       |
| `actionNote`   | What the user does — shown as caption during playback                                                                                |
| `decisionNote` | Narrative note shown in the step list                                                                                                |
| `annotation`   | Free-text sticky note shown on canvas node and step list                                                                             |
| `db`           | Dot-path patch applied to the chapter db when this step activates                                                                    |
| `forks`        | Inline conditional branches                                                                                                          |

**Fork fields:** `label`, `db` (condition patch), `steps`, `mergesTo: "next"` (rejoin) or omit (terminal).

**FlowStory composition:** `{ ref: "flowStory-id" }` inlines another flowStory's steps at that position. The referenced flowStory's page ids are namespaced as `flowStory-id::page-id` to avoid collisions.

### `flowStory:ls` / `fs:ls` — List flowStories

```bash
flowkit flowStory:ls
flowkit fs:ls
```

Lists all flowStories in the workspace. Shows: name, file path.

---

## Audit

```bash
flowkit audit
flowkit audit:<domain>
```

Domain-specific linter for authored content — validates flowkit's own structural conventions (page export shape, flowStory step references, workspace config consistency, component registry/barrel exports, mock db exports) that generic tools like `tsc`/`eslint` can't see. Works in every mode (repo, flat, multi-workspace).

`flowkit audit` with no domain runs all 6 domains against one workspace and prints one combined report. `flowkit audit:<domain>` runs just that domain:

| Domain     | Command            | Checks                                                                                      |
| ---------- | ------------------ | ------------------------------------------------------------------------------------------- |
| Page       | `audit:page`       | Default export shape, `pageMeta` presence/shape, id/directory match, ambiguous page folders |
| Chapter    | `audit:chapter`    | `manifest.ts`'s `chapters[]`/`pageOrder` consistency against `flowBook/` on disk            |
| Book       | `audit:book`       | Registered domain with no rules yet in this phase — reserved for future book-level checks   |
| Story      | `audit:story`      | Parseable, `id` matches filename, non-empty `steps[]`, step `pageId`s exist, step guidance  |
| Components | `audit:components` | `.flowkit/components.json` registry vs. files on disk, barrel export consistency            |
| DB         | `audit:db`         | `lib/data/db.ts`/`db.js` has at least one export                                            |

Target a non-active workspace: `flowkit audit:page:<workspace-name>` for a single domain (workspace as the second colon segment, same convention as `sessions:ls:<ws>`), or `flowkit audit --workspace:<workspace-name>` for the all-domains form.

Flags:

- `--json` — machine-readable output (`{ workspace, errors, warnings, results }`) instead of the human-readable report
- `--workspace:<name>` — target a non-active workspace when running all domains (`audit` with no domain)
- `--fix` — chapter-domain-only in this phase. Reconciles existence only: drops ghost `chapter/orphaned-id` entries and appends `chapter/orphaned-dir` entries to the end of that chapter's `pageOrder` array — it never repositions existing entries. On any other domain, prints `` `--fix` has no effect on the '<domain>' domain `` and does nothing.
- `--rebuild` — chapter-domain-only in this phase, and destructive to authored page/chapter order (it rebuilds purely from `flowBook/` on disk). Two-step gate: `--rebuild` alone computes and prints a diff of what `chapters[]`/`pageOrder` would become if fully regenerated from disk, but writes nothing; `--rebuild --confirm` recomputes fresh and actually writes.

Exit code 0 if clean or only warnings, 1 if any error-severity finding. `audit:story` is wired into `npm run prebuild` — a broken or missing flowStory blocks the production build (including an empty-but-existing `flowStories/` directory, which is treated as suspicious rather than silently passing). (This command was itself renamed from `check:flowStories` to `audit:story` as part of the `check`→`audit` rename; there is no back-compat alias — `flowkit check`/`check:pages` etc. now produce an "Unknown command" error.)

Findings include a `ruleId` (e.g. `page/missing-meta`, `story/invalid-page`), `severity` (`error`/`warning`), the offending `file`, a `message`, and where possible a `fix` (manual instructions) or `clifix` (an exact CLI command to run).

**`page/ambiguous-folder` (warning, non-blocking):** raised by `audit:page` when a page folder contains 2+ unprefixed candidate `.tsx`/`.jsx` files. The alphabetically-first file is deterministically picked as the real page; the finding names the winner and suggests `_`-prefixing, deleting, or renaming the other file(s) to remove the ambiguity. Never fails the build.

---

## Authoring

CRUD commands for editing the content inside a workspace — chapters, pages, flowStory steps, and shared components. Every command accepts `--workspace:<name>` (optional; defaults to the active workspace) and exits 1 with a red `✗` message on any validation failure. IDs must be kebab-case (`^[a-z][a-z0-9-]*$`) unless noted otherwise.

Work identically across all three modes. "Active workspace" (the default when `--workspace` is omitted) resolves differently per mode:

- **Repo mode** — `src/workspaces.json`'s `active` field, set by the browser UI or CLI.
- **Flat mode** — the one implicit workspace (project root); `--workspace` has nothing else to target.
- **Multi-workspace mode** — the first entry (by key order) in `package.json`'s `flowkit.workspaces` object. Pass `--workspace:<name>` to target a different one (e.g. `flowkit create:chapter --name:checkout --workspace:app-b`).

### Chapters

#### `create:chapter` — Add a chapter

```bash
flowkit create:chapter --name:<flow-id>
```

Creates `flowBook/<flow-id>/` and registers it in `manifest.ts` (`chapters[]` + an empty `pageOrder[flow-id]`). If `--name` is omitted, prompts interactively. Rolls back the created directory if registration fails.

Prints `Next: flowkit create:page --chapter:<flow-id> --name:<first-page> --label:"Page Name"` on success.

#### `remove:chapter` — Remove a chapter

```bash
flowkit remove:chapter --name:<flow-id> [--force]
```

Unregisters the chapter from `manifest.ts` and deletes `flowBook/<flow-id>/`. Refuses if the chapter directory contains any pages unless `--force` is passed.

#### `list:chapters` — List chapters

```bash
flowkit list:chapters
```

Read-only. Lists every chapter with its page count and a total.

### Pages

Page ids are **unique across the whole workspace**, not just within their chapter — `create:page`/`rename:page` both check this.

#### Screen identity (composite ids)

A page's identity is derived from its position in `flowBook/`, never from its filename:

```
flowBook/<flow>/.../<screen>/<File>.tsx
```

- The **first** path segment after `flowBook/` is the chapter id.
- The **last** folder before the file is the page id.
- Any folders in between are purely cosmetic/organizational — ignored for identity, kept only for on-disk display.
- A file directly at `flowBook/<File>.tsx` (no folders at all) falls back to chapter id `"misc"`, with the page id taken from the filename minus extension.
- Page files no longer need to end in a literal `Screen`/`Page` suffix — `create:page` still generates `...Page.tsx` by convention/default, but hand-authored files aren't required to follow it.

The registered, globally-unique page id is a **composite**: `${chapterId}-${pageId}`. This makes ids collision-proof across chapters — two different chapters can each have a page folder literally named the same thing without colliding. FlowStory step `pageId` values (and any other cross-chapter/global reference) use this composite form. `manifest.ts`'s `pageOrder` map is the one exception — it stays **bare** (page id only, no chapter prefix), because that map is already chapter-scoped by its own outer key (`pageOrder['onboarding-flow'] = ['welcome-screen', ...]`).

**One real page per folder:** if 2+ unprefixed candidate `.tsx`/`.jsx` files exist in the same page folder, the alphabetically-first one is deterministically picked as the real page, and `flowkit audit:page` reports a non-blocking `page/ambiguous-folder` warning naming the winner and suggesting you `_`-prefix, remove, or rename the others. This never fails the build.

#### Screen visibility (hidden vs. non-existent)

A single underscore prefix (`_name`) on a file or folder segment marks it **Hidden**: still fully parsed, compiled, checked, playable, and referenceable by flowStories — just excluded from the default Screens-tab browsing UI. A double underscore prefix (`__name`) marks it **non-existent**: excluded from everything — parsing, checks, flowStory reference resolution, and `flowkit status` counts.

Visibility is resolved across the whole path, with parent dominance: if _any_ ancestor segment has a `__` prefix, the entire subtree is non-existent regardless of what's inside it; otherwise, if any ancestor has a single `_`, the whole subtree is hidden.

#### `create:page` — Add a page to a chapter

```bash
flowkit create:page --chapter:<flow-id> --name:<screen-id> [--label:"Display Label"]
```

Creates `flowBook/<flow-id>/<screen-id>/<PascalName>Page.tsx` from a template and registers it in `manifest.ts` (`pageOrder.<flow-id>[]`, storing the bare page id). The chapter must already exist. `--label` defaults to a Title Case version of the page id if omitted. The CLI always generates the standard 2-level shape (`<flow>/<screen>/`, no cosmetic folders in between) — variable-depth nesting with cosmetic folders is a hand-authoring capability, not something this command produces itself.

Prints `Next: flowkit add:step --flowStory:<flow-id> --page:<screen-id> --action:"..."` on success.

#### `remove:page` — Remove a page

```bash
flowkit remove:page --chapter:<flow-id> --name:<screen-id>
```

Unregisters the page and deletes its directory. If any flowStory still references the page id, prints a warning listing the affected flowStories but does not block the removal or edit them for you. Assumes the CLI's own 2-level shape (`flowBook/<flow>/<screen>/`) — a hand-authored page nested deeper under cosmetic folders isn't located or removed by this command.

#### `rename:page` — Rename a page

```bash
flowkit rename:page --chapter:<flow-id> --name:<old-id> --to:<new-id>
```

Renames the directory and the `.tsx` file (including the exported component function name), and updates `pageOrder`. The new id must not already exist anywhere in the workspace. Like `remove:page`, warns about but does not update flowStory references to the old id. The filename patch assumes the CLI's own `...Page.<ext>` naming convention; a page hand-renamed away from that suffix won't be matched and the rename falls through to a "not found" error rather than crashing.

#### `move:page` — Move a page to a different chapter

```bash
flowkit move:page --name:<page-id> --from-chapter:<chapter-id> --to-chapter:<chapter-id>
```

Moves the page's directory and updates `pageOrder` on both chapters. The destination chapter must already exist.

#### `list:pages` — List pages

```bash
flowkit list:pages [--chapter:<flow-id>]
flowkit list:pages --hidden           # also show `_`-prefixed hidden pages
flowkit list:pages --all              # show every visibility tier, labeled
flowkit list:pages --gone             # show ONLY `__`-prefixed non-existent items
```

Read-only. Lists pages grouped by chapter, or just the one chapter if `--flow` is given. By default, hidden (`_`-prefixed) pages are omitted from the list; `--hidden` includes them (tagged `(hidden)`); `--all` shows hidden pages plus a separate non-existent (`__`) section; `--gone` is the dedicated way to find non-existent items, since they're excluded from every other listing mode by design (they're not "registered" pages at all) — this flag scans the filesystem directly rather than reading `manifest.ts`.

#### `page:info` — Show page metadata

```bash
flowkit page:info --chapter:<flow-id> --name:<screen-id>
```

Read-only. Prints the page's `label`/`desc` (from `pageMeta`) and its import list, read directly from the `.tsx` file.

### FlowStory steps

#### `add:step` — Append a step to a flowStory

```bash
flowkit add:step --flowStory:<flowStory-id> --page:<screen-id> [--on:<element-id>] [--action:"..."] [--position:<n>]
```

Appends `{ pageId, on?, actionNote? }` to the flowStory's `steps[]`. `screen-id` must already be registered somewhere in the workspace (across any chapter) — on failure, prints a "did you mean" suggestion plus the full list of known pages. `--position` inserts at that 0-based index instead of the end; an unparseable or omitted `--position` appends to the end.

⚠️️ Rewrites the `steps: [...]` block with a non-greedy regex — on a flowStory whose first step array contains a nested `forks[].steps[...]`, this can match the wrong closing bracket. Review the file after running this on a flowStory with forks.

#### `remove:step` — Remove a step by index

```bash
flowkit remove:step --flowStory:<flowStory-id> --index:<n>
```

Removes the step at the given 0-based index. ⚠️️ **`--index` is required in practice but not enforced** — if omitted, the command does not error; it silently removes step **0** instead (via `steps.splice(NaN, 1)`, and `NaN` coerces to `0`) and still prints a "✓ Removed" confirmation naming whatever step actually sat at index 0. Always pass `--index` explicitly and double check with `list:steps` afterward.

#### `list:steps` — List a flowStory's steps

```bash
flowkit list:steps --flowStory:<flowStory-id>
```

Read-only. Prints each step's index, page id, `on`, and `actionNote`.

#### `flowStory:info` — Show flowStory summary

```bash
flowkit flowStory:info --name:<flowStory-id>
```

Read-only. Prints id, name, description, step count, and the first 5 steps.

### Components

#### `create:component` — Add a shared component

```bash
flowkit create:component --name:<PascalName> --path:<lib/components/...> [--desc:"..."]
```

`--name` must be PascalCase (`^[A-Z][A-Za-z0-9]+$`, 2+ characters), e.g. `StatusBadge`. Writes `<path>/<Name>.tsx` from a template, registers it in `.flowkit/components.json`, and — if a barrel `index.ts` exists at or above `--path` — appends `export { default as <Name> } from './...'` to it (skipped if already exported). If no barrel is found, prints a reminder to add the export manually or run `add:export`.

#### `remove:component` — Remove a shared component

```bash
flowkit remove:component --name:<ComponentName> [--path:<lib/components/...>]
```

Deletes the `.tsx` file (if present — does not error if it's already gone) and removes both the barrel export and the `.flowkit/components.json` entry. Looks up the path from the registry unless `--path` is given explicitly.

#### `components:find` — Look up a component

```bash
flowkit components:find --name:<ComponentName>
```

Read-only. Checks the registry first, then falls back to scanning `lib/components/` on disk if not registered. Suggests `create:component` if found nowhere, or `components:scan` if found on disk but unregistered.

#### `components:ls` — List registered components

```bash
flowkit components:ls [--path:<prefix>]
```

Read-only. Lists every registered component, marking whether its file actually exists on disk, optionally filtered to a path prefix.

#### `components:scan` — Sync the registry from disk

```bash
flowkit components:scan
```

Walks `lib/components/` for any `.tsx` file starting with an uppercase letter (excluding `index.*`) and registers any not already known. Use after manually adding component files outside `create:component`.

#### `add:export` — Add a barrel export

```bash
flowkit add:export --barrel:<path/to/index.ts> --name:<ExportName>
```

Appends `export { default as <Name> } from './<Name>'` to the given barrel file. The source file (`<Name>.tsx` or `.ts`) must already exist next to the barrel. No-ops (not an error) if the export already exists.

#### `list:exports` — List a barrel's exports

```bash
flowkit list:exports --barrel:<path/to/index.ts>
```

Read-only. Lists every `export { ... } from '...'` line in the barrel file.

### `promote:chapter` — Extract a fork into its own flowStory file

```bash
flowkit promote:chapter --flowStory:<path> --fork:"Fork label" [--as:<new-id>]
```

Finds the fork by matching `label: "Fork label"` — single, double, and backtick quotes around
the label in the source are all accepted, so this works regardless of which quote style the
flowStory file uses — and writes its `steps[]` into a brand-new flowStory file (named
`${PascalCase(slug)}.ts`, not a kebab-case filename). Does **not** edit the source file — it
prints the exact `{ ref: "<new-id>" }` snippet to paste in by hand, replacing the fork. `--as`
sets the new flowStory's id explicitly; otherwise it's derived by slugifying the fork label.

---

## Export

> **Works in every mode** (repo, flat, multi-workspace) as of 2026-07-12. `handoff` remains repo-mode only — it zips the dev repo for developer handoff, a different feature from the standalone export.

### `export` — Export as standalone HTML

```bash
flowkit export
flowkit export --workspace:<name>
flowkit export --profile:<name>
```

A single guided flow, identical in every mode:

1. **Workspace step** — only asked when there's more than one candidate: repo mode with 2+ workspaces in `workspaces/`, or multi-workspace consumer mode with 2+ entries in `flowkit.workspaces`. Flat mode never asks (one implicit workspace). Repo mode / multi-workspace mode with exactly one workspace also skips it. Pass `--workspace:<name>` to skip the prompt explicitly.
2. **Profile step** — always asked unless `--profile:<name>` is given. Lists "Default (full export)" plus any named profiles declared in `flowkit.json`'s `exportProfiles` (see [Export profiles](#export-profiles) below).

Runs two pre-flight checks before building. Export is blocked if either fails:

| Check                       | What it catches                                                                                                                        |
| --------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| TypeScript (`tsc --noEmit`) | Type errors, missing imports                                                                                                           |
| ESLint                      | Unused vars, hook violations, bad patterns — **skipped** (with a notice) if the project has no ESLint config, rather than hard-failing |

Every export always ships the full codebase — there's no FlowLens include/exclude distinction right now (removed 2026-07-12 pending a proper feature-gating design; see `temp-docs/flowkit-configs-plans.md` for why).

**Output location:** defaults to `dist-standalone/` in repo mode, `dist/` in consumer mode — both already gitignored. Override per-profile via `flowkit.json`'s `exportPath` (see below).

### Export profiles

Optional `flowkit.json` at the project root (repo `ROOT`, or the consumer project root in flat/multi-workspace mode) — plain JSON, not authored via `defineConfig()`:

```json
{
  "exportDefaults": {
    "exportPath": "./dist"
  },
  "exportProfiles": {
    "client-demo": {
      "exportPath": "./output",
      "exportName": "{workspace}-{profile}-{timestamp}"
    }
  }
}
```

- `exportProfiles.<name>.exportPath` / `exportName` override `exportDefaults`, which falls back to the built-in default output location (see above) and filename template `{workspace}-{profile}-{timestamp}`.
- `exportName` tokens: `{workspace}`, `{profile}`, `{date}`, `{time}`, `{timestamp}`.
- Missing `flowkit.json` entirely → treated as empty (`exportDefaults: {}`, `exportProfiles: {}`), not an error — the profile prompt just shows "Default (full export)" with nothing else to pick.
- In multi-workspace mode, profiles are shared across all workspaces (one flat set, not per-workspace).

**Consumer mode also needs `vite-plugin-singlefile`** — auto-installed on first export if missing from the project's own `node_modules` (prints a one-line notice first).

---

## Sessions (FlowTracer / FlowLens)

Works in all three modes — confirmed via `sessions:ls` in a scaffolded flat-mode project. FlowTracer records prototype sessions to the browser's IndexedDB; FlowLens replays them. These commands manage the **committed session library** on disk — `workspaces/<ws>/lib/flowLens/sessions/<study>/` (repo mode) or `lib/flowLens/sessions/<study>/` at the workspace root (consumer mode).

> **Browser → disk bridge:** The CLI cannot read IndexedDB directly. Export a session from the app's Export overlay to get a `.json` file, then import it with `sessions:import`. Alternatively, in dev mode, use the Archive icon in the FlowLens Recorded tab to promote a session to the library without leaving the browser.

All commands default to the **active** workspace (see [Authoring](#authoring) above for how "active" resolves per mode); append `:<name>` to target another workspace (e.g. `sessions:ls:other`) — note this is a different convention from Authoring's `--workspace:<name>` flag.

---

### Studies

Sessions are organised into named **study rounds** (e.g. "Initial Study", "Round 2 — Post Revision"). Each study maps to a subdirectory under `sessions/`. The `activeStudyId` in `studies.json` determines where the next import or in-browser Save lands.

### `sessions:study:ls` — List studies

```bash
flowkit sessions:study:ls
flowkit sessions:study:ls:<ws>
```

Lists all studies with session count, active marker (●), and archive status.

### `sessions:study:new` — Create a study

```bash
flowkit sessions:study:new:<ws> "Round 2 — Post Revision"
flowkit sessions:study:new:<ws> "Round 2" --desc "After home screen redesign"
```

Slugifies the name to an id (`round-2-post-revision`), creates the directory, and sets it as the active study.

### `sessions:study:active` — Get or set the active study

```bash
flowkit sessions:study:active:<ws>              # print current
flowkit sessions:study:active:<ws> "Round 2"    # set by name or id
```

### `sessions:study:archive` — Archive a study

```bash
flowkit sessions:study:archive:<ws> "Initial Study"
flowkit sessions:study:archive:<ws> "initial-study" --force   # skip confirm
```

Sets `status: archived` and clears `activeStudyId` if it pointed here. Sessions are preserved on disk.

---

### `sessions:ls` — List committed sessions

```bash
flowkit sessions:ls            # active workspace, all studies
flowkit sessions:ls:other      # specific workspace
flowkit sessions:ls --study "Round 2"   # filter to one study
flowkit sessions:ls --json     # machine-readable output
```

Shows name, study, date, event count, screen count, and quality% per session.

### `sessions:import` — Import an exported session

```bash
flowkit sessions:import ~/Downloads/run.flowkit-session.json
flowkit sessions:import run.json --study "Round 2"   # target specific study
flowkit sessions:import run.json --force             # override workspaceId mismatch
```

Validates the file is a `SessionExport`, checks `meta.workspaceId` matches the target, warns if the session's screen ids don't exist in the workspace (replay disabled — analytics still work), dedupes by `meta.id`, and files it into the active study (or `--study` override).

### `sessions:export` / `se` — Export a committed session back to disk

The colon segment (if present) is the **workspace**, not the session — the session id/name/filename is always a separate argument:

```bash
flowkit sessions:export <id|name|file>              # active workspace
flowkit sessions:export:<ws> <id|name|file>          # specific workspace
flowkit sessions:export:<ws> <id|name|file> --dest ./handoffs/
flowkit se:<ws> <id|name|file>                       # short alias, same rule
```

Reads a session from the committed library by id, name, or filename and writes it to `--dest` (default: `./<slug>-<id>.flowkit-session.json`).

### `sessions:check` — Validate the library

```bash
flowkit sessions:check
```

Flags malformed JSON, wrong `workspaceId`, duplicate ids, and cross-workspace screen mismatches. Exits non-zero on errors.

| Check        | What it catches                                          |
| ------------ | -------------------------------------------------------- |
| JSON / shape | Unparseable files, missing `meta.id`, non-array `events` |
| Workspace    | `meta.workspaceId` ≠ the target workspace                |
| Duplicates   | Two files sharing a `meta.id`                            |
| Screens      | No recorded screen id exists in the workspace            |

### `sessions:stats` — Library roll-up

```bash
flowkit sessions:stats
```

Terminal summary: session count, total events, avg quality, completion rate, and top frustrated screens.

### `sessions:sample` — Generate a synthetic session

```bash
flowkit sessions:sample
```

Writes a valid `SessionExport` (screens pulled from the workspace's flows, marked `[test]`) into the active study. Remove it with `sessions:rm`.

### `sessions:rm` — Remove a committed session

```bash
flowkit sessions:rm <id | name | file.json>
```

### `sessions:purge` / `sp` — Bulk remove sessions

```bash
flowkit sessions:purge --test-only
flowkit sessions:purge --older-than:30
flowkit sessions:purge --test-only --older-than:30 --study "Initial Study"
flowkit sp --test-only
```

Removes sessions matching the filter criteria. Shows a count of what will be deleted and asks `[y/N]` before proceeding.

- `--test-only` — remove sessions where `meta.isTestMode: true`
- `--older-than:<N>` — remove sessions older than N days
- `--study <name|id>` — scope the purge to one study
- Flags combine (AND'd)

### `sessions:report` — Generate analytics report

```bash
flowkit sessions:report
flowkit sessions:report:<ws>
flowkit sessions:report:<ws> --format both          # JSON + Markdown
flowkit sessions:report:<ws> --study "Round 2"      # scope to one study
flowkit sessions:report:<ws> --format md --agent    # append MD to .agent/project.md
flowkit sessions:report:<ws> --dest ./custom-dir/
```

Aggregates committed (non-test) sessions into a report. Output lands in `workspaces/<ws>/lib/flowLens/reports/` (gitignored) unless `--dest` overrides.

Flags:

| Flag                      | Description                                                            |
| ------------------------- | ---------------------------------------------------------------------- |
| `--format json\|md\|both` | Output format. Default: `json`                                         |
| `--study <name\|id>`      | Scope to sessions from one study                                       |
| `--agent`                 | Append Markdown brief to `.agent/project.md` instead of writing a file |
| `--dest <path>`           | Override output directory                                              |

JSON report shape:

```json
{
  "workspace": "my-app",
  "study": "round-2",
  "sessionCount": 12,
  "avgQuality": 74,
  "completionRate": 0.67,
  "topFrustratedScreens": [
    ["cart-screen", 5],
    ["checkout-screen", 3]
  ],
  "sessionList": [{ "id": "...", "name": "...", "startTime": "..." }]
}
```

**Aliases (backward compat):**

```bash
flowkit lens:report:<ws>              # same as --format json
flowkit lr:<ws>
flowkit sessions:brief:<ws>          # same as --format md
flowkit sessions:brief:<ws> --append # same as --agent
```

---

## Feedback

Works in all three modes — confirmed via `feedback:ls` in a scaffolded flat-mode project. Feedback comments live in the browser's local storage during active sessions. These commands let you commit a snapshot to disk (`workspaces/<ws>/.flowkit-feedback.json` in repo mode, `.flowkit-feedback.json` at the workspace root in consumer mode) so it travels with the workspace and can be reviewed without opening the app.

> **UI bridge:** The feedback panel's "Export" button writes a JSON file and can emit the corresponding `flowkit feedback:import <file>` command — paste it to commit the snapshot.

### `feedback:import` / `fi` — Commit feedback from a file

```bash
flowkit feedback:import ./feedback-export.json
flowkit fi ./feedback-2024-01-15.json
```

Reads a feedback JSON file (exported from the feedback panel), validates its shape (`{ comments: FeedbackComment[] }`), and writes it to `workspaces/<ws>/.flowkit-feedback.json` as the committed snapshot.

### `feedback:dump` / `fd` — Export committed feedback to disk

```bash
flowkit feedback:dump
flowkit feedback:dump --dest ./handoffs/
flowkit fd
```

Reads the committed snapshot at `workspaces/<ws>/.flowkit-feedback.json` and writes it to `--dest` (default: `./feedback-<ws>-<date>.json`). Use this to hand off a feedback archive or re-import into another workspace.

### `feedback:ls` — List committed comments

```bash
flowkit feedback:ls
```

Lists comments from the committed snapshot: reviewer, screen, status, short text, date.

---

## Agent onboarding

Every workspace ships an **agent-ready** file set so a coding agent can start building immediately without reading the whole codebase. All files are generated from a single platform spec (`scripts/platform/agent-spec.js`).

> ⚠️️ **Known gap (as of 2026-07-10, alias names updated 2026-07-12): `agent:sync` generates repo-mode-only content even in consumer mode.** Confirmed live in a scaffolded flat-mode project — `.agent/platform.md` points at `Documentation/*.md` files that don't ship to consumer projects at all, and references `@flowkit-shared`/`@flowkit` path aliases that don't exist outside this repo (consumer-mode screens import from `'flowkit'` instead — see [Writing a screen](../README.md#writing-a-screen)). The command itself runs successfully and produces valid files (`INDEX.md`, `rules.md`, `platform.md`, memory file) — the _content_ of `platform.md` just assumes repo mode unconditionally. Treat its pointers/import-path examples as reference-only in consumer mode until this is fixed.

**Read order for a cold agent:**

1. **`AGENTS.md`** — auto-ingested by most coding-agent tools; identity, read-order, hardest directives. One agent-agnostic file — there is no per-tool choice (`CLAUDE.md`/`.cursor/rules` targets were removed; a workspace scaffolded before this change may still have a leftover `CLAUDE.md` on disk from the old system, but new/resynced workspaces only ever get `AGENTS.md`)
2. **`.agent/INDEX.md`** — the map: `Task → Action → Detail`
3. **`.agent/rules.md`** — full directive set (`NEVER` / `ALWAYS` / `TO <task> → <action>`)
4. **`.agent/platform.md`** — terse platform reference, rows pointing to `Documentation/*.md`
5. **`.agent/project.md`** — hand-owned product brief; **never** regenerated

### `agent:sync` — Regenerate from the spec

```bash
flowkit agent:sync                       # active workspace
flowkit agent:sync:<name>                # specific workspace
```

Re-emits `.agent/INDEX.md`, `rules.md`, `platform.md`, and `AGENTS.md`. Never touches `project.md`. Run after platform changes.

---

## Build (developer handoff)

> **Repo mode only** — see the note at the top of [Export](#export).

### `handoff` — Generate developer handoff zip

```bash
flowkit handoff
flowkit handoff:<name>
```

Builds the selected workspace into a self-contained React app with no Flowkit dependency.

Output: `<name>-handoff-<date>.zip` at the project root.

---

## Import aliases

**Repo mode:**

| Alias                | Resolves to            |
| -------------------- | ---------------------- |
| `@flowkit/`          | `src/`                 |
| `@flowkit-core/`     | `src/core/`            |
| `@flowkit-features/` | `src/features/`        |
| `@flowkit-shared/`   | `src/shared/`          |
| `@flowkit-kit/`      | `src/kits/shared/`     |
| `@flowlens/`         | `src/modes/flowlens/`  |
| `@workspace/`        | `workspaces/<active>/` |

(Renamed from `@flowkit`/`@core`/`@features`/`@shared`/`@kit` on 2026-07-12; `@flowlens` and `@workspace` unchanged.)

**Consumer mode (flat/multi-workspace):** no `@flowkit*`/`@workspace` aliases — screens and `manifest.ts` import directly from the `'flowkit'` package instead (`import { defineConfig } from 'flowkit'`, `import type { PageProps } from 'flowkit'`). The `flowkit/vite` plugin (`scripts/helpers/vite-plugin.js`) generates equivalent virtual modules (`virtual:flowkit/config|pages|flowStories|workspace`) from `manifest.ts` + filesystem globs, resolved relative to the active workspace folder in multi-workspace mode (the first entry in `flowkit.workspaces` by default) or project root in flat mode.

---

## State

**Repo mode:** flowkit tracks the active workspace in `src/workspaces.json`/`src/workspaces.ts`. CLI state is stored in `scripts/.flowkit-state.json` — local only, not committed.

**Consumer mode:** mode and workspace list live in the project's own `package.json` under the `flowkit` key (see [Workspaces (flat/multi-workspace consumer mode)](#workspaces-flatmulti-workspace-consumer-mode)) — committed, not local state. `flowkit.workspaces` is an object keyed by workspace name with an explicit `path` (e.g. `{ "workspace-1": { "path": "workspace-1" } }`), not just a name list — folder location is declared, not assumed. There is no separate active-workspace pointer yet; the first entry (by key order) is always what `npm run dev`/`npm run build` serve.

---

## Quick reference

Commands grouped by item type. Click the heading to jump to the full section.

### Meta

| Command   | Alias               | Description                    |
| --------- | ------------------- | ------------------------------ |
| `help`    | `h`, `-h`, `--help` | Show CLI usage help            |
| `version` | `-v`, `--version`   | Show installed flowkit version |

### [Workspaces (repo mode)](#workspaces-repo-mode)

| Command                     | Alias | Description                             |
| --------------------------- | ----- | --------------------------------------- |
| `new-workspace[:<name>]`    | `nw`  | Create workspace (repo mode only)       |
| `remove-workspace[:<name>]` | `rw`  | Remove workspace (repo mode only)       |
| `watch[:<name>]`            | —     | Watch for file changes (repo mode only) |
| `status[:<name>]`           | —     | Workspace health snapshot (all modes)   |

### [Workspaces (flat/multi-workspace consumer mode)](#workspaces-flatmulti-workspace-consumer-mode)

| Command                              | Alias | Description                                    |
| ------------------------------------ | ----- | ---------------------------------------------- |
| `convert:multi [--name:<id>]`        | —     | Convert flat mode to multi-workspace mode      |
| `convert:flat [--from:<id>] [--all]` | —     | Collapse multi-workspace mode back to flat     |
| `create:workspace [--name:<id>]`     | —     | Add a workspace (multi-workspace mode only)    |
| `remove:workspace [--name:<id>]`     | —     | Remove a workspace (multi-workspace mode only) |
| `rename:workspace <old> <new>`       | —     | Rename a workspace (multi-workspace mode only) |

### [FlowStories](#flowstories)

| Command        | Alias   | Description      |
| -------------- | ------- | ---------------- |
| `flowStory:ls` | `fs:ls` | List flowStories |

### [Audit](#audit)

| Command            | Description                                |
| ------------------ | ------------------------------------------ |
| `audit`            | Run all 6 domain checkers, combined report |
| `audit:page`       | Page export shape / `pageMeta`             |
| `audit:chapter`    | Workspace config vs. `flowBook/` on disk   |
| `audit:book`       | Registered domain, no rules yet            |
| `audit:story`      | FlowStory structure / step references      |
| `audit:components` | Component registry / barrel exports        |
| `audit:db`         | Mock db exports                            |

### [Authoring](#authoring)

| Command            | Alias | Description                                |
| ------------------ | ----- | ------------------------------------------ |
| `create:chapter`   | —     | Add a chapter                              |
| `remove:chapter`   | —     | Remove a chapter (`--force` if non-empty)  |
| `list:chapters`    | —     | List chapters                              |
| `create:page`      | —     | Add a page to a chapter                    |
| `remove:page`      | —     | Remove a page                              |
| `rename:page`      | —     | Rename a page                              |
| `move:page`        | —     | Move a page to a different chapter         |
| `list:pages`       | —     | List pages                                 |
| `page:info`        | —     | Show page metadata                         |
| `create:flowStory` | —     | Add a flowStory                            |
| `remove:flowStory` | —     | Remove a flowStory (`--force`)             |
| `add:step`         | —     | Append a step to a flowStory               |
| `remove:step`      | —     | Remove a step by index                     |
| `list:steps`       | —     | List a flowStory's steps                   |
| `flowStory:info`   | —     | Show flowStory summary                     |
| `create:component` | —     | Add a shared component                     |
| `remove:component` | —     | Remove a shared component                  |
| `components:find`  | —     | Look up a component                        |
| `components:ls`    | —     | List registered components                 |
| `components:scan`  | —     | Sync the registry from disk                |
| `add:export`       | —     | Add a barrel export                        |
| `list:exports`     | —     | List a barrel's exports                    |
| `promote:chapter`  | —     | Extract a fork into its own flowStory file |

### [Sessions](#sessions-flowtracer--flowlens)

| Command                                   | Alias | Description                                                                            |
| ----------------------------------------- | ----- | -------------------------------------------------------------------------------------- |
| `sessions:ls`                             | —     | List committed sessions                                                                |
| `sessions:import <file>`                  | —     | Import a session into committed library                                                |
| `sessions:export[:<ws>] <id\|name\|file>` | `se`  | Export a committed session to disk (workspace via colon, target always a separate arg) |
| `sessions:check`                          | —     | Validate the session library                                                           |
| `sessions:stats`                          | —     | Library roll-up stats                                                                  |
| `sessions:sample`                         | —     | Generate a synthetic test session                                                      |
| `sessions:rm <id\|name>`                  | —     | Remove a committed session                                                             |
| `sessions:purge`                          | `sp`  | Bulk remove sessions by filter                                                         |
| `sessions:report`                         | —     | Generate JSON/MD analytics report                                                      |
| `sessions:brief`                          | —     | _(alias)_ sessions:report --format md                                                  |
| `lens:report`                             | `lr`  | _(alias)_ sessions:report --format json                                                |
| `sessions:study:ls`                       | —     | List studies                                                                           |
| `sessions:study:new`                      | —     | Create a new study                                                                     |
| `sessions:study:active`                   | —     | Get or set the active study                                                            |
| `sessions:study:archive`                  | —     | Archive a study                                                                        |

### [Feedback](#feedback)

| Command                  | Alias | Description                       |
| ------------------------ | ----- | --------------------------------- |
| `feedback:import <file>` | `fi`  | Commit feedback from a JSON file  |
| `feedback:dump`          | `fd`  | Export committed feedback to disk |
| `feedback:ls`            | —     | List committed comments           |

### [Export & Handoff](#export)

| Command                                          | Alias | Description                                               |
| ------------------------------------------------ | ----- | --------------------------------------------------------- |
| `export [--workspace:<name>] [--profile:<name>]` | —     | Standalone HTML export — guided flow, works in every mode |
| `handoff[:<name>]`                               | —     | Developer handoff zip — **repo mode only**                |

### [Agent](#agent-onboarding)

| Command               | Alias | Description                      |
| --------------------- | ----- | -------------------------------- |
| `agent:sync[:<name>]` | —     | Regenerate agent files from spec |
