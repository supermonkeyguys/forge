import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  transition,
  createContext,
  isTerminal,
  type OrchestratorContext,
} from './state-machine.js'
import {
  routeErrors,
  isSurgicalFix,
  affectedAgentCount,
} from './error-router.js'
import { Orchestrator } from './orchestrator.js'
import type { SandboxInterface } from './orchestrator.js'
import type { ValidationError } from '../contracts/validation-report.js'
import type { TaskPlan, PlanTask } from '../contracts/task-plan.js'
import type { DraftSpec } from '../agents/pm-agent.js'

// ── Mock all agent LLM calls ──────────────────────────────────────

vi.mock('ai', () => ({ generateObject: vi.fn(), generateText: vi.fn() }))
vi.mock('@ai-sdk/anthropic', () => ({ anthropic: vi.fn(() => 'mock-model') }))

// ── Fixtures ──────────────────────────────────────────────────────

function makeCtx(
  state: OrchestratorContext['state'],
  retryCount = 0,
  maxRetries = 3,
): OrchestratorContext {
  return {
    projectId: 'proj-1',
    userInput: 'build an expense manager',
    retryCount,
    maxRetries,
    state,
    previewUrl: null,
    pendingUserInput: null,
  }
}

const mockPlan: TaskPlan = {
  spec_id: 'spec-001',
  tech_decisions: { database: 'PostgreSQL' },
  tasks: [
    { id: 'T001', agent: 'schema', action: 'create', file: 'prisma/schema.prisma', description: 'Add models', depends_on: [], status: 'pending' },
    { id: 'T002', agent: 'logic',  action: 'create', file: 'packages/core/expense/use-submit.ts', description: 'Submit hook', depends_on: ['T003'], status: 'pending' },
    { id: 'T003', agent: 'api',    action: 'create', file: 'app/api/expense-reports/route.ts', description: 'POST route', depends_on: ['T001'], status: 'pending' },
    { id: 'T004', agent: 'ui',     action: 'create', file: 'packages/ui/expense-form/expense-form.tsx', description: 'Form component', depends_on: [], status: 'pending' },
    { id: 'T005', agent: 'page',   action: 'create', file: 'app/submit-expense/page.tsx', description: 'Submit page', depends_on: ['T002', 'T004'], status: 'pending' },
  ],
}

// ── State machine transition() ────────────────────────────────────

describe('transition()', () => {
  it('idle + START → analyzing', () => {
    expect(transition(makeCtx('idle'), { type: 'START' })).toBe('analyzing')
  })

  it('analyzing + SPEC_READY → planning', () => {
    expect(transition(makeCtx('analyzing'), { type: 'SPEC_READY' })).toBe('planning')
  })

  it('planning + PLAN_READY → building', () => {
    expect(transition(makeCtx('planning'), { type: 'PLAN_READY' })).toBe('building')
  })

  it('building + BUILD_DONE → validating', () => {
    expect(transition(makeCtx('building'), { type: 'BUILD_DONE' })).toBe('validating')
  })

  it('validating + VALIDATION_PASSED → done', () => {
    expect(transition(makeCtx('validating'), { type: 'VALIDATION_PASSED' })).toBe('done')
  })

  it('validating + VALIDATION_FAILED + retries left → fixing', () => {
    expect(transition(makeCtx('validating', 1, 3), { type: 'VALIDATION_FAILED' })).toBe('fixing')
  })

  it('validating + VALIDATION_FAILED + retries exhausted → waiting', () => {
    expect(transition(makeCtx('validating', 3, 3), { type: 'VALIDATION_FAILED' })).toBe('waiting')
  })

  it('fixing + BUILD_DONE → validating', () => {
    expect(transition(makeCtx('fixing'), { type: 'BUILD_DONE' })).toBe('validating')
  })

  it('waiting + USER_INPUT → analyzing', () => {
    expect(transition(makeCtx('waiting'), { type: 'USER_INPUT', input: 'add export to excel' })).toBe('analyzing')
  })

  it('any state + ABORT → aborted', () => {
    for (const state of ['idle', 'analyzing', 'building', 'validating', 'fixing', 'waiting'] as const) {
      expect(transition(makeCtx(state), { type: 'ABORT' })).toBe('aborted')
    }
  })

  it('done is terminal — no further transitions', () => {
    expect(transition(makeCtx('done'), { type: 'START' })).toBe('done')
    expect(transition(makeCtx('done'), { type: 'BUILD_DONE' })).toBe('done')
  })

  it('unhandled event returns current state (no-op)', () => {
    expect(transition(makeCtx('planning'), { type: 'BUILD_DONE' })).toBe('planning')
  })
})

