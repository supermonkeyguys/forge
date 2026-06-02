import { useUpdateAgent } from '@forge/core'
import type { UserAgent } from '@forge/core'
import type { SystemAgentDef } from '../../../../lib/agent-registry'

interface Props {
  systemAgent: SystemAgentDef | null
  customAgent: UserAgent | null
  isCreating: boolean
  draftPaths: string[]
  onDraftChange: (v: string[]) => void
}

export function WritePathsTab({
  systemAgent, customAgent, isCreating, draftPaths, onDraftChange,
}: Props) {
  const updateAgent = useUpdateAgent()
  const isReadOnly = systemAgent !== null && !isCreating
  const displayPaths = isReadOnly && systemAgent ? systemAgent.writePaths : draftPaths
  const text = displayPaths.join('\n')

  return (
    <div className="flex flex-1 flex-col gap-3 p-5">
      <p className="text-[12px] text-white/30">
        Agent 只能向以下路径前缀写入文件。每行一条，例如{' '}
        <code className="font-mono">packages/core/</code>。读取不受限制。
      </p>
      <textarea
        readOnly={isReadOnly}
        value={text}
        onChange={(e) =>
          onDraftChange(
            e.target.value
              .split('\n')
              .map((s) => s.trim())
              .filter(Boolean),
          )
        }
        rows={8}
        className="resize-none rounded-[8px] border border-white/[0.07] bg-[#0d0d0d] p-3 font-mono text-[12px] text-white/60 outline-none focus:border-white/15"
        placeholder={'packages/core/\nserver/domain/'}
      />
      {!isReadOnly && (
        <div className="flex justify-end">
          <button
            onClick={() =>
              customAgent && updateAgent.mutate({ id: customAgent.id, writePaths: draftPaths })
            }
            disabled={isCreating || updateAgent.isPending}
            className="rounded-[6px] border border-violet-500/35 bg-violet-500/15 px-4 py-1.5 text-[12px] font-medium text-violet-300 disabled:opacity-50"
          >
            {updateAgent.isPending ? '保存中…' : '保存'}
          </button>
        </div>
      )}
    </div>
  )
}
