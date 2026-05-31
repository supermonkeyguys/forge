import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ArchitectAgent } from './architect-agent.js'
import { topoSort, parallelBatches, TaskPlanSchema, type PlanTask } from '../contracts/task-plan.js'
import type { Spec } from '../contracts/spec.js'

// ── Mock ai SDK ───────────────────────────────────────────────────

vi.mock('../lib/ai-client.js', () => ({
  llmText: vi.fn(),
  anthropic: vi.fn(() => 'mock-model'),
  MODEL: 'test-model',
  BUILDER_MODEL: 'test-builder-model',
}))

// ── Fixtures ──────────────────────────────────────────────────────

const mockSpec: Spec = {
  id: 'spec-001',
  title: 'Expense Manager',
  description: 'Employee expense report and approval system.',
  business_domain: 'expense-management',
  features: [
    {
      id: 'F001',
      name: 'Submit Expense Report',
      confidence: 'high',
      acceptance_criteria: [
        'User can fill amount, category, date',
        'User can attach receipt',
        'Submit shows success message',
      ],
    },
    {
      id: 'F002',
      name: 'Approval Workflow',
      confidence: 'high',
      acceptance_criteria: [
        'Manager sees pending reports',
        'Manager can approve or reject',
        'Submitter receives email on decision',
      ],
    },
  ],
  constraints: {
    auth: true,
    database: true,
    file_upload: true,
    email: true,
    payments: false,
  },
}

// A realistic LLM response for the expense manager spec
const mockLLMPlan = {
  tech_decisions: {
    database: 'PostgreSQL via Prisma — relational data with approval workflows',
    auth: 'NextAuth.js with credentials provider — simplest setup for internal tool',
    file_storage: 'Local filesystem in dev, S3-compatible in production',
    email: 'Resend API — simple transactional email SDK',
  },
  tasks: [
    {
      id: 'T001',
      agent: 'schema',
      action: 'create',
      file: 'prisma/schema.prisma',
      description: 'Add User, ExpenseReport, Attachment models. ExpenseReport has status enum: pending|approved|rejected. Attachment has fileUrl, fileName fields.',
      depends_on: [],
      feature_ids: ['F001', 'F002'],
    },
    {
      id: 'T002',
      agent: 'logic',
      action: 'create',
      file: 'packages/core/expense/use-submit-expense.ts',
      description: 'useMutation hook: POST /api/expense-reports. Accepts amount, category, date, receiptFile. Optimistic update on list.',
      depends_on: ['T003'],
      feature_ids: ['F001'],
    },
    {
      id: 'T003',
      agent: 'api',
      action: 'create',
      file: 'app/api/expense-reports/route.ts',
      description: 'POST handler: validate body, save to DB via server/infra/expense-repo.ts, return created report. GET handler: list reports for current user.',
      depends_on: ['T001'],
      feature_ids: ['F001'],
    },
    {
      id: 'T004',
      agent: 'logic',
      action: 'create',
      file: 'packages/core/expense/use-submit-expense.test.ts',
      description: 'Test useSubmitExpense: loading state, success with optimistic update, error from API.',
      depends_on: ['T002'],
      feature_ids: ['F001'],
    },
    {
      id: 'T005',
      agent: 'ui',
      action: 'create',
      file: 'packages/ui/expense-form/expense-form.tsx',
      description: 'ExpenseForm component: amount (number input), category (select: travel|meals|supplies|other), date (date input), receipt (file input). onSubmit callback prop.',
      depends_on: [],
      feature_ids: ['F001'],
    },
    {
      id: 'T006',
      agent: 'ui',
      action: 'create',
      file: 'packages/ui/expense-form/expense-form.stories.tsx',
      description: 'Default story, FilledOut story, SubmittingState story.',
      depends_on: ['T005'],
      feature_ids: ['F001'],
    },
    {
      id: 'T007',
      agent: 'page',
      action: 'create',
      file: 'app/submit-expense/page.tsx',
      description: 'Page: import useSubmitExpense + ExpenseForm, wire onSubmit, show success toast on completion. max 80 lines.',
      depends_on: ['T002', 'T005'],
      feature_ids: ['F001'],
    },
    {
      id: 'T008',
      agent: 'logic',
      action: 'create',
      file: 'packages/core/approval/use-approve-expense.ts',
      description: 'useMutation hook: PATCH /api/expense-reports/:id/status. Accepts status: approved|rejected and comment.',
      depends_on: ['T009'],
      feature_ids: ['F002'],
    },
    {
      id: 'T009',
      agent: 'api',
      action: 'create',
      file: 'app/api/expense-reports/[id]/status/route.ts',
      description: 'PATCH handler: validate status transition, update DB, send email notification via Resend.',
      depends_on: ['T001'],
      feature_ids: ['F002'],
    },
    {
      id: 'T010',
      agent: 'page',
      action: 'create',
      file: 'app/approvals/page.tsx',
      description: 'Approval queue page: list pending reports, each row has Approve/Reject buttons. max 80 lines.',
      depends_on: ['T008'],
      feature_ids: ['F002'],
    },
  ],
}

