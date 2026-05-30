/**
 * useAgentEvents — two sources of truth:
 *   1. Go API SSE (/api/v1/projects/:id/stream) — done signal with previewUrl
 *   2. Agent service polling (/agent/jobs/project/:id) — rich events + draft detection
 */

import { useEffect, useRef } from 'react'
import { useAuthStore, selectToken } from '@forge/core'
import { useWorkspaceStore } from '../store/workspace-store'
import type { AgentEvent } from '@forge/core'

const TERMINAL_STATUSES = new Set(['done', 'aborted', 'failed'])

export function useAgentEvents(projectId: string | null) {
  const token = useAuthStore(selectToken)
  const addEvent = useWorkspaceStore((s) => s.addEvent)
  const setPreviewUrl = useWorkspaceStore((s) => s.setPreviewUrl)
  const setWaiting = useWorkspaceStore((s) => s.setWaiting)
  const setDraftSpec = useWorkspaceStore((s) => s.setDraftSpec)
  const setAgentJobId = useWorkspaceStore((s) => s.setAgentJobId)
  const setPhase = useWorkspaceStore((s) => s.setPhase)
  const phase = useWorkspaceStore((s) => s.phase)
  const phaseRef = useRef(phase)
  phaseRef.current = phase

  // ── Go API SSE — done event ───────────────────────────────────────
  useEffect(() => {
    if (!projectId || !token) return

    const url = `/api/v1/projects/${projectId}/stream?token=${encodeURIComponent(token)}`
    const es = new EventSource(url)

    es.addEventListener('done', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as { previewUrl: string }
        if (data.previewUrl) setPreviewUrl(data.previewUrl)
      } catch {}
      es.close()
    })

    es.onerror = () => {}

    return () => es.close()
  }, [projectId, token, setPreviewUrl])

  // ── Agent service polling — rich events + draft detection ─────────
  useEffect(() => {
    if (!projectId) return

    let sinceIndex = 0
    let active = true
    let draftShown = false

    const poll = async () => {
      if (!active) return
      try {
        const res = await fetch(`/agent/jobs/project/${projectId}?since=${sinceIndex}`)
        if (!res.ok) return

        const body = await res.json() as {
          data: {
            id: string
            status: string
            previewUrl: string | null
            waitingReason: string | null
            draft: Record<string, unknown> | null
            events: AgentEvent[]
            totalEvents: number
          }
        }
        const job = body.data
        if (!job) return

        // Store job ID on first contact
        if (sinceIndex === 0) setAgentJobId(job.id)

        sinceIndex = job.totalEvents

        for (const event of job.events) {
          addEvent(event)
        }

        // PM draft detected — show review UI
        if (job.draft && !draftShown && phaseRef.current !== 'pm-review') {
          draftShown = true
          const draft = job.draft as any
          setDraftSpec({
            ...draft,
            features: (draft.features ?? []).map((f: any) => ({
              ...f,
              selected: f.selected ?? true,
            })),
            clarifying_questions: draft.clarifying_questions ?? [],
          })
          setPhase('pm-review')
        }

        // Draft was confirmed — draft is now null
        if (!job.draft && draftShown) {
          draftShown = false
        }

        if (job.status === 'done' && job.previewUrl) {
          setPreviewUrl(job.previewUrl)
        }
        if (job.status === 'waiting' && job.waitingReason) {
          setWaiting(job.waitingReason)
        }

        if (TERMINAL_STATUSES.has(job.status)) {
          active = false
        }
      } catch {
        // agent service not running yet — retry next tick
      }
    }

    void poll()
    const interval = setInterval(poll, 1000)

    return () => {
      active = false
      clearInterval(interval)
    }
  }, [projectId, addEvent, setPreviewUrl, setWaiting, setDraftSpec, setAgentJobId, setPhase])
}
