---
name: flowkit-author
description: Command FlowKit's authoring CLI and file formats precisely — create/remove/rename workspaces, chapters, pages, flowStories, and components; add/remove flowStory steps; wire simulator controls; understand exactly what each command does to disk and where it silently fails. Use for any authoring task in a FlowKit workspace (repo, flat, or multi-workspace mode), not just the common recipes.
---

Every fact below was checked against source (file:line), not against other docs. Where this
contradicts CLAUDE.md/README/docs/, this is the one that was re-verified — trust this file for
CLI mechanics. Last full re-verification: 2026-07-24, after the `flow`→`chapter`, `screen`→`page`,
`flowplan`→`flowStory`, and `plan:ls`/`fp:ls`→`flowStory:ls`/`fs:ls` renames were completed across
`src/` and `scripts/`.

## Vocabulary mapping — translate the user's words before you act

**Chapter** (a grouping of pages, formerly "Flow") and **Page** (one component file/folder,
formerly "Screen") and **FlowStory** (an authored playback script — a distinct third concept,
formerly "Flowplan") are the three core terms, now the current, correct vocabulary across
identifiers, CLI flags, ruleIds, and file names. `FlowMaster`, `FlowLens`, and the package name
`flowkit` are brand names, never renamed.

A user will very often still say the **old** words out of habit. Translate before acting — don't
ask them to rephrase, and don't silently do the wrong thing:

| If the user says...                     | They almost certainly mean...                                             |
| --------------------------------------- | ------------------------------------------------------------------------- |
| "screen", "screen component"            | **page** — `flowkit create:page`, not a search for `create:screen`        |
| "flow", "add a flow", "flow of screens" | **chapter** — `flowkit create:chapter`, `flowBook/<chapter>/`             |
| "flowplan", "plan"                      | **flowStory** — `flowkit create:flowStory`, `flowStories/<chapter>.ts`    |
| "project" (ambiguous — see below)       | usually **workspace**, but see the real, separate "project" concept below |

**This mapping is for the user's _prose_, not for real code strings.** Some genuinely current,
unrenamed source still contains the literal old words — do not "fix" these thinking they're
typos:

- `homeScreen` on `FlowStoryDef` (never renamed to `homePage` — see the Chapter/Workspace section).

**One rename that DID land today (2026-07-24)**: `flowkit plan:ls` / `fp:ls` → `flowkit
flowStory:ls` / `fs:ls` (`scripts/platform/plans.js` renamed to `flowStoryDiscovery.js`,
`cmdPlanLs`→`cmdFlowStoryLs`). This was a breaking rename with **no back-compat alias** — old
scripts/docs saying `plan:ls` are now wrong and must be updated to `flowStory:ls`. If you see
`plan:ls` referenced anywhere outside `CHANGELOG.md` or a dated historical planning doc, it's
stale — fix it, don't preserve it.

- A real, separate **"project"** concept: `flowkit project:ls` (`pj:ls`) lists **projects** — a
  legacy nested-layout concept (`projects/<proj>/flowStories/...`) that can exist _inside_ a
  workspace, distinct from both "workspace" and "chapter". Most workspaces have zero projects and
  you'll rarely touch this, but if a user's workspace does have one, don't conflate "project" with
  "workspace" — they're two different nesting levels (`workspace.projects.<proj>.chapters[]` per
  `FlowkitConfig`).

---

# Mode you're in matters

Three modes, detected by `scripts/helpers/paths.js#isRepoMode()` (checks for `.flowkit-repo-root`
marker at repo root) and `scripts/helpers/flowkit-manifest.js#isMultiMode()` (reads `package.json`'s
`flowkit.mode`):

| Mode                                         | Workspace lives at                                                  | Create/remove workspace                                                                |
| -------------------------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Repo (this checkout)                         | `workspaces/<name>/`                                                | `flowkit nw:<name>` / `rw:<name>` (repo-mode only)                                     |
| Flat (consumer, `create-flowkit-app`)        | project root itself                                                 | N/A — one implicit workspace, is `process.cwd()`                                       |
| Multi (consumer, `create-flowkit-workspace`) | sibling folder per `package.json`'s `flowkit.workspaces[name].path` | `flowkit create:workspace` / `remove:workspace` / `rename:workspace` (flat/multi-only) |

All other authoring commands (`create:chapter`, `create:page`, `add:step`, etc.) work in every mode
— they resolve the target workspace via `resolveWorkspace()` + `workspacePath()`, which branches on
the mode internally. You never need to change command form between modes, only workspace-creation
commands differ.

**`--workspace:<name>` flag**: optional on every authoring command. In repo mode, defaults to the
active workspace in `src/workspaces.json`. In flat mode it's meaningless (there's only `cwd`). In
multi mode it defaults to `flowkit.workspaces` object's first key.

## `assertKebab()` — auto-normalizes, doesn't just reject (`scripts/helpers/validate.js`)

Every `--name:`/chapter-id/page-id kebab-case requirement below is enforced by this one function
— but "enforced" is not "hard-validated." `assertKebab(value, label)` runs `toKebab()` first
(`scripts/helpers/strings.js`): trims whitespace, lowercases, converts underscores/spaces/stray
punctuation to hyphens, collapses repeated separators. Only if the **normalized** result is still
invalid does it throw. So `--name:"My Test 2"` silently becomes `my-test-2` — it does not error.

Two distinct outcomes, don't conflate them:

- **Input needed no correction** → returns the value unchanged, **prints nothing**.
- **Input needed correction but is now valid** → returns the normalized value **and prints a
  non-error notice** (`  i using '<normalized>' (normalized from '<original>')`) — this is not a
  warning about a problem, just a heads-up that the id on disk won't match what was typed.
- **Still invalid after normalizing** (e.g. leading digit, all-punctuation, empty) → throws
  `ValidationError`, exact message: `${label} '${value}' must be kebab-case (e.g. sign-in)`
  — `label` is whatever the call site passed (`'name'`, `'chapter'`, `'page name'`, `'from-chapter'`,
  etc.), so the exact wording varies per flag but the template is fixed.

Practical consequence: don't assume a `create:chapter --name:"Checkout Flow"` was rejected just
because you typed spaces — check what actually landed in `flowBook/`, it may well be
`checkout-flow` with a quiet notice printed, not an error.

