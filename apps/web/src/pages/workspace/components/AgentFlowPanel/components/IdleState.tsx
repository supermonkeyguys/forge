import { Icons } from '@/components/ui/icons'
import type { IdleStateProps } from '../types'

export function IdleState({ onMock }: IdleStateProps) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 text-muted-foreground">
      <div className="relative">
        <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-secondary/50 ring-1 ring-border/40">
          <Icons.Bot className="h-12 w-12 text-muted-foreground/40" />
        </div>
        <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-muted-foreground/20 ring-2 ring-background" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium">Agent 团队待命中</p>
        <p className="mt-1 text-xs text-muted-foreground/60">输入需求后，这里会展示每个 Agent 的实时进度</p>
      </div>
      {import.meta.env.DEV && (
        <button
          onClick={onMock}
          className="mt-2 rounded-lg border border-dashed border-border/60 px-4 py-2 text-xs text-muted-foreground/50 transition-colors hover:border-primary/40 hover:text-primary"
        >
          ⚡ Mock 数据（开发模式）
        </button>
      )}
    </div>
  )
}
