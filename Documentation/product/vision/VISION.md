# FlowKit — Vision & North Star

> _Architecture is the product. Code is merely its current implementation._

---

## What FlowKit is

FlowKit is a **browser-based execution platform for interactive UI prototypes**. Screens are React components. Flows are ordered sequences of screens. The platform executes them — with real conditional logic, a live mock database, device simulation, and session recording — so prototypes behave like real products rather than static click-throughs.

**Who it's for:** Designers and developers building multi-screen product flows who need more than a slide deck but less than a production app. Primary use case: validate interactions and user journeys before writing production code.

**Fidelity range:** Quick wireframes → polished high-fidelity mockups → production-ready component previews. Same platform, same flows, same recording infrastructure at any fidelity.

---

## What a successful v1 looks like

Seven core features, fully working, correctly gated:

| Feature           | What it does                                                                      |
| ----------------- | --------------------------------------------------------------------------------- |
| **FlowMaster**    | Executes flows — interactions, guards, animations, flowplan journeys              |
| **FlowTracer**    | Records every session automatically (taps, navigations, state, cursor)            |
| **FlowLens**      | Replays recordings in the live canvas; single-session and multi-session analytics |
| **Feedback**      | In-canvas per-screen comment wall with cloud sync and export                      |
| **Flow Debugger** | Live runtime inspection: interaction log, db state, navigation history            |
| **Stories**       | Browse and run flowplans; workspace hierarchy tree                                |
| **Simulator**     | Device presets, connection mode, accessibility filters, custom workspace controls |

A feature management system (registry → entitlement resolver → feature gate) gates these at build and runtime — planned, not yet implemented. See `Documentation/project-plans/trackers/flowkit-tracker.md` § Feature management system.

---

## What FlowKit is NOT

Guard rails — these are explicitly out of scope:

- **Not a component library.** The kit system (`src/kits/`) exists to serve workspace authors, not to be distributed as a standalone UI kit.
- **Not a design tool.** FlowKit has no drawing, layout, or visual editing surface. Screens are code.
- **Not a testing framework.** FlowLens analytics inform decisions; they don't assert correctness or replace automated tests.
- **Not a production host.** The standalone export (`flowkit export`) is for sharing previews, not running in production.
- **Not a CMS or feature-flag service.** The feature registry is a dev-edited config file, not a runtime dashboard or LaunchDarkly replacement.
- **Not a backend.** The mock database is an in-memory prototype tool. There is no persistence, auth, or API layer.

---

## Distribution model

FlowKit ships two ways from one repo:

- **Repo mode** — this checkout, for platform development. `workspaces/<name>/` holds author content, platform code lives in `src/`, multiple workspaces coexist and switch via the browser UI.
- **Flat / author mode** — an npm consumer runs `npm create flowkit-app@latest my-project` and gets a project with just `flows/`, `flowplans/`, `lib/`, `flowkit.config.ts`, plus `flowkit` installed in `node_modules/`. No `workspaces/` directory; exactly one implicit workspace.

**Why:** AI coding agents read `src/core/`, `src/features/`, `src/shared/` unprompted and waste context on platform internals an author should never touch. `node_modules` gives universal agent/editor blindness by convention — the author's project root is just their own work.

See `Documentation/PACKAGE-ARCHITECTURE.md` for the technical mechanism (`isRepoMode()` detection, the `flowkit/vite` plugin, virtual modules) and `FEATURES.md`'s Package-Publish rows for what's shipped versus still open.

---

## The five values that guide every decision

From `Documentation/DevelopmentValues.md` — the five highest-leverage:

1. **Single ownership.** Every piece of state has exactly one owner. When ownership is unclear, fix the architecture — don't work around it.
2. **Runtime independence.** The execution engine never depends on how a flow was authored. New authoring formats get new compilers, not runtime changes.
3. **Observers never influence execution.** Recording, analytics, and debugging are read-only. They receive information; they never change what happens.
4. **Layer boundaries are hard.** `Authoring → Compiler → Runtime → Coordination → UI → Observers`. Cross-layer shortcuts need strong justification every time.
5. **Incremental evolution.** The smallest correct improvement, backed by evidence. Speculation is not justification. Large rewrites are risks, not solutions.

Full decision checklist: `Documentation/DevelopmentValues.md`
