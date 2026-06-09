import { runKBIngestJob } from './agent-jobs/kb-ingest.js'
import { Orchestrator } from './orchestrator/orchestrator.js'
import { ForgeSandbox } from './sandbox/e2b-client.js'
import { MockSandbox } from './sandbox/mock-sandbox.js'
import { LocalSandbox } from './sandbox/local-sandbox.js'
import { loadNextjsTemplate } from './sandbox/template-loader.js'
import type { OrchestratorState, OrchestratorContext } from './orchestrator/state-machine.js'
import type { ProgressEvent } from './agents/types.js'
import type { DraftSpec } from './agents/pm-agent.js'
import { notifyGoAPI, writeTaskStep, notifyWorkflowRun } from './lib/go-api-client.js'
import { createProjectContextClient } from './lib/project-context-client.js'
import { jobStore, type Job } from './job-store.js'
import type { CustomAgentConfig } from './agents/builder/custom-agent.js'

async function resolveAgentOverrides(
  overrides: Record<string, string>,
): Promise<Record<string, CustomAgentConfig>> {
  const apiUrl = process.env['FORGE_API_URL']
  const token = process.env['INTERNAL_TOKEN'] ?? ''
  if (!apiUrl) return {}

  const resolved: Record<string, CustomAgentConfig> = {}
  await Promise.all(
    Object.entries(overrides).map(async ([role, agentId]) => {
      try {
        const res = await fetch(`${apiUrl}/internal/agents/${agentId}`, {
          headers: { 'X-Internal-Token': token },
          signal: AbortSignal.timeout(5000),
        })
        if (!res.ok) return
        const json = await res.json() as { data: CustomAgentConfig }
        resolved[role] = json.data
      } catch (err) {
        console.error(`[resolveAgentOverrides] failed to fetch agent ${agentId}:`, err)
      }
    }),
  )
  return resolved
}

export async function runJob(job: Job, userInput: string): Promise<void> {
  if (job.jobType === 'kb_ingest') {
    await runKBIngestJob(
      job.kbEntryId ?? '',
      (job.kbInputType ?? 'url') as 'url' | 'file',
      job.kbSourceRef ?? '',
    )
    return
  }

  jobStore.patch(job.id, { status: 'running', updatedAt: new Date().toISOString() })

  const e2bKey = process.env['E2B_API_KEY'] ?? ''
  const useMock = !e2bKey || e2bKey === 'mock' || e2bKey.startsWith('e2b_your')
  const useLocal = e2bKey === 'local'

  const sandbox = useLocal
    ? new LocalSandbox(job.id)
    : useMock
      ? new MockSandbox()
      : await ForgeSandbox.create()

  // Load Next.js template into sandbox (E2B and local both need real files on disk/remote)
  if (!useMock) {
    const templateFiles = loadNextjsTemplate()
    if (useLocal) {
      await Promise.all(templateFiles.map((f) => sandbox.writeFile(f.path, f.content)))
    } else {
      await (sandbox as ForgeSandbox).writeFiles(templateFiles)
    }
  }

  const sandboxAdapter = {
    writeFile: async (path: string, content: string) => {
      if (path === '/home/user/review.html') {
        jobStore.patch(job.id, { reviewHtml: content })
      }
      return sandbox.writeFile(path, content)
    },
    readFile: (path: string) => sandbox.readFile(path),
    run: (cmd: string, opts?: { cwd?: string; timeoutMs?: number }) => sandbox.run(cmd, opts),
    startBackground: (cmd: string, opts?: { cwd?: string }) => sandbox.startBackground(cmd, opts),
    getPreviewUrl: (port: number) => sandbox.getPreviewUrl(port),
  }

  let agentOverrides: Record<string, CustomAgentConfig> | undefined
  if (job.agentOverrides && Object.keys(job.agentOverrides).length > 0) {
    agentOverrides = await resolveAgentOverrides(job.agentOverrides)
  }

  let stepSeq = 0
  const orc = new Orchestrator(job.projectId, userInput, {
    sandbox: sandboxAdapter,
    agentOverrides,
    contextClient: createProjectContextClient() ?? undefined,
    userID: job.userId ?? undefined,
    skipE2E: useMock,  // false for local and E2B — real server runs so E2E works

    onStateChange: (state: OrchestratorState, ctx: OrchestratorContext) => {
      const current = jobStore.get(job.id)!
      jobStore.patch(job.id, {
        status: state,
        ...(ctx.reviewUrl ? { reviewUrl: ctx.reviewUrl } : {}),
        ...(state === 'waiting' && ctx.pendingUserInput ? { waitingReason: ctx.pendingUserInput } : {}),
        updatedAt: new Date().toISOString(),
      })
      if (current.taskId) {
        const isTerminal = state === 'done' || state === 'aborted'
        const extras = {
          ...(state === 'done'    ? { previewUrl: current.previewUrl ?? undefined } : {}),
          ...(state === 'aborted' ? { errorMsg:   current.error    ?? undefined } : {}),
          // Persist waitingReason in errorMsg so it survives agent restarts
          ...(state === 'waiting' && current.waitingReason ? { errorMsg: current.waitingReason } : {}),
          // Persist full event log on terminal state so the frontend can restore after restarts
          ...(isTerminal ? { events: current.events } : {}),
        }
        notifyGoAPI(current.taskId, state, extras).catch((err: unknown) => {
          console.error('[onStateChange] notifyGoAPI failed:', err)
        })
      }
    },

    onDraftReady: (draft: DraftSpec): Promise<DraftSpec> => {
      jobStore.patch(job.id, { draft, updatedAt: new Date().toISOString() })
      return new Promise<DraftSpec>((resolve) => {
        jobStore.setDraftResolve(job.id, resolve)
      })
    },

    onEvent: (event: ProgressEvent) => {
      jobStore.pushEvent(job.id, event)
    },

    onTaskComplete: (step) => {
      if (!job.taskId) return
      const seqNo = stepSeq++
      writeTaskStep({
        taskId: job.taskId,
        seqNo,
        agent: step.agent,
        summary: step.summary,
        toolCalls: step.toolCalls,
        durationMs: step.durationMs,
        status: step.status,
      }).catch((err: unknown) => {
        console.error('[onTaskComplete] step write failed after retries:', err)
      })
    },
  })

  jobStore.setOrchestrator(job.id, orc)

  const result = await orc.run()

  jobStore.patch(job.id, {
    previewUrl: result.previewUrl,
    status: result.state,
    updatedAt: new Date().toISOString(),
  })
  // Keep orchestrator alive in 'waiting' state so resume() can be called.
  // Only detach on terminal states (done / aborted).
  if (result.state !== 'waiting') {
    jobStore.setOrchestrator(job.id, null)
  }

  if (useLocal) {
    const localSandbox = sandbox as LocalSandbox
    if (result.state !== 'done') await localSandbox.kill()
    // On done: keep the dev server running for preview
  } else if (!useMock) {
    const realSandbox = sandbox as ForgeSandbox
    if (result.state === 'done') {
      await realSandbox.keepAlive(30 * 60 * 1000)
    } else {
      await realSandbox.kill()
    }
  }
}

