import { useState, useEffect, useRef } from 'react'
import {
  useWorkspaceStore,
  selectPhase,
  selectOrchestratorState,
  selectWaitingReason,
  selectErrorMsg,
  selectTaskPrompt,
  selectProjectId,
  selectEvents,
  selectAgentJobId,
} from '../../../store/workspace-store'
import { useCreateTask } from '@forge/core'
import { useQueryClient } from '@tanstack/react-query'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { ScrollArea } from '../../../components/ui/scroll-area'
import { cn } from '../../../lib/utils'
import { Icons } from '../../../components/ui/icons'
import { toast } from '../../../store/toast-store'

export function ConversationHistory() {
  const phase = useWorkspaceStore(selectPhase)
  const orchState = useWorkspaceStore(selectOrchestratorState)
  const waitingReason = useWorkspaceStore(selectWaitingReason)
  const errorMsg = useWorkspaceStore(selectErrorMsg)
  const taskPrompt = useWorkspaceStore(selectTaskPrompt)
  const projectId = useWorkspaceStore(selectProjectId)
  const events = useWorkspaceStore(selectEvents)
  const agentJobId = useWorkspaceStore(selectAgentJobId)
  const setPhase = useWorkspaceStore((s) => s.setPhase)
  const startGeneration = useWorkspaceStore((s) => s.startGeneration)
  const { mutate: createTask, isPending: isRetrying } = useCreateTask(projectId ?? '')
  const queryClient = useQueryClient()
  const [iterationInput, setIterationInput] = useState('')
  const [isSending, setIsSending] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events.length])

  const handleIteration = async () => {
    const input = iterationInput.trim()
    if (!input || isSending || !agentJobId) return
    setIsSending(true)

    try {
      const res = await fetch(`/agent/resume/${agentJobId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userInput: input }),
      })
      if (!res.ok) throw new Error('resume failed')
      setIterationInput('')
      // Return to running phase — polling will pick up new events
      setPhase('running')
    } catch {
      toast.error('发送失败，请重试')
    } finally {
      setIsSending(false)
    }
  }

  const stateLabel: Record<string, string> = {
    analyzing:  '分析需求中...',
    planning:   '规划架构中...',
    building:   '生成代码中...',
    validating: '验证功能中...',
    fixing:     '修复问题中...',
    done:       '生成完成',
    waiting:    '需要你的介入',
    failed:     '任务失败',
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Status bar */}
      <div className="flex items-center gap-2.5 border-b border-border/40 px-6 py-3">
        {phase === 'running' && (
          <span className="h-2 w-2 shrink-0 rounded-full bg-primary animate-pulse" />
        )}
        {phase === 'done' && (
          <span className="h-2 w-2 shrink-0 rounded-full bg-green-400" />
        )}
        {phase === 'waiting' && (
          <span className="h-2 w-2 shrink-0 rounded-full bg-yellow-400" />
        )}
        {phase === 'error' && (
          <span className="h-2 w-2 shrink-0 rounded-full bg-destructive" />
        )}
        <span className="text-sm text-muted-foreground">
          {orchState ? stateLabel[orchState] ?? orchState : '启动中...'}
        </span>
      </div>

      {/* Error banner */}
      {phase === 'error' && (
        <div className="mx-4 mb-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive space-y-1.5">
          <p className="font-medium">任务执行失败</p>
          {errorMsg && <p className="text-destructive/80">{errorMsg}</p>}
          {!errorMsg && <p className="text-destructive/70">查看下方日志了解详情。</p>}
          {taskPrompt && projectId && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 border-destructive/40 bg-destructive/5 text-xs text-destructive hover:bg-destructive/20"
              disabled={isRetrying}
              onClick={() => {
                queryClient.removeQueries({ queryKey: ['task-steps', projectId] })
                createTask(taskPrompt, {
                  onSuccess: () => startGeneration(projectId),
                })
              }}
            >
              {isRetrying ? '重新发起中...' : '重新发起'}
            </Button>
          )}
        </div>
      )}

      {/* Event log */}
      <ScrollArea className="min-h-0 flex-1 px-6 py-4">
        <div className="flex flex-col gap-2">
          {events
            .filter((e) => ['state_change', 'agent_done', 'agent_error', 'waiting'].includes(e.type))
            .map((event, i) => (
              <EventLine key={i} event={event} />
            ))}

          {phase === 'waiting' && waitingReason && (
            <div className="mt-3 rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-4 py-3">
              <p className="mb-1.5 text-xs font-medium text-yellow-400">AI 卡住了，需要你的帮助</p>
              <p className="text-xs text-muted-foreground">{waitingReason}</p>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Iteration / resume input */}
      {(phase === 'done' || phase === 'waiting') && (
        <div className="border-t border-border/40 px-6 py-3">
          <div className="flex gap-2">
            <Input
              value={iterationInput}
              onChange={(e) => setIterationInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && !e.shiftKey && void handleIteration()}
              placeholder={phase === 'waiting' ? '告诉 AI 怎么解决...' : '继续迭代，例如：把按钮改成蓝色'}
              className="flex-1 border-border/40 bg-background/50 text-sm"
              disabled={isSending}
            />
            <Button
              onClick={() => void handleIteration()}
              disabled={!iterationInput.trim() || isSending || !agentJobId}
              size="sm"
            >
              {isSending ? (
                <span className="flex items-center gap-1.5">
                  <span className="h-3 w-3 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
                  发送中
                </span>
              ) : '发送'}
            </Button>
          </div>
          {!agentJobId && (phase === 'done' || phase === 'waiting') && (
            <p className="mt-1.5 text-[11px] text-muted-foreground/50">迭代需要 Agent 任务仍在运行中</p>
          )}
        </div>
      )}
    </div>
  )
}

function EventLine({ event }: { event: ReturnType<typeof selectEvents>[number] }) {
  if (event.type === 'state_change') {
    const dotClass = cn(
      'h-1.5 w-1.5 shrink-0 rounded-full',
      event.state === 'done' ? 'bg-green-400' :
      event.state === 'waiting' ? 'bg-yellow-400' :
      event.state === 'failed' ? 'bg-destructive' :
      'bg-primary'
    )
    return (
      <div className="flex items-center gap-2.5">
        <span className={dotClass} />
        <span className="font-mono text-xs text-muted-foreground">{event.state}</span>
      </div>
    )
  }

  if (event.type === 'agent_done') {
    return (
      <div className="flex gap-2.5 rounded-lg bg-green-500/5 px-3 py-2">
        <Icons.Check className="h-3.5 w-3.5 shrink-0 text-green-400" />
        <span className="text-xs text-muted-foreground">
          <strong className="font-medium text-foreground">{event.agent}</strong> {event.summary}
        </span>
      </div>
    )
  }

  if (event.type === 'agent_error') {
    return (
      <div className="flex gap-2.5 rounded-lg bg-destructive/5 px-3 py-2">
        <Icons.X className="h-3.5 w-3.5 shrink-0 text-destructive" />
        <span className="text-xs text-muted-foreground">
          <strong className="font-medium text-destructive">{event.agent}</strong> {event.error}
        </span>
      </div>
    )
  }

  return null
}
