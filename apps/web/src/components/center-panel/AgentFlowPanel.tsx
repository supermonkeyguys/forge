import { useState } from 'react'
import {
  useWorkspaceStore,
  selectAgentCards,
  selectOrchestratorState,
  selectPhase,
  selectEvents,
  type AgentCardState,
} from '../../store/workspace-store'
import { Badge } from '../ui/badge'
import { Card, CardContent } from '../ui/card'
import { ScrollArea } from '../ui/scroll-area'
import { cn } from '../../lib/utils'

const AGENT_META: Record<string, { label: string; icon: string; description: string }> = {
  pm:         { label: 'PM Agent',        icon: '📋', description: '需求分析与放大' },
  architect:  { label: 'Architect',       icon: '🏗',  description: '技术架构规划' },
  schema:     { label: 'Schema Agent',    icon: '🗄',  description: '数据库 Schema' },
  logic:      { label: 'Logic Agent',     icon: '⚙️',  description: '业务逻辑 + 单测' },
  api:        { label: 'API Agent',       icon: '🔌',  description: 'HTTP 接口层' },
  ui:         { label: 'UI Agent',        icon: '🎨',  description: 'UI 组件 + Stories' },
  page:       { label: 'Page Agent',      icon: '📄',  description: '页面组装' },
  test:       { label: 'Test Agent',      icon: '✅',  description: '验证 + E2E 检查' },
}

export function AgentFlowPanel() {
  const phase = useWorkspaceStore(selectPhase)
  const orchState = useWorkspaceStore(selectOrchestratorState)
  const agentCards = useWorkspaceStore(selectAgentCards)
  const events = useWorkspaceStore(selectEvents)
  const [logOpen, setLogOpen] = useState(false)

  const thinkingEvents = events
    .filter((e) => e.type === 'agent_thinking' || e.type === 'agent_tool_use')
    .slice(-50)

  return (
    <div className="flex h-full flex-col bg-background">
      <OrchestratorBar state={orchState} phase={phase} />

      <div className="flex-1 overflow-y-auto p-5">
        {phase === 'input' || phase === 'pm-review' ? (
          <IdleState />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
            {Object.values(agentCards).map((card) => (
              <AgentCard key={card.role} card={card} />
            ))}
          </div>
        )}
      </div>

      {thinkingEvents.length > 0 && (
        <div className="border-t border-border">
          <button
            onClick={() => setLogOpen(!logOpen)}
            className="flex w-full items-center gap-1.5 bg-card px-5 py-2 text-left text-xs text-muted-foreground hover:text-foreground"
          >
            <span>{logOpen ? '▼' : '▲'}</span>
            AI 思考日志 ({thinkingEvents.length} 条)
          </button>
          {logOpen && (
            <ScrollArea className="max-h-[200px] bg-card px-5 pb-2">
              {thinkingEvents.map((e, i) => (
                <p key={i} className="mb-0.5 font-mono text-[11px] text-muted-foreground/60">
                  [{e.agent}] {e.type === 'agent_thinking' ? e.content : `tool: ${e.tool}`}
                </p>
              ))}
            </ScrollArea>
          )}
        </div>
      )}
    </div>
  )
}

function OrchestratorBar({ state, phase }: { state: string | null; phase: string }) {
  const stateConfig: Record<string, { variant: 'default' | 'secondary' | 'outline'; label: string; className?: string }> = {
    analyzing:  { variant: 'secondary', label: '分析需求' },
    planning:   { variant: 'secondary', label: '规划架构' },
    building:   { variant: 'secondary', label: '生成代码' },
    validating: { variant: 'outline',   label: '验证功能', className: 'border-yellow-500 text-yellow-500' },
    fixing:     { variant: 'outline',   label: '修复问题', className: 'border-yellow-500 text-yellow-500' },
    waiting:    { variant: 'outline',   label: '等待介入', className: 'border-yellow-500 text-yellow-500' },
    done:       { variant: 'outline',   label: '生成完成', className: 'border-green-500 text-green-500' },
  }

  const config = state ? stateConfig[state] : null

  return (
    <div className="flex items-center gap-2.5 border-b border-border px-5 py-3">
      <span className="text-sm font-medium text-muted-foreground">Agent 协作流程</span>
      {config && (
        <Badge variant={config.variant} className={cn('text-[11px]', config.className)}>
          {config.label}
        </Badge>
      )}
    </div>
  )
}

function AgentCard({ card }: { card: AgentCardState }) {
  const meta = AGENT_META[card.role] ?? { label: card.role, icon: '🤖', description: '' }

  const elapsed = card.startedAt && card.finishedAt
    ? ((card.finishedAt - card.startedAt) / 1000).toFixed(1) + 's'
    : card.startedAt
    ? Math.floor((Date.now() - card.startedAt) / 1000) + 's'
    : null

  return (
    <Card className={cn(
      'transition-colors',
      card.status === 'running' && 'border-primary/40',
      card.status === 'error' && 'border-destructive/40',
    )}>
      <CardContent className="p-3.5">
        <div className="mb-2.5 flex items-center gap-2.5">
          <span className="text-xl">{meta.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{meta.label}</div>
            <div className="text-[11px] text-muted-foreground">{meta.description}</div>
          </div>
          <div className="flex items-center gap-1">
            {card.status === 'running' && (
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            )}
            {card.status === 'done' && <span className="text-xs text-green-500">✓</span>}
            {card.status === 'error' && <span className="text-xs text-destructive">✗</span>}
            {elapsed && <span className="text-[10px] text-muted-foreground">{elapsed}</span>}
          </div>
        </div>

        <ProgressDots status={card.status} />

        {card.currentAction && (
          <p className={cn(
            'mt-2 truncate text-[11px]',
            card.status === 'running' ? 'text-primary' :
            card.status === 'done' ? 'text-green-500' :
            card.status === 'error' ? 'text-destructive' :
            'text-muted-foreground'
          )}>
            {card.currentAction}
          </p>
        )}

        {card.filesWritten.length > 0 && (
          <div className="mt-2 flex flex-col gap-0.5">
            {card.filesWritten.slice(-3).map((f) => (
              <p key={f} className="truncate font-mono text-[10px] text-muted-foreground">
                + {f.split('/').pop()}
              </p>
            ))}
            {card.filesWritten.length > 3 && (
              <p className="text-[10px] text-muted-foreground">+{card.filesWritten.length - 3} 更多文件</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ProgressDots({ status }: { status: AgentCardState['status'] }) {
  const filled = { idle: 0, running: 2, done: 5, error: 1 }[status]
  return (
    <div className="flex gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={cn(
            'h-1.5 w-1.5 rounded-full transition-colors duration-300',
            i < filled ? 'bg-primary' : 'bg-border'
          )}
        />
      ))}
    </div>
  )
}

function IdleState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
      <div className="text-5xl opacity-30">🤖</div>
      <p className="text-sm">Agent 团队待命中</p>
      <p className="text-xs">输入需求后，这里会展示每个 Agent 的实时进度</p>
    </div>
  )
}
