import { useState } from 'react'
import {
  useWorkspaceStore,
  selectPreviewUrl,
  selectPhase,
  selectOrchestratorState,
} from '../../store/workspace-store'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'

export function PreviewPanel() {
  const previewUrl = useWorkspaceStore(selectPreviewUrl)
  const phase = useWorkspaceStore(selectPhase)
  const orchState = useWorkspaceStore(selectOrchestratorState)
  const [iframeKey, setIframeKey] = useState(0)

  return (
    <div className="flex h-full flex-col border-l border-border bg-card">
      <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
        <div className={cn(
          'flex-1 overflow-hidden text-ellipsis whitespace-nowrap rounded border border-border bg-background px-2.5 py-1.5 font-mono text-xs',
          previewUrl ? 'text-foreground' : 'text-muted-foreground'
        )}>
          {previewUrl ?? 'https://waiting...'}
        </div>

        {previewUrl && (
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7 shrink-0"
            title="在新标签页打开"
            onClick={() => window.open(previewUrl, '_blank')}
          >
            ↗
          </Button>
        )}
        {previewUrl && (
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7 shrink-0"
            title="刷新预览"
            onClick={() => setIframeKey((k) => k + 1)}
          >
            ↻
          </Button>
        )}
      </div>

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
    { state: 'analyzing',  label: '分析需求' },
    { state: 'planning',   label: '规划架构' },
    { state: 'building',   label: '生成代码' },
    { state: 'validating', label: '验证功能' },
  ]

  const stateOrder = ['analyzing', 'planning', 'building', 'validating', 'done']
  const currentIdx = stateOrder.indexOf(orchState ?? '')

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 p-6">
      <div className="text-5xl opacity-30">
        {phase === 'input' ? '🖥' : phase === 'pm-review' ? '📋' : '⚙️'}
      </div>

      <div className="text-center">
        <p className="mb-1.5 text-sm text-muted-foreground">
          {phase === 'input' && '输入需求后预览将出现在这里'}
          {phase === 'pm-review' && '确认需求后开始生成'}
          {(phase === 'running' || phase === 'fixing') && '应用正在生成中...'}
          {phase === 'waiting' && '等待你的指示'}
          {phase === 'error' && '生成遇到问题'}
        </p>
        {orchState && phase === 'running' && (
          <p className="text-xs text-muted-foreground/60">{orchState}</p>
        )}
      </div>

      {(phase === 'running' || phase === 'done') && (
        <div className="flex w-full max-w-[200px] flex-col gap-2">
          {steps.map((step, i) => {
            const isDone = i < currentIdx
            const isActive = stateOrder[currentIdx] === step.state
            return (
              <div key={step.state} className="flex items-center gap-2.5">
                <div className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
                  isDone ? 'border-green-500 bg-green-500' :
                  isActive ? 'border-primary' :
                  'border-border'
                )}>
                  {isDone && <span className="text-[10px] text-black">✓</span>}
                  {isActive && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />}
                </div>
                <span className={cn(
                  'text-xs',
                  isDone ? 'text-green-500' :
                  isActive ? 'text-foreground' :
                  'text-muted-foreground'
                )}>
                  {step.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
