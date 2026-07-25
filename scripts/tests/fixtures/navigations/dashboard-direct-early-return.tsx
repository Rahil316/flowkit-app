import { useAppNav } from '@flowkit-shared/utils'
import { useDashboard } from '@flowkit-shared/contexts'

// Known gap, deliberate (see lib/nav-bindings.js's isGuardedByIsChapter doc comment):
// this call IS safely guarded in reality (the early return protects it), but v1's
// direct-wrap-only detection does not recognize this shape — the finding fires anyway.
// This fixture exists specifically to assert that gap explicitly, so it's a checked,
// intentional behavior rather than silent missing coverage.
export default function DashboardDirectEarlyReturn() {
  const { isChapter } = useAppNav()
  const { navigateTo } = useDashboard()

  function handleClick() {
    if (!isChapter) return
    navigateTo('TARGET_ID_A')
  }

  return <button onClick={handleClick}>Go</button>
}
