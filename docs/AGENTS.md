# Agent Workflows

How a coding agent works inside a FlowKit workspace — the cold-start sequence, the
recipes for common tasks, and the system that keeps the agent's instructions accurate.

This is the _workflow_ companion to the reference docs (FLOWKIT / FLOWMASTER / FLOWLENS /
CLI). Those describe the platform; this describes how to operate it.

Works the same across repo mode, flat mode, and multi-workspace mode — see [CLI.md](CLI.md) for what differs per mode. Examples below use repo-mode paths (`workspaces/<ws>/...`); in consumer mode, drop that prefix — the same files sit at the workspace's own root.

---

## The agent file system

> ⚠️ **This section describes repo mode only.** `.agent/INDEX.md`, `.agent/rules.md`,
> `.agent/platform.md`, and `.agent/project.md` are all produced by
> `scripts/platform/agent-sync.js`, which operates on this monorepo's own
> `workspaces/<name>/` — it is not invoked by, and has no equivalent in,
> `create-flowkit-app`/`create-flowkit-mono` (flat/multi-workspace consumer mode). A
> scaffolded consumer project gets exactly one generated file, the same agent-agnostic
> `AGENTS.md` repo mode now produces (see `writeAgentsMd()` in each scaffolder's
> `index.js`), plus a copy of this `docs/` folder — no `.agent/` directory, no
> `agent:sync`. Confirmed live 2026-07-21.

Every **repo-mode** workspace ships a generated, layered file set so an agent can start
building without reading the codebase. All of it is rendered from a **single source of
truth** (`scripts/platform/agent-spec.js`) by `scripts/platform/agent-sync.js`, so it never
drifts from the platform.

There is **no per-tool choice of memory file** — every workspace gets one agent-agnostic
`AGENTS.md`, matching what the consumer-mode scaffolders always produced. (An older
per-tool target system — `--agent:claude|agents|cursor|none`, emitting `CLAUDE.md` /
`AGENTS.md` / `.cursor/rules/flowkit.mdc` — existed here previously and was removed; a
workspace scaffolded before the removal may still have a leftover `CLAUDE.md` on disk,
untouched by this change, but re-running `agent:sync` on it now produces `AGENTS.md`
instead.)

| Layer     | File                      | Role                                                                                    |
| --------- | ------------------------- | --------------------------------------------------------------------------------------- |
| Memory    | `AGENTS.md`               | Auto-ingested by most coding-agent tools. Identity, read-order, the hardest directives. |
| Map       | `.agent/INDEX.md`         | `Task → Action → Detail`. The fast lookup — every task in one hop.                      |
| Rules     | `.agent/rules.md`         | The full directive set (`NEVER` / `ALWAYS` / `TO … → …`).                               |
| Reference | `.agent/platform.md`      | Terse surface map; each row points to further detail.                                   |
| Product   | `.agent/project.md`       | Hand-owned brief: what the product is. **Never regenerated.**                           |
| State     | `.agent/.agent-meta.json` | `{ kit, language, specVersion }` written by `agent:sync`.                               |

> ⚠️ **Within repo mode**, confirmed live 2026-07-10: `.agent/platform.md`'s rows point at
> `Documentation/*.md` files and `@flowkit`/`@shared` path aliases specific to this
> monorepo. `agent:sync` runs successfully here; the note above is about consumer mode not
> having this system at all, which is a separate, larger gap than platform.md's content
> being repo-mode-flavored.

### Cold-start sequence (what an agent reads, in order)

1. **memory file** — already in context; gives identity + the non-negotiables + the read order.
2. **`.agent/rules.md`** — the directives it operates under.
3. **`.agent/INDEX.md`** — the map; from here, jump straight to the task.
4. **`.agent/platform.md`** — terse surface map; each row points to the full doc. Read only when a rules/INDEX row points there.
5. **`.agent/project.md`** — what _this_ product is (flows, data model, decisions).
6. Full reference docs (this `docs/` folder) **only when a rules/INDEX row points there.**

The point: the agent never blind-searches and never reads a book. It looks a task up in the
INDEX and goes straight to the action.

---

## The directive grammar

Rules are written as machine-unambiguous directives, not prose to interpret:

