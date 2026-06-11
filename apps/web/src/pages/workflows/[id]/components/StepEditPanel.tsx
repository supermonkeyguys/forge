import { useEffect, useState } from 'react'
import { Icons } from '../../../../components/ui/icons'
import { Button } from '../../../../components/ui/button'
import { Input } from '../../../../components/ui/input'
import type { StepNodeData } from '../utils/workflowToFlow'

const CAPABILITIES = [
  { value: 'llm',     label: '🤖 AI 分析' },
  { value: 'browser', label: '🌐 浏览器' },
  { value: 'http',    label: '🔌 HTTP' },
  { value: 'notify',  label: '🔔 通知' },
  { value: 'file',    label: '🗂 文件' },
  { value: 'code',    label: '🧱 代码生成' },
]

interface Props {
  nodeId:   string | null
  data:     StepNodeData | null
  onClose:  () => void
  onUpdate: (id: string, patch: Partial<StepNodeData>) => void
  onDelete: (id: string) => void
}

export function StepEditPanel({ nodeId, data, onClose, onUpdate, onDelete }: Props) {
  const [name,         setName]         = useState('')
  const [capability,   setCapability]   = useState('llm')
  const [instructions, setInstructions] = useState('')

  useEffect(() => {
    if (data) {
      setName(data.name)
      setCapability(data.capability)
      setInstructions(data.instructions)
    }
  }, [nodeId, data])

  if (!nodeId || !data) return null

  const handleSave = () => {
    onUpdate(nodeId, { name, capability, instructions })
  }

  return (
    <div className="absolute right-0 top-0 h-full w-72 border-l border-border bg-background flex flex-col z-10 shadow-lg">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <span className="text-sm font-semibold">步骤配置</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <Icons.X className="h-4 w-4" />
        </button>
      </div>

      {/* Fields */}
      <div className="flex-1 overflow-y-auto px-4 py-4 flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">名称</label>
          <Input
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="步骤名称"
          />
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">类型</label>
          <select
            value={capability}
            onChange={e => setCapability(e.target.value)}
            className="h-9 rounded-md border border-input bg-background px-3 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
          >
            {CAPABILITIES.map(c => (
              <option key={c.value} value={c.value}>{c.label}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1.5">
          <label className="text-xs font-medium text-muted-foreground">执行指令</label>
          <textarea
            value={instructions}
            onChange={e => setInstructions(e.target.value)}
            rows={6}
            placeholder="描述这个步骤要做什么…"
            className="rounded-md border border-input bg-background px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        {data.output && (
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">执行输出</label>
            <div className="rounded-md border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground whitespace-pre-wrap max-h-40 overflow-y-auto">
              {data.output}
            </div>
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-4 py-3 border-t border-border flex items-center justify-between">
        <Button
          size="sm" variant="ghost"
          className="text-destructive hover:text-destructive"
          onClick={() => { onDelete(nodeId); onClose() }}
        >
          <Icons.Trash2 className="h-3.5 w-3.5 mr-1.5" />
          删除步骤
        </Button>
        <Button size="sm" onClick={handleSave}>保存</Button>
      </div>
    </div>
  )
}
