# Workflow Execution Flow — Design Spec

**Date:** 2026-06-09  
**Status:** Approved  
**Scope:** Wire up the end-to-end workflow execution pipeline across Agent service, Go API, and Web frontend.

---

## Background

The platform is pivoting from a code-generation tool to a **digital employee platform** where users describe repetitive work in natural language, an AI generates a step-by-step `WorkflowDefinition`, and the agent executes each step using typed Capabilities (browser, http, llm, notify, code).

As of this spec:
- The Capability engine and `POST /run-workflow` are fully implemented in the Agent service
- `generateWorkflowDefinition()` is exported from `pm-agent.ts` but has no HTTP entry point
- Go API has CRUD for workflows but no generate or run endpoints
- Frontend has a `WorkflowsPage` with a `CreateWorkflowModal` (generate is placeholder) and a `WorkflowCard` with a "运行" button (navigates to a non-existent route)

This spec closes all missing links.

---

## Goals

1. User types a natural language description → AI generates a real `WorkflowDefinition` with correct capabilities and instructions
2. User confirms and saves the workflow
3. User navigates to the run page, reviews the workflow, clicks "开始执行"
4. Each step executes in sequence; progress is visible in real time
5. Final status (done / failed) is persisted in the database

---

## Architecture

### End-to-End Data Flow

```
[Generate]
User types description
  → POST /api/v1/workflows/generate  (Go API)
  → POST /generate-workflow           (Agent)
  → generateWorkflowDefinition()
  → { definition: WorkflowDefinition }
  ← User previews steps, confirms
  → POST /api/v1/workflows            (existing CRUD, saves to DB)

[Execute]
User clicks "运行" on WorkflowCard
  → navigate /workflows/:id/run
  → page loads workflow details
  → user clicks "开始执行"
  → POST /api/v1/workflows/:id/runs   (Go API)
      creates WorkflowRun record (status=queued)
      calls Agent POST /run-workflow
        { runId, projectId: workflow.userId, workflowDefinition: workflow.definition }
      returns { runId, agentJobId, status: "queued" }
  → page polls GET /api/v1/workflow-runs/:runId/events (500 ms)
      Go API proxies Agent GET /status/:agentJobId
      returns { status, events[] }
  ← page renders step progress cards
  → when Agent job reaches terminal state (done|aborted):
      Agent calls PATCH /internal/workflow-runs/:runId/status
      Go API updates WorkflowRun.status, WorkflowRun.finishedAt in DB
  → polling detects terminal status, stops
```

---

## New Database Entity

### Table: `workflow_runs`

```sql
CREATE TABLE workflow_runs (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_id  UUID NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
  user_id      UUID NOT NULL,
  status       TEXT NOT NULL DEFAULT 'queued',   -- queued|running|done|failed
  error        TEXT,
  agent_job_id TEXT,                              -- agent-side jobId for event proxy
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at  TIMESTAMPTZ
);
```

`status` values mirror Agent job states: `queued → running → done | failed`.

---

## New API Endpoints

### Agent Service

#### `POST /generate-workflow`

Wraps `generateWorkflowDefinition()` from `pm-agent.ts`.

**Request:**
```json
{ "userInput": "每天从邮件提取发票信息，核对后发通知", "clarifications": [] }
```

**Response 200:**
```json
{ "definition": { "steps": [ ... ] } }
```

**Error:** 400 if `userInput` is missing; 500 if LLM call fails.

---

### Go API — Public

#### `POST /api/v1/workflows/generate`

Proxies to Agent `/generate-workflow`. The frontend calls this during workflow creation to get a real generated definition before saving.

**Request:** `{ "userInput": string }`  
**Response 200:** `{ "data": WorkflowDefinition }`  
**Auth:** JWT required.

---

#### `POST /api/v1/workflows/:id/runs`

Creates a `WorkflowRun` record and dispatches execution to the Agent.

**Steps:**
1. Validate workflow exists and belongs to the authenticated user
2. Insert `WorkflowRun` with `status=queued`
3. Call Agent `POST /run-workflow` with `{ taskId: run.ID, projectId: workflow.UserID, workflowDefinition: workflow.Definition }`
4. On agent 202: store returned `jobId` as `agent_job_id`, return 202
5. On agent error: mark run as `failed`, return 500

