import { useAppNav } from '@flowkit-shared/utils'

export default function AppNavObjectForm() {
  const nav = useAppNav()
  return <button onClick={() => nav.navigateTo('TARGET_ID_A')}>Go</button>
}
