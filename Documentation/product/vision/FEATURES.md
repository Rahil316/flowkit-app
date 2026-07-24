# FlowKit Feature Registry

The authoritative list of platform features and their current status. Update `Status` as work progresses. Add a `decisions.md` entry in the relevant subsystem folder when a feature's scope or status changes.

**Status values:** `planned` · `active` · `done` · `cut`

---

## Core Platform Features

| #   | Feature                            | Subsystem  | Phase | Status  | Notes                                                                    |
| --- | ---------------------------------- | ---------- | ----- | ------- | ------------------------------------------------------------------------ |
| 1   | Flow execution engine (FlowMaster) | FlowMaster | 1     | done    | `useFlowEngine`, guards, animations, `InteractionCtx`                    |
| 2   | Old flow format (`_playFlow.ts`)   | FlowMaster | 1     | done    | Kill-switched behind `removed`; CLI under `arch`                         |
| 3   | Flowplan format (`defineFlow`)     | FlowMaster | 1     | done    | `projects/**/flowplans/*.ts`; compiled by `compileFlowplan.ts`           |
| 4   | Flow Debugger panel                | FlowMaster | 1     | done    | Journey / rules / state / logs sub-tabs; `FlowDebuggerContent.tsx`       |
| 5   | Entry guards (flow + screen level) | FlowMaster | 1     | done    | `canEnter` / `canNotEnter` / `canEnterFallback`                          |
| 6   | Auto-play per screen               | FlowMaster | 1     | done    | `autoAdvanceDelay` on screen def                                         |
| 7   | Hotspot regions                    | FlowMaster | 1     | done    | `x/y/w/h` in % of screen; wired via interactions map                     |
| 8   | Visual flow editor                 | FlowMaster | 2     | planned | `FlowPlaybackContext` has seam: "Phase 2 (visual editor) keep extending" |

---

## Session Recording

| #   | Feature                        | Subsystem | Phase | Status | Notes                                                             |
| --- | ------------------------------ | --------- | ----- | ------ | ----------------------------------------------------------------- |
| 9   | FlowTracer session recorder    | FlowLens  | 1     | done   | `SessionRecorderProvider`; IndexedDB via `WriteBatcher(300ms)`    |
| 10  | Quality scoring + auto-pruning | FlowLens  | 1     | done   | `computeQuality`; prunes >200 sessions; crash recovery on mount   |
| 11  | Cursor tracking (rAF sampled)  | FlowLens  | 1     | done   | Throttled 50ms default; stored as % of container                  |
| 12  | Toggleable recording channels  | FlowLens  | 1     | done   | 13 channels; `ChannelConfig`; `isChannelEnabled()`                |
| 13  | Session merge                  | FlowLens  | 1     | done   | `handleMerge` re-sequences events/snapshots/cursors monotonically |

---

## Replay & Analytics

| #   | Feature                   | Subsystem | Phase | Status | Notes                                                                   |
| --- | ------------------------- | --------- | ----- | ------ | ----------------------------------------------------------------------- |
| 14  | FlowLens replay mode      | FlowLens  | 1     | done   | Presence-gated (folder-existence check); lazy chunk; real canvas replay |
| 15  | Single-session analytics  | FlowLens  | 1     | done   | Metrics, Paths, Funnel, Heatmap tabs via `AnalyticsOverlay`             |
| 16  | Cursor heatmap            | FlowLens  | 1     | done   | `HeatmapView.tsx`; real screen behind cursor density overlay            |
| 17  | Multi-session Reports     | FlowLens  | 3     | active | `ReportsOverlay.tsx`; revamp in progress (two-pane layout, 4 tabs)      |
| 18  | Committed session library | FlowLens  | 1     | done   | `src/modes/flowlens/library/<ws>/*.json`; glob-loaded in lazy chunk     |

---

## Workspace & Canvas

| #   | Feature                           | Subsystem | Phase | Status | Notes                                                               |
| --- | --------------------------------- | --------- | ----- | ------ | ------------------------------------------------------------------- |
| 19  | Multi-workspace runtime selection | FlowKit   | 1     | done   | `workspaces.json` registry; `localStorage`; URL `?workspace=` param |
| 20  | Canvas (pan, zoom, keepFit)       | FlowKit   | 1     | done   | `canvasReducer.ts`; per-device-type zoom memory                     |
| 21  | Device mockups                    | FlowKit   | 1     | done   | Phone/tablet/desktop/wearable; `DEVICE_PRESETS`                     |
| 22  | Mobile canvas (BottomSheet)       | FlowKit   | 1     | done   | `MobileCanvas.tsx`; feature parity with desktop                     |
| 23  | Kit system (theme tokens)         | FlowKit   | 1     | done   | `src/kits/shared/`; `--kit-*` CSS vars; `data-kit` attribute        |
| 24  | JavaScript workspace support      | FlowKit   | 1     | done   | `allowJs: true` in `tsconfig.workspace.json`; `.jsx`/`.js` screens  |

---

## Simulator & Feedback

