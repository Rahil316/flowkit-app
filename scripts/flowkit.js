#!/usr/bin/env node
// Bootstrap: the npm bin entry point — hands off to the platform dispatcher immediately.
//
// One deliberate exception: `flowkit check`/`check:<domain>` is intercepted HERE, before
// dispatcher.js ever sees it, in every mode (repo, flat, multi-workspace) — the rule modules
// under scripts/checks/ are mode-agnostic (they take a resolved wsDir), so there's no reason
// to gate this repo's own checkout out of dogfooding its own check rules. dispatcher.js itself
// has zero knowledge of `check` — no import, no dispatch branch — so this repo's own command
// surface elsewhere is unaffected.
//
// This mirrors dispatcher.js's own colon-parsing convention (`check:pages` → cmd 'check',
// val 'pages') in miniature, rather than importing dispatcher.js's internal parseCmd() — small,
// deliberate duplication so dispatcher.js never needs to export anything check-specific.
import { route } from './platform/dispatcher.js'

const argv = process.argv.slice(2)
const firstArg = argv[0] ?? ''
const bare = firstArg.startsWith('--')
  ? firstArg.slice(2)
  : firstArg.startsWith('-')
    ? firstArg.slice(1)
    : firstArg
const colon = bare.indexOf(':')
const cmd = colon === -1 ? bare : bare.slice(0, colon)
const sub = colon === -1 ? '' : bare.slice(colon + 1)

if (cmd === 'check') {
  const { dispatchCheck } = await import('./checks/index.js')
  await dispatchCheck(sub, argv.slice(1))
} else {
  route(argv)
}
