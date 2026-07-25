import type { PageMeta } from '@flowkit/types'
import { useAppNav } from '@flowkit-shared/utils'
import { useEffect } from 'react'

export default function SplashScreen() {
  const { navigateTo } = useAppNav()

  useEffect(() => {
    const timer = setTimeout(() => navigateTo('intro-flow-welcome-screen'), 1400)
    return () => clearTimeout(timer)
  }, [navigateTo])

  return (
    <div
      className="flex flex-col h-full items-center justify-center gap-4"
      style={{ background: 'var(--table-felt-dark)' }}
    >
      <span className="text-5xl">🕹️</span>
      <h1 className="text-ui-xl font-bold" style={{ color: 'var(--tile-text-light)' }}>
        Game Zone
      </h1>
    </div>
  )
}

export const pageMeta: PageMeta = {
  label: 'Splash Screen',
  desc: 'Auto-advancing intro splash — arcade logo, no interaction required.',
  isStandalone: true,
}
