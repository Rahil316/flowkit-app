# Platform reference — test

Terse map of the platform surfaces you can reach. Each ends in a pointer to the full doc.

### Navigation
- **Use:** `useNav()` → `navigateTo(target)`, `goNext()`, `goBack()`, `isChapter`, `flowState`
- **From:** `@flowkit-shared/utils`
- **Note:** target = a page id, "next", "back", or "__complete__"
- **Full detail:** `docs/FLOWMASTER.md`

### Data
- **Use:** `useDashboard()` → `db`, `updateDb(fn)`, `resetDb()`, `navigateTo(id)`
- **From:** `@flowkit-shared/contexts`
- **Note:** db/updateDb/resetDb always safe; for navigateTo() prefer `useAppNav()` (see Navigation group above) — it works standalone and during chapter playback with no `isChapter` check needed; use useNav() instead for chapter-only pages
- **Full detail:** `docs/FLOWKIT.md`

### Page props
- **Use:** `PageProps` → `onAction?`, `onNext?`, `onBack?`, `isChapter?`, `state?`, `db?`
- **From:** `@flowkit/types`
- **Note:** pages are pure markup with element `id`s; all fields undefined outside chapter playback
- **Full detail:** `docs/FLOWMASTER.md`

### Chapters (FlowStory hierarchy)
- **Use:** `defineFlow({ id, name, steps[], homeScreen? })` — authored in `flowStories/<chapter>.ts`
- **From:** `@flowkit-core/config` → `defineFlow`
- **Note:** Page folders: `flowBook/<chapter>/.../<page>/` (variable depth — first/last segment count for identity, anything between is cosmetic). FlowStory step `pageId` values use the composite `<chapter>-<page>` id form; `workspace.ts`'s `pageOrder` stays bare. Ordering declared in `workspace.ts` → `chapters[]`/`pageOrder{}`. `homeScreen` overrides the device home button while that flowStory is playing; workspace-level default is `workspace.ts` → `startPage`.
- **Full detail:** `docs/FLOWMASTER.md`

### Guards
- **Use:** `canEnter`/`canNotEnter`: `({ db }) => boolean`
- **From:** `pageMeta` exported from the page `.tsx` file
- **Note:** Page-level guards only
- **Full detail:** `docs/FLOWMASTER.md`

### Simulator
- **Use:** `ControlAccordion`, `SimToggle`, `SimSegmented`, `SimSelect`, `SimAction`, `SimTextInput`, `SimNumberInput`, `SimControl`
- **From:** `@flowkit-features/simulator`
- **Note:** `bind="db.auth.isLoggedIn"` path; default-export a JSX component from `data/simulator.tsx`
- **Full detail:** `docs/FLOWKIT.md`

### Device & orientation defaults
- **Use:** `workspace.ts` → `defaultDevice` (a `DevicePreset.label`), `defaultOrientation` ("portrait" | "landscape")
- **From:** `@flowkit-core/config` → `defineConfig`
- **Note:** Both optional. `defaultDevice` must match a label in `src/shared/components/devices`; falls back to the platform default when unset/unrecognized. `defaultOrientation` is ignored if the resolved device lacks `supportsLandscape`.
- **Full detail:** `docs/CLI.md`

### Theme
- **Use:** `useTheme()` → `theme`, `scale`, `mode`, `setMode`
- **From:** `@flowkit-shared/contexts`
- **Note:** prefer tokens over hardcoded colors
- **Full detail:** `docs/FLOWKIT.md`

### Styling & kit
- **Use:** no kit — base `design-system/tokens.css`
- **From:** `design-system/tokens.css` (loaded at runtime by the platform shell)
- **Note:** pages/components are `.tsx`
- **Full detail:** `docs/FLOWKIT.md`

### Sessions
- **Use:** recording always on; `flowkit sessions:ls|import|export|check|stats|sample|rm|brief|purge|report`
- **From:** `src/modes/flowlens/index.ts` (presence on disk gates availability, no env flag needed)
- **Note:** session data for this workspace lives under src/modes/flowlens/library/test/
- **Full detail:** `docs/FLOWLENS.md`

## CLI

| Command | What |
|---|---|
| `flowkit plan:ls` | list all flowStories in the workspace |
| `flowkit check / flowkit check:<domain>` | validate authored content — pages/config/components/db/flowStories |
| `flowkit project:ls` | list projects and their flowStory counts |
| `flowkit status` | workspace health: projects, flowStories, sessions, feedback |
| `flowkit sessions:ls / import / export / check / stats / sample / rm` | manage the session library |
| `flowkit sessions:brief [--append]` | agent brief from session data |
| `flowkit help` | full command reference |


> **Chapter ordering** is set in `workspace.ts` → `chapters[]`/`pageOrder{}`. Use the **Manage tab** (right panel → Manage) to generate a terminal script for reordering.
>
> **Default page** (cold load / device home button / reset-to-first) is set in `workspace.ts` → `startPage`; a flowStory's `homeScreen` overrides it while that flowStory is playing.
>
> **To remove a chapter or page**, delete the folder manually: `rm -rf workspaces/test/flowBook/<chapter>/`

_Generated (spec v5). Facts mirror the platform source — `flowkit agent:sync` to refresh._
