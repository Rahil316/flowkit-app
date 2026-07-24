import type { InspectorTab } from '@flowkit-shared/constants/tabs'

// Small delay to let the feedback tab mount and register its modal opener refs
function afterTabMount(fn: () => void) {
  setTimeout(fn, 50)
}

// Generic descriptor a feature can populate to register one toggle into both
// Settings and Action Center, without shared/ needing to import that feature's
// code. See src/features/feedback/cloud-sync/registerCloudSync.ts for the one
// current producer of this shape — kept in sync with that file manually since
// shared/ must not import from features/.
export interface CloudSyncSlot {
  actionId: string
  group: string
  label: string
  hint?: string
  beta?: boolean
  enabled: boolean
  toggle: () => void
  stayOpen?: boolean
}

export interface ActionCtx {
  navigateTo: (id: string) => void
  setActiveTab: (tab: InspectorTab) => void
  setIsOpen: (open: boolean) => void
  toggleTheme: () => void
  toggleOrientation: () => void
  resetToFirst: () => void
  resetDb: () => void
  openGoTo: () => void
  openHelp: () => void
  openSettings: () => void
  toggleDevMode: () => void
  cloudSyncSlot?: CloudSyncSlot
  openFeedbackTab: () => void
  openExportModal: () => void
  openImportModal: () => void
  toggleAutoHideScrollbars: () => void
  autoHideScrollbars: boolean
  // Sessions feature
  showSessionsFeature: boolean
  toggleSessionsFeature: () => void
  autoRecordOnPlay: boolean
  toggleAutoRecordOnPlay: () => void
  // FlowLens mode
  flowLensAvailable: boolean
  enterFlowLens: () => void
}

export type AppMode = 'default' | 'flowlens'

export interface AppAction {
  id: string
  label: string
  group: string
  shortcut?: string
  beta?: boolean
  /** If set, action is only shown in the listed modes. Omit to show in all modes. */
  modes?: AppMode[]
  run?: (ctx: ActionCtx) => void
}

