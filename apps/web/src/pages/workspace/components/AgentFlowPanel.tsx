import { useState } from 'react'
import {
  useWorkspaceStore,
  selectAgentCards,
  selectOrchestratorState,
  selectPhase,
  selectEvents,
  type AgentCardState,
} from '../../../store/workspace-store'
import type { AgentRole } from '@forge/core'
import { ScrollArea } from '../../../components/ui/scroll-area'
import { cn } from '../../../lib/utils'
import { Icons } from '../../../components/ui/icons'
import { AgentDrawer } from './AgentDrawer'

type AgentMeta = { label: string; icon: (props: React.SVGProps<SVGSVGElement>) => React.ReactElement; description: string }

const AGENT_META: Record<string, AgentMeta> = {
  pm:         { label: 'PM Agent',        icon: Icons.Clipboard,   description: '需求分析与放大' },
  architect:  { label: 'Architect',       icon: Icons.Blocks,      description: '技术架构规划' },
  schema:     { label: 'Schema Agent',    icon: Icons.Database,    description: '数据库 Schema' },
  logic:      { label: 'Logic Agent',     icon: Icons.Cog,         description: '业务逻辑 + 单测' },
  api:        { label: 'API Agent',       icon: Icons.Plug,        description: 'HTTP 接口层' },
  ui:         { label: 'UI Agent',        icon: Icons.Palette,     description: 'UI 组件 + Stories' },
  page:       { label: 'Page Agent',      icon: Icons.Layout,      description: '页面组装' },
  test:       { label: 'Test Agent',      icon: Icons.CheckCircle, description: '验证 + E2E 检查' },
}

