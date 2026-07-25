import { Z } from '@flowkit-shared/constants/zIndex'
import { Menu } from 'lucide-react'
import { useState } from 'react'

import { useIdleFade } from './hooks/useIdleFade'

interface MobileFABProps {
  onClick: () => void
}

export default function MobileFAB({ onClick }: MobileFABProps) {
  const idle = useIdleFade()
  const [awake, setAwake] = useState(false)
  const opacity = awake ? 1 : idle ? 0.28 : 0.55

  return (
    <button
      onClick={onClick}
      style={{ zIndex: Z.modal, opacity }}
      className="fixed bottom-4 right-3 rounded-full bg-neutral-950 border-0 cursor-pointer flex items-center justify-center shadow-[0_4px_20px_rgba(0,0,0,0.35)] transition-[transform,opacity] duration-150 ease-out size-11 hover:scale-[1.06]"
      onMouseEnter={() => setAwake(true)}
      onMouseLeave={() => setAwake(false)}
      onPointerDown={() => setAwake(true)}
      onPointerUp={() => setAwake(false)}
      onPointerCancel={() => setAwake(false)}
      aria-label="Open panel"
    >
      <Menu size={18} color="#fff" />
    </button>
  )
}

// Top-level drawer tabs
export type MobileTab = 'explore' | 'goto' | 'inspect' | 'feedback' | 'settings' | 'actions'
