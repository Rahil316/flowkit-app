#!/usr/bin/env node
// Bootstrap: the npm bin entry point — hands off to the platform dispatcher immediately.
//
// One deliberate exception: `flowkit audit`/`audit:<domain>` is intercepted HERE, before
// dispatcher.js ever sees it, in every mode (repo, flat, multi-workspace) — the rule modules
// under scripts/audits/ are mode-agnostic (they take a resolved wsDir), so there's no reason
// to gate this repo's own checkout out of dogfooding its own audit rules. dispatcher.js itself
// has zero knowledge of `audit` — no import, no dispatch branch — so this repo's own command
// surface elsewhere is unaffected.
//
// This mirrors dispatcher.js's own colon-parsing convention (`audit:page` → cmd 'audit',
// val 'page') in miniature, rather than importing dispatcher.js's internal parseCmd() — small,
// deliberate duplication so dispatcher.js never needs to export anything audit-specific.
//
// `check`/`check:<domain>` was fully removed and renamed to `audit`/`audit:<domain>` — no
// back-compat alias, matching this repo's existing precedent (plan:check/fp:check were
// removed with no alias when flowStory:ls replaced plan:ls/fp:ls). `flowkit check` now falls
// through to dispatcher.js's normal "unknown command" handling.
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

if (cmd === 'audit') {
  const { dispatchAudit } = await import('./audits/index.js')
  await dispatchAudit(sub, argv.slice(1))
} else {
  route(argv)
}
