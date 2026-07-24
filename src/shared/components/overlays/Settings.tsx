import type { ColorBlindMode } from '@flowkit/types/index'
import { useFeedback } from '@flowkit-features/feedback'
import {
  compositeOverBackdrop,
  contrastRating,
  contrastRatio,
  formatRatio,
  HIGHLIGHT_SWATCHES,
  useDbHighlightSettings,
} from '@flowkit-features/flow-debugger'
import { type HighlightColor, useFlowStorySettings } from '@flowkit-features/flowStory'
import { useSessionSettings } from '@flowkit-features/flowTracer'
import { LS_LEFT_PANEL_W, LS_RIGHT_PANEL_W } from '@flowkit-shared/constants/storageKeys'
import {
  Bug,
  LayoutPanelLeft,
  MessageSquare,
  Monitor,
  SlidersHorizontal,
  Video,
  Workflow,
  X,
} from 'lucide-react'
import { useCallback, useState } from 'react'

import { useSimulator } from '../../contexts/DashboardContext'
import { useTheme } from '../../contexts/ThemeContext'
import Input from '../ui/Input'
import SegmentedControl from '../ui/SegmentedControl'
import Select from '../ui/Select'
import Toggle from '../ui/Toggle'
import type { ActionCtx } from './appActions'
import OverlayShell from './OverlayShell'

// ── Types ──────────────────────────────────────────────────────────────────────

type SectionId = 'interface' | 'panel' | 'flowStories' | 'feedback' | 'sessions' | 'debug'

interface Section {
  id: SectionId
  label: string
  icon: React.ReactNode
}

// ── Shared primitives ──────────────────────────────────────────────────────────

interface RowProps {
  label: string
  hint?: string
  children: React.ReactNode
}

