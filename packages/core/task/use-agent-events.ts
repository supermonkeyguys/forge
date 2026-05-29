/**
 * useAgentEvents — subscribes to SSE stream from Go API.
 * Returns a live list of AgentEvent as the generation progresses.
 */

import { useEffect, useRef, useState } from 'react'
import { useAuthStore, selectToken } from '../auth/auth-store.ts'
import type { AgentEvent, ProjectStatus } from '../types/index.ts'

interface UseAgentEventsResult {
  events: AgentEvent[]
  status: ProjectStatus
  previewUrl: string | null
  isConnected: boolean
}

export function useAgentEvents(projectId: string | null): UseAgentEventsResult {
  const token = useAuthStore(selectToken)
  const [events, setEvents] = useState<AgentEvent[]>([])
  const [status, setStatus] = useState<ProjectStatus>('idle')
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [isConnected, setIsConnected] = useState(false)
  const esRef = useRef<EventSource | null>(null)

  useEffect(() => {
    if (!projectId || !token) return

    const url = `/api/v1/projects/${projectId}/stream?token=${token}`
    const es = new EventSource(url)
    esRef.current = es

    es.onopen = () => setIsConnected(true)

    es.addEventListener('agent_event', (e: MessageEvent) => {
      const event = JSON.parse(e.data) as AgentEvent
      setEvents((prev) => [...prev, event])

      if (event.type === 'state_change' && event.state) {
        setStatus(event.state)
      }
    })

    es.addEventListener('done', (e: MessageEvent) => {
      const data = JSON.parse(e.data) as { previewUrl: string }
      setPreviewUrl(data.previewUrl)
      setStatus('done')
      es.close()
      setIsConnected(false)
    })

    es.onerror = () => {
      setIsConnected(false)
      es.close()
    }

    return () => {
      es.close()
      esRef.current = null
    }
  }, [projectId, token])

  return { events, status, previewUrl, isConnected }
}
