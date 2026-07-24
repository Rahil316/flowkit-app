// Platform: the CLI's central command dispatcher — parses argv and routes to every subcommand.
import { r, d } from '../helpers/colors.js'
import { cmdNewWorkspace, cmdRemoveWorkspace, cmdWatch } from './workspace.js'
import { cmdExport } from '../builders/export.js'
import { cmdHandoff } from '../builders/handoff.js'
import {
  cmdSessionsLs,
  cmdSessionsImport,
  cmdSessionsCheck,
  cmdSessionsRm,
  cmdSessionsStats,
  cmdSessionsSample,
  cmdSessionsExport,
  cmdSessionsPurge,
  cmdSessionsBrief,
  cmdLensReport,
  cmdSessionsReport,
  cmdStudyNew,
  cmdStudyLs,
  cmdStudyArchive,
  cmdStudyActive,
} from './sessions/index.js'
import { cmdAgentSync } from './agent-sync.js'
import { cmdPlanLs, cmdProjectLs } from './plans.js'
import { cmdFeedbackImport, cmdFeedbackDump, cmdFeedbackLs } from './feedback.js'
import { cmdHelp } from './help.js'
import { cmdVersion } from './version.js'
import { cmdStatus } from './status.js'
import { cmdCreateChapter, cmdRemoveChapter, cmdListChapters } from '../authoring/chapters.js'
import {
  cmdCreatePage,
  cmdRemovePage,
  cmdRenamePage,
  cmdMovePage,
  cmdListPages,
  cmdPageInfo,
} from '../authoring/pages.js'
import {
  cmdCreateFlowStory,
  cmdRemoveFlowStory,
  cmdAddStep,
  cmdRemoveStep,
  cmdListSteps,
  cmdFlowStoryInfo,
} from '../authoring/flowStories.js'
import {
  cmdCreateComponent,
  cmdRemoveComponent,
  cmdComponentsFind,
  cmdComponentsLs,
  cmdComponentsScan,
  cmdAddExport,
  cmdListExports,
} from '../authoring/components.js'
import { cmdPromoteChapter } from '../authoring/promote-chapter.js'
import {
  cmdConvertMulti,
  cmdConvertFlat,
  cmdAddWorkspace,
  cmdRemoveWorkspace as cmdRemoveWorkspaceFlat,
  cmdRenameWorkspace,
} from './workspace-flat.js'

// Parse both bare ("nw:name") and dashed ("-nw:name") forms.
function parseCmd(arg) {
  const s = arg.startsWith('--') ? arg.slice(2) : arg.startsWith('-') ? arg.slice(1) : arg
  const colon = s.indexOf(':')
  if (colon === -1) return { cmd: s, val: '' }
  return { cmd: s.slice(0, colon), val: s.slice(colon + 1) }
}

