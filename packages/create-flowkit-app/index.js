#!/usr/bin/env node
import fs from 'fs'
import path from 'path'
import readline from 'readline'
import { execSync } from 'child_process'
import { fileURLToPath, pathToFileURL } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// Kept as a local literal, not imported from scripts/helpers/config-filenames.js
// — this package must stay independently publishable with zero runtime deps on
// the monorepo (see the standalone-prompt-helpers comment below). If flowkit's
// own WORKSPACE_CONFIG_FILENAME ever changes again, update this too.
const WORKSPACE_CONFIG_FILENAME = 'workspace.ts'
// Same rationale as WORKSPACE_CONFIG_FILENAME above — mirrors
// scripts/helpers/config-filenames.js's FLOW_BOOK_DIRNAME/FLOW_STORIES_DIRNAME.
// Update these if those ever change.
const FLOW_BOOK_DIRNAME = 'flowBook'
const FLOW_STORIES_DIRNAME = 'flowStories'

const RESET = '\x1b[0m'
const BOLD = '\x1b[1m'
const GREEN = '\x1b[32m'
const CYAN = '\x1b[36m'
const DIM = '\x1b[2m'
const RED = '\x1b[31m'

const g = s => GREEN + s + RESET
const b = s => BOLD + s + RESET
const c = s => CYAN + s + RESET
const d = s => DIM + s + RESET
const r = s => RED + s + RESET

// ── Minimal self-contained prompt helpers ───────────────────────────────────────
// Deliberately not imported from the platform's scripts/lib/prompt.js — this
// package is meant to be installable/publishable on its own, with no
// dependency on the rest of the monorepo at runtime.

function prompt(rl, question) {
  return new Promise(resolve => rl.question(question, resolve))
}

function selectFromList(items) {
  if (!process.stdin.isTTY) {
    return new Promise(resolve => {
      items.forEach((item, i) => console.log(`  ${d(String(i + 1) + '.')} ${item}`))
      const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
      rl.question(c('? ') + `Select (1-${items.length}): `, ans => {
        rl.close()
        const n = parseInt(ans.trim(), 10) - 1
        resolve(items[Math.max(0, Math.min(isNaN(n) ? 0 : n, items.length - 1))])
      })
    })
  }

  return new Promise(resolve => {
    let idx = 0
    const render = () => {
      process.stdout.write('\x1b[?25l')
      items.forEach((item, i) => {
        const prefix = i === idx ? c('  ❯ ') : '    '
        const text = i === idx ? b(item) : d(item)
        process.stdout.write(`\r${prefix}${text}\n`)
      })
      process.stdout.write(`\x1b[${items.length}A`)
    }
    render()
    process.stdin.setRawMode(true)
    process.stdin.resume()
    process.stdin.setEncoding('utf8')
    const onData = key => {
      if (key === '\x1b[A') {
        idx = (idx - 1 + items.length) % items.length
        render()
      } else if (key === '\x1b[B') {
        idx = (idx + 1) % items.length
        render()
      } else if (key === '\r' || key === '\n') {
        process.stdin.setRawMode(false)
        process.stdin.pause()
        process.stdin.removeListener('data', onData)
        process.stdout.write(`\x1b[${items.length}B`)
        process.stdout.write('\x1b[?25h')
        resolve(items[idx])
      } else if (key === '\x03') {
        process.stdout.write('\x1b[?25h')
        process.exit()
      }
    }
    process.stdin.on('data', onData)
  })
}

function parseStringFlag(argv, name) {
  const hit = argv.find(a => a.startsWith(`--${name}:`))
  return hit ? hit.slice(name.length + 3) : null
}

function usage() {
  console.log(`
  ${b('create-flowkit-app')} — scaffold a new FlowKit author project

  ${b('Usage:')}
    npm create flowkit-app@latest ${c('<project-name>')} ${d('[--lang:ts|js]')}
    npx create-flowkit-app ${c('<project-name>')}

  ${b('Example:')}
    npm create flowkit-app@latest my-prototype
    npm create flowkit-app@latest my-prototype -- --lang:js

  ${d('flowkit contributors: --local-dev points the generated project at your')}
  ${d('local flowkit checkout instead of the published package. Only works when')}
  ${d('run from inside that checkout — see packages/create-flowkit-app/index.js.')}
`)
  process.exit(0)
}

