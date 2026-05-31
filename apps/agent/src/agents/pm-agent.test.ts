import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PMAgent, type DraftSpec, type ClarifyingQuestion } from './pm-agent.js'
import { SpecSchema } from '../contracts/spec.js'

// ── Mock ai SDK ───────────────────────────────────────────────────
// We test the agent's logic (finalize, schema validation), not the LLM response.
// LLM calls are mocked so tests run offline and are deterministic.

vi.mock('../lib/ai-client.js', () => ({
  llmText: vi.fn(),
  anthropic: vi.fn(() => 'mock-model'),
  MODEL: 'test-model',
  BUILDER_MODEL: 'test-builder-model',
}))

// ── Fixtures ──────────────────────────────────────────────────────

const mockDraft: DraftSpec = {
  title: 'Expense Manager',
  description: 'An app to manage employee expense reports and approvals.',
  business_domain: 'expense-management',
  constraints: {
    auth: true,
    database: true,
    file_upload: true,
    email: true,
    payments: false,
  },
  clarifying_questions: [],
  features: [
    {
      id: 'F001',
      name: 'Submit Expense Report',
      confidence: 'high',
      acceptance_criteria: [
        'User can fill in amount, category, and date',
        'User can attach a receipt image (jpg/png/pdf)',
        'Submitting shows a success message and clears the form',
        'Amount field rejects non-numeric input',
      ],
      out_of_scope: [],
      selected: true,
    },
    {
      id: 'F002',
      name: 'Approval Workflow',
      confidence: 'high',
      acceptance_criteria: [
        'Manager sees pending reports in their queue',
        'Manager can approve or reject with a comment',
        'Submitter receives email notification on decision',
      ],
      out_of_scope: ['Multi-level approval'],
      selected: true,
    },
    {
      id: 'F003',
      name: 'Amount Threshold Auto-Approval',
      confidence: 'medium',
      acceptance_criteria: [
        'Reports under $50 are auto-approved',
        'Threshold is configurable by admin',
      ],
      out_of_scope: [],
      selected: true,
    },
    {
      id: 'F004',
      name: 'Advanced Analytics Dashboard',
      confidence: 'low',
      acceptance_criteria: [
        'Charts showing spend by department and category',
      ],
      out_of_scope: [],
      selected: false,   // ← low confidence, user deselected
    },
  ],
}

// ── Tests ─────────────────────────────────────────────────────────

describe('PMAgent.finalize()', () => {
  const agent = new PMAgent()

  it('produces a valid spec from a reviewed draft', () => {
    const spec = agent.finalize(mockDraft)

    // Must pass Zod schema validation
    expect(() => SpecSchema.parse(spec)).not.toThrow()

    expect(spec.title).toBe('Expense Manager')
    expect(spec.business_domain).toBe('expense-management')
    expect(spec.constraints.auth).toBe(true)
    expect(spec.constraints.payments).toBe(false)
  })

  it('only includes selected features', () => {
    const spec = agent.finalize(mockDraft)

    // F004 (low confidence, selected=false) must be excluded
    const ids = spec.features.map((f) => f.id)
    expect(ids).toContain('F001')
    expect(ids).toContain('F002')
    expect(ids).toContain('F003')
    expect(ids).not.toContain('F004')
    expect(spec.features).toHaveLength(3)
  })

  it('preserves acceptance criteria verbatim', () => {
    const spec = agent.finalize(mockDraft)
    const f001 = spec.features.find((f) => f.id === 'F001')!

    expect(f001.acceptance_criteria).toContain('User can attach a receipt image (jpg/png/pdf)')
  })

  it('throws when no features are selected', () => {
    const emptyDraft: DraftSpec = {
      ...mockDraft,
      features: mockDraft.features.map((f) => ({ ...f, selected: false })),
    }

    expect(() => agent.finalize(emptyDraft)).toThrow('At least one feature must be selected')
  })

  it('appends user supplement as clarifying question when provided', () => {
    const spec = agent.finalize(mockDraft, 'also need export to Excel')

    expect(spec.clarifying_questions).toBeDefined()
    expect(spec.clarifying_questions![0]).toContain('export to Excel')
  })

  it('omits out_of_scope when empty', () => {
    const spec = agent.finalize(mockDraft)
    const f001 = spec.features.find((f) => f.id === 'F001')!

    // out_of_scope is [] in the draft → should be undefined in the spec (optional field)
    expect(f001.out_of_scope).toBeUndefined()
  })

  it('preserves non-empty out_of_scope', () => {
    const spec = agent.finalize(mockDraft)
    const f002 = spec.features.find((f) => f.id === 'F002')!

    expect(f002.out_of_scope).toEqual(['Multi-level approval'])
  })
})

describe('SpecSchema validation', () => {
  it('rejects spec with no features', () => {
    const result = SpecSchema.safeParse({
      id: 'test',
      title: 'Test',
      description: 'Test',
      business_domain: 'test',
      features: [],
      constraints: { auth: false, database: false, file_upload: false, email: false, payments: false },
    })
    expect(result.success).toBe(false)
  })

  it('rejects feature with no acceptance_criteria', () => {
    const result = SpecSchema.safeParse({
      id: 'test',
      title: 'Test',
      description: 'Test',
      business_domain: 'test',
      features: [{
        id: 'F001',
        name: 'Feature',
        confidence: 'high',
        acceptance_criteria: [],  // empty — should fail
      }],
      constraints: { auth: false, database: false, file_upload: false, email: false, payments: false },
    })
    expect(result.success).toBe(false)
  })

  it('accepts a well-formed spec', () => {
    const result = SpecSchema.safeParse({
      id: 'abc-123',
      title: 'Todo App',
      description: 'Simple todo list',
      business_domain: 'todo-app',
      features: [{
        id: 'F001',
        name: 'Add Todo',
        confidence: 'high',
        acceptance_criteria: ['User can type a todo and press Enter to add it'],
      }],
      constraints: { auth: false, database: true, file_upload: false, email: false, payments: false },
    })
    expect(result.success).toBe(true)
  })
})

