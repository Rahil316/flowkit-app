// ── Canvas configuration ──────────────────────────────────────────────────────
// Change CANVAS_W/H to increase the panning surface. Must be large enough
// that any device preset at any supported zoom level fits within bounds.
// FIT_TARGET_W/H control how much of the visible area the device fills in keepFit mode.
// All derived limits (scroll centering, bounds clamping) auto-adjust from these values.

export const CANVAS_W = 2000
export const CANVAS_H = 2000
// Device must fit within this fraction of the canvas to leave scroll margin at extreme zoom
export const CANVAS_DEVICE_MARGIN = 0.95
export const FIT_TARGET_W = 0.9
export const FIT_TARGET_H = 0.8
export const ZOOM_MIN = 0.25
export const ZOOM_MAX = 5
export const ZOOM_STEP = 0.1

// Panel resize bounds — re-exported from sidebarConfig (the true single source of truth).
export {
  LEFT_PANEL_DEFAULT,
  LEFT_PANEL_MAX,
  LEFT_PANEL_MIN,
  RIGHT_PANEL_DEFAULT,
  RIGHT_PANEL_MAX,
  RIGHT_PANEL_MIN,
} from '../layout/sidebarConfig'
