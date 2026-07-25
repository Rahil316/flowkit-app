# FlowLens & FlowTracer — Session Recording, Replay & Analytics

FlowKit can **record** real prototype sessions and **replay** them inside the
workspace, with analytics. Two halves:

- **FlowTracer** — the session _recorder_. Always available; captures an event
  stream (taps, navigations, screen visits, state changes, cursor movement, …)
  into IndexedDB while you use the prototype.
- **FlowLens** — a _mode_ (Figma-Dev-Mode style) that replays those recordings
  through the **real** workspace canvas, with per-session tabs and full-screen
  analytics overlays plus multi-session Reports.

FlowLens is **build-gated and lazy-loaded** so the standalone export never pays
for it. Recording is **always on** regardless.

---

## Build gating

FlowLens availability is **presence-based** — the gate is an `import.meta.glob` in `FlowLensModeContext.tsx`:

```ts
const _flowlensGlob = import.meta.glob('../../modes/flowlens/index.ts')
export const FLOWLENS_AVAILABLE = _flowlensLoader !== undefined
```

If `src/modes/flowlens/index.ts` exists on disk, Vite resolves the glob at build time → `FLOWLENS_AVAILABLE = true` → the lazy chunk is included in the bundle. If the folder is absent, the glob is empty, `FLOWLENS_AVAILABLE = false`, and Rollup DCEs the entire FlowLens chunk — **no `flowlens-*.js` in the build**.

To exclude FlowLens from a build:

- **Repo mode**: delete or rename `src/modes/flowlens/` before `npm run build`
- **Consumer mode (packages)**: no `src/modes/flowlens/` folder exists by default — it ships without FlowLens and cannot be re-enabled at build time

`flowkit export` (standalone HTML export) always includes FlowLens if `src/modes/flowlens/` is present — there is currently no way to exclude it from a standalone export specifically (the `export`/`export:full` distinction that used to control this was removed; proper feature-gating for exports is a planned future improvement). To ship a standalone export without FlowLens today, remove `src/modes/flowlens/` before running `flowkit export`, same as for `npm run build`.

**Recording (FlowTracer) is independent** — it is gated only by the `flowkit:sessions:enabled` localStorage toggle, not by FlowLens availability.

---

## FlowTracer — the recorder

`src/features/flowTracer/context/index.tsx` provides `useSessionRecorder()` /
`useSessionRecorderOptional()` via `SessionRecorderProvider`.

### State machine

`idle → recording ⇄ paused → idle`. **Paused actually pauses** — `logEvent`
drops everything except `session.*` lifecycle events while paused, and cursor
sampling stops.

### What's captured

- **Events** (`SessionEvent`) — `{ id, sessionId, sequenceId, type, timestamp, payload }`.
  `timestamp` is `performance.now()` (ms since page load — intra-session deltas
  are valid; not wall-clock).
- **Cursor samples** (`CursorSample`) — throttled by `cursorSamplingRateMs`
  (default **50ms** ≈ 20/s; `0` = unthrottled). The FlowMaster rAF sampler also
  caps layout reads to ~30fps.
- **Snapshots** (`SessionSnapshot`) — capability exists (`takeSnapshot`) for
  fast-seek anchors; not yet wired into the engine, so replay folds from event 0.
- **Meta** (`SessionMeta`) — name, workspaceId, tags, counts, `qualityScore`,
  `capturedScreenW/H`.

### Channels (`ChannelConfig`)

Interactions & navigation are always on. Toggleable: `effects`, `stateChanges`,
`simulatorChanges`, `panelActivity`, `sidebarActivity`, `cursorTracking`,
`frustratedClicks`, `hoverEvents`. See `isChannelEnabled()`.

### Lifecycle & safety

- **Auto-start on flow entry** (`setAutoStartOnFlow`) — a `chapter.entered` while
  idle starts an `Auto · …` session.
