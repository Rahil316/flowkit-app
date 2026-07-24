import type { DotPathPatch } from '@flowkit/types/index'

// ── applyDotPathPatch ───────────────────────────────────────────────────────────
//
// Applies a dot-path patch onto a db object and returns a NEW object — the input
// is never mutated (important: the FlowStory playback setter replaces db state, so
// callers must pass a fresh, fully-merged object).
//
// Rules (per the FlowStory spec):
//   • Dot-path keys: "local.cart" → db.local.cart, "user.profile.name" → nested.
//   • Missing intermediate paths are created automatically (null-safe).
//   • Object values DEEP-MERGE into the existing object at that path.
//   • Array values REPLACE entirely — the author declares the exact array state.
//   • Primitive / null values overwrite.
//
// `setAtPath`/`UNSAFE_KEYS` here are also the shared foundation for the `db.*`
// helper suite in `dbHelpers.ts` (get/set/has/remove/update) — see that file's
// header comment for the history of why this consolidation happened: this
// codebase had accumulated FIVE independently-hand-rolled dot-path walkers
// across DbInspector, the simulator controls, and the flowStory compiler, each
// with different (and in two cases actively broken) safety behavior.

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Obj = Record<string, any>

export function isPlainObject(v: unknown): v is Obj {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

export const UNSAFE_KEYS = new Set(['__proto__', 'prototype', 'constructor'])

/** Structured deep clone with a JSON fallback (db values are JSON-serializable). */
function clone<T>(v: T): T {
  // structuredClone is available in all supported runtimes; JSON fallback keeps
  // unit tests runnable in any environment.
  try {
    return structuredClone(v)
  } catch {
    return JSON.parse(JSON.stringify(v))
  }
}

/** Deep-merge `patch` into `base`, returning a new object. Arrays replace. */
function deepMerge(base: unknown, patch: unknown): unknown {
  if (isPlainObject(base) && isPlainObject(patch)) {
    const out: Obj = { ...base }
    for (const key of Object.keys(patch)) {
      if (UNSAFE_KEYS.has(key)) continue
      out[key] = deepMerge(base[key], patch[key])
    }
    return out
  }
  // Arrays, primitives, null → patch wins (clone so callers can't mutate source).
  return clone(patch)
}

/**
 * Set `value` at a dot-path on `target` (mutates target), creating intermediates.
 * Object values at the leaf DEEP-MERGE with the existing value there; arrays and
 * primitives overwrite. This merge behavior is specific to patch semantics — the
 * `db.set()` helper in `dbHelpers.ts` wants a plain overwrite instead, so it does
 * not call this function; it reimplements the create-intermediates/guard logic
 * directly. See `dbHelpers.ts` for that version.
 */
export function setAtPath(target: Obj, dotPath: string, value: unknown): void {
  const parts = dotPath.split('.')
  if (parts.some(key => UNSAFE_KEYS.has(key))) {
    throw new Error(`applyDotPathPatch: unsafe key in path "${dotPath}"`)
  }
  let cursor: Obj = target
  for (let i = 0; i < parts.length - 1; i++) {
    const key = parts[i]
    if (!isPlainObject(cursor[key])) {
      // Create (or overwrite a non-object intermediate with) a fresh object.
      cursor[key] = {}
    }
    cursor = cursor[key]
  }
  const leaf = parts[parts.length - 1]
  // Merge objects, replace arrays/primitives.
  cursor[leaf] = deepMerge(cursor[leaf], value)
}

/**
 * Apply a dot-path patch onto `db`, returning a new object. Does not mutate `db`.
 *
 * @example
 *   applyDotPathPatch({ user: { plan: "free" } }, { "user.plan": "pro" })
 *   // → { user: { plan: "pro" } }
 *   applyDotPathPatch({}, { "a.b.c": 1 })
 *   // → { a: { b: { c: 1 } } }
 *   applyDotPathPatch({ items: [1, 2, 3] }, { items: [9] })
 *   // → { items: [9] }   (arrays replace)
 */
export function applyDotPathPatch(db: Obj, patch: DotPathPatch | undefined | null): Obj {
  if (!patch || Object.keys(patch).length === 0) return clone(db)
  const next = clone(db)
  for (const path of Object.keys(patch)) {
    setAtPath(next, path, patch[path])
  }
  return next
}
