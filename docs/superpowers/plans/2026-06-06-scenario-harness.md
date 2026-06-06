# Scenario Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a standalone TypeScript scenario runner that executes business flows against real services, captures structured logs per step, and writes agent-readable Markdown reports to `e2e/reports/`.

**Architecture:** A `ScenarioRunner` drives typed `Scenario` objects step-by-step. Each step receives a `ScenarioContext` with an API client (auto-recording all HTTP calls), checkpoint recording, and lazy Playwright access. After all steps complete, a `ReportWriter` generates a structured Markdown file. LLM calls in the agent service are intercepted via `FORGE_USE_STUB=true` to return fixtures.

**Tech Stack:** TypeScript, Vitest (harness unit tests), tsx (script runner), Playwright (UI steps only), fetch (API client), `@ai-sdk/openai` mock for LLM stubs.

---

## File Map

**Create:**
- `e2e/harness/types.ts` — all shared interfaces
- `e2e/harness/log-collector.ts` — records API calls, flushed per step
- `e2e/harness/context.ts` — ScenarioContext (api, checkpoint, pollUntil, state, getPage)
- `e2e/harness/report-writer.ts` — builds Markdown report from Report object
- `e2e/harness/runner.ts` — ScenarioRunner drives scenario execution
- `e2e/harness/stub-registry.ts` — reads LLM fixture files by key
- `e2e/harness/vitest.config.ts` — vitest config scoped to harness/
- `e2e/scenarios/run.ts` — CLI entry point (tsx e2e/scenarios/run.ts <name>)
- `e2e/scenarios/create-project.ts` — first business scenario
- `e2e/fixtures/llm-stubs/default.txt` — default LLM stub fixture
- `e2e/reports/.gitkeep` — keep directory in git

**Modify:**
- `apps/agent/src/lib/ai-client.ts` — add FORGE_USE_STUB check to `llmText()`
- `package.json` (root) — add `tsx` devDep, `test:harness` and `scenario` scripts
- `Makefile` — add `test-harness` and `scenario` targets

---

## Task 1: Root tooling setup

**Files:**
- Modify: `package.json`
- Create: `e2e/harness/vitest.config.ts`
- Create: `e2e/reports/.gitkeep`

- [ ] **Step 1: Add tsx + vitest devDependencies and scripts to root package.json**

Replace the entire `package.json`:

```json
{
  "name": "forge",
  "private": true,
  "scripts": {
    "e2e": "playwright test",
    "e2e:layer1": "playwright test e2e/layer1",
    "e2e:layer2": "playwright test e2e/layer2",
    "test:harness": "vitest run --config e2e/harness/vitest.config.ts",
    "scenario": "tsx e2e/scenarios/run.ts"
  },
  "devDependencies": {
    "@playwright/test": "^1.60.0",
    "rollup-plugin-visualizer": "^7.0.1",
    "tsx": "^4.0.0",
    "vitest": "catalog:"
  }
}
```

- [ ] **Step 2: Create vitest config scoped to e2e/harness/**

Create `e2e/harness/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    environment: 'node',
    include: ['e2e/harness/**/*.test.ts'],
  },
})
```

- [ ] **Step 3: Create reports directory placeholder**

```bash
touch e2e/reports/.gitkeep
echo "e2e/reports/*.md" >> .gitignore
```

- [ ] **Step 4: Install dependencies**

```bash
pnpm install
```

Expected: resolves `tsx` and `vitest` at root, no errors.

- [ ] **Step 5: Verify vitest runs (empty suite)**

```bash
pnpm test:harness
```

Expected: `No test files found` or exit 0 — confirms vitest config is valid.

- [ ] **Step 6: Commit**

```bash
git add package.json e2e/harness/vitest.config.ts e2e/reports/.gitkeep .gitignore
git commit -m "chore(e2e): add tsx + vitest tooling for scenario harness"
```

---

## Task 2: Types foundation

**Files:**
- Create: `e2e/harness/types.ts`

No tests needed — pure interfaces.

- [ ] **Step 1: Create types.ts**

```typescript
// e2e/harness/types.ts

export interface ApiLog {
  method: string
  url: string
  status: number
  body: unknown
  timestamp: number
}

export interface Checkpoint {
  name: string
  passed: boolean
  details?: string
}

export interface StepReport {
  name: string
  status: 'passed' | 'failed' | 'skipped'
  duration: number
  checkpoints: Checkpoint[]
  logs: ApiLog[]
}

export interface Report {
  scenarioName: string
  status: 'passed' | 'failed'
  duration: number
  failedAt?: string
  steps: StepReport[]
}

export interface ApiResponse<T = unknown> {
  status: number
  data: T
}

export interface ScenarioContextApi {
  post<T = unknown>(url: string, body: unknown): Promise<ApiResponse<T>>
  get<T = unknown>(url: string): Promise<ApiResponse<T>>
}

