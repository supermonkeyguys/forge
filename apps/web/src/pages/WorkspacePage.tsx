/**
 * WorkspacePage — three-column layout.
 *
 * [Left 320px]        [Center flex-1]       [Right 480px]
 * ConversationPanel   AgentFlowPanel         PreviewPanel
 *
 * projectId comes from the URL param (:id).
 * When id === 'new', the workspace starts in 'input' phase with no project.
 */

import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useAgentEvents } from '../hooks/useAgentEvents.js'
import { useWorkspaceStore, selectProjectId } from '../store/workspace-store.js'
import { ConversationPanel } from '../components/left-panel/ConversationPanel.js'
import { AgentFlowPanel } from '../components/center-panel/AgentFlowPanel.js'
import { PreviewPanel } from '../components/right-panel/PreviewPanel.js'

export function WorkspacePage() {
  const { id } = useParams<{ id: string }>()
  const projectId = id === 'new' ? null : (id ?? null)

  const storeProjectId = useWorkspaceStore(selectProjectId)
  const startGeneration = useWorkspaceStore((s) => s.startGeneration)
  const reset = useWorkspaceStore((s) => s.reset)

  // Sync route param into store when navigating to an existing project.
  // storeProjectId is intentionally excluded from the dep array — the effect
  // must only fire on route changes, not on every store update.
  // Known limitation: if reset() is called externally without a route change
  // (e.g. logout), this effect will not re-fire for the same projectId.
  useEffect(() => {
    if (projectId && projectId !== storeProjectId) {
      startGeneration(projectId)
    }
    if (!projectId) {
      reset()
    }
  }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Connect SSE when a project is active
  useAgentEvents(storeProjectId)

  return (
    <>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '320px 1fr 480px',
        height: '100vh',
        overflow: 'hidden',
      }}>
        <ConversationPanel />
        <AgentFlowPanel />
        <PreviewPanel />
      </div>
    </>
  )
}