- **Quality gate** — on stop (and on idle auto-stop), sessions below
  `qualityThreshold` (auto-sessions: 40) are deleted. `computeQuality` scores
  chapter-entry (+40), ≥3 pages (+30), ≥30s (+30).
- **Inactivity auto-stop** — 5 min idle finalizes the session with the real
  cursor sample count and the same quality gate as an explicit stop.
- **Crash recovery** — incomplete sessions (no `endTime`) are detected on mount;
  `recoverCrash()` recomputes `eventCount`/`cursorSampleCount`/`qualityScore`/
  `remarks` from the persisted events (not the stale start-of-session meta).
- **Auto-pruning** — `SessionDb.pruneOldSessions(200)` fires fire-and-forget after every `startRecording` and `_autoStartSession`. Oldest sessions are deleted first when the library exceeds 200.

### Write batching (`WriteBatcher`)

Events and cursor samples are **not** written to IndexedDB individually. Instead, `sessionWriteBatcher` (a module-level `WriteBatcher(300)` instance in `sessionDb.ts`) queues writes and flushes them in a single transaction per store every 300 ms. This reduces IDB transaction overhead from ~60/sec (at 60fps cursor tracking) to ~2/sec.

`stopRecording` calls `await sessionWriteBatcher.flush()` before reading cursor count, so no queued writes are lost at session end.

### `recentEvents` debouncing

`logEvent` updates `recentEventsRef` synchronously (live data) but debounces the React `setRecentEvents` call by 150 ms. This means the live event feed re-renders at most ~7 times/sec instead of once per event, regardless of event frequency.

Cleanup: the debounce timer (`recentFlushRef`) is cleared in the component's unmount effect alongside `inactivityTimerRef` and `elapsedIntervalRef`.

### Event types

See `EventType` in `src/features/flowTracer/types.ts`. Notable: `chapter.entered/completed/
exited-early/blocked`, **`chapter.transition`** (emitted only when a navigation resolves
_with a problem_ — a page guard blocks it, or a `do()`/`goTo()` resolver throws/warns;
never fires on a clean, successful navigation — carries `action`, `from`, `to`, and
`blocked`/`error`/`warnings` describing what went wrong; confirmed in
`src/core/layout/FlowEngine.ts`, both emission sites are gated behind a
blocked/`warnings.length > 0` check), `page.visited/dwell-end/blocked`,
`interaction.tap/double-tap/hover/swipe/effect/frustrated-click`, `navigation.*`,
`state.db-init/db-patch/db-reset`, `simulator.*`.

`state.db-init` snapshots the db at record start **only if non-default**;
`state.db-patch` carries the **changed-keys diff** (not the whole db) so replay
can fold db state forward cheaply.

---

## Session export & import

### JSON format

- **Single session** — exported as a plain `SessionExport` object. Extension: `.flowkit-session.json`.
- **Bundle** — multiple sessions exported as a `SessionExport[]` array. Extension: `.bundle.flowkit-session.json`. The import side detects arrays automatically: `Array.isArray(raw) ? raw : [raw]`.

There is no inner `JSON.stringify` wrapper — each `SessionExport` is a raw object in the outer array.

### In-browser workflows

**Export a recorded session to disk:**
Select a session in the **Recorded** tab → use the download action in the right inspector panel. Calls `exportSessionJson()` → downloads a `.flowkit-session.json` file.

**Import a JSON file into the browser (IndexedDB):**
In the **Recorded** tab, click the Upload button (↑) in the toolbar. Accepts `.flowkit-session.json` or a bundle. Session appears immediately in the Recorded tab.

**Promote a recorded session to the committed library (dev only):**
In the **Recorded** tab, hover a session row → click the Archive icon (📁). This `POST`s to `/__flowlens/save-session` (Vite dev plugin middleware) which writes the file to the active study directory. Vite HMR picks up the new JSON file and the session appears in the **Library** tab with a study badge.

### CLI workflows

**Import a session file into the committed library:**

