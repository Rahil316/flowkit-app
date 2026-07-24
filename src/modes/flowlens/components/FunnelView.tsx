import type { SessionExport } from '@flowkit-features/flowTracer/types'
import { useState } from 'react'

import type { FunnelStep } from '../analyticsEngine'
import { computeFunnel } from '../analyticsEngine'

interface Props {
  session: SessionExport
}

export default function FunnelView({ session }: Props) {
  const [pageOrder, setScreenOrder] = useState<string>('')

  const visitedScreens = Array.from(
    new Set(
      session.events.filter(e => e.type === 'page.visited').map(e => e.payload.pageId as string)
    )
  )

  const orderList = pageOrder
    .split(',')
    .map(s => s.trim())
    .filter(Boolean)

  const steps: FunnelStep[] = orderList.length >= 2 ? computeFunnel(session, orderList) : []

  return (
    <div className="h-full overflow-y-auto p-3">
      <div className="mb-3">
        <label className="text-[10px] text-theme-text-muted block mb-1">
          page order (comma-separated)
        </label>
        <input
          value={pageOrder}
          onChange={e => setScreenOrder(e.target.value)}
          placeholder="ScreenA, ScreenB, ScreenC"
          className="w-full bg-theme-elevated border border-theme-border rounded-md py-1.5 px-2 text-ui-2xs text-theme-text-primary outline-none"
        />
        <div className="mt-1.5 flex flex-wrap gap-1">
          {visitedScreens.slice(0, 12).map(s => (
            <button
              key={s}
              onClick={() => {
                const current = pageOrder
                  .split(',')
                  .map(x => x.trim())
                  .filter(Boolean)
                if (!current.includes(s)) setScreenOrder([...current, s].join(', '))
              }}
              className="text-[10px] py-0.5 px-1.5 rounded bg-theme-border border border-theme-border text-theme-text-secondary cursor-pointer"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {steps.length >= 2 ? (
        <div className="flex flex-col gap-1">
          {steps.map((step, i) => (
            <div key={step.pageId}>
              <div className="bg-theme-elevated border border-theme-border rounded-lg p-[8px_12px]">
                <div className="flex items-center gap-2 mb-1">
                  <span className="text-[10px] text-theme-text-disabled bg-theme-border rounded px-1.25 py-px shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-ui-xs text-theme-text-primary flex-1 truncate">
                    {step.pageId}
                  </span>
                  <span
                    className={`text-ui-2xs shrink-0 ${step.reachedCount > 0 ? 'text-theme-green' : 'text-theme-red'}`}
                  >
                    {step.reachedCount > 0 ? 'reached' : 'not reached'}
                  </span>
                </div>

                <div className="h-1.5 bg-theme-border rounded-[3px]">
                  <div
                    className={`h-full rounded-[3px] ${step.reachedCount > 0 ? 'bg-theme-green' : 'bg-theme-border'}`}
                    style={{
                      width: `${Math.max(step.reachedCount * 100, step.reachedCount > 0 ? 4 : 0)}%`,
                      transition: 'width 0.3s',
                    }}
                  />
                </div>
              </div>

              {/* Drop-off indicator between steps */}
              {i < steps.length - 1 && step.dropOffCount > 0 && (
                <div className="text-[10px] text-theme-red p-[2px_0_2px_28px] flex items-center gap-1">
                  <span>↓</span>
                  <span>
                    {step.dropOffCount} dropped ({Math.round(step.dropOffRate * 100)}%)
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="text-theme-text-disabled text-ui-xs">
          Enter at least 2 screen names above to see funnel analysis.
        </div>
      )}
    </div>
  )
}
