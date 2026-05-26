import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useAgentEvents } from '../hooks/useAgentEvents'
import { useWorkspaceStore, selectProjectId } from '../store/workspace-store'
import { ConversationPanel } from '../components/left-panel/ConversationPanel'
import { AgentFlowPanel } from '../components/center-panel/AgentFlowPanel'
import { PreviewPanel } from '../components/right-panel/PreviewPanel'

export function WorkspacePage() {
  const { id } = useParams<{ id: string }>()
  const projectId = id === 'new' ? null : (id ?? null)

  const storeProjectId = useWorkspaceStore(selectProjectId)
  const startGeneration = useWorkspaceStore((s) => s.startGeneration)
  const reset = useWorkspaceStore((s) => s.reset)

  useEffect(() => {
    if (projectId && projectId !== storeProjectId) {
      startGeneration(projectId)
    }
    if (!projectId) {
      reset()
    }
  }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  useAgentEvents(storeProjectId)

  return (
    <div className="grid h-screen overflow-hidden [grid-template-columns:320px_1fr_480px]">
      <ConversationPanel />
      <AgentFlowPanel />
      <PreviewPanel />
    </div>
  )
}