```bash
# Default to active workspace:
flowkit sessions:import path/to/session.json

# Target a specific workspace:
flowkit sessions:import:<ws> path/to/session.json

# Target a specific study:
flowkit sessions:import path/to/session.json --study "Round 2"

# Override workspace mismatch in session metadata:
flowkit sessions:import path/to/session.json --force
```

**Export a committed session back to a file:**

```bash
# Default to active workspace:
flowkit sessions:export <id|name|file>

# Target a specific workspace:
flowkit sessions:export:<workspace> <id|name|file>

# Specify output directory:
flowkit sessions:export <id|name> --dest ./handoffs/
```

**List committed sessions:**

```bash
flowkit sessions:ls            # active workspace
flowkit sessions:ls:<ws>       # specific workspace
flowkit sessions:ls --study "Round 2"  # filter to one study
```

### Session merge

`handleMerge` in `panel.tsx` merges ≥2 sessions into a new one using a single monotonic `seq` counter. Events, snapshots, and cursor samples are all re-sequenced:

1. Events from all parts are concatenated and re-sequenced first.
2. Snapshots from all parts are sorted by original `sequenceId` and re-sequenced continuing from the event counter.
3. Cursor samples are re-sequenced last.

This ensures the FlowLens timeline reconstruction sees no `sequenceId` collisions across the merged stores.

### Delete error handling

`handleDelete` in `panel.tsx` wraps `SessionDb.deleteSession()` in a try/catch. On failure, a dismissible red error banner is shown above the session list. On success, the `deleteError` state is cleared.

---

## Session settings (`useSessionSettings`)

Settings are persisted to `localStorage` under `flowkit:session-settings`. The schema includes a `_version: number` field (currently `1`). On load, stored values are merged into `DEFAULT_SESSION_SETTINGS` with `_version` always overwritten to the current constant — so new fields added to the defaults automatically propagate to existing users, and future breaking migrations can detect stale schemas via the version number.

---

## FlowLens — the mode

Toggle in three places (all hidden when the flag is off):

1. Canvas toolbar — the violet **ScanEye** button (`aria-pressed`).
2. Action Center — "Enter FlowLens mode".
3. Per session card — "Replay in FlowLens".

`FlowLensModeContext` holds `{ enabled, available, selectedSession,
pendingSessionId, replayActive, enter, exit, selectSession }`. It sits **above**
`DashboardProvider` so the dashboard can read `replayActive`.

### Layout (`src/modes/flowlens/components/FlowLensMode.tsx`)

```
┌──────────┬───────────────────────┬──────────────┐
│ Sessions │   live canvas         │ ◉ FlowLens   │  ← right panel
│ list     │   (real device        │   [Exit]     │
│ (left)   │    mockup, replayed)   │  ┌ tabs ┐    │
│          │                       │  Overview…   │
│          │                       │  + View all↗ │
├──────────┴───────────────────────┴──────────────┤
│  ◀ ▶ ━━━━━━━━━ 1×   playback (between panels)    │
└──────────────────────────────────────────────────┘
```

- **Left** — two tabs: **Library** (committed JSON from `workspaces/<ws>/lib/flowLens/sessions/`) and **Recorded** (live IndexedDB sessions). Both are merged and workspace-scoped; library wins de-dupe on id. In dev mode, Recorded rows have a Save to Library button (Archive icon). Selected row highlights violet.
- **Center** — the **live** `PreviewCanvas`; `ReplayController` drives the shared
  `DashboardContext` so the real recorded screens render in the real mockup.
