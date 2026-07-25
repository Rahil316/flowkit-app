import { useAppNav } from '@flowkit-shared/utils'
import { useDashboard } from '@flowkit-shared/contexts'

export default function DashboardDirectGuardedAnd() {
  const { isChapter } = useAppNav()
  const { navigateTo: dashNav } = useDashboard()
  return <button onClick={() => isChapter && dashNav('TARGET_ID_A')}>Go</button>
}
