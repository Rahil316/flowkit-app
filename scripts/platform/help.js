// Platform command: prints CLI usage help.
import path from 'path'
import { getActiveWorkspaceName, isRepoMode, ROOT } from '../helpers/paths.js'
import { readJson } from '../helpers/json.js'
import { b, c, d } from '../helpers/colors.js'

export function cmdHelp() {
  const ws = getActiveWorkspaceName()
  const pkg = readJson(path.join(ROOT, 'package.json'), {})
  const mode = isRepoMode() ? 'repo' : 'consumer (flat/multi-workspace)'
  console.log(`
${b('flowkit')} ${d(`v${pkg.version ?? 'unknown'}`)} — UI prototyping platform CLI
${d(`Active workspace: ${ws || '(none)'}  ·  Mode: ${mode}`)}

${b('Syntax:')} short alias or long-form, both always work
  ${c('flowkit nw')}                         guided
  ${c('flowkit nw:<name>')}                  express — colon separates command from value
  ${c('flowkit new-workspace:<name>')}        same, long form
  ${c('flowkit nw:<name> --kit:apple --empty')}   with flags

${b('Workspaces (repo mode only')} ${d('— not available in flat/multi consumer projects, see below')}${b('):')}
  ${c('nw')} / ${c('new-workspace')}           Create workspace (guided or express)
  ${c('rw')} / ${c('remove-workspace')}        Remove workspace (requires confirmation)
  ${c('watch:flows')}                      Watch for file changes
  ${c('status')}                           Health snapshot: flows, router, sessions, feedback, agent

${b('Workspaces (flat consumer projects):')}
  ${c('convert:multi')} ${d('[--name:<id>]')}       Convert a flat project to multi-workspace mode

${b('Workspaces (multi-workspace consumer projects only):')}
  ${c('convert:flat')} ${d('[--from:<id>] [--all]')}  Collapse multi-workspace mode back to flat
  ${c('create:workspace')} ${d('[--name:<id>] [--empty]')}   Add a workspace
  ${c('remove:workspace')} ${d('[--name:<id>]')}     Remove a workspace (requires confirmation)
  ${c('rename:workspace')} ${d('<old> <new>')}       Rename a workspace

${b('Scaffold (authoring):')}
  ${c('create:chapter')} ${d('--name:<id>')}            Add a chapter + register in workspace.ts
  ${c('create:page')} ${d('--chapter:<id> --name:<id>')}  Add a page to a chapter
  ${c('create:flowStory')} ${d('--name:<id>')}         Add a flowStory script
  ${c('create:component')} ${d('--name:<PascalName> --path:<lib/components/...>')}   Add a workspace component
  ${c('remove:chapter')} ${d('--name:<flow-id> [--force]')}
  ${c('remove:page')} ${d('--chapter:<id> --name:<page-id>')}
  ${c('remove:flowStory')} ${d('--name:<flowStory-id> [--force]')}
  ${c('remove:component')} ${d('--name:<ComponentName>')}
  ${c('remove:step')} ${d('--flowStory:<id> --index:<n>')}
  ${c('rename:page')} ${d('--chapter:<id> --name:<old-id> --to:<new-id>')}
  ${c('move:page')} ${d('--name:<id> --from-flow:<id> --to-flow:<id>')}
  ${c('add:step')} ${d('--flowStory:<id> --page:<id>')}   Append a step to a flowStory
  ${c('add:export')} ${d('--barrel:<path> --name:<ExportName>')}   Add a barrel re-export
  ${c('list:chapters')}                        List chapters in the workspace
  ${c('list:pages')} ${d('[--chapter:<id>]')}         List pages, optionally filtered by chapter
  ${c('list:steps')} ${d('--flowStory:<id>')}         List a flowStory's steps
  ${c('list:exports')} ${d('--barrel:<path>')}       List a barrel's re-exports
  ${c('page:info')} ${d('--chapter:<id> --name:<id>')}   Show page metadata + flowStory refs
  ${c('flowStory:info')} ${d('--name:<id>')}          Show flowStory steps
  ${c('components:ls')} / ${c('components:scan')}
  ${c('components:find')} ${d('--name:<ComponentName>')}
  ${c('promote:chapter')} ${d('--flowStory:<path> --fork:"<label>" [--as:<new-id>]')}   Extract a fork into its own flowStory

  ${d('All scaffold commands accept --workspace:<name> to target a non-active workspace.')}
  ${d('pageOrder in workspace.ts controls display order; scaffold commands keep it in sync.')}

${b('Projects:')}
  ${c('project:ls')} / ${c('pj:ls')}          List projects + plan counts

${b('FlowStories:')}
  ${c('plan:ls')} / ${c('fp:ls')}             List flowStories  ${d('[--project:<slug>]')}

${b('Check (domain-specific linter for authored content):')}
  ${c('check')}                            Run all 5 domain checkers, combined report
  ${c('check:screens')} / ${c('check:config')} / ${c('check:components')} / ${c('check:db')} / ${c('check:flowStories')}
                                       Run just one domain  ${d('[--json]')}

${b('Sessions (FlowTracer / FlowLens library):')}
  ${d('Note: this section uses space-separated flags (--flag value), not the --flag:value colon')}
  ${d('convention used everywhere else in this CLI.')}
  ${c('sessions:ls')} ${d('[--json]')}         List committed sessions
  ${c('sessions:import <file>')} ${d('[--force] [--study <name|id>]')}   Import an exported session
  ${c('sessions:export')} / ${c('se')} ${d('<id|name|file> [--dest <path>]')}   Export a committed session back to disk
  ${c('sessions:check')}                   Validate the library
  ${c('sessions:stats')}                   Roll-up: quality, completion, frustrated screens
  ${c('sessions:sample')}                  Generate a synthetic test session
  ${c('sessions:rm <id|name|file>')}       Remove one committed session
  ${c('sessions:purge')} / ${c('sp')} ${d('[--test-only] [--older-than <days>] [--study <name|id>]')}   Bulk remove
  ${c('sessions:brief')} ${d('[--append]')}          Agent brief from session data  ${d('(--append → project.md)')}
  ${c('sessions:report')} ${d('[--study <name|id>] [--format json|md|both] [--agent] [--dest <path>]')}
                                       Unified report — ${c('lens:report')}/${c('sessions:brief')} are presets of this.
                                       ${d('--agent appends to .agent/project.md instead of stdout.')}
  ${c('lens:report')} / ${c('lr')}             Export FlowLens analytics JSON  ${d('[--dest <path>]')}
  ${c('sessions:study:new')} ${d('<name> [--desc "<text>"]')} / ${c('study:ls')} / ${c('study:archive')} ${d('[--force]')} / ${c('study:active')}
                                       Manage FlowLens studies (named session cohorts)

${b('Feedback:')}
  ${c('feedback:import <file>')} / ${c('fi')}   Commit feedback from an exported JSON file
  ${c('feedback:dump')} / ${c('fd')} ${d('[--dest <path>]')}   Export committed feedback to disk
  ${c('feedback:ls')}                      List committed comments

${b('Export & handoff:')}
  ${c('export')} ${d('[--workspace:<name>] [--profile:<name>]')}   Standalone HTML export — guided flow, works in every mode
  ${c('handoff')} ${d('[<workspace>]')}             Developer handoff zip  ${d('— repo mode only, guided prompt if omitted')}
${
  isRepoMode()
    ? `
${b('Agent onboarding (repo mode only):')}
  ${c('agent:sync')}                       Regenerate .agent/* and AGENTS.md from spec
`
    : ''
}
  ${c('flowkit -h')} / ${c('flowkit help')}     — show this help
  ${c('flowkit -v')} / ${c('flowkit version')}  — show installed version
`)
}