const args = process.argv.slice(2).filter(a => a !== '--')
const projectName = args[0]

if (!projectName || projectName === '--help' || projectName === '-h') {
  usage()
}

if (!/^[a-z0-9][a-z0-9._-]*$/.test(projectName)) {
  console.error(r(`✗ Invalid project name: "${projectName}"`))
  console.error(d('  Use lowercase letters, numbers, hyphens, dots, or underscores.'))
  process.exit(1)
}

const targetDir = path.resolve(process.cwd(), projectName)

if (fs.existsSync(targetDir)) {
  console.error(r(`✗ Directory already exists: ${targetDir}`))
  process.exit(1)
}

// The published range for the `flowkit` dependency. Bump this alongside
// flowkit's own package.json "version" when cutting a release — there's no
// automatic way to read that from here once this package is actually
// installed from the registry (it won't have flowkit's monorepo as a sibling
// directory anymore).
const FLOWKIT_PUBLISHED_RANGE = '0.0.1-beta.0'

// ── Local-testing escape hatch ───────────────────────────────────────────────
// Pass --local-dev (or set FLOWKIT_LOCAL_DEV=1) to point the generated
// project's flowkit dependency at a local monorepo checkout instead of the
// published range above — for testing this scaffolder against unreleased
// platform changes before a real publish.
//
// Guarded by checking for flowkit's repo-root marker file two directories up:
// the flag/env var alone isn't enough, so a stray env var in someone's shell
// can't accidentally point a real user's scaffold at an unrelated local path
// — it only activates when this script is genuinely running from inside a
// flowkit monorepo checkout (see scripts/lib/paths.js's isRepoMode(), which
// uses the same marker file for the same reason).
const WANTS_LOCAL_DEV = args.includes('--local-dev') || process.env.FLOWKIT_LOCAL_DEV === '1'

function resolveFlowkitDependency() {
  if (!WANTS_LOCAL_DEV) return FLOWKIT_PUBLISHED_RANGE

  const monorepoRoot = path.resolve(__dirname, '..', '..')
  const markerPath = path.join(monorepoRoot, '.flowkit-repo-root')
  if (!fs.existsSync(markerPath)) {
    console.error(
      r('✗ --local-dev requires this script to run from inside a flowkit monorepo checkout.')
    )
    console.error(d(`  Expected a repo-root marker at: ${markerPath}`))
    process.exit(1)
  }
  console.log(d(`  --local-dev: flowkit dependency points at local checkout (${monorepoRoot})`))
  return `file:${monorepoRoot}`
}

const FLOWKIT_DEP = resolveFlowkitDependency()

// ── Preferences — language, same flow as `flowkit nw` ──────────────────────────

async function resolveLanguage() {
  const flag = parseStringFlag(args, 'lang')
  if (flag) {
    const clean = flag.toLowerCase().trim()
    if (clean === 'ts' || clean === 'js') return clean
    console.error(r(`✗ Invalid lang: ${flag}. Supported: ts, js.`))
    process.exit(1)
  }
  console.log(c('? ') + 'Language (↑↓ Enter):')
  const selection = await selectFromList([
    'TypeScript — .tsx / .ts  (recommended)',
    'JavaScript — .jsx / .js',
  ])
  console.log('\n')
  return selection.startsWith('JavaScript') ? 'js' : 'ts'
}

// ── Copy templates ─────────────────────────────────────────────────────────────

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true })
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name)
    const destPath = path.join(dest, entry.name)
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath)
    } else {
      fs.copyFileSync(srcPath, destPath)
    }
  }
}

// ── Write generated files ──────────────────────────────────────────────────────