**Response 202:**
```json
{ "data": { "runId": "...", "agentJobId": "...", "status": "queued" } }
```

---

#### `GET /api/v1/workflow-runs/:runId`

Returns the persisted run record. Used to get terminal status after polling stops.

**Response 200:**
```json
{
  "data": {
    "id": "...", "workflowId": "...", "status": "done",
    "error": null, "createdAt": "...", "finishedAt": "..."
  }
}
```

**Auth:** JWT required; validates run belongs to user.

---

#### `GET /api/v1/workflow-runs/:runId/events`

Proxies the Agent's in-memory job status. Returns live events during execution; after the job is terminal, returns the last known state from DB.

**Response 200:**
```json
{
  "data": {
    "status": "running",
    "events": [
      { "type": "agent_start", "agent": "step_1", "content": "[提取发票] 开始执行（llm）" },
      { "type": "agent_thinking", "agent": "step_1", "content": "分析中..." },
      { "type": "agent_done", "agent": "step_1", "content": "识别到 3 张发票..." }
    ]
  }
}
```

**Logic:** If `agent_job_id` is set, proxy to `Agent GET /status/:agentJobId` and return its `events`. If `agent_job_id` is empty or agent returns 404 (job evicted from memory), fall back to run record from DB.

---

### Go API — Internal

#### `PATCH /internal/workflow-runs/:runId/status`

Called by the Agent when a workflow job reaches a terminal state.

**Request:**
```json
{ "status": "done", "errorMsg": "" }
```

**Steps:** Set `status`, set `finished_at = now()` if terminal, set `error` if provided.  
**Auth:** `INTERNAL_TOKEN` header (same as existing internal task endpoint).

---

## Agent Changes

### `POST /generate-workflow` handler (server.ts)

```
readBody → { userInput, clarifications }
→ generateWorkflowDefinition(userInput, clarifications ?? [])
→ send 200 { definition }
```

### `go-api-client.ts` — add `notifyWorkflowRun()`

New function alongside the existing `notifyGoAPI`. Sends to `/internal/workflow-runs/:runId/status` instead of `/internal/tasks/:taskId/status`.

The `runWorkflowJob()` in `job-runner.ts` will call `notifyWorkflowRun(job.taskId, state)` instead of `notifyGoAPI` when the job has a `runId` (distinguished by a new `jobType: 'workflow'` field on the Job, or simply by checking if `job.taskId` starts with a workflow-run-id prefix — use explicit `jobType`).

**Approach:** Add `jobType?: 'task' | 'workflow'` to the `Job` interface. The `handleRunWorkflow` handler in `server.ts` sets `jobType: 'workflow'` when constructing the Job object before calling `runWorkflowJob`. The terminal-state notification in `runWorkflowJob` dispatches to `notifyWorkflowRun` when `job.jobType === 'workflow'`, otherwise falls back to `notifyGoAPI`.

---

## Go API Domain & Repo

### `domain/workflow_run.go`

```go
type WorkflowRunStatus string
const (
  WorkflowRunStatusQueued  WorkflowRunStatus = "queued"
  WorkflowRunStatusRunning WorkflowRunStatus = "running"
  WorkflowRunStatusDone    WorkflowRunStatus = "done"
  WorkflowRunStatusFailed  WorkflowRunStatus = "failed"
)

type WorkflowRun struct {
  ID          string
  WorkflowID  string
  UserID      string
  Status      WorkflowRunStatus
  Error       string
  AgentJobID  string
  CreatedAt   time.Time
  FinishedAt  *time.Time
}

type WorkflowRunRepository interface {
  Create(ctx, WorkflowRun) (WorkflowRun, error)
  GetByID(ctx, id string) (WorkflowRun, error)
  UpdateStatus(ctx, id string, status WorkflowRunStatus, errMsg string, finishedAt *time.Time) error
  UpdateAgentJobID(ctx, id string, agentJobID string) error
}
```

---

## Frontend

### Core Hooks (`packages/core/workflow/use-workflow-runs.ts`)