- **Right** — header (brand + Exit) + tabs. No session → **Reports** quick view.
  Session selected → **Overview / Timeline / Paths / Funnel / Heatmap**, each a
  consistent `TabBody` (quick stats inline + **"View all ↗"** → full-screen
  modal). Timeline is fully inline (it's navigation).
- **Bottom** — playback bar (only when replay can drive the canvas).

### Replay engine

`replayFromSnapshot(session, seq)` (`src/modes/flowlens/replayState.ts`) folds events
≤ seq into `{ activePageId, db, devicePreset, orientation, connectionMode,
networkSpeed, colorBlindMode, blurryVision, initialDb }`. `ReplayController`
pushes that into the shared context via imperative setters, **guarded by
`replayActive`** so replayed setters never re-record.

- **Active screen persists across the toggle** — exit replay and you're already
  on the screen you were viewing.
- **Snapshot/restore** — ReplayController snapshots pre-replay db / device /
  orientation / accessibility / connection at mount and restores on unmount
  (keyed by session id). The active screen is intentionally NOT restored.
- **Cross-workspace guard** — a session whose screen ids don't intersect the
  current workspace's `views` disables replay (analytics stay available).

### Session library (committed files)

Sessions committed to the library live at `workspaces/<ws>/lib/flowLens/sessions/<study-id>/*.json` — organized by named study rounds, glob-loaded by `useSessionLibrary.ts`, scoped to the active workspace, and merged with recorded IndexedDB sessions (library wins de-dupe on id). The glob lives inside the lazy FlowLens chunk so committed sessions cost nothing when the mode is off.

`workspaces/<ws>/lib/flowLens/studies.json` tracks the set of studies and the `activeStudyId` — the directory where the next import or Save-to-Library write lands. `reports/` in the same directory holds generated report files and is gitignored.

**Two storage tiers:**

| Location                                         | Populated by                                              | Persists in git?  |
| ------------------------------------------------ | --------------------------------------------------------- | ----------------- |
| IndexedDB (browser)                              | Recording, or Import button in Recorded tab               | No — device-local |
| `workspaces/<ws>/lib/flowLens/sessions/<study>/` | Save to Library (browser, dev) or `sessions:import` (CLI) | Yes — committed   |

**Study management CLI:**

```bash
flowkit sessions:study:ls:<ws>                        # list studies
flowkit sessions:study:new:<ws> "Round 2 — Post Revision"
flowkit sessions:study:active:<ws>                    # show active
flowkit sessions:study:active:<ws> "Round 2"          # change active
flowkit sessions:study:archive:<ws> "Initial Study"   # archive
```

### Analytics

- **Single-session** (full-screen via `AnalyticsOverlay`): Metrics, Paths,
  Funnel, Heatmap. The **Heatmap** renders the real recorded screen behind the
  cursor heat, with independent **Screen / Heatmap** toggles + a color legend
  (`HeatmapView.tsx`).
- **Multi-session Reports** (`reports/ReportsOverlay.tsx`): filter the cohort
  (screen, device, connection, quality, tags, date, outcome, source, **study**) →
  combined funnel, merged per-screen heatmap, roll-up metrics
  (`reports/aggregate.ts`, `reports/sessionFilters.ts`).

**Report generation CLI:**

```bash
# JSON report → workspaces/<ws>/lib/flowLens/reports/
flowkit sessions:report:<ws>
flowkit sessions:report:<ws> --format both   # JSON + Markdown
flowkit sessions:report:<ws> --study "Round 2" --format md --agent  # append to .agent/project.md

# Aliases (backward compat)
flowkit lens:report:<ws>          # same as --format json
flowkit sessions:brief:<ws>       # same as --format md
flowkit sessions:brief:<ws> --append  # same as --agent
```

### Theming & a11y

FlowLens reuses the platform theme (light/dark) and changes only the **brand
accent** to violet `#8b5cf6` (`flowLensTheme.ts` / `FLOWLENS_ACCENT`). Overlays
are opaque, `role="dialog"`, Escape-to-close. The playback scrubber is a
`role="slider"` with arrow-key support; icon buttons carry `aria-label`s.

---

## File map

```
src/features/flowTracer/
  context/
    index.tsx                  ← SessionRecorderProvider, state machine, logEvent, logCursorSample
  components/
    SessionCard.tsx            ← single session list item (quality dot, actions)
    SessionInspect.tsx         ← detail/edit view for a completed session
    SessionSettingsOverlay.tsx ← start/configure recording modal (fps labels, channel toggles)
    SessionExportOverlay.tsx   ← download sessions (JSON / CSV / Markdown) with error surface
    CountdownOverlay.tsx       ← pre-session countdown timer
    useSessionSettings.ts      ← localStorage persistence; _version schema field
  sessionDb.ts                 ← IndexedDB (4 stores) + WriteBatcher(300ms) + pruneOldSessions
  buildSessionExport.ts        ← IndexedDB → SessionExport
  sessionMetrics.ts            ← session quality scoring + event stats
  exportBlobs.ts               ← Blob/CSV/JSON file export
  types.ts                     ← EventType, SessionEvent, SessionMeta, ChannelConfig, …
  panel.tsx                    ← Sessions panel UI (list, merge, delete w/ error banner)
  index.ts                     ← public barrel export

src/shared/contexts/FlowLensModeContext.tsx        ← mode state + FLOWLENS_ACCENT + build gate
src/modes/flowlens/
  index.ts                                         ← lazy default export barrel
  useSessionLibrary.ts                             ← merges committed JSON + IndexedDB; glob → workspaces/**/lib/flowLens/sessions/**/*.json
  exportUtils.ts                                   ← JSON/CSV/Markdown/SVG/PNG helpers; importSessionFromFile; saveToLibrary (dev)
  flowLensTheme.ts                                 ← FlowLens theme colors + accent constants
  components/FlowLensMode.tsx                      ← the whole mode UI
  components/LensSideExplorer.tsx                  ← Library + Recorded tabs; Save to Library button (dev only)
  components/LensSideInspector.tsx                 ← tabbed session info / reports quick view (right panel)
  components/analyticsPrimitives.tsx               ← shared TabBody / QuickStat / ViewAll primitives
  components/ReplayController.tsx                  ← drives the shared DashboardContext
  components/CursorGhost.tsx                       ← replayed pointer ghost over the mockup
  components/CursorHeatmap.tsx                     ← click density heatmap renderer
  components/PlaybackBar.tsx                       ← scrub + autoplay
  components/AnalyticsOverlay.tsx                  ← full-screen overlay shell
  components/FlowLensAnalyticsOverlays.tsx         ← single-session Metrics/Paths/Funnel/Heatmap tabs
  components/MetricsView.tsx                       ← single-session metrics (completion, frustration, etc.)
  components/PathsView.tsx                         ← navigation path sankey/tree
  components/FunnelView.tsx                        ← flow funnel completion rates
  components/HeatmapView.tsx                       ← screen-behind heatmap + toggles + legend
  components/TimelineView.tsx                      ← event rail (colored by type)
  components/reports/ReportsOverlay.tsx            ← multi-session cohort reports + study filter
  components/reports/aggregate.ts                  ← aggregate metrics across session cohorts
  components/reports/sessionFilters.ts             ← filtering logic for cohort selection
  replayState.ts                                   ← fold-forward event reconstruction
  analyticsEngine.ts                               ← per-session + aggregate metrics computation

workspaces/<ws>/lib/flowLens/
  studies.json                                     ← study registry; activeStudyId pointer
  sessions/<study-id>/*.json                       ← committed session library (glob-loaded by Vite)
  reports/                                         ← generated report files (gitignored)

scripts/platform/sessions/
  _shared.js                                       ← path helpers (flowLensRoot, sessionsRoot, reportsDir) + study helpers
  study.js                                         ← study:new / study:ls / study:archive / study:active
  analytics.js                                     ← cmdSessionsReport (unified); cmdLensReport + cmdSessionsBrief as aliases
  crud.js                                          ← ls / import / rm / export / purge (all --study aware)
  sample.js                                        ← generates a sample session into the active study
```
