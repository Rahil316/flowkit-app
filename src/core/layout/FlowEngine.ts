import type {
  ChapterConfig,
  InteractionCtx,
  InteractionRule,
  TransitionAnimation,
} from '@flowkit/types/index'
import { useSessionRecorderOptional } from '@flowkit-features/flowTracer/context'
import { TransitionLogEntry, useDashboard } from '@flowkit-shared/contexts/DashboardContext'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

// ─── FlowStory gating (optional — engine stays flowStory-agnostic otherwise) ────
//
// FlowMaster passes this in when the active flow is a compiled flowStory. The
// engine never imports flowStory types — it only reads the three primitives it
// needs to gate a "user"-origin navigation against the planned step.

export interface FlowStoryGate {
  /** Planned tap target element id for the current step, or undefined (tap-anywhere). */
  currentOn?: string
  /** Resolved advance target for the current step — a page id, "__complete__",
   *  or a fork resolver function called fresh at gate-check time with {db, flowState}. */
  currentNext: InteractionRule['goTo'] | undefined
  strictMode: boolean
}

export interface FlowEngineOptions {
  flowStoryGate?: FlowStoryGate | null
  /**
   * Delay (ms) before the completion navigateTo/onComplete fires, once the
   * flow reaches '__complete__' or runs out of pages on 'next'. Default 0
   * (today's synchronous behavior). FlowMaster sets this when Blind Mode is
   * active so the pass/fail summary has a visible window before FlowMaster
   * unmounts — without this, navigateTo fires in the same tick as the
   * completion transitionLog entry and there is no render opportunity at all.
   */
  completionDelayMs?: number
}

/** Distinguishes navigation the engine drives itself (auto-play/auto-advance —
 *  never gated) from navigation triggered by the user (tap/keyboard/programmatic —
 *  gated when Strict Mode is on). Defaults to 'user' so existing call sites that
 *  don't pass it keep their current (ungated unless flowStoryGate says otherwise)
 *  behavior. */
export type NavigationOrigin = 'engine' | 'user'

// ─── Animation maps (shared with FlowMaster renderer) ─────────────────────────

export const ANIM_DURATION = 280

const ANIM_CLASSES: Record<TransitionAnimation, { enter: string; exit: string }> = {
  none: { enter: '', exit: '' },
  fade: { enter: 'fm-fade-in', exit: 'fm-fade-out' },
  'slide-left': { enter: 'fm-slide-in-left', exit: 'fm-slide-out-left' },
  'slide-right': { enter: 'fm-slide-in-right', exit: 'fm-slide-out-right' },
  'slide-up': { enter: 'fm-slide-in-up', exit: 'fm-slide-out-up' },
  'slide-down': { enter: 'fm-slide-in-down', exit: 'fm-slide-out-down' },
  scale: { enter: 'fm-scale-in', exit: 'fm-scale-out' },
}

export const BACK_ANIM: Partial<Record<TransitionAnimation, TransitionAnimation>> = {
  'slide-left': 'slide-right',
  'slide-right': 'slide-left',
  'slide-up': 'slide-down',
  'slide-down': 'slide-up',
}

// ─── Engine return type ───────────────────────────────────────────────────────

export interface FlowEngineReturn {
  // State
  activePageIndex: number
  activePage: ChapterConfig['pages'][number] | undefined
  activePageId: string // T5: tags cursor.sample events
  history: string[]
  localState: Record<string, unknown>
  transitionLog: TransitionLogEntry[]
  effects: string[]
  animClass: string
  isAutoPlayPaused: boolean
  isAllowed: boolean
  autoPlay: (ChapterConfig['autoPlay'] & Record<string, unknown>) | null

  // Refs — stable identity across renders
  pageContainerRef: React.RefObject<HTMLDivElement | null> // T5: cursor listener attachment

