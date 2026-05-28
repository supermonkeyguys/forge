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
import { loadNextjsTemplate } from './sandbox/template-loader.js'
import type { OrchestratorState, OrchestratorContext } from './orchestrator/state-machine.js'
import type { ProgressEvent } from './agents/types.js'
import type { DraftSpec } from './agents/pm-agent.js'

// ── Job store ─────────────────────────────────────────────────────

type JobStatus = 'queued' | 'running' | OrchestratorState

interface Job {
  id: string
  taskId: string | null   // Go API task ID — used for status callbacks
  projectId: string
  status: JobStatus
  events: ProgressEvent[]
  draft: DraftSpec | null        // set when PM Agent produces draft, cleared after confirm
  previewUrl: string | null
  reviewUrl: string | null
  reviewHtml: string | null    // raw HTML cached from sandbox write, served via GET /review/:jobId
  error: string | null
  createdAt: string
  updatedAt: string
  // Internal: resolve the onDraftReady promise when frontend confirms
  _draftResolve: ((draft: DraftSpec) => void) | null
  _orchestrator: Orchestrator | null
}

const jobs = new Map<string, Job>()

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
    createdAt: now,
    updatedAt: now,
    _draftResolve: null,
    _orchestrator: null,
  }
  jobs.set(jobId, job)

  // Start async — do not await
  runJob(job, userInput).catch((err) => {
    job.status = 'aborted'
    job.error = err instanceof Error ? err.message : String(err)
    job.updatedAt = new Date().toISOString()
  })

  send(res, 202, { data: { jobId, status: 'queued' } })
}

// ── Route: GET /status/:jobId ─────────────────────────────────────

function handleStatus(res: ServerResponse, jobId: string): void {
  const job = jobs.get(jobId)
  if (!job) return sendError(res, 404, `job ${jobId} not found`)

  const { _draftResolve: _r, _orchestrator: _o, reviewHtml: _h, ...safe } = job
  send(res, 200, { data: safe })
}

// ── Route: POST /resume/:jobId ────────────────────────────────────

async function handleResume(
  req: IncomingMessage,
  res: ServerResponse,
  jobId: string,
): Promise<void> {
  const job = jobs.get(jobId)
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
  if (job.status === 'running' && job.draft && job._draftResolve) {
    const confirmed: DraftSpec = {
      ...(job.draft),
      // Pass any user amendments as extra clarifying questions
      clarifying_questions: [
        ...(job.draft.clarifying_questions ?? []),
        `User amendment: ${userInput}`,
      ],
    }
    job._draftResolve(confirmed)
    job._draftResolve = null
    job.draft = null
    job.updatedAt = new Date().toISOString()
    return send(res, 200, { data: { jobId, status: 'resumed' } })
  }

  // Case 2: orchestrator is in WAITING state (retries exhausted)
  if (job.status === 'waiting' && job._orchestrator) {
    job._orchestrator.resume(userInput).catch((err) => {
      job.status = 'aborted'
      job.error = err instanceof Error ? err.message : String(err)
      job.updatedAt = new Date().toISOString()
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
  const job = jobs.get(jobId)
  if (!job) return sendError(res, 404, `job ${jobId} not found`)
  if (!job.draft || !job._draftResolve) {
    return sendError(res, 409, `job ${jobId} has no pending draft`)
  }

  let body: unknown
  try { body = await readBody(req) } catch {
    return sendError(res, 400, 'invalid JSON body')
  }

  // Accept the draft as-is or with modifications
  const draft = (body as Record<string, unknown>).draft as DraftSpec | undefined
  job._draftResolve(draft ?? job.draft)
  job._draftResolve = null
  job.draft = null
  job.updatedAt = new Date().toISOString()

  send(res, 200, { data: { jobId, status: 'confirmed' } })
}

// ── Go API callback ─────────────────────────────────────────────────

async function notifyGoAPI(
  taskId: string,
  status: string,
  extras?: { previewUrl?: string; errorMsg?: string },
): Promise<void> {
  const apiUrl = process.env['FORGE_API_URL'] ?? 'http://localhost:8080'
  if (!apiUrl) return

  const token = process.env['INTERNAL_TOKEN'] ?? ''
  const body = JSON.stringify({
    status,
    previewUrl: extras?.previewUrl ?? '',
    errorMsg: extras?.errorMsg ?? '',
  })

  try {
    await fetch(`${apiUrl}/internal/tasks/${taskId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'X-Internal-Token': token } : {}),
      },
      body,
    })
  } catch (err) {
    console.error(`[notifyGoAPI] failed to update task ${taskId} status to ${status}:`, err)
  }
}

// ── Job runner ────────────────────────────────────────────────────

async function runJob(job: Job, userInput: string): Promise<void> {
  job.status = 'running'
  job.updatedAt = new Date().toISOString()

  // Create E2B sandbox
  const sandbox = await ForgeSandbox.create()

  // Push Next.js template files
  const templateFiles = loadNextjsTemplate()
  await sandbox.writeFiles(templateFiles)

  // Build the sandbox adapter (matches SandboxInterface in orchestrator)
  const sandboxAdapter = {
    writeFile: async (path: string, content: string) => {
      if (path === '/home/user/review.html') {
        job.reviewHtml = content    // cache for GET /review/:jobId
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

    onStateChange: async (state: OrchestratorState, ctx: OrchestratorContext) => {
      job.status = state
      if (ctx.reviewUrl) job.reviewUrl = ctx.reviewUrl    // sync reviewUrl from orchestrator context
      job.updatedAt = new Date().toISOString()
      if (job.taskId) {
        const extras =
          state === 'done'
            ? { previewUrl: job.previewUrl ?? undefined }
            : state === 'aborted'
              ? { errorMsg: job.error ?? undefined }
              : undefined
        await notifyGoAPI(job.taskId, state, extras)
      }
    },

    onDraftReady: (draft: DraftSpec): Promise<DraftSpec> => {
      job.draft = draft
      job.updatedAt = new Date().toISOString()
      return new Promise<DraftSpec>((resolve) => {
        job._draftResolve = resolve
      })
    },

    onEvent: (event: ProgressEvent) => {
      job.events.push(event)
      job.updatedAt = new Date().toISOString()
    },
  })

  job._orchestrator = orc

  const result = await orc.run()

  job.previewUrl = result.previewUrl
  job.status = result.state
  job.updatedAt = new Date().toISOString()
  job._orchestrator = null

  // Keep sandbox alive for preview if done, kill otherwise
  if (result.state === 'done') {
    await sandbox.keepAlive(30 * 60 * 1000) // 30 min
  } else {
    await sandbox.kill()
  }
}

// ── HTTP router ───────────────────────────────────────────────────

const server = createServer((req, res) => {
  const url = req.url ?? '/'
  const method = req.method ?? 'GET'

  // GET /health
  if (method === 'GET' && url === '/health') {
    return send(res, 200, { status: 'ok', service: 'forge-agent', jobs: jobs.size })
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
    const job = jobs.get(reviewMatch[1]!)
    if (!job) return sendError(res, 404, `job ${reviewMatch[1]} not found`)
    if (!job.reviewHtml) return sendError(res, 404, 'review HTML not ready yet')
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
    res.end(job.reviewHtml)
    return
  }

  sendError(res, 404, 'not found')
})

const PORT = process.env.PORT ?? '3001'
server.listen(PORT, () => {
  console.log(`forge agent service listening on :${PORT}`)
})
