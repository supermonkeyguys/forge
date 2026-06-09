import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useWorkflows, useRunWorkflow, useWorkflowRunEvents } from '@forge/core'
import type { WorkflowRunStatus } from '@forge/core'
import { Button } from '../../../components/ui/button'
import { Icons } from '../../../components/ui/icons'

const CAPABILITY_LABEL: Record<string, string> = {
  browser: '浏览器',
  http:    'HTTP',
  llm:     'AI 分析',
  notify:  '通知',
  code:    '代码生成',
  file:    '文件',
}

type RunState = 'idle' | 'running' | 'done' | 'failed'
type StepStatus = 'pending' | 'running' | 'done' | 'failed'

interface WorkflowStep {
  id:           string
  name:         string
  capability:   string
  instructions: string
  depends_on:   string[]
}

/** Groups steps into parallel execution layers (same logic as backend buildExecutionLayers). */
function computeLayers(steps: WorkflowStep[]): WorkflowStep[][] {
  const assigned = new Set<string>()
  const layers: WorkflowStep[][] = []
  while (assigned.size < steps.length) {
    const layer = steps.filter(
      s => !assigned.has(s.id) && s.depends_on.every(dep => assigned.has(dep)),
    )
    if (layer.length === 0) break
    layers.push(layer)
    for (const s of layer) assigned.add(s.id)
  }
  return layers
}

function statusToRunState(s: WorkflowRunStatus | undefined): RunState {
  if (!s || s === 'queued') return 'running'
  if (s === 'running') return 'running'
  if (s === 'done') return 'done'
  return 'failed'
}

function StepCard({ step, status }: { step: WorkflowStep; status: StepStatus }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-3 transition-colors flex-1 min-w-0 ${
        status === 'running' ? 'border-primary/40 bg-primary/5' :
        status === 'done'    ? 'border-green-500/30 bg-green-500/5' :
        status === 'failed'  ? 'border-destructive/30 bg-destructive/5' :
        'border-border/40'
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{step.name}</p>
        <p className="text-xs text-muted-foreground">
          {CAPABILITY_LABEL[step.capability] ?? step.capability}
        </p>
      </div>
      <span className="shrink-0">
        {status === 'running' && (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        )}
        {status === 'done'   && <Icons.CheckCircle className="h-4 w-4 text-green-500" />}
        {status === 'failed' && <Icons.X className="h-4 w-4 text-destructive" />}
      </span>
    </div>
  )
}

export function WorkflowRunPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: workflows } = useWorkflows()
  const workflow = workflows?.find(w => w.id === id)

  const [runId, setRunId] = useState<string | null>(null)
  const { mutate: startRun, isPending: isStarting } = useRunWorkflow(id ?? '')
  const { data: runEvents } = useWorkflowRunEvents(runId)

  const runState: RunState = runId ? statusToRunState(runEvents?.status) : 'idle'
  const stepEvents = runEvents?.events ?? []

  const stepStatuses: Record<string, StepStatus> = {}
  if (workflow) {
    for (const s of workflow.definition.steps) stepStatuses[s.id] = 'pending'
  }
  for (const ev of stepEvents) {
    if (ev.type === 'agent_start') stepStatuses[ev.agent] = 'running'
    if (ev.type === 'agent_done')  stepStatuses[ev.agent] = 'done'
    if (ev.type === 'agent_error') stepStatuses[ev.agent] = 'failed'
  }

  const handleStart = () => {
    startRun(undefined, { onSuccess: (data) => setRunId(data.runId) })
  }

  if (!workflow) {
    return <div className="p-8 text-muted-foreground text-sm">加载中...</div>
  }

  const layers = computeLayers(workflow.definition.steps as WorkflowStep[])

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex flex-1 flex-col gap-6 p-8 max-w-2xl mx-auto overflow-y-auto">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/workflows')}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <Icons.ChevronLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-base font-semibold">{workflow.name}</h1>
            {workflow.description && (
              <p className="text-xs text-muted-foreground mt-0.5">{workflow.description}</p>
            )}
          </div>
        </div>

        {/* Layered step display */}
        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            执行计划
          </p>
          {layers.map((layer, li) => (
            <div key={li} className="flex flex-col gap-1">
              {layers.length > 1 && (
                <div className="flex items-center gap-2 px-1">
                  <span className="text-[10px] text-muted-foreground/60 font-mono">
                    第 {li + 1} 批{layer.length > 1 ? ` · ${layer.length} 步并行` : ''}
                  </span>
                  {li < layers.length - 1 && (
                    <div className="flex-1 border-t border-dashed border-border/30" />
                  )}
                </div>
              )}
              <div className={`flex gap-2 ${layer.length > 1 ? 'flex-row' : 'flex-col'}`}>
                {layer.map(step => (
                  <StepCard
                    key={step.id}
                    step={step}
                    status={stepStatuses[step.id] ?? 'pending'}
                  />
                ))}
              </div>
              {li < layers.length - 1 && (
                <div className="flex justify-center py-0.5">
                  <Icons.ChevronDown className="h-3.5 w-3.5 text-muted-foreground/40" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Start button */}
        <Button
          onClick={handleStart}
          disabled={isStarting || runState === 'running'}
          className="self-start"
        >
          {runState === 'running' ? (
            <>
              <div className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-background/30 border-t-background" />
              执行中...
            </>
          ) : runState === 'done' || runState === 'failed' ? (
            <>
              <Icons.Play className="mr-2 h-3.5 w-3.5" />
              重新执行
            </>
          ) : (
            <>
              <Icons.Play className="mr-2 h-3.5 w-3.5" />
              开始执行
            </>
          )}
        </Button>

        {runState === 'done' && (
          <div className="rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-3 text-sm text-green-400">
            工作流执行完成
          </div>
        )}
        {runState === 'failed' && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive flex items-start gap-2">
            <Icons.AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              执行失败：
              {stepEvents.filter(e => e.type === 'agent_error').at(-1)?.content ?? '未知错误'}
            </span>
          </div>
        )}

        {stepEvents.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">执行日志</p>
            <div className="rounded-lg border border-border/40 bg-muted/20 p-3 font-mono text-xs space-y-1 max-h-64 overflow-y-auto">
              {stepEvents.map((ev, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-muted-foreground shrink-0">[{ev.agent}]</span>
                  <span className={
                    ev.type === 'agent_error' ? 'text-destructive' :
                    ev.type === 'agent_done'  ? 'text-green-400' : ''
                  }>{ev.content}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
