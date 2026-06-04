# Agent Infrastructure Hardening Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Harden the Forge agent pipeline with three independent infrastructure improvements: task-level lifecycle tracking, structural write path boundaries per agent role, and instructions extracted to loadable data files.

**Architecture:** Three independent changes to `apps/agent/src/`: (1) orchestrator mutates `PlanTask.status` during execution and persists it after each task, emitting `task_status` events the frontend can consume; (2) `buildTools()` in `BaseBuilderAgent` checks write paths against a per-role allowlist before touching the sandbox — enforcing architectural boundaries structurally rather than via prompt; (3) all agent `systemPrompt()` methods and `SYSTEM_PROMPT` constants are replaced by a file-backed `InstructionRegistry` that loads markdown files at startup with validation.

**Tech Stack:** TypeScript 5, Zod, Vitest, AI SDK (`generateText`, `tool`), Node.js `fs.readFileSync`

---

## File Map

```
Modified:
  apps/agent/src/agents/types.ts                       — add task_status event
  apps/agent/src/orchestrator/orchestrator.ts          — mutate + persist task status
  apps/agent/src/orchestrator/orchestrator.test.ts     — test status propagation
  apps/agent/src/agents/builder/base-builder.ts        — add write path guard
  apps/agent/src/agents/builder/builder.test.ts        — test path guard
  apps/agent/src/agents/pm-agent.ts                    — use registry
  apps/agent/src/agents/architect-agent.ts             — use registry
  apps/agent/src/agents/builder/logic-agent.ts         — use registry
  apps/agent/src/agents/builder/api-agent.ts           — use registry
  apps/agent/src/agents/builder/ui-agent.ts            — use registry
  apps/agent/src/agents/builder/schema-agent.ts        — use registry
  apps/agent/src/agents/builder/page-agent.ts          — use registry
  apps/agent/src/agents/test-agent.ts                  — use registry

Created:
  apps/agent/src/lib/instruction-registry.ts           — load + cache + validate
  apps/agent/src/lib/instruction-registry.test.ts      — test load, validate, cache
  apps/agent/src/templates/instructions/pm.md
  apps/agent/src/templates/instructions/architect.md
  apps/agent/src/templates/instructions/logic.md
  apps/agent/src/templates/instructions/api.md
  apps/agent/src/templates/instructions/ui.md
  apps/agent/src/templates/instructions/schema.md
  apps/agent/src/templates/instructions/page.md
  apps/agent/src/templates/instructions/test.md
```

---

## Part A — Task Lifecycle Tracking

### Task A1: Add `task_status` event type

**Files:**
- Modify: `apps/agent/src/agents/types.ts`

- [ ] **Step 1: Add the event variant**

Open `apps/agent/src/agents/types.ts`. The `ProgressEvent` union currently ends with `agent_error`. Add one new variant:

```ts
export type ProgressEvent =
  | { type: "agent_start"; agent: AgentRole; message: string }
  | { type: "agent_thinking"; agent: AgentRole; content: string }
  | { type: "agent_tool_use"; agent: AgentRole; tool: string; input: unknown }
  | { type: "agent_file_write"; agent: AgentRole; file: string; action?: 'create' | 'modify' }
  | { type: "agent_spawn"; agent: AgentRole; spawnedRole: AgentRole; file: string; taskId: string; parentTaskId: string }
  | { type: "agent_done"; agent: AgentRole; summary: string }
  | { type: "agent_error"; agent: AgentRole; error: string }
  | { type: "task_status"; taskId: string; status: "in_progress" | "done" | "failed" };
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd apps/agent && npx tsc --noEmit 2>&1 | grep -v TS5097
```
Expected: no `error TS` lines (TS5097 is a pre-existing issue in packages/core, not related).

- [ ] **Step 3: Commit**

```bash
git add apps/agent/src/agents/types.ts
git commit -m "feat(agent): add task_status progress event type"
```

---

### Task A2: Mutate and persist task status in orchestrator

**Files:**
- Modify: `apps/agent/src/orchestrator/orchestrator.ts`

The current `executeBatches` generates code in parallel then commits sequentially, but never touches `task.status`. This task changes that.

- [ ] **Step 1: Write a failing test first**

Open `apps/agent/src/orchestrator/orchestrator.test.ts`. Find the test file, then add this test in the appropriate describe block:

