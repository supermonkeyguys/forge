# Knowledge System V2 — Agent Service Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Update Agent Service to use the new project-scoped KB. Add typed injection (principles full, others by search). Add KBIngestJob for URL/file. Add auto knowledge extraction after task completion.

**Architecture:** Replace `workspace-kb-client.ts` with `project-kb-client.ts` that calls project-scoped endpoints. Update `base-builder.ts` injection to be type-aware. Add `runKBIngestJob` in `job-runner.ts`. Add `extractKnowledge()` in `orchestrator.ts` called after each successful task.

**Tech Stack:** TypeScript, Vitest, existing `FORGE_API_URL`/`INTERNAL_TOKEN` env pattern.

**Prerequisite:** Knowledge V2 API plan must be completed first.

---

## File Map

```
Created:
  apps/agent/src/lib/project-kb-client.ts   — replaces workspace-kb-client.ts
  apps/agent/src/agent-jobs/kb-ingest.ts    — KBIngestJob runner

Modified:
  apps/agent/src/agents/builder/base-builder.ts  — typed KB injection
  apps/agent/src/orchestrator/orchestrator.ts    — extractKnowledge() after task
  apps/agent/src/job-store.ts                    — add jobType field
  apps/agent/src/job-runner.ts                   — route by jobType
  apps/agent/src/server.ts                       — POST /run-kb-ingest endpoint

Removed:
  apps/agent/src/lib/workspace-kb-client.ts
```

---

## Task A1: project-kb-client.ts + update base-builder.ts injection

**Files:**
- Create: `apps/agent/src/lib/project-kb-client.ts`
- Modify: `apps/agent/src/agents/builder/base-builder.ts`
- Delete: `apps/agent/src/lib/workspace-kb-client.ts`

- [ ] **Step 1: Create project-kb-client.ts**

```ts
// apps/agent/src/lib/project-kb-client.ts
const FORGE_API_URL = process.env['FORGE_API_URL'] ?? ''
const INTERNAL_TOKEN = process.env['INTERNAL_TOKEN'] ?? ''

const HEADERS = {
  'Content-Type': 'application/json',
  'X-Internal-Token': INTERNAL_TOKEN,
}

export interface KBEntry {
  id: string
  type: string
  title: string
  content: string
  tags: string[]
  status: string
  confidence: number
}

/** Fetch all verified principles for a project (always inject). */
export async function fetchPrinciples(projectId: string, userID: string): Promise<KBEntry[]> {
  if (!FORGE_API_URL || !projectId) return []
  try {
    const url = `${FORGE_API_URL}/internal/projects/${projectId}/kb?type=principle&userid=${encodeURIComponent(userID)}&limit=20`
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(3000) })
    if (!res.ok) return []
    const json = await res.json() as { data: KBEntry[] }
    return json.data ?? []
  } catch { return [] }
}

/** Semantic search for relevant KB entries of a specific type. */
export async function searchProjectKB(
  projectId: string,
  userID: string,
  query: string,
  type: string,
  limit = 3,
): Promise<KBEntry[]> {
  if (!FORGE_API_URL || !projectId) return []
  try {
    const url = `${FORGE_API_URL}/internal/projects/${projectId}/kb?type=${type}&userid=${encodeURIComponent(userID)}&q=${encodeURIComponent(query)}&limit=${limit}`
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(3000) })
    if (!res.ok) return []
    const json = await res.json() as { data: KBEntry[] }
    return json.data ?? []
  } catch { return [] }
}

/** Agent submits a pending KB entry (needs human verification). */
export async function submitKBEntry(
  projectId: string,
  userID: string,
  entry: { type: string; title: string; content: string; tags?: string[]; sourceAgent: string; sourceTask: string; confidence?: number },
): Promise<void> {
  if (!FORGE_API_URL || !projectId || !userID) return
  try {
    await fetch(`${FORGE_API_URL}/internal/projects/${projectId}/kb`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ ...entry, userId: userID, tags: entry.tags ?? [] }),
      signal: AbortSignal.timeout(5000),
    })
  } catch (err) { console.error('[submitKBEntry] failed:', err) }
}

/** Build typed KB context for injection into system prompt. */
export function buildTypedKBContext(params: {
  principles: KBEntry[]
  specs: KBEntry[]
  testAssets?: KBEntry[]
  pastOutputs: KBEntry[]
}): string {
  const parts: string[] = []
  if (params.principles.length > 0) {
    parts.push('## Project Principles\n' +
      params.principles.map((e) => `- **${e.title}**: ${e.content}`).join('\n'))
  }
  if (params.specs.length > 0) {
    parts.push('## Relevant Design Specs\n' +
      params.specs.map((e) => `### ${e.title}\n${e.content}`).join('\n\n'))
  }
  if (params.testAssets && params.testAssets.length > 0) {
    parts.push('## Test Assets\n' +
      params.testAssets.map((e) => `- ${e.title}: ${e.content}`).join('\n'))
  }
  if (params.pastOutputs.length > 0) {
    parts.push('## Past Solutions\n' +
      params.pastOutputs.map((e) => `### ${e.title}\n${e.content}`).join('\n\n'))
  }
  return parts.length > 0 ? '\n\n' + parts.join('\n\n') : ''
}
```

- [ ] **Step 2: Write test for buildTypedKBContext**

In `builder.test.ts`, add:
```ts
import { buildTypedKBContext } from '../../lib/project-kb-client.js'