---

# Creating things

## Workspace (repo mode only)

```bash
flowkit nw:my-app [--kit:<name>] [--empty]
```

Default scaffold content (as of the 2026-07-24 game-demo rewrite) is a full playable 7-chapter
demo — a splash/welcome intro into a hub of 6 mini-games (Blackjack, Dice, Tic-Tac-Toe, 2048,
Memory Match, Math Quiz) — sourced from `scripts/helpers/game-demo-scaffold.js`, the single shared
module also used by `create:workspace`/`create-flowkit-app`/`create-flowkit-workspace`. Pass
**`--empty`** for a bare, valid-but-minimal scaffold instead: zero chapters (`chapters: []`,
`pageOrder: {}`), no `flowBook/`/`flowStories/` directories at all, stub `lib/data/db.ts`/
`lib/data/simulator.tsx`. Both forms pass `flowkit check` clean immediately after scaffolding.

**No more `--lang:ts|js` flag** — scaffolding is TypeScript-only now (removed the same day as the
game-demo rewrite). If you see `--lang:` referenced anywhere, it's stale.

Full scaffold's exact file list (46 files under the workspace root, plus `workspace.ts`):
`flowBook/<chapter>/<page>/<PageName>.tsx` for all 18 pages across the 7 chapters,
`flowStories/*.ts` (5 files: `intro-flow.ts` + 4 `journey-*.ts` named playback scripts),
`lib/game-logic/*.ts` (7 files, pure logic), `lib/components/ui/*.tsx` (10 shared components,
pre-registered in `.flowkit/components.json`), `lib/data/db.ts`, `lib/data/simulator.tsx`,
`lib/design-system/tokens.css`, `lib/docs/overview.md`, `index.ts`. Don't assume the old 2-chapter
`onboarding-flow`/`home-flow` demo is still what `nw:` produces — that content was fully replaced.

Note: there is no workspace-level annotation-tags sidecar file anymore (the old `flows/_tags.ts`
is gone). Annotation badges are declared per-page via `pageMeta.annotations` instead.

Also registers the workspace in `src/workspaces.json` and runs `flowkit agent:sync` to generate
`AGENTS.md`/`.agent/*` for the new workspace. Has rollback on failure.

Demo pages import `PageMeta` from `@flowkit/types` and `useAppNav`/`useDb` from
`@flowkit-shared/utils` for navigation and live db reads/writes — **not** `PageProps`. They use
the direct-navigation convention (see Page navigation conventions below), not the
FlowMaster-injected-props convention. Don't assume every scaffolded page uses `PageProps` — the
demo ones deliberately don't. This works identically in flat/multi-workspace consumer mode too —
`@flowkit-shared/utils` resolves the same way there; there is no capability gap between modes,
only a workspace-topology difference.

`intro-flow.ts` sets `homeScreen: 'intro-flow-hub-screen'` — note this field name was **never
renamed** to `homePage` even though everything else moved from screen/flow terminology to
page/chapter. It's a real, currently-shipping field on `FlowStoryDef` — don't "fix" it to
`homePage`, that's not a typo, it's just an inconsistency nobody's addressed yet. (Some other
checked-in content, e.g. `workspaces/game-zone/FlowStories/intro-flow.ts`, uses bare instead of
composite `pageId`s for this same field and elsewhere — that's a separate, known-broken
inconsistency in that specific workspace's content, not something to imitate; see the Forks
section below for why bare ids silently fail at runtime.)

## Chapter

```bash
flowkit create:chapter --name:checkout [--workspace:<name>]
```

`--name:` required, kebab-case (auto-normalized by `assertKebab()` — see above) — prompts
interactively if omitted.
Creates `flowBook/<name>/` and registers it in `workspace.ts`'s `chapters[]` + initializes
`pageOrder[name] = []` (`scripts/authoring/chapters.js`).

Error messages (exact): `✗ Chapter name is required` (no name, prompt also empty), `✗ Chapter
'<id>' already exists`, `✗ <validation error>` (bad kebab-case).

```bash
flowkit remove:chapter --name:checkout [--force] [--workspace:<name>]
```

`--force` required only if the chapter has pages — `✗ Chapter '<id>' has N page(s). Use --force to
delete them.` Deletes `flowBook/<name>/` recursively, removes from `chapters[]` and `pageOrder`.

```bash
flowkit list:chapters [--workspace:<name>]
```

Prints each chapter with its page count. `✗ ... is required` never fires here (no required flags).

## Page

```bash
flowkit create:page --chapter:checkout --name:payment-form [--label:"Payment Form"] [--workspace:<name>]
```

**The flag is `--chapter:`, not `--flow:`** (`scripts/authoring/pages.js` — `parseStringFlag(args,
'chapter')`). `--chapter:` and `--name:` required (both auto-normalized to kebab-case — see
`assertKebab()` above). `--label:` optional, defaults to title-cased name. Error: `✗
--chapter:<chapter-id> and --name:<page-id> are required`. Fails if the chapter doesn't exist yet
(`✗ Chapter '<id>' not found in workspace '<ws>'`) or the page id is already taken anywhere in the
workspace (`✗ Page '<id>' already exists in workspace '<ws>'`).

**Exact output path**: `flowBook/<chapterId>/<pageId>/<PascalName>Page.{tsx|jsx}` — one directory
per page. The generated filename/function name is suffixed `Page` as the CLI's own convention
(e.g. `PaymentFormPage.tsx`, `export default function PaymentFormPage()`) but this suffix is
**not required** — page identity is derived from folder position, never filename. Confirmed
against the real scaffold (`WelcomePage.tsx` lives at
`flowBook/onboarding-flow/welcome-screen/WelcomePage.tsx` — no "Screen" or matching-name
convention at all). Don't assume a flat `flowBook/<chapter>/pages/*.tsx` layout, and don't assume
the folder segment name matches the filename.

