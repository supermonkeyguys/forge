# Parallel Workflow Execution Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Enable true parallel workflow execution — AI generates a proper DAG with `depends_on`, the runtime executes independent steps concurrently, and the monitoring page shows steps grouped by execution layer.

**Architecture:** Three independent changes: (1) enrich the LLM prompt in `pm-agent.ts` so it reasons about dependencies and emits non-trivial `depends_on` fields; (2) replace the flat `topoSortSteps` in `job-runner.ts` with `buildExecutionLayers` which returns batches of independent steps, executed with `Promise.all`; (3) add a pure `computeLayers` helper to the run page that groups `workflow.definition.steps` into the same batches and renders parallel steps side-by-side.

**Tech Stack:** TypeScript/Node ESM (agent), React + TanStack Query (frontend)

---

## File Map

| File | Change |
|------|--------|
| `apps/agent/src/agents/pm-agent.ts` | Replace `generateWorkflowDefinition` prompt with DAG-aware version |
| `apps/agent/src/job-runner.ts` | Replace `topoSortSteps` → `buildExecutionLayers`, rewrite `runWorkflowJob` loop |
| `apps/web/src/pages/workflows/[id]/run.tsx` | Add `computeLayers` helper, re-render steps as layered groups |

---

## Task 1: pm-agent — DAG-aware prompt

**Files:**
- Modify: `apps/agent/src/agents/pm-agent.ts` (the `generateWorkflowDefinition` function at the bottom)

The current prompt tells the LLM to set `"depends_on": []` for everything. Replace the prompt so it explains parallel semantics and shows a concrete example.

- [ ] **Step 1: Replace the `generateWorkflowDefinition` prompt**

Find the `generateWorkflowDefinition` function in `apps/agent/src/agents/pm-agent.ts`. Replace only the `system` and `prompt` strings passed to `llmText` — leave the function signature, imports, and Zod parse call unchanged.

New `system`:
```
You generate workflow definitions as JSON.
Available capabilities: browser, http, llm, notify, code, file.
Always respond with valid JSON only, no markdown.

PARALLEL EXECUTION RULES — read carefully:
- Steps with no dependency between them run IN PARALLEL (simultaneously).
- A step's "depends_on" lists the IDs of steps that must COMPLETE before it can start.
- If two steps are independent (neither needs the other's output), both have depends_on: [].
- Only list a step in depends_on when you actually need its output as input to the current step.
- Aim to maximise parallelism: if 3 steps can all start at once, all three get depends_on: [].
```

New `prompt` (replace the existing one entirely):
```
${context}User request: ${userInput}

Generate a WorkflowDefinition JSON. Think step-by-step:
1. List all the work that needs to happen.
2. For each piece of work, ask: does it need the OUTPUT of another step? If yes, add that step to depends_on. If no, depends_on stays [].
3. Steps that can run at the same time MUST have non-overlapping depends_on so the runtime can parallelise them.

Example — "fetch weather and stock price, then write a summary report":
{
  "steps": [
    { "id": "s1", "name": "获取天气数据",   "capability": "http",  "instructions": "GET https://api.weather.com/...", "depends_on": [],         "config": {} },
    { "id": "s2", "name": "获取股票价格",   "capability": "http",  "instructions": "GET https://api.stock.com/...",   "depends_on": [],         "config": {} },
    { "id": "s3", "name": "生成汇总报告",   "capability": "llm",   "instructions": "根据上两步的天气和股价数据生成一份简洁的日报", "depends_on": ["s1","s2"], "config": {} }
  ]
}
s1 and s2 have no dependency on each other → both start immediately (parallel).
s3 needs both s1 and s2 → it starts only after both finish.

Now generate the WorkflowDefinition for the user request above.
Capability guide:
- "browser" — UI interaction (web forms, navigation, clicking)
- "http"    — API calls with a known URL
- "llm"     — analysis, extraction, summarisation, writing
- "notify"  — sending results via webhook or message
- "code"    — building a software application (rare)
- "file"    — reading or writing local files
```

Full replacement for the `generateWorkflowDefinition` function body (keep the function signature and imports above it):

