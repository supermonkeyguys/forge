/**
 * PMReview — shows the AI-amplified feature list for user confirmation.
 *
 * Three confidence tiers:
 *   high   → auto-selected, shown first
 *   medium → auto-selected, shown second
 *   low    → deselected by default, shown last (grayed)
 *
 * User can toggle each feature, edit threshold params (future), and confirm.
 */

import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateProject } from '@forge/core'
import {
  useWorkspaceStore,
  selectDraftSpec,
  type DraftFeature,
} from '../../store/workspace-store.js'

const CONFIDENCE_LABEL: Record<DraftFeature['confidence'], string> = {
  high:   '必需',
  medium: '常见',
  low:    '可选',
}

const CONFIDENCE_COLOR: Record<DraftFeature['confidence'], string> = {
  high:   'var(--green)',
  medium: 'var(--accent)',
  low:    'var(--text-dim)',
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

  const handleBack = () => {
    setPhase('input')
  }

  const byConfidence = (tier: DraftFeature['confidence']) =>
    draft.features.filter((f) => f.confidence === tier)

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Subheader */}
      <div style={{ padding: '16px 20px 12px', borderBottom: '1px solid var(--border-soft)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <button onClick={handleBack} style={{ background: 'none', border: 'none', color: 'var(--text-muted)', fontSize: 13, padding: 0, cursor: 'pointer' }}>
            ← 返回
          </button>
        </div>
        <h3 style={{ fontSize: 15, fontWeight: 600 }}>
          我理解你想做「{draft.title}」
        </h3>
        <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
          以下功能由 AI 推导，确认后开始生成
        </p>
      </div>

      {/* Feature list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 20px', display: 'flex', flexDirection: 'column', gap: 16 }}>

        {/* Constraints badges */}
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {draft.constraints.auth && <ConstraintBadge label="需要登录" />}
          {draft.constraints.database && <ConstraintBadge label="需要数据库" />}
          {draft.constraints.file_upload && <ConstraintBadge label="文件上传" />}
          {draft.constraints.email && <ConstraintBadge label="邮件通知" />}
          {draft.constraints.payments && <ConstraintBadge label="支付功能" />}
        </div>

        {/* Features grouped by confidence */}
        {(['high', 'medium', 'low'] as const).map((tier) => {
          const features = byConfidence(tier)
          if (features.length === 0) return null
          return (
            <div key={tier}>
              <div style={{ fontSize: 11, fontWeight: 600, color: CONFIDENCE_COLOR[tier], marginBottom: 6, letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                {CONFIDENCE_LABEL[tier]}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {features.map((f) => (
                  <FeatureRow key={f.id} feature={f} onToggle={() => toggleFeature(f.id)} />
                ))}
              </div>
            </div>
          )
        })}

        {/* Clarifying questions */}
        {draft.clarifying_questions.length > 0 && (
          <div style={{ background: 'var(--yellow-soft)', border: '1px solid rgba(251,191,36,0.2)', borderRadius: 'var(--radius)', padding: '10px 12px' }}>
            <p style={{ fontSize: 12, color: 'var(--yellow)', marginBottom: 6 }}>⚠ AI 有几个疑问</p>
            {draft.clarifying_questions.map((q, i) => (
              <p key={i} style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 2 }}>• {q}</p>
            ))}
          </div>
        )}

        {/* Supplement input */}
        <div>
          <p style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>还有什么要补充的？</p>
          <textarea
            value={supplement}
            onChange={(e) => setSupplement(e.target.value)}
            placeholder="例如：需要支持多语言、要有黑暗模式..."
            rows={2}
            style={{
              width: '100%',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text)',
              fontSize: 13,
              padding: '8px 10px',
              resize: 'none',
              outline: 'none',
            }}
          />
        </div>
      </div>

      {/* Confirm button */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border-soft)' }}>
        <button
          onClick={handleConfirm}
          disabled={selectedCount === 0 || isStarting || isCreating}
          style={{
            width: '100%',
            background: selectedCount > 0 && !isStarting && !isCreating ? 'var(--accent)' : 'var(--bg-card)',
            color: selectedCount > 0 && !isStarting && !isCreating ? '#fff' : 'var(--text-muted)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius)',
            padding: '10px',
            fontSize: 14,
            fontWeight: 500,
            cursor: selectedCount > 0 && !isStarting && !isCreating ? 'pointer' : 'not-allowed',
            transition: 'all 0.15s',
          }}
        >
          {isStarting || isCreating
            ? '启动中...'
            : `确认并生成 (${selectedCount} 个功能)`
          }
        </button>
      </div>
    </div>
  )
}

function FeatureRow({ feature, onToggle }: { feature: DraftFeature; onToggle: () => void }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div
      style={{
        background: feature.selected ? 'var(--bg-card)' : 'transparent',
        border: `1px solid ${feature.selected ? 'var(--border)' : 'var(--border-soft)'}`,
        borderRadius: 'var(--radius-sm)',
        overflow: 'hidden',
        opacity: feature.selected ? 1 : 0.5,
        transition: 'all 0.15s',
      }}
    >
      <div
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', cursor: 'pointer' }}
        onClick={() => setExpanded(!expanded)}
      >
        {/* Checkbox */}
        <div
          onClick={(e) => { e.stopPropagation(); onToggle() }}
          style={{
            width: 16,
            height: 16,
            borderRadius: 3,
            border: `2px solid ${feature.selected ? 'var(--accent)' : 'var(--border)'}`,
            background: feature.selected ? 'var(--accent)' : 'transparent',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            flexShrink: 0,
            transition: 'all 0.1s',
          }}
        >
          {feature.selected && <span style={{ color: '#fff', fontSize: 10 }}>✓</span>}
        </div>

        <span style={{ flex: 1, fontSize: 13, fontWeight: 500 }}>{feature.name}</span>

        <span style={{ fontSize: 11, color: 'var(--text-dim)' }}>
          {expanded ? '▲' : '▼'}
        </span>
      </div>

      {/* Acceptance criteria (expanded) */}
      {expanded && (
        <div style={{ padding: '0 12px 10px 38px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {feature.acceptance_criteria.map((c, i) => (
            <p key={i} style={{ fontSize: 12, color: 'var(--text-muted)' }}>• {c}</p>
          ))}
        </div>
      )}
    </div>
  )
}

function ConstraintBadge({ label }: { label: string }) {
  return (
    <span style={{
      background: 'var(--accent-soft)',
      color: 'var(--accent)',
      border: '1px solid rgba(91,110,245,0.2)',
      borderRadius: 4,
      fontSize: 11,
      padding: '2px 7px',
      fontWeight: 500,
    }}>
      {label}
    </span>
  )
}