export interface IScenarioContext {
  api: ScenarioContextApi
  state: Record<string, unknown>
  checkpoint(name: string, passed: boolean, details?: string): void
  flushCheckpoints(): Checkpoint[]
  flushLogs(): ApiLog[]
  pollUntil<T>(
    fn: () => Promise<ApiResponse<T>>,
    condition: (res: ApiResponse<T>) => boolean,
    opts?: { timeout?: number; interval?: number },
  ): Promise<ApiResponse<T>>
  getPage(): Promise<import('@playwright/test').Page>
}

export interface ScenarioStep {
  name: string
  run: (ctx: IScenarioContext) => Promise<void>
}

export interface Scenario {
  name: string
  setup?: (ctx: IScenarioContext) => Promise<void>
  teardown?: (ctx: IScenarioContext) => Promise<void>
  steps: ScenarioStep[]
}
```

- [ ] **Step 2: Confirm TypeScript is valid**

```bash
pnpm -F @forge/web exec tsc --noEmit --project ../../e2e/harness/tsconfig.json 2>/dev/null || npx tsc --noEmit --allowJs --moduleResolution node e2e/harness/types.ts
```

Or just proceed — TypeScript errors will surface when the file is imported.

- [ ] **Step 3: Commit**

```bash
git add e2e/harness/types.ts
git commit -m "feat(e2e): add scenario harness type definitions"
```

---

## Task 3: LogCollector

**Files:**
- Create: `e2e/harness/log-collector.ts`
- Create: `e2e/harness/log-collector.test.ts`

- [ ] **Step 1: Write failing tests**

Create `e2e/harness/log-collector.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { LogCollector } from './log-collector'

describe('LogCollector', () => {
  it('records an API call entry', () => {
    const c = new LogCollector()
    c.record({ method: 'POST', url: '/api/v1/projects', status: 201, body: { data: { id: 'p1' } }, timestamp: 0 })
    expect(c.flush()).toHaveLength(1)
  })

  it('flush returns all recorded entries', () => {
    const c = new LogCollector()
    c.record({ method: 'GET', url: '/api/v1/projects', status: 200, body: {}, timestamp: 0 })
    c.record({ method: 'POST', url: '/api/v1/tasks', status: 201, body: {}, timestamp: 1 })
    const logs = c.flush()
    expect(logs).toHaveLength(2)
    expect(logs[0].method).toBe('GET')
    expect(logs[1].method).toBe('POST')
  })

  it('flush clears the buffer', () => {
    const c = new LogCollector()
    c.record({ method: 'GET', url: '/api/v1/projects', status: 200, body: {}, timestamp: 0 })
    c.flush()
    expect(c.flush()).toHaveLength(0)
  })

  it('independent flush calls do not share state', () => {
    const c = new LogCollector()
    c.record({ method: 'GET', url: '/a', status: 200, body: {}, timestamp: 0 })
    const first = c.flush()
    c.record({ method: 'POST', url: '/b', status: 201, body: {}, timestamp: 1 })
    const second = c.flush()
    expect(first).toHaveLength(1)
    expect(second).toHaveLength(1)
    expect(first[0].url).toBe('/a')
    expect(second[0].url).toBe('/b')
  })
})
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
pnpm test:harness
```

Expected: `Cannot find module './log-collector'`

- [ ] **Step 3: Implement LogCollector**

Create `e2e/harness/log-collector.ts`:

```typescript
import type { ApiLog } from './types'

export class LogCollector {
  private _logs: ApiLog[] = []

  record(entry: ApiLog): void {
    this._logs.push(entry)
  }

