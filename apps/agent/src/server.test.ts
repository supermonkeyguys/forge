/**
 * HTTP end-to-end integration test for the agent service.
 *
 * Tests the full flow via real HTTP requests:
 *   POST /run → poll for draft → POST /confirm-draft → poll to done
 *
 * LLM calls are mocked at the ai-client level (same approach as orchestrator.test.ts).
 * Sandbox uses MockSandbox (E2B_API_KEY=mock).
 */

import { describe, it, expect, vi, beforeAll, afterAll } from 'vitest'
import http from 'node:http'
import type { AddressInfo } from 'node:net'

// vi.mock is hoisted before imports — LLM is mocked before any agent module loads
vi.mock('./lib/ai-client.js', () => ({
  llmText: vi.fn(),
  anthropic: vi.fn(() => 'mock-model'),
  MODEL: 'test-model',
  BUILDER_MODEL: 'test-builder-model',
}))

// Prevent real HTTP calls back to the Go API
vi.mock('./lib/go-api-client.js', () => ({
  notifyGoAPI: vi.fn().mockResolvedValue(undefined),
}))

// ── HTTP helpers ─────────────────────────────────────────────────

async function httpReq(
  port: number,
  method: string,
  path: string,
  body?: unknown,
): Promise<{ status: number; body: unknown }> {
  return new Promise((resolve, reject) => {
    const payload = body !== undefined ? JSON.stringify(body) : undefined
    const req = http.request(
      {
        hostname: 'localhost',
        port,
        path,
        method,
        headers: {
          'Content-Type': 'application/json',
          ...(payload ? { 'Content-Length': Buffer.byteLength(payload) } : {}),
        },
      },
      (res) => {
        let data = ''
        res.on('data', (chunk) => { data += chunk })
        res.on('end', () => {
          try { resolve({ status: res.statusCode!, body: JSON.parse(data) }) }
          catch { resolve({ status: res.statusCode!, body: data }) }
        })
      },
    )
    req.on('error', reject)
    if (payload) req.write(payload)
    req.end()
  })
}

/** Poll fn() every intervalMs until until() returns true, or throw on timeout. */
async function poll<T>(
  fn: () => Promise<T>,
  until: (v: T) => boolean,
  { intervalMs = 80, maxAttempts = 80 } = {},
): Promise<T> {
  for (let i = 0; i < maxAttempts; i++) {
    const v = await fn()
    if (until(v)) return v
    await new Promise((r) => setTimeout(r, intervalMs))
  }
  throw new Error(`poll() timed out after ${maxAttempts} attempts`)
}

// ── LLM mock responses ────────────────────────────────────────────

function setupLLMMocks(llmText: ReturnType<typeof vi.fn>) {
  llmText.mockImplementation(async (opts: any) => {
    const sys: string = opts?.system ?? ''

    if (sys.includes('product manager')) {
      return {
        text: JSON.stringify({
          title: 'Todo App',
          description: 'A minimal todo list',
          business_domain: 'productivity',
          constraints: { auth: false, database: false, file_upload: false, email: false, payments: false },
          clarifying_questions: [],
          features: [{
            id: 'F001', name: 'Add todo', confidence: 'high',
            acceptance_criteria: ['User can add a todo'], out_of_scope: [],
          }],
        }),
        steps: [],
      }
    }

    if (sys.includes('Architect')) {
      return {
        text: JSON.stringify({
          tech_decisions: { database: 'none' },
          tasks: [{
            id: 'T001', agent: 'schema', action: 'create',
            file: 'schema.prisma', description: 'Prisma schema',
            depends_on: [], feature_ids: ['F001'],
          }],
        }),
        steps: [],
      }
    }

    if (sys.includes('"checks"')) {
      return {
        text: JSON.stringify({
          checks: [{
            criterion: 'User can add a todo', method: 'skip',
            url: null, expected_status: null, expected_body_contains: null,
            skip_reason: 'mocked in test',
          }],
        }),
        steps: [],
      }
    }

    // Builder agents — return any valid code string
    return { text: '// generated\nexport {}', steps: [] }
  })
}

// ── Suite ─────────────────────────────────────────────────────────

