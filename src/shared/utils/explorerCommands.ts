import { useEffect } from 'react'

export type ExplorerCommand =
  | { type: 'switchTab'; tab: 'screens' | 'chapters' }
  | { type: 'expandAndHighlight'; chapterId: string; pageId: string }
  | { type: 'openFlowStoryDetail'; flowStoryId: string }

const bus = new EventTarget()
const EVENT = 'sidebar-command'

export function dispatchExplorerCommand(cmd: ExplorerCommand): void {
  bus.dispatchEvent(new CustomEvent(EVENT, { detail: cmd }))
}

export function useExplorerCommands(handler: (cmd: ExplorerCommand) => void): void {
  useEffect(() => {
    function listener(e: Event) {
      handler((e as CustomEvent<ExplorerCommand>).detail)
    }
    bus.addEventListener(EVENT, listener)
    return () => bus.removeEventListener(EVENT, listener)
  }, [handler])
}