Page identity: the page's own id is the **last folder segment**. Folders can nest arbitrarily deep
between the chapter folder and the page folder — only the first segment (chapter id) and the last
segment (page id) matter for identity; everything in between is cosmetic. There's also a **`misc`
chapter fallback** (`src/shared/utils/pagePathIdentity.js`'s `MISC_CHAPTER_ID`): a page file sitting
directly at `flowBook/File.tsx` with zero folder depth gets `chapter: 'misc'`, `page:
<component-name>` — this is a real, deliberate edge case in the identity parser, not just a
missing-folder error.

Registered composite id shown to the user is `${chapterId}-${pageId}` (e.g.
`checkout-payment-form`), built by `makePageId()` — collision-proof across chapters (two chapters
can each have a page folder literally named the same thing without colliding). Internally,
`workspace.ts`'s `pageOrder` map still stores the **bare** page id (chapter-scoped already, no
collision risk there); the composite form is only used for flowStory step references and other
cross-chapter/global contexts. Don't confuse the two: `pageOrder.<chapterId>[]` holds bare ids,
flowStory `steps[].pageId` holds composite ids.

Registration into `workspace.ts`'s `pageOrder.<chapterId>[]` is automatic — no manual config edit
needed.

Generated template (TS mode) imports `PageProps` via the mode-aware helper (see Import correctness
below) and destructures `{ onNext: _onNext, db: _db }` — underscore-prefixed because the
placeholder body doesn't use them yet and this repo's `tsconfig` has `noUnusedLocals: true`.
Rename the `_`-prefixed bindings back to real names as you wire up the page.

The "Next:" hint printed after a successful `create:page` intentionally shows
`--flowStory:<flowStory-id>` as a literal placeholder, not a guessed id — a page's chapter and its
flowStory are separate authored concepts with no derivable relationship (a flowStory's own id is
not necessarily the chapter folder name).

### Renaming and moving pages

```bash
flowkit rename:page --chapter:checkout --name:payment-form --to:payment-details [--workspace:<name>]
flowkit move:page --name:payment-form --from-chapter:checkout --to-chapter:billing [--workspace:<name>]
```

`rename:page` locates the actual page file by scanning the folder (`pickPageFile` tie-break, same
one used for ambiguous folders — see below), not by assuming an exact filename. It only renames the
file and patches the exported function name **when the existing file matches the CLI's own
generated pattern exactly** (`${oldPascal}Page.ext`). For anything else — hand-authored content,
scaffold-generated demo pages, or any file whose name doesn't match that pattern — it renames the
folder and the `pageOrder` registration (which is what identity actually depends on) and prints:

```
Note:      <filename> doesn't match the CLI's generated naming pattern — left as-is.
           Rename it by hand if you'd like it to match '<new-id>'.
```

This is intentional graceful degradation, not a bug — the CLI can't safely guess a new file/function
name from an arbitrary old one. Full rollback on any mid-operation failure (folder rename, file
rename, and `pageOrder` update are all reverted together if any step throws).

`move:page` uses **`--from-chapter:`/`--to-chapter:`** — matching `create:page`/`remove:page`/
`rename:page`/`list:pages`/`page:info`. It previously used `--from-flow:`/`--to-flow:` (the one
page-authoring command that had kept the old `flow` flag name); that was a breaking rename, not
a back-compat alias — old `--from-flow:`/`--to-flow:` scripts must be updated.

`rename:page` also checks the **new** id isn't already taken elsewhere in the workspace before
touching anything: `✗ Page '<newId>' already exists in workspace '<ws>'`. `move:page` has two of
its own guards, both easy to miss: same-chapter no-op (`✗ Page '<id>' is already in chapter
'<fromChapter>'`) and a missing-destination check (`✗ Destination chapter '<toChapter>' directory
not found`, with a `Create it first: flowkit create:chapter --name:<toChapter>` hint) — `move:page`
does **not** create the destination chapter for you.

### Removing a page

```bash
flowkit remove:page --chapter:checkout --name:payment-form [--workspace:<name>]
```

Before deleting, scans every `.ts` file in `flowStories/` for a step whose `pageId` matches the
**composite** `${chapter}-${page}` id (`findFlowStoryRefs()`) — since that's the form `add:step`
actually writes into steps. If found, prints a warning listing the referencing flowStories but
does **not** block the removal or edit them for you:

```
⚠  Warning: flowStory(s) reference '<page-id>': <flowStory-id>, ...
   Update those flowStories after removing this page.
```

Assumes the CLI's own 2-level shape (`flowBook/<chapter>/<page>/`) — a hand-authored page nested
deeper under cosmetic folders isn't located or removed by this command; only its `pageOrder` entry
is unregistered.

### Hiding a page/chapter without deleting it

Prefix the folder (or file) name with a single `_` to hide it from the default Pages-tab browsing
UI — it stays fully real, parsed, compiled, checked, and playable; a flowStory step can still
reference it. Prefix with `__` instead to make it practically non-existent — excluded from parsing,
`check:*`, flowStory reference resolution, and `flowkit status` counts entirely. A `__` ancestor
anywhere in the path dominates a `_` ancestor at any depth (`resolveVisibility()` — parent status
always wins). Use `flowkit list:pages --hidden` / `--gone` / `--all` to see hidden/non-existent/
every-tier pages respectively (default listing shows neither).

`--gone` is the **only** listing mode that can find `__`-prefixed items — it's the sole mode that
scans the filesystem directly instead of reading `workspace.ts`'s `pageOrder`, since non-existent
items are by definition never registered there at all.

### Ambiguous page folders

A page folder is expected to contain exactly one real (non-`_`/`__`-prefixed) component file. If
it contains two or more, the alphabetically-first file is picked deterministically as the real page
(`pickPageFile()`), and `flowkit check:pages` reports a non-blocking `page/ambiguous-folder`
warning naming the winner and the losers, with `requiresAcknowledgment: true` (surfaced in its own
boxed section of the printed report, but never counts toward `errorCount` — never blocks the
build).

### Page variants (A/B naming convention) — parseable, but don't recommend this as a real feature

`pagePathIdentity.js`'s `parseVariant()` recognizes a suffix on the filename stem —
`WelcomePage.variant-red-theme.tsx` or the shorthand `WelcomePage.v-red-theme.tsx` — and splits it
into `{ componentName: 'WelcomePage', variant: 'red-theme' }` (no suffix → `variant: 'default'`).
This is real, working parsing logic, unit-tested, and it genuinely does more than just parse:

- **Repo mode**: `useWorkspaceHierarchy.ts` groups every file in a page folder by variant, attaches
  them as a `variants[]` array on the page's `PageView`, and the Screens-tab UI
  (`PagesHierarchy.tsx`) shows a real variant picker (an "Nᵥ" badge + expandable list) when more
  than one exists. `pageMeta.variantLabel`/`variantOrder` control the picker's display label/order.
  Switching variants in the picker actually re-renders `PreviewCanvas` with the chosen component.
- **Flat/multi-workspace consumer mode is broken for this feature.** `scripts/helpers/vite-plugin.js`'s
  `genScreens()` drops the `variant` field before it reaches `virtual:flowkit/pages` — every
  variant file becomes a separate, colliding page with the _same_ page id instead of being grouped,
  so this only works correctly in repo mode.
- **`flowkit check:pages` actively misfires on a legitimately-authored variant.** It groups
  candidate files by `${chapter}::${page}` only — `variant` is not part of that key — so a base
  file plus its variant sitting in the same folder look like 2+ ambiguous candidates. You'll get a
  spurious `page/ambiguous-folder` warning, and the variant file's own `pageMeta` never gets
  checked at all (only the "winning" file does).
- **No CLI support whatsoever.** `create:page` has no `--variant:` flag; there's no scaffolding,
  no template. Authoring a variant is a fully manual "create the file yourself with the right
  suffix" convention.
- **Zero real usage anywhere in this repo.** No workspace (`test`, `game-zone`, or otherwise) has
  ever actually authored a variant file — this has never been dogfooded.

**Don't present this to a user as a ready-to-use A/B-testing feature.** If asked to build A/B page
variants, be upfront: it half-works in repo mode only, has no CLI support, and will trip a false
`page/ambiguous-folder` warning the moment you use it. If the user's workspace is flat/multi-mode
(the common case for anyone using the published `flowkit` package), this convention doesn't work
at all today — don't recommend it there.

## FlowStory

```bash
flowkit create:flowStory --name:checkout-flow [--workspace:<name>]
```

Creates `flowStories/<name>.ts` with an empty `steps: []`. Import line is generated via
`resolveDefineImport('defineFlow')` — correct for whatever mode you're in (see Import correctness
below). Error: `✗ --name:<flowStory-id> is required`; `✗ FlowStory '<id>' already exists:
flowStories/<id>.ts`.

```bash
flowkit remove:flowStory --name:checkout-flow --force [--workspace:<name>]
```

`--force` is required — without it: `✗ Add --force to confirm deletion of flowStories/<id>.ts`.

```bash
flowkit flowStory:ls [--project:<slug>] [--workspace:<name>]
flowkit fs:ls [--project:<slug>] [--workspace:<name>]
```

Read-only discovery — lists every flowStory in the workspace (name + file path), no required
flags (`scripts/platform/flowStoryDiscovery.js`, formerly `plans.js` — renamed 2026-07-24 along
with the command itself, see the vocabulary section above). Checks the flat layout
(`flowStories/*.ts`) first; only falls back to the legacy nested `projects/<proj>/flowStories/`
layout if the flat directory is empty or absent. `--project:<slug>` scopes to one legacy project;
omit it to search all of them. This is discovery only — it doesn't validate anything; use
`flowkit check:flowStories` for that.

```bash
flowkit project:ls [--workspace:<name>]
flowkit pj:ls [--workspace:<name>]
```

Lists the workspace's **projects** — a legacy nested-layout concept
(`projects/<proj>/flowStories/...`), distinct from both "workspace" and "chapter" (see the
vocabulary section above). Most workspaces have none; in that case it reports the flat-layout
flowStory count instead of an empty list (`Flat workspace — no projects layer. N flowStories in
flowStories/`). Both `flowStory:ls`/`fs:ls` and `project:ls`/`pj:ls` accept `--workspace:` the
normal way — this wasn't true before 2026-07-24 (both previously only accepted a colon-chained
workspace name, undocumented and inconsistent with every other command; fixed alongside the rename).

## Component

```bash
flowkit create:component --name:StatusBadge --path:lib/components/ui [--desc:"..."] [--workspace:<name>]
```

`--name:` must be PascalCase (`/^[A-Z][A-Za-z0-9]+$/`). `--path:` is workspace-relative and
validated to stay inside the workspace (`assertWithinWorkspace`). `--desc:` text is forced onto a
single line before being written into the generated file's leading comment — a newline in `--desc`
would otherwise break out of the `//` comment and inject raw code into the template.

Writes `<path>/<Name>.{tsx|jsx}`, registers it in `.flowkit/components.json` (array of
`{name, path, desc, createdAt}`), and — if a barrel (`index.ts`/`index.js`) exists in that
directory or its parent — auto-appends an export line in the exact form
`export { default as <Name> } from './<relPath>'`. If no barrel is found, it prints a note
instead of failing: `No index.ts found — add export manually or run: flowkit add:export`.

```bash
flowkit remove:component --name:StatusBadge [--path:lib/components/ui] [--workspace:<name>]
```

Looks up the component in the registry by name; `--path` is only needed as a fallback if it isn't
registered. Deletes the file, removes the barrel export line if one exists, and unregisters it.

```bash
flowkit components:find --name:StatusBadge [--workspace:<name>]
flowkit components:ls [--path:lib/...] [--workspace:<name>]
flowkit components:scan [--workspace:<name>]
flowkit add:export --barrel:lib/components/ui/index.ts --name:StatusBadge [--workspace:<name>]
flowkit list:exports --barrel:lib/components/ui/index.ts [--workspace:<name>]
```

`components:find` falls back to a raw filesystem walk of `lib/components/` if the name isn't in
the registry, and tells you to run `components:scan` to register it if found that way.
`components:scan` recursively finds every PascalCase-named, non-`index`-prefixed `.tsx`/`.jsx` file
under `lib/components/` and registers any not already known — additive only, never removes stale
entries (that's what `check:components`'s `components/stale-registry` finding is for). `add:export`
requires the named source file to already exist next to the barrel; it does not create files.

---

# FlowStory steps — the sharp edge

```bash
flowkit add:step --flowStory:checkout-flow --page:payment-form \
  [--on:submit-btn] [--action:"User submits payment"] [--position:2] [--workspace:<name>]
```

