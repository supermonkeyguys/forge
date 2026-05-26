import { useState, useEffect, useRef } from 'react'
import {
  useWorkspaceStore,
  selectPhase,
  selectOrchestratorState,
  selectWaitingReason,
  selectEvents,
} from '../../store/workspace-store'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { ScrollArea } from '../ui/scroll-area'
import { cn } from '../../lib/utils'

export function ConversationHistory() {
  const phase = useWorkspaceStore(selectPhase)
  const orchState = useWorkspaceStore(selectOrchestratorState)
  const waitingReason = useWorkspaceStore(selectWaitingReason)
  const events = useWorkspaceStore(selectEvents)
  const [iterationInput, setIterationInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events.length])

  const handleIteration = () => {
    if (!iterationInput.trim()) return
    // TODO: call resume API
    setIterationInput('')
  }

  const stateLabel: Record<string, string> = {
    analyzing:  '分析需求中...',
    planning:   '规划架构中...',
    building:   '生成代码中...',
    validating: '验证功能中...',
    fixing:     '修复问题中...',
    done:       '✓ 生成完成',
    waiting:    '⚠ 需要你的介入',
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex items-center gap-2 border-b border-border/50 px-5 py-3">
        {phase === 'running' && (
          <span className="h-2 w-2 shrink-0 rounded-full bg-primary animate-pulse" />
        )}
        {phase === 'done' && (
          <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" />
        )}
        {phase === 'waiting' && (
          <span className="h-2 w-2 shrink-0 rounded-full bg-yellow-500" />
        )}
        <span className="text-sm text-muted-foreground">
          {orchState ? stateLabel[orchState] ?? orchState : '启动中...'}
        </span>
      </div>

      <ScrollArea className="flex-1 px-5 py-3">
        <div className="flex flex-col gap-1.5">
          {events
            .filter((e) => ['state_change', 'agent_done', 'agent_error', 'waiting'].includes(e.type))
            .map((event, i) => (
              <EventLine key={i} event={event} />
            ))}

          {phase === 'waiting' && waitingReason && (
            <div className="mt-2 rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-3 py-2.5">
              <p className="mb-1 text-xs font-medium text-yellow-500">AI 卡住了，需要你的帮助</p>
              <p className="text-xs text-muted-foreground">{waitingReason}</p>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {(phase === 'done' || phase === 'waiting') && (
        <div className="border-t border-border/50 px-5 py-3">
          <div className="flex gap-2">
            <Input
              value={iterationInput}
              onChange={(e) => setIterationInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleIteration()}
              placeholder={phase === 'waiting' ? '告诉 AI 怎么解决...' : '继续迭代，例如：把按钮改成蓝色'}
              className="flex-1 text-sm"
            />
            <Button
              onClick={handleIteration}
              disabled={!iterationInput.trim()}
              size="sm"
            >
              发送
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function EventLine({ event }: { event: ReturnType<typeof selectEvents>[number] }) {
  if (event.type === 'state_change') {
    const dotClass = cn(
      'h-1.5 w-1.5 shrink-0 rounded-full',
      event.state === 'done' ? 'bg-green-500' :
      event.state === 'waiting' ? 'bg-yellow-500' :
      event.state === 'failed' ? 'bg-destructive' :
      'bg-primary'
    )
    return (
      <div className="flex items-center gap-2">
        <span className={dotClass} />
        <span className="text-xs text-muted-foreground">{event.state}</span>
      </div>
    )
  }

  if (event.type === 'agent_done') {
    return (
      <div className="flex gap-2">
        <span className="shrink-0 text-xs text-green-500">✓</span>
        <span className="text-xs text-muted-foreground">
          <strong className="text-foreground">{event.agent}</strong>: {event.summary}
        </span>
      </div>
    )
  }

  if (event.type === 'agent_error') {
    return (
      <div className="flex gap-2">
        <span className="shrink-0 text-xs text-destructive">✗</span>
        <span className="text-xs text-muted-foreground">
          <strong className="text-destructive">{event.agent}</strong>: {event.error}
        </span>
      </div>
    )
  }

  return null
}
