import { useEffect, useState } from 'react'

// ── useFlowplanElementCheck ──────────────────────────────────────────────────────
//
// Authoring-time diagnostic: a flowStory step's `on` field names a DOM element id
// the screen is expected to render. If the screen never actually sets that id
// (author forgot it, renamed it, or the screen's advance button uses custom
// logic instead), the step silently degrades to "off-script on every tap" —
// nothing errors, so the mismatch was previously invisible.
//
// Deliberately independent of Show Hints / Blind Mode — a broken authoring
// contract is a signal for the AUTHOR, not a hint for the tester, so it must
// stay visible even when hints are off.
//
// Surfaces in two places (both dev-only, per FlowMaster's isDev-gated render):
//   1. console.warn — for terminal/IDE visibility while developing.
//   2. a boolean return value FlowMaster renders as a small in-app banner when
//      the broken step is actually reached during playback.

export interface FlowplanElementCheckResult {
  /** True when `on` is set but no matching element exists on the active screen. */
  missing: boolean
}

export function useFlowplanElementCheck(
  screenContainerRef: React.RefObject<HTMLElement | null>,
  params: {
    flowplanId?: string
    stepIndex: number
    pageId: string
    on: string | undefined
  }
): FlowplanElementCheckResult {
  const { flowplanId, stepIndex, pageId, on } = params
  const [missing, setMissing] = useState(false)

  useEffect(() => {
    // setMissing must only be called from a callback, never synchronously in
    // the effect body — schedule it as a zero-delay callback (same pattern as
    // the Diverged Hint timer in FlowMaster.tsx).
    const t = setTimeout(() => {
      if (!on) {
        setMissing(false)
        return
      }
      const el = screenContainerRef.current?.querySelector(`#${CSS.escape(on)}`)
      const isMissing = !el
      setMissing(isMissing)
      if (isMissing && import.meta.env.DEV) {
        console.warn(
          `[Flowkit] flowStory "${flowplanId ?? '?'}" step ${stepIndex + 1} expects ` +
            `#${on} on screen "${pageId}" but no matching element exists. ` +
            `Add id="${on}" to the element that should advance this step, or update ` +
            `the flowStory's "on" field to match the screen's real element id.`
        )
      }
    }, 0)
    return () => clearTimeout(t)
  }, [screenContainerRef, flowplanId, stepIndex, pageId, on])

  return { missing }
}