  flush(): ApiLog[] {
    const logs = [...this._logs]
    this._logs = []
    return logs
  }
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
pnpm test:harness
```

Expected: `4 passed`

- [ ] **Step 5: Commit**

```bash
git add e2e/harness/log-collector.ts e2e/harness/log-collector.test.ts
git commit -m "feat(e2e): add LogCollector for API call recording"
```

---

## Task 4: ScenarioContext

**Files:**
- Create: `e2e/harness/context.ts`
- Create: `e2e/harness/context.test.ts`

- [ ] **Step 1: Write failing tests**

Create `e2e/harness/context.test.ts`:

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ScenarioContext } from './context'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    status: 201,
    json: async () => ({ data: { id: 'p1' } }),
  }))
})

describe('ScenarioContext — checkpoints', () => {
  it('records a passing checkpoint', () => {
    const ctx = new ScenarioContext()
    ctx.checkpoint('project created', true)
    expect(ctx.flushCheckpoints()).toEqual([
      { name: 'project created', passed: true, details: undefined },
    ])
  })

  it('records a failing checkpoint with details', () => {
    const ctx = new ScenarioContext()
    ctx.checkpoint('job completed', false, 'expected: done, actual: building')
    const [c] = ctx.flushCheckpoints()
    expect(c.passed).toBe(false)
    expect(c.details).toBe('expected: done, actual: building')
  })

  it('flushCheckpoints clears the buffer', () => {
    const ctx = new ScenarioContext()
    ctx.checkpoint('test', true)
    ctx.flushCheckpoints()
    expect(ctx.flushCheckpoints()).toHaveLength(0)
  })

  it('state persists across flush calls', () => {
    const ctx = new ScenarioContext()
    ctx.state.projectId = 'proj-1'
    ctx.flushCheckpoints()
    expect(ctx.state.projectId).toBe('proj-1')
  })
})

describe('ScenarioContext — API client', () => {
  it('api.post records a log entry with correct method and url', async () => {
    const ctx = new ScenarioContext()
    await ctx.api.post('/api/v1/projects', { name: 'test' })
    const logs = ctx.flushLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ method: 'POST', url: '/api/v1/projects', status: 201 })
  })

  it('api.get records a log entry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ data: [] }),
    }))
    const ctx = new ScenarioContext()
    await ctx.api.get('/api/v1/projects')
    const logs = ctx.flushLogs()
    expect(logs[0]).toMatchObject({ method: 'GET', status: 200 })
  })

  it('flushLogs clears the buffer', async () => {
    const ctx = new ScenarioContext()
    await ctx.api.post('/api/v1/projects', { name: 'test' })
    ctx.flushLogs()
    expect(ctx.flushLogs()).toHaveLength(0)
  })
})

describe('ScenarioContext — pollUntil', () => {
  it('resolves immediately when condition is met on first call', async () => {
    const ctx = new ScenarioContext()
    const fn = vi.fn().mockResolvedValue({ status: 200, data: { status: 'done' } })
    const result = await ctx.pollUntil(fn, (r) => r.data.status === 'done', { interval: 0 })
    expect(result.data.status).toBe('done')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries until condition is met', async () => {
    const ctx = new ScenarioContext()
    let calls = 0
    const fn = vi.fn().mockImplementation(async () => {
      calls++
      return { status: 200, data: { status: calls < 3 ? 'building' : 'done' } }
    })
    const result = await ctx.pollUntil(fn, (r) => r.data.status === 'done', {
      timeout: 5_000,
      interval: 1,
    })
    expect(result.data.status).toBe('done')
    expect(fn).toHaveBeenCalledTimes(3)
  })
})
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
pnpm test:harness
```

Expected: `Cannot find module './context'`

- [ ] **Step 3: Implement ScenarioContext**

Create `e2e/harness/context.ts`:

```typescript
import type { IScenarioContext, ApiResponse, Checkpoint, ApiLog } from './types'
import { LogCollector } from './log-collector'

const API_BASE = process.env['FORGE_API_URL'] ?? 'http://localhost:8080'

export class ScenarioContext implements IScenarioContext {
  private _checkpoints: Checkpoint[] = []
  private _collector = new LogCollector()
  state: Record<string, unknown> = {}
  private _page: import('@playwright/test').Page | null = null

  api = {
    post: async <T = unknown>(url: string, body: unknown): Promise<ApiResponse<T>> => {
      const token = this.state['_token'] as string | undefined
      const res = await fetch(`${API_BASE}${url}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => null) as T
      this._collector.record({ method: 'POST', url, status: res.status, body: data, timestamp: Date.now() })
      return { status: res.status, data }
    },

    get: async <T = unknown>(url: string): Promise<ApiResponse<T>> => {
      const token = this.state['_token'] as string | undefined
      const res = await fetch(`${API_BASE}${url}`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })
      const data = await res.json().catch(() => null) as T
      this._collector.record({ method: 'GET', url, status: res.status, body: data, timestamp: Date.now() })
      return { status: res.status, data }
    },
  }

  checkpoint(name: string, passed: boolean, details?: string): void {
    this._checkpoints.push({ name, passed, details })
  }

  flushCheckpoints(): Checkpoint[] {
    const c = [...this._checkpoints]
    this._checkpoints = []
    return c
  }

  flushLogs(): ApiLog[] {
    return this._collector.flush()
  }

  async pollUntil<T>(
    fn: () => Promise<ApiResponse<T>>,
    condition: (res: ApiResponse<T>) => boolean,
    opts: { timeout?: number; interval?: number } = {},
  ): Promise<ApiResponse<T>> {
    const { timeout = 30_000, interval = 1_000 } = opts
    const deadline = Date.now() + timeout
    let last: ApiResponse<T> | undefined
    while (Date.now() < deadline) {
      last = await fn()
      if (condition(last)) return last
      await new Promise((r) => setTimeout(r, interval))
    }
    return last ?? fn()
  }

  async getPage(): Promise<import('@playwright/test').Page> {
    if (!this._page) {
      const { chromium } = await import('playwright')
      const browser = await chromium.launch()
      this._page = await browser.newPage()
    }
    return this._page
  }
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
pnpm test:harness
```

Expected: `10 passed`

- [ ] **Step 5: Commit**

```bash
git add e2e/harness/context.ts e2e/harness/context.test.ts
git commit -m "feat(e2e): add ScenarioContext with API client, checkpoint, pollUntil"
```

---

## Task 5: ReportWriter

**Files:**
- Create: `e2e/harness/report-writer.ts`
- Create: `e2e/harness/report-writer.test.ts`

- [ ] **Step 1: Write failing tests**

Create `e2e/harness/report-writer.test.ts`:

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync, mkdirSync, rmSync } from 'fs'
import { ReportWriter } from './report-writer'
import type { Report } from './types'

const TEST_DIR = 'e2e/reports/test-tmp'

beforeEach(() => mkdirSync(TEST_DIR, { recursive: true }))
afterEach(() => rmSync(TEST_DIR, { recursive: true, force: true }))

function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    scenarioName: '创建项目',
    status: 'passed',
    duration: 1200,
    steps: [
      {
        name: 'POST /api/v1/projects',
        status: 'passed',
        duration: 300,
        checkpoints: [{ name: 'project created', passed: true }],
        logs: [{ method: 'POST', url: '/api/v1/projects', status: 201, body: { data: { id: 'p1' } }, timestamp: 0 }],
      },
    ],
    ...overrides,
  }
}

describe('ReportWriter', () => {
  it('writes a markdown file and returns the path', () => {
    const writer = new ReportWriter(TEST_DIR)
    const path = writer.write(makeReport())
    expect(path).toMatch(/\.md$/)
    expect(readFileSync(path, 'utf-8')).toContain('# Scenario: 创建项目')
  })

  it('includes Status: PASSED for passing report', () => {
    const writer = new ReportWriter(TEST_DIR)
    const path = writer.write(makeReport({ status: 'passed' }))
    expect(readFileSync(path, 'utf-8')).toContain('Status: PASSED')
  })

  it('includes Status: FAILED and failed_at for failing report', () => {
    const writer = new ReportWriter(TEST_DIR)
    const report = makeReport({
      status: 'failed',
      failedAt: 'step[0]/checkpoint:project created',
      steps: [
        {
          name: 'POST /api/v1/projects',
          status: 'failed',
          duration: 300,
          checkpoints: [{ name: 'project created', passed: false, details: 'expected 201, got 500' }],
          logs: [],
        },
      ],
    })
    const content = readFileSync(writer.write(report), 'utf-8')
    expect(content).toContain('Status: FAILED')
    expect(content).toContain('Failed at: step[0]/checkpoint:project created')
    expect(content).toContain('❌ project created')
    expect(content).toContain('expected 201, got 500')
  })

  it('marks skipped steps with ⏭', () => {
    const writer = new ReportWriter(TEST_DIR)
    const report = makeReport({
      status: 'failed',
      steps: [
        {
          name: 'step 1',
          status: 'failed',
          duration: 100,
          checkpoints: [{ name: 'ok', passed: false }],
          logs: [],
        },
        {
          name: 'step 2',
          status: 'skipped',
          duration: 0,
          checkpoints: [],
          logs: [],
        },
      ],
    })
    const content = readFileSync(writer.write(report), 'utf-8')
    expect(content).toContain('⏭ skipped')
  })

  it('includes API log entries for each step', () => {
    const writer = new ReportWriter(TEST_DIR)
    const path = writer.write(makeReport())
    expect(readFileSync(path, 'utf-8')).toContain('POST /api/v1/projects → 201')
  })

  it('includes Diagnosis section when status is failed', () => {
    const writer = new ReportWriter(TEST_DIR)
    const report = makeReport({
      status: 'failed',
      steps: [
        {
          name: 'agent job',
          status: 'failed',
          duration: 30000,
          checkpoints: [{ name: 'job completed', passed: false, details: 'timeout 30s' }],
          logs: [],
        },
      ],
    })
    expect(readFileSync(writer.write(report), 'utf-8')).toContain('## Diagnosis')
  })
})
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
pnpm test:harness
```

