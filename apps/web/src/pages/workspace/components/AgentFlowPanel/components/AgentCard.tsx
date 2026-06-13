import { cn } from '@/lib/utils'
import { Icons } from '@/components/ui/icons'
import { AGENT_META } from '../constants'
import { ProgressBar } from './ProgressBar'
import type { AgentCardProps } from '../types'

export function AgentCard({
  card,
  step,
  isSelected,
  onClick,
  labelOverride,
  descriptionOverride,
}: AgentCardProps) {
  const meta = AGENT_META[card.role] ?? { label: card.role, icon: Icons.Bot, description: '' }
  const displayLabel = labelOverride ?? meta.label
  const displayDescription = descriptionOverride ?? meta.description

  // When step data is loaded from DB, use its status instead of the live card state
  const effectiveStatus = step
    ? (step.status === 'done' ? 'done' : step.status === 'failed' ? 'error' : card.status)
    : card.status

  const isInteractive = effectiveStatus !== 'idle'

  const elapsed = step
    ? (step.durationMs / 1000).toFixed(1) + 's'
    : card.startedAt && card.finishedAt
    ? ((card.finishedAt - card.startedAt) / 1000).toFixed(1) + 's'
    : card.startedAt
    ? Math.floor((Date.now() - card.startedAt) / 1000) + 's'
    : null

  const displayAction = step ? step.summary : card.currentAction

  return (
    <div
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onClick={isInteractive ? onClick : undefined}
      onKeyDown={isInteractive ? (e) => e.key === 'Enter' && onClick() : undefined}
      className={cn(
        'group relative overflow-hidden rounded-xl border bg-card/60 p-4 backdrop-blur-sm transition-all duration-300',
        // Base border
        !isSelected && effectiveStatus === 'idle'     && 'border-border/40',
        !isSelected && effectiveStatus === 'running'  && 'border-primary/40 shadow-lg shadow-primary/5',
        !isSelected && effectiveStatus === 'done'     && 'border-green-500/30',
        !isSelected && effectiveStatus === 'error'    && 'border-destructive/40',
        // Selected ring
        isSelected && 'border-primary ring-2 ring-primary/30',
        // Hover — only for interactive cards
        isInteractive && !isSelected && 'hover:-translate-y-0.5 hover:shadow-md hover:border-border/70 hover:bg-card/80 cursor-pointer',
        isInteractive && isSelected  && 'cursor-pointer',
      )}
    >
      {/* Active / done indicator line */}
      {effectiveStatus === 'running' && (
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent" />
      )}
      {effectiveStatus === 'done' && (
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-green-500/60 to-transparent" />
      )}

      {/* "Click to inspect" hint — appears on hover for interactive cards */}
      {isInteractive && !isSelected && (
        <div className="absolute right-3 top-3 flex items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <span className="text-[10px] text-muted-foreground/50">查看详情</span>
          <Icons.ChevronDown className="h-3 w-3 -rotate-90 text-muted-foreground/40" />
        </div>
      )}

      {/* Header */}
      <div className="mb-3 flex items-center gap-3">
        <meta.icon className={cn(
          'h-5 w-5 shrink-0 transition-colors duration-200',
          effectiveStatus === 'running' ? 'text-primary' :
          effectiveStatus === 'done'    ? 'text-green-400' :
          effectiveStatus === 'error'   ? 'text-destructive' :
          'text-muted-foreground',
        )} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{displayLabel}</div>
          <div className="text-[11px] text-muted-foreground/70">{displayDescription}</div>
        </div>
        <div className="flex items-center gap-1.5">
          {effectiveStatus === 'running' && (
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          )}
          {effectiveStatus === 'done' && <Icons.Check className="h-4 w-4 text-green-400" />}
          {effectiveStatus === 'error' && <Icons.X className="h-4 w-4 text-destructive" />}
          {elapsed && <span className="font-mono text-[10px] text-muted-foreground/60">{elapsed}</span>}
        </div>
      </div>

      {/* Progress bar */}
      <ProgressBar status={effectiveStatus} />

      {/* Current action / step summary */}
      {displayAction && (
        <p className={cn(
          'mt-2.5 truncate text-[11px]',
          effectiveStatus === 'running' ? 'text-primary' :
          effectiveStatus === 'done'    ? 'text-green-400' :
          effectiveStatus === 'error'   ? 'text-destructive' :
          'text-muted-foreground',
        )}>
          {displayAction}
        </p>
      )}

      {/* Files written */}
      {card.filesWritten.length > 0 && (
        <div className="mt-2.5 flex flex-col gap-0.5">
          {card.filesWritten.slice(-3).map((f: string, i: number) => (
            <p key={`${i}-${f}`} className="truncate font-mono text-[10px] text-muted-foreground/50">
              <span className="text-green-400/70">+</span> {f.split('/').pop()}
            </p>
          ))}
          {card.filesWritten.length > 3 && (
            <p className="text-[10px] text-muted-foreground/40">+{card.filesWritten.length - 3} more</p>
          )}
        </div>
      )}
    </div>
  )
}
