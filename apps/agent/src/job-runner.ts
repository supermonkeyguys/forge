import { Orchestrator } from './orchestrator/orchestrator.js'
import { ForgeSandbox } from './sandbox/e2b-client.js'
import { MockSandbox } from './sandbox/mock-sandbox.js'
import { loadNextjsTemplate } from './sandbox/template-loader.js'
import type { OrchestratorState, OrchestratorContext } from './orchestrator/state-machine.js'
import type { ProgressEvent } from './agents/types.js'
import type { DraftSpec } from './agents/pm-agent.js'
import { notifyGoAPI } from './lib/go-api-client.js'
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
  jobStore.patch(job.id, { status: 'running', updatedAt: new Date().toISOString() })

  const e2bKey = process.env['E2B_API_KEY'] ?? ''
  const useMock = !e2bKey || e2bKey === 'mock' || e2bKey.startsWith('e2b_your')
  const sandbox = useMock
    ? new MockSandbox()
    : await ForgeSandbox.create()

  if (!useMock) {
    const templateFiles = loadNextjsTemplate()
    await (sandbox as ForgeSandbox).writeFiles(templateFiles)
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

  const orc = new Orchestrator(job.projectId, userInput, {
    sandbox: sandboxAdapter,
    agentOverrides,

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
  })

  jobStore.setOrchestrator(job.id, orc)

  const result = await orc.run()

  jobStore.patch(job.id, {
    previewUrl: result.previewUrl,
    status: result.state,
    updatedAt: new Date().toISOString(),
  })
  jobStore.setOrchestrator(job.id, null)

  if (!useMock) {
    const realSandbox = sandbox as ForgeSandbox
    if (result.state === 'done') {
      await realSandbox.keepAlive(30 * 60 * 1000)
    } else {
      await realSandbox.kill()
    }
  }
}