Expected: `Cannot find module './report-writer'`

- [ ] **Step 3: Implement ReportWriter**

Create `e2e/harness/report-writer.ts`:

```typescript
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { Report, StepReport, Checkpoint, ApiLog } from './types'

function formatDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatDuration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}

function renderCheckpoints(checkpoints: Checkpoint[]): string {
  if (checkpoints.length === 0) return ''
  const lines = checkpoints.map((c) => {
    if (c.passed) return `    ✅ ${c.name}`
    const detail = c.details ? `\n       ${c.details}` : ''
    return `    ❌ ${c.name}${detail}`
  })
  return `  checkpoints:\n${lines.join('\n')}`
}

function renderLogs(logs: ApiLog[]): string {
  if (logs.length === 0) return ''
  const lines = logs.map((l) => `    ${l.method} ${l.url} → ${l.status}`)
  return `  api:\n${lines.join('\n')}`
}

function renderStep(step: StepReport, idx: number): string {
  if (step.status === 'skipped') {
    return `## Step ${idx + 1}: ${step.name} ⏭ skipped`
  }
  const icon = step.status === 'passed' ? '✅' : '❌'
  const parts = [
    `## Step ${idx + 1}: ${step.name} ${icon} ${formatDuration(step.duration)}`,
    renderLogs(step.logs),
    renderCheckpoints(step.checkpoints),
  ].filter(Boolean)
  return parts.join('\n')
}