`--flowStory:` and `--page:` required — **`--page:` takes a bare page id** (e.g.
`payment-form`, not `checkout-payment-form`). The CLI looks up which chapter that bare id actually
belongs to (by scanning every chapter's `pageOrder` entries) and writes the **composite**
`chapter-page` id into the step for you — you never type the composite form yourself for this
command. If the bare id isn't found anywhere, it prints a "did you mean" suggestion filtered by
matching the first hyphen-segment, plus the full list of known pages:

```
✗ pageId '<id>' not found in workspace chapters
  Did you mean: <matches...>
  Available pages: <all pages...>
```

No `--force` flag on this command.

**How the mutation actually works** (`scripts/authoring/flowStories.js`):

1. Reads the flowStory file as text, strips the `import` line and the `export default
defineFlow(` wrapper, and evaluates the remainder with `new Function()` to get the JS object
   back out (`parseFlowStory()`).
2. Splices the new step into the resulting `steps` array (respecting `--position:` if given — an
   unparseable or omitted position appends to the end).
3. Re-serializes **only** the `steps: [...]` block back into the file via a **non-greedy regex**
   (`/steps:\s*\[[\s\S]*?\]/`) — everything else in the file (imports, `db`, `simulator`,
   `homeScreen`, comments) is left untouched, but the regex only matches up to the _first_ `]`.

**Consequence — do not use `add:step`/`remove:step` on a flowStory that has `forks`.** The
fork-guard itself is a simple check — `rewriteSteps()` does `steps.findIndex(s =>
Array.isArray(s.forks) && s.forks.length > 0)` and throws before touching the file if any step has
forks. This is _not_ a bracket-depth scan (that's `promote-chapter.js`'s mechanism, a different
file — don't conflate the two). The reason the guard exists at all: `formatStep()` only emits
`pageId`/`on`/`actionNote`/`decisionNote`/`annotation` — it has no serialization path for a step's
`forks: [...]` array, and the non-greedy regex would match the first closing bracket, not the true
end of the array, once forks are present. Exact error message:

```
✗ Step [<idx>] has forks — add:step/remove:step can't safely rewrite a flowStory with forks
  (only simple, non-nested step arrays are supported). Hand-edit <file> directly, or use
  "flowkit promote:chapter" to extract the fork first.
```

```bash
flowkit remove:step --flowStory:checkout-flow --index:2 [--workspace:<name>]
```

0-based index (`✗ Index <n> out of range (0–<max>)` if invalid), same regex-rewrite mechanism and
same fork guard.

```bash
flowkit list:steps --flowStory:checkout-flow [--workspace:<name>]
flowkit flowStory:info --name:checkout-flow [--workspace:<name>]
```

`list:steps` prints every step's composite `pageId`, `on`, and `actionNote`. `flowStory:info`
prints id/name/description/step-count plus the first 5 steps.

## Forks in flowStories

Forks aren't created via CLI — author them directly in the flowStory file. `pageId` values inside
a flowStory file must be the **composite** `chapter-page` form (matching what `add:step` writes),
not a bare page id:

```ts
{
  pageId: 'checkout-cart',
  on: 'checkout-btn',
  forks: [
    { label: 'Empty cart', steps: [{ pageId: 'checkout-empty-cart' }] },              // terminal
    { label: 'Payment fails', steps: [{ pageId: 'checkout-error' }], mergesTo: 'next' }, // rejoins
  ],
}
```

`mergesTo: 'next'` rejoins the parent flow at the step after the fork's entry point; omit it for a
terminal branch. Forks are recursive (a fork's steps can themselves have forks).

**Important, real-world caveat**: some checked-in, hand-authored flowStory content in this repo
(e.g. `workspaces/game-zone/FlowStories/*.ts`) uses **bare** `pageId` values, not the composite form
— this is a known, currently-unresolved inconsistency in that content (not something this skill
should imitate). At runtime, `FlowMaster.tsx` matches steps via `s.pageId === activePageId`, and
`activePageId` is always the composite form the runtime actually computes — so a step with a bare
`pageId` will never match and playback silently stalls at that step. Always author new steps with
the composite form, whether by hand or via `add:step` (which builds it for you automatically).

## Extracting a fork into its own flowStory file

```bash
flowkit promote:chapter --flowStory:flowStories/checkout-flow.ts --fork:"Payment fails" [--as:payment-fails-flow]
```

Despite the command name (`promote:chapter`), **this does not create a chapter** — it writes a new
standalone **flowStory file** (`scripts/authoring/promote-chapter.js`). `--flowStory:` takes a
**path** to the source flowStory file (e.g. `flowStories/checkout-flow.ts`), not just an id.
`--fork:` is the fork's exact `label` text. `--as:` optional (defaults to a kebab-cased slug of the
fork label, with `-flow` appended if `--as:` was omitted). The new file's name is
`${PascalCase(slug)}.ts` — **PascalCase, not kebab-case** (e.g. `--as:payment-fails-flow` writes
`flowStories/PaymentFailsFlow.ts`).

This is the one authoring command that correctly handles nested brackets: it locates the fork by
regex-matching its `label` (tolerating single, double, _or_ backtick quotes around the label
string — not double-quote-only), then does a genuine **bracket-depth scan** (tracking `[`/`]`
depth, skipping over quoted strings/template literals and `//`/`/* */` comments so a stray bracket
character inside an `actionNote` string doesn't throw off the count) to find the true end of that
fork's `steps: [...]` array.

It does **not** edit the source file — it writes the new file, then prints the exact `forks: [...]`
replacement snippet (using `{ ref: '<new-id>' }`) for you to paste in by hand at the fork site.

Error messages: `✗ No fork with label: "<label>" found in <file>`, `✗ Fork "<label>" has no steps:
array`, `✗ Could not find steps array opening for "<label>"`, `✗ Unbalanced steps array for fork
"<label>"`, `✗ Target already exists: <path>`.

## Reference another flowStory inline

```ts
steps: [
  { pageId: 'onboarding-welcome' },
  { ref: 'shared-auth-flow' }, // FlowStoryRef — inlines that flowStory's steps here, namespaced
]
```

`isFlowStoryRef()` type-guards on presence of `ref`. The compiler (`compileFlowStory.ts` in
`src/features/flowStory/`) inlines the referenced plan's steps at this position when building the
runtime `ChapterConfig`, namespacing their ids with the ref target's id (e.g.
`checkout::cart`).

---

# Import correctness — don't hardcode either mode's import path

Any authoring command that generates a **brand-new file** must not hardcode `'flowkit'` or
`'@flowkit-core/config'` for its `defineFlow`/`defineConfig`/`PageProps` import — the correct one
depends on repo vs. flat/multi mode. Two helpers in `scripts/helpers/paths.js` exist specifically
because this was gotten wrong twice before (`create:flowStory` hardcoded `'flowkit'`, breaking
repo mode; `promote-chapter.js` hardcoded `'@flowkit-core/config'`, breaking consumer mode):

```js
resolveDefineImport('defineFlow') // → `import { defineFlow } from '@flowkit-core/config'` (repo)
// → `import { defineFlow } from 'flowkit'`               (flat/multi)
resolveTypeImport('PageProps') // repo: `import type { PageProps } from '@flowkit/types'`
// flat/multi: `import type { PageProps } from 'flowkit'`
```

Mode detection: `isRepoMode()` checks for a `.flowkit-repo-root` marker file at `ROOT`. If you ever
write a new file-generating authoring command, use these helpers — don't inline the import string.
(This is distinct from `config-patch.js`'s `writeConfig()`, which round-trips an _existing_ file's
import line rather than generating one from scratch — different mechanism, same underlying
mode-awareness requirement.)

---

# Page navigation conventions — two, don't mix

1. **Direct nav — use `useAppNav()`** (`@flowkit-shared/utils`):
   `const { navigateTo } = useAppNav(); onClick={() => navigateTo(id)}`. No `isChapter` prop, no
   manual guard. The hook reads `FlowNavCtx` non-throwing (unlike `useNav()`, which throws outside
   a chapter — "useNav() was called outside a FlowMaster... For data access use useDashboard()
   instead") and picks FlowMaster's chapter-aware `navigateTo` (routes through `commitNavigation` —
   guards, animations, debugger, recording) when this page is rendered inside a chapter, or
   `DashboardContext`'s `navigateTo` otherwise. Calling it unconditionally is always safe.
   `useAppNav()` does **not** expose `db` — pages that need `db` also call `useDashboard()`
   alongside it (see the scaffold's `SetupPage`/`ReadyPage`/`HomePage`/`DetailPage` templates for
   the two-hooks-together pattern). Returns `{ navigateTo, isChapter, state }` — `state` is
   `flowNav.flowState` when inside a chapter, `undefined` otherwise.

   A page may instead call `useDashboard().navigateTo(id)` directly, guarded with
   `onClick={() => !isChapter && navigateTo(id)}`. This works, but the guard must be written by
   hand on every call site, and forgetting it doesn't throw — it silently _also_ fires during
   chapter playback, desyncing `DashboardContext`'s view history from `FlowEngine`'s step index.

2. **FlowMaster-injected props** (`PageProps`: `onAction`/`onNext`/`onBack`, all `undefined`
   outside active playback): FlowMaster's `handleContainerClick` (`src/core/layout/FlowMaster.tsx`)
   has two entirely separate dispatch paths depending on whether the active flow is a compiled
   flowStory:

   - **FlowStory mode** (`flowStory && currentNext !== undefined`): if the current step has no
     planned element (`currentOn === undefined`, a tap-anywhere step), _any_ tap on the container
     advances immediately. If the step does specify `currentOn`, the click target (or an ancestor,
     walked up to the container) must have a matching DOM `id` — a button just needs
     `id="submit-btn"` to match a step's `on: 'submit-btn'`, no `onClick` required. A tap that
     misses calls `flashOffScript()` (a visual "off-script" flash), not an error.
   - **Legacy `flow.interactions` mode** (no flowStory active): a completely different mechanism —
     walks up from the click target looking for any ancestor `id` present as a key in
     `flow.interactions`, and fires the matching rule(s) via `fireRule()`. Only _this_ path logs
     `interaction.frustrated-click` when no rule matches anywhere in the ancestor chain — flowStory
     mode's off-script taps never reach this frustrated-click logging at all (they return before it
     via `flashOffScript`).

   This mechanism is independent of convention (1) — off-script detection, the "Show Hints" glow,
   and `useFlowStoryElementCheck`'s dev-mode authoring diagnostic (warns when a step's `on` doesn't
   match any real element on the page) all structurally depend on `on` being a queryable DOM id —
   none of it is affected by which hook a page uses for direct navigation.

