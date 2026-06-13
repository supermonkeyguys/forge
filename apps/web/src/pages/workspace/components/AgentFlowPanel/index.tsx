import { useState, useCallback } from 'react'
import {
  useWorkspaceStore,
  selectAgentCards,
  selectOrchestratorState,
  selectPhase,
  selectEvents,
  selectProjectId,
  selectWorkflowSteps,
} from '@/store/workspace-store'
import { useTaskSteps, type AgentRole } from '@forge/core'
import { AgentDrawer } from '../AgentDrawer'
import { ThinkingLog } from './components/ThinkingLog'
import { OrchestratorBar } from './components/OrchestratorBar'
import { AgentCard } from './components/AgentCard'
import { IdleState } from './components/IdleState'
import { DEFAULT_STEPS } from './constants'
import type { StepDef } from './types'

export function AgentFlowPanel() {
  const phase = useWorkspaceStore(selectPhase)
  const orchState = useWorkspaceStore(selectOrchestratorState)
  const agentCards = useWorkspaceStore(selectAgentCards)
  const events = useWorkspaceStore(selectEvents)
  const projectId = useWorkspaceStore(selectProjectId)
  const workflowSteps = useWorkspaceStore(selectWorkflowSteps)

  const activeSteps = (workflowSteps as unknown as StepDef[] | undefined) ?? DEFAULT_STEPS
  const { data: steps = [] } = useTaskSteps(
    projectId,
    phase === 'done' || phase === 'error',
  )

  const [selectedRole, setSelectedRole] = useState<string | null>(null)
  const selectedCard = selectedRole ? agentCards[selectedRole] : null

  const handleCardClick = useCallback((role: string) => {
    setSelectedRole((prev) => (prev === role ? null : role))
  }, [])

  const handleCloseDrawer = useCallback(() => {
    setSelectedRole(null)
  }, [])

  const injectMockEvents = useInjectMockEvents()

  return (
    <div className="relative z-10 flex min-h-0 flex-col overflow-hidden" data-panel="agent-flow">
      {/* Orchestrator status bar */}
      <OrchestratorBar
        state={orchState}
        phase={phase}
        onMock={import.meta.env.DEV ? injectMockEvents : undefined}
      />

      {/* Agent cards grid */}
      <div className="min-h-0 flex-1 overflow-y-auto p-6">
        {phase === 'input' || phase === 'pm-review' ? (
          <IdleState onMock={injectMockEvents} />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
            {activeSteps.map((stepDef, i) => {
              const card = agentCards[stepDef.id] ?? {
                role: stepDef.id,
                status: 'idle' as const,
                currentAction: '',
                filesWritten: [],
                startedAt: null,
                finishedAt: null,
              }
              return (
                <div
                  key={stepDef.id}
                  className="animate-fade-in"
                  style={{ animationDelay: `${i * 50}ms` }}
                >
                  <AgentCard
                    card={card}
                    step={steps.find((s: { agent: string }) => s.agent === stepDef.id)}
                    isSelected={selectedRole === stepDef.id}
                    onClick={() => handleCardClick(stepDef.id)}
                    labelOverride={stepDef.name}
                    descriptionOverride={stepDef.subtitle}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>

      {/* Agent detail drawer */}
      {selectedCard && (
        <AgentDrawer card={selectedCard} onClose={handleCloseDrawer} />
      )}

      {/* Thinking log panel */}
      <ThinkingLog events={events} />
    </div>
  )
}

function useInjectMockEvents(): () => void {
  const addEvent = useWorkspaceStore((s) => s.addEvent)
  const setPhase = useWorkspaceStore((s) => s.setPhase)

  return useCallback(() => {
    setPhase('running')

    const doneRoles: AgentRole[] = ['pm', 'architect', 'schema']
    const runningRole: AgentRole = 'logic'

    for (const role of doneRoles) {
      addEvent({ type: 'agent_start', agent: role, message: `${role} 开始执行` })
      addEvent({
        type: 'agent_thinking',
        agent: role,
        content: `分析当前任务需求，梳理输入输出边界，确认依赖关系……这个 agent 需要处理若干核心逻辑，确保与其他 agent 的接口对齐。`,
      })
      addEvent({ type: 'agent_tool_use', agent: role, tool: 'read_file' })
      addEvent({ type: 'agent_tool_use', agent: role, tool: 'write_file' })
      addEvent({
        type: 'agent_file_write',
        agent: role,
        file: `apps/web/src/${role}/index.ts`,
        action: 'create',
      })
      addEvent({
        type: 'agent_file_write',
        agent: role,
        file: `apps/web/src/${role}/types.ts`,
        action: 'create',
      })
      addEvent({
        type: 'agent_done',
        agent: role,
        summary: `完成了核心模块设计，输出 2 个文件，接口已对齐下游 agent。`,
      })
    }

    addEvent({
      type: 'agent_start',
      agent: runningRole,
      message: '开始执行业务逻辑',
    })
    addEvent({
      type: 'agent_thinking',
      agent: runningRole,
      content: '正在分析业务规则，梳理数据流转链路，考虑边界条件和错误处理……',
    })
    addEvent({
      type: 'agent_tool_use',
      agent: runningRole,
      tool: 'search_codebase',
    })
  }, [addEvent, setPhase])
}
