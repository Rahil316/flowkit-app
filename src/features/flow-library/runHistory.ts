// Lightweight per-chapter run history persisted to localStorage. Phase 1 keeps only
// the most recent run per chapter (full history deferred). Mirrors the load/save
// pattern in features/flowTracer/components/useSessionSettings.ts.

export interface FlowRunRecord {
  /** ISO timestamp of the run. */
  at: string
  /** Total steps in the flowStory. */
  totalSteps: number
  /** Steps reached during the run. */
  stepsReached: number
  /** Whether the chapter completed. */
  completed: boolean
}

import { LS_RUN_HISTORY_PREFIX as KEY_PREFIX } from '@flowkit-shared/constants/storageKeys'

export function readLastRun(chapterId: string): FlowRunRecord | null {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + chapterId)
    if (!raw) return null
    return JSON.parse(raw) as FlowRunRecord
  } catch {
    return null
  }
}

export function writeLastRun(chapterId: string, record: FlowRunRecord): void {
  try {
    localStorage.setItem(KEY_PREFIX + chapterId, JSON.stringify(record))
  } catch {
    /* quota — ignore */
  }
}