```ts
useGenerateWorkflow()     // mutation → POST /api/v1/workflows/generate
useRunWorkflow(id)        // mutation → POST /api/v1/workflows/:id/runs → { runId, agentJobId }
useWorkflowRunEvents(runId) // query, refetchInterval: 500ms while status is non-terminal
```

### `CreateWorkflowModal` change

Replace the `handleGenerate` placeholder with:
```ts
const { mutateAsync: generate } = useGenerateWorkflow()
const handleGenerate = async () => {
  setStep('generating')
  try {
    const { data } = await generate({ userInput: input })
    setGeneratedDef(data)
    setStep('confirm')
  } catch { setStep('describe') }
}
```

### New Route: `/workflows/:id/run`

**Page: `apps/web/src/pages/workflows/[id]/run.tsx`**

Layout:
```
┌─────────────────────────────────────────────┐
│ ← 工作流名称                                  │
│                                             │
│  工作流步骤预览                               │
│  ┌──────────────────────────────────────┐   │
│  │ 1  分析发票邮件   (llm)              │   │
│  │ 2  核对金额       (llm)              │   │
│  │ 3  发送通知       (notify)           │   │
│  └──────────────────────────────────────┘   │
│                                             │
│         [ 开始执行 ]                         │
│                                             │
│  ── 执行记录 ──────────────────────────────  │
│  (执行开始后显示实时步骤进度)                  │
└─────────────────────────────────────────────┘
```

**State machine:**
- `idle` — shows workflow steps + "开始执行" button
- `running` — button disabled, step cards update with status indicators (pending → running → done/failed)
- `done` — shows success banner, button re-enables for re-run
- `failed` — shows error message, button re-enables

Step card states: grey (pending) → spinning (running) → green (done) → red (failed)

---

## Files Changed

### New files (9)
| File | Purpose |
|------|---------|
| `apps/api/api/handler/workflow_run.go` | Public run endpoints |
| `apps/api/api/handler/internal_workflow_run.go` | Internal status callback |
| `apps/api/domain/workflow_run.go` | Domain type + repository interface |
| `apps/api/db/postgres/workflow_run_repo.go` | Postgres implementation |
| `apps/api/db/migrations/20260609_create_workflow_runs.sql` | DB migration |
| `packages/core/workflow/use-workflow-runs.ts` | Core hooks |
| `apps/web/src/pages/workflows/[id]/run.tsx` | Run monitoring page |
| `apps/web/src/pages/workflows/[id]/index.tsx` | Workflow detail page stub (for "查看" nav — minimal, out of scope for execution flow) |

### Modified files (8)
| File | Change |
|------|--------|
| `apps/agent/src/server.ts` | Add `POST /generate-workflow` handler |
| `apps/agent/src/lib/go-api-client.ts` | Add `notifyWorkflowRun()` |
| `apps/agent/src/job-store.ts` | Add `jobType` field to `Job` interface |
| `apps/agent/src/job-runner.ts` | Use `notifyWorkflowRun` in `runWorkflowJob` |
| `apps/api/api/router.go` | Register 4 new routes |
| `apps/api/cmd/server/main.go` | Inject WorkflowRunHandler dependencies |
| `packages/core/workflow/index.ts` | Export new hooks |
| `packages/core/index.ts` | Re-export new hooks |
| `apps/web/src/routes.tsx` | Add `/workflows/:id/run` route |

---

## Error Handling

- **Agent `/generate-workflow` timeout:** Go API returns 503 with "AI 生成超时，请重试"
- **Agent unavailable at run time:** `POST /api/v1/workflows/:id/runs` returns 503; WorkflowRun record is created with `status=failed`
- **Step failure mid-run:** `runWorkflowJob` marks run `aborted`; Agent calls back PATCH; frontend shows which step failed and the error message
- **Agent job evicted from memory** (server restart): `/events` endpoint falls back to DB status; events array will be empty but terminal status is still readable

---

## Out of Scope

- Scheduled / webhook triggers (WorkflowTrigger.type already modelled in DB, execution not wired)
- Workflow editing UI (only create + run in this spec)
- Run history list per workflow (only latest run shown on the run page)
- Re-running a specific historical run
