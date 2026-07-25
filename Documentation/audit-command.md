# flowkit audit — Feature Plan

Status: planning, not built. Written 2026-07-25. Supersedes nothing; net-new command family.

## Origin

`manifest.ts` and its `pageOrder`/`chapters` structures have no reconciliation
against disk — only CLI-mediated incremental patches (`config-patch.js`'s
`addPage`/`removePage`/etc.). Manual filesystem edits (hand-deleted folders,
merge conflicts, copy-pasted page dirs) silently desync the ledger from
reality. Today the only signal is `check:config`'s non-blocking
`orphaned-id`/`orphaned-dir` warnings, which nothing acts on automatically.
See `.claude/skills/flowkit-author/SKILL.md` and CLAUDE.md's Known Gotchas
("Bare vs. composite page ids") for the current, narrower behavior this plan
extends.

## Decided

- **Rename**: `manifest.ts` → **`manifest.ts`**. Same shape, same
  `defineConfig()` call, same file type (real `.ts`). Pure rename — every
  reader/writer of the literal filename needs updating in lockstep:
  - `scripts/authoring-support/config-patch.js` (`readConfig`/`writeConfig`)
  - `scripts/helpers/vite-plugin.js`'s `genConfig()` (esbuild bundle target)
  - repo-mode's native import path (wherever `manifest.ts` is imported
    directly, e.g. `useWorkspaceHierarchy.ts` or its callers)
  - `scripts/helpers/flowkit-manifest.js` if it references the filename
  - both scaffolder templates (`packages/create-flowkit-app/index.js`,
    `packages/create-flowkit-mono/index.js`)
  - `scripts/helpers/workspace-template.js` / `scripts/demoBooks/game-demo-scaffold.js`
  - docs: `docs/CLI.md`, `docs/FLOWKIT.md`, `docs/AGENTS.md`, this repo's
    `CLAUDE.md`
  - `scripts/checks/config.js` and any other check script that reads it by name
  - Needs a full `grep -rn "workspace\.ts"` sweep before starting — a
    half-renamed reference is exactly the silent-drift failure mode this
    whole effort exists to eliminate elsewhere. Do not hand-enumerate from
    memory; grep fresh at build time.

- **Command**: `flowkit audit` replaces/absorbs today's `check`/`check:<domain>`
  family. Domains: `page`, `chapter`, `book`, `story`, `navigations`,
  `sessions`.
  - `story/fork-invalid-page` — **built** (2026-07-25, `scripts/audits/story.js`).
    Previously a documented gap: `story/invalid-page` only validated top-level
    `steps[].pageId`, never walking into `step.forks[].steps[]`. Now a separate
    rule (`checkForkSteps`) recurses into forks at any nesting depth (forks can
    contain forks), emitting `story/fork-invalid-page` (severity: error) for any
    fork-nested step whose pageId isn't a real page, with the enclosing fork
    label chain in the message for actionability. `story/weak-step` was
    deliberately NOT extended into forks (see comment in `story.js`).
  - Bare `flowkit audit` — runs all domains, one combined report grouped by
    category.
  - `flowkit audit:<domain>` — same report, scoped to one domain.
  - **Default action (no flag) is report-only.** Flags issues, categorized,
    proper format (see Report Format below). Never mutates anything.
  - `check:flowStories`'s current role as the `prebuild` gate
    (`package.json`) must move to `audit:story` (or bare `audit`) as part of
    the rename — easy to miss since it's wired in `package.json`, not the
    CLI dispatcher.

