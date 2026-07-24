// ─────────────────────────────────────────────────────────────────────────────
// agentSpec.js — SINGLE SOURCE OF TRUTH for everything an agent must know to
// build inside a FlowKit workspace.
//
// All agent-facing files (.agent/INDEX.md, rules.md, platform.md, and the chosen
// agent's memory file: CLAUDE.md / AGENTS.md / .cursor/rules/…) are RENDERED from
// the data here. Author facts once → every output stays correct. Run
// `flowkit agent:sync` after platform changes to re-emit.
//
// Every fact below was verified against the platform source — keep it that way:
//   nav      → src/shared/utils/useNav.ts (navigateTo/goNext/goBack/isChapter/flowState)
//   data     → src/shared/contexts/DashboardContext.tsx (db, updateDb, resetDb)
//   screens  → src/types.ts PageProps / PageMeta
//   flows    → src/types.ts FlowDef + OnMapEntry; declared in flowStories/*.ts
//   flowStory → src/features/flow-library/compileFlowStory.ts + src/types FlowkitConfig
//   sim      → src/core/layout/ (ControlAccordion, SimControl, SimAction, etc.)
//   theme    → src/theme.ts (bg/text/accent/shadow) + ThemeContext useTheme()
//   CLI      → scripts/flowkit.js
// ─────────────────────────────────────────────────────────────────────────────

/** Bump when the spec's platform facts change — agent:check compares against this. */
export const AGENT_SPEC_VERSION = 4