Pick one convention per page. `id="submit-btn"` (convention 2) and `onClick={() =>
navigateTo(id)}` via `useAppNav()` (convention 1) can coexist on the same element without conflict
— this is exactly what the scaffold's demo buttons do. What you must never do is combine
convention 2's `id` with an _unconditional, unguarded_ `useDashboard().navigateTo()` call — that
double-fires and desyncs chapter state from dashboard nav state.

---

# Simulator controls

Barrel: `src/features/simulator/controls/index.ts` — exports `ControlAccordion`, `SimAction`,
`SimControl`, `SimNumberInput`, `SimSegmented`, `SimSelect`, `SimTextInput`, `SimToggle`.
`SimArrayEditor`/`SimObjectEditor` exist as files but are deliberately not exported from the
barrel.

Per-workspace controls live in `lib/data/simulator.tsx` (default export, a React component — the
scaffold generates one automatically):

```tsx
import { ControlAccordion, SimAction, SimControl } from '@flowkit-features/simulator/controls'

export default function WorkspaceSimulatorControls() {
  return (
    <ControlAccordion label="User" defaultOpen>
      <SimControl label="Name" bind="db.user.name" />
      <SimControl label="Plan" bind="db.user.plan" options={['Free', 'Pro', 'Enterprise']} />
    </ControlAccordion>
  )
}
```

Per-step overrides use `StepSimulatorOverride` (`hide?: string[]`, `exclusive?: SimulatorControl[]`)
on a `FlowStep`'s `simulator` field — not a CLI-managed concern, author it directly in the
flowStory.

---

# db patching

`FlowStep.db` and `Fork.db` are `DotPathPatch` (`Record<string, unknown>`), applied via
`applyDotPathPatch(db, patch)` (`src/shared/utils/applyDotPathPatch.ts`) — never mutates the input,
dot-path keys auto-vivify nested objects, objects deep-merge, arrays and primitives replace
wholesale:

