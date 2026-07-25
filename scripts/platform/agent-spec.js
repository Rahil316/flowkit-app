// ─────────────────────────────────────────────────────────────────────────────
// agentSpec.js — SINGLE SOURCE OF TRUTH for everything an agent must know to
// build inside a FlowKit workspace.
//
// All agent-facing files (.agent/INDEX.md, rules.md, platform.md, and the
// workspace's AGENTS.md) are RENDERED from the data here. Author facts once →
// every output stays correct. Run `flowkit agent:sync` after platform changes
// to re-emit.
//
// Every fact below was verified against the platform source — keep it that way:
//   nav       → src/shared/utils/useNav.ts (navigateTo/goNext/goBack/isChapter/flowState) + useAppNav.ts
//   data      → src/shared/utils/useDb.ts (get/has/set/remove/update/reset), wraps DashboardContext
//   pages     → src/types/index.ts PageProps / PageMeta
//   chapters  → src/types/index.ts FlowStoryDef + FlowStep; declared in flowStories/*.ts
//   flowStory → src/core/config/defineConfig.ts (defineFlow) + src/types/index.ts FlowkitConfig
//   sim       → src/features/simulator/controls/ (ControlAccordion, SimControl, SimAction, etc.)
//   theme     → src/shared/contexts/ThemeContext.tsx useTheme() (theme/scale/mode/setMode)
//   CLI       → scripts/flowkit.js
// ─────────────────────────────────────────────────────────────────────────────

/** Bump when the spec's platform facts change — agent:check compares against this. */
export const AGENT_SPEC_VERSION = 5

/**
 * Per-workspace render context.
 * @param {object} opts
 * @param {string} opts.name         — workspace name (folder name under workspaces/)
 * @param {string} [opts.kit]        — design kit slug or 'none'
 * @param {boolean} [opts.isStandalone]
 * @param {string} [opts.language]   — 'ts' | 'js' (legacy workspaces only — new scaffolds are TS-only)
 */
export function specContext({ name, kit = 'none', isStandalone = false, language = 'ts' }) {
  const format = 'hierarchy'
  const ext = language === 'js' ? 'jsx' : 'tsx'
  const dext = language === 'js' ? 'js' : 'ts'
  const kitCss =
    kit && kit !== 'none'
      ? isStandalone
        ? `@flowkit/kits/standalone/${kit}/index.css`
        : '@flowkit-kit/index.css'
      : null
  return { name, kit, isStandalone, language, format, ext, dext, kitCss }
}

// ─── Structured directives (the rule grammar: NEVER / ALWAYS / TO … → …) ─────────
// `kind`: "never" | "always" | "to". `to` rules carry { task, action }.

