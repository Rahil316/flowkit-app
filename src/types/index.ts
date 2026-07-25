import React from 'react'
export type { FlowNavContextValue } from '../shared/contexts/FlowNavContext'

// ─── Device ───────────────────────────────────────────────────────────────────

export type DeviceType = 'phone' | 'tablet' | 'desktop' | 'wearable'

export type DevicePlatform = 'ios' | 'android' | 'macos' | 'windows' | 'watchos' | 'generic'

export interface DevicePreset {
  label: string
  type: DeviceType
  /** OS/platform that determines shell chrome (status bar, nav bar, notch style). */
  platform?: DevicePlatform
  /** Sub-model variant used by shells to adjust hardware geometry (e.g. "ultra" for larger crown). */
  variant?: string
  width: number
  height: number
  cornerRadius: number
  screenRadius?: number
  hasNotch?: boolean
  hasChin?: boolean
  supportsLandscape?: boolean
  safeTop: number
  safeBottom: number
  safeLeft?: number // reserved for landscape safe areas — not yet consumed by shells
  safeRight?: number // reserved for landscape safe areas — not yet consumed by shells
  marginH: number
  minTapTarget: number
}

// ─── Access Guards ────────────────────────────────────────────────────────────
//
// Guards are functions that receive the live db and return a boolean.
// Use canEnter to ALLOW access only when a condition is true.
// Use canNotEnter to BLOCK access when a condition is true.
// Both can coexist on the same flow or screen — if either fails, access is denied.
//
// Example:
//   canEnter:    ({ db }) => db.auth.isLoggedIn,
//   canNotEnter: ({ db }) => db.user.plan === "free",

export type EntryGuard<Db extends Record<string, unknown> = Record<string, unknown>> = (context: {
  db: Db
}) => boolean

// ─── Page Meta ──────────────────────────────────────────────────────────────
//
// Optional metadata exported from each screen file as `pageMeta`.
// Controls how the screen appears in the sidebar and whether it can be accessed.

export interface PageMeta {
  id?: string
  label?: string
  /** Mark as true for screens that are entry points (not reached via back-nav). */
  isStandalone?: boolean
  /** Short description of what this screen is for. */
  desc?: string
  /** Notes for developers — not shown in the sidebar. */
  devNotes?: string
  /** Allow guard — sidebar shows lock icon when false. */
  canEnter?: EntryGuard
  /** Block guard — sidebar shows lock icon when true. */
  canNotEnter?: EntryGuard
  /** Sidebar badge text. Empty string / whitespace / omitted = no badge. Any other string = badge with that text. */
  hasTag?: string
  /**
   * Freeform tags for filtering/grouping in the Screens tab.
   * Untagged screens are universal (always shown). Category prefixes
   * (role:, type:, state:, platform:, status:) are convention, not enforced.
   */
  tags?: string[]
  /**
   * Human-readable label for this A/B variant (replaces the auto-derived "Screen · b").
   * Only meaningful on `.variant.<serial>.tsx` files.
   */
  variantLabel?: string
  /**
   * Numeric sort position for this variant. Lower = earlier. Default = Infinity (alphabetical fallback).
   * Only meaningful on `.variant.<serial>.tsx` files.
   */
  variantOrder?: number
  /**
   * Annotation badges shown for this screen in the Screens panel (ephemeral review
   * markers — replaces the old workspace-level `_tags.ts` sidecar file; each screen
   * now declares its own annotations directly). Distinct from `tags` above, which is
   * freeform filter/group strings, not visual badges.
   */
  annotations?: AnnotationTag[]
}

export interface ChapterMeta {
  desc?: string
  devNotes?: string
}

// ─── Router Tree ──────────────────────────────────────────────────────────────

/**
 * An A/B variant of a screen. `serial` "default" is the base file (no .variant.);
 * other serials come from `<Name>Screen.variant.<serial>.tsx`.
 */
export interface PageVariant {
  serial: string // "default" | "b" | "c" | …
  label: string
  component: React.ComponentType
  filePath?: string
}

export interface PageView {
  id: string
  label: string
  component: React.ComponentType
  meta?: PageMeta
  /** Workspace-relative path, e.g. flowBook/diagnostics/EquipmentListScreen.tsx */
  filePath?: string
  /**
   * A/B variants of this screen (FlowStory hierarchy only). Always includes the
   * "default" variant whose component === `component`. Absent for legacy views.
   */
  variants?: PageVariant[]
  /** The chapter folder this page is grouped under (FlowStory hierarchy). */
  chapter?: string
  /** The project this screen belongs to (FlowStory hierarchy). */
  project?: string
}

