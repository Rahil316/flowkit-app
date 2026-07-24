# INDEX — test

The map. Find your task, go straight to the action — no blind search.
Read order for a cold start: **rules.md → this INDEX → platform.md** (depth only when a row points there).

| Task | Action | Detail |
|---|---|---|
| Understand the platform fast | read `.agent/rules.md` then this INDEX | docs/FLOWKIT.md |
| Add a chapter + pages | create folder `flowBook/<C>/<Page>/` + `<Page>.tsx` | platform.md → CLI |
| Add a page to an existing chapter | create `flowBook/<C>/<P>/<P>.tsx` | platform.md → CLI |
| Wire a tap / interaction | give the element an `id`, add a matching step (`{ pageId, on }`) in `flowStories/<c>.ts` | platform.md → Chapters · docs/FLOWMASTER.md |
| Navigate programmatically | `useNav()` | platform.md → Navigation |
| Read or change data | `useDb()` → `get`/`has`/`set`/`remove`/`update`/`reset` | platform.md → Data |
| Gate a page (access guard) | `canEnter` / `canNotEnter` in `pageMeta` (exported from the page `.tsx`) | platform.md → Guards |
| Reorder chapters | edit `workspace.ts` → `chapters[]`, or use **Manage tab** in right panel | platform.md → Chapters |
| Style with the active kit | Tailwind + tokens.css / `useTheme()` | platform.md → Styling & kit |
| Add a reviewer toggle | edit `data/simulator.tsx` | platform.md → Simulator |
| Record / replay sessions | always-on recorder; `flowkit sessions:*` | docs/FLOWLENS.md |
| Full CLI reference | `flowkit help` | docs/CLI.md |
| What this product IS | read `.agent/project.md` | project.md (hand-owned) |

Detail lives in `.agent/platform.md` and `/Documentation/*.md`. Product specifics live in `.agent/project.md`.

_Generated (spec v5) — `flowkit agent:sync` to refresh._