function writePackageJson(dir, name, language) {
  const isJs = language === 'js'
  const pkg = {
    name,
    version: '0.0.1',
    private: true,
    type: 'module',
    scripts: {
      dev: 'vite',
      build: 'vite build',
      preview: 'vite preview',
    },
    dependencies: {
      react: '^19.0.0',
      'react-dom': '^19.0.0',
    },
    devDependencies: {
      flowkit: FLOWKIT_DEP,
      vite: '^8.0.0',
      '@vitejs/plugin-react': '^6.0.0',
      tailwindcss: '^4.0.0',
      '@tailwindcss/postcss': '^4.0.0',
      ...(isJs
        ? {}
        : {
            typescript: '~6.0.0',
            '@types/react': '^19.0.0',
            '@types/react-dom': '^19.0.0',
          }),
    },
  }
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify(pkg, null, 2) + '\n')
}

function writeViteConfig(dir) {
  fs.writeFileSync(
    path.join(dir, 'vite.config.ts'),
    `import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { flowkit } from 'flowkit/vite'

export default defineConfig({
  plugins: [react(), flowkit()],
  build: {
    rollupOptions: {
      onwarn(warning, defaultHandler) {
        // Screens are both statically listed (for eager type-checking) and
        // dynamically imported (for code-splitting) by the virtual:flowkit/pages
        // module flowkit/vite generates — harmless by design, not a real issue.
        if (warning.code === 'INEFFECTIVE_DYNAMIC_IMPORT') return
        defaultHandler(warning)
      },
    },
  },
})
`
  )
}

function writeTsConfig(dir) {
  fs.writeFileSync(
    path.join(dir, 'tsconfig.json'),
    JSON.stringify(
      {
        compilerOptions: {
          target: 'ES2022',
          lib: ['ES2022', 'DOM', 'DOM.Iterable'],
          module: 'ESNext',
          moduleResolution: 'bundler',
          jsx: 'react-jsx',
          strict: true,
          noUnusedLocals: true,
          noUnusedParameters: true,
          noFallthroughCasesInSwitch: true,
          skipLibCheck: true,
          noEmit: true,
        },
        include: [
          FLOW_BOOK_DIRNAME,
          FLOW_STORIES_DIRNAME,
          'lib',
          WORKSPACE_CONFIG_FILENAME,
          'vite.config.ts',
        ],
      },
      null,
      2
    ) + '\n'
  )
}

// writeWorkspaceContent (config/flowStories/pages/db/tokens) lives in
// ./lib/workspace-template.js, shared with create-flowkit-workspace. That
// module in turn hand-ports scripts/helpers/scaffold.js's demo content — see
// its top comment. Cannot import scaffold.js directly: both scaffolder
// packages must stay standalone-publishable with zero runtime deps on the
// monorepo (see the standalone-prompt-helpers comment above and this
// package's package.json).

