import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import type { DraftSpec } from './agents/pm-agent.js'
import { jobStore, type Job } from './job-store.js'
import { runJob } from './job-runner.js'

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

  const { taskId, projectId, userInput, agentOverrides } = body as Record<string, unknown>
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
    agentOverrides: typeof agentOverrides === 'object' && agentOverrides !== null && !Array.isArray(agentOverrides)
      ? agentOverrides as Record<string, string>
      : undefined,
    createdAt: now,
    updatedAt: now,
  }
  jobStore.add(job)

  runJob(job, userInput).catch((err) => {
    jobStore.patch(jobId, {
      status: 'aborted',
      error: err instanceof Error ? err.message : String(err),
      updatedAt: new Date().toISOString(),
    })
  })

  send(res, 202, { data: { jobId, status: 'queued' } })
}

// ── Route: POST /run-kb-ingest ────────────────────────────────────

async function handleRunKBIngest(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: unknown
  try { body = await readBody(req) } catch {
    return sendError(res, 400, 'invalid JSON body')
  }

  const { kbEntryId, kbInputType, kbSourceRef } = body as Record<string, unknown>
  if (typeof kbEntryId !== 'string' || !kbEntryId.trim()) {
    return sendError(res, 400, 'kbEntryId is required')
  }

  const jobId = randomUUID()
  const now = new Date().toISOString()

  const job = {
    id: jobId,
    taskId: null,
    projectId: '',
    status: 'queued' as const,
    events: [],
    draft: null,
    previewUrl: null,
    reviewUrl: null,
    reviewHtml: null,
    error: null,
    waitingReason: null,
    jobType: 'kb_ingest' as const,
    kbEntryId,
    kbSourceRef: typeof kbSourceRef === 'string' ? kbSourceRef : '',
    kbInputType: (kbInputType === 'file' ? 'file' : 'url') as 'url' | 'file',
    createdAt: now,
    updatedAt: now,
  }
  jobStore.add(job)

  runJob(job, '').catch((err) => {
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

  const draft = (body as Record<string, unknown>).draft as DraftSpec | undefined
  jobStore.resolveDraft(jobId, draft ?? job.draft!)
  jobStore.patch(jobId, { draft: null, updatedAt: new Date().toISOString() })

  send(res, 200, { data: { jobId, status: 'confirmed' } })
}

// ── HTTP server ───────────────────────────────────────────────────

export const server = createServer(async (req, res) => {
  const url = req.url ?? '/'
  const method = req.method ?? 'GET'

  if (method === 'GET' && url === '/health') {
    return send(res, 200, { status: 'ok', service: 'forge-agent', jobs: jobStore.size() })
  }

  if (method === 'POST' && url === '/run') {
    return void handleRun(req, res)
  }

  if (method === 'POST' && url === '/run-kb-ingest') {
    return void handleRunKBIngest(req, res)
  }

  const statusMatch = url.match(/^\/status\/([^/]+)$/)
  if (method === 'GET' && statusMatch) {
    return handleStatus(res, statusMatch[1]!)
  }

  const resumeMatch = url.match(/^\/resume\/([^/]+)$/)
  if (method === 'POST' && resumeMatch) {
    return void handleResume(req, res, resumeMatch[1]!)
  }

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

  // GET /jobs/project/:projectId — latest job with incremental events (?since=N)
  const jobsByProjectMatch = url.match(/^\/jobs\/project\/([^/?]+)/)
  if (method === 'GET' && jobsByProjectMatch) {
    const pid = jobsByProjectMatch[1]!
    const sinceParam = new URL(`http://x${url}`).searchParams.get('since')
    const since = sinceParam ? parseInt(sinceParam, 10) : 0

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

  // GET /instructions/:role — serve instruction markdown files
  const instructionsMatch = url.match(/^\/instructions\/([a-z]+)$/)
  if (method === 'GET' && instructionsMatch) {
    const role = instructionsMatch[1]!
    const { readFileSync } = await import('fs')
    const { join, dirname } = await import('path')
    const { fileURLToPath } = await import('url')
    const __dirname = dirname(fileURLToPath(import.meta.url))
    const filePath = join(__dirname, 'templates/instructions', `${role}.md`)
    try {
      const content = readFileSync(filePath, 'utf-8')
      res.writeHead(200, {
        'Content-Type': 'text/plain; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
      })
      res.end(content)
    } catch {
      return sendError(res, 404, `No instructions for role: ${role}`)
    }
    return
  }

  sendError(res, 404, 'not found')
})