function renderDiagnosis(report: Report): string {
  const failed = report.steps.find((s) => s.status === 'failed')
  if (!failed) return ''
  const timeoutCp = failed.checkpoints.find(
    (c) => !c.passed && c.details?.includes('timeout'),
  )
  const lines = ['## Diagnosis']
  if (timeoutCp) {
    lines.push(`- step timeout in "${failed.name}": ${timeoutCp.details ?? ''}`)
    lines.push('- possible cause: agent service not processing job or LLM stub not configured')
    lines.push('- relevant files:')
    lines.push('    apps/agent/src/job-runner.ts')
    lines.push('    apps/agent/src/orchestrator/orchestrator.ts')
  } else {
    const failedCp = failed.checkpoints.find((c) => !c.passed)
    lines.push(`- checkpoint "${failedCp?.name ?? 'unknown'}" failed in step "${failed.name}"`)
    if (failedCp?.details) lines.push(`- details: ${failedCp.details}`)
  }
  return lines.join('\n')
}

export class ReportWriter {
  constructor(private readonly dir: string) {}

  write(report: Report): string {
    mkdirSync(this.dir, { recursive: true })
    const slug = report.scenarioName.replace(/\s+/g, '-').replace(/[^\w-]/g, '')
    const filename = `${formatDate()}-${slug}.md`
    const path = join(this.dir, filename)

    const lines: string[] = [
      `# Scenario: ${report.scenarioName}`,
      `Date: ${new Date().toISOString()}`,
      `Status: ${report.status.toUpperCase()}`,
      `Duration: ${formatDuration(report.duration)}`,
    ]
    if (report.failedAt) lines.push(`Failed at: ${report.failedAt}`)
    lines.push('')

    for (let i = 0; i < report.steps.length; i++) {
      lines.push(renderStep(report.steps[i], i))
      lines.push('')
    }

    const diagnosis = renderDiagnosis(report)
    if (diagnosis) lines.push(diagnosis)

    writeFileSync(path, lines.join('\n'))
    return path
  }
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
pnpm test:harness
```

Expected: `6 passed`

- [ ] **Step 5: Commit**

```bash
git add e2e/harness/report-writer.ts e2e/harness/report-writer.test.ts
git commit -m "feat(e2e): add ReportWriter for structured Markdown scenario reports"
```

---

## Task 6: ScenarioRunner

**Files:**
- Create: `e2e/harness/runner.ts`
- Create: `e2e/harness/runner.test.ts`

- [ ] **Step 1: Write failing tests**

Create `e2e/harness/runner.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { ScenarioRunner } from './runner'
import type { Scenario } from './types'

describe('ScenarioRunner', () => {
  it('runs all steps when all pass', async () => {
    const executed: string[] = []
    const scenario: Scenario = {
      name: 'test',
      steps: [
        { name: 'step 1', run: async (ctx) => { executed.push('step 1'); ctx.checkpoint('ok', true) } },
        { name: 'step 2', run: async (ctx) => { executed.push('step 2'); ctx.checkpoint('ok', true) } },
      ],
    }
    const report = await new ScenarioRunner().run(scenario)
    expect(executed).toEqual(['step 1', 'step 2'])
    expect(report.status).toBe('passed')
    expect(report.steps).toHaveLength(2)
    expect(report.steps.every((s) => s.status === 'passed')).toBe(true)
  })

  it('marks report failed when a checkpoint fails', async () => {
    const scenario: Scenario = {
      name: 'test',
      steps: [
        { name: 'step 1', run: async (ctx) => ctx.checkpoint('will fail', false, 'reason') },
      ],
    }
    const report = await new ScenarioRunner().run(scenario)
    expect(report.status).toBe('failed')
    expect(report.steps[0].status).toBe('failed')
    expect(report.steps[0].checkpoints[0].passed).toBe(false)
  })

  it('continues executing steps after checkpoint failure (non-fatal)', async () => {
    const executed: string[] = []
    const scenario: Scenario = {
      name: 'test',
      steps: [
        { name: 'step 1', run: async (ctx) => { executed.push('step 1'); ctx.checkpoint('fail', false) } },
        { name: 'step 2', run: async (ctx) => { executed.push('step 2'); ctx.checkpoint('ok', true) } },
      ],
    }
    const report = await new ScenarioRunner().run(scenario)
    expect(executed).toEqual(['step 1', 'step 2'])
    expect(report.steps[0].status).toBe('failed')
    expect(report.steps[1].status).toBe('passed')
  })

  it('skips remaining steps after unhandled exception (fatal)', async () => {
    const executed: string[] = []
    const scenario: Scenario = {
      name: 'test',
      steps: [
        { name: 'step 1', run: async () => { executed.push('step 1'); throw new Error('crash') } },
        { name: 'step 2', run: async () => { executed.push('step 2') } },
      ],
    }
    const report = await new ScenarioRunner().run(scenario)
    expect(executed).toEqual(['step 1'])
    expect(report.steps[0].status).toBe('failed')
    expect(report.steps[1].status).toBe('skipped')
    expect(report.status).toBe('failed')
  })

  it('records duration for each step', async () => {
    const scenario: Scenario = {
      name: 'test',
      steps: [{ name: 'step 1', run: async (ctx) => ctx.checkpoint('ok', true) }],
    }
    const report = await new ScenarioRunner().run(scenario)
    expect(report.steps[0].duration).toBeGreaterThanOrEqual(0)
    expect(report.duration).toBeGreaterThanOrEqual(0)
  })

  it('calls setup before steps and teardown after steps', async () => {
    const order: string[] = []
    const scenario: Scenario = {
      name: 'test',
      setup: async () => { order.push('setup') },
      teardown: async () => { order.push('teardown') },
      steps: [
        { name: 'step 1', run: async () => { order.push('step 1') } },
      ],
    }
    await new ScenarioRunner().run(scenario)
    expect(order).toEqual(['setup', 'step 1', 'teardown'])
  })

  it('sets failedAt to first failed step and checkpoint', async () => {
    const scenario: Scenario = {
      name: 'test',
      steps: [
        { name: 'create project', run: async (ctx) => ctx.checkpoint('project created', false) },
      ],
    }
    const report = await new ScenarioRunner().run(scenario)
    expect(report.failedAt).toBe('step[0]/checkpoint:project created')
  })
})
```

- [ ] **Step 2: Run tests — confirm they fail**

```bash
pnpm test:harness
```

Expected: `Cannot find module './runner'`

- [ ] **Step 3: Implement ScenarioRunner**

Create `e2e/harness/runner.ts`:

```typescript
import { ScenarioContext } from './context'
import type { Scenario, Report, StepReport } from './types'

export class ScenarioRunner {
  async run(scenario: Scenario): Promise<Report> {
    const start = Date.now()
    const ctx = new ScenarioContext()
    const stepReports: StepReport[] = []
    let hasFatal = false
    let failedAt: string | undefined

    await scenario.setup?.(ctx)

    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i]

