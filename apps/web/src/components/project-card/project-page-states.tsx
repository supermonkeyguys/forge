import { Button } from '../ui/button'

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen overflow-y-auto bg-background">
      {children}
    </div>
  )
}

export function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 pt-20">
      <div className="text-5xl opacity-15">🔨</div>
      <div className="text-center">
        <h2 className="mb-1.5 text-base font-semibold">还没有项目</h2>
        <p className="text-sm text-muted-foreground">
          用自然语言描述你的 App，Agent 团队来生成它
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
    <div className="flex h-full items-center justify-center text-muted-foreground">
      加载中...
    </div>
  )
}

export function ErrorState() {
  return (
    <div className="flex h-full items-center justify-center text-destructive">
      加载失败，请刷新重试
    </div>
  )
}
