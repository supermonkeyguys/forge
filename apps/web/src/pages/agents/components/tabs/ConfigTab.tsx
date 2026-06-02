import { useCreateAgent, useUpdateAgent } from '@forge/core'
import type { UserAgent } from '@forge/core'
import type { SystemAgentDef } from '../../../../lib/agent-registry'

interface Props {
  systemAgent: SystemAgentDef | null
  customAgent: UserAgent | null
  isCreating: boolean
  draftName: string
  draftDescription: string
  draftInstructions: string
  draftTools: string[]
  draftPaths: string[]
  onDraftNameChange: (v: string) => void
  onDraftDescChange: (v: string) => void
  onCreated: (agent: UserAgent) => void
}

export function ConfigTab({
  systemAgent, customAgent, isCreating,
  draftName, draftDescription, draftInstructions, draftTools, draftPaths,
  onDraftNameChange, onDraftDescChange, onCreated,
}: Props) {
  const createAgent = useCreateAgent()
  const updateAgent = useUpdateAgent()
  const isReadOnly = systemAgent !== null && !isCreating

  const handleSave = () => {
    if (isCreating) {
      createAgent.mutate(
        {
          name: draftName,
          description: draftDescription,
          instructions: draftInstructions,
          tools: draftTools,
          writePaths: draftPaths,
        },
        { onSuccess: (res) => res && onCreated(res.data) },
      )
    } else if (customAgent) {
      updateAgent.mutate({ id: customAgent.id, name: draftName, description: draftDescription })
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-5">
      <div>
        <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-widest text-white/25">
          名称
        </label>
        <input
          readOnly={isReadOnly}
          value={isReadOnly && systemAgent ? `${systemAgent.label} Agent` : draftName}
          onChange={(e) => onDraftNameChange(e.target.value)}
          className="w-full rounded-[6px] border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white/80 outline-none focus:border-white/15 read-only:cursor-default"
          placeholder="Agent 名称"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-widest text-white/25">
          描述（可选）
        </label>
        <textarea
          readOnly={isReadOnly}
          value={isReadOnly ? '' : draftDescription}
          onChange={(e) => onDraftDescChange(e.target.value)}
          rows={3}
          className="w-full resize-none rounded-[6px] border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white/50 outline-none placeholder:text-white/20 focus:border-white/15 read-only:cursor-default"
          placeholder="这个 Agent 的用途…"
        />
      </div>
      {!isReadOnly && (
        <div className="mt-auto flex justify-end">
          <button
            onClick={handleSave}
            disabled={
              createAgent.isPending || updateAgent.isPending || !draftName.trim()
            }
            className="rounded-[6px] border border-violet-500/35 bg-violet-500/15 px-4 py-1.5 text-[12px] font-medium text-violet-300 disabled:opacity-50"
          >
            {createAgent.isPending || updateAgent.isPending
              ? '保存中…'
              : isCreating
              ? '创建 Agent'
              : '保存'}
          </button>
        </div>
      )}
    </div>
  )
}