describe('isTerminal()', () => {
  it('done is terminal', () => expect(isTerminal('done')).toBe(true))
  it('aborted is terminal', () => expect(isTerminal('aborted')).toBe(true))
  it('building is not terminal', () => expect(isTerminal('building')).toBe(false))
  it('waiting is not terminal', () => expect(isTerminal('waiting')).toBe(false))
})

describe('createContext()', () => {
  it('starts in idle state', () => {
    const ctx = createContext('p1', 'input')
    expect(ctx.state).toBe('idle')
    expect(ctx.retryCount).toBe(0)
  })

  it('respects custom maxRetries', () => {
    const ctx = createContext('p1', 'input', 5)
    expect(ctx.maxRetries).toBe(5)
  })
})

// ── routeErrors() ─────────────────────────────────────────────────

describe('routeErrors()', () => {
  it('returns empty array when no errors', () => {
    expect(routeErrors([], mockPlan)).toEqual([])
  })

  it('routes schema errors to schema agent', () => {
    const errors: ValidationError[] = [{
      type: 'unit_test', agent: 'schema',
      file: 'prisma/schema.prisma', message: 'migration failed',
    }]
    const instructions = routeErrors(errors, mockPlan)
    expect(instructions[0]!.agent).toBe('schema')
    expect(instructions[0]!.taskIds).toContain('T001')
  })

  it('routes logic errors to logic agent', () => {
    const errors: ValidationError[] = [{
      type: 'unit_test', agent: 'logic',
      file: 'packages/core/expense/use-submit.ts', message: 'hook test failed',
    }]
    const instructions = routeErrors(errors, mockPlan)
    expect(instructions[0]!.agent).toBe('logic')
    expect(instructions[0]!.taskIds).toContain('T002')
  })

  it('routes API errors to api agent', () => {
    const errors: ValidationError[] = [{
      type: 'e2e', agent: 'api',
      file: 'app/api/expense-reports/route.ts', message: 'POST returned 500',
    }]
    const instructions = routeErrors(errors, mockPlan)
    expect(instructions[0]!.agent).toBe('api')
  })

  it('includes error context in instruction', () => {
    const errors: ValidationError[] = [{
      type: 'e2e', agent: 'logic',
      message: 'hook returns undefined on error',
      suggestion: 'check error handler in onError callback',
    }]
    const instructions = routeErrors(errors, mockPlan)
    expect(instructions[0]!.errorContext).toContain('hook returns undefined on error')
    expect(instructions[0]!.errorContext).toContain('check error handler')
  })

  it('groups multiple errors for the same agent', () => {
    const errors: ValidationError[] = [
      { type: 'unit_test', agent: 'logic', message: 'error A', file: 'packages/core/a.ts' },
      { type: 'unit_test', agent: 'logic', message: 'error B', file: 'packages/core/b.ts' },
    ]
    const instructions = routeErrors(errors, mockPlan)
    const logicInstructions = instructions.filter((i) => i.agent === 'logic')
    expect(logicInstructions).toHaveLength(1)
    expect(logicInstructions[0]!.errorContext).toContain('error A')
    expect(logicInstructions[0]!.errorContext).toContain('error B')
  })

  it('infers agent from error message when agent is unknown', () => {
    const errors: ValidationError[] = [{
      type: 'e2e', agent: 'unknown', message: 'prisma migration error on startup',
    }]
    const instructions = routeErrors(errors, mockPlan)
    expect(instructions[0]!.agent).toBe('schema')
  })

  it('orders instructions: schema → logic → api → ui → page', () => {
    const errors: ValidationError[] = [
      { type: 'e2e', agent: 'page',   message: 'page broken' },
      { type: 'e2e', agent: 'schema', message: 'schema broken' },
      { type: 'e2e', agent: 'api',    message: 'api broken' },
    ]
    const instructions = routeErrors(errors, mockPlan)
    const agents = instructions.map((i) => i.agent)
    expect(agents.indexOf('schema')).toBeLessThan(agents.indexOf('api'))
    expect(agents.indexOf('api')).toBeLessThan(agents.indexOf('page'))
  })
})

