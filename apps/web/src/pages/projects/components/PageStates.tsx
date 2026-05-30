import { Button } from '../../../components/ui/button'
import { Icons } from '../../../components/ui/icons'

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative h-screen overflow-y-auto bg-background">
      <div className="noise pointer-events-none absolute inset-0" />
      <div className="relative z-10">{children}</div>
    </div>
  )
}

export function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="animate-slide-up flex flex-col items-center justify-center gap-6 pt-24">
      <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-primary/10 ring-1 ring-primary/20">
        <Icons.Hammer className="h-10 w-10 text-primary" />
      </div>
      <div className="text-center">
        <h2 className="mb-2 text-lg font-semibold tracking-tight">还没有项目</h2>
        <p className="text-sm text-muted-foreground">
          用自然语言描述你的 App，Agent 团队来锻造它
        </p>
      </div>
      <Button onClick={onNew} className="mt-2">
        创建第一个项目
      </Button>
    </div>
  )
}

export function LoadingState() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        <span className="text-sm text-muted-foreground">加载中...</span>
      </div>
    </div>
  )
}

export function ErrorState() {
  return (
    <div className="flex h-full items-center justify-center">
      <div className="flex flex-col items-center gap-3 text-center">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-destructive/10 ring-1 ring-destructive/20">
          <Icons.AlertTriangle className="h-6 w-6 text-destructive" />
        </div>
        <p className="text-sm text-destructive">加载失败，请刷新重试</p>
      </div>
    </div>
  )
}
