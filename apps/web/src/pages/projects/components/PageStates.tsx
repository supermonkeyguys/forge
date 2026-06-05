import { Icons } from '../../../components/ui/icons'

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