describe('isSurgicalFix()', () => {
  it('returns true when single agent with specific task IDs', () => {
    const instructions = [{ agent: 'logic' as const, taskIds: ['T002'], errorContext: '' }]
    expect(isSurgicalFix(instructions)).toBe(true)
  })

  it('returns false when multiple agents involved', () => {
    const instructions = [
      { agent: 'logic' as const, taskIds: ['T002'], errorContext: '' },
      { agent: 'api' as const, taskIds: ['T003'], errorContext: '' },
    ]
    expect(isSurgicalFix(instructions)).toBe(false)
  })

  it('returns false when task IDs are empty', () => {
    const instructions = [{ agent: 'logic' as const, taskIds: [], errorContext: '' }]
    expect(isSurgicalFix(instructions)).toBe(false)
  })
})

describe('affectedAgentCount()', () => {
  it('counts unique agents', () => {
    const instructions = [
      { agent: 'logic' as const, taskIds: [], errorContext: '' },
      { agent: 'logic' as const, taskIds: [], errorContext: '' },
      { agent: 'api' as const, taskIds: [], errorContext: '' },
    ]
    expect(affectedAgentCount(instructions)).toBe(2)
  })
})

// ── Orchestrator integration — mocked agents ──────────────────────

// Shared mock LLM setup for Orchestrator integration tests
async function setupHappyPathMocks() {
  vi.clearAllMocks()
  // Mock global fetch so startAndWaitForServer doesn't actually poll the network
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '<html>ok</html>' }))

  const aiModule = await import('ai')

  // PM Agent draft()
  vi.mocked(aiModule.generateObject)
    .mockResolvedValueOnce({ object: {
      title: 'Expense Manager',
      description: 'Test',
      business_domain: 'expense-management',
      constraints: { auth: true, database: true, file_upload: false, email: false, payments: false },
      clarifying_questions: [],
      features: [{ id: 'F001', name: 'Submit', confidence: 'high', acceptance_criteria: ['User can submit form'], out_of_scope: [] }],
    }} as any)
    // Architect plan()
    .mockResolvedValueOnce({ object: {
      tech_decisions: { database: 'PostgreSQL' },
      tasks: [{ id: 'T001', agent: 'schema', action: 'create', file: 'prisma/schema.prisma', description: 'schema', depends_on: [] }],
    }} as any)
    // Test Agent planE2EChecks()
    .mockResolvedValueOnce({ object: {
      checks: [{ criterion: 'User can submit form', method: 'skip', skip_reason: 'mocked' }],
    }} as any)

  vi.mocked(aiModule.generateText).mockResolvedValue({ text: 'model User {}' } as any)
}