      if (hasFatal) {
        stepReports.push({ name: step.name, status: 'skipped', duration: 0, checkpoints: [], logs: [] })
        continue
      }

      const stepStart = Date.now()
      try {
        await step.run(ctx)
      } catch (err) {
        ctx.checkpoint(`step threw: ${err instanceof Error ? err.message : String(err)}`, false)
        hasFatal = true
      }

      const checkpoints = ctx.flushCheckpoints()
      const logs = ctx.flushLogs()
      const duration = Date.now() - stepStart
      const anyFailed = checkpoints.some((c) => !c.passed)
      const status = hasFatal || anyFailed ? 'failed' : 'passed'

      if (status === 'failed' && !failedAt) {
        const failedCp = checkpoints.find((c) => !c.passed)
        failedAt = failedCp
          ? `step[${i}]/checkpoint:${failedCp.name}`
          : `step[${i}]/exception`
      }

      stepReports.push({ name: step.name, status, duration, checkpoints, logs })
    }

    await scenario.teardown?.(ctx)

    const overallStatus = stepReports.some((s) => s.status === 'failed') ? 'failed' : 'passed'
    return {
      scenarioName: scenario.name,
      status: overallStatus,
      duration: Date.now() - start,
      failedAt,
      steps: stepReports,
    }
  }
}
```

- [ ] **Step 4: Run tests — confirm they pass**

```bash
pnpm test:harness
```

Expected: `7 passed`

- [ ] **Step 5: Run full harness suite to confirm no regressions**

```bash
pnpm test:harness
```

Expected: all tests pass (LogCollector + Context + ReportWriter + Runner)

- [ ] **Step 6: Commit**

```bash
git add e2e/harness/runner.ts e2e/harness/runner.test.ts
git commit -m "feat(e2e): add ScenarioRunner with step execution, checkpoint tracking, fatal handling"
```

---

## Task 7: LLM stub + StubRegistry + fixture

**Files:**
- Modify: `apps/agent/src/lib/ai-client.ts`
- Create: `e2e/harness/stub-registry.ts`
- Create: `e2e/fixtures/llm-stubs/default.txt`

- [ ] **Step 1: Read current ai-client.ts**

```bash
cat apps/agent/src/lib/ai-client.ts
```

Confirm it exports `llmText()` as the main LLM call wrapper.

- [ ] **Step 2: Add FORGE_USE_STUB check to llmText()**

Edit `apps/agent/src/lib/ai-client.ts`, replace the `llmText` function:

```typescript
import { readFileSync } from 'fs'
import { resolve } from 'path'