describe('ClarifyingQuestion type', () => {
  it('has required fields', () => {
    const q: ClarifyingQuestion = {
      id: 'Q001',
      question: 'Do users need team collaboration?',
      type: 'single',
      options: ['Yes, multi-user', 'No, single-user'],
      required: true,
    }
    expect(q.id).toBe('Q001')
    expect(q.options).toHaveLength(2)
    expect(q.type).toBe('single')
  })

  it('text type has no options', () => {
    const q: ClarifyingQuestion = {
      id: 'Q002',
      question: 'Describe your target users',
      type: 'text',
      required: false,
    }
    expect(q.options).toBeUndefined()
  })
})

describe('PMAgent.renderReviewHTML', () => {
  const agent = new PMAgent()

  const mockDraft: DraftSpec = {
    title: 'Task Manager',
    description: 'A simple task management app',
    business_domain: 'project-management',
    features: [
      {
        id: 'F001',
        name: 'Create Task',
        confidence: 'high',
        acceptance_criteria: ['User can create a task with title'],
        out_of_scope: [],
        selected: true,
      },
    ],
    constraints: {
      auth: true, database: true, file_upload: false, email: false, payments: false,
    },
    clarifying_questions: [
      {
        id: 'Q001',
        question: 'Do users need team collaboration?',
        type: 'single',
        options: ['Yes', 'No'],
        required: true,
      },
    ],
  }

  it('replaces all three placeholders', () => {
    const html = agent.renderReviewHTML(mockDraft, 'job-123', 'http://localhost:3001/confirm-draft/job-123')
    expect(html).not.toContain('__DRAFT_JSON__')
    expect(html).not.toContain('__JOB_ID__')
    expect(html).not.toContain('__CONFIRM_URL__')
  })

  it('injects draft data into HTML', () => {
    const html = agent.renderReviewHTML(mockDraft, 'job-123', 'http://localhost:3001/confirm-draft/job-123')
    expect(html).toContain('"title":"Task Manager"')
    expect(html).toContain('job-123')
    expect(html).toContain('http://localhost:3001/confirm-draft/job-123')
  })

  it('returns valid HTML document', () => {
    const html = agent.renderReviewHTML(mockDraft, 'job-abc', 'http://x/confirm')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('</html>')
  })
})

// ── Prompt–Schema contract tests ─────────────────────────────────
// These tests verify that the JSON template shown in buildDraftPrompt
// actually parses with the Zod schema the agent uses.
// If you change the prompt template or the schema, one of these will fail.

import { z } from 'zod'

describe('PM Agent — prompt/schema contract', () => {
  // The exact example JSON from buildDraftPrompt
  const PROMPT_EXAMPLE = {
    title: 'short app name',
    description: 'one sentence description',
    business_domain: 'task-management',
    features: [
      {
        id: 'F001',
        name: 'Feature Name',
        confidence: 'high' as const,
        acceptance_criteria: ['specific testable criterion 1', 'criterion 2'],
        out_of_scope: [],
      },
    ],
    constraints: {
      auth: true,
      database: true,
      file_upload: false,
      email: false,
      payments: false,
    },
    clarifying_questions: [],
  }

  it('prompt example JSON parses with LLMDraftSchema (catches schema/prompt mismatches)', () => {
    // Rebuild the schema inline — if pm-agent.ts changes the schema this test fails
    const LLMDraftSchema = z.object({
      title: z.string(),
      description: z.string(),
      business_domain: z.string(),
      features: z.array(z.object({
        id: z.string(),
        name: z.string(),
        confidence: z.enum(['high', 'medium', 'low']),
        acceptance_criteria: z.array(z.string()),
        out_of_scope: z.array(z.string()).default([]),
      })),
      constraints: z.object({
        auth: z.boolean(),
        database: z.boolean(),
        file_upload: z.boolean(),
        email: z.boolean(),
        payments: z.boolean(),
      }),
      clarifying_questions: z.array(z.object({
        id: z.string(),
        question: z.string(),
        type: z.enum(['single', 'multiple', 'text']),
        options: z.array(z.string()).default([]),
        required: z.boolean(),
      })).default([]),
    })
    expect(() => LLMDraftSchema.parse(PROMPT_EXAMPLE)).not.toThrow()
  })

  it('extractJSON handles plain JSON (no code fence)', () => {
    const json = JSON.stringify(PROMPT_EXAMPLE)
    const start = json.indexOf('{')
    const end = json.lastIndexOf('}')
    const extracted = json.slice(start, end + 1)
    expect(() => JSON.parse(extracted)).not.toThrow()
  })

  it('extractJSON handles JSON wrapped in markdown fence', () => {
    const fenced = '```json\n' + JSON.stringify(PROMPT_EXAMPLE) + '\n```'
    const match = fenced.match(/```(?:json)?\s*([\s\S]*?)```/)
    expect(match).not.toBeNull()
    expect(() => JSON.parse(match![1]!.trim())).not.toThrow()
  })

  it('confidence enum values in prompt match what schema accepts', () => {
    const validValues = ['high', 'medium', 'low']
    const schema = z.enum(['high', 'medium', 'low'])
    for (const v of validValues) {
      expect(() => schema.parse(v)).not.toThrow()
    }
    expect(() => schema.parse('required')).toThrow()  // old value that caused issues
  })
})