describe('Orchestrator — happy path', () => {
  const mockSandbox = {
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(''),
    run: vi.fn().mockResolvedValue({ stdout: '{"numPassedTests":5,"numFailedTests":0,"testResults":[]}', stderr: '', exitCode: 0 }),
    startBackground: vi.fn().mockResolvedValue(undefined),
    getPreviewUrl: vi.fn().mockReturnValue('https://sandbox-123.e2b.app'),
  }

  beforeEach(async () => {
    await setupHappyPathMocks()
  })

  it('reaches done state on happy path', async () => {
    const states: string[] = []
    const orc = new Orchestrator('proj-1', 'build an expense manager', {
      sandbox: mockSandbox,
      onStateChange: async (state) => { states.push(state) },
      onDraftReady: async (draft) => draft,  // auto-confirm draft
      onEvent: vi.fn(),
    })

    const result = await orc.run()

    expect(result.state).toBe('done')
    expect(states).toContain('analyzing')
    expect(states).toContain('planning')
    expect(states).toContain('building')
    expect(states).toContain('validating')
    expect(states).toContain('done')
  })

  it('sets previewUrl on done', async () => {
    const orc = new Orchestrator('proj-1', 'build', {
      sandbox: mockSandbox,
      onStateChange: async () => {},
      onDraftReady: async (draft) => draft,
      onEvent: vi.fn(),
    })

    const result = await orc.run()
    expect(result.previewUrl).toBe('https://sandbox-123.e2b.app')
  })

  it('calls onStateChange for each transition', async () => {
    const transitions: string[] = []
    const orc = new Orchestrator('proj-1', 'build', {
      sandbox: mockSandbox,
      onStateChange: async (state) => { transitions.push(state) },
      onDraftReady: async (d) => d,
      onEvent: vi.fn(),
    })

    await orc.run()
    // Each state is announced
    expect(transitions.length).toBeGreaterThanOrEqual(5)
  })
})

const FAIL_VITEST_OUTPUT = JSON.stringify({
  numPassedTests: 0,
  numFailedTests: 1,
  testResults: [{
    testFilePath: 'packages/core/x.test.ts',
    status: 'failed',
    testResults: [{ status: 'failed', fullName: 'x', failureMessages: ['boom'] }],
  }],
})

const PASS_VITEST_OUTPUT = JSON.stringify({ numPassedTests: 1, numFailedTests: 0, testResults: [] })

describe('Orchestrator — retry + waiting', () => {
  const failSandbox = {
    writeFile: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(''),
    run: vi.fn().mockResolvedValue({ stdout: FAIL_VITEST_OUTPUT, stderr: '', exitCode: 1 }),
    startBackground: vi.fn().mockResolvedValue(undefined),
    getPreviewUrl: vi.fn().mockReturnValue('https://x.e2b.app'),
  }

  async function setupRetryMocks() {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => 'ok' }))
    const aiModule = await import('ai')

    vi.mocked(aiModule.generateObject)
      .mockResolvedValueOnce({ object: {
        title: 'T', description: 'T', business_domain: 'test',
        constraints: { auth: false, database: false, file_upload: false, email: false, payments: false },
        clarifying_questions: [],
        features: [{ id: 'F001', name: 'F', confidence: 'high', acceptance_criteria: ['x'], out_of_scope: [] }],
      }} as any)
      .mockResolvedValueOnce({ object: {
        tech_decisions: {},
        tasks: [{ id: 'T001', agent: 'schema', action: 'create', file: 'f.prisma', description: 'd', depends_on: [] }],
      }} as any)
      .mockResolvedValue({ object: { checks: [] }} as any)

    vi.mocked(aiModule.generateText).mockResolvedValue({ text: 'code' } as any)
  }

  beforeEach(async () => {
    await setupRetryMocks()
  })

  it('enters waiting state when retries exhausted (maxRetries=1)', async () => {
    const orc = new Orchestrator('proj-1', 'build', {
      sandbox: failSandbox,
      onStateChange: async () => {},
      onDraftReady: async (d) => d,
      onEvent: vi.fn(),
      maxRetries: 1,
    })

    const result = await orc.run()
    expect(result.state).toBe('waiting')
  })

  it('resume() continues from waiting', async () => {
    const aiModule = await import('ai')

    const orc = new Orchestrator('proj-1', 'build', {
      sandbox: failSandbox,
      onStateChange: async () => {},
      onDraftReady: async (d) => d,
      onEvent: vi.fn(),
      maxRetries: 0,  // fail immediately → go straight to waiting
    })

    await orc.run()
    expect(orc.getState()).toBe('waiting')

    // Switch sandbox to pass tests on next run
    vi.mocked(failSandbox.run).mockResolvedValue({ stdout: PASS_VITEST_OUTPUT, stderr: '', exitCode: 0 })

    // Fresh mock chain for the new analyzing → planning → validating cycle
    vi.mocked(aiModule.generateObject)
      .mockResolvedValueOnce({ object: {
        title: 'T2', description: 'T2', business_domain: 'test',
        constraints: { auth: false, database: false, file_upload: false, email: false, payments: false },
        clarifying_questions: [],
        features: [{ id: 'F001', name: 'F', confidence: 'high', acceptance_criteria: ['x'], out_of_scope: [] }],
      }} as any)
      .mockResolvedValueOnce({ object: {
        tech_decisions: {},
        tasks: [{ id: 'T001', agent: 'schema', action: 'create', file: 'f.prisma', description: 'd', depends_on: [] }],
      }} as any)
      .mockResolvedValue({ object: { checks: [] }} as any)

    const result = await orc.resume('please fix the hook')
    expect(result.state).toBe('done')
  }, 15000)

  it('throws if resume called when not in waiting state', async () => {
    const orc = new Orchestrator('proj-1', 'build', {
      sandbox: failSandbox,
      onStateChange: async () => {},
      onDraftReady: async (d) => d,
      onEvent: vi.fn(),
    })
    // Still idle
    await expect(orc.resume('help')).rejects.toThrow('Cannot resume')
  })
})