```ts
it('emits task_status events in_progress then done for each task', async () => {
  const events: ProgressEvent[] = []
  const orc = makeOrchestrator({ onEvent: (e) => events.push(e) })

  // Use a plan with two tasks in sequence
  await orc.run()

  const statusEvents = events.filter(e => e.type === 'task_status')
  const inProgress = statusEvents.filter(e => e.type === 'task_status' && e.status === 'in_progress')
  const done = statusEvents.filter(e => e.type === 'task_status' && e.status === 'done')

  expect(inProgress.length).toBeGreaterThan(0)
  expect(done.length).toBeGreaterThan(0)
  // Each task_id that went in_progress must also appear as done (no orphans)
  const inProgressIds = new Set(inProgress.map(e => e.type === 'task_status' ? e.taskId : ''))
  const doneIds = new Set(done.map(e => e.type === 'task_status' ? e.taskId : ''))
  for (const id of inProgressIds) {
    expect(doneIds.has(id)).toBe(true)
  }
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd apps/agent && npx vitest run src/orchestrator/orchestrator.test.ts 2>&1 | tail -20
```
Expected: test fails (no `task_status` events emitted yet).

- [ ] **Step 3: Update `executeBatches` in orchestrator.ts**

Find the `executeBatches` private method (around line where `parallelBatches` result is looped). Replace it with:

```ts
private async executeBatches(batches: PlanTask[][]): Promise<void> {
  for (const batch of batches) {
    for (const task of batch) {
      task.status = 'in_progress'
      this.emit({ type: 'task_status', taskId: task.id, status: 'in_progress' })
    }

    const codes = await Promise.all(batch.map((task) => this.generateTaskCode(task)))

    for (let i = 0; i < batch.length; i++) {
      const task = batch[i]!
      try {
        await this.commitTask(task, codes[i]!)
        task.status = 'done'
        this.emit({ type: 'task_status', taskId: task.id, status: 'done' })
      } catch (err) {
        task.status = 'failed'
        this.emit({ type: 'task_status', taskId: task.id, status: 'failed' })
        throw err
      }
    }

    await this.writeSandboxFile(
      'contracts/task_plan.json',
      JSON.stringify(this.plan, null, 2),
    )
  }
}
```

- [ ] **Step 4: Update `executeFixInstructions` the same way**

Find `executeFixInstructions`. Replace with:

```ts
private async executeFixInstructions(instructions: FixInstruction[]): Promise<void> {
  for (const instruction of instructions) {
    const tasks = instruction.taskIds.length > 0
      ? this.plan!.tasks.filter((t) => instruction.taskIds.includes(t.id))
      : this.plan!.tasks.filter((t) => t.agent === instruction.agent)

    for (const task of tasks) {
      task.status = 'in_progress'
      this.emit({ type: 'task_status', taskId: task.id, status: 'in_progress' })
    }

    const codes = await Promise.all(
      tasks.map((task) => this.generateTaskCode(task, instruction.errorContext)),
    )

    for (let i = 0; i < tasks.length; i++) {
      const task = tasks[i]!
      try {
        await this.commitTask(task, codes[i]!)
        task.status = 'done'
        this.emit({ type: 'task_status', taskId: task.id, status: 'done' })
      } catch (err) {
        task.status = 'failed'
        this.emit({ type: 'task_status', taskId: task.id, status: 'failed' })
        throw err
      }
    }

    await this.writeSandboxFile(
      'contracts/task_plan.json',
      JSON.stringify(this.plan, null, 2),
    )
  }
}
```

- [ ] **Step 5: Run test to confirm it passes**

```bash
cd apps/agent && npx vitest run src/orchestrator/orchestrator.test.ts 2>&1 | tail -20
```
Expected: new test passes, all other tests still pass.

- [ ] **Step 6: Verify TypeScript**

```bash
cd apps/agent && npx tsc --noEmit 2>&1 | grep -v TS5097
```
Expected: no `error TS` lines.

- [ ] **Step 7: Commit**

```bash
git add apps/agent/src/orchestrator/orchestrator.ts apps/agent/src/orchestrator/orchestrator.test.ts
git commit -m "feat(orchestrator): track and persist task status during execution"
```

---

## Part B — Write Path Boundaries

### Task B1: Add per-role write allowlist in BaseBuilderAgent

