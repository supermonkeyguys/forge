/**
 * Center panel — Agent collaboration visualizer.
 *
 * Shows:
 *   - Orchestrator state bar at top
 *   - Agent cards grid (one per agent role)
 *   - Collapsible log drawer at bottom
 */

import { useState } from 'react'
import {
  useWorkspaceStore,
  selectAgentCards,
  selectOrchestratorState,
  selectPhase,
  selectEvents,
  type AgentCardState,
} from '../../store/workspace-store.js'

const AGENT_META: Record<string, { label: string; icon: string; description: string }> = {
  pm:         { label: 'PM Agent',        icon: '📋', description: '需求分析与放大' },
  architect:  { label: 'Architect',       icon: '🏗',  description: '技术架构规划' },
  schema:     { label: 'Schema Agent',    icon: '🗄',  description: '数据库 Schema' },
  logic:      { label: 'Logic Agent',     icon: '⚙️',  description: '业务逻辑 + 单测' },
  api:        { label: 'API Agent',       icon: '🔌',  description: 'HTTP 接口层' },
  ui:         { label: 'UI Agent',        icon: '🎨',  description: 'UI 组件 + Stories' },
  page:       { label: 'Page Agent',      icon: '📄',  description: '页面组装' },
  test:       { label: 'Test Agent',      icon: '✅',  description: '验证 + E2E 检查' },
}