function writeAgentsMd(dir) {
  fs.writeFileSync(
    path.join(dir, 'AGENTS.md'),
    `# ${projectName}

A [FlowKit](https://github.com/rahil-avj/flowkit-app) author project — this repo is
**content only** (pages, flowStories, mock data). The platform engine lives in
\`node_modules/flowkit/\` and is not yours to edit. FlowKit exists to let you build and
demo realistic multi-page product flows — with working navigation, mock data, and a
reviewer-facing simulator — without standing up a backend or a router by hand.

This file is intentionally short. It tells you where to look and the rules that don't
show up from reading the code. For anything deeper, \`docs/\` in this project ships the
full reference — see the table below.

## Where to look

| Need                                          | Go to                |
| ---------------------------------------------- | -------------------- |
| Full CLI command reference (every flag)        | \`docs/CLI.md\`        |
| Platform architecture, mock DB, kits, theming  | \`docs/FLOWKIT.md\`    |
| Flow engine / playback / flowStory anatomy      | \`docs/FLOWMASTER.md\` |
| Recorded sessions & analytics (FlowLens)       | \`docs/FLOWLENS.md\`   |
| Agent workflow recipes (this file, expanded)   | \`docs/AGENTS.md\`     |

Read the relevant doc **before** attempting a task you haven't done in this project yet
(adding a fork, wiring a simulator control, converting workspace modes, etc.) rather than
guessing from adjacent code.

## Project layout

- \`${FLOW_BOOK_DIRNAME}/<flow>/<page-id>/<PageName>.tsx\` — one component per page, default-exports
  the page and a named \`pageMeta\` (\`{ id, label, desc? }\`, optional
  \`canEnter\`/\`canNotEnter\`: \`({ db }) => boolean\`). Receives \`PageProps\` from
  \`'flowkit'\` — \`onAction?\`, \`onNext?\`, \`onBack?\`, \`isChapter?\`, \`flowState?\`, and a
  **read-only** \`db?\`. **All of these are \`undefined\` when the page is previewed
  standalone** (outside an active flow) — always optional-chain (\`db?.user?.name\`), never
  assume they're present.
- \`${FLOW_STORIES_DIRNAME}/<flow>.ts\` — playback scripts authored with \`defineFlow()\` from \`'flowkit'\`:
  an ordered \`steps[]\` of \`{ pageId, on?, actionNote? }\` (\`on\` matches a DOM element id
  in the page, wired via event delegation — no \`onClick\` needed on that element), or a
  richer \`interactions\` map keyed by element id (\`{ trigger, goTo, do?, animation?, delay? }\`).
  Conditional forks (\`forks[]\`) and db mutation both live here, not in the page component
  — see \`docs/CLI.md\` for the full shape.
- \`lib/data/db.ts\` — the mock database: plain named exports, the initial state only. A
  page never mutates it directly — mutation happens via \`ctx.updateDb(db => { ... })\`
  inside a flowStory's \`interactions[id].do\`, never as a module-level singleton edit.
- \`lib/design-system/tokens.css\` — CSS custom properties for theming. Starts **empty** (no
  UI kit pre-installed) even though scaffolded demo pages already reference \`theme-*\`
  Tailwind classes — this is expected pre-kit state, not a bug. Resolve it in your first
  session (see below), not by inventing token values ad hoc.
- \`${WORKSPACE_CONFIG_FILENAME}\` — the manifest (\`defineConfig()\` from \`'flowkit'\`): flow/page
  ordering, \`startPage\`, \`defaultDevice\`/\`defaultOrientation\`. Check this first when a flow
  or page seems "missing" from the UI — it's usually an ordering/registration issue here,
  not a bug in the page itself.

The Vite plugin (\`flowkit/vite\`) generates virtual modules
(\`virtual:flowkit/config|pages|flowStories|workspace\`) from \`${WORKSPACE_CONFIG_FILENAME}\` plus
filesystem globs over \`${FLOW_BOOK_DIRNAME}/\`/\`${FLOW_STORIES_DIRNAME}/\` — this is what makes pages discoverable
without a hand-written router. \`INEFFECTIVE_DYNAMIC_IMPORT\` build warnings are expected and
suppressed deliberately in \`vite.config.ts\` (pages are both statically listed for
type-checking and dynamically imported for code-splitting).

## Workspaces

This project is in **flat mode** — the project root is the one implicit workspace, no
\`workspaces/\` folder. If you need more than one independent workspace (separate
flows/pages/lib per app or client), convert to multi-workspace mode:

- \`npx flowkit convert:multi\` — split this project into multiple sibling workspace folders
- After converting: \`npx flowkit create:workspace <name>\` / \`remove:workspace <name>\` /
  \`rename:workspace <old> <new>\` manage workspaces; \`npx flowkit convert:flat\` collapses back

## CLI commands

All CLI operations go through \`flowkit <command>\`. Invoke it as \`npx flowkit <command>\`
unless you've confirmed (\`which flowkit\`) it was installed globally during setup — don't
assume a bare \`flowkit\` resolves. Run \`npx flowkit -h\` (or \`npx flowkit help\`) first — it's
the live, always-current command list for this project's exact mode. \`docs/CLI.md\` has the
fuller written reference.

\`\`\`
npx flowkit status                              # flow/page/flowStory/session health snapshot
npx flowkit check                               # validate all authored content, exits 1 on error
npx flowkit create:page --chapter:<id> --name:<page-id>
npx flowkit add:step --flowStory:<id> --page:<page-id> [--on:<element-id>]
npx flowkit sessions:ls                         # list recorded sessions
npx flowkit export                              # build standalone HTML viewer → dist/
\`\`\`

Two CLI behaviors worth knowing before you rely on them:
- \`add:step\` rewrites a flowStory's \`steps: [...]\` via a non-greedy regex — re-check the
  file by hand after running it on a flowStory whose steps include \`forks[].steps[...]\`.
- \`remove:step\` silently removes index 0 if \`--index\` is omitted — no error, no prompt.
  Always pass \`--index\` explicitly.

## Rules

Grammar: **NEVER** \`x\` = a hard stop, doing \`x\` breaks the platform. **ALWAYS** \`y\` = the
default behavior, no exceptions. **TO** \`<task>\` **→** \`<action>\` = the one right way to do
a common task — check here before improvising.

- **NEVER** edit \`node_modules/flowkit/\` — that's the platform engine, not workspace content.
- **NEVER** mutate \`db\` from inside a page component — there is no mutate function on
  \`PageProps\`; \`db\` there is read-only. Mutation only happens via \`ctx.updateDb()\`
  inside a flowStory's \`interactions[id].do\`.
- **NEVER** hand-write a new flow/page file from scratch — copy an existing page's
  boilerplate (or use \`flowkit create:page\`) so exports stay consistent with what the
  Vite plugin expects.
- **NEVER** hardcode hex colors — use \`lib/design-system/tokens.css\` vars.
- **NEVER** assume a bare \`flowkit\` binary resolves — prefer \`npx flowkit\` unless you've
  confirmed (\`which flowkit\`) a global link.
- **ALWAYS** optional-chain \`db\`/\`onAction\`/\`onNext\`/\`onBack\`/\`flowState\` in a page —
  every one of them is \`undefined\` when that page is previewed standalone, not just
  during flow playback.
- **ALWAYS** use Tailwind utility classes for static styling; reach for \`style={{}}\` only
  for runtime-computed values.
- **ALWAYS** route structural changes (new page, new flowStory step, workspace conversion)
  through the \`flowkit\` CLI rather than hand-editing generated wiring.
- **TO** add a page **→** \`flowkit create:page --chapter:<id> --name:<page-id>\`, then
  \`flowkit add:step --flowStory:<id> --page:<page-id>\` to wire it into playback.
- **TO** wire a tap interaction **→** give the element a plain DOM \`id\` and add a matching
  \`{ pageId, on: '<id>' }\` step in the flowStory (no \`onClick\` needed) — or, for
  conditional/db-mutating logic, add an \`interactions['<id>']\` entry with \`goTo\`/\`do\` in
  the flowStory instead.
- **TO** navigate imperatively from inside a page (async/state-driven, not a tap) **→**
  call the injected \`onAction?.('name')\` / \`onNext?.()\` / \`onBack?.()\` — these only fire
  during flow playback (\`isChapter\` is true); they're safely no-ops (undefined) otherwise.
- **TO** gate access to a page **→** export \`canEnter\`/\`canNotEnter\` on \`pageMeta\`:
  \`({ db }) => boolean\`.
- **TO** add a reviewer-facing toggle **→** add a \`SimulatorControl\` object
  (\`{ label, path, type, ... }\`) to the flowStory's \`simulator.controls\` array — this is
  plain data, not a JSX component.
- **TO** check workspace health **→** \`npx flowkit status\` / \`npx flowkit check\`.
- **TO** find anything not listed here **→** \`npx flowkit -h\`, then \`docs/CLI.md\`.

## First session

If this is the first time you're opening this project, run a short interview before
writing any code. Keep it conversational, one or two questions at a time, not a form dump:

1. **Name.** Ask what to call them, and use it for the rest of the session.
2. **Experience level.** Developer, a designer who codes a little, or non-technical
   (founder/PM testing an idea)? This sets how much you explain vs. just do.
3. **What they're building.** A quick prototype for a pitch/demo, a client deliverable,
   a personal project, something else? Shapes speed vs. polish.
4. **Working style.** Check in before changes, or move fast and explain after the fact?
   Set your autonomy level for the session from the answer — don't re-ask later.
5. **Look and feel.** No component kit is pre-installed — ask in plain language what
   they're going for ("clean and minimal", "playful", "enterprise/dashboard-y", or a
   reference link/screenshot). Based on the answer, decide the approach yourself (plain
   Tailwind, shadcn/ui, another library) — don't make them pick a library by name unless
   they bring it up first.

Once you have these answers, act on them immediately — set up
\`lib/design-system/tokens.css\` and whatever component approach fits, then get to the
actual flows/pages. Don't re-run this interview later; refer back to what you learned.
`
  )
}