- **`NEVER <x>`** — a hard stop. Doing `x` breaks the platform.
- **`ALWAYS <y>`** — the default behavior.
- **`TO <task> → <action>`** — the one right way to do `task`.

Example (from a generated `rules.md`):

```
NEVER reference flowBook/router.tsx or _playFlow.ts — flat-flowStory workspaces don't have them
ALWAYS read/mutate data via const db = useDb()
TO add a page → create flowBook/<flow>/<screen-slug>/<ScreenName>.tsx, then add a step in flowStories/<flow>.ts
```

The few hardest rules are inlined into the memory file so they're loaded before any file read.

---

## The non-negotiables (why they exist)

| Rule                                                                                                                                              | Why                                                                                                                                                                                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Never call `useDashboard()`'s `navigateTo` directly inside a page that relies on FlowMaster's guards/animations/recording during chapter playback | Use `useNav()` (or id-wiring) inside a chapter-only page so FlowMaster's guards, animations, and recorded `chapter.transition` fire. `useAppNav()` (`@flowkit-shared/utils`) is the correct way to make a page navigable both standalone from the Screens tab and during chapter playback — see "Navigation" below.  |
| Never hand-write chapter/page files from scratch                                                                                                  | Copy an existing page's boilerplate — the structure and exports must be consistent.                                                                                                                                                                                                                                  |
| Never edit platform source (`src/` in repo mode, `node_modules/flowkit/` in consumer mode)                                                        | That's the shared platform engine, not workspace content.                                                                                                                                                                                                                                                            |
| Never hardcode hex colors                                                                                                                         | Use `lib/design-system/tokens.css` vars or `useTheme()` tokens so kit/theme switching works.                                                                                                                                                                                                                         |
| Always use the right import for the mode you're in                                                                                                | Repo mode: `@flowkit/`/`@workspace/` aliases (renamed from `@platform` 2026-07-12). Consumer mode: import directly from `'flowkit'` — the `@flowkit*`/`@workspace` aliases only exist inside this monorepo, not in a scaffolded project. Relative `../../` paths break across the workspace boundary in either mode. |

---

## Workspace format

Workspaces use the **flowStory format**: `flowBook/<chapter>/<page>/<Page>.tsx` + `flowStories/*.ts` (directories renamed from `flows/`/`flowplans/`; the CLI verb `watch:flows` keeps its existing name regardless, but `check:flowplans` was itself renamed to `check:flowStories`, later renamed again to `audit:story`). Page folders may nest to any depth under `flowBook/<chapter>/` — see FLOWKIT.md's page-authoring section for the full identity/visibility rules. There is no `_playFlow.ts`, no `router.tsx`, no `projects/` directory (unless you've deliberately opted into the nested-layout `projects` field in `manifest.ts` — see CLI.md).

---

## Task recipes

The canonical way to do each common thing. (The INDEX routes here; the reference docs have full detail.)

### Add a page (flowStory format)

1. Create the page folder and component:

```
flowBook/<flow>/<screen-slug>/<ScreenName>.tsx
```

Boilerplate (copy from an existing page, then fill the body):

```tsx
// repo mode
import type { PageProps } from '@flowkit/types'
// consumer mode (flat/multi-workspace)
import type { PageProps } from 'flowkit'

export const pageMeta = {
  desc: 'Short description of what this page does',
}

export default function <ScreenName>Page({ db }: PageProps) {
  return (
    <div className="flex flex-col h-full">
      {/* page content */}
      <button id="primary-cta">Continue</button>
    </div>
  )
}
```

2. Add a step to `flowStories/<flow>.ts`:

```ts
{ pageId: '<flow>-<screen-slug>', on: 'primary-cta', actionNote: 'Taps Continue' },
```

(`pageId` here is the composite `${chapterId}-${pageId}` form — see FLOWKIT.md's page-authoring section. `manifest.ts`'s `pageOrder` map, by contrast, stores the bare `<screen-slug>`.)

Or use the CLI, which handles both steps and works in all three modes: `flowkit create:page --chapter:<flow-id> --name:<screen-slug>` then `flowkit add:step --flowStory:<flow-id> --page:<screen-slug> --action:"..."`.

> **To remove a page:** `flowkit remove:page --chapter:<flow-id> --name:<screen-slug>` (unregisters it and deletes the directory — safer than a manual `rm -rf`, since it also updates `manifest.ts`).

