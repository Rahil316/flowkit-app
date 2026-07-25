interface NoPagesProps {
  workspaceName: string
  onAction?: () => void
}

export default function NoPages({ workspaceName, onAction }: NoPagesProps) {
  return (
    <div className="flex h-screen w-full items-center justify-center bg-theme-base">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="flex items-center justify-center rounded-xl bg-theme-elevated opacity-60 size-12">
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="text-theme-text-muted"
          >
            <rect x="3" y="4" width="18" height="16" rx="2" />
            <path d="M8 2v4M16 2v4M3 10h18" />
          </svg>
        </div>
        <div className="flex flex-col gap-1">
          <p className="text-ui-md font-semibold text-theme-text-primary">
            No pages in "{workspaceName}"
          </p>
          <p className="max-w-xs text-ui-sm text-theme-text-muted">
            This workspace exists but has no pages registered. Check{' '}
            <code className="rounded bg-theme-elevated px-1 py-0.5 font-mono text-ui-xs text-theme-text-secondary">
              manifest.ts
            </code>
            's{' '}
            <code className="rounded bg-theme-elevated px-1 py-0.5 font-mono text-ui-xs text-theme-text-secondary">
              chapters
            </code>{' '}
            /{' '}
            <code className="rounded bg-theme-elevated px-1 py-0.5 font-mono text-ui-xs text-theme-text-secondary">
              pageOrder
            </code>{' '}
            entries, or add a page with{' '}
            <code className="rounded bg-theme-elevated px-1 py-0.5 font-mono text-ui-xs text-theme-text-secondary">
              flowkit create:page
            </code>
            .
          </p>
        </div>
        {onAction && (
          <button
            onClick={onAction}
            className="rounded-md bg-theme-blue px-3 py-1.5 text-ui-sm font-semibold text-white transition-colors duration-120 hover:opacity-90"
          >
            Refresh
          </button>
        )}
      </div>
    </div>
  )
}