/**
 * Per-workspace render context.
 * @param {object} opts
 * @param {string} opts.name         — workspace name (folder name under workspaces/)
 * @param {string} [opts.kit]        — design kit slug or 'none'
 * @param {boolean} [opts.isStandalone]
 * @param {string} [opts.language]   — 'ts' | 'js'
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

  const flowsGroup = {
    group: 'Flows & screens — FlowStory hierarchy',
    preamble:
      "Screens live under `flowBook/<flow>/.../<screen>/` (any number of organizational folders between flow and screen are allowed — only the first and last segments count for identity). Journeys are declared in `flowStories/<flow>.ts` using `defineFlow`. There is no `_playFlow.ts` and no `flowBook/router.tsx`. Registered screen ids are the composite `<flow>-<screen>` form (e.g. `onboarding-flow-welcome-screen`) everywhere EXCEPT `workspace.ts`'s `pageOrder` map, which stays bare/flow-scoped.",
    rules: [
      {
        kind: 'to',
        task: 'add a flow with screens',
        action:
          'create the folder `flowBook/<FlowName>/<ScreenName>/` and add a `<ScreenName>.tsx` component',
      },
      {
        kind: 'to',
        task: 'add a screen to an existing flow',
        action: 'create `flowBook/<FlowName>/<ScreenName>/<ScreenName>.tsx`',
      },
      {
        kind: 'to',
        task: 'remove a flow or screen',
        action: 'delete the folder: `rm -rf workspaces/<ws>/flowBook/<flow>/`',
      },
      {
        kind: 'to',
        task: 'reorder chapters',
        action:
          'edit the `chapters[]` array in `workspace.ts`, or use the **Manage tab** (right panel) to copy a terminal patch script',
      },
      {
        kind: 'to',
        task: 'hide a screen or flow from the Screens tab without deleting it',
        action:
          'prefix its folder (or file) name with a single `_` — it stays fully real/playable/referenceable, just hidden from default browsing. Prefix with `__` instead to make it practically non-existent (excluded from checks, flowStory references, and status counts). Use `flowkit list:screens --hidden`/`--gone`/`--all` to see them.',
      },
      {
        kind: 'never',
        text: 'hand-write new flow/screen files from scratch — copy an existing screen boilerplate, then fill the body',
      },
      {
        kind: 'always',
        text: "a screen exports `pageMeta` with at least `desc`. The default-exported function's name no longer needs to end in `Screen` or match the filename — identity comes from the folder, not the filename — but following that convention is still recommended for readability.",
      },
      {
        kind: 'never',
        text: 'put more than one real (non-`_`/`__`-prefixed) screen component file in a single screen folder — if this happens, the alphabetically-first file silently wins and `flowkit check:screens` reports a non-blocking `screen/ambiguous-folder` warning',
      },
    ],
  }

  const navGroup = {
    group: 'Navigation (two independent conventions — know which one you need)',
    rules: [
      {
        kind: 'to',
        task: 'navigate from screen logic during flow playback (state/async)',
        action: '`const { navigateTo, goNext, goBack } = useNav()`',
      },
      {
        kind: 'to',
        task: 'wire tap interactions declaratively during flow playback',
        action: 'add an `interactions` map in the flowStory step for the screen',
      },
      {
        kind: 'never',
        text: "call `useNav()` unconditionally in a screen meant to also work standalone — it throws when there's no FlowMaster ancestor (i.e. viewed from the Screens tab, no flow active)",
      },
      {
        kind: 'to',
        task: 'make a screen freely navigable from the Screens tab (no flow active) as well as during flow playback',
        action:
          "`const { navigateTo } = useAppNav()` (from `@flowkit-shared/utils`), then call it unconditionally: `onClick={() => navigateTo(id)}`. `useAppNav()` picks FlowMaster's flow-aware navigateTo when the screen is rendered inside a flow, or DashboardContext's otherwise — no `isChapter` check needed in the screen's own code. See scripts/helpers/scaffold.js's demo screens for the pattern.",
      },
      {
        kind: 'never',
        text: "destructure `navigateTo` from `useDashboard()` directly and call it inside a screen that also relies on FlowMaster's guards/animations/session-replay during playback — use `useAppNav()` for a screen that needs to work both standalone and in-flow, or `useNav()` if the screen is flow-only",
      },
    ],
  }

  return [
    filesGroup,
    flowsGroup,
    navGroup,
    {
      group: 'Data',
      rules: [
        {
          kind: 'always',
          text: 'read/mutate data via `const db = useDb()` (`@flowkit-shared/utils`) — safe get/has/set/remove/update helpers over the injected `db`; falls back to `const { db, updateDb } = useDashboard()` only when you need the raw object/setter directly',
        },
        {
          kind: 'never',
          text: '`import { … } from "@workspace/lib/data/db"` inside a screen — direct import breaks flowStory db-patching; use the injected `db` from `useDashboard()`/`useDb()`',
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
      detail: 'Documentation/FLOWKIT.md',
    },
    {
      task: 'Add a flow + screens',
      action: 'create folder `flowBook/<F>/<Screen>/` + `<Screen>.tsx`',
      detail: 'platform.md → CLI',
    },
    {
      task: 'Add a screen to an existing flow',
      action: 'create `flowBook/<F>/<S>/<S>.tsx`',
      detail: 'platform.md → CLI',
    },
    {
      task: 'Wire a tap / interaction',
      action: 'add `interactions` map in the flowStory step (`flowStories/<f>.ts`)',
      detail: 'platform.md → Flows · Documentation/FLOWMASTER.md',
    },
    {
      task: 'Navigate programmatically',
      action: '`useNav()`',
      detail: 'platform.md → Navigation',
    },
    {
      task: 'Read or change data',
      action: '`useDb()` → `get`/`has`/`set`/`remove`/`update`',
      detail: 'platform.md → Data',
    },
    {
      task: 'Gate a screen (access guard)',
      action: '`canEnter` / `canNotEnter` in `pageMeta` (exported from the screen `.tsx`)',
      detail: 'platform.md → Guards',
    },
    {
      task: 'Reorder chapters',
      action: 'edit `workspace.ts` → `chapters[]`, or use **Manage tab** in right panel',
      detail: 'platform.md → Flows',
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
      detail: 'Documentation/FLOWLENS.md',
    },
    { task: 'Full CLI reference', action: '`flowkit help`', detail: 'Documentation/CLI.md' },
    {
      task: 'What this product IS',
      action: 'read `.agent/project.md`',
      detail: 'project.md (hand-owned)',
    },
  ]
}

// ─── platform.md reference rows: surface → how to reach it → full detail ──────────

export function platformSurfaces(ctx) {
  const flowsSurface = {
    area: 'Flows (FlowStory hierarchy)',
    api: '`defineFlow({ id, name, steps[], homeScreen? })` — authored in `flowStories/<flow>.ts`',
    from: '`@flowkit-core/config` → `defineFlow`',
    note: "Page folders: `flowBook/<flow>/.../<screen>/` (variable depth — first/last segment count for identity, anything between is cosmetic). FlowStory step `pageId` values use the composite `<flow>-<screen>` id form; `workspace.ts`'s `pageOrder` stays bare. Ordering declared in `workspace.ts` → `projects.<proj>.chapters[]`. `homeScreen` overrides the device home button while that plan is playing; workspace-level default is `workspace.ts` → `startPage`.",
    doc: 'FLOWMASTER.md',
  }

  const guardsSurface = {
    area: 'Guards',
    api: '`canEnter`/`canNotEnter`: `({ db }) => boolean`',
    from: '`pageMeta` exported from the screen `.tsx` file',
    note: 'Screen-level guards only',
    doc: 'FLOWMASTER.md',
  }

  return [
    {
      area: 'Navigation',
      api: '`useNav()` → `navigateTo(target)`, `goNext()`, `goBack()`, `isChapter`, `flowState`',
      from: '`@flowkit-shared/utils/useNav`',
      note: 'target = a screen id, "next", "back", or "__complete__"',
      doc: 'FLOWMASTER.md',
    },
    {
      area: 'Data',
      api: '`useDashboard()` → `db`, `updateDb(fn)`, `resetDb()`, `navigateTo(id)`',
      from: '`@flowkit-shared/contexts/DashboardContext`',
      note: 'db/updateDb/resetDb always safe; for navigateTo() prefer `useAppNav()` (see Navigation group above) — it works standalone and during flow playback with no `isChapter` check needed; use useNav() instead for flow-only screens',
      doc: 'FLOWKIT.md',
    },
    {
      area: 'Screen props',
      api: '`PageProps` → `onAction?`, `onNext?`, `onBack?`, `isChapter?`, `flowState?`, `db?`',
      from: '`@flowkit/types`',
      note: 'screens are pure markup with element `id`s',
      doc: 'FLOWMASTER.md',
    },
    flowsSurface,
    guardsSurface,
    {
      area: 'Simulator',
      api: '`ControlAccordion`, `SimToggle`, `SimSegmented`, `SimSelect`, `SimAction`, `SimTextInput`, `SimNumberInput`, `SimControl`',
      from: '`@flowkit-core/layout`',
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
      api: '`useTheme()` → `theme` (`bg.*`, `text.*`, `accent.*`, `shadow.*`), `mode`, `setMode`',
      from: '`@flowkit-shared/contexts/ThemeContext`',
      note: 'prefer tokens over hardcoded colors',
      doc: 'FLOWKIT.md',
    },
    {
      area: 'Styling & kit',
      api: ctx.kitCss
        ? `active kit: \`${ctx.kit}\` — tokens via \`${ctx.kitCss}\``
        : 'no kit — base `design-system/tokens.css`',
      from: '`design-system/tokens.css` (loaded at runtime by the platform shell)',
      note: `screens/components are \`.${ctx.ext}\``,
      doc: 'FLOWKIT.md',
    },
    {
      area: 'Sessions',
      api: 'recording always on; `flowkit sessions:ls|import|check|stats|sample|rm`',
      from: '`src/modes/flowlens/library/' + ctx.name + '/`',
      note: 'FlowLens is available when src/modes/flowlens/ exists on disk (no env flag needed)',
      doc: 'FLOWLENS.md',
    },
  ]
}

// ─── Canonical CLI rows ──────────────────────────────────────────────────────────

export function cliRows(_ctx) {
  return [
    { cmd: 'flowkit plan:ls', what: 'list all flowStories in the workspace' },
    {
      cmd: 'flowkit check / flowkit check:<domain>',
      what: 'validate authored content — screens/config/components/db/flowStories',
    },
    { cmd: 'flowkit project:ls', what: 'list projects and their flowStory counts' },
    { cmd: 'flowkit status', what: 'workspace health: projects, flowStories, sessions, feedback' },
    {
      cmd: 'flowkit sessions:ls / import / check / stats / sample / rm',
      what: 'manage the session library',
    },
    { cmd: 'flowkit sessions:brief [--append]', what: 'agent brief from session data' },
    { cmd: 'flowkit help', what: 'full command reference' },
  ]
}
