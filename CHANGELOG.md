# Changelog

All notable changes to this project are documented in this file.

## [Unreleased]

### Overview

This release replaces FlowKit's fixed-depth, filename-driven screen-authoring model with a variable-depth, folder-driven identity system, and renames the platform's core vocabulary from Flow/Screen to Chapter/Page. It also fixes several silent-failure and silent-collision bugs uncovered while building the new system.

---

### Added

- **Variable-depth page folders.** A page can now live at `flowBook/<chapter>/.../<page>/<File>.tsx` with any number of organizational folders in between — not just the previous fixed two levels. The first folder is always the chapter id; the last folder is always the page id; everything in between is cosmetic and ignored for identity, but preserved for display.
  - A file with no chapter/page folder at all (`flowBook/File.tsx`) now falls back to chapter id `"misc"`, with the page id derived from the filename.
- **Collision-proof composite page ids.** Page ids are now `${chapterId}-${pageId}` (e.g. `onboarding-welcome`), computed by the new shared `makePageId()` function. This closes a real bug where two different chapters each containing a same-named page folder (e.g. both having a `confirm/` folder) would silently collide into a single merged record, with whichever one "won" determined by nondeterministic filesystem/glob iteration order.
- **`_` / `__` filename-prefix visibility system.**
  - A single `_` prefix on a file or folder marks it **Hidden** — fully real, parsed, compiled, checked, playable, and referenceable by flowplans, but excluded from the default Pages-tab browsing UI. A settings toggle can reveal hidden items.
  - A double `__` prefix marks it **practically non-existent** — excluded from parsing, `check:*` validation, flowplan reference resolution, and `flowkit status` counts.
  - Parent-dominance applies at any nesting depth: any `__` ancestor makes the whole subtree non-existent regardless of what's inside it; otherwise any `_` ancestor makes it hidden.
  - New `flowkit list:pages` flags: `--hidden` (include hidden pages), `--gone` (list only non-existent items — the only way to find them, since they're excluded everywhere else by default), `--all` (show every tier, labeled).
- **`screen/ambiguous-folder` → `page/ambiguous-folder` check rule.** When a page folder contains two or more unprefixed candidate component files, the alphabetically-first file is deterministically chosen as the real page, and a new non-blocking warning is raised (never fails the build). The finding is marked `requiresAcknowledgment: true` and surfaced in a distinct, boxed section of the check report output, separate from the normal flat findings list.
- **Per-page `screenMeta`/`pageMeta.annotations` field.** Annotation badges (the ephemeral review markers shown in the Pages panel) are now declared directly on the screen they apply to, replacing the retired workspace-level `_tags.ts` sidecar file.
- **`.variant-<serial>.tsx` / `.v-<serial>.tsx` variant suffix.** Replaces the old `.variant.<serial>.tsx` form. Both the long form and the shorthand are accepted and equivalent; the serial is captured greedily so hyphenated serials (e.g. `red-theme`) parse correctly.
- **Shared, dependency-free identity module** (`src/shared/utils/screenPathIdentity.js`) — the single source of truth for path parsing, visibility resolution, variant parsing, and composite id construction, used identically by both repo mode (`useWorkspaceHierarchy.ts`, browser/Vite-glob context) and flat mode (`vite-plugin.js`, Node build-time context). Eliminates the previous divergence where flat mode had none of repo mode's filtering (no suffix check, no `_`/`__` handling, no variant parsing, no depth limit).
- `CHANGELOG.md` (this file).

### Changed

#### Directory renames (sequential)

- `flows/` → `flowDesigns/` → **`flowBook/`** (final name)
- `flowplans/` → `flowPaths/` → **`flowStories/`** (final name)

Each rename was centralized behind a single constant in `scripts/helpers/config-filenames.js` (`FLOW_BOOK_DIRNAME`, `FLOW_STORIES_DIRNAME`), so the directory name is defined in exactly one place.

#### Vocabulary rename: Screen → Page, Flow → Chapter

The platform's core vocabulary has changed. A **Flow** (a grouping of screens) is now a **Chapter**; a **Screen** (one component file/folder) is now a **Page**.

- **CLI verbs:**

  | Old             | New               |
  | --------------- | ----------------- |
  | `create:screen` | `create:page`     |
  | `remove:screen` | `remove:page`     |
  | `rename:screen` | `rename:page`     |
  | `move:screen`   | `move:page`       |
  | `list:screens`  | `list:pages`      |
  | `screen:info`   | `page:info`       |
  | `create:flow`   | `create:chapter`  |
  | `remove:flow`   | `remove:chapter`  |
  | `list:flows`    | `list:chapters`   |
  | `promote:flow`  | `promote:chapter` |

  Flowplan-domain verbs were unaffected **by this phase** of the rename: `create:flowplan`, `remove:flowplan`, `add:step`, `remove:step`, `list:steps`, `flowplan:info`, `check:flowplans`, `plan:ls` all kept their pre-rename names at this point. They were renamed in a later pass — see [Unreleased] further down for `create:flowStory`/`remove:flowStory`/`flowStory:info`/`check:flowStories`.

- **Check domains and rule ids:**

  | Old                         | New                       |
  | --------------------------- | ------------------------- |
  | `check:screens`             | `check:pages`             |
  | `screen/ambiguous-folder`   | `page/ambiguous-folder`   |
  | `screen/no-default-export`  | `page/no-default-export`  |
  | `screen/missing-meta`       | `page/missing-meta`       |
  | `screen/meta-id-mismatch`   | `page/meta-id-mismatch`   |
  | `screen/meta-missing-label` | `page/meta-missing-label` |
  | `config/flow-mismatch`      | `config/chapter-mismatch` |
  | `config/empty-flow`         | `config/empty-chapter`    |
  | `flowplan/invalid-screen`   | `flowplan/invalid-page`   |

- **Core types** (`src/types/index.ts` and related):

  | Old                                                              | New                                                                      |
  | ---------------------------------------------------------------- | ------------------------------------------------------------------------ |
  | `ScreenMeta`                                                     | `PageMeta`                                                               |
  | `ScreenVariant`                                                  | `PageVariant`                                                            |
  | `FlowMeta`                                                       | `ChapterMeta`                                                            |
  | `FlowNode`                                                       | `Chapter`                                                                |
  | `FlowConfig`                                                     | `ChapterConfig` (`.pages` → `.pages`, `.initialScreen` → `.initialPage`) |
  | `FlowScreenProps`                                                | `PageProps` (`.isFlow` → `.isChapter`, `.flowState` → `.state`)          |
  | `FlowkitConfig.flows` / `FlowkitProjectConfig.flows`             | `.chapters`                                                              |
  | `FlowkitConfig.screenOrder` / `FlowkitProjectConfig.screenOrder` | `.pageOrder`                                                             |
  | `FlowkitConfig.startScreen`                                      | `.startPage`                                                             |
  | `FeedbackComment.screenId` / `.screenLabel`                      | `.pageId` / `.pageLabel`                                                 |
  | `AnnotationTag.pages` / `.flows`                                 | `.pages` / `.chapters`                                                   |
  | `ScreenResolver` / `ResolvedScreen`                              | `PageResolver` / `ResolvedPage`                                          |
  | `useFlowNav()`                                                   | `useNav()` (prefix dropped entirely, not renamed to `useChapterNav`)     |

- **Filename convention:** scaffolded screen files are now named `<Name>Page.tsx` (was `<Name>Screen.tsx`), with `export default function <Name>Page()`. The suffix is no longer _required_ for any file — screen/page identity has always come from folder position, never the filename — but the CLI still generates it by default for readability.

- **Renamed files:**
  | Old                                 | New                                    |
  | ----------------------------------- | -------------------------------------- |
  | `scripts/authoring/screens.js`      | `scripts/authoring/pages.js`           |
  | `scripts/authoring/flows.js`        | `scripts/authoring/chapters.js`        |
  | `scripts/authoring/promote-flow.js` | `scripts/authoring/promote-chapter.js` |
  | `scripts/checks/screens.js`         | `scripts/checks/pages.js`              |
  | `src/shared/utils/useFlowNav.ts`    | `src/shared/utils/useNav.ts`           |

#### Explicitly unchanged (not part of this rename)

The following were deliberately excluded, as brand/product names or as a separate concept from the Flow→Chapter rename:

- `FlowMaster`, `FlowLens`, `Flowkit`/`flowkit` (package name)
- `flowBook`, `flowStories` (directory names)
- The entire **Flowplan** domain **as of this phase**: `FlowplanDef`, `FlowplanRef`, `FlowplanStepEntry`, `Fork`, `defineFlow`, and all `flowplan/*` check rule ids and CLI verbs were left alone here — a flowplan (the authored playback script) is a distinct concept from a chapter (the grouping of pages). This concept **was** renamed to FlowStory in a later pass; see the dedicated section below.
- `FlowSummary`, `FlowLibraryData`, `useFlowLibrary`, and the "Flow Library" UI panel name
- `useFlowEngine` (FlowMaster's internal engine hook)
- The "Screens tab" UI panel label (`ScreensHierarchy.tsx`, `KitSideExplorer.tsx`) — still literally labeled "Screens" in the live UI
- `FlowkitProjectConfig.modules` (a `@deprecated` legacy alias for `.chapters`) — left untouched as dead-but-supported compatibility surface, not part of the active vocabulary

#### Composite id shape

Unchanged in format — still `${first}-${second}` joined by a hyphen (e.g. `onboarding-welcome`). Only what the two halves are called changed (chapter, page), not the shape of the string itself. No data migration is needed for the id format.

### Fixed

- **Silent screen-collision bug.** Two different flows/chapters each containing a same-named screen/page folder previously merged into a single record with no warning, non-deterministically. Now permanently prevented by construction via composite ids.
- **Fixed-depth silent failure.** A screen placed at any depth other than exactly two folders below the root previously vanished from the app with no error. Now any depth ≥1 is supported and correctly resolved.
- **`FlowkitProjectConfig.flows` fallback chains** in `useWorkspaceHierarchy.ts` and `useFlowLibrary.ts` — updated to read `.chapters` (with `.modules` retained as the deprecated fallback), matching the renamed config field.
- **Stale `makeScreenId`/`parseScreenSegments`/`pickScreenFile` imports** in `scripts/platform/sessions/_shared.js` and `scripts/authoring/flowplans.js` — both files were still importing pre-rename export names from the shared identity module, which would have thrown `SyntaxError: does not provide an export named ...` the first time either code path actually ran. Also fixed a `parsed.flow` → `parsed.chapter` field-name mismatch in the same files' composite-id construction (the shared module returns `.chapter`, not `.flow`).
- **`cmdAddStep` composite-id construction.** `flowkit add:step` previously wrote whatever bare screen id the user passed via `--screen:` directly into the flowplan step, without converting it to the composite `chapter-page` form checks now expect. It now looks up which chapter the bare page id is actually registered under and builds the correct composite id.
- **Duplicate `PageMeta` interface declaration** in `src/types/index.ts` introduced mid-refactor (both `ScreenMeta` and the unrelated `FlowMeta` had been renamed to the same name) — resolved by renaming the latter to `ChapterMeta`, which is what it actually described.
- **`ChapterConfig.pages` field never declared** despite call sites already expecting it — the type declaration lagged behind consumers during the refactor; now consistent.
- Several doc/comment-only inconsistencies (stale `flowState`/`isFlow` wording, stale dirname mentions in generated `.agent/*` content, a stale three-file claim in `CLAUDE.md`'s "Agent spec system" section describing `agent:sync` output that no longer matches its actual single-file-per-workspace behavior — flagged, not fixed, as it predates and is unrelated to this rename).

### Migration notes

- Existing workspaces authored against the pre-rename directory names (`flows/`, `flowplans/`) or the pre-rename `screenId`/bare-id scheme are **not automatically migrated**. They continue to fail `tsc`/`check:*` until manually updated to the new `flowBook/`/`flowStories/` directories, `chapters`/`pageOrder` config fields, and composite page ids in flowplan steps.
- Any hand-authored code importing `useFlowNav` from `@flowkit-shared/utils` must switch to `useNav`.
- Any code destructuring `.isFlow`/`.flowState` from `PageProps` (the props injected into a page by FlowMaster) must switch to `.isChapter`/`.state`.

---

## [Unreleased] (continued) — Flowplan → FlowStory rename

A second, follow-up rename pass. The Chapter/Page rename above deliberately left the Flowplan
domain untouched, on the grounds that a flowplan (the authored playback script) is a distinct
concept from a chapter. This pass renames that concept too, to **FlowStory**, for full vocabulary
consistency across the platform.

### Changed

- **CLI verbs:**

  | Old               | New                 |
  | ------------------ | -------------------- |
  | `create:flowplan` | `create:flowStory`  |
  | `remove:flowplan` | `remove:flowStory`  |
  | `flowplan:info`   | `flowStory:info`    |
  | `check:flowplans` | `check:flowStories` |

  `plan:ls`/`fp:ls`, `add:step`, `remove:step`, and `list:steps` keep their existing verb names
  (only the flag they take changed — see below).

- **CLI flags:**

  | Command                                                | Old flag                   | New flag                    |
  | -------------------------------------------------------- | ---------------------------- | ------------------------------ |
  | `add:step`                                             | `--flowplan:` / `--screen:` | `--flowStory:` / `--page:`  |
  | `remove:step`, `list:steps`                            | `--flowplan:`              | `--flowStory:`              |
  | `create:page`, `remove:page`, `rename:page`, `page:info` | `--flow:`                  | `--chapter:`                |
  | `list:pages`                                           | `--flow:`                  | `--chapter:`                |
  | `promote:chapter`                                      | `--flowplan:` (path)       | `--flowStory:` (path)       |

  `move:page` is a deliberate exception — it keeps `--from-flow:`/`--to-flow:` rather than
  `--from-chapter:`/`--to-chapter:`; this was never migrated and is not a bug.

- **`--page:` on `add:step` still takes a bare page id**, not the composite `chapter-page` form —
  the CLI resolves which chapter the bare id belongs to and writes the composite id into the step
  for you, same construction behavior as before, just under the renamed flag.

- **Check rule ids:** `flowplan/empty-workspace` → `flowStory/empty-workspace`,
  `flowplan/unreadable` → `flowStory/unreadable`, `flowplan/id-filename-mismatch` →
  `flowStory/id-filename-mismatch`, `flowplan/empty-steps` → `flowStory/empty-steps`,
  `flowplan/invalid-page` → `flowStory/invalid-page`, `flowplan/weak-step` →
  `flowStory/weak-step`. Check domain name: `flowplans` → `flowStories` in
  `scripts/checks/index.js`'s `DOMAINS` table.

- **Core types:** `FlowplanDef` → `FlowStoryDef`, `FlowplanRef` → `FlowStoryRef`,
  `FlowplanStepEntry` → `FlowStoryStepEntry`, `isFlowplanRef()` → `isFlowStoryRef()`,
  `CompiledFlowplan` → `CompiledFlowStory`, `FlowplanCompileError` → `FlowStoryCompileError`.
  `FlowplanGate` → `FlowStoryGate`. `FlowPlaybackContext`'s `activeFlowplan`/`setActiveFlowplan` →
  `activeFlowStory`/`setActiveFlowStory`. The compiled step's internal `__flowplan` field →
  `__flowStory`.

- **Recorded event types** (`EventType` union, `src/features/flowTracer/types.ts`): the
  flow-lifecycle and screen-visit event names were renamed to match — `flow.entered` →
  `chapter.entered`, `flow.completed` → `chapter.completed`, `flow.exited-early` →
  `chapter.exited-early`, `flow.blocked` → `chapter.blocked`, `flow.transition` →
  `chapter.transition`, `screen.visited` → `page.visited`, `screen.dwell-end` → `page.dwell-end`,
  `screen.blocked` → `page.blocked`, `state.flow-set` → `state.chapter-set`,
  `sidebar.flow-expanded` → `sidebar.chapter-expanded`. Every producer (`FlowEngine.ts`,
  `DashboardContext.tsx`) and consumer (FlowLens's `analyticsEngine.ts`, `replayState.ts`,
  `sessionMetrics.ts`, and every FlowLens view component) was updated to match. No recorded
  session data exists on disk in this repo, so there was no migration/back-compat concern for
  already-captured sessions.

- **Renamed files:**

  | Old                                                        | New                                                          |
  | ------------------------------------------------------------ | ---------------------------------------------------------------- |
  | `scripts/authoring/flowplans.js`                           | `scripts/authoring/flowStories.js`                          |
  | `scripts/checks/flowplans.js`                               | `scripts/checks/flowStories.js`                             |
  | `src/features/flow-library/compileFlowplan.ts`              | `src/features/flowStory/compileFlowStory.ts` (also moved)   |
  | `src/features/flowStory/FlowplanSettingsContext.tsx`        | `src/features/flowStory/FlowStorySettingsContext.tsx`       |
  | `src/features/flowStory/useFlowplanElementCheck.ts`         | `src/features/flowStory/useFlowStoryElementCheck.ts`        |
  | `scripts/tests/flowplan-steps-cli.test.js`                  | `scripts/tests/flowStory-steps-cli.test.js`                 |

- **`readFlowplanModule`** (`scripts/checks/config.js`) → `readFlowStoryModule`;
  **`checkFlowplans`** → `checkFlowStories`; **`listFlowplanFiles`** → `listFlowStoryFiles`;
  **`cmdCreateFlowplan`/`cmdRemoveFlowplan`/`cmdFlowplanInfo`** → their `FlowStory`-suffixed
  equivalents.

- Every `flowplan`/`Flowplan` prose mention across `src/` and `scripts/` (comments, error
  messages, log output, `help.js`'s command listing) updated to `flowStory`/`FlowStory`.

### Fixed

- **`scripts/checks/index.js` and `scripts/platform/router.js` both imported a nonexistent
  `../authoring/flowStories.js` / `./flowStories.js`** at one point mid-rename (the real files
  were still named `flowplans.js`), which broke the entire CLI dispatcher and the `check`
  command — any `flowkit <command>` invocation, and every `npm run test:workspace` CLI
  integration test, threw `ERR_MODULE_NOT_FOUND` before any command logic ran. Fixed by actually
  renaming the underlying files to match, rather than reverting the importer.
- **`create:page`'s "Next:" hint, `chapters.js`'s post-create hint, `checks/config.js`'s
  `fix`/`clifix` suggestions, `scripts/helpers/scaffold.js`'s generated `lib/docs/overview.md`
  template, and both published scaffolder packages' generated `AGENTS.md` content** all still
  printed the pre-rename `--flow:`/`--screen:` flags after the CLI itself had already moved to
  `--chapter:`/`--page:` — meaning copy-pasting the CLI's own printed guidance would fail. All
  corrected to match the actual current flags.
- **`cmdRemovePage`/`cmdRenamePage`'s dangling-flowStory-reference warning was silently dead
  code.** It searched flowStory files for a bare page id, but `add:step` writes the composite
  `chapter-page` form into steps — so the search could never match, and removing/renaming a page
  that a flowStory step genuinely referenced produced no warning at all. Fixed by having the
  search build the composite id before scanning.
- **`page:info`/`rename:page` assumed an exact `${Pascal(pageId)}Page.ext` filename** and failed
  outright on any page whose file doesn't follow that convention (including this repo's own
  scaffold-generated demo pages, e.g. `WelcomePage.tsx` for page id `welcome-screen`). Both
  commands now locate the real file by scanning the folder (reusing the same `pickPageFile()`
  tie-break already used for ambiguous folders) instead of assuming a filename. `rename:page`
  only renames the file/patches the function name when the existing file *does* match the CLI's
  own generated pattern exactly; otherwise it renames the folder/registration (what identity
  actually depends on) and prints a note that the file was left as-is, rather than corrupting an
  unrelated function name.
- **`scripts/tests/flowStory-steps-cli.test.js` was referenced by name in `package.json`'s
  `test:workspace` script while the file on disk was still named `flowplan-steps-cli.test.js`.**
  Node's `--test` runner silently drops a nonexistent path from a multi-file invocation instead
  of failing the whole run, so this didn't surface as an error — Suite F (the `add:step`/
  `remove:step` fork-guard regression tests) was **silently not executing at all**, with a clean
  exit code and no missing-test warning. Fixed by renaming the file to match; this also
  surfaced two real, previously-masked failures in that suite (see next item).
- **Two tests in the fork-guard suite still used the pre-rename `--screen:` flag** on `add:step`,
  which by then required `--page:` — both were failing (masked by the bug above) once the suite
  actually started running again. Fixed to use `--page:`.
- **`WorkspaceHierarchyNode.kind`'s `'module'` value was dropped** (not renamed) as part of an
  earlier pass in this same rename effort; confirmed no code anywhere still constructs or checks
  for it, so this is a deliberate removal, not a regression.

### Known, deliberately unresolved inconsistencies

- **`FlowStoryDef.homeScreen`** was never renamed to `homePage`, even though `startScreen` →
  `startPage` was. It's used consistently as `homeScreen` in the type, the compiler, and real
  authored content (`workspaces/game-zone/FlowStories/intro-flow.ts`) — not a bug, just an
  inconsistency nobody has addressed yet.
- **Some checked-in, hand-authored flowStory content** (`workspaces/game-zone/FlowStories/*.ts`)
  uses **bare** `pageId` values instead of the composite `chapter-page` form the runtime and
  `check:flowStories` both require. This fails `check:flowStories` (13 findings against that one
  workspace) and silently stalls flowStory playback at runtime, since `FlowMaster.tsx` matches
  steps by exact composite-id equality. Flagged, not fixed — fixing it means editing checked-in
  demo content, which was out of scope for this rename pass.
- **`scripts/authoring/pages.js`'s `move:page`** keeps `--from-flow:`/`--to-flow:` rather than
  `--from-chapter:`/`--to-chapter:`, unlike every sibling page command. Documented as intentional
  (not migrated), not "fixed" to match the others, to avoid an unreviewed behavior change to a
  command not otherwise touched by this pass.