- **`fix` action** — `flowkit audit:<domain> fix`
  - Only defined for issue categories that have a real, unambiguous
    automated resolution. **If no safe auto-fix exists for a category, `fix`
    reports that explicitly ("no auto-fix available for X — see `rebuild
--confirm` or hand-edit") rather than guessing or silently skipping.**
  - Confirmed-safe fix today: drop ghost `pageOrder`/ledger entries
    (ledger says exists, disk doesn't); append orphaned disk pages
    (disk has it, ledger doesn't) to the end of their chapter's list.
  - Reposition — **built** (2026-07-26, `scripts/audits/fix.js`'s `runFixMove`).
    `flowkit audit:chapter --fix --move:<pageId> --to:<index>` — an explicit,
    opt-in mode of `--fix` (not a new top-level flag, per the original framing
    "fix can also reposition on request"). `--move` requires `--fix`; plain
    `--fix` with no `--move` never repositions anything, only the existing
    ghost-drop/orphan-append flow. Validates the named page actually exists in
    `pageOrder` (errors clearly, doesn't silently no-op) and clamps
    out-of-range `--to:` values to append rather than erroring. Touches exactly
    one page's position; every other entry's relative order is unchanged.

- **`rebuild` action** — `flowkit audit:<domain> rebuild`
  - Full regenerate-from-disk. Destructive to authored order by nature.
  - Refuses to run bare. Requires an explicit `--confirm` (or `--force`)
    flag. Without it, prints what it _would_ discard and exits non-zero.

## Open questions (blocking, need answers before scoping build work)

1. **`fix --reposition` interface.** What's the actual CLI surface for
   "move this entry to a specific position"? Candidates: a flag pair like
   `--move <id> --to <index>`, an interactive prompt, or a separate explicit
   subcommand (`audit:page reorder`) instead of folding it into `fix`. Needs
   a decision before `fix` can be implemented at all, since "fix" today only
   has a defined meaning for existence-class issues, not position-class ones.

2. **`navigations` domain — built** (2026-07-25/26, `scripts/audits/navigations.js` +
   `scripts/audits/lib/{ast-walk,nav-bindings,reachability}.js`). Four rules,
   not three — a fourth was added once the graph infra existed:
   - `navigations/unguarded-dashboard-navigate` (warning) — direct
     `useDashboard().navigateTo()` calls with no `isChapter` guard. Does NOT
     apply to `useAppNav().navigateTo()`, which self-guards via `FlowNavCtx`
     and never needs one. v1 only detects direct-wrap guards (`&&`, both
     ternary polarities); `if (!isChapter) return` early-return is an
     acknowledged, deliberately unhandled gap (documented + tested).
   - `navigations/invalid-target` (error) — literal `navigateTo('...')`
     targets that don't resolve to a real page. Non-literal arguments
     (`navigateTo(game.pageId)`) are never flagged — tracked as a disclosed
     `dynamicNavCallSites` count on the report instead.
   - `navigations/unreachable-page` (warning) — zero inbound edges from
     anywhere (a true-island check). `pageOrder` membership alone is
     explicitly not an edge.
   - `navigations/unreachable-from-start` (warning) — the stronger check: not
     reachable via any path starting at the resolved `startPage`, via a real
     directed-adjacency-graph BFS (catches a page with a nonzero in-degree
     whose only linker is itself unreachable — rule 3 can't see this). Skips
     any page already flagged by rule 3 (same underlying problem, one rule
     id). Doesn't run at all if `startPage` doesn't resolve, rather than
     flagging every page in the workspace. Caught a real, live bug in the
     shipped demo content on first run: ~45 `navigateTo()` calls used bare
     page ids instead of the required composite `chapter-page` form — fixed
     at the source (`scripts/demoBooks/game-demo-scaffold.js`) and propagated
     to both `workspaces/test`/`workspaces/game-zone`.

3. **`sessions` domain — structurally different, needs its own scoping
   pass.** Sessions are IndexedDB-backed recorded data (`WriteBatcher`, see
   CLAUDE.md's Architecture Patterns), not filesystem-plus-ledger content
   like the other four domains. "Rebuild" has no obvious meaning here
   (rebuild from what source?). Likely only supports a narrower
   "detect corrupt/orphaned session records" report, no `fix`/`rebuild`
   parity with the other domains. Do not assume parity — confirm scope
   before building.

4. **Rename-vs-delete+add ambiguity**, surfaced independently in both the
   stable-id discussion and the `audit:page fix` discussion: when a page is
   both missing from disk under its old ledger entry AND a new,
   unregistered page appears with different content, is that one rename or
   two unrelated changes? No automated fix should ever guess here — this is
   exactly the class of issue `fix` should decline to touch and surface as
   report-only ("possible rename, not auto-fixed") rather than attempt
   content-similarity heuristics.

## Explicitly parked — do not build yet

These came up during design and are real, but depend on capabilities that
don't exist today. Circle back only if/when the underlying capability is
built.

- **Stable ids for chapters/pages that survive rename**, independent of the
  file path. Considered and deliberately narrowed down to _not_ building a
  path-independent id system right now — see reasoning trail in this same
  planning conversation (2026-07-25): a stable id needs a persistence
  mechanism (frontmatter/sidecar/ledger field), and adopting one _inside_
  `manifest.ts`'s ledger only (not exposed to FlowStory references) was the
  agreed minimal version. Making FlowStories reference a stable id instead
  of the current composite `chapter-page` string was explicitly rejected as
  a breaking change to every existing `.ts` FlowStory file, the compiler,
  and every check script — parked, not scheduled.
- **`bookOrders` restructuring** (`{chapterID: {index, pages: {pageName:
{index, pageID}}}}`) — the explicit-index-over-array-position idea is
  sound (safer for programmatic edits, cleaner diffs) but was folded into
  "rename only, no shape change" for this pass per direct instruction
  ("Forget it. just rename manifest.ts..."). Revisit if/when `manifest.ts`
  needs a real shape change for another reason — don't reopen solely for
  this.
- **Any auto-fix for the rename-vs-delete+add ambiguity** (open question 4
  above) — would need either a content-similarity heuristic or an
  interactive human-confirmation step, neither of which exist in any
  authoring command today. Not scoped until one of those primitives exists.

## Report Format (sketch, needs real design pass)

Not yet designed in detail. Should follow the same category/severity shape
already established informally across `check:pages`/`check:flowStories`
(warning-only today, no severity tiers) — but audit's combined multi-domain
report needs an actual spec: how domains are grouped visually, what `--json`
output looks like (existing `check:<domain> --json` flag should carry over
per CLAUDE.md's Critical Commands table), and whether severity tiers
(error/warning) get introduced where today everything is a flat warning.
