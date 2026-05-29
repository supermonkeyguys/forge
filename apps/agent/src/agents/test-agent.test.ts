import { describe, it, expect, vi, beforeEach } from 'vitest'
import { TestAgent, parseVitestOutput, type SandboxAdapter } from './test-agent.js'
import {
  classifyErrorAgent,
  ValidationReportSchema,
  failedE2EChecks,
  isPassed,
  type E2ECheck,
  type UnitTestResult,
} from '../contracts/validation-report.js'
import type { Spec } from '../contracts/spec.js'

vi.mock('ai', () => ({ generateObject: vi.fn(), generateText: vi.fn() }))
vi.mock('@ai-sdk/anthropic', () => ({ anthropic: vi.fn(() => 'mock-model') }))

// ── Fixtures ──────────────────────────────────────────────────────

const mockSpec: Spec = {
  id: 'spec-001',
  title: 'Expense Manager',
  description: 'Test app',
  business_domain: 'expense-management',
  features: [
    {
      id: 'F001',
      name: 'Submit Expense',
      confidence: 'high',
      acceptance_criteria: [
        'User can submit expense form',
        'POST /api/expense-reports returns 201',
      ],
    },
    {
      id: 'F002',
      name: 'Approval',
      confidence: 'high',
      acceptance_criteria: [
        'Manager sees pending reports at /approvals',
      ],
    },
  ],
  constraints: {
    auth: true, database: true, file_upload: false, email: true, payments: false,
  },
}

// ── parseVitestOutput ─────────────────────────────────────────────

describe('parseVitestOutput()', () => {
  it('parses JSON reporter output', () => {
    const json = JSON.stringify({
      numPassedTests: 3,
      numFailedTests: 1,
      testResults: [
        {
          testFilePath: 'packages/core/auth/auth.test.ts',
          status: 'passed',
          testResults: [
            { status: 'passed', fullName: 'should login', failureMessages: [] },
            { status: 'passed', fullName: 'should logout', failureMessages: [] },
            { status: 'passed', fullName: 'should reject', failureMessages: [] },
          ],
        },
        {
          testFilePath: 'packages/core/expense/expense.test.ts',
          status: 'failed',
          testResults: [
            { status: 'failed', fullName: 'should submit', failureMessages: ['Expected 201 got 500'] },
          ],
        },
      ],
    })

    const results = parseVitestOutput(json)
    expect(results).toHaveLength(2)
    expect(results[0]).toMatchObject({ file: 'packages/core/auth/auth.test.ts', passed: 3, failed: 0 })
    expect(results[1]).toMatchObject({ file: 'packages/core/expense/expense.test.ts', passed: 0, failed: 1 })
    expect(results[1]!.errors[0]).toContain('Expected 201 got 500')
  })

  it('falls back to text parser when no JSON present', () => {
    const text = [
      ' ✓ packages/core/auth/auth.test.ts (3 tests)',
      ' ✗ packages/core/expense/expense.test.ts',
      '   AssertionError: expected 201 to be 500',
    ].join('\n')

    const results = parseVitestOutput(text)
    expect(results.some((r) => r.file.includes('auth.test.ts') && r.passed === 3)).toBe(true)
    expect(results.some((r) => r.file.includes('expense.test.ts') && r.failed === 1)).toBe(true)
  })

  it('returns empty array for empty output', () => {
    expect(parseVitestOutput('')).toEqual([])
  })

  it('returns empty array for output with no test lines', () => {
    expect(parseVitestOutput('Starting vitest...\nDone.')).toEqual([])
  })

  it('handles all-passing JSON output', () => {
    const json = JSON.stringify({
      numPassedTests: 10,
      numFailedTests: 0,
      testResults: [
        {
          testFilePath: 'src/foo.test.ts',
          status: 'passed',
          testResults: Array.from({ length: 10 }, (_, i) => ({
            status: 'passed',
            fullName: `test ${i}`,
            failureMessages: [],
          })),
        },
      ],
    })
    const results = parseVitestOutput(json)
    expect(results[0]).toMatchObject({ passed: 10, failed: 0 })
  })
})

// ── classifyErrorAgent ────────────────────────────────────────────