export interface Chapter {
  id: string
  label: string
  children?: PageView[]
  config?: ChapterConfig
}

// ─── Transition Animations ────────────────────────────────────────────────────
//
// Set on an interaction rule to animate the screen change.
// "slide-left" = new screen enters from the right (forward navigation).
// "slide-right" = new screen enters from the left (back navigation).

export type TransitionAnimation =
  'none' | 'fade' | 'slide-left' | 'slide-right' | 'slide-up' | 'slide-down' | 'scale'

// ─── Interaction System ───────────────────────────────────────────────────────
//
// The interaction system lets you define ALL click, swipe, and gesture logic
// in flowStories — screens never need to import anything or wire up handlers.
//
// How it works:
//   1. Give any HTML element in your screen an `id` attribute.
//   2. In your flowStory, add a matching entry in `interactions`.
//   3. FlowMaster listens at the container level — one global listener catches
//      all clicks and bubbles them up. No per-element wiring needed.
//
// Example:
//   // In your screen JSX — just an id, nothing else:
//   <button id="pay-btn">Pay now</button>
//   <div id="cancel">Cancel</div>
//
//   // In your flowStory — all logic in one place:
//   interactions: {
//     "pay-btn": {
//       trigger: "tap",
//       goTo: "confirmation",
//       animation: "slide-left",
//     },
//     "cancel": {
//       trigger: "tap",
//       goTo: "back",
//     },
//   }

/** The gesture or event that triggers this interaction. */
export type InteractionTrigger =
  | 'tap' // single click / tap
  | 'double-tap' // double click
  | 'long-press' // hold for 500ms
  | 'hover' // mouse enter (desktop prototypes)
  | 'swipe-left' // horizontal swipe left on the whole screen
  | 'swipe-right' // horizontal swipe right
  | 'swipe-up' // vertical swipe up
  | 'swipe-down' // vertical swipe down

/**
 * A single interaction rule for one element id.
 *
 * Simple form — go to a screen:
 *   { trigger: "tap", goTo: "home" }
 *
 * With animation and delay:
 *   { trigger: "tap", goTo: "cart", animation: "slide-up", delay: 200 }
 *
 * With a condition — goTo is evaluated against the live db and flow state:
 *   { trigger: "tap", goTo: ({ db }) => db.auth.isLoggedIn ? "home" : "login" }
 *
 * With a db mutation — update data before navigating:
 *   {
 *     trigger: "tap",
 *     do: (ctx) => { ctx.updateDb(db => { db.cart.count++; }); },
 *     goTo: "cart",
 *   }
 *
 * db update only, no navigation:
 *   { trigger: "tap", do: (ctx) => { ctx.updateDb(db => { db.user.liked = true; }); } }
 *
 * Complete the flow:
 *   { trigger: "tap", goTo: "__complete__" }
 */
export interface InteractionRule {
  /** The gesture that fires this rule. Default: "tap". */
  trigger?: InteractionTrigger

  /**
   * Where to navigate after this interaction.
   * - A screen id string: "cart", "home", "login"
   * - "next" — advance to the next screen in order
   * - "back" — go to the previous screen
   * - "__complete__" — finish the flow and call onComplete
   * - "__state__" — run do() only, no navigation
   * - A function for conditional navigation: ({ db, flowState }) => "cart" | "login"
   */
  goTo?: string | ((ctx: Pick<InteractionCtx, 'db' | 'flowState'>) => string)

  /** Screen transition animation. Default: "none". */
  animation?: TransitionAnimation

  /**
   * Delay in milliseconds before the navigation commits.
   * Useful for simulating a loading state or async feedback.
   * Example: delay: 1200 simulates a 1.2s API call before moving on.
   */
  delay?: number

  /**
   * Run logic before (or instead of) navigating.
   * Use ctx.updateDb() to mutate the global mock db.
   * Use ctx.set() / ctx.get() to read/write flow-local state.
   * Use ctx.effect() to log a named signal to the debugger.
   * If goTo is also set, navigation happens after do() runs.
   */
  do?: (ctx: InteractionCtx) => void
}

/**
 * Context passed to interaction `do` functions and conditional `goTo` resolvers.
 */
