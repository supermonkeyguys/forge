import { useState } from 'react'
import { toast } from '../../../store/toast-store'
import {
  useWorkspaceStore,
  selectDraftSpec,
  selectAgentJobId,
  type DraftFeature,
} from '../../../store/workspace-store'
import { Button } from '../../../components/ui/button'
import { Textarea } from '../../../components/ui/textarea'
import { Icons } from '../../../components/ui/icons'
import { Checkbox } from '../../../components/ui/checkbox'
import { ScrollArea } from '../../../components/ui/scroll-area'
import { cn } from '../../../lib/utils'

const CONFIDENCE_LABEL: Record<DraftFeature['confidence'], string> = {
  high:   '必需',
  medium: '常见',
  low:    '可选',
}

const CONFIDENCE_STYLE: Record<DraftFeature['confidence'], { text: string; bg: string }> = {
  high:   { text: 'text-green-400', bg: 'bg-green-500/10' },
  medium: { text: 'text-primary', bg: 'bg-primary/10' },
  low:    { text: 'text-muted-foreground', bg: 'bg-muted' },
}

export function PMReview() {
  const draft = useWorkspaceStore(selectDraftSpec)
  const setDraftSpec = useWorkspaceStore((s) => s.setDraftSpec)
  const setPhase = useWorkspaceStore((s) => s.setPhase)
  const agentJobId = useWorkspaceStore(selectAgentJobId)

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

  const handleConfirm = async () => {
    if (selectedCount === 0 || isStarting || !agentJobId) return
    setIsStarting(true)

    const confirmedDraft = supplement.trim()
      ? {
          ...draft,
          clarifying_questions: [
            ...(draft.clarifying_questions ?? []),
            supplement.trim(),
          ],
        }
      : draft

    try {
      const res = await fetch(`/agent/confirm-draft/${agentJobId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ draft: confirmedDraft }),
      })
      if (!res.ok) throw new Error('confirm failed')
      setDraftSpec(null)
      setPhase('running')
    } catch {
      setIsStarting(false)
      toast.error('确认失败，请重试')
    }
  }

  const byConfidence = (tier: DraftFeature['confidence']) =>
    draft.features.filter((f) => f.confidence === tier)

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Header */}
      <div className="border-b border-border/40 px-6 pb-4 pt-5">
        <div className="mb-2 flex items-center gap-1.5 text-[10px] text-yellow-400/80">
          <Icons.AlertTriangle className="h-3 w-3" />
          PM Agent 正在等待你确认
        </div>
        <h3 className="text-[15px] font-semibold tracking-tight">
          我理解你想做「<span className="text-gradient">{draft.title}</span>」
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">以下功能由 AI 推导，确认后继续锻造</p>
      </div>

      {/* Feature list */}
      <ScrollArea className="min-h-0 flex-1 px-6 py-4">
        <div className="flex flex-col gap-5">
          {/* Constraints */}
          <div className="flex flex-wrap gap-1.5">
            {draft.constraints.auth && <ConstraintChip label="需要登录" />}
            {draft.constraints.database && <ConstraintChip label="需要数据库" />}
            {draft.constraints.file_upload && <ConstraintChip label="文件上传" />}
            {draft.constraints.email && <ConstraintChip label="邮件通知" />}
            {draft.constraints.payments && <ConstraintChip label="支付功能" />}
          </div>

          {/* Feature tiers */}
          {(['high', 'medium', 'low'] as const).map((tier) => {
            const features = byConfidence(tier)
            if (features.length === 0) return null
            const style = CONFIDENCE_STYLE[tier]
            return (
              <div key={tier}>
                <div className={cn('mb-2 inline-flex items-center gap-1.5 rounded-md px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider', style.bg, style.text)}>
                  {CONFIDENCE_LABEL[tier]}
                </div>
                <div className="flex flex-col gap-1.5">
                  {features.map((f) => (
                    <FeatureRow key={f.id} feature={f} onToggle={() => toggleFeature(f.id)} />
                  ))}
                </div>
              </div>
            )
          })}

          {/* Clarifying questions */}
          {(draft.clarifying_questions ?? []).length > 0 && (
            <div className="rounded-xl border border-yellow-500/20 bg-yellow-500/5 px-4 py-3">
              <p className="mb-2 flex items-center gap-1.5 text-xs font-medium text-yellow-400">
                <Icons.AlertTriangle className="h-3 w-3" /> AI 有几个疑问
              </p>
              {draft.clarifying_questions.map((q, i) => (
                <p key={i} className="mb-0.5 text-xs text-muted-foreground">• {typeof q === 'string' ? q : (q as any).question}</p>
              ))}
            </div>
          )}

          {/* Supplement */}
          <div>
            <p className="mb-2 text-xs font-medium text-muted-foreground">还有什么要补充的？</p>
            <Textarea
              value={supplement}
              onChange={(e) => setSupplement(e.target.value)}
              placeholder="例如：需要支持多语言、要有黑暗模式..."
              rows={2}
              className="resize-none border-border/40 bg-background/50 text-sm"
            />
          </div>
        </div>
      </ScrollArea>

      {/* Confirm */}
      <div className="border-t border-border/40 px-6 py-4">
        <Button
          onClick={handleConfirm}
          disabled={selectedCount === 0 || isStarting || !agentJobId}
          className="w-full"
        >
          {isStarting
            ? '确认中...'
            : `确认并继续 (${selectedCount} 个功能)`
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
      'overflow-hidden rounded-xl border transition-all duration-200',
      feature.selected
        ? 'border-border/60 bg-card/80'
        : 'border-border/20 opacity-40'
    )}>
      <div
        className="flex cursor-pointer items-center gap-3 px-3.5 py-2.5"
        onClick={() => setExpanded(!expanded)}
      >
        <Checkbox
          checked={feature.selected}
          onCheckedChange={onToggle}
          onClick={(e) => e.stopPropagation()}
        />
        <span className="flex-1 text-sm font-medium">{feature.name}</span>
        <span className={cn(
          'text-[10px] text-muted-foreground transition-transform',
          expanded && 'rotate-180'
        )}>▾</span>
      </div>

      {expanded && (
        <div className="flex flex-col gap-0.5 border-t border-border/30 pb-3 pl-10 pr-4 pt-2">
          {feature.acceptance_criteria.map((c, i) => (
            <p key={i} className="text-xs text-muted-foreground">• {c}</p>
          ))}
        </div>
      )}
    </div>
  )
}

function ConstraintChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-md border border-border/40 bg-secondary/50 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      {label}
    </span>
  )
}
