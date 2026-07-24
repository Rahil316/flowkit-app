/// <reference types="vite/client" />

// ── FlowKit virtual module types ──────────────────────────────────────────────

declare module 'virtual:flowkit/config' {
  import type { FlowkitConfig } from '@flowkit/types/index'
  export const config: FlowkitConfig
}

declare module 'virtual:flowkit/pages' {
  import type { PageMeta } from '@flowkit/types/index'
  import type React from 'react'
  /** Lazy screen loaders keyed by "flow/pageId" */
  export const screens: Record<
    string,
    () => Promise<{ default: React.ComponentType; pageMeta?: PageMeta }>
  >
  /** Pre-wrapped React.lazy() components keyed by "flow/pageId" */
  export const lazyScreens: Record<string, React.LazyExoticComponent<React.ComponentType>>
  /** Eagerly imported pageMeta per screen, keyed by "flow/pageId" */
  export const pageMeta: Record<string, PageMeta | undefined>
  /** Structured screen list for hierarchy building */
  export const pageList: Array<{
    key: string
    flow: string
    pageId: string
    loader: () => Promise<{ default: React.ComponentType; pageMeta?: PageMeta }>
    /** '__'-prefixed entries are filtered out before reaching this list entirely. */
    visibility?: 'normal' | 'hidden'
  }>
}

declare module 'virtual:flowkit/flowStories' {
  import type { FlowStoryDef } from '@flowkit/types/index'
  export const flowStories: FlowStoryDef[]
}

declare module 'virtual:flowkit/workspace' {
  import type React from 'react'

  export const workspaceName: string
  export const db: Record<string, unknown>
  export const logo: string | null
  export const loadSimulator: (() => Promise<{ default: React.ComponentType }>) | null
  export const loadTokens: (() => Promise<string>) | null
  export const sessions: Record<string, unknown>
}

declare module '@flowkit-shared/utils/pagePathIdentity' {
  export const MISC_CHAPTER_ID: string
  export function isNonExistent(segment: string): boolean
  export function isHidden(segment: string): boolean
  export function resolveVisibility(segments: string[]): 'normal' | 'hidden' | 'non-existent'
  export function parseVariant(stem: string): { componentName: string; variant: string }
  export interface ParsedPageSegments {
    chapter: string
    page: string
    variant: string
    componentName: string
    visibility: 'normal' | 'hidden' | 'non-existent'
    cosmeticSegments: string[]
  }
  export function parsePageSegments(segments: string[]): ParsedPageSegments | null
  export function makePageId(chapter: string, page: string): string
  export function pickPageFile(candidateFilenames: string[]): {
    chosen: string | null
    ambiguous: boolean
  }
}
