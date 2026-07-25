// Public API for the flow-library feature.
// Import from '@flowkit-features/flow-library' — never reach inside internals.
export { default as FlowCanvas } from './FlowCanvas'
export { default as FlowLibrary } from './FlowLibrary'
export type { CoverageFilter } from './PagesHierarchy'
export { default as PagesHierarchy } from './PagesHierarchy'
export type { FlowRunRecord } from './runHistory'
export { readLastRun, writeLastRun } from './runHistory'
export type { FlowLibraryData, FlowSummary } from './useFlowLibrary'
export { useFlowLibrary } from './useFlowLibrary'
// Compiler moved to @features/flowStory — re-exported here so existing consumers
// of this barrel (e.g. FlowMaster's `CompiledFlowStory` type import) keep working.
export type {
  CompiledFlowStory,
  CompiledStep,
  PageResolver,
  ResolvedPage,
} from '../flowStory/compileFlowStory'
export { compileFlowStory, FlowStoryCompileError } from '../flowStory/compileFlowStory'