// "viewId" = workspace-level navigation (DashboardContext); "pageId" = flow-engine step identity (FlowEngine/FlowMaster). Both point at screen components but in different scopes.
export type InteractionCtx = {
  /** The id of the screen that is currently active. */
  activePageId: string
  /** The navigation history for this flow session. */
  history: string[]
  /** The current flow-local sandbox state (see localData in ChapterConfig). */
  flowState: Record<string, unknown>
  /** Read a value from the flow-local sandbox. */
  get: (key: string) => unknown
  /** Write a value to the flow-local sandbox. */
  set: (key: string, value: unknown) => void
  /** The live global mock database. */
  db: Record<string, unknown>
  /**
   * Mutate the global mock database.
   * Works like an immer-style draft — assign values directly.
   * Example: ctx.updateDb(db => { db.cart.items.push(item); })
   */
  updateDb: (updater: (db: Record<string, unknown>) => void) => void
  /**
   * Log a named effect to the Flow Debugger panel.
   * Use this to mark side effects that aren't captured by db mutations.
   * Example: ctx.effect("confetti"), ctx.effect("haptic-feedback")
   */
  effect: (name: string) => void
}

// ─── Hotspots ─────────────────────────────────────────────────────────────────
//
// Hotspots let you define clickable regions for screens that don't have real
// interactive elements — static images, Figma exports, placeholder layouts.
//
// FlowMaster renders invisible overlay divs on top of the screen.
// They participate in the same `interactions` map as real elements — just give
// the hotspot an `id` and define the rule in `interactions`.
//
// Regions are percentage-based so they work on any device size:
//   { id: "cta", region: { x: 10, y: 75, w: 80, h: 10 } }
//   means: 10% from left, 75% from top, 80% wide, 10% tall.

export interface Hotspot {
  /** Must match a key in the flow's `interactions` map. */
  id: string
  /**
   * Position and size in percentage units (0–100) relative to the screen.
   * x = left edge, y = top edge, w = width, h = height.
   */
  region: { x: number; y: number; w: number; h: number }
  /** Optional label shown on hover in the Flowkit canvas (not in exported files). */
  label?: string
}

// ─── Auto-Play ────────────────────────────────────────────────────────────────

/**
 * Auto-play configuration for a flow.
 * When enabled, FlowMaster steps through screens automatically — useful for
 * presentations and demo recordings.
 */
export interface AutoPlayConfig {
  enabled: boolean
  /** Milliseconds between screens. Default: 2000. */
  delay?: number
  /** Animation between auto-play steps. Default: "fade". */
  animation?: TransitionAnimation
  /** Loop back to the first screen after the last. Default: false. */
  loop?: boolean
}

// ─── Chapter Config ──────────────────────────────────────────────────────────────

/**
 * ChapterConfig — the runtime type used internally by FlowMaster.
 * Screens are fully resolved React components.
 */
export interface ChapterConfig {
  /** Unique identifier for this flow. Used in navigation and the sidebar. */
  id: string
  /** Display name shown in the sidebar. */
  label: string

  /**
   * The screens in this flow, in order.
   * Each entry registers a screen component and its display metadata.
   *
   * `autoAdvanceDelay` — automatically advance after N milliseconds (e.g. splash screens).
   * `enterAnimation` — play this animation when this screen is navigated to.
   * `hotspots` — clickable overlay regions for static/image screens.
   */
  pages: {
    id: string
    label: string
    component: React.ComponentType
    meta?: PageMeta
    /** Auto-advance to the next screen after this many milliseconds. */
    autoAdvanceDelay?: number
    /** Animation to play when entering this screen. */
    enterAnimation?: TransitionAnimation
    /** Clickable overlay regions for static screens. */
    hotspots?: Hotspot[]
  }[]

  /**
   * Interactions — the heart of the prototyping system.
   *
   * Keys are element `id` values from your screen JSX (or hotspot ids).
   * Values are one rule or an array of rules (for multiple gestures on one element).
   *
   * All interaction logic — conditions, db mutations, navigation — lives here.
   * Screens stay dumb: they only need an `id` on interactive elements.
   *
   * Example:
   *   interactions: {
   *     "checkout-btn": { trigger: "tap", goTo: "payment", animation: "slide-left" },
   *     "hero-image":   { trigger: "tap", goTo: ({ db }) => db.auth.isLoggedIn ? "home" : "login" },
   *     "like-btn": {
   *       trigger: "tap",
   *       do: (ctx) => { ctx.updateDb(db => { db.post.liked = !db.post.liked; }); },
   *     },
   *   }
   */
  interactions?: Record<string, InteractionRule | InteractionRule[]>

