import type { Plugin } from 'vite'

export interface FlowkitPluginOptions {
  /**
   * Which folder to read the workspace config file/flowBook/flowStories/lib from.
   * Defaults to process.cwd() (repo mode's own vite.config.ts and flat-mode
   * consumer projects both omit this). Multi-workspace consumer projects pass
   * the active workspace's folder name.
   */
  workspaceRoot?: string
  /**
   * Whether the plugin itself must supply @flowkit/@flowkit-core/etc. aliases, vs. a
   * host vite.config.ts already supplying them. Defaults to true only when
   * workspaceRoot is omitted — pass explicitly for multi-workspace standalone
   * mode, which needs workspaceRoot but has no host config to supply aliases.
   */
  standalone?: boolean
}

/** flowkit/vite — Vite plugin for FlowKit author projects. See scripts/helpers/vite-plugin.js. */
export function flowkit(options?: FlowkitPluginOptions): Plugin
