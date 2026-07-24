# Screen→Page, Flow→Chapter rename — final approved table

Status: approved, not yet implemented.

## Types (`src/types/index.ts` + a few others)

| Current                                                                   | New                                                         |
| ------------------------------------------------------------------------- | ----------------------------------------------------------- |
| `PageMeta`                                                                | `PageMeta`                                                  |
| `PageVariant`                                                             | `PageVariant`                                               |
| `PageMeta`                                                                | `ChapterMeta`                                               |
| `FlowNode`                                                                | `ChapterNode`                                               |
| `ChapterConfig`                                                           | `ChapterConfig`                                             |
| `ChapterConfig.pages`                                                     | `.pages`                                                    |
| `ChapterConfig.initialPage`                                               | `.initialPage`                                              |
| `PageProps`                                                               | `PageProps`                                                 |
| `PageProps.isChapter`                                                     | `.isChapter`                                                |
| `PageProps.flowState`                                                     | `.chapterState`                                             |
| `WireframeView.flow`                                                      | `.chapter`                                                  |
| `WireframeView.meta` / `.variants`                                        | same field names, types become `PageMeta` / `PageVariant[]` |
| `FlowStep.pageId`                                                         | `.pageId`                                                   |
| `FlowkitConfig.flows`                                                     | `.chapters`                                                 |
| `FlowkitConfig.pageOrder`                                                 | `.pageOrder`                                                |
| `FlowkitConfig.startPage`                                                 | `.startPage`                                                |
| `FlowkitProjectConfig.flows`                                              | `.chapters`                                                 |
| `FlowkitProjectConfig.pageOrder`                                          | `.pageOrder`                                                |
| `FlowkitProjectConfig.modules`                                            | **unchanged** — deprecated legacy shim, left alone          |
| `WorkspaceHierarchyNode.kind: 'flow'                                      | 'screen'`                                                   | `'chapter' | 'page'` |
| `InteractionCtx.activePageId`                                             | `.activePageId`                                             |
| `FeedbackComment.pageId` / `.screenLabel`                                 | `.pageId` / `.pageLabel`                                    |
| `AnnotationTag.pages` / `.flows`                                          | `.pages` / `.chapters`                                      |
| `FlowNavContextValue`                                                     | `NavContextValue` (matches `useNav`)                        |
| `NavContextValue.isChapter` / `.flowState`                                | `.isChapter` / `.chapterState`                              |
| `ScreenPathInfo`, `ScreenGlobMap`, `ScreenRec` (useWorkspaceHierarchy.ts) | `PagePathInfo`, `PageGlobMap`, `PageRec`                    |
| `ResolvedPage`, `ScreenResolver` (compileFlowplan.ts)                     | `ResolvedPage`, `PageResolver`                              |
| `NoPagesProps`                                                            | `NoPagesProps`                                              |

**Unchanged (Flowplan domain):** `FlowplanDef`, `FlowplanRef`, `FlowplanStepEntry`, `Fork`.

**Unchanged (brand names):** `FlowMaster`, `FlowLens`, `Flowkit`/`flowkit`, `flowBook`, `flowStories`.

**Unchanged (Flow Library — brand-flavored "Flow", not the grouping concept):** `FlowSummary`, `FlowLibraryData`, `useFlowLibrary`, the "Flow Library" UI panel name.

**Unchanged (FlowMaster's internal engine):** `useFlowEngine`.

## Functions/hooks

| Current                                                                           | New                       |
| --------------------------------------------------------------------------------- | ------------------------- |
| `makePageId`                                                                      | `makePageId`              |
| `parseScreenSegments`                                                             | `parsePageSegments`       |
| `pickScreenFile`                                                                  | `pickPageFile`            |
| `parseScreenPath`                                                                 | `parsePagePath`           |
| `derivePageLabel`                                                                 | `derivePageLabel`         |
| `cmdCreatePage`/`Remove`/`Rename`/`Move`/`Info`                                   | `cmdCreatePage`/etc.      |
| `cmdListPages`                                                                    | `cmdListPages`            |
| `isHiddenPageId`                                                                  | `isHiddenPageId`          |
| `checkScreens`                                                                    | `checkPages`              |
| `addScreen`/`removeScreen`/`renameScreen`/`moveScreen`/`listScreens`/`pageExists` | `addPage`/etc.            |
| `cmdCreateFlow`/`Remove`/`List`                                                   | `cmdCreateChapter`/etc.   |
| `addFlow`/`removeFlow`/`flowExists`                                               | `addChapter`/etc.         |
| `cmdPromoteFlow`                                                                  | `cmdPromoteChapter`       |
| `useNav`                                                                          | `useNav`                  |
| `useFlowEngine`                                                                   | **unchanged**             |
| `buildFlatHierarchy`/`buildHierarchy`/`resolveConfigDefaults`                     | unchanged (generic names) |

## CLI verbs

| Current         | New               |
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

**Unchanged (Flowplan domain):** `create:flowplan`, `remove:flowplan`, `add:step`, `remove:step`, `list:steps`, `flowplan:info`, `check:flowplans`, `plan:ls`.

## Check rule ids

| Current                               | New                         |
| ------------------------------------- | --------------------------- |
| `screen/ambiguous-folder`             | `page/ambiguous-folder`     |
| `screen/no-default-export`            | `page/no-default-export`    |
| `screen/missing-meta`                 | `page/missing-meta`         |
| `screen/meta-id-mismatch`             | `page/meta-id-mismatch`     |
| `screen/meta-missing-label`           | `page/meta-missing-label`   |
| `config/flow-mismatch`                | `config/chapter-mismatch`   |
| `config/empty-flow`                   | `config/empty-chapter`      |
| `config/orphaned-id` / `orphaned-dir` | unchanged (already generic) |
| `flowplan/invalid-page`               | `flowplan/invalid-page`     |

## Filename convention

| Current                                        | New                                        |
| ---------------------------------------------- | ------------------------------------------ |
| `WelcomeScreen.tsx`, `${pascalName}Screen.tsx` | `WelcomePage.tsx`, `${pascalName}Page.tsx` |
| `export default function WelcomeScreen()`      | `export default function WelcomePage()`    |

## Directory/module renames

| Current file                        | New file                               |
| ----------------------------------- | -------------------------------------- |
| `scripts/authoring/screens.js`      | `scripts/authoring/pages.js`           |
| `scripts/authoring/flows.js`        | `scripts/authoring/chapters.js`        |
| `scripts/authoring/promote-flow.js` | `scripts/authoring/promote-chapter.js` |
| `scripts/checks/screens.js`         | `scripts/checks/pages.js`              |
| `src/shared/utils/useNav.ts`        | `src/shared/utils/useNav.ts`           |

## Composite id shape

Unchanged — still `${first}-${second}` (e.g. `onboarding-welcome`), just conceptually chapter-page now. No data migration needed for the ID format itself.

## Fully excluded from this rename

`flowBook`, `flowStories`, `Flowkit`/`flowkit` (package name), `FlowMaster`, `FlowLens`, `useFlowEngine`, `FlowSummary`/`FlowLibraryData`/`useFlowLibrary`/"Flow Library" (UI panel), the entire Flowplan domain, `FlowkitProjectConfig.modules` (deprecated legacy shim).
