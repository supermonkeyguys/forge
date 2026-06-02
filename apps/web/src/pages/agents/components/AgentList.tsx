import { cn } from '../../../lib/utils'
import { SYSTEM_AGENTS } from '../../../lib/agent-registry'
import type { UserAgent } from '@forge/core'

interface Props {
  customAgents: UserAgent[]
  selectedId: string | null
  onSelect: (id: string) => void
  onCreateNew: () => void
}

export function AgentList({ customAgents, selectedId, onSelect, onCreateNew }: Props) {
  return (
    <div className="flex flex-col gap-0.5 overflow-y-auto py-2 px-1.5">
      <div className="px-2 pb-1.5 text-[9px] font-medium uppercase tracking-widest text-white/25">
        System
      </div>
      {SYSTEM_AGENTS.map((a) => (
        <button
          key={a.role}
          onClick={() => onSelect(`system:${a.role}`)}
          className={cn(
            'flex items-center gap-2 rounded-[5px] px-2 py-[6px] text-left text-xs transition-colors',
            selectedId === `system:${a.role}`
              ? 'border border-white/10 bg-white/[0.07] text-white/90 font-medium'
              : 'text-white/38 hover:bg-white/[0.04] hover:text-white/60',
          )}
        >
          <span
            className="h-[7px] w-[7px] flex-shrink-0 rounded-[1.5px]"
            style={{ background: a.color }}
          />
          {a.label}
        </button>
      ))}

      <div className="mx-1 my-2 h-px bg-white/[0.05]" />

      <div className="flex items-center justify-between px-2 pb-1.5">
        <span className="text-[9px] font-medium uppercase tracking-widest text-white/25">
          My Agents
        </span>
        <button
          onClick={onCreateNew}
          className="flex h-4 w-4 items-center justify-center rounded text-white/30 hover:bg-white/[0.07] hover:text-white/60"
          title="新建 Agent"
        >
          <span className="text-base leading-none">+</span>
        </button>
      </div>

      {customAgents.map((a) => (
        <button
          key={a.id}
          onClick={() => onSelect(`custom:${a.id}`)}
          className={cn(
            'flex items-center gap-2 rounded-[5px] px-2 py-[6px] text-left text-xs transition-colors',
            selectedId === `custom:${a.id}`
              ? 'border border-white/10 bg-white/[0.07] text-white/90 font-medium'
              : 'text-white/38 hover:bg-white/[0.04] hover:text-white/60',
          )}
        >
          <span className="h-[7px] w-[7px] flex-shrink-0 rounded-[1.5px] bg-violet-400" />
          <span className="max-w-[120px] truncate">{a.name}</span>
        </button>
      ))}

      {customAgents.length === 0 && (
        <div className="px-2 py-1 text-[11px] text-white/20">还没有自定义 Agent</div>
      )}
    </div>
  )
}