/** generateText with higher retry count to handle relay node flapping.
 *  When FORGE_USE_STUB=true, returns a fixture instead of calling the LLM. */
export async function llmText(opts: Parameters<typeof generateText>[0]) {
  if (process.env['FORGE_USE_STUB'] === 'true') {
    const fixturePath = resolve(process.cwd(), 'e2e/fixtures/llm-stubs/default.txt')
    const text = readFileSync(fixturePath, 'utf-8')
    return { text, usage: { promptTokens: 0, completionTokens: 0 }, finishReason: 'stop' as const }
  }
  return generateText({ maxRetries: 5, ...opts })
}
```

Keep all other exports (`MODEL`, `BUILDER_MODEL`, `anthropic`, `provider`) unchanged.

- [ ] **Step 3: Create default LLM fixture**

Create `e2e/fixtures/llm-stubs/default.txt`:

```
This is a stub LLM response for scenario testing.

Key points:
- Feature: User registration
- Implementation: Standard CRUD
- Tests: Unit and integration

stub_response: true
```

- [ ] **Step 4: Verify agent service still builds**

```bash
pnpm --filter @forge/agent-service build
```

Expected: exit 0, no TypeScript errors.

- [ ] **Step 5: Create StubRegistry**

Create `e2e/harness/stub-registry.ts`:

```typescript
import { readFileSync } from 'fs'
import { resolve } from 'path'

export class StubRegistry {
  private readonly dir: string

  constructor(dir = 'e2e/fixtures/llm-stubs') {
    this.dir = dir
  }

  get(key: string): string {
    const path = resolve(process.cwd(), this.dir, `${key}.txt`)
    return readFileSync(path, 'utf-8')
  }
}
```

- [ ] **Step 6: Commit**

```bash
git add apps/agent/src/lib/ai-client.ts e2e/harness/stub-registry.ts e2e/fixtures/llm-stubs/default.txt
git commit -m "feat(e2e): add FORGE_USE_STUB to llmText() and StubRegistry for CI scenarios"
```

---

## Task 8: create-project scenario + CLI entry point

**Files:**
- Create: `e2e/scenarios/create-project.ts`
- Create: `e2e/scenarios/run.ts`

- [ ] **Step 1: Create the create-project scenario**

Create `e2e/scenarios/create-project.ts`:

```typescript
import type { Scenario } from '../harness/types'

const TEST_EMAIL = process.env['SCENARIO_EMAIL'] ?? 'scenario-test@forge.dev'
const TEST_PASSWORD = process.env['SCENARIO_PASSWORD'] ?? 'scenario-password-123'
const WEB_BASE = process.env['WEB_BASE_URL'] ?? 'http://localhost:5173'

