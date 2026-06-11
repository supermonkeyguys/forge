import type { Workflow, CapabilityType } from '@forge/core'
import { useDeleteWorkflow } from '@forge/core'
import { Button } from '../../../components/ui/button'
import { Icons } from '../../../components/ui/icons'
import { useNavigate } from 'react-router-dom'

type IconComponent = (props: React.SVGProps<SVGSVGElement>) => React.ReactElement

const CAPABILITY_ICONS: Record<CapabilityType, IconComponent> = {
  browser: Icons.Monitor,
  http:    Icons.Plug,
  llm:     Icons.Bot,
  notify:  Icons.Bell,
  code:    Icons.Blocks,
  file:    Icons.Database,
}

export function WorkflowCard({ workflow }: { workflow: Workflow }) {
  const { mutate: del } = useDeleteWorkflow()
  const navigate = useNavigate()
  const stepCount = workflow.definition.steps.length
  const capabilities = [...new Set(workflow.definition.steps.map(s => s.capability))]

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/40 bg-card/60 p-5 hover:border-border transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-medium text-sm">{workflow.name}</h3>
          {workflow.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {workflow.description}
            </p>
          )}
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
          workflow.status === 'active'
            ? 'bg-green-500/10 text-green-400 border-green-500/20'
            : 'bg-border/40 text-muted-foreground border-border/30'
        }`}>
          {workflow.status === 'active' ? '启用' : '草稿'}
        </span>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{stepCount} 个步骤</span>
        <span>·</span>
        <span className="flex items-center gap-1">
          {capabilities.map(c => {
            const Icon = CAPABILITY_ICONS[c] ?? Icons.Zap
            return <Icon key={c} className="h-3.5 w-3.5" />
          })}
        </span>
      </div>

      <div className="flex gap-2 mt-1">
        <Button
          size="sm" variant="outline" className="flex-1 h-7 text-xs"
          onClick={() => navigate(`/workflows/${workflow.id}/edit`)}
        >
          查看
        </Button>
        <Button
          size="sm" className="flex-1 h-7 text-xs gap-1"
          onClick={() => navigate(`/workflows/${workflow.id}/run`)}
        >
          <Icons.Play className="h-3 w-3" />
          运行
        </Button>
        <Button
          size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
          onClick={() => del(workflow.id)}
        >
          <Icons.Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>
    </div>
  )
}
