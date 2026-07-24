# FlowKit Core

The "FlowKit" subsystem covers the platform shell: canvas, workspace model, kit system, device mockups, simulator, feedback, CLI scaffolding, and feature management. Everything that is not flow execution (FlowMaster), recording/analytics (FlowLens), or agent/workspace setup (Workspace-Setup).

---

## Scope

### In scope

#### Canvas & device

- Pan, zoom, keepFit mode — `PreviewCanvas.tsx`, `canvasReducer.ts`, `canvasConfig.ts`
- Device mockups (phone, tablet, desktop, wearable) with correct safe areas — `src/shared/components/devices/`
- Per-device-type zoom memory; `CanvasView` (multi-screen Figma export mode)
- Mobile canvas (`MobileCanvas.tsx`) with `BottomSheet`; full feature parity with desktop

#### Workspace model

- `workspaces.json` — runtime registry (name, label, kit); source of truth for the CLI
- `workspaces.ts` — runtime loader; derives `path`, `config.kit`, `config.language`; localStorage helpers
- Multi-workspace selection at runtime: URL `?workspace=` param → stored value → `WorkspaceSelector`
- Two workspace formats: Old (`flows/_playFlow.ts`) and Flowplan (`projects/**/flowplans/*.ts`)
- Old format kill-switched behind `removed` env flag

#### Kit system

- `src/kits/shared/` — Shadcn/Radix components, `--kit-*` CSS vars, semantic utility classes
- Theme applied via `data-kit="<name>"` on the preview wrapper; dark mode via `data-mode="dark"`
- Cascade order: base → theme → dark → component styles → utilities → workspace overrides
- Workspace-level overrides in `design-system/tokens.css`

#### Simulator

- Built-in controls: connection mode, network speed, CVD filter, blur intensity — `useDashboard()`
- Custom workspace controls: `data/simulator.tsx`; `SimControl`, `ControlAccordion`, etc.
- "Ignore all Simulator Settings" global switch

#### Feedback

- Per-screen comment wall; tag filtering; screenshot attachment; author attribution
- Cloud sync via JSONBin (Access Key or Master Key); `JSONBIN_CONFIG`
- Import: JSON + Markdown; drag-drop, file picker, clipboard paste

#### Feature management system (planned)

- Three layers: Registry (`src/core/features/registry.ts`) → Entitlement Resolver → Feature Gate
- `useFeature("id")` hook + `<FeatureGate>` component at all entry points
- `build: false` = DCE from bundle; `enabled: false` = runtime hidden; `beta: true` = badge only
- Current `FLOWLENS_AVAILABLE` and `LS_SESSIONS_ENABLED` flags are pre-cursors; to be replaced

#### CLI (core commands)

- `flowkit nw`, `flowkit rw`, `flowkit export`, `flowkit handoff`, `flowkit status`
- `flowkit agent:sync`, `flowkit agent:check`

### Out of scope

- Flow execution logic — that is FlowMaster
- Session recording and analytics — that is FlowLens
- Agent file generation spec — that is Workspace-Setup
- A/B testing or runtime feature flag service (LaunchDarkly-style)
- A UI dashboard for managing feature flags
- Remote runtime flag fetching
- Production hosting or CDN delivery of exported prototypes
- Distributing the kit system as a standalone npm package

### Key constraints

- **No global state libraries.** Context only — no Redux, Zustand, or similar.
- **Tailwind v4, configured in CSS.** No `tailwind.config.js`. All tokens in `src/index.css` `@theme {}`.
- **`style={{}}` only for runtime-computed values.** Tailwind classes for everything else.
- **`cn()` always** for conditional Tailwind — no raw template literals.
- **Layer boundaries.** `shared → core → features → modes → app`. No reverse imports.

---

## Decision Log

Append-only. Most recent at top.

---

## 2026-06-26 — Feature management system designed but not implemented

**Decision:** Three-layer architecture planned (Registry → Entitlement Resolver → Feature Gate) with 7 features to register at v1: `flowlens`, `flowplans`, `feedback`, `flowTracer`, `flowDebugger`, `flowLibrary`, `simulator`.
**Reason:** Approaching v1 — need kill switches, beta labels, and plan gating before ship. Current flags (`FLOWLENS_AVAILABLE`, `LS_SESSIONS_ENABLED`) are ad-hoc and inconsistent.
**Source:** This tracker's own In-scope section above (no separate spec file exists)

---

## 2026-06-26 — `workspaces.json` split from `workspaces.ts`

**Decision:** `workspaces.json` holds the registry (name, label, kit) as the CLI-readable source of truth. `workspaces.ts` is the runtime loader that derives `path` and `config` from the JSON — it does NOT export an `active` field.
**Reason:** The CLI needs to read workspace metadata without importing TypeScript. JSON is universally readable. Active workspace selection lives in `localStorage`, not in either file.
**Source:** Refactor visible in `src/workspaces.ts` and `src/workspaces.json`

---

## 2026-06-26 — `flowkit sw` deprecated; workspace switching moved to browser UI

**Decision:** `cmdSwitchWorkspace` prints a deprecation notice and exits. Active workspace is set via the browser UI workspace switcher or `?workspace=<name>` URL param on load.
**Reason:** CLI switching required a dev server restart and didn't work reliably in all environments. The browser UI switcher is faster and always in sync.
**Source:** `scripts/lib/workspace.js:318–323`; confirmed in doc audit
**Update (2026-07-01):** `sw`/`switch`/`switch-workspace` removed entirely — the deprecation stub had zero remaining function and was pure dead code. No replacement needed; workspace switching remains browser-UI-only per the original decision above.

---

## 2026-06-26 — `kit` field in `WorkspaceConfig` is `string`, not a union type

**Decision:** `WorkspaceConfig.kit` is typed as `string` — any value is accepted. There is no union type to extend when adding a new theme.
**Reason:** Union types require a code change every time a new kit is added, creating friction. The canvas sets `data-kit="<value>"` dynamically — runtime, not type-checked.
**Source:** `src/workspaces.ts:5`

---

## 2026-06-26 — Tailwind v4, CSS-only configuration

**Decision:** No `tailwind.config.js`. All custom tokens in `src/index.css` `@theme {}`. Two-tier var architecture: raw `--theme-*` vars set by `ThemeContext`, aliased as `--color-theme-*` for Tailwind utility generation.
**Reason:** Tailwind v4's CSS-native config eliminates the JS config file entirely. Runtime theme injection via CSS vars gives dark/light switching without class toggling or rebuild.
**Source:** `src/index.css`, `src/shared/contexts/ThemeContext.tsx`

---

## 2026-06-26 — Old workspace format kill-switched

**Decision:** Old `_playFlow.ts` / `flows/router.tsx` format is disabled by default. Enabled only via `removed` env flag. The old CLI commands moved under `flowkit arch <cmd>`.
**Reason:** New Flowplan format (`projects/**/flowplans/*.ts`) is the path forward. Old support stays isolated per `DevelopmentValues.md` Principle 16 (Backward Compatibility Through Isolation).
**Source:** `CHANGELOG`, `scripts/flowkit.js:548+`, `src/shared/utils/old/`