  /** Flow-level access guard. Allow only when this returns true. */
  canEnter?: EntryGuard
  /** Flow-level access guard. Block when this returns true. */
  canNotEnter?: EntryGuard
  /**
   * Where to redirect if canEnter / canNotEnter blocks this flow.
   * Should be a screen id or flow id that exists in this workspace.
   */
  canEnterFallback?: string

  /**
   * Called when the last screen's onNext fires or goTo: "__complete__" is used.
   * Use navigateTo() to send the user somewhere after the flow ends.
   */
  onComplete?: (navigateTo: (id: string) => void) => void

  /** Start on a specific screen instead of the first one. Pass the screen id. */
  initialPage?: string

  /**
   * Flow-level auto-advance delay (ms). Used as a fallback for any screen
   * that does not set its own `autoAdvanceDelay`.
   * To override per-screen, use `autoAdvanceDelay` on each screen entry.
   */
  autoAdvanceDelay?: number

  /**
   * Auto-play configuration. When enabled, FlowMaster steps through screens
   * automatically. Useful for presentations and demo recordings.
   * Can be overridden at runtime via the Simulator panel.
   */
  autoPlay?: AutoPlayConfig

  meta?: ChapterMeta
}

// ─── Screen Props ─────────────────────────────────────────────────────────────

/**
 * Props automatically injected into every screen component by FlowMaster
 * during flowStory playback. All fields are `undefined` when a screen is
 * previewed standalone (e.g. the Screens tab, outside any flow) — use the
 * `isChapter` field to detect which case you're in.
 *
 * These exist as an escape hatch for screens that need programmatic
 * triggers (form submits, async callbacks, custom gesture libraries, etc.);
 * simple taps should prefer an element `id` + a matching flowStory step
 * instead of destructuring these props.
 */
export interface PageProps<
  TState extends Record<string, unknown> = Record<string, unknown>,
  TDb extends Record<string, unknown> = Record<string, unknown>,
> {
  /**
   * Trigger a named action programmatically.
   * The action name must match a key in the flow's interactions map,
   * or be "next" / "back" for sequential navigation.
   *
   * Example: onAction?.("submit", { email: "..." })
   */
  onAction?: (actionName: string, payload?: unknown) => void
  /** Advance to the next screen (sequential fallback). */
  onNext?: () => void
  /** Go back to the previous screen. */
  onBack?: () => void
  /** True when this screen is rendered inside FlowMaster (vs. standalone preview). */
  isChapter?: boolean
  /** The current flow-local sandbox state. Read-only — mutate via ctx.set() in interactions. */
  state?: TState
  /**
   * The live global mock database.
   * Use optional chaining: db?.user?.name
   * (db is undefined when the screen is previewed outside a flow)
   */
  db?: TDb
}

// ─── Dashboard ────────────────────────────────────────────────────────────────

// "viewId" = workspace-level navigation (DashboardContext); "pageId" = flow-engine step identity (FlowEngine/FlowMaster). Both point at screen components but in different scopes.
export interface DashboardState {
  activeViewId: string
  devicePreset: DevicePreset
}

// ─── Simulator ────────────────────────────────────────────────────────────────

export type ColorBlindMode =
  | 'none'
  | 'deuteranopia'
  | 'protanopia'
  | 'tritanopia'
  | 'deuteranomaly'
  | 'protanomaly'
  | 'tritanomaly'
  | 'achromatopsia'

export type ConnectionMode = 'wifi' | 'mobile' | 'airplane'
export type NetworkSpeed = 'strong' | 'weak' | 'offline'

// ─── Feedback ─────────────────────────────────────────────────────────────────

export const FEEDBACK_TAGS = [
  '#minor-issue',
  '#major-issue',
  '#question',
  '#suggestion',
  '#approved',
  '#needs-revision',
] as const

export type FeedbackTag = (typeof FEEDBACK_TAGS)[number]

export interface FeedbackComment {
  id: string
  pageId: string
  pageLabel: string
  tags: FeedbackTag[]
  text: string
  timestamp: string
  authorName?: string
  screenshot?: string
  isImported?: boolean
}

// ─── FlowStory System (Phase 1) ──────────────────────────────────────────────────
//
// A FlowStory is an authored user journey. It is COMPILED into the runtime
// ChapterConfig (see features/flow-library/compileFlowStory.ts) and run by the
// existing FlowMaster/useFlowEngine — the engine is never modified.
//
// Authoring lives in: workspaces/<ws>/projects/<proj>/[modules/<mod>/]flowStories/<Name>.ts
// authored with defineFlow({ ... }) from @flowkit-core/config.

