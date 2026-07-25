/**
 * Single source of truth for the two config filenames every authoring
 * command, scaffolder, and doc must agree on. Import these instead of
 * retyping the string literal.
 */

/** Per-workspace content registration (workspace identity, chapters, pageOrder). */
export const WORKSPACE_CONFIG_FILENAME = 'manifest.ts'

/** Project-root export settings (exportDefaults, exportProfiles). Plain JSON. */
export const PROJECT_CONFIG_FILENAME = 'flowkit.json'

/** Directory holding per-chapter page folders. Was 'flows', then 'flowBook'. */
export const FLOW_BOOK_DIRNAME = 'flowBook'

/** Directory holding flowStory definition files. Was 'flowplans', then 'flowStories'. */
export const FLOW_STORIES_DIRNAME = 'flowStories'
