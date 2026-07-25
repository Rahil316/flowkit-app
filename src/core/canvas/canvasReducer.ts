import { LS_KEEP_FIT } from '@flowkit-shared/constants/storageKeys'

import {
  CANVAS_DEVICE_MARGIN,
  CANVAS_H,
  CANVAS_W,
  FIT_TARGET_H,
  FIT_TARGET_W,
  ZOOM_MAX,
  ZOOM_MIN,
  ZOOM_STEP,
} from './canvasConfig'

export interface CanvasState {
  // Last-measured visible canvas dimensions (excludes panels).
  // Updated by the ResizeObserver on the canvas scroll element — the browser's
  // own layout is the source of truth, not manually-subtracted panel widths.
  visibleW: number
  visibleH: number

  fitScale: number
  keepFit: boolean
  fullscreen: boolean

  // Per-device-type zoom — keyed by DeviceType string
  zoomByType: Record<string, number | null>

  // Derived — recomputed atomically inside reducer
  scale: number

  // Increments every time the canvas should re-center. Counter instead of
  // boolean so center→center is a visible dep change and the effect always fires.
  scrollCenterCount: number
}

export type CanvasAction =
  // Fired by the ResizeObserver whenever the canvas scroll element resizes.
  // visibleW/visibleH are canvasEl.clientWidth/clientHeight — browser-measured,
  // correct for any panel state, mode, or layout change.
  | {
      type: 'MEASURED'
      visibleW: number
      visibleH: number
      deviceW: number
      deviceH: number
      deviceType: string
    }
  | {
      type: 'TOGGLE_KEEP_FIT'
      deviceType: string
      deviceW: number
      deviceH: number
      // Current visible dimensions at the moment of toggle — read from the
      // canvas element by the caller, same source as MEASURED.
      visibleW: number
      visibleH: number
    }
  | { type: 'BREAK_KEEP_FIT'; deviceType: string; deviceW: number; deviceH: number }
  | { type: 'TOGGLE_FULLSCREEN' }
  | { type: 'ZOOM_IN'; deviceType: string; deviceW: number; deviceH: number }
  | { type: 'ZOOM_OUT'; deviceType: string; deviceW: number; deviceH: number }
  | { type: 'RESET_ZOOM'; deviceType: string; deviceW: number; deviceH: number }
  | { type: 'SET_ZOOM'; zoom: number; deviceType: string; deviceW: number; deviceH: number }
  | { type: 'SCROLL_DONE' }

/**
 * Compute the scale that fits the device in the visible canvas area.
 * visibleW/visibleH come from the canvas element's own clientWidth/clientHeight —
 * the browser already accounts for panels, borders, and scrollbars.
 */
function computeFitScale(
  visibleW: number,
  visibleH: number,
  deviceW: number,
  deviceH: number
): number {
  const sx = (visibleW * FIT_TARGET_W) / deviceW
  const sy = (visibleH * FIT_TARGET_H) / deviceH
  // Ensure device fits within canvas bounds with scroll margin at extreme zoom
  const cx = (CANVAS_W * CANVAS_DEVICE_MARGIN) / deviceW
  const cy = (CANVAS_H * CANVAS_DEVICE_MARGIN) / deviceH
  return parseFloat(Math.min(1, sx, sy, cx, cy).toFixed(3))
}

/** Maximum zoom before the device overflows the fixed canvas on either axis. */
function canvasSafeMax(deviceW: number, deviceH: number): number {
  const mx = (CANVAS_W * CANVAS_DEVICE_MARGIN) / deviceW
  const my = (CANVAS_H * CANVAS_DEVICE_MARGIN) / deviceH
  return parseFloat(Math.min(ZOOM_MAX, mx, my).toFixed(3))
}

// Recomputes derived scale atomically. Call at the end of every action branch.
function derive(s: CanvasState, deviceType: string): CanvasState {
  const userZoom = s.zoomByType[deviceType] ?? null
  const scale = s.keepFit ? s.fitScale : (userZoom ?? s.fitScale)
  return { ...s, scale }
}

export function makeInitialState(): CanvasState {
  return {
    visibleW: window.innerWidth,
    visibleH: window.innerHeight,
    fitScale: 1,
    keepFit: localStorage.getItem(LS_KEEP_FIT) !== 'false',
    fullscreen: false,
    zoomByType: {},
    scale: 1,
    scrollCenterCount: 0,
  }
}