export const APP_ACTIONS: AppAction[] = [
  // ── Panel tabs — order matches ALL_TABS: feedback info simulator flow db sessions ──
  {
    id: 'tab-feedback',
    modes: ['default'],
    group: 'Panel',
    label: 'Open Feedback',
    shortcut: 'Shift+1',
    run: c => {
      c.setActiveTab('feedback')
      c.setIsOpen(true)
    },
  },
  {
    id: 'tab-info',
    modes: ['default'],
    group: 'Panel',
    label: 'Open Screen Info',
    shortcut: 'Shift+2',
    run: c => {
      c.setActiveTab('info')
      c.setIsOpen(true)
    },
  },
  {
    id: 'tab-simulator',
    modes: ['default'],
    group: 'Panel',
    label: 'Open Simulator',
    shortcut: 'Shift+3',
    run: c => {
      c.setActiveTab('simulator')
      c.setIsOpen(true)
    },
  },
  {
    id: 'tab-flow',
    modes: ['default'],
    group: 'Panel',
    label: 'Open Flow Debugger',
    shortcut: 'Shift+4',
    run: c => {
      c.setActiveTab('chapter')
      c.setIsOpen(true)
    },
  },
  {
    id: 'tab-db',
    modes: ['default'],
    group: 'Panel',
    label: 'Open Database',
    shortcut: 'Shift+5',
    run: c => {
      c.setActiveTab('db')
      c.setIsOpen(true)
    },
  },
  {
    id: 'tab-sessions',
    modes: ['default'],
    group: 'Panel',
    label: 'Open Sessions',
    shortcut: 'Shift+6',
    run: c => {
      c.setActiveTab('sessions')
      c.setIsOpen(true)
    },
  },
  {
    id: 'subtab-prev',
    modes: ['default'],
    group: 'Panel',
    label: 'Previous sub-tab',
    shortcut: 'Shift+,',
  },
  {
    id: 'subtab-next',
    modes: ['default'],
    group: 'Panel',
    label: 'Next sub-tab',
    shortcut: 'Shift+.',
  },

  // ── Navigation — default mode only ──────────────────────────────────────────
  {
    id: 'goto',
    modes: ['default'],
    group: 'Navigation',
    label: 'Go to screen…',
    shortcut: 'Shift+G',
    run: c => c.openGoTo(),
  },
  {
    id: 'nav-prev',
    modes: ['default'],
    group: 'Navigation',
    label: 'Previous screen',
    shortcut: '←',
  },
  { id: 'nav-next', modes: ['default'], group: 'Navigation', label: 'Next screen', shortcut: '→' },
  {
    id: 'nav-prev-flow',
    modes: ['default'],
    group: 'Navigation',
    label: 'Previous flow',
    shortcut: 'Shift+←',
  },
  {
    id: 'nav-next-flow',
    modes: ['default'],
    group: 'Navigation',
    label: 'Next flow',
    shortcut: 'Shift+→',
  },

  // ── View ────────────────────────────────────────────────────────────────────
  {
    id: 'toggle-theme',
    group: 'View',
    label: 'Toggle light / dark mode',
    run: c => c.toggleTheme(),
  },
  {
    id: 'toggle-orient',
    modes: ['default'],
    group: 'View',
    label: 'Toggle orientation',
    run: c => c.toggleOrientation(),
  },
  {
    id: 'toggle-scrollbars',
    group: 'View',
    label: 'Auto-hide canvas scrollbars',
    run: c => c.toggleAutoHideScrollbars(),
  },

  // ── Left panel — default mode only ──────────────────────────────────────────
  {
    id: 'sidebar-screens',
    modes: ['default'],
    group: 'Left Panel',
    label: 'Screens tab',
    shortcut: 'Alt+1',
  },
  {
    id: 'sidebar-flows',
    modes: ['default'],
    group: 'Left Panel',
    label: 'Flow Library tab',
    shortcut: 'Alt+2',
  },
  {
    id: 'sidebar-search',
    modes: ['default'],
    group: 'Left Panel',
    label: 'Focus screen search',
    shortcut: 'Shift+F',
  },

  // ── Database — default mode only ────────────────────────────────────────────
  {
    id: 'reset-db',
    modes: ['default'],
    group: 'Database',
    label: 'Reset database to defaults',
    run: c => c.resetDb(),
  },

  // ── Help ────────────────────────────────────────────────────────────────────
  {
    id: 'open-help',
    group: 'Help',
    label: 'Keyboard shortcuts',
    shortcut: 'Cmd+?',
    run: c => c.openHelp(),
  },
  { id: 'open-actions', group: 'Help', label: 'Action center', shortcut: 'Cmd+/' },
  { id: 'open-feedback', group: 'Help', label: 'Add comment', shortcut: 'Cmd+K' },
  {
    id: 'open-settings',
    group: 'Help',
    label: 'Settings',
    shortcut: 'Cmd+,',
    run: c => c.openSettings(),
  },

  // ── Developer — default mode only ───────────────────────────────────────────
  {
    id: 'toggle-dev-mode',
    modes: ['default'],
    group: 'Developer',
    label: 'Toggle dev mode',
    run: c => c.toggleDevMode(),
  },

  // ── Sessions — default mode only ─────────────────────────────────────────────
  {
    id: 'toggle-sessions',
    modes: ['default'],
    group: 'Sessions',
    label: 'Session recording',
    run: c => c.toggleSessionsFeature(),
  },
  {
    id: 'toggle-auto-record',
    modes: ['default'],
    group: 'Sessions',
    label: 'Auto-record on flow play',
    run: c => c.toggleAutoRecordOnPlay(),
  },

  // ── FlowLens — default mode only (already in FlowLens, no point re-entering) ─
  {
    id: 'enter-flowlens',
    modes: ['default'],
    group: 'FlowLens',
    label: 'Enter FlowLens mode',
    run: c => c.enterFlowLens(),
  },

  // ── Feedback — default mode only ─────────────────────────────────────────────
  {
    id: 'feedback-export',
    modes: ['default'],
    group: 'Feedback',
    label: 'Export feedback…',
    run: c => {
      c.openFeedbackTab()
      afterTabMount(() => c.openExportModal())
    },
  },
  {
    id: 'feedback-import',
    modes: ['default'],
    group: 'Feedback',
    label: 'Import feedback…',
    run: c => {
      c.openFeedbackTab()
      afterTabMount(() => c.openImportModal())
    },
  },
]

// Turns a CloudSyncSlot (or any future slot with this shape) into an AppAction
// so it appears in Action Center alongside the static list — the item's very
// existence in the palette depends on ctx, so it can't be a static entry.
export function slotToAction(slot: CloudSyncSlot): AppAction {
  return {
    id: slot.actionId,
    modes: ['default'],
    group: slot.group,
    label: slot.label,
    beta: slot.beta,
    run: c => c.cloudSyncSlot?.toggle(),
  }
}
