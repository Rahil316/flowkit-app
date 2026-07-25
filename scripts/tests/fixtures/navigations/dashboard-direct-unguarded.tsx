import { useDashboard } from '@flowkit-shared/contexts'

export default function DashboardDirectUnguarded() {
  const { navigateTo } = useDashboard()
  return <button onClick={() => navigateTo('TARGET_ID_A')}>Go</button>
}
