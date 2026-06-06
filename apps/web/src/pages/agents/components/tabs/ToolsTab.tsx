import { useUpdateAgent } from '@forge/core'
import type { UserAgent } from '@forge/core'
import type { SystemAgentDef } from '../../../../lib/agent-registry'
import { ALL_TOOLS } from '../../../../lib/agent-registry'
import { cn } from '../../../../lib/utils'
import { Button } from '../../../../components/ui/button'

interface Props {
  systemAgent: SystemAgentDef | null
  customAgent: UserAgent | null
  isCreating: boolean
  draftTools: string[]
  onDraftChange: (v: string[]) => void
}

export function ToolsTab({ systemAgent, customAgent, isCreating, draftTools, onDraftChange }: Props) {
  const updateAgent = useUpdateAgent()
  const isReadOnly = systemAgent !== null && !isCreating
  const activePaths = isReadOnly && systemAgent ? systemAgent.tools : draftTools

  const toggle = (tool: string) => {
    if (isReadOnly) return
    const next = activePaths.includes(tool)
      ? activePaths.filter((t) => t !== tool)
      : [...activePaths, tool]
    onDraftChange(next)
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-5">
      <p className="text-[12px] text-white/30">
        {isReadOnly ? 'System Agent 的工具权限只读。' : '选择该 Agent 可以使用的工具。'}
      </p>
      <div className="flex flex-col gap-2">
        {ALL_TOOLS.map((tool) => {
          const active = activePaths.includes(tool)
          return (
            <button
              key={tool}
              onClick={() => toggle(tool)}
              disabled={isReadOnly}
              className={cn(
                'flex items-center gap-3 rounded-[7px] border px-3 py-2.5 text-left text-[12px] transition-colors',
                active
                  ? 'border-violet-500/30 bg-violet-500/10 text-violet-200'
                  : 'border-white/[0.06] bg-white/[0.02] text-white/35',
                isReadOnly && 'cursor-default',
              )}
            >
              <span
                className={cn(
                  'h-2 w-2 flex-shrink-0 rounded-full',
                  active ? 'bg-violet-400' : 'bg-white/15',
                )}
              />
              <code className="font-mono">{tool}</code>
            </button>
          )
        })}
      </div>
      {!isReadOnly && (
        <div className="mt-auto flex justify-end">
          <Button
            variant="violet"
            size="sm"
            onClick={() => customAgent && updateAgent.mutate({ id: customAgent.id, tools: draftTools })}
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