**Files:**
- Modify: `apps/agent/src/agents/builder/base-builder.ts`

The goal: when a builder agent tries to `write_file` or `str_replace` to a path outside its domain, the tool returns an error instead of writing.

- [ ] **Step 1: Write a failing test**

Open `apps/agent/src/agents/builder/builder.test.ts`. Add:

```ts
describe('write path boundary', () => {
  it('logic agent rejects writing to packages/ui/', async () => {
    const sandbox = makeMockSandbox()
    const logic = new LogicAgent()
    const writes: string[] = []
    sandbox.writeFile = async (path: string, _content: string) => { writes.push(path) }

    await logic.executeTask(
      {
        task: {
          id: 'T001', agent: 'logic', action: 'create',
          file: 'packages/ui/Button/Button.tsx',
          description: 'Create a button component',
          depends_on: [], status: 'pending', depth: 0,
        },
        projectContext: '',
      },
      () => {},
      sandbox,
    )

    // The file must NOT have been written
    expect(writes.some(p => p.includes('packages/ui/'))).toBe(false)
  })

  it('logic agent allows writing to packages/core/', async () => {
    const sandbox = makeMockSandbox()
    const logic = new LogicAgent()
    const writes: string[] = []
    sandbox.writeFile = async (path: string, content: string) => {
      writes.push(path)
      return (makeMockSandbox() as any).writeFile.call({ files: new Map() }, path, content)
    }

    await logic.executeTask(
      {
        task: {
          id: 'T001', agent: 'logic', action: 'create',
          file: 'packages/core/auth/use-login.ts',
          description: 'Create login hook',
          depends_on: [], status: 'pending', depth: 0,
        },
        projectContext: '',
      },
      () => {},
      sandbox,
    )

    expect(writes.some(p => p.includes('packages/core/'))).toBe(true)
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd apps/agent && npx vitest run src/agents/builder/builder.test.ts -t "write path boundary" 2>&1 | tail -20
```
Expected: both tests fail (no path guard exists yet).

- [ ] **Step 3: Add `WRITE_ALLOWED` map and path guard to `buildTools()`**

In `base-builder.ts`, directly above the `buildTools` function definition, insert:

```ts
const WRITE_ALLOWED: Record<AgentRole, (path: string) => boolean> = {
  schema: (p) => p.startsWith('prisma/'),
  logic:  (p) => p.startsWith('packages/core/') || p.startsWith('server/domain/'),
  api:    (p) => p.startsWith('app/api/') || p.startsWith('server/infra/'),
  ui:     (p) => p.startsWith('packages/ui/'),
  page:   (p) => p.startsWith('app/') && !p.startsWith('app/api/'),
}
```

Then in the `write_file` tool's `execute` function, add a guard as the first line:

```ts
execute: async ({ path, content }) => {
  const guard = WRITE_ALLOWED[role]
  if (guard && !guard(path)) {
    return { ok: false, error: `write blocked: ${role} agent is not allowed to write to "${path}"` }
  }
  // ... rest of existing code unchanged
```

And in the `str_replace` tool's `execute` function, add the same guard:

```ts
execute: async ({ path, old_str, new_str }) => {
  const guard = WRITE_ALLOWED[role]
  if (guard && !guard(path)) {
    return { ok: false, error: `str_replace blocked: ${role} agent is not allowed to modify "${path}"` }
  }
  // ... rest of existing code unchanged
```

- [ ] **Step 4: Run tests to confirm both pass**

```bash
cd apps/agent && npx vitest run src/agents/builder/builder.test.ts -t "write path boundary" 2>&1 | tail -20
```
Expected: both tests pass.

- [ ] **Step 5: Run full builder test suite to check for regressions**

```bash
cd apps/agent && npx vitest run src/agents/builder/ 2>&1 | tail -20
```
Expected: all tests pass.

- [ ] **Step 6: Verify TypeScript**

```bash
cd apps/agent && npx tsc --noEmit 2>&1 | grep -v TS5097
```
Expected: no `error TS` lines.

- [ ] **Step 7: Commit**

```bash
git add apps/agent/src/agents/builder/base-builder.ts apps/agent/src/agents/builder/builder.test.ts
git commit -m "feat(builder): enforce write path boundaries per agent role"
```

---

## Part C — Instructions as Data

### Task C1: Create InstructionRegistry

