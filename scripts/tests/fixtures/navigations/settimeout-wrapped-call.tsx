import { useAppNav } from '@flowkit-shared/utils'
import { useEffect } from 'react'

export default function SetTimeoutWrappedCall() {
  const { navigateTo } = useAppNav()

  useEffect(() => {
    const timer = setTimeout(() => navigateTo('TARGET_ID_A'), 1400)
    return () => clearTimeout(timer)
  }, [navigateTo])

  return <div>Splash</div>
}
