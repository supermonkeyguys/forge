import { useState, useEffect } from 'react'
import { useUpdateAgent } from '@forge/core'
import type { UserAgent } from '@forge/core'
import type { SystemAgentDef } from '../../../../lib/agent-registry'
import { Textarea } from '../../../../components/ui/textarea'

interface Props {
  systemAgent: SystemAgentDef | null
  customAgent: UserAgent | null
  isCreating: boolean
  draftInstructions: string
  onDraftChange: (v: string) => void
}

export function InstructionsTab({
  systemAgent, customAgent, isCreating, draftInstructions, onDraftChange,
}: Props) {
  const updateAgent = useUpdateAgent()
  const [sysText, setSysText] = useState<string | null>(null)
  const isReadOnly = systemAgent !== null && !isCreating

  useEffect(() => {
    if (!systemAgent) return
    setSysText(null)
    fetch(`/agent/instructions/${systemAgent.instructionsFile}`)
      .then((r) => r.text())
      .then(setSysText)
      .catch(() => setSysText('(Failed to load instructions)'))
  }, [systemAgent?.instructionsFile])

  const text = isReadOnly ? (sysText ?? 'Loading…') : draftInstructions

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-hidden p-5">
      <p className="text-[12px] text-white/30">
        {isReadOnly
          ? 'System Agent 的 instructions 只读。Fork 后可以自定义。'
          : 'Agent 的系统 Prompt。每次任务开始时注入 LLM。'}
      </p>
      <Textarea
        readOnly={isReadOnly}
        value={text}
        onChange={(e) => onDraftChange(e.target.value)}
        placeholder="在此输入 instructions…"
        className="flex-1 resize-none font-mono text-[11px] leading-[1.7] text-white/60 focus-visible:ring-0 focus-visible:border-white/15 read-only:cursor-default"
      />
      {!isReadOnly && (
        <div className="flex justify-end">
          <button
            onClick={() =>
              customAgent &&
              updateAgent.mutate({ id: customAgent.id, instructions: draftInstructions })
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