  // Dispatch — stable, instrumented by name (T5 wires by function name, not line number)
  resetEngine: () => void
  commitNavigation: (
    target: string,
    animation: TransitionAnimation,
    timestamp: string,
    actionName: string,
    warnings: string[],
    origin?: NavigationOrigin
  ) => void
  fireRule: (rule: InteractionRule, elementId: string, triggerName: string) => void
  buildCtx: () => InteractionCtx
  getRulesFor: (elementId: string, trigger: string) => InteractionRule[]
  onAction: (actionName: string) => void
  skipToLast: () => void
  setIsAutoPlayPaused: (v: boolean) => void
  navigateToPage: (
    nextIdx: number,
    logEntry: TransitionLogEntry,
    animation?: TransitionAnimation
  ) => void
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useFlowEngine(
  chapter: ChapterConfig,
  options?: FlowEngineOptions
): FlowEngineReturn {
  const flowStoryGate = options?.flowStoryGate ?? null
  const completionDelayMs = options?.completionDelayMs ?? 0
  const completionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  useEffect(
    () => () => {
      if (completionTimerRef.current) clearTimeout(completionTimerRef.current)
    },
    []
  )
  const {
    db,
    updateDb,
    navigateTo,
    firstViewId,
    setActiveFlowDebugInfo,
    flowAutoPlayOverride,
    flowAutoPlayPaused,
    setFlowAutoPlayPaused,
  } = useDashboard()
  const recorderCtx = useSessionRecorderOptional()
  const recorderRef = useRef(recorderCtx)
  useEffect(() => {
    recorderRef.current = recorderCtx
  })
  const recorder = recorderRef

  // ─── Page lookup ─────────────────────────────────────────────────────────
  const findPageIndex = useCallback(
    (idOrLabel: string) =>
      chapter.pages.findIndex(s => s.id === idOrLabel || s.label === idOrLabel),
    [chapter.pages]
  )

  const initialPageName =
    chapter.initialPage || chapter.pages[0]?.id || chapter.pages[0]?.label || ''
  const initialIndex = findPageIndex(initialPageName)

  // ─── State ────────────────────────────────────────────────────────────────
  const [activePageIndex, setActivePageIndex] = useState(initialIndex !== -1 ? initialIndex : 0)
  const [history, setHistory] = useState<string[]>([initialPageName])
  const pageEntryTimeRef = useRef<number>(0)
  const [localState, setLocalState] = useState<Record<string, unknown>>({})
  const [transitionLog, setTransitionLog] = useState<TransitionLogEntry[]>([])
  const [effects, setEffects] = useState<string[]>([])
  const [animClass, setAnimClass] = useState('')

  const isAutoPlayPaused = flowAutoPlayPaused
  const setIsAutoPlayPaused = setFlowAutoPlayPaused

  // ─── Refs ─────────────────────────────────────────────────────────────────
  const animTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const animEndTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const autoTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const delayTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set())
  const pageContainerRef = useRef<HTMLDivElement | null>(null)
  const prevChapterRef = useRef(chapter.id)

  // ─── Merged auto-play config (runtime override wins) ──────────────────────
  const autoPlay = useMemo(() => {
    if (!chapter.autoPlay && !flowAutoPlayOverride) return null
    return { ...chapter.autoPlay, ...flowAutoPlayOverride } as FlowEngineReturn['autoPlay']
  }, [chapter.autoPlay, flowAutoPlayOverride])

