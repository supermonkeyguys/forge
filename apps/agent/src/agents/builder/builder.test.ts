import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildMemoryContext } from '../../lib/agent-memory-client.js'
import { buildTypedKBContext } from '../../lib/project-kb-client.js'
import { extractCode } from './base-builder.js'
import { CustomBuilderAgent } from './custom-agent.js'
import { SchemaAgent } from './schema-agent.js'
import { LogicAgent } from './logic-agent.js'
import { ApiAgent } from './api-agent.js'
import { UIAgent } from './ui-agent.js'
import { PageAgent } from './page-agent.js'
import type { PlanTask } from '../../contracts/task-plan.js'

vi.mock('../../lib/ai-client.js', () => ({ llmText: vi.fn(), anthropic: vi.fn(() => 'mock-model'), MODEL: 'test-model', BUILDER_MODEL: 'test-builder-model' }))

// ── Fixtures ──────────────────────────────────────────────────────

const baseTask = (overrides: Partial<PlanTask> = {}): PlanTask => ({
  id: 'T001',
  agent: 'schema',
  action: 'create',
  file: 'prisma/schema.prisma',
  description: 'Add User and ExpenseReport models',
  depends_on: [],
  status: 'pending',
  ...overrides,
})

const mockContext = `# Project Context
## App Overview
- **Name**: Expense Manager
## Architecture Decisions
| database | PostgreSQL via Prisma |
## Available Hooks (packages/core/)
- packages/core/expense/use-submit-expense.ts
## Available UI Components (packages/ui/)
- packages/ui/expense-form/expense-form.tsx`

// ── extractCode ───────────────────────────────────────────────────

describe('extractCode()', () => {
  it('extracts code from a typescript fence', () => {
    const text = `Here is the file:\n\`\`\`typescript\nconst x = 1\n\`\`\``
    expect(extractCode(text)).toBe('const x = 1')
  })

  it('extracts code from a ts fence', () => {
    const text = `\`\`\`ts\nimport { foo } from 'bar'\n\`\`\``
    expect(extractCode(text)).toBe("import { foo } from 'bar'")
  })

  it('extracts code from a tsx fence', () => {
    const text = "```tsx\nexport function Button() {}\n```"
    expect(extractCode(text)).toBe('export function Button() {}')
  })

  it('extracts code from a prisma fence', () => {
    const text = "```prisma\nmodel User {}\n```"
    expect(extractCode(text)).toBe('model User {}')
  })

  it('returns raw text when no fence present (whole response is code)', () => {
    const text = `import { x } from 'y'\nexport const z = 1`
    expect(extractCode(text)).toBe(text.trim())
  })

  it('strips leading prose when code starts mid-response', () => {
    const text = `Here is the implementation:\n\nimport { useState } from 'react'\nexport function Foo() {}`
    const code = extractCode(text)
    expect(code).toContain("import { useState }")
    expect(code).not.toContain('Here is')
  })

  it('handles empty fenced block', () => {
    // Empty fence — returns empty string, not undefined
    const text = "```typescript\n\n```"
    expect(extractCode(text)).toBe('')
  })
})

// ── SchemaAgent ───────────────────────────────────────────────────

describe('SchemaAgent', () => {
  const agent = new SchemaAgent()

  it('has role "schema"', () => {
    expect(agent.role).toBe('schema')
  })

  it('contextUpdate extracts model names from schema', () => {
    const code = `
datasource db { provider = "postgresql" url = env("DATABASE_URL") }
generator client { provider = "prisma-client-js" }

model User {
  id String @id @default(cuid())
}

model ExpenseReport {
  id String @id @default(cuid())
}
`
    const update = agent['contextUpdate'](baseTask(), code)
    expect(update).toContain('User')
    expect(update).toContain('ExpenseReport')
  })

  it('contextUpdate returns empty string when no models found', () => {
    const update = agent['contextUpdate'](baseTask(), '# empty schema')
    expect(update).toBe('')
  })

  it('buildTaskPrompt includes task description', () => {
    const task = baseTask({ description: 'Add User model with email field' })
    const prompt = agent['buildTaskPrompt']({ task, projectContext: mockContext })
    expect(prompt).toContain('Add User model with email field')
  })

  it('buildTaskPrompt includes existing file when action is modify', () => {
    const task = baseTask({ action: 'modify' })
    const prompt = agent['buildTaskPrompt']({
      task,
      projectContext: mockContext,
      existingFileContent: 'model User {}',
    })
    expect(prompt).toContain('model User {}')
    expect(prompt).toContain('modify')
  })

  it('system prompt forbids sql/http imports', () => {
    const sys = agent['systemPrompt']()
    expect(sys).toContain('prisma')
  })
})