export function canvasReducer(state: CanvasState, action: CanvasAction): CanvasState {
  switch (action.type) {
    case 'MEASURED': {
      const newFit = computeFitScale(
        action.visibleW,
        action.visibleH,
        action.deviceW,
        action.deviceH
      )
      const scrollCenterCount = state.keepFit
        ? state.scrollCenterCount + 1
        : state.scrollCenterCount
      const next: CanvasState = {
        ...state,
        visibleW: action.visibleW,
        visibleH: action.visibleH,
        fitScale: newFit,
        scrollCenterCount,
      }
      return derive(next, action.deviceType)
    }

    case 'TOGGLE_KEEP_FIT': {
      if (state.keepFit) {
        // Turning OFF: lock current fitScale as userZoom so percentage doesn't jump
        try {
          localStorage.setItem(LS_KEEP_FIT, 'false')
        } catch {
          /* quota */
        }
        const next: CanvasState = {
          ...state,
          keepFit: false,
          zoomByType: { ...state.zoomByType, [action.deviceType]: state.fitScale },
        }
        return derive(next, action.deviceType)
      } else {
        // Turning ON: recompute fitScale from the current browser-measured visible area
        try {
          localStorage.setItem(LS_KEEP_FIT, 'true')
        } catch {
          /* quota */
        }
        const newFit = computeFitScale(
          action.visibleW,
          action.visibleH,
          action.deviceW,
          action.deviceH
        )
        const next: CanvasState = {
          ...state,
          keepFit: true,
          fitScale: newFit,
          zoomByType: { ...state.zoomByType, [action.deviceType]: null },
          scrollCenterCount: state.scrollCenterCount + 1,
        }
        return derive(next, action.deviceType)
      }
    }

    case 'BREAK_KEEP_FIT': {
      if (!state.keepFit) return state
      try {
        localStorage.setItem(LS_KEEP_FIT, 'false')
      } catch {
        /* quota */
      }
      const next: CanvasState = {
        ...state,
        keepFit: false,
        zoomByType: {
          ...state.zoomByType,
          [action.deviceType]: state.zoomByType[action.deviceType] ?? state.fitScale,
        },
      }
      return derive(next, action.deviceType)
    }

    case 'TOGGLE_FULLSCREEN': {
      // Only flip the fullscreen flag. KeepFit recalculation happens exclusively
      // via the MEASURED dispatch that ResizeObserver fires after browser layout
      // completes — that is the sole authoritative source of viewport dimensions.
      return { ...state, fullscreen: !state.fullscreen }
    }

    case 'ZOOM_IN': {
      const cur = state.zoomByType[action.deviceType] ?? state.scale
      const next = parseFloat(Math.min(ZOOM_MAX, cur + ZOOM_STEP).toFixed(2))
      return canvasReducer(state, {
        type: 'SET_ZOOM',
        zoom: next,
        deviceType: action.deviceType,
        deviceW: action.deviceW,
        deviceH: action.deviceH,
      })
    }

    case 'ZOOM_OUT': {
      const cur = state.zoomByType[action.deviceType] ?? state.scale
      const next = parseFloat(Math.max(ZOOM_MIN, cur - ZOOM_STEP).toFixed(2))
      return canvasReducer(state, {
        type: 'SET_ZOOM',
        zoom: next,
        deviceType: action.deviceType,
        deviceW: action.deviceW,
        deviceH: action.deviceH,
      })
    }

    case 'RESET_ZOOM': {
      try {
        localStorage.setItem(LS_KEEP_FIT, 'false')
      } catch {
        /* quota */
      }
      const next: CanvasState = {
        ...state,
        keepFit: false,
        zoomByType: { ...state.zoomByType, [action.deviceType]: 1.0 },
        scrollCenterCount: state.scrollCenterCount + 1,
      }
      return derive(next, action.deviceType)
    }

    case 'SET_ZOOM': {
      if (state.keepFit) {
        try {
          localStorage.setItem(LS_KEEP_FIT, 'false')
        } catch {
          /* quota */
        }
      }
      const wasKeepFit = state.keepFit
      const safeMax = canvasSafeMax(action.deviceW, action.deviceH)
      const clampedZoom = parseFloat(Math.min(safeMax, Math.max(ZOOM_MIN, action.zoom)).toFixed(3))
      const next: CanvasState = {
        ...state,
        keepFit: false,
        zoomByType: { ...state.zoomByType, [action.deviceType]: clampedZoom },
        // Only center when breaking keepFit for the first time in this zoom op.
        // Subsequent SET_ZOOM from wheel/pinch must NOT re-center — that fights
        // the user's panned position.
        scrollCenterCount: wasKeepFit ? state.scrollCenterCount + 1 : state.scrollCenterCount,
      }
      return derive(next, action.deviceType)
    }

    case 'SCROLL_DONE':
      return state

    default:
      return state
  }
}