describe('buildTypedKBContext', () => {
  it('returns empty string when all arrays empty', () => {
    expect(buildTypedKBContext({ principles: [], specs: [], pastOutputs: [] })).toBe('')
  })

  it('includes principles section when provided', () => {
    const result = buildTypedKBContext({
      principles: [{ id: '1', type: 'principle', title: 'Keep it simple', content: 'YAGNI', tags: [], status: 'verified', confidence: 1 }],
      specs: [],
      pastOutputs: [],
    })
    expect(result).toContain('Project Principles')
    expect(result).toContain('Keep it simple')
  })
})
```

- [ ] **Step 3: Update base-builder.ts — replace workspace-kb imports with project-kb**

Remove:
```ts
import { searchKB, saveToKB, buildKBContext } from '../../lib/workspace-kb-client.js'
```

Add:
```ts
import {
  fetchPrinciples,
  searchProjectKB,
  submitKBEntry,
  buildTypedKBContext,
} from '../../lib/project-kb-client.js'
```

- [ ] **Step 4: Update executeTask() — typed KB injection**

Replace the current KB injection block:
```ts
// OLD:
const kbEntries = await searchKB(input.userID ?? '', input.task.description, 3)
const kbContext = buildKBContext(kbEntries)

// NEW:
const projectId = input.projectId ?? ''
const userID = input.userID ?? ''
const [principles, specs, pastOutputs, testAssets] = await Promise.all([
  fetchPrinciples(projectId, userID),
  searchProjectKB(projectId, userID, input.task.description, 'spec', 3),
  searchProjectKB(projectId, userID, input.task.description, 'past_output', 2),
  this.role === 'test'
    ? searchProjectKB(projectId, userID, input.task.description, 'test_asset', 5)
    : Promise.resolve([]),
])
const kbContext = buildTypedKBContext({ principles, specs, pastOutputs, testAssets })
```

- [ ] **Step 5: Add projectId to BuilderTaskInput in agents/types.ts**

```ts
export interface BuilderTaskInput {
  task: PlanTask
  projectContext: string
  existingFileContent?: string
  userID?: string
  projectId?: string   // add this
}
```

- [ ] **Step 6: Pass projectId in Orchestrator.generateTaskCode()**

In `orchestrator.ts`, update the `executeTask` call:
```ts
return agent.executeTask(
  {
    task: taskWithContext,
    projectContext: context,
    existingFileContent: existingContent,
    userID: this.deps.userID,
    projectId: this.ctx.projectId,   // add this
  },
  ...
)
```

- [ ] **Step 7: Update save_to_kb tool to use project-scoped submitKBEntry**

In `buildTools()`, replace the `save_to_kb` tool execute:
```ts
execute: async ({ title, content, tags }) => {
  emit({ type: 'agent_tool_use', agent: role, tool: 'save_to_kb', input: { title } })
  await submitKBEntry(
    /* projectId from closure */ input?.projectId ?? '',
    userID ?? '',
    { type: 'spec', title, content, tags, sourceAgent: role, sourceTask: currentTaskId ?? '' },
  )
  return { ok: true, note: 'Saved to project KB — pending human verification.' }
},
```

Note: `buildTools` needs access to `projectId`. Add it as a 9th parameter alongside `userID`.

- [ ] **Step 8: Delete workspace-kb-client.ts**

```bash
rm /Users/cookie/project/forge/apps/agent/src/lib/workspace-kb-client.ts
```

- [ ] **Step 9: Run full test suite**

```bash
cd /Users/cookie/project/forge/apps/agent && npx vitest run 2>&1 | tail -10
cd /Users/cookie/project/forge/apps/agent && npx tsc --noEmit 2>&1 | grep -v TS5097 | grep "error TS"
```

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat(agent): replace workspace-kb-client with project-kb-client, typed KB injection by type"
```