```ts
applyDotPathPatch({ user: { plan: 'free' } }, { 'user.plan': 'pro' })
// → { user: { plan: 'pro' } }
applyDotPathPatch({ items: [1, 2, 3] }, { items: [9] })
// → { items: [9] }  (arrays replace, never merge element-by-element)
```

⚠️ Two distinct safety checks, not one: `setAtPath()` **throws** if any dot-path _segment_ is
`__proto__`/`prototype`/`constructor` (`Error: applyDotPathPatch: unsafe key in path "..."`) —
this guards the path string itself. Separately, `deepMerge()` silently **skips** those same keys
when merging _nested object values inside a patch_ (a different attack surface: a legitimate path
whose patch value itself contains an unsafe key one level down). Both were fixed together as a
real prototype-pollution gap; still avoid passing wholly untrusted external input as a patch
without your own review — the guard covers the known vectors, not every conceivable one.

This same `setAtPath`/`UNSAFE_KEYS` foundation is shared with `dbHelpers.ts`'s `db.*` helper suite
(`get`/`has`/`set`/`remove`/`update`, used via `useDb()`) — consolidated from five independently
hand-rolled dot-path walkers that used to exist across DbInspector, the simulator controls, and
the flowStory compiler, two of which were actually broken. `db.set()` does a plain overwrite
rather than `applyDotPathPatch`'s deep-merge semantics — it reimplements the guard logic directly
rather than calling into this file.

---

# Validating what you authored

```bash
flowkit check                       # all 5 domains
flowkit check:flowStories           # prebuild gate — npm run build always runs this
flowkit check:pages
flowkit check:config
flowkit check:components
flowkit check:db
flowkit check:pages:my-workspace    # domain + explicit workspace (colon-chained form)
flowkit check --workspace:my-workspace --json
```

Domains map to `scripts/checks/index.js`'s `DOMAINS` table exactly: `pages`, `config`,
`components`, `db`, `flowStories`. Exits non-zero if `report.errorCount > 0` — this is what blocks
`npm run build`.

`--json` output shape (verified live against a clean workspace):

```json
{ "workspace": "<name>", "errors": 0, "warnings": 0, "results": [], "requiresAcknowledgment": [] }
```

`results` is the flat findings array (each with `ruleId`/`severity`/`file`/`message`/`fix`?/
`clifix`?); `requiresAcknowledgment` is a separate, filtered array containing only the findings
that also have `requiresAcknowledgment: true` — i.e. `page/ambiguous-folder` findings appear in
both `results` and `requiresAcknowledgment` simultaneously, not just one or the other.

Every ruleId, its severity, and whether it requires acknowledgment (verified directly against
`ruleId:`/`severity:`/`requiresAcknowledgment:` in each `scripts/checks/*.js` file):

| ruleId                           | severity | requiresAcknowledgment |
| -------------------------------- | -------- | ---------------------- |
| `page/ambiguous-folder`          | warning  | **true**               |
| `page/no-default-export`         | error    | —                      |
| `page/missing-meta`              | error    | —                      |
| `page/meta-id-mismatch`          | error    | —                      |
| `page/meta-missing-label`        | warning  | —                      |
| `config/chapter-mismatch`        | error    | —                      |
| `config/empty-chapter`           | warning  | —                      |
| `config/orphaned-id`             | error    | —                      |
| `config/orphaned-dir`            | warning  | —                      |
| `components/stale-registry`      | warning  | —                      |
| `components/unregistered`        | warning  | —                      |
| `components/barrel-phantom`      | error    | —                      |
| `components/barrel-gap`          | warning  | —                      |
| `db/no-exports`                  | error    | —                      |
| `flowStory/empty-workspace`      | error    | —                      |
| `flowStory/unreadable`           | error    | —                      |
| `flowStory/id-filename-mismatch` | error    | —                      |
| `flowStory/empty-steps`          | warning  | —                      |
| `flowStory/invalid-page`         | error    | —                      |
| `flowStory/weak-step`            | warning  | —                      |

**Only `page/ambiguous-folder`** has `requiresAcknowledgment: true` — surfaced in a distinct boxed
section of the printed report (`printAcknowledgmentSection()`), but never counted toward
`errorCount`, so it never blocks the build on its own. `components/barrel-phantom` (a barrel
exports a name whose source file doesn't exist) and `components/barrel-gap` (a registered
component isn't exported from its barrel) are easy to miss if you're going from memory — they
aren't in most people's mental model of the 5 domains, but they're real, separate ruleIds from
`components/stale-registry`/`components/unregistered`.

`page/meta-missing-label` is distinct from `page/missing-meta` — don't conflate the two.
`page/missing-meta` (error) fires when a page has **no `pageMeta` export at all**;
`page/meta-missing-label` (warning) fires when `pageMeta` **exists but has no `label` field**. A
page can trip one, the other, or neither, never both at once.

`flowStory/invalid-page`'s message spells out the expectation directly: `step[<i>]'s pageId '<id>'
is not a real page in this workspace. Expected the 'chapter-page' composite id form (see
makePageId).` — i.e. this check is exactly what catches a flowStory step written with a bare
instead of composite pageId.

---

# Full flag reference (verified against source, not paraphrased)

| Command            | Required flags                                     | Optional flags                                              |
| ------------------ | -------------------------------------------------- | ----------------------------------------------------------- |
| `create:chapter`   | `--name:`                                          | `--workspace:`                                              |
| `remove:chapter`   | `--name:`                                          | `--workspace:`, `--force` (if pages exist)                  |
| `list:chapters`    | —                                                  | `--workspace:`                                              |
| `create:page`      | `--chapter:`, `--name:`                            | `--label:`, `--workspace:`                                  |
| `remove:page`      | `--chapter:`, `--name:`                            | `--workspace:`                                              |
| `rename:page`      | `--chapter:`, `--name:` (old id), `--to:` (new id) | `--workspace:`                                              |
| `move:page`        | `--name:`, `--from-chapter:`, `--to-chapter:`      | `--workspace:`                                              |
| `list:pages`       | —                                                  | `--chapter:`, `--hidden`, `--gone`, `--all`, `--workspace:` |
| `page:info`        | `--chapter:`, `--name:`                            | `--workspace:`                                              |
| `create:flowStory` | `--name:`                                          | `--workspace:`                                              |
| `remove:flowStory` | `--name:`, `--force`                               | `--workspace:`                                              |
| `flowStory:ls`     | —                                                  | `--project:`, `--workspace:`                                |
| `project:ls`       | —                                                  | `--workspace:`                                              |
| `add:step`         | `--flowStory:`, `--page:`                          | `--on:`, `--action:`, `--position:`, `--workspace:`         |
| `remove:step`      | `--flowStory:`, `--index:`                         | `--workspace:`                                              |
| `list:steps`       | `--flowStory:`                                     | `--workspace:`                                              |
| `flowStory:info`   | `--name:`                                          | `--workspace:`                                              |
| `create:component` | `--name:`, `--path:`                               | `--desc:`, `--workspace:`                                   |
| `remove:component` | `--name:`                                          | `--path:` (fallback if unregistered), `--workspace:`        |
| `components:find`  | `--name:`                                          | `--workspace:`                                              |
| `components:ls`    | —                                                  | `--path:`, `--workspace:`                                   |
| `components:scan`  | —                                                  | `--workspace:`                                              |
| `add:export`       | `--barrel:`, `--name:`                             | `--workspace:`                                              |
| `list:exports`     | `--barrel:`                                        | `--workspace:`                                              |
| `promote:chapter`  | `--flowStory:` (path), `--fork:`                   | `--as:`, `--workspace:`                                     |

Flag syntax is `--name:value` or `--name:"quoted value"` (`scripts/helpers/args.js#parseStringFlag`
strips only leading/trailing quote characters, not internal escapes).