  // ─── Flow-level entry guard ───────────────────────────────────────────────
  const isAllowed = useMemo(() => {
    if (chapter.canNotEnter && chapter.canNotEnter({ db })) return false
    if (chapter.canEnter && !chapter.canEnter({ db })) return false
    return true
    // flow omitted — only the guard functions and db drive re-evaluation; adding
    // the whole flow object would re-run on every unrelated flow prop change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter.canNotEnter, chapter.canEnter, db])

  useEffect(() => {
    if (!isAllowed) {
      recorder.current?.logEvent('chapter.blocked', { chapterId: chapter.id })
      navigateTo(chapter.canEnterFallback || firstViewId || 'home')
    } else {
      pageEntryTimeRef.current = performance.now()
      recorder.current?.logEvent('chapter.entered', { chapterId: chapter.id, label: chapter.label })
    }
    // Stable refs (recorder, navigateTo, flow.id) intentionally omitted — only
    // the guard result should trigger entry/redirect logic.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAllowed])

  // ─── Sync debugger ────────────────────────────────────────────────────────
  const activePage = chapter.pages[activePageIndex]
  const activePageId = activePage?.id ?? activePage?.label ?? ''
  const activePageLabel = activePageId

  useEffect(() => {
    if (!isAllowed) return
    const historyList = history.map(h => {
      const idx = findPageIndex(h)
      return idx !== -1 ? chapter.pages[idx].id || chapter.pages[idx].label : h
    })
    setActiveFlowDebugInfo({ history: historyList, state: localState, transitionLog, effects })
  }, [
    isAllowed,
    history,
    localState,
    transitionLog,
    effects,
    setActiveFlowDebugInfo,
    findPageIndex,
    chapter.pages,
  ])

  useEffect(
    () => () => {
      setActiveFlowDebugInfo(null)
    },
    [setActiveFlowDebugInfo]
  )

  // ─── Page-level entry guard ───────────────────────────────────────────────
  const pagePassesGuard = useCallback(
    (idx: number): boolean => {
      const page = chapter.pages[idx]
      if (!page?.meta) return true
      if (page.meta.canNotEnter && page.meta.canNotEnter({ db })) return false
      if (page.meta.canEnter && !page.meta.canEnter({ db })) return false
      return true
    },
    [chapter.pages, db]
  )

  // ─── Animated page transition ─────────────────────────────────────────────
  const navigateToPage = useCallback(
    (
      nextIdx: number,
      logEntry: TransitionLogEntry,
      animation: TransitionAnimation = 'none',
      historyMode: 'push' | 'pop' = 'push'
    ) => {
      const commit = () => {
        const s = chapter.pages[nextIdx]
        const name = s.id || s.label
        // Emit dwell-end for the page we're leaving
        const dwell = performance.now() - pageEntryTimeRef.current
        recorder.current?.logEvent('page.dwell-end', {
          pageId: logEntry.fromPage,
          dwellMs: Math.round(dwell),
          chapterId: chapter.id,
        })
        pageEntryTimeRef.current = performance.now()
        setActivePageIndex(nextIdx)
        // "push" appends the new page; "pop" (back nav) drops the current tail
        // so history shrinks instead of duplicating the target.
        setHistory(h => (historyMode === 'pop' ? h.slice(0, -1) : [...h, name]))
        setTransitionLog(prev => [...prev, { ...logEntry, toPage: name }])
        recorder.current?.logEvent('page.visited', {
          pageId: name,
          chapterId: chapter.id,
          from: logEntry.fromPage,
          action: logEntry.action,
        })
      }

      if (animation === 'none') {
        commit()
        return
      }

      const { exit, enter } = ANIM_CLASSES[animation]
      setAnimClass(exit)
      // Cancel any in-flight transition (exit-phase and enter-clear are tracked
      // in separate refs so a fast re-navigation doesn't lose track of either).
      if (animTimerRef.current) clearTimeout(animTimerRef.current)
      if (animEndTimerRef.current) clearTimeout(animEndTimerRef.current)

      animTimerRef.current = setTimeout(() => {
        setAnimClass(enter)
        commit()
        animEndTimerRef.current = setTimeout(() => setAnimClass(''), ANIM_DURATION)
      }, ANIM_DURATION)
    },
    // State setters and recorder ref are stable; flow.id is structurally stable
    // per flow instance. Only flow.pages drives page-lookup re-computation.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [chapter.pages]
  )

  // ─── Build InteractionCtx ─────────────────────────────────────────────────
  const buildCtx = useCallback(
    (): InteractionCtx => ({
      activePageId,
      history,
      flowState: localState,
      get: key => localState[key],
      set: (key, value) => setLocalState(prev => ({ ...prev, [key]: value })),
      db,
      updateDb,
      effect: name => setEffects(prev => [...prev, name]),
    }),
    [activePageId, history, localState, db, updateDb]
  )

  // ─── Core navigation commit ───────────────────────────────────────────────
  const commitNavigation = useCallback(
    (
      target: string,
      animation: TransitionAnimation,
      timestamp: string,
      actionName: string,
      warnings: string[],
      origin: NavigationOrigin = 'user'
    ) => {
      if (target === '__state__') return

      // ─── FlowStory Strict Mode gate ─────────────────────────────────────────
      // Only gates user-origin navigation (tap/keyboard/programmatic) — the
      // engine's own auto-play/auto-advance timers pass origin:'engine' and are
      // never gated, since they're the flow advancing itself, not a bypass.
      if (flowStoryGate?.strictMode && origin === 'user' && target !== 'back') {
        // Fork-aware: currentNext may be a resolver function (forking step) —
        // call it fresh against live db/flowState rather than string-comparing,
        // since a forking step has no single static "the" planned target.
        const resolvedPlanned =
          typeof flowStoryGate.currentNext === 'function'
            ? flowStoryGate.currentNext({ db, flowState: localState })
            : flowStoryGate.currentNext
        if (resolvedPlanned !== undefined && target !== resolvedPlanned) {
          warnings.push(`Navigation to "${target}" blocked — outside the planned flowStory step.`)
          setTransitionLog(prev => [
            ...prev,
            {
              timestamp,
              action: actionName,
              fromPage: activePageLabel,
              toPage: `[Blocked: ${target}]`,
              warnings,
            },
          ])
          recorder.current?.logEvent('page.blocked', {
            pageId: target,
            chapterId: chapter.id,
            fromPage: activePageLabel,
            strict: true,
          })
          return
        }
      }

      if (target === '__complete__') {
        setTransitionLog(prev => [
          ...prev,
          {
            timestamp,
            action: actionName,
            fromPage: activePageLabel,
            toPage: '[Flow Completed]',
            warnings,
          },
        ])
        recorder.current?.logEvent('chapter.completed', {
          chapterId: chapter.id,
          fromPage: activePageLabel,
        })
        if (completionTimerRef.current) clearTimeout(completionTimerRef.current)
        completionTimerRef.current = setTimeout(() => {
          if (chapter.onComplete) chapter.onComplete(navigateTo)
          else navigateTo(firstViewId || 'home')
        }, completionDelayMs)
        return
      }
      if (target === 'next') {
        let nextIndex = activePageIndex + 1
        while (nextIndex < chapter.pages.length && !pagePassesGuard(nextIndex)) nextIndex++
        if (nextIndex >= chapter.pages.length) {
          setTransitionLog(prev => [
            ...prev,
            {
              timestamp,
              action: actionName,
              fromPage: activePageLabel,
              toPage: '[Flow Completed]',
              warnings,
            },
          ])
          if (completionTimerRef.current) clearTimeout(completionTimerRef.current)
          completionTimerRef.current = setTimeout(() => {
            if (chapter.onComplete) chapter.onComplete(navigateTo)
            else navigateTo(firstViewId || 'home')
          }, completionDelayMs)
          return
        }
        navigateToPage(
          nextIndex,
          {
            timestamp,
            action: actionName,
            fromPage: activePageLabel,
            toPage: '',
            warnings,
          },
          animation
        )
        return
      }
      if (target === 'back') {
        if (history.length > 1) {
          const prevName = history[history.length - 2]
          const prevIdx = findPageIndex(prevName)
          if (prevIdx !== -1) {
            const backAnim = BACK_ANIM[animation] ?? animation
            // historyMode "pop" — navigateToPage drops the current tail so we
            // land on prevName with history shrunk (no duplicate append).
            navigateToPage(
              prevIdx,
              {
                timestamp,
                action: actionName,
                fromPage: activePageLabel,
                toPage: prevName,
                warnings,
              },
              backAnim,
              'pop'
            )
            return
          }
        }
        navigateTo(firstViewId || 'home')
        return
      }

      const nextIdx = findPageIndex(target)
      if (nextIdx === -1) {
        setTransitionLog(prev => [
          ...prev,
          {
            timestamp,
            action: actionName,
            fromPage: activePageLabel,
            toPage: `[External: ${target}]`,
            warnings,
          },
        ])
        recorder.current?.logEvent('chapter.exited-early', {
          chapterId: chapter.id,
          fromPage: activePageLabel,
          to: target,
        })
        navigateTo(target)
        return
      }
      if (nextIdx === activePageIndex) {
        setTransitionLog(prev => [
          ...prev,
          {
            timestamp,
            action: actionName,
            fromPage: activePageLabel,
            toPage: `${target} (state updated)`,
            warnings,
          },
        ])
        return
      }
      if (!pagePassesGuard(nextIdx)) {
        warnings.push(`Navigation to "${target}" blocked — page guard denied.`)
        setTransitionLog(prev => [
          ...prev,
          {
            timestamp,
            action: actionName,
            fromPage: activePageLabel,
            toPage: `[Blocked: ${target}]`,
            warnings,
          },
        ])
        recorder.current?.logEvent('page.blocked', {
          pageId: target,
          chapterId: chapter.id,
          fromPage: activePageLabel,
        })
        recorder.current?.logEvent('chapter.transition', {
          chapterId: chapter.id,
          action: actionName,
          from: activePageLabel,
          to: target,
          blocked: true,
          warnings,
        })
        return
      }

      const resolvedAnim =
        animation !== 'none' ? animation : (chapter.pages[nextIdx].enterAnimation ?? 'none')
      navigateToPage(
        nextIdx,
        { timestamp, action: actionName, fromPage: activePageLabel, toPage: '', warnings },
        resolvedAnim
      )
    },
    // recorder.current and setTransitionLog are stable refs/setters and correctly
    // omitted. All varying state is captured in the dep list below. localState and
    // db are read only inside the flowStory gate branch (fork resolver call).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [
      activePageLabel,
      activePageIndex,
      chapter,
      history,
      firstViewId,
      findPageIndex,
      navigateTo,
      navigateToPage,
      pagePassesGuard,
      flowStoryGate,
      localState,
      db,
      completionDelayMs,
    ]
  )

  // ─── Fire an interaction rule ─────────────────────────────────────────────
  const fireRule = useCallback(
    (rule: InteractionRule, elementId: string, triggerName: string) => {
      const timestamp = new Date().toLocaleTimeString()
      const warnings: string[] = []
      const ctx = buildCtx()

      // Resolve nearest data-fk-id ancestor if present
      const domEl = document.getElementById(elementId)
      let fkId: string | null = null
      let walker: HTMLElement | null = domEl
      while (walker) {
        if (walker.dataset.fkId) {
          fkId = walker.dataset.fkId
          break
        }
        walker = walker.parentElement
      }

      recorder.current?.logEvent('interaction.tap', {
        elementId,
        trigger: triggerName,
        pageId: activePageId,
        chapterId: chapter.id,
        ...(fkId ? { fkId } : {}),
      })

      if (rule.do) {
        try {
          rule.do(ctx)
          recorder.current?.logEvent('interaction.effect', {
            elementId,
            pageId: activePageId,
            chapterId: chapter.id,
          })
        } catch (e: unknown) {
          warnings.push(
            `do() error on "${elementId}": ${e instanceof Error ? e.message : String(e)}`
          )
        }
      }

      if (!rule.goTo) {
        if (rule.do) {
          setTransitionLog(prev => [
            ...prev,
            {
              timestamp,
              action: `${triggerName} → ${elementId}`,
              fromPage: activePageLabel,
              toPage: activePageLabel + ' (state updated)',
              warnings,
            },
          ])
        }
        return
      }

      let target: string
      if (typeof rule.goTo === 'function') {
        try {
          target = rule.goTo({ db: ctx.db, flowState: ctx.flowState })
        } catch (e: unknown) {
          warnings.push(
            `goTo() resolver error on "${elementId}": ${e instanceof Error ? e.message : String(e)}`
          )
          setTransitionLog(prev => [
            ...prev,
            {
              timestamp,
              action: `${triggerName} → ${elementId}`,
              fromPage: activePageLabel,
              toPage: activePageLabel,
              warnings,
            },
          ])
          return
        }
      } else {
        target = rule.goTo
      }

      // Surface rule-level errors (do()/goTo() exceptions) to FlowLens so a
      // replay shows WHY a tap misbehaved, not just that it happened.
      if (warnings.length > 0) {
        recorder.current?.logEvent('chapter.transition', {
          chapterId: chapter.id,
          action: `${triggerName} → ${elementId}`,
          from: activePageLabel,
          to: target,
          error: true,
          warnings,
        })
      }

      const animation = rule.animation ?? 'none'
      const delay = rule.delay ?? 0
      const commit = () =>
        commitNavigation(target, animation, timestamp, `${triggerName} → ${elementId}`, warnings)
      if (delay > 0) {
        // Tracked so unmount cleanup cancels it — otherwise a delayed nav fires
        // after the flow is gone (setState/navigateTo on an unmounted tree).
        const t = setTimeout(() => {
          delayTimersRef.current.delete(t)
          commit()
        }, delay)
        delayTimersRef.current.add(t)
      } else commit()
    },
    // flow.interactions and delayTimersRef are accessed via buildCtx / stable ref —
    // both are correctly omitted. activePageLabel and commitNavigation are the
    // only values that meaningfully change the callback's behavior.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [buildCtx, activePageLabel, commitNavigation]
  )

  // ─── Look up interaction rules for an element id ──────────────────────────
  const getRulesFor = useCallback(
    (elementId: string, trigger: string): InteractionRule[] => {
      const entry = chapter.interactions?.[elementId]
      if (!entry) return []
      const rules = Array.isArray(entry) ? entry : [entry]
      return rules.filter(r => (r.trigger ?? 'tap') === trigger)
    },
    [chapter.interactions]
  )

  // ─── onAction (escape hatch for programmatic triggers) ────────────────────
  const onAction = useCallback(
    (actionName: string) => {
      const timestamp = new Date().toLocaleTimeString()
      const entry = chapter.interactions?.[actionName]
      if (entry) {
        const rules = Array.isArray(entry) ? entry : [entry]
        rules.forEach(r => fireRule(r, actionName, 'tap'))
        return
      }
      commitNavigation(actionName, 'none', timestamp, actionName, [])
    },
    [chapter.interactions, fireRule, commitNavigation]
  )

  // ─── Per-page auto-advance ────────────────────────────────────────────────
  useEffect(() => {
    // Auto-play owns advancing when enabled — don't let auto-advance also fire,
    // or both timers race and a page gets skipped.
    if (autoPlay?.enabled && !isAutoPlayPaused) return
    const delay = activePage?.autoAdvanceDelay ?? chapter.autoAdvanceDelay
    if (delay === undefined) return
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current)
    autoTimerRef.current = setTimeout(() => {
      const timestamp = new Date().toLocaleTimeString()
      recorder.current?.logEvent('navigation.auto-advance', {
        pageId: activePageId,
        delayMs: delay,
        chapterId: chapter.id,
      })
      commitNavigation('next', 'none', timestamp, `auto-advance (${delay}ms)`, [], 'engine')
    }, delay)
    return () => {
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current)
    }
    // activePageId is derived from activePageIndex + activePage (already in
    // deps), so adding it would be redundant. recorder.current is a stable ref.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    activePageIndex,
    activePage,
    chapter.autoAdvanceDelay,
    chapter.id,
    commitNavigation,
    autoPlay,
    isAutoPlayPaused,
  ])

  // ─── Auto-play mode ───────────────────────────────────────────────────────
  useEffect(() => {
    if (!autoPlay?.enabled || isAutoPlayPaused) return
    const delay = (autoPlay.delay as number | undefined) ?? 2000
    const animation = ((autoPlay.animation as string | undefined) ?? 'fade') as TransitionAnimation

    const timer = setTimeout(() => {
      const timestamp = new Date().toLocaleTimeString()
      if (activePageIndex >= chapter.pages.length - 1) {
        if (autoPlay.loop) {
          navigateToPage(
            0,
            {
              timestamp,
              action: 'auto-play',
              fromPage: activePageLabel,
              toPage: '',
              warnings: [],
            },
            animation
          )
        } else {
          if (chapter.onComplete) chapter.onComplete(navigateTo)
          else navigateTo(firstViewId || 'home')
        }
      } else {
        commitNavigation('next', animation, timestamp, 'auto-play', [], 'engine')
      }
    }, delay)

    return () => clearTimeout(timer)
  }, [
    activePageIndex,
    autoPlay,
    isAutoPlayPaused,
    chapter,
    activePageLabel,
    navigateTo,
    firstViewId,
    commitNavigation,
    navigateToPage,
  ])

  // ─── Cleanup ──────────────────────────────────────────────────────────────
  useEffect(
    () => () => {
      if (autoTimerRef.current) clearTimeout(autoTimerRef.current)
      if (animTimerRef.current) clearTimeout(animTimerRef.current)
      if (animEndTimerRef.current) clearTimeout(animEndTimerRef.current)
      delayTimersRef.current.forEach(t => clearTimeout(t))
      delayTimersRef.current.clear()
    },
    []
  )

  // ─── Engine reset (called by FlowMaster on flowStory restart) ─────────────
  const resetEngine = useCallback(() => {
    if (autoTimerRef.current) clearTimeout(autoTimerRef.current)
    if (animTimerRef.current) clearTimeout(animTimerRef.current)
    if (animEndTimerRef.current) clearTimeout(animEndTimerRef.current)
    delayTimersRef.current.forEach(t => clearTimeout(t))
    delayTimersRef.current.clear()
    setActivePageIndex(initialIndex !== -1 ? initialIndex : 0)
    setHistory([initialPageName])
    setLocalState({})
    setTransitionLog([])
    setEffects([])
    setAnimClass('')
  }, [initialIndex, initialPageName])

  // Reset engine when the active flow changes — skip mount since state is already at initial values.
  useEffect(() => {
    if (prevChapterRef.current === chapter.id) return
    prevChapterRef.current = chapter.id
    resetEngine()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapter.id])

  // ─── Skip to last (debug) ─────────────────────────────────────────────────
  const skipToLast = useCallback(() => {
    ;[autoTimerRef, animTimerRef, animEndTimerRef].forEach(r => {
      if (r.current) clearTimeout(r.current)
    })
    const last = chapter.pages[chapter.pages.length - 1]
    setAnimClass('')
    setActivePageIndex(chapter.pages.length - 1)
    setHistory(h => [...h, last.id || last.label])
  }, [chapter.pages])

  return {
    activePageIndex,
    activePage,
    activePageId,
    history,
    localState,
    transitionLog,
    effects,
    animClass,
    isAutoPlayPaused,
    isAllowed,
    autoPlay,
    pageContainerRef,
    resetEngine,
    commitNavigation,
    fireRule,
    buildCtx,
    getRulesFor,
    onAction,
    skipToLast,
    setIsAutoPlayPaused,
    navigateToPage,
  }
}