### Add a flowStory

Drop a `.ts` file into `flowStories/` using `defineFlow()`, or run `flowkit create:flowStory --name:<flow-id>`. Run `flowkit flowStory:ls` to confirm it's discovered, `flowkit audit:story` to validate.

### Add a flowStory step with a conditional fork

```ts
{
  pageId: 'cart',
  on: 'checkout',
  actionNote: 'Taps Checkout',
  forks: [
    {
      label: 'Empty cart',
      db: { 'cart.count': 0 },
      steps: [{ pageId: 'cart-empty', actionNote: 'Sees empty state' }],
      // mergesTo: 'next',  // rejoin the main flow; omit = terminal branch
    },
  ],
},
```

### Navigate from page logic (state / async) — repo mode only

```ts
const { navigateTo, goNext, goBack } = useNav()
const submit = async () => {
  if (await ok()) navigateTo('confirmation')
}
```

`useNav()` throws if the page has no `FlowMaster` ancestor — chapter playback only. Not
available in consumer mode (see below).

### Make a page also navigable from the Screens tab (no chapter active) — repo mode only

```ts
import { useAppNav } from '@flowkit-shared/utils'

export default function HomePage() {
  const { navigateTo } = useAppNav()
  return <button onClick={() => navigateTo('detail')}>Open</button>
}
```

`useAppNav()` reads whichever navigation context actually applies — FlowMaster's flow-aware
`navigateTo` when this page is rendered inside a chapter, `DashboardContext`'s otherwise — so calling
it unconditionally is correct in both places. No `isChapter` prop, no guard. `@flowkit-shared/utils`
is a repo-mode-only path alias — not exported from the public `flowkit` package.

### Navigate from a page — consumer mode (flat/multi-workspace)

There is no navigation hook. A page receives `onAction?`, `onNext?`, `onBack?` as props
(all `undefined` unless the page is currently playing inside a chapter — always optional-chain
them):

```ts
export default function HomePage({ onAction }: PageProps) {
  return <button onClick={() => onAction?.('open-detail')}>Open</button>
}
```

Prefer wiring a plain DOM `id` + a matching flowStory step's `on` field over calling `onAction`
for simple taps — `onAction`/`onNext`/`onBack` are the escape hatch for programmatic triggers
(async callbacks, form submits), not the default navigation path.

### Read / mutate data — repo mode

```ts
import { useDb } from '@flowkit-shared/utils'

const db = useDb() // wraps useDashboard()'s injected db/updateDb
db.update('cart.count', n => n + 1)
```

`useDb()`'s `get`/`has`/`set`/`remove`/`update` reject unsafe dot-path segments
(`__proto__`/`prototype`/`constructor`) instead of silently corrupting or no-opping. Falling back
to raw `const { db, updateDb } = useDashboard()` still works but carries no such guard — prefer
`useDb()` for any path-based read or write.

Seed data lives in `lib/data/db.ts`. → FLOWKIT.md (Mock database)

### Read / mutate data — consumer mode (flat/multi-workspace)

A page's `db` prop (`PageProps.db`) is **read-only** and `undefined` outside chapter
playback — there is no `useDashboard()`/`updateDb` hook here. Mutation happens in the
flowStory, not the page: give the interactive element an `id`, then add a
`ctx.updateDb()` call in that flowStory's `interactions[id].do`:

```ts
// flowStories/<flow>.ts
interactions: {
  'add-to-cart': {
    trigger: 'tap',
    do: (ctx) => { ctx.updateDb(db => { db.cart.count += 1 }) },
    goTo: 'cart',
  },
}
```

### Gate access (entry guards)

```ts
// in pageMeta:
canEnter:    ({ db }) => db.auth.isLoggedIn,
canNotEnter: ({ db }) => db.auth.isGuestUser,
```

### Style

Tailwind for static values; `style={{}}` only for dynamic/computed values; colors from tokens / `useTheme()`. The active kit's tokens are wired at workspace creation (repo mode) or scaffold time (consumer mode). → FLOWKIT.md (Kit system, Theming)

### Add a reviewer toggle

**Repo mode:** edit `lib/data/simulator.tsx` (a default-exported JSX component):

```tsx
<ControlAccordion label="Auth" defaultOpen>
  <SimToggle label="Logged in" bind="db.auth.isLoggedIn" />
</ControlAccordion>
```

