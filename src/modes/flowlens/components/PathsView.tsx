import type { PathNode } from '../analyticsEngine'
import { FLOWLENS_ACCENT } from '../flowLensTheme'

interface Props {
  nodes: PathNode[]
  onPageClick?: (pageId: string) => void
}

export default function PathsView({ nodes, onPageClick }: Props) {
  const maxCount = nodes[0]?.count ?? 1

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="text-[10px] text-theme-text-muted mb-3 font-semibold uppercase tracking-wider">
        Page navigation paths
      </div>

      {nodes.length === 0 ? (
        <div className="text-theme-text-disabled text-xs">No navigation data</div>
      ) : (
        nodes.map(node => (
          <div
            key={node.pageId}
            className="mb-2.5 bg-theme-elevated border border-theme-border rounded-lg overflow-hidden"
          >
            {/* Source node */}
            <div
              className={`py-2 px-3 flex items-center gap-2 ${
                onPageClick ? 'cursor-pointer' : 'cursor-default'
              } ${Object.keys(node.nextPages).length > 0 ? 'border-b border-theme-border' : ''}`}
              onClick={() => onPageClick?.(node.pageId)}
            >
              <div
                className="h-1 min-w-1 max-w-20 rounded-sm shrink-0"
                style={{
                  width: `${(node.count / maxCount) * 100}%`,
                  background: FLOWLENS_ACCENT,
                }}
              />
              <span className="text-xs text-theme-text-primary flex-1 truncate">{node.pageId}</span>
              <span className="text-theme-text-muted text-ui-2xs shrink-0">{node.count}×</span>
            </div>

            {/* Next pages */}
            {Object.entries(node.nextPages)
              .sort((a, b) => b[1] - a[1])
              .slice(0, 4)
              .map(([nextId, count]) => (
                <div
                  key={nextId}
                  className={`py-1.25 pr-3 pl-7 flex items-center gap-2 ${
                    onPageClick ? 'cursor-pointer' : 'cursor-default'
                  }`}
                  onClick={() => onPageClick?.(nextId)}
                >
                  <span className="text-theme-text-disabled text-[10px]">→</span>
                  <span className="flex-1 text-ui-2xs text-theme-text-secondary truncate">
                    {nextId}
                  </span>
                  <span className="text-theme-text-disabled text-[10px] shrink-0">{count}×</span>
                  <div
                    className="h-0.5 bg-theme-border rounded-sm shrink-0"
                    style={{
                      width: `${(count / node.count) * 48}px`,
                    }}
                  />
                </div>
              ))}
          </div>
        ))
      )}
    </div>
  )
}
