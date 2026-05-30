/**
 * Forge Agent Service — HTTP entry point (Phase 0: in-memory, no BullMQ)
 *
 * Routes:
 *   POST /run              — start a new generation job
 *   GET  /status/:jobId    — poll job status + events
 *   POST /resume/:jobId    — inject user input into a WAITING job
 *   GET  /health           — liveness probe
 *
 * Phase 1 upgrade path:
 *   Replace the in-memory `jobs` Map with a BullMQ queue.
 *   The Orchestrator and all agents stay untouched.
 */

import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import { Orchestrator } from './orchestrator/orchestrator.js'
import { ForgeSandbox } from './sandbox/e2b-client.js'
import { MockSandbox } from './sandbox/mock-sandbox.js'
import { loadNextjsTemplate } from './sandbox/template-loader.js'
import type { OrchestratorState, OrchestratorContext } from './orchestrator/state-machine.js'
import type { ProgressEvent } from './agents/types.js'
import type { DraftSpec } from './agents/pm-agent.js'
import { notifyGoAPI } from './lib/go-api-client.js'
import { jobStore, type Job } from './job-store.js'

// ── Request helpers ───────────────────────────────────────────────

async function readBody(req: IncomingMessage): Promise<unknown> {
  return new Promise((resolve, reject) => {
    let data = ''
    req.on('data', (chunk) => { data += chunk })
    req.on('end', () => {
      try { resolve(data ? JSON.parse(data) : {}) }
      catch { reject(new Error('invalid JSON')) }
    })
    req.on('error', reject)
  })
}

function send(res: ServerResponse, status: number, body: unknown): void {
  const payload = JSON.stringify(body)
  res.writeHead(status, { 'Content-Type': 'application/json' })
  res.end(payload)
}

function sendError(res: ServerResponse, status: number, message: string): void {
  send(res, status, { error: { code: statusCodeToName(status), message } })
}

function statusCodeToName(code: number): string {
  const names: Record<number, string> = {
    400: 'BAD_REQUEST', 404: 'NOT_FOUND', 409: 'CONFLICT', 500: 'INTERNAL_ERROR',
  }
  return names[code] ?? 'ERROR'
}

// ── Route: POST /run ──────────────────────────────────────────────

async function handleRun(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: unknown
  try { body = await readBody(req) } catch {
    return sendError(res, 400, 'invalid JSON body')
  }

  const { taskId, projectId, userInput } = body as Record<string, unknown>
  if (typeof projectId !== 'string' || !projectId.trim()) {
    return sendError(res, 400, 'projectId is required')
  }
  if (typeof userInput !== 'string' || !userInput.trim()) {
    return sendError(res, 400, 'userInput is required')
  }

  const jobId = randomUUID()
  const now = new Date().toISOString()

  const job: Job = {
    id: jobId,
    taskId: typeof taskId === 'string' ? taskId : null,
    projectId,
    status: 'queued',
    events: [],
    draft: null,
    previewUrl: null,
    reviewUrl: null,
    reviewHtml: null,
    error: null,
    waitingReason: null,
    createdAt: now,
    updatedAt: now,
  }
  jobStore.add(job)

  // Start async — do not await
  runJob(job, userInput).catch((err) => {
    jobStore.patch(jobId, {
      status: 'aborted',
      error: err instanceof Error ? err.message : String(err),
      updatedAt: new Date().toISOString(),
    })
  })

  send(res, 202, { data: { jobId, status: 'queued' } })
}

// ── Route: GET /status/:jobId ─────────────────────────────────────

function handleStatus(res: ServerResponse, jobId: string): void {
  const job = jobStore.get(jobId)
  if (!job) return sendError(res, 404, `job ${jobId} not found`)

  const { reviewHtml: _h, ...safe } = job
  send(res, 200, { data: safe })
}

// ── Route: POST /resume/:jobId ────────────────────────────────────

async function handleResume(
  req: IncomingMessage,
  res: ServerResponse,
  jobId: string,
): Promise<void> {
  const job = jobStore.get(jobId)
  if (!job) return sendError(res, 404, `job ${jobId} not found`)

  let body: unknown
  try { body = await readBody(req) } catch {
    return sendError(res, 400, 'invalid JSON body')
  }

  const { userInput } = body as Record<string, unknown>
  if (typeof userInput !== 'string' || !userInput.trim()) {
    return sendError(res, 400, 'userInput is required')
  }

  // Case 1: job is waiting for user to confirm the PM draft
  if (job.status === 'running' && job.draft && jobStore.hasPendingDraft(jobId)) {
    const confirmed: DraftSpec = {
      ...(job.draft),
      clarifying_questions: [
        ...(job.draft.clarifying_questions ?? []),
        `User amendment: ${userInput}`,
      ],
    }
    jobStore.resolveDraft(jobId, confirmed)
    jobStore.patch(jobId, { draft: null, updatedAt: new Date().toISOString() })
    return send(res, 200, { data: { jobId, status: 'resumed' } })
  }

  // Case 2: orchestrator is in WAITING state (retries exhausted)
  const orc = jobStore.getOrchestrator(jobId)
  if (job.status === 'waiting' && orc) {
    orc.resume(userInput).catch((err) => {
      jobStore.patch(jobId, {
        status: 'aborted',
        error: err instanceof Error ? err.message : String(err),
        updatedAt: new Date().toISOString(),
      })
    })
    return send(res, 200, { data: { jobId, status: 'resumed' } })
  }

  sendError(res, 409, `job ${jobId} is not waiting for input (status: ${job.status})`)
}

// ── Route: POST /confirm-draft/:jobId ────────────────────────────

