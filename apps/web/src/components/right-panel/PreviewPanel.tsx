/**
 * Right panel — app preview.
 *
 * Shows an iframe pointing to the E2B sandbox preview URL.
 * While the app is still being generated, shows a placeholder with
 * the current build phase.
 */

import { useState } from 'react'
import {
  useWorkspaceStore,
  selectPreviewUrl,
  selectPhase,
  selectOrchestratorState,
} from '../../store/workspace-store.js'

export function PreviewPanel() {
  const previewUrl = useWorkspaceStore(selectPreviewUrl)
  const phase = useWorkspaceStore(selectPhase)
  const orchState = useWorkspaceStore(selectOrchestratorState)
  const [iframeKey, setIframeKey] = useState(0)

  const handleRefresh = () => setIframeKey((k) => k + 1)

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      borderLeft: '1px solid var(--border)',
      background: 'var(--bg-panel)',
    }}>
      {/* Preview toolbar */}
      <div style={{
        padding: '10px 14px',
        borderBottom: '1px solid var(--border)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        {/* URL bar */}
        <div style={{
          flex: 1,
          background: 'var(--bg-card)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-sm)',
          padding: '5px 10px',
          fontSize: 12,
          color: previewUrl ? 'var(--text)' : 'var(--text-dim)',
          fontFamily: 'var(--font-mono)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {previewUrl ?? 'https://waiting...'}
        </div>

        {/* Open in new tab */}
        {previewUrl && (
          <button
            onClick={() => window.open(previewUrl, '_blank')}
            title="在新标签页打开"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-muted)',
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: 13,
              flexShrink: 0,
            }}
          >
            ↗
          </button>
        )}

        {/* Refresh */}
        {previewUrl && (
          <button
            onClick={handleRefresh}
            title="刷新预览"
            style={{
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-sm)',
              color: 'var(--text-muted)',
              width: 28,
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              cursor: 'pointer',
              fontSize: 13,
              flexShrink: 0,
            }}
          >
            ↻
          </button>
        )}
      </div>

      {/* Preview content */}
      <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
        {previewUrl ? (
          <iframe
            key={iframeKey}
            src={previewUrl}
            style={{
              width: '100%',
              height: '100%',
              border: 'none',
              background: '#fff',
            }}
            title="App Preview"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        ) : (
          <BuildingPlaceholder phase={phase} orchState={orchState} />
        )}
      </div>
    </div>
  )
}

function BuildingPlaceholder({
  phase,
  orchState,
}: {
  phase: string
  orchState: string | null
}) {
  const steps = [
    { state: 'analyzing',  label: '分析需求',   done: false },
    { state: 'planning',   label: '规划架构',   done: false },
    { state: 'building',   label: '生成代码',   done: false },
    { state: 'validating', label: '验证功能',   done: false },
  ]

  const stateOrder = ['analyzing', 'planning', 'building', 'validating', 'done']
  const currentIdx = stateOrder.indexOf(orchState ?? '')

  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 32,
      padding: 24,
    }}>
      {/* Icon */}
      <div style={{ fontSize: 48, opacity: 0.3 }}>
        {phase === 'input' ? '🖥' : phase === 'pm-review' ? '📋' : '⚙️'}
      </div>

      {/* Phase message */}
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 14, color: 'var(--text-muted)', marginBottom: 6 }}>
          {phase === 'input' && '输入需求后预览将出现在这里'}
          {phase === 'pm-review' && '确认需求后开始生成'}
          {(phase === 'running' || phase === 'fixing') && '应用正在生成中...'}
          {phase === 'waiting' && '等待你的指示'}
          {phase === 'error' && '生成遇到问题'}
        </p>
        {orchState && phase === 'running' && (
          <p style={{ fontSize: 12, color: 'var(--text-dim)' }}>{orchState}</p>
        )}
      </div>

      {/* Progress steps */}
      {(phase === 'running' || phase === 'done') && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: 200 }}>
          {steps.map((step, i) => {
            const isDone = i < currentIdx
            const isActive = stateOrder[currentIdx] === step.state
            return (
              <div key={step.state} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{
                  width: 20, height: 20,
                  borderRadius: '50%',
                  border: `2px solid ${isDone ? 'var(--green)' : isActive ? 'var(--accent)' : 'var(--border)'}`,
                  background: isDone ? 'var(--green)' : 'transparent',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  flexShrink: 0,
                  fontSize: 10,
                }}>
                  {isDone && <span style={{ color: '#000' }}>✓</span>}
                  {isActive && <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--accent)', animation: 'pulse 1s ease infinite', display: 'block' }} />}
                </div>
                <span style={{
                  fontSize: 12,
                  color: isDone ? 'var(--green)' : isActive ? 'var(--text)' : 'var(--text-dim)',
                }}>
                  {step.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