---

## Task A2: KBIngestJob — URL/file summarization

**Files:**
- Create: `apps/agent/src/agent-jobs/kb-ingest.ts`
- Modify: `apps/agent/src/job-store.ts`
- Modify: `apps/agent/src/job-runner.ts`
- Modify: `apps/agent/src/server.ts`

- [ ] **Step 1: Add jobType to job-store.ts**

In `apps/agent/src/job-store.ts`, add to Job interface:
```ts
jobType?: 'build' | 'kb_ingest'
kbEntryId?: string
kbSourceRef?: string
kbInputType?: 'url' | 'file'
```

- [ ] **Step 2: Create apps/agent/src/agent-jobs/kb-ingest.ts**

```ts
import { generateText } from 'ai'
import { anthropic, MODEL } from '../lib/ai-client.js'

const FORGE_API_URL = process.env['FORGE_API_URL'] ?? ''
const INTERNAL_TOKEN = process.env['INTERNAL_TOKEN'] ?? ''
const HEADERS = { 'Content-Type': 'application/json', 'X-Internal-Token': INTERNAL_TOKEN }

export async function runKBIngestJob(
  kbEntryId: string,
  inputType: 'url' | 'file',
  sourceRef: string,
): Promise<void> {
  let rawContent = ''

  if (inputType === 'url') {
    try {
      const res = await fetch(sourceRef, { signal: AbortSignal.timeout(10000) })
      rawContent = await res.text()
      // Strip HTML tags for cleaner content
      rawContent = rawContent.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 8000)
    } catch (err) {
      await updateKBEntry(kbEntryId, `Failed to fetch URL: ${err}`, 'pending')
      return
    }
  } else if (inputType === 'file') {
    // sourceRef is the file path stored by Go API
    const { readFileSync } = await import('fs')
    try {
      rawContent = readFileSync(sourceRef, 'utf-8').slice(0, 8000)
    } catch (err) {
      await updateKBEntry(kbEntryId, `Failed to read file: ${err}`, 'pending')
      return
    }
  }

  if (!rawContent) {
    await updateKBEntry(kbEntryId, '(empty content)', 'pending')
    return
  }

  const { text: summary } = await generateText({
    model: anthropic(MODEL),
    system: `You extract structured knowledge from content.
Output a concise summary (max 500 words) that:
- Captures the key principles, rules, or decisions
- Is written as actionable knowledge, not a description of the source
- Uses bullet points for distinct items
Do NOT mention the source URL or file. Just the knowledge.`,
    prompt: rawContent,
  })

  await updateKBEntry(kbEntryId, summary, 'pending')
}

async function updateKBEntry(id: string, content: string, status: string): Promise<void> {
  if (!FORGE_API_URL) return
  try {
    await fetch(`${FORGE_API_URL}/internal/kb/${id}/content`, {
      method: 'PATCH',
      headers: HEADERS,
      body: JSON.stringify({ content, status }),
      signal: AbortSignal.timeout(5000),
    })
  } catch (err) { console.error('[updateKBEntry] failed:', err) }
}
```

- [ ] **Step 3: Update job-runner.ts — route by jobType**

In `runJob`, add at the top:
```ts
if (job.jobType === 'kb_ingest') {
  const { runKBIngestJob } = await import('./agent-jobs/kb-ingest.js')
  await runKBIngestJob(
    job.kbEntryId ?? '',
    (job.kbInputType ?? 'url') as 'url' | 'file',
    job.kbSourceRef ?? '',
  )
  return
}
// ... existing build job logic continues
```

- [ ] **Step 4: Add POST /run-kb-ingest to server.ts**

In `apps/agent/src/server.ts`, find the POST /run handler area. Add a new route:

