import type { ChapterConfig, Hotspot, PageProps } from '@flowkit/types/index'
import type { CompiledFlowStory } from '@flowkit-features/flow-library'
import { useFlowStorySettings } from '@flowkit-features/flowStory/FlowStorySettingsContext'
import { useFlowPlaybackOptional } from '@flowkit-features/flowStory/FlowPlaybackContext'
import { useFlowStoryElementCheck } from '@flowkit-features/flowStory/useFlowStoryElementCheck'
import { useSessionRecorderOptional } from '@flowkit-features/flowTracer/context'
import PanelErrorBoundary from '@flowkit-shared/components/errors/PanelErrorBoundary'
import { type FlowNavContextValue, FlowNavCtx } from '@flowkit-shared/contexts/FlowNavContext'
import { useTheme } from '@flowkit-shared/contexts/ThemeContext'
import { useSwipeGesture } from '@flowkit-shared/utils/useSwipeGesture'
import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'

import { ANIM_DURATION, type FlowStoryGate, useFlowEngine } from './FlowEngine'

const WRONG_CLICK_HEX: Record<string, string> = {
  orange: '#f97316',
  red: '#ef4444',
  purple: '#a855f7',
  yellow: '#eab308',
}

export default function FlowMaster({ flow }: { flow: ChapterConfig }) {
  const { theme } = useTheme()

  // ─── FlowStory playback integration ───────────────────────────────────────────
  // A compiled flowStory carries a `__flowStory` field; flows without it leave
  // the entire playback branch dormant. Derived from `flow` directly (not from
  // the engine's activePageId) so this is available BEFORE useFlowEngine is
  // called — the engine needs currentOn/currentNext/strictMode to build its gate.
  const flowStory = (flow as Partial<CompiledFlowStory>).__flowStory
  const playback = useFlowPlaybackOptional()
  const {
    strictMode,
    showHints,
    blindMode,
    divergedHint,
    showWrongClickHighlight,
    wrongClickColor,
    hintPosition,
  } = useFlowStorySettings()

  // The engine needs the flowStory gate (which depends on the CURRENT step, i.e.
  // activePageId) but activePageId is only known once the engine itself has
  // run. Broken via a ref: the gate reads the latest resolved step off a ref that
  // FlowMaster updates every render (see the sync effect below), so the engine
  // always has a fresh gate without a circular render dependency or a second
  // hook instance. useFlowEngine's activePageId is read via engine.activePageId
  // AFTER the single hook call below; the ref exists solely so `commitNavigation`
  // (built during THIS call to useFlowEngine) can look up an up-to-date step.
  const currentStepRef = useRef<{
    currentOn?: string
    currentNext: CompiledFlowStory['__flowStory']['steps'][number]['next'] | undefined
  }>({ currentOn: undefined, currentNext: undefined })

  const flowStoryGate: FlowStoryGate | null = useMemo(() => {
    if (!flowStory) return null
    return {
      get currentOn() {
        return currentStepRef.current.currentOn
      },
      get currentNext() {
        return currentStepRef.current.currentNext
      },
      strictMode,
    }
  }, [flowStory, strictMode])

  // Blind Mode: hold the completion navigate-away for a few seconds so the
  // pass/fail summary below has a visible render window — without this,
  // navigateTo fires synchronously in the same tick as the completion
  // transitionLog entry and FlowMaster unmounts before anything can render.
  const engine = useFlowEngine(flow, {
    flowStoryGate,
    completionDelayMs: flowStory && blindMode ? 4000 : 0,
  })
  const {
    activeScreenIndex,
    activeScreen,
    activePageId,
    localState,
    transitionLog,
    animClass,
    isAllowed,
    screenContainerRef,
    resetEngine,
    commitNavigation,
    fireRule,
    getRulesFor,
    onAction,
    skipToLast,
    setIsAutoPlayPaused,
    history,
  } = engine

  // The current flowStory step, derived SYNCHRONOUSLY from activePageId + the
  // compiled step list (FlowMaster is the source of truth for the active screen;
  // the context never looks the step up itself). Used by the patch effect, the
  // gating handler, and the actionNote caption.
  const currentStepIndex = flowStory
    ? flowStory.steps.findIndex(s => s.pageId === activePageId)
    : -1
  const currentStep =
    flowStory && currentStepIndex >= 0 ? flowStory.steps[currentStepIndex] : undefined

  // Planned advance element id / target for the current step (undefined = tap-
  // anywhere). Synced onto currentStepRef via useLayoutEffect (never mutate a
  // ref during render) — must be current before the next paint/interaction so
  // the gate object built above (whose identity is stable across renders)
  // always resolves the CURRENT step when commitNavigation reads it.
  const currentOn = flowStory ? currentStep?.on : undefined
  const currentNext = flowStory ? currentStep?.next : undefined
  useLayoutEffect(() => {
    currentStepRef.current = { currentOn, currentNext }
  }, [currentOn, currentNext])

  // Authoring diagnostic — independent of Show Hints/Blind Mode, since a
  // broken flowStory↔screen id contract is a signal for the author, not a
  // hint for the tester. See useFlowStoryElementCheck for the full rationale.
  const { missing: elementCheckMissing } = useFlowStoryElementCheck(screenContainerRef, {
    flowStoryId: flowStory?.flowStoryId,
    stepIndex: currentStepIndex,
    pageId: activePageId,
    on: currentOn,
  })

  // ── Per-step db patch: when the active screen changes during flowStory
  // playback, apply that step's db patch (silently) + advance currentStep.
  const applyStep = playback?.applyStep
  useEffect(() => {
    if (!flowStory || !applyStep || currentStepIndex < 0) return
    applyStep(currentStepIndex, currentStep?.db)
    // currentStep is derived from flowStory + currentStepIndex which are already
    // in deps — including it would be redundant and cause a double-apply.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowStory, applyStep, currentStepIndex])

  // ── Restart coordination: FlowPlaybackContext increments restartSignal when
  // restart() is called. FlowMaster is the coordinator — it owns the engine
  // reference, so it is the only place that can call engine.resetEngine().
  const restartSignal = playback?.restartSignal ?? 0
  useEffect(() => {
    if (!flowStory || restartSignal === 0) return
    resetEngine()
    // resetEngine and flowStory intentionally omitted — restartSignal is the
    // sole trigger; adding resetEngine would fire on every engine identity change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [restartSignal])

  // ── Off-script feedback (gating): a non-blocking toast shown briefly when a
  // tap during playback lands outside the step's planned element. The glow
  // color is configurable (wrongClickColor); visibility is a separate toggle
  // (showWrongClickHighlight) from the toast itself — the toast/blocking still
  // happens even with the highlight off, only the glow is suppressed.
  const [offScript, setOffScript] = useState(false)
  const offScriptTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const offScriptElTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const flashOffScript = useCallback(
    (el: HTMLElement | null) => {
      if (el && showWrongClickHighlight && !blindMode) {
        el.style.setProperty('--fm-offscript-color', WRONG_CLICK_HEX[wrongClickColor])
        el.setAttribute('data-off-script', 'true')
        if (offScriptElTimerRef.current) clearTimeout(offScriptElTimerRef.current)
        offScriptElTimerRef.current = setTimeout(() => {
          if (el.isConnected) {
            el.removeAttribute('data-off-script')
          }
        }, 300)
      }
      // The toast (`offScript` state) itself is Show Hints/Blind Mode aware —
      // suppressed entirely in Blind Mode (see the JSX render guard below).
      setOffScript(true)
      if (offScriptTimerRef.current) clearTimeout(offScriptTimerRef.current)
      offScriptTimerRef.current = setTimeout(() => setOffScript(false), 1500)
    },
    [showWrongClickHighlight, wrongClickColor, blindMode]
  )
  useEffect(
    () => () => {
      if (offScriptTimerRef.current) clearTimeout(offScriptTimerRef.current)
      if (offScriptElTimerRef.current) clearTimeout(offScriptElTimerRef.current)
    },
    []
  )

  // ── Planned-element highlight (Show Hints): a persistent (not one-shot) glow
  // on the element the current step expects to be tapped. Unlike flashOffScript,
  // this must have explicit cleanup tied to element identity — activePageId is
  // in the deps (even though currentOn derives from it) so cleanup-then-reapply
  // happens on every screen transition, not just when the currentOn string value
  // differs. Without this, a Hotspot button (outside the per-screen
  // PanelErrorBoundary remount boundary) or a reused ScreenComp could keep a
  // stale glow after the plan has moved past that element.
  useEffect(() => {
    if (!flowStory || blindMode || !showHints || !currentOn) return
    const el = screenContainerRef.current?.querySelector<HTMLElement>(`#${CSS.escape(currentOn)}`)
    el?.classList.add('fm-planned-highlight')
    return () => el?.classList.remove('fm-planned-highlight')
  }, [flowStory, showHints, blindMode, currentOn, activePageId, screenContainerRef])

  // ── Diverged Hint (Blind Mode only): a soft, low-emphasis warning shown after
  // a delay of no progress toward the next planned step. Must resolve
  // currentStep.next fresh (calling it if it's a fork resolver function) rather
  // than indexing flowStory.steps[currentStepIndex + 1] positionally — the "+1"
  // entry in the flattened steps array is not necessarily where a forking
  // branch would actually route to.
  const [diverged, setDiverged] = useState(false)
  const divergedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const divergedResetRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(() => {
    // setDiverged must only be called from a callback (setTimeout), never
    // synchronously in the effect body — schedule the "clear" as a zero-delay
    // callback rather than calling it directly here.
    if (divergedResetRef.current) clearTimeout(divergedResetRef.current)
    divergedResetRef.current = setTimeout(() => setDiverged(false), 0)
    if (divergedTimerRef.current) clearTimeout(divergedTimerRef.current)
    if (!flowStory || !blindMode || !divergedHint || currentNext === undefined) return
    const expectedNext =
      typeof currentNext === 'function'
        ? currentNext({ db: engine.buildCtx().db, flowState: localState })
        : currentNext
    divergedTimerRef.current = setTimeout(() => {
      if (activePageId !== expectedNext) setDiverged(true)
    }, 9000)
    return () => {
      if (divergedTimerRef.current) clearTimeout(divergedTimerRef.current)
      if (divergedResetRef.current) clearTimeout(divergedResetRef.current)
    }
    // engine/localState/db intentionally omitted from the trigger set — this
    // timer should reset only on genuine progress (activePageId change) or
    // relevant setting changes, not on every localState mutation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowStory, blindMode, divergedHint, currentNext, activePageId])

  // ── Blind Mode pass/fail: edge-validity check against the compiled step
  // graph, NOT a linear sequence diff — flowStory.steps is a flattened array
  // containing every fork branch's steps concatenated, so there is no single
  // canonical "planned sequence" to diff history against once forks exist. For
  // each consecutive pair in the actual recorded history, verify some step
  // with that pageId resolves (fresh, at verdict time) to the next pageId.
  const blindModeVerdict = useMemo(() => {
    if (!flowStory || !blindMode) return null
    for (let i = 0; i < history.length - 1; i++) {
      const from = history[i]
      const to = history[i + 1]
      const step = flowStory.steps.find(s => s.pageId === from)
      if (!step) return { pass: false, reason: `"${from}" is not a step in this flowStory.` }
      const resolved =
        typeof step.next === 'function'
          ? step.next({ db: engine.buildCtx().db, flowState: localState })
          : step.next
      if (resolved !== to) {
        return { pass: false, reason: `Unexpected path: "${from}" → "${to}".` }
      }
    }
    return { pass: true, reason: 'Followed a valid path through the flowStory.' }
    // engine/localState omitted — verdict only needs to reflect the final
    // recorded history once completion fires (transitionLog gains the
    // '[Flow Completed]' entry); it is not meant to track flowState drift.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [flowStory, blindMode, history])
  // Completion is only knowable from the transitionLog's terminal marker —
  // history itself never records it (the flow just stops advancing).
  const isFlowComplete = useMemo(
    () => transitionLog.some(e => e.toPage === '[Flow Completed]'),
    [transitionLog]
  )

  // ─── FlowNavCtx — programmatic nav from screens goes through commitNavigation
  const flowNavValue = useMemo(
    (): FlowNavContextValue => ({
      navigateTo: (target: string) => {
        const timestamp = new Date().toLocaleTimeString()
        commitNavigation(target, 'none', timestamp, `programmatic → ${target}`, [])
      },
      goNext: () => {
        const timestamp = new Date().toLocaleTimeString()
        commitNavigation('next', 'none', timestamp, 'goNext()', [])
      },
      goBack: () => {
        const timestamp = new Date().toLocaleTimeString()
        commitNavigation('back', 'none', timestamp, 'goBack()', [])
      },
      isChapter: true,
      flowState: localState,
    }),
    [commitNavigation, localState]
  )

  // ─── Cursor sampler + recorder ───────────────────────────────────────────
  const recorderOpt = useSessionRecorderOptional()

  // ─── Event delegation — click / double-click ──────────────────────────────
  const handleContainerClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>, isDouble = false) => {
      // ── FlowStory advancement is driven ENTIRELY by the current step (not the
      // engine's interactions map, which keys on element id and would collide
      // when the same screen/element appears at two journey positions, e.g. a
      // ref'd flow). Resolve the advance target from currentNext; forks resolve
      // via the function form.
      if (flowStory && currentNext !== undefined) {
        const advance = () => {
          const timestamp = new Date().toLocaleTimeString()
          const target =
            typeof currentNext === 'function'
              ? currentNext({ db: engine.buildCtx().db, flowState: localState })
              : currentNext
          commitNavigation(target, 'none', timestamp, 'tap', [])
        }
        if (currentOn === undefined) {
          // Tap-anywhere step.
          advance()
          return
        }
        // Step with a planned element: advance only if the tap hit it (or a
        // descendant); otherwise it's off-script.
        let n = e.target as HTMLElement | null
        while (n && n !== e.currentTarget) {
          if (n.id === currentOn) {
            e.stopPropagation()
            setIsAutoPlayPaused(true)
            advance()
            return
          }
          n = n.parentElement
        }
        flashOffScript(e.target as HTMLElement)
        return
      }
      if (!flow.interactions) {
        const timestamp = new Date().toLocaleTimeString()
        commitNavigation('next', 'none', timestamp, 'tap', [])
        return
      }
      let node = e.target as HTMLElement | null
      let nearestFkId: string | null = null
      while (node && node !== e.currentTarget) {
        // Capture nearest data-fk-id as we walk up
        if (!nearestFkId && node.dataset.fkId) nearestFkId = node.dataset.fkId
        const id = node.id
        if (id) {
          const trigger = isDouble ? 'double-tap' : 'tap'
          const rules = getRulesFor(id, trigger)
          if (rules.length > 0) {
            e.stopPropagation()
            setIsAutoPlayPaused(true)
            rules.forEach(r => fireRule(r, id, trigger))
            return
          }
        }
        node = node.parentElement
      }
      // No rule matched — frustrated click (legacy flows only; flowStories return
      // above and never reach here).
      recorderOpt?.logEvent('interaction.frustrated-click', {
        x: e.clientX,
        y: e.clientY,
        pageId: activePageId,
        flowId: flow.id,
        ...(nearestFkId ? { elementId: nearestFkId } : {}),
      })
    },
    // flow.id omitted — it is structurally stable for the lifetime of a flow
    // instance; only flow.interactions drives re-computation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      flow.interactions,
      getRulesFor,
      fireRule,
      commitNavigation,
      setIsAutoPlayPaused,
      recorderOpt,
      activePageId,
      flowStory,
      currentOn,
      currentNext,
      flashOffScript,
      localState,
    ]
  )

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => handleContainerClick(e, true),
    [handleContainerClick]
  )

  // ─── Hover ────────────────────────────────────────────────────────────────
  const handleMouseOver = useCallback(
    (e: React.MouseEvent<HTMLDivElement>) => {
      if (!flow.interactions) return
      let node = e.target as HTMLElement | null
      while (node && node !== e.currentTarget) {
        const id = node.id
        if (id) {
          const rules = getRulesFor(id, 'hover')
          if (rules.length > 0) {
            rules.forEach(r => fireRule(r, id, 'hover'))
            return
          }
        }
        node = node.parentElement
      }
    },
    [flow.interactions, getRulesFor, fireRule]
  )

  // ─── Swipe gestures ───────────────────────────────────────────────────────
  useSwipeGesture(screenContainerRef, direction => {
    const triggerName = `swipe-${direction}`
    const timestamp = new Date().toLocaleTimeString()
    // Check if any element id has a matching swipe rule; otherwise default swipe-left → next
    const allIds = Object.keys(flow.interactions ?? {})
    for (const id of allIds) {
      const rules = getRulesFor(id, triggerName)
      if (rules.length > 0) {
        rules.forEach(r => fireRule(r, id, triggerName))
        return
      }
    }
    if (direction === 'left') commitNavigation('next', 'slide-left', timestamp, triggerName, [])
    if (direction === 'right') commitNavigation('back', 'slide-right', timestamp, triggerName, [])
  })

  // ─── Cursor sampling (rAF, only when channel enabled) ────────────────────
  const cursorPosRef = useRef<{ x: number; y: number } | null>(null)

  useEffect(() => {
    function onMouseMove(e: MouseEvent) {
      cursorPosRef.current = { x: e.clientX, y: e.clientY }
    }
    window.addEventListener('mousemove', onMouseMove)
    return () => window.removeEventListener('mousemove', onMouseMove)
  }, [])

  useEffect(() => {
    if (!recorderOpt?.channels.cursorTracking) return
    if (recorderOpt.state !== 'recording') return
    const rec = recorderOpt

    let rafId: number
    let lastTick = 0
    function tick(now: number) {
      rafId = requestAnimationFrame(tick)
      // Skip layout reads most frames — the recorder throttles persistence, but
      // there's no point measuring 60×/sec. ~30fps is finer than any sane rate.
      if (now - lastTick < 33) return
      lastTick = now
      const pos = cursorPosRef.current
      const el = screenContainerRef.current
      if (!pos || !el) return
      const rect = el.getBoundingClientRect()
      const x = pos.x - rect.left
      const y = pos.y - rect.top
      if (x < 0 || y < 0 || x > rect.width || y > rect.height) return
      rec.logCursorSample({
        x,
        y,
        screenW: rect.width,
        screenH: rect.height,
        pageId: activePageId,
        timestamp: performance.now(),
      })
    }
    rafId = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(rafId)
  }, [recorderOpt, screenContainerRef, activePageId])

  // ─── Guard / null checks ──────────────────────────────────────────────────
  if (!isAllowed || !activeScreen) return null

  const screenProps: PageProps = {
    onAction,
    onNext: () => onAction('next'),
    onBack: () => onAction('back'),
    isChapter: true,
    state: localState,
    db: engine.buildCtx().db,
  }

  const isFirst = activeScreenIndex === 0
  const isLast = activeScreenIndex === flow.pages.length - 1
  const ScreenComp = activeScreen.component as React.ComponentType<PageProps>
  const hotspots: Hotspot[] = activeScreen.hotspots ?? []

  return (
    <>
      {/* Screen transition keyframes */}
      <style>{`
        @keyframes fm-fade-in        { from{opacity:0}                          to{opacity:1} }
        @keyframes fm-fade-out       { from{opacity:1}                          to{opacity:0} }
        @keyframes fm-slide-in-left  { from{transform:translateX(100%)}         to{transform:translateX(0)} }
        @keyframes fm-slide-out-left { from{transform:translateX(0)}            to{transform:translateX(-30%)} }
        @keyframes fm-slide-in-right { from{transform:translateX(-100%)}        to{transform:translateX(0)} }
        @keyframes fm-slide-out-right{ from{transform:translateX(0)}            to{transform:translateX(30%)} }
        @keyframes fm-slide-in-up    { from{transform:translateY(100%)}         to{transform:translateY(0)} }
        @keyframes fm-slide-out-up   { from{transform:translateY(0)}            to{transform:translateY(-30%)} }
        @keyframes fm-slide-in-down  { from{transform:translateY(-100%)}        to{transform:translateY(0)} }
        @keyframes fm-slide-out-down { from{transform:translateY(0)}            to{transform:translateY(30%)} }
        @keyframes fm-scale-in       { from{transform:scale(.92);opacity:0}     to{transform:scale(1);opacity:1} }
        @keyframes fm-scale-out      { from{transform:scale(1);opacity:1}       to{transform:scale(.92);opacity:0} }

        .fm-fade-in          { animation: fm-fade-in         ${ANIM_DURATION}ms ease both }
        .fm-fade-out         { animation: fm-fade-out        ${ANIM_DURATION}ms ease both }
        .fm-slide-in-left    { animation: fm-slide-in-left   ${ANIM_DURATION}ms cubic-bezier(.4,0,.2,1) both }
        .fm-slide-out-left   { animation: fm-slide-out-left  ${ANIM_DURATION}ms cubic-bezier(.4,0,.2,1) both }
        .fm-slide-in-right   { animation: fm-slide-in-right  ${ANIM_DURATION}ms cubic-bezier(.4,0,.2,1) both }
        .fm-slide-out-right  { animation: fm-slide-out-right ${ANIM_DURATION}ms cubic-bezier(.4,0,.2,1) both }
        .fm-slide-in-up      { animation: fm-slide-in-up     ${ANIM_DURATION}ms cubic-bezier(.4,0,.2,1) both }
        .fm-slide-out-up     { animation: fm-slide-out-up    ${ANIM_DURATION}ms cubic-bezier(.4,0,.2,1) both }
        .fm-slide-in-down    { animation: fm-slide-in-down   ${ANIM_DURATION}ms cubic-bezier(.4,0,.2,1) both }
        .fm-slide-out-down   { animation: fm-slide-out-down  ${ANIM_DURATION}ms cubic-bezier(.4,0,.2,1) both }
        .fm-scale-in         { animation: fm-scale-in        ${ANIM_DURATION}ms cubic-bezier(.4,0,.2,1) both }
        .fm-scale-out        { animation: fm-scale-out       ${ANIM_DURATION}ms cubic-bezier(.4,0,.2,1) both }

        /* Off-script tap feedback (flowStory gating) — color driven by --fm-offscript-color,
           set inline per-element in flashOffScript() from the configurable wrongClickColor. */
        @keyframes fm-offscript-pulse { 0%{outline-color:rgba(0,0,0,0)} 30%{outline-color:var(--fm-offscript-color, #ef4444)} 100%{outline-color:rgba(0,0,0,0)} }
        [data-off-script] { outline: 2px solid rgba(0,0,0,0); outline-offset: 2px; animation: fm-offscript-pulse 300ms ease both; }
        @keyframes fm-toast-in { from{opacity:0;transform:translate(-50%,8px)} to{opacity:1;transform:translate(-50%,0)} }

        /* Planned-element highlight (Show Hints) — calm, persistent, fixed blue. */
        @keyframes fm-planned-pulse { 0%,100%{outline-color:rgba(59,130,246,.55)} 50%{outline-color:rgba(59,130,246,.9)} }
        .fm-planned-highlight { outline: 2px solid rgba(59,130,246,.7) !important; outline-offset: 2px; animation: fm-planned-pulse 1.4s ease-in-out infinite; border-radius: 4px; }
      `}</style>

      <div
        ref={screenContainerRef}
        className="relative overflow-hidden size-full"
        onClick={handleContainerClick}
        onDoubleClick={handleDoubleClick}
        onMouseOver={handleMouseOver}
        // Sequential mode advances on tap-anywhere — give it a keyboard equivalent.
        {...(!flow.interactions
          ? {
              tabIndex: 0,
              role: 'button' as const,
              'aria-label': 'Flow — press Enter or Arrow Right to advance, Arrow Left to go back',
              onKeyDown: (e: React.KeyboardEvent) => {
                if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowRight') {
                  e.preventDefault()
                  onAction('next')
                } else if (e.key === 'ArrowLeft') {
                  e.preventDefault()
                  onAction('back')
                }
              },
            }
          : {})}
      >
        {/* Active screen wrapped in FlowNavCtx so useNav() works inside */}
        <FlowNavCtx.Provider value={flowNavValue}>
          <PanelErrorBoundary
            key={activePageId}
            fallback={
              <div className="flex items-center justify-center text-xs opacity-40 size-full">
                Screen crashed — check the console
              </div>
            }
            onError={(error, info) =>
              recorderOpt?.logEvent('session.error', {
                message: error.message,
                stack: error.stack,
                componentStack: info.componentStack,
                boundary: 'panel:screen',
                pageId: activePageId,
              })
            }
          >
            <div className={`flex flex-col size-full ${animClass}`}>
              <ScreenComp {...screenProps} />
            </div>
          </PanelErrorBoundary>
        </FlowNavCtx.Provider>

        {/* Hotspot overlay — real buttons so keyboard + screen-reader users can
            trigger them (the click delegation matches on node.id either way). */}
        {hotspots.map(hs => (
          <button
            key={hs.id}
            id={hs.id}
            title={hs.label}
            aria-label={hs.label || `Hotspot ${hs.id}`}
            className="absolute"
            style={{
              left: `${hs.region.x}%`,
              top: `${hs.region.y}%`,
              width: `${hs.region.w}%`,
              height: `${hs.region.h}%`,
              cursor: 'pointer',
              outline: '1.5px dashed rgba(99,102,241,0.35)',
              background: 'rgba(99,102,241,0.04)',
              borderRadius: 4,
              padding: 0,
            }}
          />
        ))}

        {/* Skip button — sequential mode only */}
        {!flow.interactions && !isFirst && !isLast && (
          <button
            onClick={e => {
              e.stopPropagation()
              skipToLast()
            }}
            className="absolute top-4 right-4 z-50 px-3 py-1.5 rounded-full text-xs font-semibold"
            style={{
              background: 'rgba(255,255,255,0.12)',
              color: 'rgba(255,255,255,0.7)',
              border: '1px solid rgba(255,255,255,0.15)',
              backdropFilter: 'blur(8px)',
            }}
          >
            Skip
          </button>
        )}

        {/* Progress dots — sequential mode only */}
        {!flow.interactions && flow.pages.length > 1 && (
          <div
            className="absolute bottom-6 flex justify-center gap-1.5 pointer-events-none inset-x-0"
            role="status"
            aria-live="polite"
            aria-label={`Step ${activeScreenIndex + 1} of ${flow.pages.length}`}
          >
            {flow.pages.map((screen, i) => (
              <div
                key={screen.id}
                className="rounded-full transition-all"
                style={{
                  width: i === activeScreenIndex ? 20 : 6,
                  height: 6,
                  background: i === activeScreenIndex ? theme.text.secondary : theme.bg.border,
                }}
              />
            ))}
          </div>
        )}

        {/* FlowStory: authoring diagnostic — visible regardless of Show Hints/
            Blind Mode (this is a signal for the author, not a playback hint),
            dev-only since it's a build-time content issue, not a runtime state
            a shipped/exported build's viewer needs to see. */}
        {flowStory && elementCheckMissing && import.meta.env.DEV && (
          <div
            className={`absolute ${hintPosition === 'top' ? 'bottom-6' : 'top-4'} left-1/2 z-50 px-3 py-1.5 rounded-full text-xs font-semibold pointer-events-none`}
            style={{
              transform: 'translateX(-50%)',
              background: '#eab308ee',
              color: '#1a1400',
              whiteSpace: 'nowrap',
            }}
            role="status"
            aria-live="polite"
          >
            ⚠ Missing #{currentOn} on this screen
          </div>
        )}

        {/* FlowStory: actionNote caption for the current step (Show Hints only,
            hidden entirely in Blind Mode) */}
        {flowStory && showHints && !blindMode && currentStep?.actionNote && (
          <div
            className={`absolute ${hintPosition === 'top' ? 'top-4' : 'bottom-6'} left-1/2 z-50 px-3 py-1.5 rounded-full text-xs font-semibold pointer-events-none`}
            style={{
              transform: 'translateX(-50%)',
              background: theme.bg.elevated + 'd9',
              color: '#fff',
              backdropFilter: 'blur(8px)',
              whiteSpace: 'nowrap',
            }}
          >
            {currentStep.actionNote}
          </div>
        )}

        {/* FlowStory: off-script / blocked toast — hidden in Blind Mode (the
            Diverged Hint toast below is Blind Mode's equivalent soft signal).
            Copy reflects whether Strict Mode actually refused the navigation
            or this is just Guided-mode advisory feedback. */}
        {flowStory && offScript && !blindMode && (
          <div
            className={`absolute ${hintPosition === 'top' ? 'top-4' : 'bottom-6'} left-1/2 z-50 px-3 py-1.5 rounded-full text-xs font-semibold pointer-events-none`}
            style={{
              transform: 'translateX(-50%)',
              background: theme.accent.red + 'eb',
              color: '#fff',
              animation: 'fm-toast-in 150ms ease both',
            }}
            role="status"
            aria-live="polite"
          >
            {strictMode ? 'Blocked — outside planned flow' : 'Outside planned flow'}
          </div>
        )}

        {/* Blind Mode: soft divergence nudge — a lower-emphasis signal than the
            Strict Mode toast above, since Blind Mode is meant to let the user
            wander before telling them anything. */}
        {flowStory && blindMode && diverged && !isFlowComplete && (
          <div
            className={`absolute ${hintPosition === 'top' ? 'top-4' : 'bottom-6'} left-1/2 z-50 px-3 py-1.5 rounded-full text-xs font-semibold pointer-events-none`}
            style={{
              transform: 'translateX(-50%)',
              background: theme.bg.elevated + 'd9',
              color: theme.accent.amber,
              border: `1px solid ${theme.accent.amber}55`,
              animation: 'fm-toast-in 150ms ease both',
            }}
            role="status"
            aria-live="polite"
          >
            Still on track?
          </div>
        )}

        {/* Blind Mode: pass/fail summary — rendered during the completionDelayMs
            window (see useFlowEngine options above) between the completion
            transitionLog entry and the actual navigate-away. */}
        {flowStory && blindMode && isFlowComplete && blindModeVerdict && (
          <div
            className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none"
            style={{ background: 'rgba(0,0,0,0.55)' }}
          >
            <div
              className="px-5 py-4 rounded-xl text-center max-w-[80%]"
              style={{ background: theme.bg.elevated, border: `1px solid ${theme.bg.border}` }}
            >
              <div
                className="text-base font-bold mb-1"
                style={{ color: blindModeVerdict.pass ? theme.accent.green : theme.accent.red }}
              >
                {blindModeVerdict.pass ? 'Pass' : 'Fail'}
              </div>
              <div className="text-xs" style={{ color: theme.text.secondary }}>
                {blindModeVerdict.reason}
              </div>
            </div>
          </div>
        )}
      </div>
    </>
  )
}
