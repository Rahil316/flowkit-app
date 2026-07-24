// Public API for workspace config + flowStory authoring helpers.
// Import from '@flowkit-core/config'.
export type {
  AnnotationTag,
  AnnotationTagColor,
  DotPathPatch,
  FlowkitConfig,
  FlowkitProjectConfig,
  FlowStoryDef,
  FlowStoryRef,
  FlowStoryStepEntry,
  FlowStep,
  Fork,
  PageProps,
  SimulatorControl,
  SimulatorControlType,
  StepSimulatorOverride,
} from '../../types/index'
export { defineConfig, defineFlow, tag } from './defineConfig'