**Files:**
- Create: `apps/agent/src/lib/instruction-registry.ts`
- Create: `apps/agent/src/lib/instruction-registry.test.ts`

- [ ] **Step 1: Write the failing test first**

Create `apps/agent/src/lib/instruction-registry.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { getInstructions, preloadAll } from './instruction-registry.js'

describe('InstructionRegistry', () => {
  it('loads instructions for a known role', () => {
    const text = getInstructions('logic')
    expect(text.length).toBeGreaterThan(50)
  })

  it('throws for an unknown role', () => {
    expect(() => getInstructions('nonexistent' as any)).toThrow()
  })

  it('returns the same string on repeated calls (cached)', () => {
    const a = getInstructions('api')
    const b = getInstructions('api')
    expect(a).toBe(b)
  })

  it('preloadAll loads every known role without throwing', () => {
    expect(() => preloadAll()).not.toThrow()
  })
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd apps/agent && npx vitest run src/lib/instruction-registry.test.ts 2>&1 | tail -20
```
Expected: fails — module does not exist yet.

- [ ] **Step 3: Create the registry module**

Create `apps/agent/src/lib/instruction-registry.ts`:

```ts
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const INSTRUCTIONS_DIR = join(__dirname, '../templates/instructions')

const KNOWN_ROLES = ['pm', 'architect', 'logic', 'api', 'ui', 'schema', 'page', 'test'] as const
type InstructionRole = typeof KNOWN_ROLES[number]

const cache = new Map<string, string>()

function load(role: InstructionRole): string {
  const path = join(INSTRUCTIONS_DIR, `${role}.md`)
  let content: string
  try {
    content = readFileSync(path, 'utf-8').trim()
  } catch {
    throw new Error(`instruction-registry: file not found for role "${role}" at ${path}`)
  }
  if (!content) throw new Error(`instruction-registry: empty instructions for role "${role}"`)
  return content
}

export function getInstructions(role: InstructionRole): string {
  if (!KNOWN_ROLES.includes(role)) {
    throw new Error(`instruction-registry: unknown role "${role}". Known: ${KNOWN_ROLES.join(', ')}`)
  }
  if (!cache.has(role)) {
    cache.set(role, load(role))
  }
  return cache.get(role)!
}

export function preloadAll(): void {
  for (const role of KNOWN_ROLES) {
    getInstructions(role)
  }
}
```

- [ ] **Step 4: Create the instruction files (content extracted from current agents)**

Create `apps/agent/src/templates/instructions/pm.md` — copy the current `SYSTEM_PROMPT` string from `pm-agent.ts` verbatim (lines 87–113, everything between the backticks):

```
You are a product manager for Forge, an AI application factory.
Your job is to turn a user's vague app description into a structured, buildable specification.

Key principles:
1. AMPLIFY implicit requirements — most users don't think to mention things like "loading states",
   "error messages", "empty states", or domain-specific logic. Surface these.
2. PRIORITIZE by confidence:
   - high: every app of this type needs it (form validation, responsive layout, success/error feedback)
   - medium: most apps of this type need it (pagination, search, filters)
   - low: optional or complex (advanced analytics, multi-tenant, real-time collaboration)
3. ACCEPTANCE CRITERIA must be concrete and independently testable.
   Bad:  "User can log in"
   Good: "User can submit email+password, see error on wrong credentials, redirect to /dashboard on success"
4. For clarifying_questions: only ask genuine architectural blockers.
   For each question, also generate 2-4 concrete options the user can pick.
   Use type="single" for mutually exclusive choices, type="multiple" for
   "check all that apply", type="text" only when free input is truly needed.
   Mark required=true only if the answer changes core architecture.
5. Mark features as selected=true by default for high/medium confidence,
   selected=false for low confidence.
```

Create `apps/agent/src/templates/instructions/architect.md` — copy the current `SYSTEM_PROMPT` from `architect-agent.ts` verbatim (lines 59–107, everything between the backticks).

Create `apps/agent/src/templates/instructions/logic.md` — copy the return value of `systemPrompt()` from `logic-agent.ts` verbatim.

Create `apps/agent/src/templates/instructions/api.md` — copy from `api-agent.ts`.

Create `apps/agent/src/templates/instructions/ui.md` — copy from `ui-agent.ts`.

