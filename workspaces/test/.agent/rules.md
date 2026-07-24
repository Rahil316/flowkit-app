# Rules — test

Directives the agent operates under. Grammar: **NEVER** (hard stop), **ALWAYS** (default), **TO** `<task>` **→** `<action>` (the one right way).

## Files & isolation

- **NEVER** edit any file outside `workspaces/test/` — platform code in `src/` is read-only
- **NEVER** reference or edit `flowBook/router.tsx` or any `_playFlow.ts` — this workspace uses the FlowStory hierarchy format; those files do not exist here
- **ALWAYS** use path aliases: `@flowkit/` → `src/`, `@workspace/` → this workspace. Never relative `../../`

## Chapters & pages — FlowStory hierarchy

Pages live under `flowBook/<chapter>/.../<page>/` (any number of organizational folders between chapter and page are allowed — only the first and last segments count for identity). Journeys are declared in `flowStories/<chapter>.ts` using `defineFlow`. There is no `_playFlow.ts` and no `flowBook/router.tsx`. Registered page ids are the composite `<chapter>-<page>` form (e.g. `onboarding-welcome-screen`) everywhere EXCEPT `workspace.ts`'s `pageOrder` map, which stays bare/chapter-scoped.

- **TO** add a chapter with pages **→** create the folder `flowBook/<ChapterName>/<PageName>/` and add a `<PageName>.tsx` component
- **TO** add a page to an existing chapter **→** create `flowBook/<ChapterName>/<PageName>/<PageName>.tsx`
- **TO** remove a chapter or page **→** delete the folder: `rm -rf workspaces/<ws>/flowBook/<chapter>/`
- **TO** reorder chapters **→** edit the `chapters[]` array in `workspace.ts`, or use the **Manage tab** (right panel) to copy a terminal patch script
- **TO** hide a page or chapter from the Screens tab without deleting it **→** prefix its folder (or file) name with a single `_` — it stays fully real/playable/referenceable, just hidden from default browsing. Prefix with `__` instead to make it practically non-existent (excluded from checks, flowStory references, and status counts). Use `flowkit list:pages --hidden`/`--gone`/`--all` to see them.
- **NEVER** hand-write new chapter/page files from scratch — copy an existing page boilerplate, then fill the body
- **ALWAYS** a page exports `pageMeta` with at least `desc`. The default-exported function's name doesn't need to end in `Screen`/`Page` or match the filename — identity comes from the folder, not the filename — but following that convention is still recommended for readability.
- **NEVER** put more than one real (non-`_`/`__`-prefixed) page component file in a single page folder — if this happens, the alphabetically-first file silently wins and `flowkit check:pages` reports a non-blocking `page/ambiguous-folder` warning

## Navigation (two independent conventions — know which one you need)

- **TO** navigate from page logic during chapter playback (state/async) **→** `const { navigateTo, goNext, goBack } = useNav()`
- **TO** wire a tap interaction declaratively during chapter playback **→** give the element a plain DOM `id` and add a matching `{ pageId, on: "<id>" }` step in the flowStory — no `onClick` needed for the step to advance
- **NEVER** call `useNav()` unconditionally in a page meant to also work standalone — it throws when there's no FlowMaster ancestor (i.e. viewed from the Screens tab, no chapter active)
- **TO** make a page freely navigable from the Screens tab (no chapter active) as well as during chapter playback **→** `const { navigateTo } = useAppNav()` (from `@flowkit-shared/utils`), then call it unconditionally: `onClick={() => navigateTo(id)}`. `useAppNav()` picks FlowMaster's chapter-aware navigateTo when the page is rendered inside a chapter, or DashboardContext's otherwise — no `isChapter` check needed in the page's own code. See scripts/helpers/game-demo-scaffold.js's demo pages for the pattern.
- **NEVER** destructure `navigateTo` from `useDashboard()` directly and call it inside a page that also relies on FlowMaster's guards/animations/session-replay during playback — use `useAppNav()` for a page that needs to work both standalone and in-chapter, or `useNav()` if the page is chapter-only

## Data

- **ALWAYS** read/mutate data via `const db = useDb()` (`@flowkit-shared/utils`) — safe get/has/set/remove/update/reset helpers over the injected `db`; falls back to `const { db, updateDb, resetDb } = useDashboard()` only when you need the raw object/setter directly
- **NEVER** `import { … } from "@workspace/lib/data/db"` inside a page to read or write live state — that file is the *initial* seed only; direct import breaks flowStory db-patching. Use `useDb()`/`useDashboard()` for anything at runtime
- **NEVER** write a hand-rolled dot-path walker against `db` — `useDb()`'s `set`/`remove`/`update` reject `__proto__`/`prototype`/`constructor` paths; a raw `updateDb(fn)` mutation callback does not
- **TO** mutate data **→** `useDb().set('auth.isLoggedIn', true)` (or `useDb().update('cart.count', n => n + 1)`)

## Styling

- **ALWAYS** use Tailwind utilities for static values; inline `style={{}}` only for dynamic/computed values
- **NEVER** hardcode hex colors — use `design-system/tokens.css` variables or `useTheme()` tokens

## Project brief

- **ALWAYS** read `.agent/project.md` before starting any build work — it is the only source of product context. If it is empty or a template, ask the user to fill it before proceeding
- **ALWAYS** after a `flowkit sessions:brief --append` run, re-read `.agent/project.md` — the "Last session analysis" section contains the next iteration focus

_Generated from the platform spec (v5). Run `flowkit agent:sync` to refresh._