export const createProjectScenario: Scenario = {
  name: '创建项目走流程',

  setup: async (ctx) => {
    // Register test user (409 if already exists → fall back to login)
    const reg = await ctx.api.post<{ data?: { token?: string } }>(
      '/api/v1/auth/register',
      { email: TEST_EMAIL, password: TEST_PASSWORD },
    )
    if (reg.status === 201 && reg.data?.data?.token) {
      ctx.state['_token'] = reg.data.data.token
      return
    }
    // Fall back to login if already registered
    const login = await ctx.api.post<{ data?: { token?: string } }>(
      '/api/v1/auth/login',
      { email: TEST_EMAIL, password: TEST_PASSWORD },
    )
    ctx.state['_token'] = login.data?.data?.token ?? ''
  },

  teardown: async (_ctx) => {
    // No delete-user endpoint — test user is stable across runs
  },

  steps: [
    {
      name: 'POST /api/v1/projects — create project',
      run: async (ctx) => {
        const res = await ctx.api.post<{ data?: { id?: string; status?: string } }>(
          '/api/v1/projects',
          { name: 'scenario-test-project' },
        )
        ctx.checkpoint('status 201', res.status === 201, `got ${res.status}`)
        ctx.checkpoint('has project id', !!res.data?.data?.id, `data: ${JSON.stringify(res.data)}`)
        if (res.data?.data?.id) {
          ctx.state['projectId'] = res.data.data.id
        }
      },
    },

    {
      name: 'GET /api/v1/projects — project appears in list',
      run: async (ctx) => {
        const res = await ctx.api.get<{ data?: Array<{ id: string; name: string }> }>(
          '/api/v1/projects',
        )
        ctx.checkpoint('status 200', res.status === 200, `got ${res.status}`)
        const found = (res.data?.data ?? []).some(
          (p) => p.id === ctx.state['projectId'],
        )
        ctx.checkpoint('project in list', found, `project ${ctx.state['projectId']} not found in list`)
      },
    },

    {
      name: 'UI: /projects page loads after dev login',
      run: async (ctx) => {
        const page = await ctx.getPage()
        // App stores auth in Zustand memory (not localStorage), so use the dev
        // login button — the same flow as layer1/layer2 fixtures.
        // This step verifies the UI layer is reachable; the created project is
        // already verified via API in steps 1 and 2.
        await page.goto(`${WEB_BASE}/login`)
        await page.getByRole('button', { name: '快速登录（开发模式）' }).click()
        await page.waitForURL('**/projects', { timeout: 10_000 })
        const heading = await page.getByRole('heading', { name: '我的项目' }).isVisible().catch(() => false)
        ctx.checkpoint('projects page loaded', heading, '/projects heading not visible after dev login')
      },
    },
  ],
}
```

- [ ] **Step 2: Create CLI entry point**

Create `e2e/scenarios/run.ts`:

```typescript
import { ScenarioRunner } from '../harness/runner'
import { ReportWriter } from '../harness/report-writer'
import type { Scenario } from '../harness/types'
import { createProjectScenario } from './create-project'

const SCENARIOS: Record<string, Scenario> = {
  'create-project': createProjectScenario,
}

const name = process.argv[2]

if (!name || !SCENARIOS[name]) {
  const available = Object.keys(SCENARIOS).join(', ')
  console.error(`Usage: tsx e2e/scenarios/run.ts <scenario-name>`)
  console.error(`Available: ${available}`)
  process.exit(1)
}

const runner = new ScenarioRunner()
const report = await runner.run(SCENARIOS[name])

const writer = new ReportWriter('e2e/reports')
const path = writer.write(report)

console.log(`\nReport: ${path}`)
console.log(`Status: ${report.status.toUpperCase()}`)

process.exit(report.status === 'passed' ? 0 : 1)
```

- [ ] **Step 3: Verify the entry point parses without errors**

```bash
npx tsx --check e2e/scenarios/run.ts 2>/dev/null || npx tsc --noEmit --target ES2022 --module NodeNext --moduleResolution NodeNext e2e/scenarios/run.ts
```

Expected: no errors, or only import-resolution warnings (acceptable at this step).

- [ ] **Step 4: Commit**

```bash
git add e2e/scenarios/create-project.ts e2e/scenarios/run.ts
git commit -m "feat(e2e): add create-project scenario and CLI entry point"
```

---

## Task 9: Makefile wiring + smoke test

**Files:**
- Modify: `Makefile`

- [ ] **Step 1: Add scenario and test-harness targets to Makefile**

Open `Makefile` and add after the `test-e2e` target:

```makefile
test-harness:
	pnpm test:harness

scenario:
	FORGE_USE_STUB=true pnpm scenario $(name)
```

- [ ] **Step 2: Verify test-harness make target runs**

```bash
make test-harness
```

Expected: all harness unit tests pass.

- [ ] **Step 3: Smoke test scenario runner in stub mode (services must be running)**

> **Prerequisite:** Start services: `make dev-api` and `make dev-web` in separate terminals.

```bash
FORGE_USE_STUB=true tsx e2e/scenarios/run.ts create-project
```

Expected:
- Report written to `e2e/reports/YYYY-MM-DD-创建项目走流程.md`
- Exit 0 if services are up and auth works
- Exit 1 with report if any checkpoint fails — check the report for diagnosis

- [ ] **Step 4: Inspect the generated report**

```bash
cat e2e/reports/*.md | head -60
```

Verify the report contains:
- `# Scenario: 创建项目走流程`
- Step headers with ✅ or ❌
- API log entries (method, url, status)
- If any step failed: `## Diagnosis` section

- [ ] **Step 5: Commit**

```bash
git add Makefile
git commit -m "feat(e2e): wire scenario targets into Makefile"
```

---

## Done

The harness is complete when:
- `make test-harness` passes all 20+ unit tests
- `make scenario name=create-project` writes a report to `e2e/reports/`
- Report contains step-level API logs, checkpoints (✅/❌/⏭), and Diagnosis on failure
- Exit code is `0` on pass, `1` on any checkpoint failure
