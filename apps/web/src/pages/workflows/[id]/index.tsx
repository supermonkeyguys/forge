import { useParams, useNavigate } from 'react-router-dom'
import { useWorkflows } from '@forge/core'
import { Button } from '../../../components/ui/button'
import { Icons } from '../../../components/ui/icons'

const CAPABILITY_ICON: Record<string, (props: React.SVGProps<SVGSVGElement>) => React.ReactElement> = {
  browser: Icons.Monitor,
  http:    Icons.Plug,
  llm:     Icons.Bot,
  notify:  Icons.Bell,
  code:    Icons.Blocks,
  file:    Icons.Database,
}

const TRIGGER_LABEL: Record<string, string> = {
  manual:   '手动触发',
  webhook:  'Webhook',
  schedule: '定时触发',
}

export function WorkflowDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { data: workflows } = useWorkflows()
  const workflow = workflows?.find(w => w.id === id)

  if (!workflow) {
    return <div className="p-8 text-sm text-muted-foreground">加载中...</div>
  }

  const steps = workflow.definition?.steps ?? []

  return (
    <div className="flex flex-1 overflow-hidden">
    <div className="flex flex-col gap-6 p-8 max-w-2xl mx-auto w-full overflow-y-auto">
      {/* Header */}
      <div className="flex items-start gap-3">
        <button
          onClick={() => navigate('/workflows')}
          className="mt-0.5 text-muted-foreground hover:text-foreground transition-colors"
        >
          <Icons.ChevronLeft className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h1 className="text-base font-semibold truncate">{workflow.name}</h1>
            <span className={`text-[10px] px-2 py-0.5 rounded-full border shrink-0 ${
              workflow.status === 'active'
                ? 'bg-green-500/10 text-green-400 border-green-500/20'
                : 'bg-border/40 text-muted-foreground border-border/30'
            }`}>
              {workflow.status === 'active' ? '启用' : '草稿'}
            </span>
          </div>
          {workflow.description && (
            <p className="text-sm text-muted-foreground mt-0.5">{workflow.description}</p>
          )}
        </div>
        <Button
          size="sm"
          className="shrink-0 gap-1.5"
          onClick={() => navigate(`/workflows/${id}/run`)}
        >
          <Icons.Play className="h-3.5 w-3.5" />
          运行
        </Button>
      </div>

      {/* Meta */}
      <div className="flex gap-4 text-xs text-muted-foreground">
        <span>触发方式：{TRIGGER_LABEL[workflow.trigger.type] ?? workflow.trigger.type}</span>
        <span>{steps.length} 个步骤</span>
        <span>创建于 {new Date(workflow.createdAt).toLocaleDateString('zh-CN')}</span>
      </div>

      {/* Steps */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">执行步骤</p>
        {steps.map((step, i) => {
          const Icon = CAPABILITY_ICON[step.capability] ?? Icons.Zap
          const isLast = i === steps.length - 1
          return (
            <div key={step.id} className="relative flex gap-3">
              {/* Connector line */}
              {!isLast && (
                <div className="absolute left-[18px] top-9 h-[calc(100%-8px)] w-px bg-border/40" />
              )}
              {/* Step number circle */}
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-border/60 bg-card/60 text-xs text-muted-foreground z-10">
                {i + 1}
              </div>
              {/* Content */}
              <div className="flex-1 rounded-lg border border-border/40 bg-card/40 p-3 mb-2">
                <div className="flex items-center gap-2 mb-1">
                  <Icon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-sm font-medium">{step.name}</span>
                </div>
                {step.instructions && (
                  <p className="text-xs text-muted-foreground leading-relaxed line-clamp-3">
                    {step.instructions}
                  </p>
                )}
                {step.depends_on.length > 0 && (
                  <p className="text-[10px] text-muted-foreground/60 mt-1.5">
                    依赖：{step.depends_on.join(', ')}
                  </p>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
    </div>
  )
}