describe('A2UI integration — review HTML written to sandbox', () => {
  let writtenFiles: Record<string, string>
  let sandbox: SandboxInterface
  let events: string[]

  beforeEach(async () => {
    writtenFiles = {}
    events = []

    // Reset ALL mocks first, then create fresh sandbox — order matters
    vi.resetAllMocks()
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => '<html>ok</html>' }))

    sandbox = {
      writeFile: vi.fn(async (path: string, content: string) => {
        writtenFiles[path] = content
      }),
      readFile: vi.fn(async (path: string) => writtenFiles[path] ?? ''),
      run: vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 })),
      startBackground: vi.fn(async () => {}),
      getPreviewUrl: vi.fn((port: number) => `https://mock-${port}.e2b.dev`),
      keepAlive: vi.fn(async () => {}),
    }

    const aiModule = await import('ai')

    // PM Agent draft() — returns a draft with a recognisable title
    vi.mocked(aiModule.generateObject)
      .mockResolvedValueOnce({ object: {
        title: 'Simple Todo App',
        description: 'A minimal todo list',
        business_domain: 'productivity',
        constraints: { auth: false, database: false, file_upload: false, email: false, payments: false },
        clarifying_questions: [],
        features: [{ id: 'F001', name: 'Add todo', confidence: 'high', acceptance_criteria: ['User can add a todo'], out_of_scope: [] }],
      }} as any)
      // Subsequent calls (planning, validation) — kept minimal so the run can proceed
      .mockResolvedValue({ object: {
        tech_decisions: {},
        tasks: [{ id: 'T001', agent: 'schema', action: 'create', file: 'schema.prisma', description: 'd', depends_on: [] }],
      }} as any)

    vi.mocked(aiModule.generateText).mockResolvedValue({ text: 'code' } as any)
  })

  it('writes review.html to sandbox and sets reviewUrl in context', async () => {
    let capturedReviewUrl: string | null = null

    const orc = new Orchestrator('proj-test', 'Build a simple todo app', {
      sandbox,
      maxRetries: 1,
      onStateChange: vi.fn(async (_state, ctx) => {
        if (ctx.reviewUrl) capturedReviewUrl = ctx.reviewUrl
      }),
      onDraftReady: vi.fn(async (draft) => draft),  // auto-confirm
      onEvent: vi.fn(),
    })

    // Run — may fail at planning/building phase (mocks are incomplete for those)
    // We only care that the analyzing phase ran and wrote review.html
    await orc.run().catch((_err) => {
      // Swallow errors from phases beyond analyzing — we only assert on review.html
    })

    // review.html must have been written to sandbox
    expect(writtenFiles['/home/user/review.html']).toBeDefined()
    const html = writtenFiles['/home/user/review.html']!
    expect(html).toContain('<!DOCTYPE html>')
    // The HTML must contain the draft title injected into the template
    expect(html).toContain('Simple Todo App')

    // reviewUrl must be set to the sandbox preview URL + /review.html
    expect(capturedReviewUrl).not.toBeNull()
    expect(capturedReviewUrl).toBe('https://mock-3000.e2b.dev/review.html')
  })
})
