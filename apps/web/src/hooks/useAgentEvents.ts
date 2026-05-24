/**
 * useAgentEvents — subscribes to SSE stream from the Go API.
 * Feeds events directly into the workspace store.
 *
 * Replaces the old hook in hooks/useAgentStream.ts with store integration.
 */

import { useEffect } from 'react'
import { useWorkspaceStore } from '../store/workspace-store.js'
import type { AgentEvent } from '@forge/core'

export function useAgentEvents(projectId: string | null) {
  const addEvent = useWorkspaceStore((s) => s.addEvent)
  const setPreviewUrl = useWorkspaceStore((s) => s.setPreviewUrl)
  const setWaiting = useWorkspaceStore((s) => s.setWaiting)

  useEffect(() => {
    if (!projectId) return

    const url = `/api/v1/projects/${projectId}/stream`
    const es = new EventSource(url)

    es.addEventListener('agent_event', (e: MessageEvent) => {
      try {
        const event = JSON.parse(e.data) as AgentEvent
        addEvent(event)

        // Handle waiting state
        if (event.type === 'waiting' && event.reason) {
          setWaiting(event.reason)
        }
      } catch {
        // malformed event — ignore
      }
    })

    es.addEventListener('done', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as { previewUrl: string }
        if (data.previewUrl) setPreviewUrl(data.previewUrl)
      } catch {}
      es.close()
    })

    es.onerror = () => {
      // Connection lost — will auto-reconnect (SSE default behavior)
      // If we want explicit reconnect control, we can close and reopen here
    }

    return () => es.close()
  }, [projectId, addEvent, setPreviewUrl, setWaiting])
}