// ── LogicAgent ────────────────────────────────────────────────────

describe('LogicAgent', () => {
  const agent = new LogicAgent()

  it('has role "logic"', () => {
    expect(agent.role).toBe('logic')
  })

  it('contextUpdate returns null for test files', () => {
    const task = baseTask({ file: 'packages/core/auth/auth.test.ts', agent: 'logic' })
    const result = agent['contextUpdate'](task, 'test code')
    expect(result).toBeNull()
  })

  it('contextUpdate returns update for hook files', () => {
    const task = baseTask({
      file: 'packages/core/expense/use-submit-expense.ts',
      agent: 'logic',
      description: 'POST /api/expense-reports mutation hook',
    })
    const update = agent['contextUpdate'](task, 'hook code')
    expect(update).toContain('use-submit-expense.ts')
    expect(update).toContain('T001')
  })

  it('system prompt forbids react-dom imports', () => {
    const sys = agent['systemPrompt']()
    expect(sys.toLowerCase()).toContain('react-dom')
    expect(sys).toContain('NEVER import')
  })

  it('buildTaskPrompt notes test coverage for test files', () => {
    const task = baseTask({ file: 'packages/core/auth/auth.test.ts', agent: 'logic' })
    const prompt = agent['buildTaskPrompt']({ task, projectContext: '' })
    expect(prompt).toContain('test')
  })
})

// ── ApiAgent ──────────────────────────────────────────────────────

describe('ApiAgent', () => {
  const agent = new ApiAgent()

  it('has role "api"', () => {
    expect(agent.role).toBe('api')
  })

  it('contextUpdate extracts HTTP methods from route code', () => {
    const task = baseTask({
      file: 'app/api/expense-reports/route.ts',
      agent: 'api',
    })
    const code = `
export async function GET(req: NextRequest) {}
export async function POST(req: NextRequest) {}
`
    const update = agent['contextUpdate'](task, code)
    expect(update).toContain('GET')
    expect(update).toContain('POST')
    expect(update).toContain('/api/expense-reports')
  })

  it('system prompt enforces thin handler rule', () => {
    const sys = agent['systemPrompt']()
    expect(sys).toContain('validate → call → respond')
  })

  it('buildTaskPrompt includes file path', () => {
    const task = baseTask({
      file: 'app/api/expense-reports/route.ts',
      agent: 'api',
      description: 'POST handler for expense report creation',
    })
    const prompt = agent['buildTaskPrompt']({ task, projectContext: mockContext })
    expect(prompt).toContain('app/api/expense-reports/route.ts')
    expect(prompt).toContain('POST handler for expense report creation')
  })
})

// ── UIAgent ───────────────────────────────────────────────────────

describe('UIAgent', () => {
  const agent = new UIAgent()

  it('has role "ui"', () => {
    expect(agent.role).toBe('ui')
  })

  it('contextUpdate returns null for story files', () => {
    const task = baseTask({
      file: 'packages/ui/button/button.stories.tsx',
      agent: 'ui',
    })
    const result = agent['contextUpdate'](task, 'story code')
    expect(result).toBeNull()
  })

  it('contextUpdate extracts component name from export', () => {
    const task = baseTask({
      file: 'packages/ui/expense-form/expense-form.tsx',
      agent: 'ui',
      description: 'ExpenseForm with amount, category, date fields',
    })
    const code = `export function ExpenseForm({ onSubmit }: ExpenseFormProps) {}`
    const update = agent['contextUpdate'](task, code)
    expect(update).toContain('<ExpenseForm />')
  })

  it('system prompt forbids @forge/core imports', () => {
    const sys = agent['systemPrompt']()
    expect(sys).toContain('@forge/core')
    expect(sys).toContain('NEVER import')
  })

  it('buildTaskPrompt notes story requirements for story files', () => {
    const task = baseTask({
      file: 'packages/ui/button/button.stories.tsx',
      agent: 'ui',
    })
    const prompt = agent['buildTaskPrompt']({ task, projectContext: '' })
    expect(prompt).toContain('Default story')
  })
})

// ── PageAgent ─────────────────────────────────────────────────────

