import type { AnnotationTag, FlowkitConfig, FlowStoryDef } from '../../types/index'

// ── Authoring helpers ───────────────────────────────────────────────────────────
//
// Identity functions that exist purely for TypeScript autocomplete + validation
// at author time. They return their argument unchanged — no runtime cost.
//
// Usage:
//   // workspaces/<ws>/workspace.ts
//   import { defineConfig } from "@flowkit-core/config";
//   export default defineConfig({ projects: { shop: { label: "Shop" } } });
//
//   // workspaces/<ws>/projects/<p>/flowStories/Checkout.ts
//   import { defineFlow } from "@flowkit-core/config";
//   export default defineFlow({ id: "checkout-flow", name: "Checkout", steps: [...] });

/**
 * Author a workspace manifest with full type-checking + autocomplete.
 *
 * Identity function — returns `config` unchanged. It exists purely so
 * `workspace.ts` gets type inference at the call site without an explicit
 * type annotation; there is no runtime behavior or validation.
 *
 * @param config - The workspace manifest (chapters, pageOrder, projects, etc.)
 * @returns The same `config` object, unmodified.
 *
 * @example
 * ```ts
 * // workspaces/<ws>/workspace.ts
 * import { defineConfig } from "flowkit";
 * export default defineConfig({ chapters: ["onboarding", "checkout"] });
 * ```
 */
export function defineConfig(config: FlowkitConfig): FlowkitConfig {
  return config
}

/**
 * Author a FlowStory with full type-checking + autocomplete.
 *
 * Identity function — returns `flowStory` unchanged, same rationale as
 * {@link defineConfig}.
 *
 * @param flowStory - The flowStory definition (id, name, steps, simulator, etc.)
 * @returns The same `flowStory` object, unmodified.
 *
 * @example
 * ```ts
 * // workspaces/<ws>/flowStories/checkout.ts
 * import { defineFlow } from "flowkit";
 * export default defineFlow({ id: "checkout", name: "Checkout", steps: [...] });
 * ```
 */
export function defineFlow(flowStory: FlowStoryDef): FlowStoryDef {
  return flowStory
}

/**
 * Author an annotation tag with full type-checking + autocomplete.
 *
 * Identity/constructor helper — merges `label` into `options` and returns
 * the result unchanged; no runtime validation is performed.
 *
 * @param label - Display label shown as the badge text.
 * @param options - Optional icon, color, note, and expiry (see {@link AnnotationTag}).
 * @returns An `AnnotationTag` object combining `label` and `options`.
 */
export function tag(label: string, options?: Omit<AnnotationTag, 'label'>): AnnotationTag {
  return { label, ...options }
}
