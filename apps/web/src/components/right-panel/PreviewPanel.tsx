import { useState } from 'react'
import {
  useWorkspaceStore,
  selectPreviewUrl,
  selectPhase,
  selectOrchestratorState,
} from '../../store/workspace-store'
import { cn } from '../../lib/utils'
import { Icons } from '../ui/icons'

export function PreviewPanel() {
  const previewUrl = useWorkspaceStore(selectPreviewUrl)
  const phase = useWorkspaceStore(selectPhase)
  const orchState = useWorkspaceStore(selectOrchestratorState)
  const [iframeKey, setIframeKey] = useState(0)

  return (
    <div className="relative z-10 flex h-full flex-col border-l border-border/40 bg-card/40 backdrop-blur-sm">
      {/* Browser chrome */}
      <div className="flex items-center gap-2 border-b border-border/40 px-4 py-2.5">
        {/* Window dots */}
        <div className="flex gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-border/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-border/80" />
          <span className="h-2.5 w-2.5 rounded-full bg-border/80" />
        </div>

        {/* URL bar */}
        <div className={cn(
          'mx-2 flex-1 overflow-hidden text-ellipsis whitespace-nowrap rounded-lg border border-border/40 bg-background/50 px-3 py-1.5 font-mono text-[11px]',
          previewUrl ? 'text-foreground/70' : 'text-muted-foreground/40'
        )}>
          {previewUrl ?? 'https://preview.forge.app/...'}
        </div>

        {/* Action buttons */}
        {previewUrl && (
          <div className="flex gap-1">
            <button
              title="刷新预览"
              onClick={() => setIframeKey((k) => k + 1)}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Icons.RefreshCw className="h-3.5 w-3.5" />
            </button>
            <button
              title="在新标签页打开"
              onClick={() => window.open(previewUrl, '_blank')}
              className="flex h-7 w-7 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <Icons.ExternalLink className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </div>

      {/* Preview content */}
      <div className="relative flex-1 overflow-hidden">
        {previewUrl ? (
          <iframe
            key={iframeKey}
            src={previewUrl}
            className="h-full w-full border-none bg-white"
            title="App Preview"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        ) : (
          <BuildingPlaceholder phase={phase} orchState={orchState} />
        )}
      </div>
    </div>
  )
}

function BuildingPlaceholder({ phase, orchState }: { phase: string; orchState: string | null }) {
  const steps = [
    { state: 'analyzing',  label: '分析需求', icon: Icons.Search },
    { state: 'planning',   label: '规划架构', icon: Icons.Compass },
    { state: 'building',   label: '生成代码', icon: Icons.Hammer },
    { state: 'validating', label: '验证功能', icon: Icons.CheckCircle },
  ]

  const stateOrder = ['analyzing', 'planning', 'building', 'validating', 'done']
  const currentIdx = stateOrder.indexOf(orchState ?? '')

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 p-8">
      {/* Central visual */}
      <div className="relative">
        <div className={cn(
          'flex h-24 w-24 items-center justify-center rounded-2xl ring-1 transition-all duration-500',
          phase === 'running'
            ? 'bg-primary/10 ring-primary/20 animate-glow'
            : 'bg-secondary/50 ring-border/40'
        )}>
          {phase === 'input' && <Icons.Monitor className="h-12 w-12 text-muted-foreground" />}
          {phase === 'pm-review' && <Icons.Clipboard className="h-12 w-12 text-primary" />}
          {phase !== 'input' && phase !== 'pm-review' && <Icons.Hammer className="h-12 w-12 text-primary" />}
        </div>
      </div>

      {/* Status message */}
      <div className="text-center">
        <p className="mb-1 text-sm font-medium text-foreground/80">
          {phase === 'input' && '等待需求输入'}
          {phase === 'pm-review' && '确认需求后开始锻造'}
          {(phase === 'running') && '应用正在锻造中...'}
          {phase === 'waiting' && '等待你的指示'}
          {phase === 'error' && '锻造遇到问题'}
          {phase === 'done' && '锻造完成'}
        </p>
        <p className="text-xs text-muted-foreground/60">
          {phase === 'input' && '输入需求后预览将出现在这里'}
          {phase === 'running' && '稍安勿躁，Agent 团队正在协作'}
        </p>
      </div>

      {/* Progress steps */}
      {(phase === 'running' || phase === 'done') && (
        <div className="flex w-full max-w-[220px] flex-col gap-3">
          {steps.map((step, i) => {
            const isDone = i < currentIdx
            const isActive = stateOrder[currentIdx] === step.state
            return (
              <div key={step.state} className="flex items-center gap-3">
                <div className={cn(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs transition-all duration-500',
                  isDone ? 'bg-green-500/15 text-green-400 ring-1 ring-green-500/30' :
                  isActive ? 'bg-primary/15 text-primary ring-1 ring-primary/30 animate-pulse' :
                  'bg-secondary text-muted-foreground/40 ring-1 ring-border/30'
                )}>
                  {isDone ? <Icons.Check className="h-3.5 w-3.5" /> : <step.icon className="h-3.5 w-3.5" />}
                </div>
                <span className={cn(
                  'text-xs font-medium transition-colors duration-300',
                  isDone ? 'text-green-400' :
                  isActive ? 'text-foreground' :
                  'text-muted-foreground/40'
                )}>
                  {step.label}
                </span>
                {isActive && (
                  <div className="ml-auto h-1 w-8 overflow-hidden rounded-full bg-border/50">
                    <div className="h-full w-full animate-shimmer rounded-full" />
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
