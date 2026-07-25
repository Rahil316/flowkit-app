# Flowkit

A browser-based UI prototyping platform for building multi-screen, flow-based interactive previews. Pages are React components. Chapters are ordered sequences of pages with conditional transitions and guard rules. The CLI manages everything.

---

## Quick start

```bash
npm install
npm link          # register the `flowkit` command globally
npm run dev       # start the dev server
```

Then open [http://localhost:5173](http://localhost:5173).

---

## What it is

Flowkit gives you a live canvas with:

- **Device mockup** — phone, tablet, desktop, wearable with correct safe areas
- **Flow engine** — conditional navigation, local sandbox state, mock database mutations
- **Simulator** — color-blind vision modes, connection/network conditions, blur
- **Feedback** — per-page comment wall with tags, screenshots, export/import to cloud
- **Debugger** — live view of chapter state, transition history, db activity
- **FlowLens** — session replay, cursor heatmaps, funnel analytics, and multi-session reports
- **Mobile canvas** — full feature parity on touch devices via a bottom-sheet layout

---

## Workspace setup (this repo)

A workspace is a folder under `workspaces/`. It contains your chapters, components, mock database, and design tokens — isolated from the platform and from other workspaces.

```bash
flowkit nw:my-app    # create workspace
```

Switch active workspace from the browser UI — select a workspace in the canvas shell and your choice is saved automatically.

FlowStories live at `workspaces/<name>/flowStories/`. Add a new `.ts` file there and it is picked up automatically on next dev server hot reload.

---

## Using FlowKit in your own project

> Not yet published under the real package names (`flowkit`, `create-flowkit-app`, `create-flowkit-workspace`) — the commands below describe the intended flow once that happens. A scoped canary rehearsal is live today under `@rahil316/*`; see [temp-docs/npm-checklist.md](temp-docs/npm-checklist.md) for real, working install commands in the meantime.

Outside this repo, FlowKit ships as installable packages rather than a checkout:

**Single-workspace project** — scaffold via `create-flowkit-app`. Your project root _is_ the one workspace: `flowkit.config.ts`, `flowBook/`, `flowStories/`, `lib/` sit directly at root, and `flowkit` is a `devDependency` in `node_modules/`.

```bash
npm create flowkit-app@latest my-app
cd my-app && npm run dev
```

**Multi-workspace project** — scaffold via `create-flowkit-workspace` instead. Each workspace is its own sibling folder at project root (`workspace-1/`, `app-b/`, …), declared explicitly in `package.json`'s `flowkit.workspaces` array.

```bash
npm create flowkit-workspace@latest my-project
cd my-project && npm run dev   # serves flowkit.workspaces[0] by default
```

Convert between the two shapes any time, and manage workspaces in a multi-workspace project:

```bash
flowkit convert:multi              # flat → multi (wraps root into workspace-1/)
flowkit convert:flat               # multi → flat (collapses back to root)
flowkit create:workspace --name:app-b
flowkit remove:workspace --name:app-b
flowkit rename:workspace app-b app-c
```

The rest of the CLI reference below (authoring commands, sessions, export/handoff) works the same in a scaffolded project as it does in this repo, minus the repo-mode-only commands noted in the table.

---

## Writing a page

Pages are plain React components. Props are injected automatically — no context imports needed. Import path differs by mode: `@flowkit/types` inside this repo's own `workspaces/<name>/`, `'flowkit'` in a project scaffolded by `create-flowkit-app`/`create-flowkit-workspace`.

```tsx
// this repo (repo mode)
import type { PageProps } from '@flowkit/types'

// scaffolded consumer project (flat/multi-workspace mode)
import type { PageProps } from 'flowkit'

export default function WelcomePage({ onNext, onBack, db }: PageProps) {
  return (
    <div>
      <p>Hello, {db?.user?.name}</p>
      <button onClick={onNext}>Continue</button>
    </div>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const pageMeta = { id: 'welcome', label: 'Welcome' }
```

`PageProps` is one of two navigation conventions and only populated during active flowStory
playback. For a page that should also be freely explorable in the Screens tab (no chapter active),
navigate by page id via `useAppNav()` instead — no `isChapter` prop, no manual guard needed:

```tsx
import { useAppNav } from '@flowkit-shared/utils' // repo mode; 'flowkit' in a scaffolded project

export default function WelcomePage() {
  const { navigateTo } = useAppNav()
  return <button onClick={() => navigateTo('setup-screen')}>Get Started</button>
}
```

`useAppNav()` calls the correct navigation function automatically whether the page is standalone
or inside a chapter — safe to call unconditionally, unlike wiring `useDashboard().navigateTo()` by hand.

---

## Flow config

Chapters are defined as **flowStories** under `workspaces/<name>/flowStories/` (repo mode) or `flowStories/` at the workspace root (consumer mode). Each flowStory is a `FlowStoryDef` — a typed, ordered sequence of steps with optional db patches, forks, and entry guards. Step `pageId` values use the composite `${chapterId}-${pageId}` form:

```ts
// this repo (repo mode)
import { defineFlow } from '@flowkit-core/config'

// scaffolded consumer project (flat/multi-workspace mode)
import { defineFlow } from 'flowkit'

export default defineFlow({
  id: 'onboarding',
  name: 'Onboarding',
  canEnter: ({ db }) => !db.auth.isLoggedIn,
  steps: [
    { pageId: 'onboarding-welcome' },
    { pageId: 'onboarding-signup', db: { 'auth.started': true } },
    { pageId: 'onboarding-success' },
  ],
})
```

The flowStory compiler (`compileFlowStory.ts`) converts this at runtime into a `ChapterConfig` with gating, step sequencing, and db patch application. Playback starts from the UI (no dedicated shortcut to enter it); press **R** to restart while gating is active.

---

## CLI reference

| Command                                    | Description                                                                                                                                                          |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `flowkit nw:<name>`                        | Create workspace (repo mode only)                                                                                                                                    |
| `flowkit rw:<name>`                        | Remove workspace (repo mode only)                                                                                                                                    |
| `flowkit watch:flows`                      | Watch workspace for file changes (repo mode only)                                                                                                                    |
| `flowkit status`                           | Workspace health snapshot                                                                                                                                            |
| `flowkit export`                           | Export as standalone HTML viewer (guided flow; always ships full codebase)                                                                                           |
| `flowkit handoff`                          | Build developer handoff zip                                                                                                                                          |
| `flowkit audit` / `flowkit audit:<domain>` | Validate authored content — page/chapter/book/story/components/db (`audit:story` runs automatically on build); `--fix`/`--rebuild` reconcile chapter/pageOrder drift |
| `flowkit sessions:brief`                   | Agent analytics brief from committed sessions                                                                                                                        |
| `flowkit convert:multi`                    | Convert a flat consumer project to multi-workspace mode                                                                                                              |
| `flowkit convert:flat`                     | Collapse a multi-workspace consumer project back to flat                                                                                                             |
| `flowkit create/remove/rename:workspace`   | Add/remove/rename a workspace (multi-workspace consumer mode only)                                                                                                   |
| `flowkit help`                             | Full help                                                                                                                                                            |

Full reference: [docs/CLI.md](docs/CLI.md)

---

## FlowLens — session analytics

FlowLens is a built-in analytics mode that replays recorded user sessions and surfaces behavioral data without any external tooling.

**Recording** — sessions are captured automatically when a chapter starts (if enabled), or manually from the Sessions panel. The recorder tracks interactions, navigation events, db mutations, cursor position (optional), and chapter lifecycle. Everything is stored locally in IndexedDB.

**Replay** — FlowLens mounts the real workspace inside a device mockup and scrubs through recorded events, restoring db state and page position at each point in time. Cursor ghosts and interaction markers are overlaid on the live UI.

**Analytics views:**

| View     | What it shows                                     |
| -------- | ------------------------------------------------- |
| Timeline | Chronological event stream for a single session   |
| Heatmap  | Cursor density and click concentration by page    |
| Paths    | Page-to-page navigation Sankey / flow diagram     |
| Funnel   | Drop-off rates across a defined page sequence     |
| Metrics  | Duration, interaction counts, quality score, tags |

**Reports** — generate aggregate reports across multiple sessions: funnel completion rates, avg session duration, top pages by dwell time, frustrated-click frequency. Export as CSV, JSON, or Markdown.

**Session management** — sessions can be tagged, renamed, merged, filtered by quality score, and exported as `.flowkit-session.json` files (or `.bundle.flowkit-session.json` for multi-session exports). Bundles import cleanly and re-sequence events correctly on merge.

Sessions auto-prune when the library exceeds 200 entries (oldest first).

---

## Sharing your work

**Stakeholder review** — export as a single self-contained HTML file. Anyone can open it in a browser, no install required:

```bash
flowkit export            # guided flow; always ships full codebase incl. FlowLens
# → dist-standalone/index.html
```

**Developer handoff** — generate a standalone React app without any Flowkit dependency:

```bash
flowkit handoff
# → <name>-handoff-<date>.zip
# recipient: unzip → npm install → npm run dev
```

---

## Canvas shortcuts

| Shortcut              | Action                       |
| --------------------- | ---------------------------- |
| `Cmd +` / `Cmd -`     | Zoom in / out                |
| `Cmd 0`               | Reset to 100% zoom           |
| `Cmd Shift 0`         | Fit device to screen         |
| `←` / `→`             | Navigate pages               |
| `Shift ←` / `Shift →` | Navigate chapters            |
| `Shift 1–4`           | Switch right panel tabs      |
| `Shift S`             | Toggle Screens ↔ Flow Map    |
| `Shift F`             | Focus screen search          |
| `Shift G`             | Go-To overlay                |
| `Cmd /`               | Action Center                |
| `Cmd Shift /`         | Keyboard shortcuts reference |

---

## Source layout

```
src/
  App.tsx                      # root — wires canvas, panels, overlays, mode switching
  workspaces.json              # workspace registry (names, labels, active)
  core/
    canvas/                    # pan, zoom, device mockup, hand tool, panel resize
    layout/                    # FlowMaster, FlowEngine, Sidebar, PanelFrame, KitSide{Explorer,Inspector}
      hooks/                   # usePanelLayout, usePanelDrag
    shortcuts/                 # keyboard shortcut registry (all hooks centralised here)
    config/                    # defineConfig(), defineFlow() type-safe helpers
  features/
    feedback/                  # comment wall, cloud push via JSONBin, export/import
    figma-export/              # FigmaExportView — multi-page canvas grid (Cmd+Alt+Shift+P)
    flow-debugger/             # db inspector, chapter state viewer
    flow-library/              # chapter/page hierarchy, flow canvas
    flowStory/                 # compileFlowStory, playback context, settings, element-check diagnostic
    flowTracer/                # session recorder, IndexedDB storage, FlowLens bridge
      context/                 # SessionRecorderProvider — state machine, event hooks
      components/              # SessionCard, SessionInspect, CountdownOverlay, overlays, settings
      sessionDb.ts             # IndexedDB layer + WriteBatcher (300ms flush)
      buildSessionExport.ts    # assembles SessionExport from IDB for replay/export
      panel.tsx                # Sessions panel UI
    script-patch/              # PatchScript generators + CopyScriptButton UI primitive
  modes/
    flowlens/                  # FlowLens analytics mode (presence-gated — delete this folder to strip it from a build)
      components/              # replay controller, timeline, heatmap, paths, funnel, metrics
      analyticsEngine.ts       # metrics computation from SessionExport
      exportUtils.ts           # CSV, JSON, Markdown, SVG, PNG export
  shared/
    components/
      errors/                  # 404, 403, 500, Maintenance, Offline, NoWorkspace boundaries
      mobile/                  # MobileCanvas, BottomSheet — touch-first layout
      overlays/                # ActionCenter, Settings, GoTo, Help
      ui/                      # design system: Button, Input, Modal, Tooltip, …
    contexts/                  # Dashboard, Theme, FlowNav, Navigation, Simulator, FlowLensMode, DevMode
                               # ActiveWorkspaceContext — runtime workspace switching
    utils/
      workspaceModules.ts      # glob-based db/simulator/config loaders (runtime workspace switch)
  kits/
    shared/                    # shadcn-based component kit (accordion, dialog, select, …)
```

---

## Code quality

| Check      | Command                 | Gate                                                                               |
| ---------- | ----------------------- | ---------------------------------------------------------------------------------- |
| TypeScript | `npm run build`         | Blocks build — strict mode + unused locals/params                                  |
| ESLint     | `npm run lint`          | 7 plugins: TS, React hooks, import sort, Tailwind, architecture boundaries (error) |
| Prettier   | `npm run format:check`  | Auto-applied to staged files on commit                                             |
| Tests      | `npm test`              | Vitest — pure logic suites                                                         |
| Coverage   | `npm run test:coverage` | Thresholds: statements 91%, branches 86%, functions 95%, lines 93%                 |

Architecture layer boundaries (`shared → core → features → modes → app`) are enforced as ESLint **errors** via `eslint-plugin-boundaries`. Cross-layer imports fail lint.

---

## Documentation

- [docs/CLI.md](docs/CLI.md) — Full CLI command reference
- [docs/FLOWKIT.md](docs/FLOWKIT.md) — Platform architecture
- [docs/FLOWLENS.md](docs/FLOWLENS.md) — FlowLens analytics reference
- [docs/FLOWMASTER.md](docs/FLOWMASTER.md) — Flow engine reference
- [docs/AGENTS.md](docs/AGENTS.md) — AI agent spec
