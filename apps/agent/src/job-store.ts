import type { Orchestrator } from './orchestrator/orchestrator.js'
import type { DraftSpec } from './agents/pm-agent.js'
import type { ProgressEvent } from './agents/types.js'
import type { OrchestratorState } from './orchestrator/state-machine.js'

type JobStatus = 'queued' | 'running' | OrchestratorState

export interface Job {
  id: string
  taskId: string | null
  projectId: string
  status: JobStatus
  events: ProgressEvent[]
  draft: DraftSpec | null
  previewUrl: string | null
  reviewUrl: string | null
  reviewHtml: string | null
  error: string | null
  waitingReason: string | null
  agentOverrides?: Record<string, string>  // role → agent DB id
  userId?: string
  jobType?: 'build' | 'kb_ingest' | 'workflow'
  kbEntryId?: string
  kbSourceRef?: string
  kbInputType?: 'url' | 'file'
  createdAt: string
  updatedAt: string
}

interface JobRuntime {
  draftResolve: ((draft: DraftSpec) => void) | null
  orchestrator: Orchestrator | null
}

export class JobStore {
  private jobs = new Map<string, Job>()
  private runtimes = new Map<string, JobRuntime>()

  add(job: Job): void {
    this.jobs.set(job.id, job)
    this.runtimes.set(job.id, { draftResolve: null, orchestrator: null })
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id)
  }

  values(): IterableIterator<Job> {
    return this.jobs.values()
  }

  size(): number {
    return this.jobs.size
  }

  patch(id: string, update: Partial<Job>): void {
    const job = this.jobs.get(id)
    if (job) Object.assign(job, update)
  }

  pushEvent(id: string, event: ProgressEvent): void {
    const job = this.jobs.get(id)
    if (job) {
      job.events.push(event)
      job.updatedAt = new Date().toISOString()
    }
  }

  setOrchestrator(id: string, orc: Orchestrator | null): void {
    const rt = this.runtimes.get(id)
    if (rt) rt.orchestrator = orc
  }

  getOrchestrator(id: string): Orchestrator | null {
    return this.runtimes.get(id)?.orchestrator ?? null
  }

  setDraftResolve(id: string, resolve: ((draft: DraftSpec) => void) | null): void {
    const rt = this.runtimes.get(id)
    if (rt) rt.draftResolve = resolve
  }

  resolveDraft(id: string, draft: DraftSpec): boolean {
    const rt = this.runtimes.get(id)
    if (!rt?.draftResolve) return false
    rt.draftResolve(draft)
    rt.draftResolve = null
    return true
  }

  hasPendingDraft(id: string): boolean {
    return !!this.runtimes.get(id)?.draftResolve
  }
}

export const jobStore = new JobStore()
