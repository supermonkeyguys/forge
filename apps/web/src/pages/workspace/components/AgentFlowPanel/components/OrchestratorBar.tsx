import { cn } from '@/lib/utils'
import { STATE_CONFIG } from '../constants'
import type { OrchestratorBarProps } from '../types'

export function OrchestratorBar({ state, phase, onMock }: OrchestratorBarProps) {
  const config = state ? STATE_CONFIG[state] : null

  return (
    <div className="flex items-center gap-3 border-b border-border/40 px-6 py-3.5">
      <span className="text-sm font-medium text-foreground/80">Agent 协作流程</span>
      {config && (
        <div className="flex items-center gap-2">
          <span className={cn('h-1.5 w-1.5 rounded-full', config.dotClass)} />
          <span className={cn('text-xs font-medium', config.color)}>{config.label}</span>
        </div>
      )}
      <div className="ml-auto flex items-center gap-3">
        {phase === 'running' && (
          <div className="h-1 w-24 overflow-hidden rounded-full bg-secondary">
            <div className="h-full w-1/3 animate-shimmer rounded-full bg-primary/60" />
          </div>
        )}
        {onMock && (
          <button
            onClick={onMock}
            className="rounded-md border border-dashed border-border/50 px-2.5 py-1 text-[10px] text-muted-foreground/50 transition-colors hover:border-primary/40 hover:text-primary"
          >
            ⚡ Mock
          </button>
        )}
      </div>
    </div>
  )
}