describe('classifyErrorAgent()', () => {
  it('classifies prisma files as schema', () => {
    expect(classifyErrorAgent('prisma/schema.prisma')).toBe('schema')
  })

  it('classifies packages/core as logic', () => {
    expect(classifyErrorAgent('packages/core/auth/use-login.ts')).toBe('logic')
    expect(classifyErrorAgent('packages/core/auth/auth.test.ts')).toBe('logic')
  })

  it('classifies server/domain as logic', () => {
    expect(classifyErrorAgent('server/domain/expense.ts')).toBe('logic')
  })

  it('classifies app/api as api', () => {
    expect(classifyErrorAgent('app/api/expense-reports/route.ts')).toBe('api')
  })

  it('classifies packages/ui as ui', () => {
    expect(classifyErrorAgent('packages/ui/button/button.tsx')).toBe('ui')
  })

  it('classifies app/**\/page.tsx as page', () => {
    expect(classifyErrorAgent('app/submit-expense/page.tsx')).toBe('page')
    expect(classifyErrorAgent('app/approvals/page.tsx')).toBe('page')
  })

  it('returns unknown for unrecognized paths', () => {
    expect(classifyErrorAgent('some/random/file.ts')).toBe('unknown')
    expect(classifyErrorAgent(undefined)).toBe('unknown')
  })
})

// ── ValidationReportSchema ────────────────────────────────────────

describe('ValidationReportSchema', () => {
  const makeReport = (overrides = {}) => ({
    spec_id: 'spec-001',
    timestamp: new Date().toISOString(),
    overall: 'passed',
    unit_tests: { total_passed: 5, total_failed: 0, files: [] },
    e2e_checks: [],
    errors: [],
    ...overrides,
  })

  it('accepts a valid passed report', () => {
    expect(ValidationReportSchema.safeParse(makeReport()).success).toBe(true)
  })

  it('accepts a valid failed report with errors', () => {
    const report = makeReport({
      overall: 'failed',
      unit_tests: { total_passed: 3, total_failed: 2, files: [] },
      errors: [{
        type: 'unit_test',
        agent: 'logic',
        file: 'packages/core/auth/auth.test.ts',
        message: '2 unit tests failed',
      }],
    })
    expect(ValidationReportSchema.safeParse(report).success).toBe(true)
  })

  it('rejects invalid overall value', () => {
    expect(ValidationReportSchema.safeParse(makeReport({ overall: 'partial' })).success).toBe(false)
  })

  it('rejects negative test counts', () => {
    const report = makeReport({
      unit_tests: { total_passed: -1, total_failed: 0, files: [] },
    })
    expect(ValidationReportSchema.safeParse(report).success).toBe(false)
  })
})

// ── isPassed / failedE2EChecks helpers ────────────────────────────

describe('report helpers', () => {
  it('isPassed returns true for passed report', () => {
    const report = ValidationReportSchema.parse({
      spec_id: 'x', timestamp: new Date().toISOString(), overall: 'passed',
      unit_tests: { total_passed: 1, total_failed: 0, files: [] },
      e2e_checks: [], errors: [],
    })
    expect(isPassed(report)).toBe(true)
  })

  it('isPassed returns false for failed report', () => {
    const report = ValidationReportSchema.parse({
      spec_id: 'x', timestamp: new Date().toISOString(), overall: 'failed',
      unit_tests: { total_passed: 0, total_failed: 1, files: [] },
      e2e_checks: [], errors: [{ type: 'unit_test', agent: 'logic', message: 'fail' }],
    })
    expect(isPassed(report)).toBe(false)
  })

  it('failedE2EChecks returns only failed checks', () => {
    const checks: E2ECheck[] = [
      { feature_id: 'F001', criterion: 'a', status: 'passed' },
      { feature_id: 'F001', criterion: 'b', status: 'failed', error: 'oops' },
      { feature_id: 'F002', criterion: 'c', status: 'skipped' },
      { feature_id: 'F002', criterion: 'd', status: 'failed', error: 'timeout' },
    ]
    const report = ValidationReportSchema.parse({
      spec_id: 'x', timestamp: new Date().toISOString(), overall: 'failed',
      unit_tests: { total_passed: 0, total_failed: 0, files: [] },
      e2e_checks: checks,
      errors: [{ type: 'e2e', agent: 'unknown', message: 'fail' }],
    })
    const failed = failedE2EChecks(report)
    expect(failed).toHaveLength(2)
    expect(failed.every((c) => c.status === 'failed')).toBe(true)
  })
})

