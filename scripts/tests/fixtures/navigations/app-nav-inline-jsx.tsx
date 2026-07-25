import { useAppNav } from '@flowkit-shared/utils'

export default function AppNavInlineJsx() {
  const { navigateTo } = useAppNav()
  return (
    <div>
      <button onClick={() => navigateTo('TARGET_ID_A')}>Go A</button>
      <button onClick={() => navigateTo('TARGET_ID_B')}>Go B</button>
    </div>
  )
}