function writePostcssConfig(dir) {
  fs.writeFileSync(
    path.join(dir, 'postcss.config.js'),
    `export default {
  plugins: {
    '@tailwindcss/postcss': {},
  },
}
`
  )
}

function writeGitignore(dir) {
  fs.writeFileSync(
    path.join(dir, '.gitignore'),
    `node_modules/
dist/
.env.local
.flowkit-export-*.mjs
`
  )
}

function writeReadme(dir, name) {
  fs.writeFileSync(
    path.join(dir, 'README.md'),
    `# ${name}

A [FlowKit](https://github.com/rahil-avj/flowkit-app) author project.

## Getting started

\`\`\`bash
npm run dev      # start the dev server
npm run build    # production build
\`\`\`

## Project layout

- \`${FLOW_BOOK_DIRNAME}/\` — page components, organized by flow then page name
- \`${FLOW_STORIES_DIRNAME}/\` — playback scripts (sequences of pages with interaction definitions)
- \`lib/\` — shared data, components, and utilities
- \`${WORKSPACE_CONFIG_FILENAME}\` — flow and page registration

See \`docs/CLI.md\` for the full \`flowkit\` CLI command reference, and \`AGENTS.md\`
if you're working with an AI coding agent on this project.

## Running CLI commands

If you chose to install flowkit globally during setup, \`flowkit <command>\` works
bare (e.g. \`flowkit export\`). Otherwise, run it through npx: \`npx flowkit export\`.
`
  )
}

