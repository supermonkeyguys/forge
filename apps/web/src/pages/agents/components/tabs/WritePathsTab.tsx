import { useUpdateAgent } from '@forge/core'
import type { UserAgent } from '@forge/core'
import type { SystemAgentDef } from '../../../../lib/agent-registry'
import { Textarea } from '../../../../components/ui/textarea'
import { Button } from '../../../../components/ui/button'

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
      <Textarea
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
        placeholder={'packages/core/\nserver/domain/'}
        className="resize-none font-mono text-[12px] text-white/60 focus-visible:ring-0 focus-visible:border-white/15 read-only:cursor-default"
      />
      {!isReadOnly && (
        <div className="flex justify-end">
          <Button
            variant="violet"
            size="sm"
            onClick={() => customAgent && updateAgent.mutate({ id: customAgent.id, writePaths: draftPaths })}
            disabled={isCreating || updateAgent.isPending}
            className="px-4"
          >
            {updateAgent.isPending ? '保存中…' : '保存'}
          </Button>
        </div>
      )}
    </div>
  )
}