describe('PageAgent', () => {
  const agent = new PageAgent()

  it('has role "page"', () => {
    expect(agent.role).toBe('page')
  })

  it('contextUpdate always returns null (pages consume, not produce)', () => {
    const task = baseTask({ file: 'app/submit-expense/page.tsx', agent: 'page' })
    expect(agent['contextUpdate'](task, 'page code')).toBeNull()
  })

  it('system prompt enforces 100 line limit', () => {
    const sys = agent['systemPrompt']()
    expect(sys).toContain('100 lines')
  })

  it('system prompt forbids direct fetch', () => {
    const sys = agent['systemPrompt']()
    expect(sys).toContain('fetch')
    expect(sys).toContain('NEVER')
  })

  it('buildTaskPrompt emphasizes checking context for available hooks', () => {
    const task = baseTask({
      file: 'app/submit-expense/page.tsx',
      agent: 'page',
      description: 'Expense submission page',
    })
    const prompt = agent['buildTaskPrompt']({ task, projectContext: mockContext })
    expect(prompt).toContain('Available Hooks')
    expect(prompt).toContain('Available UI Components')
  })
})

// ── Write path boundaries ─────────────────────────────────────────

describe('write path boundary', () => {
  let mockSandbox: {
    readFile: ReturnType<typeof vi.fn>
    writeFile: ReturnType<typeof vi.fn>
    run: ReturnType<typeof vi.fn>
  }
  const emit = vi.fn()

  beforeEach(() => {
    mockSandbox = {
      readFile: vi.fn().mockResolvedValue(''),
      writeFile: vi.fn().mockResolvedValue(undefined),
      run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
    }
    emit.mockReset()
  })

  it('logic agent rejects writing to packages/ui/', async () => {
    const { llmText } = await import('../../lib/ai-client.js')
    const mockLlm = vi.mocked(llmText)
    // Simulate LLM calling write_file on a forbidden path
    mockLlm.mockImplementation(async ({ tools }: any) => {
      await tools.write_file.execute({ path: 'packages/ui/Button/Button.tsx', content: 'export function Button() {}' })
      return { text: '', steps: [] }
    })

    const agent = new LogicAgent()
    const task = baseTask({ agent: 'logic', file: 'packages/ui/Button/Button.tsx', action: 'create' })
    await agent.executeTask({ task, projectContext: '' }, emit, mockSandbox as any)

    expect(mockSandbox.writeFile).not.toHaveBeenCalledWith(
      expect.stringContaining('packages/ui/Button/Button.tsx'),
      expect.any(String),
    )
  })

  it('logic agent allows writing to packages/core/', async () => {
    const { llmText } = await import('../../lib/ai-client.js')
    const mockLlm = vi.mocked(llmText)
    // Simulate LLM calling write_file on an allowed path
    mockLlm.mockImplementation(async ({ tools }: any) => {
      await tools.write_file.execute({ path: 'packages/core/auth/use-login.ts', content: 'export function useLogin() {}' })
      return { text: '', steps: [] }
    })

    const agent = new LogicAgent()
    const task = baseTask({ agent: 'logic', file: 'packages/core/auth/use-login.ts', action: 'create' })
    await agent.executeTask({ task, projectContext: '' }, emit, mockSandbox as any)

    expect(mockSandbox.writeFile).toHaveBeenCalledWith(
      expect.stringContaining('packages/core/auth/use-login.ts'),
      expect.any(String),
    )
  })

  it('logic agent rejects str_replace on packages/ui/', async () => {
    const { llmText } = await import('../../lib/ai-client.js')
    const mockLlm = vi.mocked(llmText)
    // Simulate LLM calling str_replace on a forbidden path
    mockLlm.mockImplementation(async ({ tools }: any) => {
      await tools.str_replace.execute({
        path: 'packages/ui/Button/Button.tsx',
        old_str: 'export function Button() {}',
        new_str: 'export function Button({ variant }: any) {}',
      })
      return { text: '', steps: [] }
    })

    const agent = new LogicAgent()
    const task = baseTask({ agent: 'logic', file: 'packages/ui/Button/Button.tsx', action: 'modify' })
    await agent.executeTask({ task, projectContext: '' }, emit, mockSandbox as any)

    expect(mockSandbox.writeFile).not.toHaveBeenCalledWith(
      expect.stringContaining('packages/ui/Button/Button.tsx'),
      expect.any(String),
    )
  })
})

// ── Shared mock sandbox helper ────────────────────────────────────

function makeMockSandbox() {
  return {
    readFile: vi.fn().mockResolvedValue(''),
    writeFile: vi.fn().mockResolvedValue(undefined),
    run: vi.fn().mockResolvedValue({ stdout: '', stderr: '', exitCode: 0 }),
  }
}

// ── CustomBuilderAgent ────────────────────────────────────────────