```typescript
export async function generateWorkflowDefinition(
  userInput: string,
  clarifications: string[],
): Promise<WorkflowDefinition> {
  const context = clarifications.length > 0
    ? `User clarifications:\n${clarifications.join('\n')}\n\n`
    : ''

  const { text } = await generateText({
    model: anthropic(MODEL),
    system: `You generate workflow definitions as JSON.
Available capabilities: browser, http, llm, notify, code, file.
Always respond with valid JSON only, no markdown.

PARALLEL EXECUTION RULES — read carefully:
- Steps with no dependency between them run IN PARALLEL (simultaneously).
- A step's "depends_on" lists the IDs of steps that must COMPLETE before it can start.
- If two steps are independent (neither needs the other's output), both have depends_on: [].
- Only list a step in depends_on when you actually need its output as input to the current step.
- Aim to maximise parallelism: if 3 steps can all start at once, all three get depends_on: [].`,
    prompt: `${context}User request: ${userInput}

Generate a WorkflowDefinition JSON. Think step-by-step:
1. List all the work that needs to happen.
2. For each piece of work, ask: does it need the OUTPUT of another step? If yes, add that step to depends_on. If no, depends_on stays [].
3. Steps that can run at the same time MUST have non-overlapping depends_on so the runtime can parallelise them.

Example — "fetch weather and stock price, then write a summary report":
{
  "steps": [
    { "id": "s1", "name": "获取天气数据", "capability": "http", "instructions": "GET https://api.weather.com/...", "depends_on": [], "config": {} },
    { "id": "s2", "name": "获取股票价格", "capability": "http", "instructions": "GET https://api.stock.com/...",   "depends_on": [], "config": {} },
    { "id": "s3", "name": "生成汇总报告", "capability": "llm",  "instructions": "根据上两步的天气和股价数据生成一份简洁的日报", "depends_on": ["s1","s2"], "config": {} }
  ]
}

Capability guide:
- "browser" — UI interaction (web forms, navigation, clicking)
- "http"    — API calls with a known URL
- "llm"     — analysis, extraction, summarisation, writing
- "notify"  — sending results via webhook or message
- "code"    — building a software application (rare)
- "file"    — reading or writing local files`,
  })

  const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{"steps":[]}')
  return WorkflowDefinitionSchema.parse(json)
}
```

- [ ] **Step 2: Verify type-check passes for this file**

```bash
cd apps/agent && node_modules/.bin/tsc --noEmit 2>&1 | grep "pm-agent.ts" | grep -v "\.test\."
```

Expected: no output.

- [ ] **Step 3: Quick smoke test — does the prompt produce parallel steps?**

```bash
cd apps/agent && node --env-file=.env --import tsx/esm -e "
import { generateWorkflowDefinition } from './src/agents/pm-agent.js'
const def = await generateWorkflowDefinition(
  '同时查询今日天气和黄金价格，然后合并为一条摘要消息发送通知',
  []
)
console.log(JSON.stringify(def, null, 2))
"
```

Expected: a workflow where the weather and gold-price steps both have `"depends_on": []`, and the summary step has `"depends_on": ["<id1>","<id2>"]`.

- [ ] **Step 4: Commit**

```bash
cd /Users/cookie/project/forge
git add apps/agent/src/agents/pm-agent.ts
git commit -m "feat(agent): DAG-aware prompt — LLM now outputs parallel depends_on"
```

---

## Task 2: job-runner — parallel execution engine

**Files:**
- Modify: `apps/agent/src/job-runner.ts` (bottom section — `runWorkflowJob` and `topoSortSteps`)

Replace the flat serial loop with a layer-based parallel loop. Independent steps in the same layer run with `Promise.all`.

- [ ] **Step 1: Replace `topoSortSteps` with `buildExecutionLayers`**

At the bottom of `apps/agent/src/job-runner.ts`, find and delete the existing `topoSortSteps` function:

```typescript
// DELETE this entire function:
function topoSortSteps(steps: WorkflowStep[]): WorkflowStep[] {
  const byId = new Map(steps.map(s => [s.id, s]))
  const visited = new Set<string>()
  const result: WorkflowStep[] = []

  function visit(id: string) {
    if (visited.has(id)) return
    visited.add(id)
    const step = byId.get(id)
    if (!step) return
    for (const dep of step.depends_on) visit(dep)
    result.push(step)
  }

  for (const step of steps) visit(step.id)
  return result
}
```

Replace with:

```typescript
/**
 * Groups steps into execution layers.
 * Steps in the same layer have no dependency on each other and run in parallel.
 * Layer N starts only after every step in layer N-1 has completed.
 */
function buildExecutionLayers(steps: WorkflowStep[]): WorkflowStep[][] {
  const assigned = new Set<string>()
  const layers: WorkflowStep[][] = []

  while (assigned.size < steps.length) {
    const layer = steps.filter(
      s => !assigned.has(s.id) && s.depends_on.every(dep => assigned.has(dep)),
    )
    if (layer.length === 0) break  // cycle guard — should not happen with valid input
    layers.push(layer)
    for (const s of layer) assigned.add(s.id)
  }

  return layers
}
```

- [ ] **Step 2: Rewrite the `runWorkflowJob` execution loop**

Inside `runWorkflowJob`, replace:

```typescript
// BEFORE (serial):
const steps = topoSortSteps(workflowDefinition.steps)

for (const step of steps) {
  const ctx: RunContext = {
    projectId: job.projectId,
    jobId:     job.id,
    stepId:    step.id,
    emit:      (event) => jobStore.pushEvent(job.id, event as ProgressEvent),
    previousOutputs,
  }

  const result = await worker.execute(step, ctx)
  previousOutputs[step.id] = result.output

  if (result.status === 'failed') {
    jobStore.patch(job.id, {
      status:    'aborted',
      error:     result.error ?? result.output,
      updatedAt: new Date().toISOString(),
    })
    if (job.taskId) {
      await notifyWorkflowRun(job.taskId, 'aborted', result.error ?? undefined)
    }
    return
  }
}
```

With:

```typescript
// AFTER (parallel per layer):
const layers = buildExecutionLayers(workflowDefinition.steps)

for (const layer of layers) {
  const results = await Promise.all(
    layer.map(step => {
      const ctx: RunContext = {
        projectId:       job.projectId,
        jobId:           job.id,
        stepId:          step.id,
        emit:            (event) => jobStore.pushEvent(job.id, event as ProgressEvent),
        previousOutputs: { ...previousOutputs },  // snapshot — each parallel step sees same prior outputs
      }
      return worker.execute(step, ctx)
    }),
  )

  // Collect outputs from this layer before moving to the next
  for (const result of results) {
    previousOutputs[result.stepId] = result.output
  }

  // If any step in this layer failed, abort the whole run
  const failed = results.find(r => r.status === 'failed')
  if (failed) {
    jobStore.patch(job.id, {
      status:    'aborted',
      error:     failed.error ?? failed.output,
      updatedAt: new Date().toISOString(),
    })
    if (job.taskId) {
      await notifyWorkflowRun(job.taskId, 'aborted', failed.error ?? undefined)
    }
    return
  }
}
```

- [ ] **Step 3: Verify type-check**

```bash
cd apps/agent && node_modules/.bin/tsc --noEmit 2>&1 | grep "job-runner.ts" | grep -v "^src/job-runner.ts:99"
```

Expected: no output (line 99 is a pre-existing error unrelated to this change).

- [ ] **Step 4: Commit**

```bash
cd /Users/cookie/project/forge
git add apps/agent/src/job-runner.ts
git commit -m "feat(agent): parallel workflow execution — independent steps run concurrently per layer"
```

---

## Task 3: run page — layered step display

**Files:**
- Modify: `apps/web/src/pages/workflows/[id]/run.tsx`

Add a pure `computeLayers` helper (same algorithm as `buildExecutionLayers` in the backend), then render steps grouped by layer. Parallel steps within a layer appear side-by-side in a flex row.

- [ ] **Step 1: Add `computeLayers` helper and update the step rendering**

Replace the entire file `apps/web/src/pages/workflows/[id]/run.tsx` with:

```typescript
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useWorkflows, useRunWorkflow, useWorkflowRunEvents } from '@forge/core'
import type { WorkflowRunStatus } from '@forge/core'
import { Button } from '../../../components/ui/button'
import { Icons } from '../../../components/ui/icons'

const CAPABILITY_LABEL: Record<string, string> = {
  browser: '浏览器',
  http:    'HTTP',
  llm:     'AI 分析',
  notify:  '通知',
  code:    '代码生成',
  file:    '文件',
}

type RunState = 'idle' | 'running' | 'done' | 'failed'
type StepStatus = 'pending' | 'running' | 'done' | 'failed'

interface WorkflowStep {
  id:           string
  name:         string
  capability:   string
  instructions: string
  depends_on:   string[]
}

/** Groups steps into parallel execution layers (same logic as backend buildExecutionLayers). */
function computeLayers(steps: WorkflowStep[]): WorkflowStep[][] {
  const assigned = new Set<string>()
  const layers: WorkflowStep[][] = []
  while (assigned.size < steps.length) {
    const layer = steps.filter(
      s => !assigned.has(s.id) && s.depends_on.every(dep => assigned.has(dep)),
    )
    if (layer.length === 0) break
    layers.push(layer)
    for (const s of layer) assigned.add(s.id)
  }
  return layers
}

function statusToRunState(s: WorkflowRunStatus | undefined): RunState {
  if (!s || s === 'queued') return 'running'
  if (s === 'running') return 'running'
  if (s === 'done') return 'done'
  return 'failed'
}

function StepCard({ step, status }: { step: WorkflowStep; status: StepStatus }) {
  return (
    <div
      className={`flex items-center gap-3 rounded-lg border p-3 transition-colors flex-1 min-w-0 ${
        status === 'running' ? 'border-primary/40 bg-primary/5' :
        status === 'done'    ? 'border-green-500/30 bg-green-500/5' :
        status === 'failed'  ? 'border-destructive/30 bg-destructive/5' :
        'border-border/40'
      }`}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{step.name}</p>
        <p className="text-xs text-muted-foreground">
          {CAPABILITY_LABEL[step.capability] ?? step.capability}
        </p>
      </div>
      <span className="shrink-0">
        {status === 'running' && (
          <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
        )}
        {status === 'done'   && <Icons.CheckCircle className="h-4 w-4 text-green-500" />}
        {status === 'failed' && <Icons.X className="h-4 w-4 text-destructive" />}
      </span>
    </div>
  )
}

export function WorkflowRunPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: workflows } = useWorkflows()
  const workflow = workflows?.find(w => w.id === id)

  const [runId, setRunId] = useState<string | null>(null)
  const { mutate: startRun, isPending: isStarting } = useRunWorkflow(id ?? '')
  const { data: runEvents } = useWorkflowRunEvents(runId)

  const runState: RunState = runId ? statusToRunState(runEvents?.status) : 'idle'
  const stepEvents = runEvents?.events ?? []

  // Per-step status derived from event stream
  const stepStatuses: Record<string, StepStatus> = {}
  if (workflow) {
    for (const s of workflow.definition.steps) stepStatuses[s.id] = 'pending'
  }
  for (const ev of stepEvents) {
    if (ev.type === 'agent_start') stepStatuses[ev.agent] = 'running'
    if (ev.type === 'agent_done')  stepStatuses[ev.agent] = 'done'
    if (ev.type === 'agent_error') stepStatuses[ev.agent] = 'failed'
  }

  const handleStart = () => {
    startRun(undefined, { onSuccess: (data) => setRunId(data.runId) })
  }

  if (!workflow) {
    return <div className="p-8 text-muted-foreground text-sm">加载中...</div>
  }

  const layers = computeLayers(workflow.definition.steps as WorkflowStep[])

  return (
    <div className="flex flex-1 overflow-hidden">
      <div className="flex flex-1 flex-col gap-6 p-8 max-w-2xl mx-auto overflow-y-auto">

        {/* Header */}
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate('/workflows')}
            className="text-muted-foreground hover:text-foreground transition-colors"
          >
            <Icons.ChevronLeft className="h-4 w-4" />
          </button>
          <div>
            <h1 className="text-base font-semibold">{workflow.name}</h1>
            {workflow.description && (
              <p className="text-xs text-muted-foreground mt-0.5">{workflow.description}</p>
            )}
          </div>
        </div>

        {/* Layered step display */}
        <div className="flex flex-col gap-3">
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
            执行计划
          </p>
          {layers.map((layer, li) => (
            <div key={li} className="flex flex-col gap-1">
              {/* Layer label — only show if there are multiple layers */}
              {layers.length > 1 && (
                <div className="flex items-center gap-2 px-1">
                  <span className="text-[10px] text-muted-foreground/60 font-mono">
                    第 {li + 1} 批{layer.length > 1 ? ` · ${layer.length} 步并行` : ''}
                  </span>
                  {li < layers.length - 1 && (
                    <div className="flex-1 border-t border-dashed border-border/30" />
                  )}
                </div>
              )}
              {/* Steps in this layer — flex row for parallel, single card for serial */}
              <div className={`flex gap-2 ${layer.length > 1 ? 'flex-row' : 'flex-col'}`}>
                {layer.map(step => (
                  <StepCard
                    key={step.id}
                    step={step}
                    status={stepStatuses[step.id] ?? 'pending'}
                  />
                ))}
              </div>
              {/* Arrow between layers */}
              {li < layers.length - 1 && (
                <div className="flex justify-center py-0.5">
                  <Icons.ChevronDown className="h-3.5 w-3.5 text-muted-foreground/40" />
                </div>
              )}
            </div>
          ))}
        </div>

        {/* Start button */}
        <Button
          onClick={handleStart}
          disabled={isStarting || runState === 'running'}
          className="self-start"
        >
          {runState === 'running' ? (
            <>
              <div className="mr-2 h-3.5 w-3.5 animate-spin rounded-full border-2 border-background/30 border-t-background" />
              执行中...
            </>
          ) : runState === 'done' || runState === 'failed' ? (
            <>
              <Icons.Play className="mr-2 h-3.5 w-3.5" />
              重新执行
            </>
          ) : (
            <>
              <Icons.Play className="mr-2 h-3.5 w-3.5" />
              开始执行
            </>
          )}
        </Button>

        {/* Result banners */}
        {runState === 'done' && (
          <div className="rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-3 text-sm text-green-400">
            工作流执行完成
          </div>
        )}
        {runState === 'failed' && (
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive flex items-start gap-2">
            <Icons.AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>
              执行失败：
              {stepEvents.filter(e => e.type === 'agent_error').at(-1)?.content ?? '未知错误'}
            </span>
          </div>
        )}

        {/* Event log */}
        {stepEvents.length > 0 && (
          <div className="flex flex-col gap-1">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">执行日志</p>
            <div className="rounded-lg border border-border/40 bg-muted/20 p-3 font-mono text-xs space-y-1 max-h-64 overflow-y-auto">
              {stepEvents.map((ev, i) => (
                <div key={i} className="flex gap-2">
                  <span className="text-muted-foreground shrink-0">[{ev.agent}]</span>
                  <span className={
                    ev.type === 'agent_error' ? 'text-destructive' :
                    ev.type === 'agent_done'  ? 'text-green-400' : ''
                  }>{ev.content}</span>
                </div>
              ))}
            </div>
          </div>
        )}

      </div>
    </div>
  )
}
```

- [ ] **Step 2: Confirm `Icons.ChevronDown` exists (it does — already at line 249 of icons.tsx)**

No action needed.

- [ ] **Step 3: Type-check web**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -v "TS5097" | head -20
```

Expected: no new errors from `run.tsx`.

- [ ] **Step 4: Commit**

```bash
cd /Users/cookie/project/forge
git add "apps/web/src/pages/workflows/[id]/run.tsx" apps/web/src/components/ui/icons.tsx
git commit -m "feat(web): layered parallel step display in workflow run page"
```

---

## Self-Review

- [x] **Task 1** covers the prompt update for parallel DAG generation
- [x] **Task 2** covers replacing `topoSortSteps` with `buildExecutionLayers` and rewriting the execution loop
- [x] **Task 3** covers the frontend layer display with `computeLayers`
- [x] No placeholders — all code is complete and runnable
- [x] Type consistency — `WorkflowStep` interface in `run.tsx` matches `WorkflowStep` from `contracts/workflow.ts` (both have `id`, `name`, `capability`, `instructions`, `depends_on`, `config`)
- [x] `previousOutputs` snapshot (`{ ...previousOutputs }`) ensures each parallel step sees the same prior-layer outputs without race conditions
