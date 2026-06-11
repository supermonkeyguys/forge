import { useCreateAgent, useUpdateAgent } from '@forge/core'
import type { UserAgent } from '@forge/core'
import type { SystemAgentDef } from '../../../../lib/agent-registry'
import { DarkInput } from '../../../../components/ui/dark-input'
import { Textarea } from '../../../../components/ui/textarea'
import { Button } from '../../../../components/ui/button'
import { toast } from '../../../../store/toast-store'

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
        {
          onSuccess: (res) => { if (res) { toast.success('Agent 已创建'); onCreated(res.data) } },
          onError:   () => toast.error('创建失败，请稍后重试'),
        },
      )
    } else if (customAgent) {
      updateAgent.mutate(
        { id: customAgent.id, name: draftName, description: draftDescription },
        {
          onSuccess: () => toast.success('已保存'),
          onError:   () => toast.error('保存失败，请稍后重试'),
        },
      )
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-5">
      <div>
        <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-widest text-white/25">
          名称
        </label>
        <DarkInput
          readOnly={isReadOnly}
          value={isReadOnly && systemAgent ? `${systemAgent.label} Agent` : draftName}
          onChange={(e) => onDraftNameChange(e.target.value)}
          placeholder="Agent 名称"
          className="w-full font-sans text-white/80 focus:border-white/15 read-only:cursor-default"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-widest text-white/25">
          描述（可选）
        </label>
        <Textarea
          readOnly={isReadOnly}
          value={isReadOnly ? '' : draftDescription}
          onChange={(e) => onDraftDescChange(e.target.value)}
          rows={3}
          placeholder="这个 Agent 的用途…"
          className="resize-none text-[13px] text-white/50 placeholder:text-white/20 focus-visible:ring-0 focus-visible:border-white/15 read-only:cursor-default"
        />
      </div>
      {!isReadOnly && (
        <div className="mt-auto flex justify-end">
          <Button
            variant="violet"
            size="sm"
            onClick={handleSave}
            disabled={createAgent.isPending || updateAgent.isPending || !draftName.trim()}
            className="px-4"
          >
            {createAgent.isPending || updateAgent.isPending ? '保存中…' : isCreating ? '创建 Agent' : '保存'}
          </Button>
        </div>
      )}
    </div>
  )
}