// ── topoSort tests ────────────────────────────────────────────────

describe('topoSort()', () => {
  it('returns single task unchanged', () => {
    const tasks: PlanTask[] = [
      { id: 'T001', agent: 'schema', action: 'create', file: 'f.ts', description: 'd', depends_on: [], status: 'pending' },
    ]
    expect(topoSort(tasks).map(t => t.id)).toEqual(['T001'])
  })

  it('orders dependents after their dependencies', () => {
    const tasks: PlanTask[] = [
      { id: 'T002', agent: 'logic', action: 'create', file: 'b.ts', description: 'd', depends_on: ['T001'], status: 'pending' },
      { id: 'T001', agent: 'schema', action: 'create', file: 'a.ts', description: 'd', depends_on: [], status: 'pending' },
    ]
    const sorted = topoSort(tasks).map(t => t.id)
    expect(sorted.indexOf('T001')).toBeLessThan(sorted.indexOf('T002'))
  })

  it('handles a diamond dependency (T1 → T2, T1 → T3, T2+T3 → T4)', () => {
    const tasks: PlanTask[] = [
      { id: 'T4', agent: 'page', action: 'create', file: 'd', description: 'd', depends_on: ['T2', 'T3'], status: 'pending' },
      { id: 'T2', agent: 'logic', action: 'create', file: 'b', description: 'd', depends_on: ['T1'], status: 'pending' },
      { id: 'T3', agent: 'api', action: 'create', file: 'c', description: 'd', depends_on: ['T1'], status: 'pending' },
      { id: 'T1', agent: 'schema', action: 'create', file: 'a', description: 'd', depends_on: [], status: 'pending' },
    ]
    const sorted = topoSort(tasks).map(t => t.id)
    expect(sorted.indexOf('T1')).toBeLessThan(sorted.indexOf('T2'))
    expect(sorted.indexOf('T1')).toBeLessThan(sorted.indexOf('T3'))
    expect(sorted.indexOf('T2')).toBeLessThan(sorted.indexOf('T4'))
    expect(sorted.indexOf('T3')).toBeLessThan(sorted.indexOf('T4'))
  })
})

// ── parallelBatches tests ─────────────────────────────────────────

describe('parallelBatches()', () => {
  it('groups independent tasks in the same batch', () => {
    const tasks: PlanTask[] = [
      { id: 'T001', agent: 'schema', action: 'create', file: 'a', description: 'd', depends_on: [], status: 'pending' },
      { id: 'T002', agent: 'ui', action: 'create', file: 'b', description: 'd', depends_on: [], status: 'pending' },
      { id: 'T003', agent: 'logic', action: 'create', file: 'c', description: 'd', depends_on: ['T001'], status: 'pending' },
    ]
    const batches = parallelBatches(tasks)
    expect(batches).toHaveLength(2)

    const batch0Ids = batches[0]!.map(t => t.id).sort()
    expect(batch0Ids).toEqual(['T001', 'T002'])

    const batch1Ids = batches[1]!.map(t => t.id)
    expect(batch1Ids).toEqual(['T003'])
  })

  it('puts all tasks in one batch when no dependencies', () => {
    const tasks: PlanTask[] = [
      { id: 'T1', agent: 'ui', action: 'create', file: 'a', description: 'd', depends_on: [], status: 'pending' },
      { id: 'T2', agent: 'ui', action: 'create', file: 'b', description: 'd', depends_on: [], status: 'pending' },
    ]
    const batches = parallelBatches(tasks)
    expect(batches).toHaveLength(1)
    expect(batches[0]).toHaveLength(2)
  })
})

// ── TaskPlanSchema validation ─────────────────────────────────────

