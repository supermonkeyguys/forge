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

function statusToRunState(s: WorkflowRunStatus | undefined): RunState {
  if (!s || s === 'queued') return 'running'
  if (s === 'running') return 'running'
  if (s === 'done') return 'done'
  return 'failed'
}

export function WorkflowRunPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: workflows } = useWorkflows()
  const workflow = workflows?.find(w => w.id === id)

  const [runId, setRunId] = useState<string | null>(null)
  const { mutate: startRun, isPending: isStarting } = useRunWorkflow(id ?? '')
  const { data: runEvents } = useWorkflowRunEvents(runId)

  const runState: RunState = runId
    ? statusToRunState(runEvents?.status)
    : 'idle'

  const stepEvents = runEvents?.events ?? []

  const stepStatuses: Record<string, 'pending' | 'running' | 'done' | 'failed'> = {}
  if (workflow) {
    for (const s of workflow.definition.steps) stepStatuses[s.id] = 'pending'
  }
  for (const ev of stepEvents) {
    if (ev.type === 'agent_start') stepStatuses[ev.agent] = 'running'
    if (ev.type === 'agent_done')  stepStatuses[ev.agent] = 'done'
    if (ev.type === 'agent_error') stepStatuses[ev.agent] = 'failed'
  }

  const handleStart = () => {
    startRun(undefined, {
      onSuccess: (data) => setRunId(data.runId),
    })
  }

  if (!workflow) {
    return <div className="p-8 text-muted-foreground text-sm">加载中...</div>
  }

  return (
    <div className="flex flex-col gap-6 p-8 max-w-2xl mx-auto">
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

      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">工作流步骤</p>
        {workflow.definition.steps.map((s, i) => {
          const st = stepStatuses[s.id] ?? 'pending'
          return (
            <div
              key={s.id}
              className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                st === 'running' ? 'border-primary/40 bg-primary/5' :
                st === 'done'    ? 'border-green-500/30 bg-green-500/5' :
                st === 'failed'  ? 'border-destructive/30 bg-destructive/5' :
                'border-border/40'
              }`}
            >
              <span className="text-xs text-muted-foreground w-4 shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{s.name}</p>
                <p className="text-xs text-muted-foreground">
                  {CAPABILITY_LABEL[s.capability] ?? s.capability}
                </p>
              </div>
              <span className="shrink-0">
                {st === 'running' && (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                )}
                {st === 'done' && <Icons.CheckCircle className="h-4 w-4 text-green-500" />}
                {st === 'failed' && <Icons.X className="h-4 w-4 text-destructive" />}
              </span>
            </div>
          )
        })}
      </div>

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
  )
}