`--gone` on `list:pages` is the only way to see `__`-prefixed non-existent items — every other
listing mode (default, `--hidden`, `--all`) walks the registered `workspace.ts` config, but
non-existent items are by definition never registered there, so `--gone` walks the filesystem
directly instead.

`check:<domain>:<workspace>` is a real colon-chained form (e.g. `check:pages:my-workspace`),
distinct from `--workspace:<name>` — the bare `check` (all domains) form has no domain segment to
piggyback a workspace onto, so it takes `--workspace:` instead.

---

# Type shapes (verbatim from `src/types/index.ts`)

```ts
interface FlowStoryDef {
  id: string
  name: string
  description?: string
  tags?: string[]
  db?: Record<string, unknown> | string // inline baseline OR "db/<preset>.ts" ref (preset loading Phase-1-stubbed)
  simulator?: { controls: SimulatorControl[] }
  homeScreen?: string // device home-button target during this plan's playback — NOT renamed to homePage
  steps: FlowStoryStepEntry[] // FlowStep | FlowStoryRef
}

interface FlowStep {
  pageId: string // composite `chapter-page` form, not a bare page id
  on?: string // element id whose tap advances; omit = tap-anywhere
  db?: DotPathPatch
  actionNote?: string // playback overlay caption
  decisionNote?: string // step-list narrative
  annotation?: string // canvas sticky note
  simulator?: StepSimulatorOverride
  forks?: Fork[]
}

interface Fork {
  label: string
  db?: DotPathPatch
  steps: FlowStep[]
  mergesTo?: 'next' // omit = terminal branch
}

interface FlowStoryRef {
  ref: string
}

interface PageProps<TState = Record<string, unknown>, TDb = Record<string, unknown>> {
  onAction?: (actionName: string, payload?: unknown) => void
  onNext?: () => void
  onBack?: () => void
  isChapter?: boolean
  state?: TState // NOT flowState — that field name is specific to PageProps
  db?: TDb
}
```

All fields on `PageProps` are `undefined` when the page is previewed standalone — check
`isChapter` to branch, don't assume `onNext` exists.

Note: `InteractionCtx` (the context passed to interaction `do` functions and conditional `goTo`
resolvers) is a **separate** type from `PageProps` and still uses the field name `flowState` — it's
internal FlowMaster/FlowEngine plumbing, distinct from the author-facing `PageProps.state`/
`AppNav.state` fields. Don't conflate the two when reading either type's fields.

`WorkspaceHierarchyNode.kind` is `'project' | 'chapter' | 'page'` — the old `'module'` value was
dropped entirely (not renamed), confirmed no code anywhere still constructs or checks for
`kind: 'module'`.

---

# Page identity internals (`src/shared/utils/pagePathIdentity.js`)

The one shared, dependency-free module (no React, no Vite APIs) that both the browser bundle
(`useWorkspaceHierarchy.ts`) and Node-side CLI/build tooling (`vite-plugin.js`, `scripts/checks/*`)
import directly for identity parsing — never reimplemented per-caller.

- `isNonExistent(segment)` — starts with `__`.
- `isHidden(segment)` — starts with `_` but not `__`.
- `resolveVisibility(segments)` — parent-dominance: any `__` anywhere → `'non-existent'`; else any
  `_` anywhere → `'hidden'`; else `'normal'`.
- `parseVariant(stem)` — accepts both `.variant-<serial>` and shorthand `.v-<serial>`, greedy
  serial capture (a serial itself containing hyphens, e.g. `red-theme`, parses correctly). See
  "Page variants" under the Page section above for what actually consumes this (repo mode only,
  broken in flat/multi-workspace mode, no CLI support) — don't treat this as a finished feature.
- `parsePageSegments(segments)` — core parser. Returns `null` if the file doesn't have a
  `.tsx`/`.jsx` extension. Otherwise `{ chapter, page, variant, componentName, visibility,
cosmeticSegments }`. Zero-folder case (`flowBook/File.tsx`) falls back to `chapter: 'misc'`
  (`MISC_CHAPTER_ID`), `page: <componentName>`.
- `makePageId(chapter, page)` → `${chapter}-${page}`.
- `pickPageFile(candidateFilenames)` → `{ chosen: alphabetically-first, ambiguous: boolean }`.

---

# Path resolution (`scripts/helpers/paths.js`)

```js
isRepoMode() // fs.existsSync(<ROOT>/.flowkit-repo-root)
resolveDefineImport(exportName) // repo: '@flowkit-core/config', flat/multi: 'flowkit'
resolveTypeImport(typeName) // repo: '@flowkit/types', flat/multi: 'flowkit'
```