describe('TaskPlanSchema', () => {
  it('accepts valid plan from mock LLM response', () => {
    const result = TaskPlanSchema.safeParse({
      spec_id: 'spec-001',
      ...mockLLMPlan,
      tasks: mockLLMPlan.tasks.map(t => ({ ...t, status: 'pending' })),
    })
    if (!result.success) {
      console.error(result.error.flatten())
    }
    expect(result.success).toBe(true)
  })

  it('rejects plan with empty tasks', () => {
    const result = TaskPlanSchema.safeParse({
      spec_id: 'spec-001',
      tech_decisions: {},
      tasks: [],
    })
    expect(result.success).toBe(false)
  })

  it('rejects task with unknown agent role', () => {
    const result = TaskPlanSchema.safeParse({
      spec_id: 'spec-001',
      tech_decisions: {},
      tasks: [{
        id: 'T001',
        agent: 'designer',  // not a valid role
        action: 'create',
        file: 'f.ts',
        description: 'd',
        depends_on: [],
        status: 'pending',
      }],
    })
    expect(result.success).toBe(false)
  })
})

// ── ArchitectAgent.buildInitialContext() ──────────────────────────

describe('ArchitectAgent.buildInitialContext()', () => {
  const agent = new ArchitectAgent()
  const validPlan = TaskPlanSchema.parse({
    spec_id: 'spec-001',
    ...mockLLMPlan,
    tasks: mockLLMPlan.tasks.map(t => ({ ...t, status: 'pending' })),
  })

  it('includes app title and domain', () => {
    const ctx = agent.buildInitialContext(mockSpec, validPlan)
    expect(ctx).toContain('Expense Manager')
    expect(ctx).toContain('expense-management')
  })

  it('includes all tech decisions', () => {
    const ctx = agent.buildInitialContext(mockSpec, validPlan)
    expect(ctx).toContain('PostgreSQL via Prisma')
    expect(ctx).toContain('NextAuth.js')
  })

  it('lists all features as uncompleted checkboxes', () => {
    const ctx = agent.buildInitialContext(mockSpec, validPlan)
    expect(ctx).toContain('- [ ] F001: Submit Expense Report')
    expect(ctx).toContain('- [ ] F002: Approval Workflow')
  })

  it('lists api tasks in contracts section', () => {
    const ctx = agent.buildInitialContext(mockSpec, validPlan)
    expect(ctx).toContain('app/api/expense-reports/route.ts')
  })

  it('lists logic tasks in hooks section', () => {
    const ctx = agent.buildInitialContext(mockSpec, validPlan)
    expect(ctx).toContain('packages/core/expense/use-submit-expense.ts')
  })

  it('lists ui tasks in components section', () => {
    const ctx = agent.buildInitialContext(mockSpec, validPlan)
    expect(ctx).toContain('packages/ui/expense-form/expense-form.tsx')
  })

  it('includes spec ID for traceability', () => {
    const ctx = agent.buildInitialContext(mockSpec, validPlan)
    expect(ctx).toContain('spec-001')
  })
})

// ── ArchitectAgent.plan() with mocked LLM ────────────────────────

describe('ArchitectAgent.plan() — mocked LLM', () => {
  beforeEach(async () => {
    const aiClient = await import('../lib/ai-client.js')
    vi.mocked(aiClient.llmText).mockResolvedValue({ text: JSON.stringify(mockLLMPlan), steps: [] } as any)
  })

  it('returns a valid TaskPlan', async () => {
    const agent = new ArchitectAgent()
    const plan = await agent.plan(mockSpec)

    expect(plan.spec_id).toBe('spec-001')
    expect(plan.tasks.length).toBeGreaterThan(0)
    expect(plan.tech_decisions).toBeDefined()
  })

  it('all tasks have status pending', async () => {
    const agent = new ArchitectAgent()
    const plan = await agent.plan(mockSpec)

    for (const task of plan.tasks) {
      expect(task.status).toBe('pending')
    }
  })

  it('throws when depends_on references unknown task ID', async () => {
    const aiClient = await import('../lib/ai-client.js')
    vi.mocked(aiClient.llmText).mockResolvedValue({ text: JSON.stringify({
      tech_decisions: {},
      tasks: [{
        id: 'T001',
        agent: 'logic',
        action: 'create',
        file: 'f.ts',
        description: 'd',
        depends_on: ['T999'],  // T999 does not exist
        feature_ids: [],
      }],
    }), steps: [] } as any)

    const agent = new ArchitectAgent()
    await expect(agent.plan(mockSpec)).rejects.toThrow('unknown task ID "T999"')
  })
})