Create `apps/agent/src/templates/instructions/schema.md` — copy from `schema-agent.ts`.

Create `apps/agent/src/templates/instructions/page.md` — copy from `page-agent.ts`.

Create `apps/agent/src/templates/instructions/test.md` — copy from `test-agent.ts`.

- [ ] **Step 5: Run tests to confirm they pass**

```bash
cd apps/agent && npx vitest run src/lib/instruction-registry.test.ts 2>&1 | tail -20
```
Expected: all 4 tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/agent/src/lib/instruction-registry.ts apps/agent/src/lib/instruction-registry.test.ts apps/agent/src/templates/instructions/
git commit -m "feat(agent): add InstructionRegistry — load agent instructions from markdown files"
```

---

### Task C2: Wire agents to use InstructionRegistry

**Files:**
- Modify: `apps/agent/src/agents/pm-agent.ts`
- Modify: `apps/agent/src/agents/architect-agent.ts`
- Modify: `apps/agent/src/agents/builder/logic-agent.ts`
- Modify: `apps/agent/src/agents/builder/api-agent.ts`
- Modify: `apps/agent/src/agents/builder/ui-agent.ts`
- Modify: `apps/agent/src/agents/builder/schema-agent.ts`
- Modify: `apps/agent/src/agents/builder/page-agent.ts`
- Modify: `apps/agent/src/agents/test-agent.ts`

- [ ] **Step 1: Update `pm-agent.ts`**

Add the import at the top of the file (after existing imports):
```ts
import { getInstructions } from '../lib/instruction-registry.js'
```

Find the line:
```ts
const SYSTEM_PROMPT = `You are a product manager for Forge...`
```
Replace the entire multi-line constant with:
```ts
const SYSTEM_PROMPT = getInstructions('pm')
```

- [ ] **Step 2: Update `architect-agent.ts`**

Add import:
```ts
import { getInstructions } from '../lib/instruction-registry.js'
```

Find:
```ts
const SYSTEM_PROMPT = `You are the Architect Agent for Forge...`
```
Replace with:
```ts
const SYSTEM_PROMPT = getInstructions('architect')
```

- [ ] **Step 3: Update each builder agent**

For each of `logic-agent.ts`, `api-agent.ts`, `ui-agent.ts`, `schema-agent.ts`, `page-agent.ts`:

Add import:
```ts
import { getInstructions } from '../../lib/instruction-registry.js'
```

Find the `protected systemPrompt(): string { return \`...\` }` method. Replace the return value with the registry call. For example in `logic-agent.ts`:
```ts
protected systemPrompt(): string {
  return getInstructions('logic')
}
```
Apply the same pattern for api/ui/schema/page with their respective role names.

- [ ] **Step 4: Update `test-agent.ts`**

Find the system prompt constant or method (check the file — it follows the same pattern as others). Replace with `getInstructions('test')`, adding the import from `'../lib/instruction-registry.js'`.

- [ ] **Step 5: Run full test suite**

```bash
cd apps/agent && npx vitest run 2>&1 | tail -30
```
Expected: all tests pass. Any failures here indicate a copy-paste error in the instruction files — the content must be byte-for-byte identical to what was previously hardcoded.

- [ ] **Step 6: Verify TypeScript**

```bash
cd apps/agent && npx tsc --noEmit 2>&1 | grep -v TS5097
```
Expected: no `error TS` lines.

- [ ] **Step 7: Commit**

```bash
git add apps/agent/src/agents/
git commit -m "refactor(agent): replace hardcoded SYSTEM_PROMPT constants with InstructionRegistry"
```

---

## Self-Review

**Spec coverage:**
- ✅ Direction 1 (task lifecycle): `task_status` event added, `executeBatches` and `executeFixInstructions` both mutate status and persist to sandbox
- ✅ Direction 2 (tool boundaries): `WRITE_ALLOWED` map in `buildTools()`, applied to both `write_file` and `str_replace`
- ✅ Direction 3 (instructions as data): `InstructionRegistry` with cache + validation, all 8 agents wired

**Placeholder scan:** No TBDs — all code blocks are complete.

**Type consistency:** `task_status` event shape defined in Task A1 and referenced in Task A2. `InstructionRole` type defined in registry and passed correctly by each agent. `WRITE_ALLOWED` keyed on `AgentRole` which is the same type used by `buildTools()` parameter.
