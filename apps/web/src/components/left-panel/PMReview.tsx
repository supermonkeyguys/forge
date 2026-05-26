import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateProject } from '@forge/core'
import {
  useWorkspaceStore,
  selectDraftSpec,
  type DraftFeature,
} from '../../store/workspace-store'
import { Button } from '../ui/button'
import { Textarea } from '../ui/textarea'
import { Badge } from '../ui/badge'
import { Checkbox } from '../ui/checkbox'
import { ScrollArea } from '../ui/scroll-area'
import { cn } from '../../lib/utils'

const CONFIDENCE_LABEL: Record<DraftFeature['confidence'], string> = {
  high:   '必需',
  medium: '常见',
  low:    '可选',
}

const CONFIDENCE_CLASS: Record<DraftFeature['confidence'], string> = {
  high:   'text-green-500',
  medium: 'text-primary',
  low:    'text-muted-foreground',
}

export function PMReview() {
  const draft = useWorkspaceStore(selectDraftSpec)
  const setDraftSpec = useWorkspaceStore((s) => s.setDraftSpec)
  const setPhase = useWorkspaceStore((s) => s.setPhase)
  const startGeneration = useWorkspaceStore((s) => s.startGeneration)
  const userInput = useWorkspaceStore((s) => s.userInput)

  const { mutate: createProject, isPending: isCreating } = useCreateProject()
  const navigate = useNavigate()

  const [supplement, setSupplement] = useState('')
  const [isStarting, setIsStarting] = useState(false)

  if (!draft) return null

  const selectedCount = draft.features.filter((f) => f.selected).length

  const toggleFeature = (id: string) => {
    setDraftSpec({
      ...draft,
      features: draft.features.map((f) =>
        f.id === id ? { ...f, selected: !f.selected } : f,
      ),
    })
  }

  const handleConfirm = () => {
    if (selectedCount === 0 || isStarting || isCreating) return
    setIsStarting(true)

    createProject(draft.title || userInput.slice(0, 40), {
      onSuccess: (result) => {
        const projectId = result?.data?.id
        if (!projectId) {
          setIsStarting(false)
          return
        }
        startGeneration(projectId)
        navigate(`/projects/${projectId}`)
      },
      onError: () => {
        setIsStarting(false)
      },
    })
  }

  const byConfidence = (tier: DraftFeature['confidence']) =>
    draft.features.filter((f) => f.confidence === tier)

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="border-b border-border/50 px-5 pb-3 pt-4">
        <button
          onClick={() => setPhase('input')}
          className="mb-1 text-sm text-muted-foreground hover:text-foreground"
        >
          ← 返回
        </button>
        <h3 className="text-[15px] font-semibold">我理解你想做「{draft.title}」</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">以下功能由 AI 推导，确认后开始生成</p>
      </div>

      <ScrollArea className="flex-1 px-5 py-3">
        <div className="flex flex-col gap-4">
          <div className="flex flex-wrap gap-1.5">
            {draft.constraints.auth && <ConstraintBadge label="需要登录" />}
            {draft.constraints.database && <ConstraintBadge label="需要数据库" />}
            {draft.constraints.file_upload && <ConstraintBadge label="文件上传" />}
            {draft.constraints.email && <ConstraintBadge label="邮件通知" />}
            {draft.constraints.payments && <ConstraintBadge label="支付功能" />}
          </div>

          {(['high', 'medium', 'low'] as const).map((tier) => {
            const features = byConfidence(tier)
            if (features.length === 0) return null
            return (
              <div key={tier}>
                <div className={cn('mb-1.5 text-[11px] font-semibold uppercase tracking-wide', CONFIDENCE_CLASS[tier])}>
                  {CONFIDENCE_LABEL[tier]}
                </div>
                <div className="flex flex-col gap-1">
                  {features.map((f) => (
                    <FeatureRow key={f.id} feature={f} onToggle={() => toggleFeature(f.id)} />
                  ))}
                </div>
              </div>
            )
          })}

          {draft.clarifying_questions.length > 0 && (
            <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-3 py-2.5">
              <p className="mb-1.5 text-xs text-yellow-500">⚠ AI 有几个疑问</p>
              {draft.clarifying_questions.map((q, i) => (
                <p key={i} className="mb-0.5 text-xs text-muted-foreground">• {q}</p>
              ))}
            </div>
          )}

          <div>
            <p className="mb-1.5 text-xs text-muted-foreground">还有什么要补充的？</p>
            <Textarea
              value={supplement}
              onChange={(e) => setSupplement(e.target.value)}
              placeholder="例如：需要支持多语言、要有黑暗模式..."
              rows={2}
              className="resize-none text-sm"
            />
          </div>
        </div>
      </ScrollArea>

      <div className="border-t border-border/50 px-5 py-3">
        <Button
          onClick={handleConfirm}
          disabled={selectedCount === 0 || isStarting || isCreating}
          className="w-full"
        >
          {isStarting || isCreating
            ? '启动中...'
            : `确认并生成 (${selectedCount} 个功能)`
          }
        </Button>
      </div>
    </div>
  )
}

function FeatureRow({ feature, onToggle }: { feature: DraftFeature; onToggle: () => void }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={cn(
      'overflow-hidden rounded border transition-all',
      feature.selected ? 'border-border bg-card' : 'border-border/30 opacity-50'
    )}>
      <div
        className="flex cursor-pointer items-center gap-2.5 px-3 py-2"
        onClick={() => setExpanded(!expanded)}
      >
        <Checkbox
          checked={feature.selected}
          onCheckedChange={onToggle}
          onClick={(e) => e.stopPropagation()}
        />
        <span className="flex-1 text-sm font-medium">{feature.name}</span>
        <span className="text-xs text-muted-foreground">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className="flex flex-col gap-0.5 pb-2.5 pl-9 pr-3">
          {feature.acceptance_criteria.map((c, i) => (
            <p key={i} className="text-xs text-muted-foreground">• {c}</p>
          ))}
        </div>
      )}
    </div>
  )
}

function ConstraintBadge({ label }: { label: string }) {
  return (
    <Badge variant="secondary" className="text-[11px]">{label}</Badge>
  )
}