/**
 * A dot-path patch applied onto the flow's db copy.
 * Keys are dot-paths ("local.cart", "user.profile.name"). Objects deep-merge,
 * arrays replace entirely, missing intermediate paths are created (null-safe).
 * Applied via applyDotPathPatch() — never mutates the source.
 */
export type DotPathPatch = Record<string, unknown>

/** How a flow-declared simulator control renders during playback. */
export type SimulatorControlType =
  | 'boolean' // toggle on/off
  | 'toggle' // toggle between two named states
  | 'count' // number stepper with min/max
  | 'select' // dropdown
  | 'text' // free text input
  | 'null-toggle' // value present / null

/** A single simulator control declared by a FlowStory (or a step override). */
export interface SimulatorControl {
  label: string
  /** Dot-path into the flow db copy, e.g. "local.isOnline". */
  path: string
  type: SimulatorControlType
  /** count: bounds */
  min?: number
  max?: number
  /** select: options */
  options?: string[]
  /** toggle: the two named states (on/off labels) */
  states?: [string, string]
  default?: unknown
}

/**
 * Step-level adjustment to the flow-level simulator control list.
 * Exactly one key is used at a time (runtime precedence: exclusive > add/hide > none).
 * Device controls are always visible regardless of these.
 */
export interface StepSimulatorOverride {
  /** Add controls on top of the flow-level list. */
  add?: SimulatorControl[]
  /** Hide flow-level controls by label. */
  hide?: string[]
  /** Show ONLY these, ignoring the flow-level list. */
  exclusive?: SimulatorControl[]
}

/**
 * A decision branch inside a journey. Recursive — forks can contain forks.
 * Omit `mergesTo` for a terminal branch; `mergesTo: "next"` rejoins the parent
 * flow at the step after the fork's entry point.
 */
export interface Fork {
  /** Human-readable branch name ("Payment fails", "Empty cart"). */
  label: string
  /** db patch applied at fork entry (same rules as step-level). */
  db?: DotPathPatch
  /** The branch's own steps. */
  steps: FlowStep[]
  /** Rejoin parent at the next step after fork entry. Omit = terminal branch. */
  mergesTo?: 'next'
}

/** Call another FlowStory by id; its steps are inlined at this position. */
export interface FlowStoryRef {
  ref: string
}

/** One step in a FlowStory — shows a screen, optionally patches db, may branch. */
export interface FlowStep {
  /** Id of the screen to show. Must resolve to a registered workspace screen. */
  pageId: string
  /**
   * The element `id` in the screen's JSX whose tap advances this step
   * (e.g. "checkout" for <button id="checkout">). The compiler keys the
   * advance interaction on this id, and gating treats it as the planned tap.
   * Omit to advance on tap-anywhere (simple/sequential screens).
   */
  on?: string
  /** Dot-path patch merged onto the flow db copy when this step activates. */
  db?: DotPathPatch
  /** What the user does here. Shown as an overlay caption during playback. */
  actionNote?: string
  /** Narrative note about the decision/context. Shown in the step list. */
  decisionNote?: string
  /** Free-text sticky note shown on the canvas node and in the step list. */
  annotation?: string
  /** Adjusts which simulator controls are visible at this step. */
  simulator?: StepSimulatorOverride
  /** Inline if/else branches. Recursive to any depth. */
  forks?: Fork[]
}

/** A step entry is either a real step or a reference to another FlowStory. */
export type FlowStoryStepEntry = FlowStep | FlowStoryRef

/** Type guard: is this entry a FlowStory reference? */
export function isFlowStoryRef(entry: FlowStoryStepEntry): entry is FlowStoryRef {
  return (entry as FlowStoryRef).ref !== undefined
}

/**
 * The authored FlowStory shape. Written with defineFlow({ ... }).
 * Developer-owned: pageId, db, simulator. Designer/PM-editable: name,
 * description, actionNote, decisionNote, annotation, tags.
 */