Components: `ControlAccordion`, `SimToggle`, `SimSegmented`, `SimSelect`, `SimAction`, `SimTextInput`, `SimNumberInput`, `SimControl` — from `@flowkit-features/simulator/controls`. This JSX-component convention and its barrel are **repo-mode only**; neither is exported from the public `flowkit` package.

**Consumer mode (flat/multi-workspace):** there is no `simulator.tsx`/JSX API. Add a plain `SimulatorControl` data object to the relevant flowStory's `simulator.controls` array instead:

```ts
simulator: {
  controls: [
    { label: 'Logged in', path: 'auth.isLoggedIn', type: 'boolean', default: true },
  ],
}
```

`path` is a dot-path into the flow's db copy; `type` is one of `boolean` / `toggle` / `count` / `select` / `text` / `null-toggle`. See `FlowStoryDef`/`SimulatorControl` in `src/types/index.ts` for the full field set (`min`/`max`/`options`/`states`). → FLOWKIT.md (Simulator controls authoring)

### Work with recorded sessions

Recording is always on (the user drives it in-app). The committed library is CLI-managed and works in all three modes:

```bash
flowkit sessions:ls                  # list committed sessions
flowkit sessions:import <file.json>  # import a session export
flowkit sessions:check               # validate session integrity
flowkit sessions:stats               # aggregate stats across sessions
flowkit sessions:sample              # generate a synthetic test session
flowkit sessions:rm <id>             # remove a session
flowkit sessions:brief               # analytics brief (--append writes to .agent/project.md)
flowkit lens:report                  # export FlowLens analytics JSON
flowkit lens:report:<ws>             # same, specific workspace (colon form)
flowkit lr                           # alias for lens:report
```

→ FLOWLENS.md

### Check workspace health

```bash
flowkit status          # chapters, pages, flowStories, sessions, feedback, agent
flowkit audit           # validate all authored content (page/chapter/book/story/components/db) — exits 1 on error
flowkit audit:<domain>  # validate just one domain — page/chapter/book/story/components/db
flowkit audit:chapter --fix       # reconcile chapter/pageOrder drift against flowBook/ on disk (existence only)
flowkit audit:chapter --rebuild   # preview a full disk-derived regeneration; add --confirm to apply (destroys authored order)
flowkit flowStory:ls    # list all flowStories with file paths
```

All four work in every mode (repo, flat, multi-workspace).

---

## Keeping the files accurate (the anti-drift system)

The agent files are generated, not hand-maintained. When the platform changes, regenerate:

```bash
flowkit agent:sync                 # active workspace
flowkit agent:sync:<ws>            # a specific workspace (repo mode)
```

- `agent:sync` re-emits `INDEX.md`, `rules.md`, `platform.md`, and `AGENTS.md`. It **never**
  touches `project.md`.
- There is no separate staleness-check command as of this writing — `agent:check` doesn't exist,
  and `flowkit export`'s pre-flight checks (TypeScript, ESLint) don't cover agent-file staleness
  either. Re-run `agent:sync` yourself after any platform change.
- To change platform facts, edit **`scripts/platform/agent-spec.js`** (the single source), bump
  `AGENT_SPEC_VERSION`, then `agent:sync` every workspace. Never hand-edit a generated `.agent/*` file.
- There is no per-tool target to choose anymore — `agent:sync` always emits `AGENTS.md`. A
  workspace scaffolded before this change may still have an old `CLAUDE.md`/`.cursor/rules/flowkit.mdc`
  sitting on disk from the previous per-tool system; that file is left alone until you
  delete it yourself — `agent:sync` does not clean it up automatically.

---

## What the agent owns vs. what's generated

- **Owns / edits freely:** everything at the workspace's own root — `flowBook/`, `flowStories/`,
  `lib/`, and `.agent/project.md` (the product brief). (Chapters/pages live under `flowBook/`.)
- **Generated (don't hand-edit):** `.agent/INDEX.md`, `.agent/rules.md`, `.agent/platform.md`,
  the memory file. Regenerate via `agent:sync`.
- **Off-limits:** platform source — `src/`/`scripts/` in repo mode, `node_modules/flowkit/` in
  consumer mode. Requires explicit confirmation before touching either.
