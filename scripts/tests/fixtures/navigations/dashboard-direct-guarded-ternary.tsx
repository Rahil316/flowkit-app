import { useDashboard } from '@flowkit-shared/contexts'
import { useAppNav } from '@flowkit-shared/utils'

function otherHandler() {}

export default function DashboardDirectGuardedTernary() {
  const { isChapter } = useAppNav()
  const { navigateTo: dashNav } = useDashboard()
  return (
    <div>
      <button onClick={() => (isChapter ? dashNav('TARGET_ID_A') : otherHandler())}>A</button>
      <button onClick={() => (!isChapter ? otherHandler() : dashNav('TARGET_ID_A'))}>B</button>
    </div>
  )
}