// ── Copy docs from installed flowkit ──────────────────────────────────────────

function copyDocsFromFlowkit(targetDir) {
  // After npm install, docs live in node_modules/flowkit/docs/
  const docsSource = path.join(targetDir, 'node_modules', 'flowkit', 'docs')
  const docsDest = path.join(targetDir, 'docs')
  if (fs.existsSync(docsSource)) {
    copyDir(docsSource, docsDest)
    return true
  }
  return false
}

// ── Optional global install ─────────────────────────────────────────────────
// Bare `flowkit <command>` only resolves in a shell when something puts it on
// PATH. A local devDependency alone doesn't do that (only `npm run <script>`
// or `npx flowkit` reach node_modules/.bin) — the only way to get a literal
// bare `flowkit` is a global install, which mutates state outside this
// project and is shared across every project on the machine. Never do that
// without asking; never assume yes in non-interactive/CI contexts.
async function offerGlobalInstall() {
  if (!process.stdin.isTTY) {
    console.log(d('  Skipping global install prompt (non-interactive).'))
    return false
  }
  const globalSpec = WANTS_LOCAL_DEV ? FLOWKIT_DEP : 'flowkit'
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
  const answer = await prompt(
    rl,
    c('? ') + `Install flowkit globally so you can run bare \`flowkit <command>\` here? (Y/n) `
  )
  rl.close()
  if (/^n(o)?$/i.test(answer.trim())) return false

  try {
    console.log(d(`  Installing flowkit globally (npm install -g ${globalSpec})...`))
    execSync(`npm install -g ${globalSpec}`, { stdio: 'inherit' })
    console.log(`  ${g('✓')} flowkit installed globally — \`flowkit <command>\` now works bare.`)
    return true
  } catch (err) {
    console.error(r(`  ✗ Global install failed: ${err.message}`))
    return false
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('')
  console.log(`  ${b('Creating FlowKit project:')} ${c(projectName)}`)
  console.log('')

  const language = await resolveLanguage()

  try {
    fs.mkdirSync(targetDir, { recursive: true })

    // Static, language-agnostic files
    fs.copyFileSync(
      path.join(__dirname, 'templates', 'index.html'),
      path.join(targetDir, 'index.html')
    )

    // Generated files that don't need flowkit installed yet.
    writePackageJson(targetDir, projectName, language)
    writeViteConfig(targetDir)
    if (language === 'ts') writeTsConfig(targetDir)
    writePostcssConfig(targetDir)
    writeAgentsMd(targetDir)
    writeGitignore(targetDir)
    writeReadme(targetDir, projectName)

    console.log(`  ${g('✓')} Scaffolded project files`)
    console.log(
      `  ${g('✓')} Language: ` +
        b(language === 'js' ? 'JavaScript (.jsx / .js)' : 'TypeScript (.tsx / .ts)')
    )
    // Install dependencies BEFORE writing workspace content: the demo
    // pages/flowStories/config are generated by writeWorkspaceContent(),
    // which lives in flowkit itself (scripts/helpers/workspace-template.js —
    // the one shared source of truth also used by create-flowkit-workspace
    // and this repo's own `flowkit create:workspace` command) and is only
    // resolvable from node_modules/flowkit once installed. This package
    // can't depend on the monorepo directly (see the standalone-prompt-
    // helpers comment above) — it reaches the shared template through its
    // own `flowkit` devDependency instead, same as any consumer's project
    // importing from `flowkit` at runtime.
    //
    // --install-links only matters for --local-dev's file: dependency: npm's
    // default for a `file:` spec pointing at a directory is to SYMLINK it into
    // node_modules, not copy it. Node's ESM loader resolves import.meta.url
    // through that symlink to its realpath, which erases the node_modules
    // path segment isRepoMode() would otherwise rely on — so a symlinked
    // install gets misdetected as repo mode, pointing every workspace-scoped
    // path at the real monorepo instead of this scaffolded project. Forcing a
    // real copy sidesteps the problem entirely for local testing; it's a
    // no-op for the published range (registry/git installs are already real
    // copies, never symlinks).
    console.log(`  ${d('Installing dependencies (this may take a moment)...')}`)
    execSync(`npm install${WANTS_LOCAL_DEV ? ' --install-links' : ''}`, {
      cwd: targetDir,
      stdio: 'inherit',
    })
    console.log(`  ${g('✓')} Dependencies installed`)

    const templateUrl = pathToFileURL(
      path.join(targetDir, 'node_modules', 'flowkit', 'scripts', 'helpers', 'workspace-template.js')
    ).href
    const { writeWorkspaceContent } = await import(templateUrl)
    writeWorkspaceContent(targetDir, projectName, language)
    console.log(`  ${g('✓')} Workspace content generated`)

    // Copy docs from installed flowkit
    const docsCopied = copyDocsFromFlowkit(targetDir)
    if (docsCopied) {
      console.log(`  ${g('✓')} Docs copied from flowkit`)
    }

    console.log('')
    const gotGlobal = await offerGlobalInstall()

    console.log('')
    console.log(`  ${g('✓')} Done! Get started:`)
    console.log('')
    console.log(`    ${c(`cd ${projectName}`)}`)
    console.log(`    ${c('npm run dev')}`)
    console.log('')
    if (gotGlobal) {
      console.log(`  ${d('flowkit is installed globally — run any command bare, e.g.:')}`)
      console.log(`    ${c('flowkit export')}`)
    } else {
      console.log(`  ${d('flowkit was installed locally only. Run CLI commands via npx, e.g.:')}`)
      console.log(`    ${c('npx flowkit export')}`)
      console.log(
        d(
          '  (AI agents working in this project: use `npx flowkit <command>`, not a bare `flowkit`.)'
        )
      )
    }
    console.log('')
  } catch (err) {
    console.error(r(`\n  ✗ Failed: ${err.message}`))
    // Clean up on failure
    if (fs.existsSync(targetDir)) {
      try {
        fs.rmSync(targetDir, { recursive: true, force: true })
        console.error(d('  Cleaned up partial directory.'))
      } catch {}
    }
    process.exit(1)
  }
}

main()
