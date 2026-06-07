/**
 * useAgentEvents — subscribes to two data sources for the workspace.
 *
 * Source 1: Go API SSE (/api/v1/projects/:id/stream)
 *   - Only used for the terminal `done` event with previewUrl.
 *   - Token passed as query param (EventSource does not support custom headers).
 *
 * Source 2: Agent service polling (/agent/jobs/project/:id)
 *   - Rich event stream: agent_start / agent_thinking / agent_file_write / etc.
 *   - Detects PM draft ready → triggers pm-review phase.
 *   - Falls back to persisted events from Go API DB when no live job is found.
 */

import { useEffect, useRef } from 'react'
import { useAuthStore, selectToken } from '../auth/auth-store.ts'
import { useWorkspaceStore } from './workspace-store.ts'
import type { DraftSpec, DraftFeature } from './workspace-store.ts'
import type { AgentEvent, ProjectStatus } from '../types/index.ts'

const TERMINAL_STATUSES = new Set(['done', 'aborted', 'failed'])

// Map agent service job.status → ProjectStatus for the OrchestratorBar
const STATUS_MAP: Record<string, ProjectStatus> = {
  analyzing:  'analyzing',
  planning:   'planning',
  building:   'building',
  validating: 'validating',
  fixing:     'fixing',
  waiting:    'waiting',
  done:       'done',
  aborted:    'failed',
}

export function useAgentEvents(projectId: string | null): void {
  const token = useAuthStore(selectToken)
  const addEvent = useWorkspaceStore((s) => s.addEvent)
  const setPreviewUrl = useWorkspaceStore((s) => s.setPreviewUrl)
  const setWaiting = useWorkspaceStore((s) => s.setWaiting)
  const setDraftSpec = useWorkspaceStore((s) => s.setDraftSpec)
  const setAgentJobId = useWorkspaceStore((s) => s.setAgentJobId)
  const setPhase = useWorkspaceStore((s) => s.setPhase)
  const setOrchestratorState = useWorkspaceStore((s) => s.setOrchestratorState)
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
      } catch { /* ignore malformed event */ }
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
    let restoredFromDB = false

    // Fallback: load persisted events from Go API when agent service has no live job
    const restoreFromDB = async () => {
      if (!token) return
      try {
        const res = await fetch(`/api/v1/projects/${projectId}/tasks/latest/events`, {
          headers: { Authorization: `Bearer ${token}` },
        })
        if (!res.ok) return
        const { data: task } = await res.json() as {
          data: { status: string; previewUrl: string; eventsJson: string } | null
        }
        if (!task?.eventsJson || task.eventsJson === '[]') return
        const events: AgentEvent[] = JSON.parse(task.eventsJson)
        for (const event of events) addEvent(event)
        const mapped = STATUS_MAP[task.status]
        if (mapped) setOrchestratorState(mapped)
        if (task.status === 'done' && task.previewUrl) setPreviewUrl(task.previewUrl)
        if (task.status === 'failed') setPhase('error')
        if (task.status === 'done') setPhase('done')
      } catch { /* DB fallback unavailable, ignore */ }
    }

    let emptyRuns = 0
    let nextPollId: ReturnType<typeof setTimeout> | null = null
    let polling = false

    const scheduleNext = () => {
      if (!active) return
      // Backoff: increase delay after every 3 empty polls, up to 15s max
      const delay = emptyRuns === 0
        ? 1_000
        : Math.min(1_000 * Math.pow(1.5, Math.floor(emptyRuns / 3)), 15_000)
      nextPollId = setTimeout(() => { void poll() }, delay)
    }

    const poll = async () => {
      if (!active) return
      if (document.hidden) return  // visibilitychange will reschedule when tab is visible
      if (polling) return
      polling = true
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
        if (!job) {
          // No live job — attempt one-time restore from DB
          if (!restoredFromDB) {
            restoredFromDB = true
            await restoreFromDB()
          }
          return
        }

        // Store job ID on first contact
        if (sinceIndex === 0) setAgentJobId(job.id)

        sinceIndex = job.totalEvents

        for (const event of job.events) {
          addEvent(event)
        }

        // Track empty runs for backoff
        if (job.events.length === 0) {
          emptyRuns++
        } else {
          emptyRuns = 0
        }

        // Sync orchestrator state for the OrchestratorBar
        const mappedStatus = STATUS_MAP[job.status]
        if (mappedStatus) setOrchestratorState(mappedStatus)

        // PM draft detected — show review UI
        if (job.draft && !draftShown && phaseRef.current !== 'pm-review') {
          draftShown = true
          const draft = job.draft as Record<string, unknown>
          setDraftSpec({
            title: String(draft.title ?? ''),
            description: String(draft.description ?? ''),
            business_domain: String(draft.business_domain ?? ''),
            constraints: (draft.constraints ?? {}) as DraftSpec['constraints'],
            clarifying_questions: (draft.clarifying_questions as string[]) ?? [],
            features: ((draft.features as unknown[]) ?? []).map((f) => {
              const feat = f as Record<string, unknown>
              return {
                id: String(feat.id ?? ''),
                name: String(feat.name ?? ''),
                confidence: (feat.confidence ?? 'medium') as DraftFeature['confidence'],
                acceptance_criteria: (feat.acceptance_criteria as string[]) ?? [],
                out_of_scope: (feat.out_of_scope as string[]) ?? [],
                selected: typeof feat.selected === 'boolean' ? feat.selected : true,
              }
            }),
          })
          setPhase('pm-review')
        }

        // Draft was confirmed — go back to running to show agent cards
        if (!job.draft && draftShown) {
          draftShown = false
          if (phaseRef.current === 'pm-review') {
            setPhase('running')
          }
        }

        if (job.status === 'done' && job.previewUrl) {
          setPreviewUrl(job.previewUrl)
        }
        if (job.status === 'waiting' && job.waitingReason) {
          setWaiting(job.waitingReason)
        }

        if (TERMINAL_STATUSES.has(job.status)) {
          if (job.status !== 'done') setPhase('error')
          active = false
        } else {
          scheduleNext()
        }
      } catch {
        // agent service not running yet — retry next tick
        emptyRuns++
        scheduleNext()
      } finally {
        polling = false
      }
    }

    void poll()

    // Resume polling immediately when tab becomes visible
    const handleVisible = () => {
      if (!document.hidden && active) {
        if (nextPollId !== null) clearTimeout(nextPollId)
        void poll()
      }
    }
    document.addEventListener('visibilitychange', handleVisible)

    return () => {
      active = false
      if (nextPollId !== null) clearTimeout(nextPollId)
      document.removeEventListener('visibilitychange', handleVisible)
    }
  }, [projectId, token, addEvent, setPreviewUrl, setWaiting, setDraftSpec, setAgentJobId, setPhase, setOrchestratorState])
}