| #   | Feature                       | Subsystem | Phase | Status | Notes                                                         |
| --- | ----------------------------- | --------- | ----- | ------ | ------------------------------------------------------------- |
| 25  | Simulator controls (built-in) | FlowKit   | 1     | done   | Connection, network, CVD filters, blur; `useDashboard()`      |
| 26  | Custom simulator controls     | FlowKit   | 1     | done   | `data/simulator.tsx`; `SimControl`, `ControlAccordion`, etc.  |
| 27  | In-canvas feedback wall       | FlowKit   | 1     | done   | Per-screen comments; tag filtering; screenshot attach         |
| 28  | Feedback cloud sync           | FlowKit   | 1     | done   | JSONBin push/pull; `JSONBIN_CONFIG`; Access Key or Master Key |
| 29  | Feedback import (JSON + MD)   | FlowKit   | 1     | done   | Drag-drop, file picker, clipboard; auto-detect format         |

---

## CLI & Agent Tooling

| #   | Feature                                                                | Subsystem       | Phase | Status  | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| --- | ---------------------------------------------------------------------- | --------------- | ----- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 30  | Workspace CLI (`nw`, `rw`, `export`, `handoff`)                        | Workspace-Setup | 1     | done    | `scripts/lib/workspace.js`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| 31  | Old flow CLI (`arch nf/ns/rs/rn/dup/order`)                            | Workspace-Setup | 1     | done    | `scripts/lib/old/flows.js`; all under `arch` sub-command                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                   |
| 32  | Flowplan CLI (`plan:ls`, `check:flowplans`)                            | Workspace-Setup | 1     | done    | `scripts/platform/plans.js` (discovery) + `scripts/checks/flowplans.js` (validation); format-aware (flat + old nested); `check:flowplans` wired into `prebuild`                                                                                                                                                                                                                                                                                                                                                                                            |
| 33  | Sessions CLI (`sessions:ls/import/check/stats/sample/rm/brief`)        | Workspace-Setup | 1     | done    | `scripts/lib/sessions.js`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 34  | Agent sync (`agent:sync`, `agent:check`)                               | Workspace-Setup | 1     | done    | `scripts/lib/agent.js`; spec in `agentSpec.js`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             |
| 35  | CLI redesign (long aliases, help rewrite, `-h` fix, subcommand parser) | Workspace-Setup | 1     | done    | Dispatcher rewritten; `-h`/`help`/`h` all work; `lens:report:<ws>` colon form works; `migrate` uses exact sub-command matching; `dump` reports skipped sections                                                                                                                                                                                                                                                                                                                                                                                            |
| 36  | Feature management system (registry + gate)                            | FlowKit         | 1     | planned | Spec: see `trackers/flowkit-tracker.md` § Feature management system; `src/core/features/` absent — not yet implemented                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| 37  | Kit drift check (`kit:check`)                                          | Workspace-Setup | 1     | done    | `flowkit.js` `cmdKitCheck`; reads `KIT_MANIFEST` + theme CSS files                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| 38  | Old migration guards (`migrate:nav`, `migrate:router`)                 | Workspace-Setup | 1     | done    | Both commands block on flat-flowplan workspaces with a clear error; exact sub-command matching prevents typo pass-through                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 39  | CLI contract smoke tests (plan:ls/check:flowplans/status/lens/migrate) | Workspace-Setup | 1     | done    | `scripts/tests/plan-contract-cli.test.js`; 6 assertions against live nClarity workspace; run via `npm run test:workspace`                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| 40  | Flowaid onboarding persona (`create-flowkit-app`)                      | Package-Publish | 1     | planned | Replaces the removed `--kit:` picker. Spec + decisions in `Flowaid_Onboarding.md`; implementation in `packages/create-flowkit-app/index.js`                                                                                                                                                                                                                                                                                                                                                                                                                |
| 41  | Package foundation (`files`/`exports`/lib build)                       | Package-Publish | 1     | done    | `package.json` `exports["."].types` correctly resolves to `core/config/index.d.ts`; React and Radix UI both in `peerDependencies`+`devDependencies`; `npm run build:lib` produces `dist/lib/` + `dist/types/`                                                                                                                                                                                                                                                                                                                                              |
| 42  | `create-flowkit-app` scaffolder                                        | Package-Publish | 1     | done    | `packages/create-flowkit-app/`; not yet published to npm — `npm create flowkit-app@latest` doesn't resolve yet; test locally via `node packages/create-flowkit-app/index.js`                                                                                                                                                                                                                                                                                                                                                                               |
| 43  | Vite plugin (`flowkit/vite`) — virtual modules, HMR                    | Package-Publish | 1     | done    | `scripts/vite-plugin.js`; `virtual:flowkit/pages\|config\|workspace\|flowStories`; this repo's own `vite.config.ts` consumes it                                                                                                                                                                                                                                                                                                                                                                                                                            |
| 44  | CLI flat-mode detection (`isRepoMode()`, `workspacePath()`)            | Package-Publish | 1     | done    | `scripts/lib/paths.js`; keys off `.flowkit-repo-root` marker file (excluded from npm `files[]`). **Known gaps:** (1) `export.js:123` hardcodes `workspaces/${wsName}` in its ESLint check — breaks `flowkit export` in flat mode; (2) `npm run build`'s `tsc -b` step fails on missing declarations for `vite-plugin.js`/`flowlens-session.js` — pre-existing, blocks a clean build; (3) `workspaces/nClarity` was deleted rather than migrated per the original plan — open decision on whether that was intentional, recoverable from git history if not |