export function AgentFlowPanel() {
  const phase = useWorkspaceStore(selectPhase)
  const orchState = useWorkspaceStore(selectOrchestratorState)
  const agentCards = useWorkspaceStore(selectAgentCards)
  const events = useWorkspaceStore(selectEvents)
  const [logOpen, setLogOpen] = useState(false)

  const thinkingEvents = events
    .filter((e) => e.type === 'agent_thinking' || e.type === 'agent_tool_use')
    .slice(-50)

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      background: 'var(--bg)',
    }}>
      {/* Orchestrator state bar */}
      <OrchestratorBar state={orchState} phase={phase} />

      {/* Agent cards */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px' }}>
        {phase === 'input' || phase === 'pm-review' ? (
          <IdleState />
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 12,
          }}>
            {Object.values(agentCards).map((card) => (
              <AgentCard key={card.role} card={card} />
            ))}
          </div>
        )}
      </div>

      {/* Collapsible log drawer */}
      {thinkingEvents.length > 0 && (
        <div style={{ borderTop: '1px solid var(--border)' }}>
          <button
            onClick={() => setLogOpen(!logOpen)}
            style={{
              width: '100%',
              background: 'var(--bg-panel)',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: 12,
              padding: '8px 20px',
              textAlign: 'left',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <span>{logOpen ? '▼' : '▲'}</span>
            AI 思考日志 ({thinkingEvents.length} 条)
          </button>
          {logOpen && (
            <div style={{
              maxHeight: 200,
              overflowY: 'auto',
              padding: '8px 20px',
              background: 'var(--bg-panel)',
            }}>
              {thinkingEvents.map((e, i) => (
                <p key={i} style={{ fontSize: 11, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', marginBottom: 2 }}>
                  [{e.agent}] {e.type === 'agent_thinking' ? e.content : `tool: ${e.tool}`}
                </p>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

// ── Sub-components ────────────────────────────────────────────────

function OrchestratorBar({ state, phase }: { state: string | null; phase: string }) {
  const stateConfig: Record<string, { color: string; label: string }> = {
    analyzing:  { color: 'var(--accent)',  label: '分析需求' },
    planning:   { color: 'var(--accent)',  label: '规划架构' },
    building:   { color: 'var(--accent)',  label: '生成代码' },
    validating: { color: 'var(--yellow)',  label: '验证功能' },
    fixing:     { color: 'var(--yellow)',  label: '修复问题' },
    waiting:    { color: 'var(--yellow)',  label: '等待介入' },
    done:       { color: 'var(--green)',   label: '生成完成' },
  }

  const config = state ? stateConfig[state] : null

  return (
    <div style={{
      padding: '12px 20px',
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      gap: 10,
    }}>
      <span style={{ fontSize: 13, color: 'var(--text-muted)', fontWeight: 500 }}>
        Agent 协作流程
      </span>
      {config && (
        <span style={{
          background: config.color + '20',
          color: config.color,
          border: `1px solid ${config.color}40`,
          borderRadius: 4,
          fontSize: 11,
          padding: '2px 8px',
          fontWeight: 500,
        }}>
          {config.label}
        </span>
      )}
    </div>
  )
}

function AgentCard({ card }: { card: AgentCardState }) {
  const meta = AGENT_META[card.role] ?? { label: card.role, icon: '🤖', description: '' }

  const statusColor = {
    idle:    'var(--text-dim)',
    running: 'var(--accent)',
    done:    'var(--green)',
    error:   'var(--red)',
  }[card.status]

  const elapsed = card.startedAt && card.finishedAt
    ? ((card.finishedAt - card.startedAt) / 1000).toFixed(1) + 's'
    : card.startedAt
    ? Math.floor((Date.now() - card.startedAt) / 1000) + 's'
    : null

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${card.status === 'running' ? 'var(--accent)40' : card.status === 'error' ? 'var(--red)40' : 'var(--border)'}`,
      borderRadius: 'var(--radius)',
      padding: '14px',
      transition: 'border-color 0.2s',
    }}>
      {/* Card header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
        <span style={{ fontSize: 20 }}>{meta.icon}</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13, fontWeight: 600 }}>{meta.label}</div>
          <div style={{ fontSize: 11, color: 'var(--text-dim)' }}>{meta.description}</div>
        </div>
        {/* Status dot */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
          {card.status === 'running' && (
            <span style={{
              width: 7, height: 7, borderRadius: '50%',
              background: 'var(--accent)',
              animation: 'pulse 1.2s ease infinite',
            }} />
          )}
          {card.status === 'done' && <span style={{ fontSize: 12, color: 'var(--green)' }}>✓</span>}
          {card.status === 'error' && <span style={{ fontSize: 12, color: 'var(--red)' }}>✗</span>}
          {elapsed && (
            <span style={{ fontSize: 10, color: 'var(--text-dim)' }}>{elapsed}</span>
          )}
        </div>
      </div>

      {/* Progress dots */}
      <ProgressDots status={card.status} />

      {/* Current action */}
      {card.currentAction && (
        <p style={{
          fontSize: 11,
          color: statusColor,
          marginTop: 8,
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
        }}>
          {card.currentAction}
        </p>
      )}

      {/* Files written */}
      {card.filesWritten.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {card.filesWritten.slice(-3).map((f) => (
            <p key={f} style={{ fontSize: 10, color: 'var(--text-dim)', fontFamily: 'var(--font-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              + {f.split('/').pop()}
            </p>
          ))}
          {card.filesWritten.length > 3 && (
            <p style={{ fontSize: 10, color: 'var(--text-dim)' }}>
              +{card.filesWritten.length - 3} 更多文件
            </p>
          )}
        </div>
      )}
    </div>
  )
}

function ProgressDots({ status }: { status: AgentCardState['status'] }) {
  const filled = { idle: 0, running: 2, done: 5, error: 1 }[status]
  return (
    <div style={{ display: 'flex', gap: 4 }}>
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          style={{
            width: 6, height: 6, borderRadius: '50%',
            background: i < filled ? 'var(--accent)' : 'var(--border)',
            transition: 'background 0.3s',
          }}
        />
      ))}
    </div>
  )
}

function IdleState() {
  return (
    <div style={{
      height: '100%',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      color: 'var(--text-dim)',
    }}>
      <div style={{ fontSize: 48, opacity: 0.3 }}>🤖</div>
      <p style={{ fontSize: 14 }}>Agent 团队待命中</p>
      <p style={{ fontSize: 12 }}>输入需求后，这里会展示每个 Agent 的实时进度</p>
    </div>
  )
}
