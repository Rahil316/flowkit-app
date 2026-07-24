// Helper: string casing/slug utilities.
export function toSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '')
}

/**
 * Forgiving kebab-case normalizer for user-supplied CLI identifiers (workspace
 * names, flow/screen ids, etc). Lowercases, replaces any run of whitespace or
 * underscores with a single hyphen, strips anything still outside [a-z0-9-],
 * and collapses repeated/leading/trailing hyphens. Does not guarantee the
 * result is non-empty or starts with a letter — callers still validate the
 * final shape (see assertKebab in validate.js).
 */
export function toKebab(value) {
  return (value ?? '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/[^a-z0-9-]/g, '')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}
