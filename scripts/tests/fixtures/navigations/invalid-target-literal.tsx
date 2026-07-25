import { useAppNav } from '@flowkit-shared/utils'

export default function InvalidTargetLiteral() {
  const { navigateTo } = useAppNav()
  return <button onClick={() => navigateTo('this-id-does-not-exist')}>Go</button>
}