// ── Workflow Job Execution ────────────────────────────────────────

import { WorkerAgent } from './agents/worker-agent.js'
import type { WorkflowDefinition, WorkflowStep } from './contracts/workflow.js'
import type { RunContext } from './capabilities/types.js'

export async function runWorkflowJob(
  job: Job,
  workflowDefinition: WorkflowDefinition,
): Promise<void> {
  jobStore.patch(job.id, { status: 'running', updatedAt: new Date().toISOString() })

  const worker = new WorkerAgent()
  const previousOutputs: Record<string, string> = {}
  const layers = buildExecutionLayers(workflowDefinition.steps)

  for (const layer of layers) {
    // All steps in this layer are independent — run them concurrently
    const results = await Promise.all(
      layer.map(step => {
        const ctx: RunContext = {
          projectId:       job.projectId,
          jobId:           job.id,
          stepId:          step.id,
          emit:            (event) => jobStore.pushEvent(job.id, event as ProgressEvent),
          previousOutputs: { ...previousOutputs },  // snapshot so parallel steps see same prior outputs
        }
        return worker.execute(step, ctx)
      }),
    )

    // Collect outputs before moving to the next layer
    for (const result of results) {
      previousOutputs[result.stepId] = result.output
    }

    // Abort if any step in this layer failed
    const failed = results.find(r => r.status === 'failed')
    if (failed) {
      jobStore.patch(job.id, {
        status:    'aborted',
        error:     failed.error ?? failed.output,
        updatedAt: new Date().toISOString(),
      })
      if (job.taskId) {
        await notifyWorkflowRun(job.taskId, 'aborted', failed.error ?? undefined)
      }
      return
    }
  }

  jobStore.patch(job.id, { status: 'done', updatedAt: new Date().toISOString() })
  if (job.taskId) {
    await notifyWorkflowRun(job.taskId, 'done')
  }
}

/**
 * Groups steps into execution layers.
 * Steps in the same layer have no dependency on each other and run in parallel.
 * Layer N starts only after every step in layer N-1 has completed.
 */
function buildExecutionLayers(steps: WorkflowStep[]): WorkflowStep[][] {
  const assigned = new Set<string>()
  const layers: WorkflowStep[][] = []

  while (assigned.size < steps.length) {
    const layer = steps.filter(
      s => !assigned.has(s.id) && s.depends_on.every(dep => assigned.has(dep)),
    )
    if (layer.length === 0) break  // cycle guard
    layers.push(layer)
    for (const s of layer) assigned.add(s.id)
  }

  return layers
}