function SettingRow({ label, hint, children }: RowProps) {
  return (
    <div className="flex items-center justify-between gap-2 py-2 border-b border-theme-border">
      <div className="flex-1 min-w-0">
        <div className="text-ui-sm text-theme-text-primary font-medium">{label}</div>
        {hint && (
          <div className="text-ui-xs text-theme-text-muted mt-0.5 leading-normal">{hint}</div>
        )}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

interface GroupProps {
  title: string
  children: React.ReactNode
}

function SettingGroup({ title, children }: GroupProps) {
  return (
    <div className="mb-3">
      <div className="text-ui-2xs font-extrabold tracking-[0.09em] uppercase text-theme-text-disabled mb-2">
        {title}
      </div>
      <div>{children}</div>
    </div>
  )
}

interface SectionHeaderProps {
  icon: React.ReactNode
  title: string
  description: string
}

function SectionHeader({ icon, title, description }: SectionHeaderProps) {
  return (
    <div className="flex items-start gap-2 mb-2 pb-2 border-b border-theme-border">
      <div className="rounded-lg shrink-0 flex items-center justify-center bg-theme-elevated border border-theme-border text-theme-text-secondary size-8">
        {icon}
      </div>
      <div>
        <div className="text-ui-base font-bold text-theme-text-primary">{title}</div>
        <div className="text-ui-xs text-theme-text-muted mt-0.5 leading-normal">{description}</div>
      </div>
    </div>
  )
}

// ── Section panels ─────────────────────────────────────────────────────────────

interface InterfaceSectionProps {
  ctx: ActionCtx
}

function InterfaceSection({ ctx }: InterfaceSectionProps) {
  const { mode, setMode } = useTheme()
  const { colorBlindMode, setColorBlindMode, blurryVision, setBlurryVision } = useSimulator()

  return (
    <div>
      <SectionHeader
        icon={<Monitor size={15} />}
        title="Interface"
        description="Visual appearance and accessibility settings."
      />

      <SettingGroup title="Appearance">
        <SettingRow label="Theme" hint="Switches between dark and light mode globally.">
          <Select
            value={mode}
            onChange={e => setMode(e.target.value as 'dark' | 'light')}
            style={{ width: 120 }}
          >
            <option value="dark">Dark</option>
            <option value="light">Light</option>
          </Select>
        </SettingRow>
        <SettingRow label="Auto-hide scrollbars" hint="Hides canvas scrollbars when not in use.">
          <Toggle
            size="sm"
            checked={ctx.autoHideScrollbars}
            onChange={ctx.toggleAutoHideScrollbars}
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="Accessibility">
        <SettingRow
          label="Color blind simulation"
          hint="Applies a color filter over the canvas preview."
        >
          <Select
            value={colorBlindMode}
            onChange={e => setColorBlindMode(e.target.value as ColorBlindMode)}
            style={{ width: 164 }}
          >
            <option value="none">None</option>
            <option value="deuteranopia">Deuteranopia</option>
            <option value="protanopia">Protanopia</option>
            <option value="tritanopia">Tritanopia</option>
            <option value="deuteranomaly">Deuteranomaly</option>
            <option value="protanomaly">Protanomaly</option>
            <option value="tritanomaly">Tritanomaly</option>
            <option value="achromatopsia">Achromatopsia</option>
          </Select>
        </SettingRow>
        <SettingRow
          label="Blurry vision simulation"
          hint="Blurs the canvas to simulate low visual acuity (0 = off)."
        >
          <Select
            value={String(blurryVision)}
            onChange={e => setBlurryVision(Number(e.target.value))}
            style={{ width: 120 }}
          >
            <option value="0">Off</option>
            <option value="1">Mild</option>
            <option value="2">Moderate</option>
            <option value="3">Severe</option>
          </Select>
        </SettingRow>
      </SettingGroup>
    </div>
  )
}

function PanelSection() {
  // Panel widths are drag-set by the user and persisted in canvasReducer.
  // Here we show the current saved values as read-only info with a note.
  const leftW = parseInt(localStorage.getItem(LS_LEFT_PANEL_W) ?? '260', 10)
  const rightW = parseInt(localStorage.getItem(LS_RIGHT_PANEL_W) ?? '380', 10)

  return (
    <div>
      <SectionHeader
        icon={<LayoutPanelLeft size={15} />}
        title="Panel"
        description="Control panel layout and behaviour."
      />

      <SettingGroup title="Panel widths">
        <SettingRow
          label="Left panel width"
          hint="Set by dragging the panel edge. Saved automatically."
        >
          <span className="text-ui-sm text-theme-text-muted [font-variant-numeric:tabular-nums]">
            {leftW}px
          </span>
        </SettingRow>
        <SettingRow
          label="Right panel width"
          hint="Set by dragging the panel edge. Saved automatically."
        >
          <span className="text-ui-sm text-theme-text-muted [font-variant-numeric:tabular-nums]">
            {rightW}px
          </span>
        </SettingRow>
        <SettingRow
          label="Reset panel widths"
          hint="Restore both panels to their default widths on next reload."
        >
          <button
            onClick={() => {
              localStorage.removeItem(LS_LEFT_PANEL_W)
              localStorage.removeItem(LS_RIGHT_PANEL_W)
            }}
            className="text-ui-xs font-semibold py-1 px-2.5 rounded-md border border-theme-border bg-theme-elevated text-theme-text-secondary cursor-pointer"
          >
            Reset
          </button>
        </SettingRow>
      </SettingGroup>
    </div>
  )
}

const WRONG_CLICK_SWATCHES: { value: HighlightColor; hex: string }[] = [
  { value: 'orange', hex: '#f97316' },
  { value: 'red', hex: '#ef4444' },
  { value: 'purple', hex: '#a855f7' },
  { value: 'yellow', hex: '#eab308' },
]

function DebugSection() {
  const {
    highlightBg,
    setHighlightBg,
    highlightText,
    setHighlightText,
    highlightOpacity,
    setHighlightOpacity,
    highlightRadius,
    setHighlightRadius,
  } = useDbHighlightSettings()
  const { theme } = useTheme()
  // The highlight renders inside DbInspector's <pre>, which sits on bg-theme-elevated —
  // composite the (possibly transparent) highlight bg over that real backdrop, per theme mode.
  const effectiveBg = compositeOverBackdrop(highlightBg, highlightOpacity, theme.bg.elevated)

  return (
    <div>
      <SectionHeader
        icon={<Bug size={15} />}
        title="Debug"
        description="Customize the database inspector's search-match highlight."
      />

      <SettingGroup title="Search highlight">
        <SettingRow label="Background color" hint="Highlight background color.">
          <div className="flex items-center gap-1.5">
            {HIGHLIGHT_SWATCHES.map(hex => (
              <button
                key={hex}
                onClick={() => setHighlightBg(hex)}
                title={hex}
                aria-label={hex}
                className="rounded-full cursor-pointer size-4.5"
                style={{
                  background: hex,
                  border:
                    highlightBg === hex
                      ? '2px solid var(--color-theme-text-primary)'
                      : '2px solid transparent',
                  outline: highlightBg === hex ? `1px solid ${hex}` : 'none',
                  outlineOffset: 1,
                }}
              />
            ))}
            <span
              className="relative rounded-full cursor-pointer size-4.5 overflow-hidden"
              style={{
                background:
                  'radial-gradient(circle, #fff 0%, transparent 60%), conic-gradient(from 90deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
              }}
              title="Custom color"
            >
              <input
                type="color"
                value={highlightBg}
                onChange={e => setHighlightBg(e.target.value)}
                aria-label="Custom color"
                className="absolute inset-0 size-full opacity-0 cursor-pointer border-none bg-transparent p-0"
              />
            </span>
          </div>
        </SettingRow>
        <SettingRow label="Text color" hint="Highlight text color.">
          <div className="flex items-center gap-1.5">
            {HIGHLIGHT_SWATCHES.map(hex => (
              <button
                key={hex}
                onClick={() => setHighlightText(hex)}
                title={hex}
                aria-label={hex}
                className="rounded-full cursor-pointer size-4.5"
                style={{
                  background: hex,
                  border:
                    highlightText === hex
                      ? '2px solid var(--color-theme-text-primary)'
                      : '2px solid transparent',
                  outline: highlightText === hex ? `1px solid ${hex}` : 'none',
                  outlineOffset: 1,
                }}
              />
            ))}
            <span
              className="relative rounded-full cursor-pointer size-4.5 overflow-hidden"
              style={{
                background:
                  'radial-gradient(circle, #fff 0%, transparent 60%), conic-gradient(from 90deg, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)',
              }}
              title="Custom color"
            >
              <input
                type="color"
                value={highlightText}
                onChange={e => setHighlightText(e.target.value)}
                aria-label="Custom color"
                className="absolute inset-0 size-full opacity-0 cursor-pointer border-none bg-transparent p-0"
              />
            </span>
          </div>
        </SettingRow>
        <SettingRow label="Background opacity" hint="Transparency of the highlight background.">
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={highlightOpacity}
              onChange={e => setHighlightOpacity(Number(e.target.value))}
              className="w-30 accent-theme-blue cursor-pointer"
            />
            <span className="text-ui-xs text-theme-text-muted w-9 [font-variant-numeric:tabular-nums]">
              {highlightOpacity}%
            </span>
          </div>
        </SettingRow>
        <SettingRow label="Corner radius" hint="Roundness of the highlight's corners.">
          <div className="flex items-center gap-2">
            <input
              type="range"
              min={0}
              max={12}
              step={1}
              value={highlightRadius}
              onChange={e => setHighlightRadius(Number(e.target.value))}
              className="w-30 accent-theme-blue cursor-pointer"
            />
            <span className="text-ui-xs text-theme-text-muted w-9 [font-variant-numeric:tabular-nums]">
              {highlightRadius}px
            </span>
          </div>
        </SettingRow>
        <SettingRow
          label="Preview"
          hint="Live preview and contrast, with background opacity composited over the panel."
        >
          <div className="flex items-center gap-2">
            <span
              className="font-mono text-ui-xs px-1"
              style={{
                background: `${highlightBg}${Math.round((highlightOpacity / 100) * 255)
                  .toString(16)
                  .padStart(2, '0')}`,
                color: highlightText,
                borderRadius: highlightRadius,
              }}
            >
              match
            </span>
            {(() => {
              const ratio = contrastRatio(effectiveBg, highlightText)
              const rating = contrastRating(ratio)
              return (
                <span className="flex items-center gap-1 text-ui-xs text-theme-text-muted">
                  {formatRatio(ratio)}:1
                  <span className="font-semibold" style={{ color: rating.color }}>
                    {rating.label}
                  </span>
                </span>
              )
            })()}
          </div>
        </SettingRow>
      </SettingGroup>
    </div>
  )
}

function FlowStoriesSection() {
  const {
    strictMode,
    setStrictMode,
    showHints,
    setShowHints,
    blindMode,
    setBlindMode,
    divergedHint,
    setDivergedHint,
    showWrongClickHighlight,
    setShowWrongClickHighlight,
    wrongClickColor,
    setWrongClickColor,
    hintPosition,
    setHintPosition,
  } = useFlowStorySettings()

  return (
    <div>
      <SectionHeader
        icon={<Workflow size={15} />}
        title="Flow Plans"
        description="Control how flowStory playback is gated, hinted, and displayed."
      />

      <SettingGroup title="Playback">
        <SettingRow label="Strict Mode" hint="Block taps that don't match the planned step.">
          <Toggle size="sm" checked={strictMode} onChange={() => setStrictMode(!strictMode)} />
        </SettingRow>
        <SettingRow
          label="Show Hints"
          hint="Highlight the planned element and show the action caption."
        >
          <Toggle size="sm" checked={showHints} onChange={() => setShowHints(!showHints)} />
        </SettingRow>
        <SettingRow
          label="Blind / Test Mode"
          hint="Hide all hints; show a pass/fail summary when the flow completes."
        >
          <Toggle size="sm" checked={blindMode} onChange={() => setBlindMode(!blindMode)} />
        </SettingRow>
        <SettingRow
          label="Diverged Hint"
          hint="In Blind Mode, show a soft warning after a delay if you've wandered off the planned path."
        >
          <Toggle
            size="sm"
            checked={divergedHint}
            onChange={() => setDivergedHint(!divergedHint)}
          />
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="Appearance">
        <SettingRow
          label="Show Wrong-Click Highlight"
          hint="Glow the element you tapped when it wasn't the planned one."
        >
          <Toggle
            size="sm"
            checked={showWrongClickHighlight}
            onChange={() => setShowWrongClickHighlight(!showWrongClickHighlight)}
          />
        </SettingRow>
        <SettingRow label="Wrong-Click Color" hint="Color used for the wrong-click glow.">
          <div className="flex items-center gap-1.5">
            {WRONG_CLICK_SWATCHES.map(s => (
              <button
                key={s.value}
                onClick={() => setWrongClickColor(s.value)}
                title={s.value}
                aria-label={s.value}
                className="rounded-full cursor-pointer size-4.5"
                style={{
                  background: s.hex,
                  border:
                    wrongClickColor === s.value
                      ? '2px solid var(--color-theme-text-primary)'
                      : '2px solid transparent',
                  outline: wrongClickColor === s.value ? '1px solid ' + s.hex : 'none',
                  outlineOffset: 1,
                }}
              />
            ))}
          </div>
        </SettingRow>
        <SettingRow label="Hint Position" hint="Where the action caption and toasts render.">
          <SegmentedControl
            value={hintPosition}
            onChange={v => setHintPosition(v as 'top' | 'bottom')}
            options={['top', 'bottom']}
            style={{ width: 140 }}
          />
        </SettingRow>
      </SettingGroup>
    </div>
  )
}

function FeedbackSection({ ctx }: { ctx: ActionCtx }) {
  const { lastReviewerName, setLastReviewerName } = useFeedback()
  const [name, setName] = useState(lastReviewerName)

  const commitName = useCallback(() => {
    setLastReviewerName(name.trim())
  }, [name, setLastReviewerName])

  return (
    <div>
      <SectionHeader
        icon={<MessageSquare size={15} />}
        title="Feedback"
        description="Comment identity and cloud sync preferences."
      />

      <SettingGroup title="Identity">
        <SettingRow label="Your name" hint="Pre-fills the reviewer name when exporting feedback.">
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            onBlur={commitName}
            onKeyDown={e => {
              if (e.key === 'Enter') commitName()
            }}
            placeholder="Your name"
            style={{ width: 180 }}
          />
        </SettingRow>
      </SettingGroup>

      {ctx.cloudSyncSlot && (
        <SettingGroup title="Cloud sync">
          <SettingRow label={ctx.cloudSyncSlot.label} hint={ctx.cloudSyncSlot.hint}>
            <Toggle
              size="sm"
              checked={ctx.cloudSyncSlot.enabled}
              onChange={ctx.cloudSyncSlot.toggle}
            />
          </SettingRow>
        </SettingGroup>
      )}
    </div>
  )
}

function SessionsSection({ ctx }: { ctx: ActionCtx }) {
  const { settings, saveSettings } = useSessionSettings()

  function set<K extends keyof typeof settings>(key: K, value: (typeof settings)[K]) {
    saveSettings({ ...settings, [key]: value })
  }

  return (
    <div>
      <SectionHeader
        icon={<Video size={15} />}
        title="Session Recording"
        description="Control how sessions are captured and what data is collected."
      />

      <SettingGroup title="Recording">
        <SettingRow
          label="Enable session recording"
          hint="Shows the Sessions tab and recording controls in the panel."
        >
          <Toggle
            size="sm"
            checked={ctx.showSessionsFeature}
            onChange={ctx.toggleSessionsFeature}
          />
        </SettingRow>
        <SettingRow
          label="Auto-record on flow play"
          hint="Starts a session automatically when a flow is played."
        >
          <Toggle size="sm" checked={ctx.autoRecordOnPlay} onChange={ctx.toggleAutoRecordOnPlay} />
        </SettingRow>
        <SettingRow
          label="Session name template"
          hint="Use {date} as a placeholder for the current date/time."
        >
          <Input
            value={settings.nameTemplate}
            onChange={e => set('nameTemplate', e.target.value)}
            placeholder="Session · {date}"
            style={{ width: 200 }}
          />
        </SettingRow>
        <SettingRow
          label="Quality threshold"
          hint="Minimum score (0–100) for a session to be kept."
        >
          <Select
            value={String(settings.qualityThreshold)}
            onChange={e => set('qualityThreshold', Number(e.target.value))}
            style={{ width: 130 }}
          >
            <option value="0">Off (keep all)</option>
            <option value="20">Low (20)</option>
            <option value="40">Medium (40)</option>
            <option value="60">High (60)</option>
            <option value="80">Strict (80)</option>
          </Select>
        </SettingRow>
      </SettingGroup>

      <SettingGroup title="Data channels">
        <SettingRow
          label="Cursor tracking"
          hint="Records cursor position samples throughout the session."
        >
          <Toggle
            size="sm"
            checked={settings.cursorTracking}
            onChange={() => set('cursorTracking', !settings.cursorTracking)}
          />
        </SettingRow>
        <SettingRow
          label="Cursor sampling rate"
          hint="How often cursor position is sampled (ms). Lower = denser data."
        >
          <Select
            value={String(settings.cursorSamplingRateMs)}
            onChange={e => set('cursorSamplingRateMs', Number(e.target.value))}
            style={{ width: 130 }}
          >
            <option value="16">16 ms (~60/s)</option>
            <option value="50">50 ms (~20/s)</option>
            <option value="100">100 ms (~10/s)</option>
            <option value="250">250 ms (~4/s)</option>
          </Select>
        </SettingRow>
        <SettingRow label="Interaction effects" hint="Logs tap/click effects and transitions.">
          <Toggle
            size="sm"
            checked={settings.effects}
            onChange={() => set('effects', !settings.effects)}
          />
        </SettingRow>
        <SettingRow label="State changes" hint="Records db state mutations as session events.">
          <Toggle
            size="sm"
            checked={settings.stateChanges}
            onChange={() => set('stateChanges', !settings.stateChanges)}
          />
        </SettingRow>
        <SettingRow
          label="Simulator changes"
          hint="Logs device, orientation, and accessibility changes."
        >
          <Toggle
            size="sm"
            checked={settings.simulatorChanges}
            onChange={() => set('simulatorChanges', !settings.simulatorChanges)}
          />
        </SettingRow>
        <SettingRow
          label="Hover events"
          hint="Logs hover interactions. Increases session size noticeably."
        >
          <Toggle
            size="sm"
            checked={settings.hoverEvents}
            onChange={() => set('hoverEvents', !settings.hoverEvents)}
          />
        </SettingRow>
        <SettingRow
          label="Frustrated clicks"
          hint="Detects rapid repeated clicks on the same target."
        >
          <Toggle
            size="sm"
            checked={settings.frustratedClicks}
            onChange={() => set('frustratedClicks', !settings.frustratedClicks)}
          />
        </SettingRow>
      </SettingGroup>
    </div>
  )
}

// ── Sidebar nav ────────────────────────────────────────────────────────────────

const SECTIONS: Section[] = [
  { id: 'interface', label: 'Interface', icon: <SlidersHorizontal size={14} /> },
  { id: 'panel', label: 'Panel', icon: <LayoutPanelLeft size={14} /> },
  { id: 'flowStories', label: 'Flow Plans', icon: <Workflow size={14} /> },
  { id: 'feedback', label: 'Feedback', icon: <MessageSquare size={14} /> },
  { id: 'sessions', label: 'Sessions', icon: <Video size={14} /> },
  { id: 'debug', label: 'Debug', icon: <Bug size={14} /> },
]

function SidebarNav({
  active,
  onSelect,
}: {
  active: SectionId
  onSelect: (id: SectionId) => void
}) {
  return (
    <nav className="w-42 shrink-0 flex flex-col border-r border-theme-border p-2 bg-theme-elevated">
      {SECTIONS.map(s => {
        const isActive = s.id === active
        return (
          <button
            key={s.id}
            onClick={() => onSelect(s.id)}
            className={`flex items-center gap-2.25 py-1.75 px-2.5 rounded-[7px] border-none cursor-pointer text-ui-sm text-left w-full transition-[background,color] duration-[0.12s] outline-none ${isActive ? 'bg-theme-hover text-theme-text-primary font-semibold' : 'bg-transparent text-theme-text-secondary font-normal'}`}
          >
            <span
              className="flex shrink-0"
              style={{
                color: isActive ? 'var(--color-theme-blue)' : 'var(--color-theme-text-muted)',
              }}
            >
              {s.icon}
            </span>
            {s.label}
          </button>
        )
      })}
    </nav>
  )
}

// ── Root ───────────────────────────────────────────────────────────────────────

interface Props {
  onClose: () => void
  ctx: ActionCtx
  initialSection?: SectionId
}

export default function Settings({ onClose, ctx, initialSection = 'interface' }: Props) {
  const [active, setActive] = useState<SectionId>(initialSection)

  const panel = {
    interface: <InterfaceSection ctx={ctx} />,
    panel: <PanelSection />,
    flowStories: <FlowStoriesSection />,
    feedback: <FeedbackSection ctx={ctx} />,
    sessions: <SessionsSection ctx={ctx} />,
    debug: <DebugSection />,
  }[active]

  return (
    <OverlayShell onClose={onClose} width={720} height={540}>
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-theme-border bg-theme-elevated shrink-0">
        <span className="text-ui-sm font-bold text-theme-text-primary">Settings</span>
        <button
          onClick={onClose}
          className="flex items-center justify-center rounded-md border-none bg-transparent cursor-pointer text-theme-text-muted size-6.5"
        >
          <X size={14} />
        </button>
      </div>

      {/* Sidebar + Body */}
      <div className="flex flex-1 overflow-hidden min-h-0">
        <SidebarNav active={active} onSelect={setActive} />
        <div className="flex-1 overflow-y-auto py-3 px-4">{panel}</div>
      </div>
    </OverlayShell>
  )
}