describe('CustomBuilderAgent', () => {
  it('uses custom instructions as system prompt', () => {
    const agent = new CustomBuilderAgent('logic', {
      instructions: 'You are a custom agent.',
      tools: ['read_file'],
      writePaths: ['docs/'],
    })
    // @ts-expect-error accessing protected
    expect(agent.systemPrompt()).toBe('You are a custom agent.')
  })

  it('blocks write outside custom writePaths via the guard', async () => {
    const { llmText } = await import('../../lib/ai-client.js')
    const mockLlm = vi.mocked(llmText)
    mockLlm.mockImplementation(async ({ tools }: any) => {
      await tools.write_file.execute({ path: 'packages/core/hook.ts', content: 'export function hook() {}' })
      return { text: '', steps: [] }
    })

    const sandbox = makeMockSandbox()
    const writes: string[] = []
    sandbox.writeFile = async (path: string, _content: string) => { writes.push(path) }

    const agent = new CustomBuilderAgent('logic', {
      instructions: 'You are a custom agent.',
      tools: ['write_file'],
      writePaths: ['docs/'],
    })
    await agent.executeTask(
      {
        task: { id: 'T1', agent: 'logic', action: 'create', file: 'packages/core/hook.ts', description: 'test', depends_on: [], status: 'pending', depth: 0 },
        projectContext: '',
      },
      () => {},
      sandbox,
    )
    expect(writes.some(p => p.includes('packages/core/'))).toBe(false)
  })

  it('allows write inside custom writePaths', async () => {
    const { llmText } = await import('../../lib/ai-client.js')
    const mockLlm = vi.mocked(llmText)
    mockLlm.mockImplementation(async ({ tools }: any) => {
      await tools.write_file.execute({ path: 'docs/README.md', content: '# Docs' })
      return { text: '', steps: [] }
    })

    const sandbox = makeMockSandbox()
    const writes: string[] = []
    sandbox.writeFile = async (path: string, _content: string) => { writes.push(path) }

    const agent = new CustomBuilderAgent('logic', {
      instructions: 'You are a custom agent.',
      tools: ['write_file'],
      writePaths: ['docs/'],
    })
    await agent.executeTask(
      {
        task: { id: 'T1', agent: 'logic', action: 'create', file: 'docs/README.md', description: 'test', depends_on: [], status: 'pending', depth: 0 },
        projectContext: '',
      },
      () => {},
      sandbox,
    )
    expect(writes.some(p => p.includes('docs/'))).toBe(true)
  })
})

// ── Cross-agent: all agents have required methods ─────────────────

describe('All Builder Agents interface compliance', () => {
  const agents = [
    new SchemaAgent(),
    new LogicAgent(),
    new ApiAgent(),
    new UIAgent(),
    new PageAgent(),
  ]

  for (const agent of agents) {
    it(`${agent.role}: has systemPrompt()`, () => {
      expect(agent['systemPrompt']()).toBeTruthy()
      expect(typeof agent['systemPrompt']()).toBe('string')
    })

    it(`${agent.role}: systemPrompt is non-trivial (> 100 chars)`, () => {
      expect(agent['systemPrompt']().length).toBeGreaterThan(100)
    })

    it(`${agent.role}: buildTaskPrompt includes task description`, () => {
      const task = baseTask({ description: 'unique-test-description-12345', agent: agent.role })
      const prompt = agent['buildTaskPrompt']({ task, projectContext: '' })
      expect(prompt).toContain('unique-test-description-12345')
    })
  }
})

describe('buildTypedKBContext', () => {
  it('returns empty string when all arrays empty', () => {
    expect(buildTypedKBContext({ principles: [], specs: [], pastOutputs: [] })).toBe('')
  })

  it('includes Project Principles section', () => {
    const result = buildTypedKBContext({
      principles: [{ id: '1', type: 'principle', title: 'Keep it simple', content: 'YAGNI applies', tags: [], status: 'verified', confidence: 1 }],
      specs: [],
      pastOutputs: [],
    })
    expect(result).toContain('Project Principles')
    expect(result).toContain('Keep it simple')
  })
})

describe('buildMemoryContext', () => {
  it('returns empty string for empty array', () => {
    expect(buildMemoryContext([])).toBe('')
  })

  it('formats memories with memoryKey', () => {
    const result = buildMemoryContext([{ memoryKey: 'style', content: 'prefers short functions' }])
    expect(result).toContain('Your relevant memories')
    expect(result).toContain('[style] prefers short functions')
  })

  it('formats memories without memoryKey', () => {
    const result = buildMemoryContext([{ memoryKey: '', content: 'important fact' }])
    expect(result).toContain('important fact')
    expect(result).not.toContain('[]')
  })
})
