// Helper: terminal ANSI color/style formatting utilities.
export const green = s => `\x1b[32m${s}\x1b[0m`
export const red = s => `\x1b[31m${s}\x1b[0m`
export const bold = s => `\x1b[1m${s}\x1b[0m`
export const dim = s => `\x1b[2m${s}\x1b[0m`
export const cyan = s => `\x1b[36m${s}\x1b[0m`

// Short aliases — the form most call sites actually import.
export const g = green
export const r = red
export const b = bold
export const d = dim
export const c = cyan
