import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useAgentEvents, useWorkspaceStore, selectProjectId } from '@forge/core'
import { ConversationPanel } from './components/ConversationPanel'
import { AgentFlowPanel } from './components/AgentFlowPanel'
import { PreviewPanel } from './components/PreviewPanel'

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
    <div className="relative grid flex-1 min-h-0 overflow-hidden bg-background [grid-template-columns:340px_1fr_480px] [grid-template-rows:1fr]">
      {/* Subtle ambient background glow */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        <div className="absolute top-0 left-1/3 h-[400px] w-[600px] -translate-x-1/2 rounded-full bg-primary/3 blur-[150px]" />
      </div>

      <ConversationPanel />
      <AgentFlowPanel />
      <PreviewPanel />
    </div>
  )
}