export async function route(argv) {
  const firstArg = argv[0] ?? ''
  const rest = argv.slice(1)
  const p = parseCmd(firstArg)

  // ── Help ──
  if (
    !firstArg ||
    p.cmd === 'help' ||
    p.cmd === 'h' ||
    firstArg === '--help' ||
    firstArg === '-h'
  ) {
    cmdHelp()

    // ── Version ──
  } else if (p.cmd === 'version' || firstArg === '--version' || firstArg === '-v') {
    cmdVersion()

    // ── Workspaces ──
  } else if (p.cmd === 'nw' || p.cmd === 'new-workspace') {
    await cmdNewWorkspace(p.val)
  } else if (p.cmd === 'rw' || p.cmd === 'remove-workspace') {
    await cmdRemoveWorkspace(p.val)
  } else if (p.cmd === 'watch') {
    const wsVal = p.val.startsWith('flows:') ? p.val.slice(6) : p.val === 'flows' ? '' : p.val
    await cmdWatch(wsVal)

    // ── Status ──
  } else if (p.cmd === 'status') {
    cmdStatus(p.val)

    // ── Export / Handoff ──
  } else if (p.cmd === 'export') {
    await cmdExport(p.val, rest)
  } else if (p.cmd === 'handoff') {
    await cmdHandoff(p.val)

    // ── Sessions ──
  } else if (p.cmd === 'sessions' || p.cmd === 'se' || p.cmd === 'sp') {
    let sub, wsVal
    if (p.cmd === 'se') {
      sub = 'export'
      wsVal = p.val
    } else if (p.cmd === 'sp') {
      sub = 'purge'
      wsVal = p.val
    } else {
      const subColon = p.val.indexOf(':')
      sub = subColon === -1 ? p.val : p.val.slice(0, subColon)
      wsVal = subColon === -1 ? '' : p.val.slice(subColon + 1)
    }
    if (sub === 'ls' || sub === 'list') cmdSessionsLs(wsVal, rest)
    else if (sub === 'import') cmdSessionsImport(wsVal, rest)
    else if (sub === 'check') cmdSessionsCheck(wsVal)
    else if (sub === 'rm') cmdSessionsRm(wsVal, rest)
    else if (sub === 'stats') cmdSessionsStats(wsVal)
    else if (sub === 'sample') cmdSessionsSample(wsVal)
    else if (sub === 'export') cmdSessionsExport(wsVal, rest)
    else if (sub === 'purge') await cmdSessionsPurge(wsVal, rest)
    else if (sub === 'brief') cmdSessionsBrief(wsVal, rest)
    else if (sub === 'report') cmdSessionsReport(wsVal, rest)
    else if (sub === 'study') {
      // sessions:study:<action>:<ws>  — sub-action is next colon segment
      const subColon2 = wsVal.indexOf(':')
      const action = subColon2 === -1 ? wsVal : wsVal.slice(0, subColon2)
      const wsVal2 = subColon2 === -1 ? '' : wsVal.slice(subColon2 + 1)
      if (action === 'new') cmdStudyNew(wsVal2, rest)
      else if (action === 'ls' || action === 'list') cmdStudyLs(wsVal2)
      else if (action === 'archive') await cmdStudyArchive(wsVal2, rest)
      else if (action === 'active') cmdStudyActive(wsVal2, rest)
      else {
        console.error(r(`✗ Unknown study command: sessions:study:${wsVal}`))
        console.log(d('  Try: study:new · study:ls · study:archive · study:active'))
        process.exit(1)
      }
    } else {
      console.error(r(`✗ Unknown sessions command: sessions:${p.val}`))
      console.log(
        d('  Try: ls · import · export · check · rm · stats · sample · purge · brief · report')
      )
      console.log(d('       study:new · study:ls · study:archive · study:active'))
      process.exit(1)
    }

    // ── Lens report ──
  } else if (p.cmd === 'lens' || p.cmd === 'lr') {
    let sub, wsVal
    if (p.cmd === 'lr') {
      sub = 'report'
      wsVal = p.val
    } else {
      const lensColon = p.val.indexOf(':')
      sub = lensColon === -1 ? p.val : p.val.slice(0, lensColon)
      wsVal = lensColon === -1 ? (rest[0] ?? '') : p.val.slice(lensColon + 1)
    }
    if (sub === 'report') cmdLensReport(wsVal, rest)
    else {
      console.error(r(`✗ Unknown lens command: lens:${p.val}`))
      console.log(d('  Try: lens:report or lr'))
      process.exit(1)
    }

    // ── Projects ──
  } else if (p.cmd === 'project' || p.cmd === 'pj') {
    const subColon = p.val.indexOf(':')
    const sub = subColon === -1 ? p.val : p.val.slice(0, subColon)
    const nameVal = subColon === -1 ? '' : p.val.slice(subColon + 1)
    if (sub === 'ls' || sub === 'list' || sub === '') cmdProjectLs(nameVal)
    else {
      console.error(r(`✗ Unknown project command: project:${p.val}`))
      console.log(d('  Try: project:ls'))
      process.exit(1)
    }

    // ── FlowStory ──
  } else if (p.cmd === 'plan' || p.cmd === 'fp') {
    const subColon = p.val.indexOf(':')
    const sub = subColon === -1 ? p.val : p.val.slice(0, subColon)
    const nameVal = subColon === -1 ? '' : p.val.slice(subColon + 1)
    if (sub === 'ls' || sub === 'list') cmdPlanLs(nameVal, rest)
    else {
      console.error(r(`✗ Unknown plan command: plan:${p.val}`))
      console.log(d('  Try: plan:ls  ·  for validation, use: flowkit check:flowStories'))
      process.exit(1)
    }

    // ── Feedback ──
  } else if (p.cmd === 'feedback' || p.cmd === 'fi' || p.cmd === 'fd') {
    let sub, wsVal, fArgs
    if (p.cmd === 'fi') {
      sub = 'import'
      wsVal = p.val
      fArgs = rest
    } else if (p.cmd === 'fd') {
      sub = 'dump'
      wsVal = p.val
      fArgs = rest
    } else {
      const subColon = p.val.indexOf(':')
      sub = subColon === -1 ? p.val : p.val.slice(0, subColon)
      wsVal = subColon === -1 ? '' : p.val.slice(subColon + 1)
      fArgs = rest
    }
    if (sub === 'import') cmdFeedbackImport(wsVal, fArgs)
    else if (sub === 'dump') cmdFeedbackDump(wsVal, fArgs)
    else if (sub === 'ls' || sub === 'list') cmdFeedbackLs(wsVal)
    else {
      console.error(r(`✗ Unknown feedback command: feedback:${p.val}`))
      console.log(d('  Try: feedback:import · feedback:dump · feedback:ls'))
      process.exit(1)
    }

    // ── Agent ──
  } else if (p.cmd === 'agent') {
    const subColon = p.val.indexOf(':')
    const sub = subColon === -1 ? p.val : p.val.slice(0, subColon)
    const wsVal = subColon === -1 ? '' : p.val.slice(subColon + 1)
    if (sub === 'sync') cmdAgentSync(wsVal, rest)
    else {
      console.error(r(`✗ Unknown agent command: agent:${p.val}`))
      console.log(d('  Try: agent:sync'))
      process.exit(1)
    }
  } else if (p.cmd === 'create') {
    const sub = p.val
    if (sub === 'chapter') await cmdCreateChapter('', rest)
    else if (sub === 'page') await cmdCreatePage('', rest)
    else if (sub === 'flowStory') await cmdCreateFlowStory('', rest)
    else if (sub === 'component') await cmdCreateComponent('', rest)
    else if (sub === 'workspace') await cmdAddWorkspace('', rest)
    else {
      console.error(r(`✗ Unknown: create:${sub}`))
      process.exit(1)
    }
  } else if (p.cmd === 'remove') {
    const sub = p.val
    if (sub === 'chapter') await cmdRemoveChapter('', rest)
    else if (sub === 'page') await cmdRemovePage('', rest)
    else if (sub === 'flowStory') await cmdRemoveFlowStory('', rest)
    else if (sub === 'component') await cmdRemoveComponent('', rest)
    else if (sub === 'step') await cmdRemoveStep('', rest)
    else if (sub === 'workspace') await cmdRemoveWorkspaceFlat('', rest)
    else {
      console.error(r(`✗ Unknown: remove:${sub}`))
      process.exit(1)
    }
  } else if (p.cmd === 'convert') {
    if (p.val === 'multi') await cmdConvertMulti('', rest)
    else if (p.val === 'flat') await cmdConvertFlat('', rest)
    else {
      console.error(r(`✗ Unknown: convert:${p.val}`))
      console.log(d('  Try: convert:multi, convert:flat'))
      process.exit(1)
    }
  } else if (p.cmd === 'list') {
    const sub = p.val
    if (sub === 'chapters') await cmdListChapters('', rest)
    else if (sub === 'pages') await cmdListPages('', rest)
    else if (sub === 'steps') await cmdListSteps('', rest)
    else if (sub === 'exports') await cmdListExports('', rest)
    else {
      console.error(r(`✗ Unknown: list:${sub}`))
      process.exit(1)
    }
  } else if (p.cmd === 'rename') {
    if (p.val === 'page') await cmdRenamePage('', rest)
    else if (p.val === 'workspace') await cmdRenameWorkspace('', rest)
    else {
      console.error(r(`✗ Unknown: rename:${p.val}`))
      process.exit(1)
    }
  } else if (p.cmd === 'promote') {
    if (p.val === 'chapter') await cmdPromoteChapter('', rest)
    else {
      console.error(r(`✗ Unknown: promote:${p.val}`))
      process.exit(1)
    }
  } else if (p.cmd === 'move') {
    if (p.val === 'page') await cmdMovePage('', rest)
    else {
      console.error(r(`✗ Unknown: move:${p.val}`))
      process.exit(1)
    }
  } else if (p.cmd === 'add') {
    if (p.val === 'step') await cmdAddStep('', rest)
    else if (p.val === 'export') await cmdAddExport('', rest)
    else {
      console.error(r(`✗ Unknown: add:${p.val}`))
      process.exit(1)
    }
  } else if (p.cmd === 'page') {
    if (p.val === 'info') await cmdPageInfo('', rest)
    else {
      console.error(r(`✗ Unknown: page:${p.val}`))
      process.exit(1)
    }
  } else if (p.cmd === 'flowStory') {
    if (p.val === 'info') await cmdFlowStoryInfo('', rest)
    else {
      console.error(r(`✗ Unknown: flowStory:${p.val}`))
      process.exit(1)
    }
  } else if (p.cmd === 'components') {
    const sub = p.val
    if (sub === 'find') await cmdComponentsFind('', rest)
    else if (sub === 'ls' || sub === 'list') await cmdComponentsLs('', rest)
    else if (sub === 'scan') await cmdComponentsScan('', rest)
    else {
      console.error(r(`✗ Unknown: components:${sub}`))
      process.exit(1)
    }
  } else {
    console.error(r(`✗ Unknown command: ${firstArg}`))
    console.log(d('  Run "flowkit help" for usage.'))
    process.exit(1)
  }
}