async function handleConfirmDraft(
  req: IncomingMessage,
  res: ServerResponse,
  jobId: string,
): Promise<void> {
  const job = jobStore.get(jobId)
  if (!job) return sendError(res, 404, `job ${jobId} not found`)
  if (!job.draft || !jobStore.hasPendingDraft(jobId)) {
    return sendError(res, 409, `job ${jobId} has no pending draft`)
  }

  let body: unknown
  try { body = await readBody(req) } catch {
    return sendError(res, 400, 'invalid JSON body')
  }

  // Accept the draft as-is or with modifications
  const draft = (body as Record<string, unknown>).draft as DraftSpec | undefined
  jobStore.resolveDraft(jobId, draft ?? job.draft!)
  jobStore.patch(jobId, { draft: null, updatedAt: new Date().toISOString() })

  send(res, 200, { data: { jobId, status: 'confirmed' } })
}

// ── Job runner ────────────────────────────────────────────────────

async function runJob(job: Job, userInput: string): Promise<void> {
  jobStore.patch(job.id, { status: 'running', updatedAt: new Date().toISOString() })

  // Create sandbox — use MockSandbox when E2B key is placeholder/mock
  const e2bKey = process.env['E2B_API_KEY'] ?? ''
  const useMock = !e2bKey || e2bKey === 'mock' || e2bKey.startsWith('e2b_your')
  const sandbox = useMock
    ? new MockSandbox()
    : await ForgeSandbox.create()

  // Push Next.js template files (real sandbox only)
  if (!useMock) {
    const templateFiles = loadNextjsTemplate()
    await (sandbox as ForgeSandbox).writeFiles(templateFiles)
  }

  // Build the sandbox adapter (matches SandboxInterface in orchestrator)
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

  const orc = new Orchestrator(job.projectId, userInput, {
    sandbox: sandboxAdapter,

    onStateChange: (state: OrchestratorState, ctx: OrchestratorContext) => {
      const current = jobStore.get(job.id)!
      jobStore.patch(job.id, {
        status: state,
        ...(ctx.reviewUrl ? { reviewUrl: ctx.reviewUrl } : {}),
        ...(state === 'waiting' && ctx.pendingUserInput ? { waitingReason: ctx.pendingUserInput } : {}),
        updatedAt: new Date().toISOString(),
      })
      if (current.taskId) {
        const extras =
          state === 'done'
            ? { previewUrl: current.previewUrl ?? undefined }
            : state === 'aborted'
              ? { errorMsg: current.error ?? undefined }
              : undefined
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

  // Keep sandbox alive for preview if done, kill otherwise (no-op for mock)
  if (!useMock) {
    const realSandbox = sandbox as ForgeSandbox
    if (result.state === 'done') {
      await realSandbox.keepAlive(30 * 60 * 1000)
    } else {
      await realSandbox.kill()
    }
  }
}

// ── HTTP router ───────────────────────────────────────────────────

const server = createServer((req, res) => {
  const url = req.url ?? '/'
  const method = req.method ?? 'GET'

  // GET /health
  if (method === 'GET' && url === '/health') {
    return send(res, 200, { status: 'ok', service: 'forge-agent', jobs: jobStore.size() })
  }

  // POST /run
  if (method === 'POST' && url === '/run') {
    return void handleRun(req, res)
  }

  // GET /status/:jobId
  const statusMatch = url.match(/^\/status\/([^/]+)$/)
  if (method === 'GET' && statusMatch) {
    return handleStatus(res, statusMatch[1]!)
  }

  // POST /resume/:jobId
  const resumeMatch = url.match(/^\/resume\/([^/]+)$/)
  if (method === 'POST' && resumeMatch) {
    return void handleResume(req, res, resumeMatch[1]!)
  }

  // POST /confirm-draft/:jobId
  const confirmMatch = url.match(/^\/confirm-draft\/([^/]+)$/)
  if (method === 'POST' && confirmMatch) {
    return void handleConfirmDraft(req, res, confirmMatch[1]!)
  }

  // GET /review/:jobId — serve the A2UI review HTML
  const reviewMatch = url.match(/^\/review\/([^/]+)$/)
  if (method === 'GET' && reviewMatch) {
    const job = jobStore.get(reviewMatch[1]!)
    if (!job) return sendError(res, 404, `job ${reviewMatch[1]} not found`)
    if (!job.reviewHtml) return sendError(res, 404, 'review HTML not ready yet')
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(job.reviewHtml)
    return
  }

  // GET /jobs/project/:projectId — latest job for a project with incremental events
  // ?since=N returns only events at index >= N (for incremental polling)
  const jobsByProjectMatch = url.match(/^\/jobs\/project\/([^/?]+)/)
  if (method === 'GET' && jobsByProjectMatch) {
    const pid = jobsByProjectMatch[1]!
    const sinceParam = new URL(`http://x${url}`).searchParams.get('since')
    const since = sinceParam ? parseInt(sinceParam, 10) : 0

    // Find the most recent job for this project
    let latest: Job | null = null
    for (const job of jobStore.values()) {
      if (job.projectId === pid) {
        if (!latest || job.createdAt > latest.createdAt) latest = job
      }
    }

    if (!latest) return send(res, 200, { data: null })

    const { reviewHtml: _h, ...safe } = latest
    send(res, 200, {
      data: {
        ...safe,
        events: latest.events.slice(since),
        totalEvents: latest.events.length,
      },
    })
    return
  }

  sendError(res, 404, 'not found')
})

const PORT = process.env.PORT ?? '3001'
server.listen(PORT, () => {
  console.log(`forge agent service listening on :${PORT}`)
})
