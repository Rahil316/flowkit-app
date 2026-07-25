import { useDashboard } from '@flowkit-shared/contexts'
import { useAppNav } from '@flowkit-shared/utils'

export default function DashboardDirectGuardedAnd() {
  const { isChapter } = useAppNav()
  const { navigateTo: dashNav } = useDashboard()
  return <button onClick={() => isChapter && dashNav('TARGET_ID_A')}>Go</button>
}