describe('Server — HTTP integration', () => {
  let port: number

  beforeAll(async () => {
    // Use in-memory MockSandbox (no E2B calls)
    process.env['E2B_API_KEY'] = 'mock'

    const aiClient = await import('./lib/ai-client.js')
    setupLLMMocks(vi.mocked(aiClient.llmText))

    const { server } = await import('./server.js')
    await new Promise<void>((resolve) => server.listen(0, () => resolve()))
    port = (server.address() as AddressInfo).port
  })

  afterAll(async () => {
    const { server } = await import('./server.js')
    await new Promise<void>((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve())),
    )
  })

  // ── Route smoke tests ─────────────────────────────────────────

  it('GET /health returns 200 ok', async () => {
    const { status, body } = await httpReq(port, 'GET', '/health')
    expect(status).toBe(200)
    expect((body as any).status).toBe('ok')
    expect((body as any).service).toBe('forge-agent')
  })

  it('GET /status/unknown-job returns 404', async () => {
    const { status } = await httpReq(port, 'GET', '/status/no-such-id')
    expect(status).toBe(404)
  })

  it('POST /run with missing projectId returns 400', async () => {
    const { status } = await httpReq(port, 'POST', '/run', { userInput: 'hello' })
    expect(status).toBe(400)
  })

  it('POST /run with missing userInput returns 400', async () => {
    const { status } = await httpReq(port, 'POST', '/run', { projectId: 'p-1' })
    expect(status).toBe(400)
  })

  it('POST /confirm-draft on non-existent job returns 404', async () => {
    const { status } = await httpReq(port, 'POST', '/confirm-draft/ghost-id', {})
    expect(status).toBe(404)
  })

  it('GET /jobs/project/:id with no jobs returns {data:null}', async () => {
    const { status, body } = await httpReq(port, 'GET', '/jobs/project/no-such-project')
    expect(status).toBe(200)
    expect((body as any).data).toBeNull()
  })

  // ── Full flow ─────────────────────────────────────────────────

  it('full flow: POST /run → draft → confirm → done', async () => {
    const projectId = `e2e-${Date.now()}`

    // 1. Start a job
    const runResp = await httpReq(port, 'POST', '/run', {
      projectId,
      userInput: 'Build a simple todo app with add and list features',
    })
    expect(runResp.status).toBe(202)
    const jobId = (runResp.body as any).data.jobId as string
    expect(typeof jobId).toBe('string')

    // 2. Poll /jobs/project/:id until the PM draft is ready
    // Draft is set while status === 'analyzing' (state machine transitions away from 'running' immediately)
    const afterDraft = await poll(
      () => httpReq(port, 'GET', `/jobs/project/${projectId}`),
      ({ body }) => {
        const job = (body as any).data
        if (!job) return false
        if (job.status === 'aborted') throw new Error(`Job aborted early: ${job.error}`)
        return job.draft !== null
      },
    )
    const draft = (afterDraft.body as any).data.draft
    expect(draft).not.toBeNull()
    expect(draft.title).toBe('Todo App')

    // 3. Confirm the draft (user approves PM spec)
    const confirmResp = await httpReq(port, 'POST', `/confirm-draft/${jobId}`, {})
    expect(confirmResp.status).toBe(200)
    expect((confirmResp.body as any).data.status).toBe('confirmed')

    // 4. Poll until done (or fail fast on aborted/waiting)
    const finalPoll = await poll(
      () => httpReq(port, 'GET', `/jobs/project/${projectId}`),
      ({ body }) => {
        const s = (body as any).data?.status
        return s === 'done' || s === 'aborted' || s === 'waiting'
      },
      { maxAttempts: 100, intervalMs: 100 },
    )
    const finalJob = (finalPoll.body as any).data
    expect(finalJob.status).toBe('done')

    // 5. Verify events were emitted
    expect(finalJob.totalEvents).toBeGreaterThan(0)

    // 6. Verify GET /status/:jobId also returns the final state
    const statusResp = await httpReq(port, 'GET', `/status/${jobId}`)
    expect(statusResp.status).toBe(200)
    expect((statusResp.body as any).data.status).toBe('done')

    // 7. reviewHtml should NOT leak in the API response
    expect((statusResp.body as any).data.reviewHtml).toBeUndefined()
    expect((finalJob as any).reviewHtml).toBeUndefined()
  }, 20_000)
})
