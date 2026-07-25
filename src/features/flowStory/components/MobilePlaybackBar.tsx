import { Square } from 'lucide-react'

import { useFlowPlaybackOptional } from '../FlowPlaybackContext'
import { useFlowStorySettings } from '../FlowStorySettingsContext'

// ── MobilePlaybackBar ───────────────────────────────────────────────────────────
//
// Mobile has no equivalent to the desktop Stories header's Play/Stop button
// (no side panel visible during playback) — this sticky bar is the mobile Stop
// control the flowStory playback settings work asked for. Rendered only while a
// flowStory is actively gating; lands the user on the generic (non-flowStory)
// version of the current screen, same landing behavior as the desktop Stop
// button (see FlowLibrary.tsx's onStop).

interface MobilePlaybackBarProps {
  onStop: () => void
}

export default function MobilePlaybackBar({ onStop }: MobilePlaybackBarProps) {
  const playback = useFlowPlaybackOptional()
  const { showHints, setShowHints } = useFlowStorySettings()

  if (!playback?.isGating) return null

  return (
    <div
      className="fixed top-4 inset-x-4 z-100 flex items-center justify-between gap-2 px-3 py-2 rounded-full pointer-events-auto"
      style={{
        background: 'rgba(17,17,20,0.82)',
        backdropFilter: 'blur(10px)',
        border: '1px solid rgba(255,255,255,0.12)',
      }}
    >
      <span className="flex items-center gap-1.5 text-ui-xs font-semibold text-white/70">
        <span className="rounded-full bg-[#6366f1] animate-pulse size-1.5" />
        FlowStory playing
      </span>
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => setShowHints(!showHints)}
          className="text-ui-2xs font-semibold px-2.5 py-1 rounded-full"
          style={{
            background: showHints ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.08)',
            color: showHints ? '#a5b4fc' : 'rgba(255,255,255,0.6)',
          }}
        >
          Hints
        </button>
        <button
          onClick={onStop}
          className="flex items-center gap-1 text-ui-2xs font-semibold px-2.5 py-1 rounded-full"
          style={{ background: 'rgba(239,68,68,0.85)', color: '#fff' }}
        >
          <Square size={10} />
          Stop
        </button>
      </div>
    </div>
  )
}