export interface FlowStoryDef {
  id: string
  name: string
  description?: string
  tags?: string[]
  /**
   * Inline db baseline (primary pattern) OR a preset reference string
   * "db/<preset>.ts" (typed seam — preset loading is Phase-1-stubbed).
   */
  db?: Record<string, unknown> | string
  /** Flow-level simulator controls shown during playback. */
  simulator?: { controls: SimulatorControl[] }
  /**
   * Screen id the device's home button/reset-to-first should target while this
   * flowStory is playing. Falls back to the workspace's `startPage` (or the
   * first declared screen) when unset.
   */
  homeScreen?: string
  /** Ordered steps (or refs to other flowStories). */
  steps: FlowStoryStepEntry[]
}

// ─── Workspace Config & Hierarchy (Phase 1) ────────────────────────────────────

/** Per-project options in manifest.ts. All optional. */
export interface FlowkitProjectConfig {
  /** Display name (defaults to folder name). */
  label?: string
  /** Screens live directly under the project — skip module/flowStory levels. */
  flat?: boolean
  /** Path to a default db preset file for this project. */
  db?: string
  /**
   * Explicit chapter ordering for the Screens tab and Stories.
   * Values must match chapter folder names (which equal flowStory ids after the Part 0 rename).
   * Unlisted chapters are appended after declared ones in discovery order.
   */
  chapters?: string[]
  /** @deprecated Use `chapters` instead. */
  modules?: string[]
  /**
   * Explicit screen ordering within each flow for the Screens tab sidebar.
   * Keys are flow folder names; values are screen folder names in the desired order.
   * Unlisted screens are appended after declared ones in alphabetical order.
   *
   * @example
   * pageOrder: {
   *   diagnostics: ['equipment-list', 'equipment-detail', 'equipment-drill-down', 'trends'],
   * }
   */
  pageOrder?: Record<string, string[]>
}

/** The root workspace manifest authored with defineConfig({ ... }). */
export interface FlowkitConfig {
  workspace?: { name?: string; description?: string }
  /** Flat-layout: explicit chapter ordering at the workspace root (no projects layer). */
  chapters?: string[]
  /** Flat-layout: screen ordering per flow at the workspace root. */
  pageOrder?: Record<string, string[]>
  /** Nested-layout: per-project config (use when the workspace has a projects/ folder). */
  projects?: Record<string, FlowkitProjectConfig>
  /**
   * Screen id to load by default (cold load, canvas "home" button, reset-to-first)
   * when no flowStory is active. Falls back to the first declared screen when unset.
   */
  startPage?: string
  /**
   * Default device shell/mockup shown on load. Must match a `DevicePreset.label`
   * from `src/shared/components/devices` (e.g. "iPhone 16 Pro"). Falls back to the
   * platform default (first entry in `DEVICE_PRESETS`) when unset or unrecognized.
   */
  defaultDevice?: string
  /**
   * Default orientation on load. Ignored if the resolved device preset does not
   * support landscape (`DevicePreset.supportsLandscape`). Falls back to "portrait"
   * when unset.
   */
  defaultOrientation?: 'portrait' | 'landscape'
}

/**
 * A node in the discovered workspace hierarchy consumed by the Screens tab.
 * Levels: project → module → screen (intermediate levels auto-detected).
 */
export interface WorkspaceHierarchyNode {
  kind: 'project' | 'chapter' | 'page'
  id: string
  label: string
  children?: WorkspaceHierarchyNode[]
  /** Present on leaf screen nodes. */
  view?: PageView
}

// ─── Annotation Tags ─────────────────────────────────────────────────────────

/** Badge color options for an {@link AnnotationTag} — maps to theme.accent.* tokens. */
export type AnnotationTagColor = 'blue' | 'green' | 'red' | 'amber' | 'purple'

/**
 * An ephemeral review marker shown as a badge in the Screens tab sidebar.
 * Declared directly on a page via `pageMeta.annotations` (replaces the retired
 * workspace-level `_tags.ts` file) and scoped to that specific page.
 */
export interface AnnotationTag {
  /** Display label shown as the badge text. */
  label: string
  /** Lucide icon name, e.g. "FlaskConical". Rendered before the label. */
  icon?: string
  /** Badge color — maps to theme.accent.* tokens. */
  color?: AnnotationTagColor
  /** Tooltip text shown on hover. */
  note?: string
  /** ISO date (YYYY-MM-DD). Tag is invisible on or after this date. */
  expiresAt?: string
  /** Animate the badge with a pulse ring to draw attention. */
  pulse?: boolean
  /** Screen ids this tag applies to. */
  screens?: string[]
  /** Flow node ids this tag applies to. */
  flows?: string[]
  /** Reserved — no-op until navigation hook is wired. */
  removeOnVisit?: boolean
}
