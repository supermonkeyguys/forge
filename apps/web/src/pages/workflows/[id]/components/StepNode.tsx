import { memo } from 'react'
import { Handle, Position, type NodeProps, type Node } from '@xyflow/react'
import { Icons } from '../../../../components/ui/icons'
import type { StepNodeData } from '../utils/workflowToFlow'

const CAPABILITY_ICON: Record<string, (props: React.SVGProps<SVGSVGElement>) => React.ReactElement> = {
  browser: Icons.Monitor,
  http:    Icons.Plug,
  llm:     Icons.Bot,
  notify:  Icons.Bell,
  code:    Icons.Blocks,
  file:    Icons.Database,
}

const CAPABILITY_LABEL: Record<string, string> = {
  browser: '浏览器',
  http:    'HTTP',
  llm:     'AI 分析',
  notify:  '通知',
  code:    '代码生成',
  file:    '文件',
}

const STATUS_CLASS: Record<string, string> = {
  running: 'border-primary/50 bg-primary/5',
  done:    'border-green-500/40 bg-green-500/5',
  failed:  'border-destructive/40 bg-destructive/5',
}

export const StepNode = memo(function StepNode({ id, data, selected }: NodeProps<Node<StepNodeData>>) {
  const Icon = CAPABILITY_ICON[data.capability] ?? Icons.Zap
  const statusClass = data.status ? (STATUS_CLASS[data.status] ?? '') : ''

  return (
    <>
      <Handle type="target" position={Position.Top} className="!w-2.5 !h-2.5 !bg-border" />

      <div
        className={`
          relative w-[220px] rounded-lg border bg-card px-3 py-2.5 shadow-sm cursor-pointer
          transition-colors select-none
          ${selected ? 'border-primary ring-1 ring-primary/30' : 'border-border/60'}
          ${statusClass}
        `}
      >
        {/* Status badge */}
        {data.status === 'running' && (
          <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary animate-pulse" />
        )}
        {data.status === 'done' && (
          <Icons.CheckCircle className="absolute top-2 right-2 h-3.5 w-3.5 text-green-500" />
        )}
        {data.status === 'failed' && (
          <Icons.X className="absolute top-2 right-2 h-3.5 w-3.5 text-destructive" />
        )}

        {/* Capability + name */}
        <div className="flex items-center gap-2 pr-5">
          <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-sm font-medium truncate">{data.name || '未命名步骤'}</span>
        </div>

        {/* Capability label */}
        <p className="text-[10px] text-muted-foreground mt-0.5 pl-5">
          {CAPABILITY_LABEL[data.capability] ?? data.capability}
        </p>

        {/* Instructions preview */}
        {data.instructions && (
          <p className="text-[10px] text-muted-foreground/70 mt-1 line-clamp-2 leading-relaxed">
            {data.instructions}
          </p>
        )}
      </div>

      <Handle type="source" position={Position.Bottom} className="!w-2.5 !h-2.5 !bg-border" />
    </>
  )
})
