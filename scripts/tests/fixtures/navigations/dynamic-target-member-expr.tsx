import { useAppNav } from '@flowkit-shared/utils'

const GAMES = [{ id: 'a', pageId: 'TARGET_ID_A' }]

export default function DynamicTargetMemberExpr() {
  const { navigateTo } = useAppNav()
  return (
    <div>
      {GAMES.map(game => (
        <button key={game.id} onClick={() => navigateTo(game.pageId)}>
          {game.id}
        </button>
      ))}
    </div>
  )
}