export function directives(ctx) {
  const filesGroup = {
    group: 'Files & isolation',
    rules: [
      {
        kind: 'never',
        text: `edit any file outside \`workspaces/${ctx.name}/\` — platform code in \`src/\` is read-only`,
      },
      {
        kind: 'never',
        text: 'reference or edit `flowBook/router.tsx` or any `_playFlow.ts` — this workspace uses the FlowStory hierarchy format; those files do not exist here',
      },
      {
        kind: 'always',
        text: 'use path aliases: `@flowkit/` → `src/`, `@workspace/` → this workspace. Never relative `../../`',
      },
    ],
  }

  const chaptersGroup = {
    group: 'Chapters & pages — FlowStory hierarchy',
    preamble:
      "Pages live under `flowBook/<chapter>/.../<page>/` (any number of organizational folders between chapter and page are allowed — only the first and last segments count for identity). Journeys are declared in `flowStories/<chapter>.ts` using `defineFlow`. There is no `_playFlow.ts` and no `flowBook/router.tsx`. Registered page ids are the composite `<chapter>-<page>` form (e.g. `onboarding-welcome-screen`) everywhere EXCEPT `workspace.ts`'s `pageOrder` map, which stays bare/chapter-scoped.",
    rules: [
      {
        kind: 'to',
        task: 'add a chapter with pages',
        action:
          'create the folder `flowBook/<ChapterName>/<PageName>/` and add a `<PageName>.tsx` component',
      },
      {
        kind: 'to',
        task: 'add a page to an existing chapter',
        action: 'create `flowBook/<ChapterName>/<PageName>/<PageName>.tsx`',
      },
      {
        kind: 'to',
        task: 'remove a chapter or page',
        action: 'delete the folder: `rm -rf workspaces/<ws>/flowBook/<chapter>/`',
      },
      {
        kind: 'to',
        task: 'reorder chapters',
        action:
          'edit the `chapters[]` array in `workspace.ts`, or use the **Manage tab** (right panel) to copy a terminal patch script',
      },
      {
        kind: 'to',
        task: 'hide a page or chapter from the Screens tab without deleting it',
        action:
          'prefix its folder (or file) name with a single `_` — it stays fully real/playable/referenceable, just hidden from default browsing. Prefix with `__` instead to make it practically non-existent (excluded from checks, flowStory references, and status counts). Use `flowkit list:pages --hidden`/`--gone`/`--all` to see them.',
      },
      {
        kind: 'never',
        text: 'hand-write new chapter/page files from scratch — copy an existing page boilerplate, then fill the body',
      },
      {
        kind: 'always',
        text: "a page exports `pageMeta` with at least `desc`. The default-exported function's name doesn't need to end in `Screen`/`Page` or match the filename — identity comes from the folder, not the filename — but following that convention is still recommended for readability.",
      },
      {
        kind: 'never',
        text: 'put more than one real (non-`_`/`__`-prefixed) page component file in a single page folder — if this happens, the alphabetically-first file silently wins and `flowkit check:pages` reports a non-blocking `page/ambiguous-folder` warning',
      },
    ],
  }

  const navGroup = {
    group: 'Navigation (two independent conventions — know which one you need)',
    rules: [
      {
        kind: 'to',
        task: 'navigate from page logic during chapter playback (state/async)',
        action: '`const { navigateTo, goNext, goBack } = useNav()`',
      },
      {
        kind: 'to',
        task: 'wire a tap interaction declaratively during chapter playback',
        action:
          'give the element a plain DOM `id` and add a matching `{ pageId, on: "<id>" }` step in the flowStory — no `onClick` needed for the step to advance',
      },
      {
        kind: 'never',
        text: "call `useNav()` unconditionally in a page meant to also work standalone — it throws when there's no FlowMaster ancestor (i.e. viewed from the Screens tab, no chapter active)",
      },
      {
        kind: 'to',
        task: 'make a page freely navigable from the Screens tab (no chapter active) as well as during chapter playback',
        action:
          "`const { navigateTo } = useAppNav()` (from `@flowkit-shared/utils`), then call it unconditionally: `onClick={() => navigateTo(id)}`. `useAppNav()` picks FlowMaster's chapter-aware navigateTo when the page is rendered inside a chapter, or DashboardContext's otherwise — no `isChapter` check needed in the page's own code. See scripts/demoBooks/game-demo-scaffold.js's demo pages for the pattern.",
      },
      {
        kind: 'never',
        text: "destructure `navigateTo` from `useDashboard()` directly and call it inside a page that also relies on FlowMaster's guards/animations/session-replay during playback — use `useAppNav()` for a page that needs to work both standalone and in-chapter, or `useNav()` if the page is chapter-only",
      },
    ],
  }

  return [
    filesGroup,
    chaptersGroup,
    navGroup,
    {
      group: 'Data',
      rules: [
        {
          kind: 'always',
          text: 'read/mutate data via `const db = useDb()` (`@flowkit-shared/utils`) — safe get/has/set/remove/update/reset helpers over the injected `db`; falls back to `const { db, updateDb, resetDb } = useDashboard()` only when you need the raw object/setter directly',
        },
        {
          kind: 'never',
          text: '`import { … } from "@workspace/lib/data/db"` inside a page to read or write live state — that file is the *initial* seed only; direct import breaks flowStory db-patching. Use `useDb()`/`useDashboard()` for anything at runtime',
        },
        {
          kind: 'never',
          text: "write a hand-rolled dot-path walker against `db` — `useDb()`'s `set`/`remove`/`update` reject `__proto__`/`prototype`/`constructor` paths; a raw `updateDb(fn)` mutation callback does not",
        },
        {
          kind: 'to',
          task: 'mutate data',
          action:
            "`useDb().set('auth.isLoggedIn', true)` (or `useDb().update('cart.count', n => n + 1)`)",
        },
      ],
    },
    {
      group: 'Styling',
      rules: [
        {
          kind: 'always',
          text: 'use Tailwind utilities for static values; inline `style={{}}` only for dynamic/computed values',
        },
        {
          kind: 'never',
          text: 'hardcode hex colors — use `design-system/tokens.css` variables or `useTheme()` tokens',
        },
      ],
    },
    {
      group: 'Project brief',
      rules: [
        {
          kind: 'always',
          text: 'read `.agent/project.md` before starting any build work — it is the only source of product context. If it is empty or a template, ask the user to fill it before proceeding',
        },
        {
          kind: 'always',
          text: 'after a `flowkit sessions:brief --append` run, re-read `.agent/project.md` — the "Last session analysis" section contains the next iteration focus',
        },
      ],
    },
  ]
}