// ── TestAgent.validate with mock sandbox ─────────────────────────

describe('TestAgent.validate() — mock sandbox', () => {
  const buildMockSandbox = (overrides: Partial<SandboxAdapter> = {}): SandboxAdapter => ({
    run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
    startBackground: vi.fn().mockResolvedValue(undefined),
    readFile: vi.fn().mockResolvedValue(''),
    getPreviewUrl: vi.fn().mockReturnValue('http://localhost:3000'),
    ...overrides,
  })

  beforeEach(async () => {
    const aiModule = await import('ai')
    // Mock planE2EChecks to return skip for all criteria (avoid HTTP calls)
    vi.mocked(aiModule.generateObject).mockResolvedValue({
      object: {
        checks: mockSpec.features.flatMap((f) =>
          f.acceptance_criteria.map((c) => ({
            criterion: c,
            method: 'skip',
            skip_reason: 'mocked',
          })),
        ),
      },
    } as any)
  })

  it('returns passed when unit tests all pass and E2E skipped', async () => {
    const passOutput = JSON.stringify({
      numPassedTests: 5,
      numFailedTests: 0,
      testResults: [{
        testFilePath: 'packages/core/auth/auth.test.ts',
        status: 'passed',
        testResults: Array.from({ length: 5 }, (_, i) => ({
          status: 'passed', fullName: `test ${i}`, failureMessages: [],
        })),
      }],
    })

    const sandbox = buildMockSandbox({
      run: vi.fn()
        .mockResolvedValueOnce({ stdout: passOutput, stderr: '', exitCode: 0 }) // vitest
        .mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),            // other
    })

    const agent = new TestAgent()
    const report = await agent.validate(mockSpec, sandbox)

    expect(report.overall).toBe('passed')
    expect(report.unit_tests.total_passed).toBe(5)
    expect(report.unit_tests.total_failed).toBe(0)
    expect(report.errors).toHaveLength(0)
  })

  it('returns failed when unit tests fail', async () => {
    const failOutput = JSON.stringify({
      numPassedTests: 2,
      numFailedTests: 1,
      testResults: [{
        testFilePath: 'packages/core/expense/expense.test.ts',
        status: 'failed',
        testResults: [
          { status: 'passed', fullName: 'a', failureMessages: [] },
          { status: 'passed', fullName: 'b', failureMessages: [] },
          { status: 'failed', fullName: 'should submit', failureMessages: ['Expected 201'] },
        ],
      }],
    })

    const sandbox = buildMockSandbox({
      run: vi.fn()
        .mockResolvedValueOnce({ stdout: failOutput, stderr: '', exitCode: 1 })
        .mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
    })

    const agent = new TestAgent()
    const report = await agent.validate(mockSpec, sandbox)

    expect(report.overall).toBe('failed')
    expect(report.unit_tests.total_failed).toBe(1)
    expect(report.errors).toHaveLength(1)
    expect(report.errors[0]!.type).toBe('unit_test')
    expect(report.errors[0]!.agent).toBe('logic')  // classified from file path
  })

  it('report spec_id matches input spec', async () => {
    const sandbox = buildMockSandbox()
    const agent = new TestAgent()
    const report = await agent.validate(mockSpec, sandbox)

    expect(report.spec_id).toBe('spec-001')
  })

  it('report has ISO timestamp', async () => {
    const sandbox = buildMockSandbox()
    const agent = new TestAgent()
    const report = await agent.validate(mockSpec, sandbox)

    expect(() => new Date(report.timestamp)).not.toThrow()
    expect(new Date(report.timestamp).getFullYear()).toBeGreaterThanOrEqual(2024)
  })

  it('E2E skipped checks do not cause failure', async () => {
    const sandbox = buildMockSandbox()
    const agent = new TestAgent()
    const report = await agent.validate(mockSpec, sandbox)

    const skipped = report.e2e_checks.filter((c) => c.status === 'skipped')
    const failed  = report.e2e_checks.filter((c) => c.status === 'failed')

    expect(skipped.length).toBeGreaterThan(0)
    expect(failed).toHaveLength(0)
  })
})