export function AgentFlowPanel() {
  const phase = useWorkspaceStore(selectPhase)
  const orchState = useWorkspaceStore(selectOrchestratorState)
  const agentCards = useWorkspaceStore(selectAgentCards)
  const events = useWorkspaceStore(selectEvents)
  const [logOpen, setLogOpen] = useState(false)
  const [selectedRole, setSelectedRole] = useState<string | null>(null)

  const thinkingEvents = events
    .filter((e) => e.type === 'agent_thinking' || e.type === 'agent_tool_use')
    .slice(-50)

  const selectedCard = selectedRole ? agentCards[selectedRole] : null

  const addEvent = useWorkspaceStore((s) => s.addEvent)
  const setPhase = useWorkspaceStore((s) => s.setPhase)

  function injectMockEvents() {
    setPhase('running')

    const roles: AgentRole[] = ['pm', 'architect', 'schema', 'logic', 'api', 'ui', 'page', 'test']
    const doneRoles: AgentRole[] = ['pm', 'architect', 'schema']
    const runningRole: AgentRole = 'logic'

    for (const role of doneRoles) {
      addEvent({ type: 'agent_start', agent: role, message: `${role} 开始执行` })
      addEvent({
        type: 'agent_thinking', agent: role,
        content: `分析当前任务需求，梳理输入输出边界，确认依赖关系……这个 agent 需要处理若干核心逻辑，确保与其他 agent 的接口对齐。`,
      })
      addEvent({ type: 'agent_tool_use', agent: role, tool: 'read_file' })
      addEvent({ type: 'agent_tool_use', agent: role, tool: 'write_file' })
      addEvent({ type: 'agent_file_write', agent: role, file: `apps/web/src/${role}/index.ts`, action: 'create' })
      addEvent({ type: 'agent_file_write', agent: role, file: `apps/web/src/${role}/types.ts`, action: 'create' })
      addEvent({ type: 'agent_done', agent: role, summary: `完成了核心模块设计，输出 2 个文件，接口已对齐下游 agent。` })
    }

    addEvent({ type: 'agent_start', agent: runningRole, message: '开始执行业务逻辑' })
    addEvent({
      type: 'agent_thinking', agent: runningRole,
      content: '正在分析业务规则，梳理数据流转链路，考虑边界条件和错误处理……',
    })
    addEvent({ type: 'agent_tool_use', agent: runningRole, tool: 'search_codebase' })

    // remaining roles stay idle
    void roles
  }

  return (
    <div className="relative z-10 flex h-full flex-col overflow-hidden" data-panel="agent-flow">
      {/* Orchestrator status bar */}
      <OrchestratorBar state={orchState} phase={phase} onMock={import.meta.env.DEV ? injectMockEvents : undefined} />

      {/* Agent cards grid */}
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {phase === 'input' || phase === 'pm-review' ? (
          <IdleState onMock={injectMockEvents} />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
            {Object.values(agentCards).map((card, i) => (
              <div key={card.role} className="animate-fade-in" style={{ animationDelay: `${i * 50}ms` }}>
                <AgentCard
                  card={card}
                  isSelected={selectedRole === card.role}
                  onClick={() => setSelectedRole(card.role === selectedRole ? null : card.role)}
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Agent detail drawer */}
      {selectedCard && (
        <AgentDrawer card={selectedCard} onClose={() => setSelectedRole(null)} />
      )}

      {/* Thinking log panel */}
      {thinkingEvents.length > 0 && (
        <div className="border-t border-border/40">
          <button
            onClick={() => setLogOpen(!logOpen)}
            className="flex w-full items-center gap-2 px-6 py-2.5 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
          >
            <Icons.ChevronDown className={cn('h-3.5 w-3.5 transition-transform', logOpen && 'rotate-180')} />
            <span className="font-mono">AI 思考日志</span>
            <span className="rounded-md bg-secondary px-1.5 py-0.5 text-[10px]">{thinkingEvents.length}</span>
          </button>
          {logOpen && (
            <ScrollArea className="max-h-[200px] border-t border-border/20 bg-background/50 px-6 pb-3 pt-2">
              {thinkingEvents.map((e, i) => (
                <p key={i} className="mb-0.5 font-mono text-[11px] text-muted-foreground/50">
                  <span className="text-muted-foreground/70">[{e.agent}]</span>{' '}
                  {e.type === 'agent_thinking' ? e.content : `tool: ${e.tool}`}
                </p>
              ))}
            </ScrollArea>
          )}
        </div>
      )}
    </div>
  )
}

function OrchestratorBar({ state, phase, onMock }: { state: string | null; phase: string; onMock?: () => void }) {
  const stateConfig: Record<string, { label: string; color: string; dotClass: string }> = {
    analyzing:  { label: '分析需求', color: 'text-primary', dotClass: 'bg-primary animate-pulse' },
    planning:   { label: '规划架构', color: 'text-primary', dotClass: 'bg-primary animate-pulse' },
    building:   { label: '生成代码', color: 'text-primary', dotClass: 'bg-primary animate-pulse' },
    validating: { label: '验证功能', color: 'text-yellow-400', dotClass: 'bg-yellow-400 animate-pulse' },
    fixing:     { label: '修复问题', color: 'text-yellow-400', dotClass: 'bg-yellow-400 animate-pulse' },
    waiting:    { label: '等待介入', color: 'text-yellow-400', dotClass: 'bg-yellow-400' },
    done:       { label: '锻造完成', color: 'text-green-400', dotClass: 'bg-green-400' },
  }

  const config = state ? stateConfig[state] : null

  return (
    <div className="flex items-center gap-3 border-b border-border/40 px-6 py-3.5">
      <span className="text-sm font-medium text-foreground/80">Agent 协作流程</span>
      {config && (
        <div className="flex items-center gap-2">
          <span className={cn('h-1.5 w-1.5 rounded-full', config.dotClass)} />
          <span className={cn('text-xs font-medium', config.color)}>{config.label}</span>
        </div>
      )}
      <div className="ml-auto flex items-center gap-3">
        {phase === 'running' && (
          <div className="h-1 w-24 overflow-hidden rounded-full bg-secondary">
            <div className="h-full w-1/3 animate-shimmer rounded-full bg-primary/60" />
          </div>
        )}
        {onMock && (
          <button
            onClick={onMock}
            className="rounded-md border border-dashed border-border/50 px-2.5 py-1 text-[10px] text-muted-foreground/50 transition-colors hover:border-primary/40 hover:text-primary"
          >
            ⚡ Mock
          </button>
        )}
      </div>
    </div>
  )
}

function AgentCard({
  card,
  isSelected,
  onClick,
}: {
  card: AgentCardState
  isSelected: boolean
  onClick: () => void
}) {
  const meta = AGENT_META[card.role] ?? { label: card.role, icon: Icons.Bot, description: '' }
  const isInteractive = card.status !== 'idle'

  const elapsed = card.startedAt && card.finishedAt
    ? ((card.finishedAt - card.startedAt) / 1000).toFixed(1) + 's'
    : card.startedAt
    ? Math.floor((Date.now() - card.startedAt) / 1000) + 's'
    : null

  return (
    <div
      role={isInteractive ? 'button' : undefined}
      tabIndex={isInteractive ? 0 : undefined}
      onClick={isInteractive ? onClick : undefined}
      onKeyDown={isInteractive ? (e) => e.key === 'Enter' && onClick() : undefined}
      className={cn(
        'group relative overflow-hidden rounded-xl border bg-card/60 p-4 backdrop-blur-sm transition-all duration-300',
        // Base border
        !isSelected && card.status === 'idle'     && 'border-border/40',
        !isSelected && card.status === 'running'  && 'border-primary/40 shadow-lg shadow-primary/5',
        !isSelected && card.status === 'done'     && 'border-green-500/30',
        !isSelected && card.status === 'error'    && 'border-destructive/40',
        // Selected ring
        isSelected && 'border-primary ring-2 ring-primary/30',
        // Hover — only for interactive cards
        isInteractive && !isSelected && 'hover:-translate-y-0.5 hover:shadow-md hover:border-border/70 hover:bg-card/80 cursor-pointer',
        isInteractive && isSelected  && 'cursor-pointer',
      )}
    >
      {/* Active / done indicator line */}
      {card.status === 'running' && (
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-primary to-transparent" />
      )}
      {card.status === 'done' && (
        <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-green-500/60 to-transparent" />
      )}

      {/* "Click to inspect" hint — appears on hover for interactive cards */}
      {isInteractive && !isSelected && (
        <div className="absolute right-3 top-3 flex items-center gap-1 opacity-0 transition-opacity duration-200 group-hover:opacity-100">
          <span className="text-[10px] text-muted-foreground/50">查看详情</span>
          <Icons.ChevronDown className="h-3 w-3 -rotate-90 text-muted-foreground/40" />
        </div>
      )}

      {/* Header */}
      <div className="mb-3 flex items-center gap-3">
        <meta.icon className={cn(
          'h-5 w-5 shrink-0 transition-colors duration-200',
          card.status === 'running' ? 'text-primary' :
          card.status === 'done'    ? 'text-green-400' :
          card.status === 'error'   ? 'text-destructive' :
          'text-muted-foreground',
        )} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold">{meta.label}</div>
          <div className="text-[11px] text-muted-foreground/70">{meta.description}</div>
        </div>
        <div className="flex items-center gap-1.5">
          {card.status === 'running' && (
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse" />
          )}
          {card.status === 'done' && <Icons.Check className="h-4 w-4 text-green-400" />}
          {card.status === 'error' && <Icons.X className="h-4 w-4 text-destructive" />}
          {elapsed && <span className="font-mono text-[10px] text-muted-foreground/60">{elapsed}</span>}
        </div>
      </div>

      {/* Progress bar */}
      <ProgressBar status={card.status} />

      {/* Current action */}
      {card.currentAction && (
        <p className={cn(
          'mt-2.5 truncate text-[11px]',
          card.status === 'running' ? 'text-primary' :
          card.status === 'done'    ? 'text-green-400' :
          card.status === 'error'   ? 'text-destructive' :
          'text-muted-foreground',
        )}>
          {card.currentAction}
        </p>
      )}

      {/* Files written */}
      {card.filesWritten.length > 0 && (
        <div className="mt-2.5 flex flex-col gap-0.5">
          {card.filesWritten.slice(-3).map((f) => (
            <p key={f} className="truncate font-mono text-[10px] text-muted-foreground/50">
              <span className="text-green-400/70">+</span> {f.split('/').pop()}
            </p>
          ))}
          {card.filesWritten.length > 3 && (
            <p className="text-[10px] text-muted-foreground/40">+{card.filesWritten.length - 3} more</p>
          )}
        </div>
      )}
    </div>
  )
}

function ProgressBar({ status }: { status: AgentCardState['status'] }) {
  const width = { idle: '0%', running: '60%', done: '100%', error: '30%' }[status]
  const color = {
    idle: 'bg-border',
    running: 'bg-primary',
    done: 'bg-green-400',
    error: 'bg-destructive',
  }[status]

  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-border/50">
      <div
        className={cn('h-full rounded-full transition-all duration-700 ease-out', color)}
        style={{ width }}
      />
    </div>
  )
}

function IdleState({ onMock }: { onMock: () => void }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 text-muted-foreground">
      <div className="relative">
        <div className="flex h-24 w-24 items-center justify-center rounded-2xl bg-secondary/50 ring-1 ring-border/40">
          <Icons.Bot className="h-12 w-12 text-muted-foreground/40" />
        </div>
        <div className="absolute -bottom-1 -right-1 h-4 w-4 rounded-full bg-muted-foreground/20 ring-2 ring-background" />
      </div>
      <div className="text-center">
        <p className="text-sm font-medium">Agent 团队待命中</p>
        <p className="mt-1 text-xs text-muted-foreground/60">输入需求后，这里会展示每个 Agent 的实时进度</p>
      </div>
      {import.meta.env.DEV && (
        <button
          onClick={onMock}
          className="mt-2 rounded-lg border border-dashed border-border/60 px-4 py-2 text-xs text-muted-foreground/50 transition-colors hover:border-primary/40 hover:text-primary"
        >
          ⚡ Mock 数据（开发模式）
        </button>
      )}
    </div>
  )
}