// ─── The INDEX: task → where to go (the fast-lookup layer) ────────────────────────
// Each row: { task, action, detail }  — detail = a .agent/platform.md anchor or doc.

export function indexRows(_ctx) {
  return [
    {
      task: 'Understand the platform fast',
      action: 'read `.agent/rules.md` then this INDEX',
      detail: 'docs/FLOWKIT.md',
    },
    {
      task: 'Add a chapter + pages',
      action: 'create folder `flowBook/<C>/<Page>/` + `<Page>.tsx`',
      detail: 'platform.md → CLI',
    },
    {
      task: 'Add a page to an existing chapter',
      action: 'create `flowBook/<C>/<P>/<P>.tsx`',
      detail: 'platform.md → CLI',
    },
    {
      task: 'Wire a tap / interaction',
      action:
        'give the element an `id`, add a matching step (`{ pageId, on }`) in `flowStories/<c>.ts`',
      detail: 'platform.md → Chapters · docs/FLOWMASTER.md',
    },
    {
      task: 'Navigate programmatically',
      action: '`useNav()`',
      detail: 'platform.md → Navigation',
    },
    {
      task: 'Read or change data',
      action: '`useDb()` → `get`/`has`/`set`/`remove`/`update`/`reset`',
      detail: 'platform.md → Data',
    },
    {
      task: 'Gate a page (access guard)',
      action: '`canEnter` / `canNotEnter` in `pageMeta` (exported from the page `.tsx`)',
      detail: 'platform.md → Guards',
    },
    {
      task: 'Reorder chapters',
      action: 'edit `workspace.ts` → `chapters[]`, or use **Manage tab** in right panel',
      detail: 'platform.md → Chapters',
    },
    {
      task: 'Style with the active kit',
      action: 'Tailwind + tokens.css / `useTheme()`',
      detail: 'platform.md → Styling & kit',
    },
    {
      task: 'Add a reviewer toggle',
      action: 'edit `data/simulator.tsx`',
      detail: 'platform.md → Simulator',
    },
    {
      task: 'Record / replay sessions',
      action: 'always-on recorder; `flowkit sessions:*`',
      detail: 'docs/FLOWLENS.md',
    },
    { task: 'Full CLI reference', action: '`flowkit help`', detail: 'docs/CLI.md' },
    {
      task: 'What this product IS',
      action: 'read `.agent/project.md`',
      detail: 'project.md (hand-owned)',
    },
  ]
}

// ─── platform.md reference rows: surface → how to reach it → full detail ──────────

