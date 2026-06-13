import { cn } from '@/lib/utils'
import type { ProgressBarProps } from '../types'

export function ProgressBar({ status }: ProgressBarProps) {
  const width = { idle: '0%', running: '60%', done: '100%', error: '30%' }[status as string]
  const color = {
    idle: 'bg-border',
    running: 'bg-primary',
    done: 'bg-green-400',
    error: 'bg-destructive',
  }[status as string]

  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-border/50">
      <div
        className={cn('h-full rounded-full transition-all duration-700 ease-out', color)}
        style={{ width }}
      />
    </div>
  )
}
