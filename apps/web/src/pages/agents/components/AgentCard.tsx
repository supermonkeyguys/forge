import { useDeleteAgent } from '@forge/core'
import type { UserAgent } from '@forge/core'
import type { SystemAgentDef } from '../../../lib/agent-registry'

interface Props {
  systemAgent: SystemAgentDef | null
  customAgent: UserAgent | null
  isCreating: boolean
  onFork: (role: string) => void
  onDelete: (id: string) => void
}

export function AgentCard({ systemAgent, customAgent, isCreating, onFork, onDelete }: Props) {
  const deleteAgent = useDeleteAgent()

  if (isCreating) {
    return (
      <div className="flex flex-col items-start gap-3 p-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-[14px] border border-white/10 bg-white/[0.05]">
          <span className="text-2xl text-white/30">+</span>
        </div>
        <div>
          <div className="text-[15px] font-semibold text-white/80">新建 Agent</div>
          <div className="mt-0.5 text-[11px] text-white/30">custom</div>
        </div>
      </div>
    )
  }

  if (systemAgent) {
    const tierLabel =
      systemAgent.tier === 1 ? 'Tier 1 · Planner'
      : systemAgent.tier === 2 ? 'Tier 2 · Builder'
      : 'Tier 3 · QA'
    return (
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-3">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-[14px] border"
            style={{ background: `${systemAgent.color}18`, borderColor: `${systemAgent.color}40` }}
          >
            <div
              className="h-5 w-5 rounded-[4px] opacity-85"
              style={{ background: systemAgent.color }}
            />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-semibold text-white/90">{systemAgent.label} Agent</span>
              <span className="rounded-[4px] border border-white/[0.09] bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-white/35">
                system
              </span>
            </div>
            <div className="mt-0.5 text-[11px] text-white/35">{tierLabel}</div>
          </div>
        </div>
        <div className="flex flex-col gap-0 text-[12px]">
          <div className="flex justify-between border-b border-white/[0.04] py-1.5">
            <span className="text-white/35">Tier</span>
            <span className="text-white/70">{systemAgent.tier}</span>
          </div>
          <div className="flex justify-between border-b border-white/[0.04] py-1.5">
            <span className="text-white/35">工具</span>
            <span className="text-white/70">{systemAgent.tools.length} 个</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-white/35">写入路径</span>
            <span className="text-white/70">{systemAgent.writePaths.length} 条</span>
          </div>
        </div>
        <button
          onClick={() => onFork(systemAgent.role)}
          className="mt-2 w-full rounded-[7px] border border-blue-500/25 bg-blue-500/10 py-2 text-[12px] font-medium text-blue-300 transition-colors hover:bg-blue-500/15"
        >
          Fork Agent
        </button>
      </div>
    )
  }

  if (customAgent) {
    return (
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-[14px] border border-violet-500/25 bg-violet-500/10">
            <div className="h-5 w-5 rounded-[4px] bg-violet-400 opacity-85" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-semibold text-white/90">{customAgent.name}</span>
              <span className="rounded-[4px] border border-violet-500/25 bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-300">
                custom
              </span>
            </div>
            <div className="mt-0.5 text-[11px] text-white/35">
              {customAgent.description || 'custom agent'}
            </div>
          </div>
        </div>
        <div className="flex flex-col gap-0 text-[12px]">
          <div className="flex justify-between border-b border-white/[0.04] py-1.5">
            <span className="text-white/35">工具</span>
            <span className="text-white/70">{customAgent.tools.length} 个</span>
          </div>
          <div className="flex justify-between py-1.5">
            <span className="text-white/35">写入路径</span>
            <span className="text-white/70">{customAgent.writePaths.length} 条</span>
          </div>
        </div>
        <button
          onClick={() =>
            deleteAgent.mutate(customAgent.id, { onSuccess: () => onDelete(customAgent.id) })
          }
          disabled={deleteAgent.isPending}
          className="mt-2 w-full rounded-[7px] border border-red-500/20 bg-red-500/[0.07] py-2 text-[12px] text-red-400/70 transition-colors hover:bg-red-500/10 disabled:opacity-50"
        >
          {deleteAgent.isPending ? '删除中…' : '删除 Agent'}
        </button>
      </div>
    )
  }

  return null
}