export function platformSurfaces(ctx) {
  const chaptersSurface = {
    area: 'Chapters (FlowStory hierarchy)',
    api: '`defineFlow({ id, name, steps[], homeScreen? })` — authored in `flowStories/<chapter>.ts`',
    from: '`@flowkit-core/config` → `defineFlow`',
    note: "Page folders: `flowBook/<chapter>/.../<page>/` (variable depth — first/last segment count for identity, anything between is cosmetic). FlowStory step `pageId` values use the composite `<chapter>-<page>` id form; `workspace.ts`'s `pageOrder` stays bare. Ordering declared in `workspace.ts` → `chapters[]`/`pageOrder{}`. `homeScreen` overrides the device home button while that flowStory is playing; workspace-level default is `workspace.ts` → `startPage`.",
    doc: 'FLOWMASTER.md',
  }

  const guardsSurface = {
    area: 'Guards',
    api: '`canEnter`/`canNotEnter`: `({ db }) => boolean`',
    from: '`pageMeta` exported from the page `.tsx` file',
    note: 'Page-level guards only',
    doc: 'FLOWMASTER.md',
  }

  return [
    {
      area: 'Navigation',
      api: '`useNav()` → `navigateTo(target)`, `goNext()`, `goBack()`, `isChapter`, `flowState`',
      from: '`@flowkit-shared/utils`',
      note: 'target = a page id, "next", "back", or "__complete__"',
      doc: 'FLOWMASTER.md',
    },
    {
      area: 'Data',
      api: '`useDashboard()` → `db`, `updateDb(fn)`, `resetDb()`, `navigateTo(id)`',
      from: '`@flowkit-shared/contexts`',
      note: 'db/updateDb/resetDb always safe; for navigateTo() prefer `useAppNav()` (see Navigation group above) — it works standalone and during chapter playback with no `isChapter` check needed; use useNav() instead for chapter-only pages',
      doc: 'FLOWKIT.md',
    },
    {
      area: 'Page props',
      api: '`PageProps` → `onAction?`, `onNext?`, `onBack?`, `isChapter?`, `state?`, `db?`',
      from: '`@flowkit/types`',
      note: 'pages are pure markup with element `id`s; all fields undefined outside chapter playback',
      doc: 'FLOWMASTER.md',
    },
    chaptersSurface,
    guardsSurface,
    {
      area: 'Simulator',
      api: '`ControlAccordion`, `SimToggle`, `SimSegmented`, `SimSelect`, `SimAction`, `SimTextInput`, `SimNumberInput`, `SimControl`',
      from: '`@flowkit-features/simulator`',
      note: '`bind="db.auth.isLoggedIn"` path; default-export a JSX component from `data/simulator.tsx`',
      doc: 'FLOWKIT.md',
    },
    {
      area: 'Device & orientation defaults',
      api: '`workspace.ts` → `defaultDevice` (a `DevicePreset.label`), `defaultOrientation` ("portrait" | "landscape")',
      from: '`@flowkit-core/config` → `defineConfig`',
      note: 'Both optional. `defaultDevice` must match a label in `src/shared/components/devices`; falls back to the platform default when unset/unrecognized. `defaultOrientation` is ignored if the resolved device lacks `supportsLandscape`.',
      doc: 'CLI.md',
    },
    {
      area: 'Theme',
      api: '`useTheme()` → `theme`, `scale`, `mode`, `setMode`',
      from: '`@flowkit-shared/contexts`',
      note: 'prefer tokens over hardcoded colors',
      doc: 'FLOWKIT.md',
    },
    {
      area: 'Styling & kit',
      api: ctx.kitCss
        ? `active kit: \`${ctx.kit}\` — tokens via \`${ctx.kitCss}\``
        : 'no kit — base `design-system/tokens.css`',
      from: '`design-system/tokens.css` (loaded at runtime by the platform shell)',
      note: `pages/components are \`.${ctx.ext}\``,
      doc: 'FLOWKIT.md',
    },
    {
      area: 'Sessions',
      api: 'recording always on; `flowkit sessions:ls|import|export|check|stats|sample|rm|brief|purge|report`',
      from: '`src/modes/flowlens/index.ts` (presence on disk gates availability, no env flag needed)',
      note: `session data for this workspace lives under src/modes/flowlens/library/${ctx.name}/`,
      doc: 'FLOWLENS.md',
    },
  ]
}

// ─── Canonical CLI rows ──────────────────────────────────────────────────────────

export function cliRows(_ctx) {
  return [
    { cmd: 'flowkit flowStory:ls', what: 'list all flowStories in the workspace' },
    {
      cmd: 'flowkit check / flowkit check:<domain>',
      what: 'validate authored content — pages/config/components/db/flowStories',
    },
    { cmd: 'flowkit project:ls', what: 'list projects and their flowStory counts' },
    { cmd: 'flowkit status', what: 'workspace health: projects, flowStories, sessions, feedback' },
    {
      cmd: 'flowkit sessions:ls / import / export / check / stats / sample / rm',
      what: 'manage the session library',
    },
    { cmd: 'flowkit sessions:brief [--append]', what: 'agent brief from session data' },
    { cmd: 'flowkit help', what: 'full command reference' },
  ]
}
