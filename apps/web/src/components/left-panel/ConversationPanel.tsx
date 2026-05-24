/**
 * Left panel — three phases:
 *   input     → RequirementInput (user types what they want)
 *   pm-review → PMReview (user reviews AI-amplified features)
 *   running / done / waiting → ConversationHistory (shows progress + allows iteration)
 */

import { useWorkspaceStore, selectPhase } from '../../store/workspace-store.js'
import { RequirementInput } from './RequirementInput.js'
import { PMReview } from './PMReview.js'
import { ConversationHistory } from './ConversationHistory.js'

export function ConversationPanel() {
  const phase = useWorkspaceStore(selectPhase)

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      borderRight: '1px solid var(--border)',
      background: 'var(--bg-panel)',
    }}>
      {/* Header */}
      <div style={{
        padding: '16px 20px',
        borderBottom: '1px solid var(--border-soft)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
      }}>
        <span style={{ fontSize: 18, fontWeight: 700, letterSpacing: '-0.5px' }}>
          🔨 Forge
        </span>
      </div>

      {/* Content — switches by phase */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {phase === 'input' && <RequirementInput />}
        {phase === 'pm-review' && <PMReview />}
        {(phase === 'running' || phase === 'done' || phase === 'waiting' || phase === 'error') && (
          <ConversationHistory />
        )}
      </div>
    </div>
  )
}