```ts
// POST /run-kb-ingest — triggered by Go API when a kb_ingest job is created
if (req.method === 'POST' && req.url === '/run-kb-ingest') {
  let body: unknown
  try { body = await readBody(req) } catch {
    return sendError(res, 400, 'invalid JSON body')
  }
  const { kbEntryId, kbInputType, kbSourceRef } = body as Record<string, unknown>
  if (typeof kbEntryId !== 'string') return sendError(res, 400, 'kbEntryId is required')

  const jobId = randomUUID()
  const job = {
    id: jobId, projectId: '', taskId: null,
    jobType: 'kb_ingest' as const,
    kbEntryId: kbEntryId,
    kbInputType: kbInputType as 'url' | 'file',
    kbSourceRef: typeof kbSourceRef === 'string' ? kbSourceRef : '',
    status: 'pending', userInput: '', events: [], updatedAt: new Date().toISOString(),
  }
  jobStore.set(job.id, job as any)
  runJob(job as any, '').catch((err: unknown) => console.error('[runKBIngest] failed:', err))
  send(res, 202, { jobId })
  return
}
```

- [ ] **Step 5: Run tests**

```bash
cd /Users/cookie/project/forge/apps/agent && npx vitest run 2>&1 | tail -5
cd /Users/cookie/project/forge/apps/agent && npx tsc --noEmit 2>&1 | grep -v TS5097 | grep "error TS"
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(agent): add KBIngestJob for URL/file summarization, route by jobType"
```

---

## Task A3: Auto knowledge extraction after task completion

**Files:**
- Modify: `apps/agent/src/orchestrator/orchestrator.ts`

- [ ] **Step 1: Add extractKnowledge() to orchestrator.ts**

Add import:
```ts
import { submitKBEntry } from '../lib/project-kb-client.js'
```

Add the method to `Orchestrator` class:

```ts
private async extractKnowledge(task: PlanTask, code: string): Promise<void> {
  if (!this.deps.userID || !this.ctx.projectId) return
  if (!FORGE_API_URL_SET) return  // skip if no API configured

  try {
    const { text } = await generateText({
      model: anthropic(MODEL),
      system: `You extract reusable knowledge from completed engineering tasks.
For each key insight worth remembering, output a JSON array:
[{ "type": "spec|principle|past_output", "title": "short title", "content": "concise explanation", "confidence": 0.7 }]

Types:
- principle: a rule that should always apply (rare, only if truly universal)
- spec: a specific technical decision made for this project
- past_output: a reusable pattern or solution

Output [] if nothing is genuinely reusable. Be selective. Max 3 items.`,
      prompt: `Completed task: ${task.description}\nFile: ${task.file}\nAgent: ${task.agent}\nKey output snippet:\n${code.slice(0, 500)}`,
    })

    let entries: Array<{ type: string; title: string; content: string; confidence: number }> = []
    try {
      const parsed = JSON.parse(text.trim())
      if (Array.isArray(parsed)) entries = parsed
    } catch { return }

    for (const entry of entries.slice(0, 3)) {
      if (!entry.title || !entry.content) continue
      await submitKBEntry(this.ctx.projectId, this.deps.userID, {
        type: entry.type ?? 'spec',
        title: entry.title,
        content: entry.content,
        sourceAgent: task.agent,
        sourceTask: task.id,
        confidence: entry.confidence ?? 0.7,
      })
    }
  } catch (err) {
    console.error('[extractKnowledge] failed:', err)
  }
}
```

Add `const FORGE_API_URL_SET = !!(process.env['FORGE_API_URL'])` at module level.

- [ ] **Step 2: Call extractKnowledge() in executeBatches()**

After `task.status = 'done'` and `this.emit({ type: 'task_status', ... })`:

```ts
task.status = 'done'
this.emit({ type: 'task_status', taskId: task.id, status: 'done' })
// Async knowledge extraction — don't await, non-blocking
this.extractKnowledge(task, codes[i]!).catch(() => {})
```

- [ ] **Step 3: Run tests**

```bash
cd /Users/cookie/project/forge/apps/agent && npx vitest run 2>&1 | tail -5
```

- [ ] **Step 4: Commit**

```bash
git add apps/agent/src/orchestrator/orchestrator.ts
git commit -m "feat(agent): auto-extract reusable knowledge after each task completes"
```
