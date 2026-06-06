# Task Steps Persistence Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist each completed agent task (PM, Architect, each builder file, Test Agent) as a row in `task_steps`, so the frontend can reload step history after page refresh without relying on the in-memory event array.

**Architecture:** Agent service captures per-task events via a local emit wrapper in `generateTaskCode`, then calls `deps.onTaskComplete` after `commitTask`. `job-runner.ts` implements `onTaskComplete` by calling `POST /internal/tasks/:id/steps` with retry. Go API stores steps in a new `task_steps` table and exposes them via a public GET endpoint. Frontend reads steps for completed tasks via `useTaskSteps`, replacing the stale `events_json` blob restore path.

**Tech Stack:** Go + pgx (DB), TypeScript (agent service), React + TanStack Query (frontend)

---

## File Map

**Create:**
- `apps/api/migrations/009_task_steps.sql`
- `apps/api/domain/task_step.go`
- `apps/api/infra/mock/task_step_repo.go`
- `apps/api/infra/postgres/task_step_repo.go`
- `apps/api/api/handler/task_step.go`
- `apps/api/api/handler/task_step_test.go`
- `packages/core/task/use-task-steps.ts`

**Modify:**
- `apps/api/api/handler/internal.go` — add `taskStepRepo` + `CreateTaskStep`
- `apps/api/api/handler/internal_test.go` — add test for CreateTaskStep
- `apps/api/api/router.go` — add steps routes
- `apps/api/cmd/server/main.go` — wire taskStepRepo
- `apps/agent/src/orchestrator/orchestrator.ts` — `OrchestratorDeps`, `generateTaskCode`, PM/Arch/Test step calls
- `apps/agent/src/job-runner.ts` — implement `onTaskComplete`
- `apps/agent/src/lib/go-api-client.ts` — add `writeTaskStep` with retry
- `apps/web/src/pages/workspace/components/AgentFlowPanel.tsx` — use steps for completed tasks
- `packages/core/index.ts` — export `useTaskSteps`

---

## Task 1: DB Migration

**Files:**
- Create: `apps/api/migrations/009_task_steps.sql`

- [ ] **Step 1: Create migration file**

```sql
-- apps/api/migrations/009_task_steps.sql
CREATE TABLE IF NOT EXISTS task_steps (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  task_id     TEXT        NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
  seq_no      INTEGER     NOT NULL,
  agent       TEXT        NOT NULL,
  summary     TEXT        NOT NULL DEFAULT '',
  tool_calls  JSONB       NOT NULL DEFAULT '[]',
  duration_ms INTEGER     NOT NULL DEFAULT 0,
  status      TEXT        NOT NULL DEFAULT 'done',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(task_id, seq_no)
);

CREATE INDEX IF NOT EXISTS task_steps_task_id_idx ON task_steps(task_id);
```

- [ ] **Step 2: Run migration**

```bash
make db-migrate
```

Expected output:
```
skip 001_init.sql (already applied)
...
running 009_task_steps.sql...
  ok
applied 1 migration(s)
```

- [ ] **Step 3: Confirm table exists**

```bash
psql postgres://forge:forge@localhost:5432/forge -c "\d task_steps"
```

Expected: table with columns id, task_id, seq_no, agent, summary, tool_calls, duration_ms, status, created_at.

- [ ] **Step 4: Commit**

```bash
git add apps/api/migrations/009_task_steps.sql
git commit -m "feat(db): add task_steps table for agent step persistence"
```

---

## Task 2: Go Domain Type + Mock Repo

**Files:**
- Create: `apps/api/domain/task_step.go`
- Create: `apps/api/infra/mock/task_step_repo.go`

- [ ] **Step 1: Create domain file**

```go
// apps/api/domain/task_step.go
package domain

import (
	"context"
	"encoding/json"
	"time"
)

type ToolCallEntry struct {
	Tool  string          `json:"tool"`
	Input json.RawMessage `json:"input"`
}

type TaskStep struct {
	ID         string          `json:"id"`
	TaskID     string          `json:"taskId"`
	SeqNo      int             `json:"seqNo"`
	Agent      string          `json:"agent"`
	Summary    string          `json:"summary"`
	ToolCalls  []ToolCallEntry `json:"toolCalls"`
	DurationMs int             `json:"durationMs"`
	Status     string          `json:"status"`
	CreatedAt  time.Time       `json:"createdAt"`
}

type TaskStepRepository interface {
	Create(ctx context.Context, step TaskStep) (TaskStep, error)
	ListByTaskID(ctx context.Context, taskID string) ([]TaskStep, error)
}
```

- [ ] **Step 2: Create mock repo**

```go
// apps/api/infra/mock/task_step_repo.go
package mock

import (
	"context"

	"github.com/forge-ai/forge/api/domain"
)

type TaskStepRepo struct {
	CreateFn        func(ctx context.Context, step domain.TaskStep) (domain.TaskStep, error)
	ListByTaskIDFn  func(ctx context.Context, taskID string) ([]domain.TaskStep, error)
}

func (m *TaskStepRepo) Create(ctx context.Context, step domain.TaskStep) (domain.TaskStep, error) {
	return m.CreateFn(ctx, step)
}

func (m *TaskStepRepo) ListByTaskID(ctx context.Context, taskID string) ([]domain.TaskStep, error) {
	return m.ListByTaskIDFn(ctx, taskID)
}
```

- [ ] **Step 3: Verify Go compiles**

```bash
cd apps/api && go build ./...
```

Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add apps/api/domain/task_step.go apps/api/infra/mock/task_step_repo.go
git commit -m "feat(domain): add TaskStep domain type and mock repo"
```

---

## Task 3: Go Postgres Repo

**Files:**
- Create: `apps/api/infra/postgres/task_step_repo.go`

- [ ] **Step 1: Create postgres implementation**

```go
// apps/api/infra/postgres/task_step_repo.go
package postgres

import (
	"context"
	"encoding/json"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/forge-ai/forge/api/domain"
)

type taskStepRepo struct{ pool *pgxpool.Pool }

func NewTaskStepRepo(pool *pgxpool.Pool) domain.TaskStepRepository {
	return &taskStepRepo{pool: pool}
}

func (r *taskStepRepo) Create(ctx context.Context, step domain.TaskStep) (domain.TaskStep, error) {
	toolCallsJSON, err := json.Marshal(step.ToolCalls)
	if err != nil {
		return domain.TaskStep{}, err
	}

	var result domain.TaskStep
	var toolCallsRaw []byte
	err = r.pool.QueryRow(ctx,
		`INSERT INTO task_steps (task_id, seq_no, agent, summary, tool_calls, duration_ms, status)
		 VALUES ($1,$2,$3,$4,$5,$6,$7)
		 RETURNING id, task_id, seq_no, agent, summary, tool_calls, duration_ms, status, created_at`,
		step.TaskID, step.SeqNo, step.Agent, step.Summary,
		toolCallsJSON, step.DurationMs, step.Status,
	).Scan(
		&result.ID, &result.TaskID, &result.SeqNo, &result.Agent,
		&result.Summary, &toolCallsRaw, &result.DurationMs,
		&result.Status, &result.CreatedAt,
	)
	if err != nil {
		return domain.TaskStep{}, err
	}
	if len(toolCallsRaw) > 0 {
		_ = json.Unmarshal(toolCallsRaw, &result.ToolCalls)
	}
	if result.ToolCalls == nil {
		result.ToolCalls = []domain.ToolCallEntry{}
	}
	return result, nil
}

func (r *taskStepRepo) ListByTaskID(ctx context.Context, taskID string) ([]domain.TaskStep, error) {
	rows, err := r.pool.Query(ctx,
		`SELECT id, task_id, seq_no, agent, summary, tool_calls, duration_ms, status, created_at
		 FROM task_steps WHERE task_id = $1 ORDER BY seq_no ASC`,
		taskID,
	)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var steps []domain.TaskStep
	for rows.Next() {
		var s domain.TaskStep
		var toolCallsRaw []byte
		if err := rows.Scan(
			&s.ID, &s.TaskID, &s.SeqNo, &s.Agent,
			&s.Summary, &toolCallsRaw, &s.DurationMs,
			&s.Status, &s.CreatedAt,
		); err != nil {
			return nil, err
		}
		if len(toolCallsRaw) > 0 {
			_ = json.Unmarshal(toolCallsRaw, &s.ToolCalls)
		}
		if s.ToolCalls == nil {
			s.ToolCalls = []domain.ToolCallEntry{}
		}
		steps = append(steps, s)
	}
	if steps == nil {
		steps = []domain.TaskStep{}
	}
	return steps, rows.Err()
}
```

- [ ] **Step 2: Verify compiles**

```bash
cd apps/api && go build ./...
```

Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add apps/api/infra/postgres/task_step_repo.go
git commit -m "feat(infra): add postgres TaskStep repository"
```

---

## Task 4: Internal Handler — CreateTaskStep

**Files:**
- Modify: `apps/api/api/handler/internal.go`
- Modify: `apps/api/api/handler/internal_test.go`

- [ ] **Step 1: Write failing test first**

Add to `apps/api/api/handler/internal_test.go`:

```go
func internalRouterWithSteps(h *handler.InternalHandler) http.Handler {
	r := chi.NewRouter()
	r.Patch("/internal/tasks/{taskID}/status", h.UpdateTaskStatus)
	r.Post("/internal/tasks/{taskID}/steps", h.CreateTaskStep)
	return r
}

func TestInternalHandler_CreateTaskStep_Success(t *testing.T) {
	stepRepo := &mock.TaskStepRepo{
		CreateFn: func(_ context.Context, step domain.TaskStep) (domain.TaskStep, error) {
			step.ID = "step-1"
			step.CreatedAt = time.Now()
			return step, nil
		},
	}
	h := handler.NewInternalHandler(nil, nil, nil, nil, stepRepo)
	body, _ := json.Marshal(map[string]any{
		"seqNo":      0,
		"agent":      "schema",
		"summary":    "schema.prisma done (1 tool call)",
		"toolCalls":  []map[string]any{{"tool": "write_file", "input": map[string]string{"path": "schema.prisma"}}},
		"durationMs": 4200,
		"status":     "done",
	})
	req := httptest.NewRequest(http.MethodPost, "/internal/tasks/task-1/steps", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	internalRouterWithSteps(h).ServeHTTP(rec, req)
	if rec.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", rec.Code, rec.Body.String())
	}
}

func TestInternalHandler_CreateTaskStep_MissingAgent(t *testing.T) {
	h := handler.NewInternalHandler(nil, nil, nil, nil, &mock.TaskStepRepo{})
	body, _ := json.Marshal(map[string]any{"seqNo": 0, "summary": "ok"})
	req := httptest.NewRequest(http.MethodPost, "/internal/tasks/task-1/steps", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	rec := httptest.NewRecorder()
	internalRouterWithSteps(h).ServeHTTP(rec, req)
	if rec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400, got %d", rec.Code)
	}
}
```

- [ ] **Step 2: Run test — confirm it fails**

```bash
cd apps/api && go test ./api/handler/... -run TestInternalHandler_CreateTaskStep -v
```

Expected: compile error or test failure.

- [ ] **Step 3: Update InternalHandler to accept taskStepRepo**

In `apps/api/api/handler/internal.go`, add `taskStepRepo` field and update constructor:

```go
type InternalHandler struct {
	taskRepo     domain.TaskRepository
	agentRepo    domain.AgentRepository
	memoryRepo   domain.AgentMemoryRepository
	pkbRepo      domain.ProjectKBRepository
	taskStepRepo domain.TaskStepRepository
}

func NewInternalHandler(
	taskRepo     domain.TaskRepository,
	agentRepo    domain.AgentRepository,
	memoryRepo   domain.AgentMemoryRepository,
	pkbRepo      domain.ProjectKBRepository,
	taskStepRepo domain.TaskStepRepository,
) *InternalHandler {
	return &InternalHandler{
		taskRepo:     taskRepo,
		agentRepo:    agentRepo,
		memoryRepo:   memoryRepo,
		pkbRepo:      pkbRepo,
		taskStepRepo: taskStepRepo,
	}
}
```

Then add the handler method at the bottom of the file:

```go
// POST /internal/tasks/{taskID}/steps
func (h *InternalHandler) CreateTaskStep(w http.ResponseWriter, r *http.Request) {
	taskID := chi.URLParam(r, "taskID")

	var body struct {
		SeqNo      int                     `json:"seqNo"`
		Agent      string                  `json:"agent"`
		Summary    string                  `json:"summary"`
		ToolCalls  []domain.ToolCallEntry  `json:"toolCalls"`
		DurationMs int                     `json:"durationMs"`
		Status     string                  `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON")
		return
	}
	if body.Agent == "" {
		middleware.WriteFieldError(w, "agent", "agent is required")
		return
	}
	if body.Status == "" {
		body.Status = "done"
	}
	if body.ToolCalls == nil {
		body.ToolCalls = []domain.ToolCallEntry{}
	}

	step, err := h.taskStepRepo.Create(r.Context(), domain.TaskStep{
		TaskID:     taskID,
		SeqNo:      body.SeqNo,
		Agent:      body.Agent,
		Summary:    body.Summary,
		ToolCalls:  body.ToolCalls,
		DurationMs: body.DurationMs,
		Status:     body.Status,
	})
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	middleware.WriteJSON(w, http.StatusCreated, step)
}
```

- [ ] **Step 4: Fix the NewInternalHandler call in internal_test.go**

The existing test `TestInternalHandler_UpdateTaskStatus_Success` calls `handler.NewInternalHandler(taskRepo, nil, nil, nil)` — add the 5th nil arg:

```go
h := handler.NewInternalHandler(taskRepo, nil, nil, nil, nil)
```

Find and update all occurrences of `handler.NewInternalHandler(` in test files that pass 4 args.

- [ ] **Step 5: Run tests — confirm they pass**

```bash
cd apps/api && go test ./api/handler/... -run TestInternalHandler -v
```

Expected: all InternalHandler tests pass.

- [ ] **Step 6: Commit**

```bash
git add apps/api/api/handler/internal.go apps/api/api/handler/internal_test.go
git commit -m "feat(api): add CreateTaskStep internal handler"
```

---

## Task 5: Public Handler + Router + Main Wiring

**Files:**
- Create: `apps/api/api/handler/task_step.go`
- Create: `apps/api/api/handler/task_step_test.go`
- Modify: `apps/api/api/router.go`
- Modify: `apps/api/cmd/server/main.go`

- [ ] **Step 1: Write failing test**

Create `apps/api/api/handler/task_step_test.go`:

```go
package handler_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/forge-ai/forge/api/api/handler"
	"github.com/forge-ai/forge/api/api/middleware"
	"github.com/forge-ai/forge/api/domain"
	"github.com/forge-ai/forge/api/infra/mock"
)

func taskStepRouter(h *handler.TaskStepHandler) http.Handler {
	r := chi.NewRouter()
	r.Use(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			ctx := middleware.WithUserID(r.Context(), "user-1")
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	})
	r.Get("/projects/{projectID}/tasks/latest/steps", h.LatestSteps)
	return r
}

func TestTaskStepHandler_LatestSteps(t *testing.T) {
	taskRepo := &mock.TaskRepo{
		GetLatestByProjectIDFn: func(_ context.Context, projectID string) (domain.Task, error) {
			return domain.Task{ID: "task-1", ProjectID: projectID}, nil
		},
	}
	stepRepo := &mock.TaskStepRepo{
		ListByTaskIDFn: func(_ context.Context, taskID string) ([]domain.TaskStep, error) {
			return []domain.TaskStep{
				{
					ID:         "step-1",
					TaskID:     taskID,
					SeqNo:      0,
					Agent:      "pm",
					Summary:    `"App" — 5 features`,
					ToolCalls:  []domain.ToolCallEntry{},
					DurationMs: 9800,
					Status:     "done",
					CreatedAt:  time.Now(),
				},
			}, nil
		},
	}
	h := handler.NewTaskStepHandler(taskRepo, stepRepo)
	req := httptest.NewRequest(http.MethodGet, "/projects/proj-1/tasks/latest/steps", nil)
	rec := httptest.NewRecorder()
	taskStepRouter(h).ServeHTTP(rec, req)
	if rec.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", rec.Code, rec.Body.String())
	}
	var resp struct {
		Data []domain.TaskStep `json:"data"`
	}
	if err := json.NewDecoder(rec.Body).Decode(&resp); err != nil {
		t.Fatal(err)
	}
	if len(resp.Data) != 1 || resp.Data[0].Agent != "pm" {
		t.Fatalf("unexpected steps: %+v", resp.Data)
	}
}
```

- [ ] **Step 2: Run test — confirm it fails**

```bash
cd apps/api && go test ./api/handler/... -run TestTaskStepHandler -v
```

Expected: compile error (handler not defined yet).

- [ ] **Step 3: Confirm TaskRepository.GetLatestByProjectID signature**

```bash
grep -n "GetLatestByProjectID\|LatestByProjectID" apps/api/domain/task.go apps/api/infra/mock/task_repo.go
```

Use `GetLatestByProjectID(ctx, projectID string) (Task, error)` — this already exists in postgres repo. Ensure the mock has a `GetLatestByProjectIDFn` field (add if missing).

- [ ] **Step 4: Create TaskStepHandler**

Create `apps/api/api/handler/task_step.go`:

```go
package handler

import (
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/forge-ai/forge/api/api/middleware"
	"github.com/forge-ai/forge/api/domain"
)

type TaskStepHandler struct {
	taskRepo domain.TaskRepository
	stepRepo domain.TaskStepRepository
}

func NewTaskStepHandler(taskRepo domain.TaskRepository, stepRepo domain.TaskStepRepository) *TaskStepHandler {
	return &TaskStepHandler{taskRepo: taskRepo, stepRepo: stepRepo}
}

// GET /api/v1/projects/{projectID}/tasks/latest/steps
func (h *TaskStepHandler) LatestSteps(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	userID := middleware.UserIDFromContext(r.Context())

	task, err := h.taskRepo.GetLatestByProjectID(r.Context(), projectID)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}

	steps, err := h.stepRepo.ListByTaskID(r.Context(), task.ID)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}

	middleware.WriteJSONList(w, steps, len(steps), 1, len(steps)+1)
}
```

- [ ] **Step 5: Run test — confirm it passes**

```bash
cd apps/api && go test ./api/handler/... -run TestTaskStepHandler -v
```

Expected: PASS.

- [ ] **Step 6: Wire into router and main**

In `apps/api/api/router.go`, add `TaskStep *handler.TaskStepHandler` to `RouterDeps` and mount the route:

```go
// In RouterDeps struct:
TaskStep *handler.TaskStepHandler

// Inside the protected routes block, under the projects/tasks section:
// after: r.Get("/latest/events", deps.Task.LatestEvents)
if deps.TaskStep != nil {
    r.Get("/latest/steps", deps.TaskStep.LatestSteps)
}
```

In `apps/api/cmd/server/main.go`, create and wire the repo:

```go
taskStepRepo := postgres.NewTaskStepRepo(pool)

// Update NewInternalHandler call:
internalHandler := handler.NewInternalHandler(taskRepo, agentRepo, memoryRepo, pkbRepo, taskStepRepo)

// Add to router deps:
// TaskStep: handler.NewTaskStepHandler(taskRepo, taskStepRepo),
```

Also add `TaskStep: handler.NewTaskStepHandler(taskRepo, taskStepRepo)` to the `NewRouter(RouterDeps{...})` call.

- [ ] **Step 7: Build the full API**

```bash
cd apps/api && go build ./...
```

Expected: exit 0.

- [ ] **Step 8: Run all Go tests**

```bash
make test-go
```

Expected: all pass.

- [ ] **Step 9: Commit**

```bash
git add apps/api/api/handler/task_step.go apps/api/api/handler/task_step_test.go \
        apps/api/api/router.go apps/api/cmd/server/main.go
git commit -m "feat(api): add TaskStepHandler and route GET /tasks/latest/steps"
```

---

## Task 6: Agent Service — Per-Task Event Capture in Orchestrator

**Files:**
- Modify: `apps/agent/src/orchestrator/orchestrator.ts`

- [ ] **Step 1: Add CompletedStep type and onTaskComplete to OrchestratorDeps**

In `apps/agent/src/orchestrator/orchestrator.ts`, add after the existing imports:

```typescript
export interface CompletedStep {
  agent: string
  summary: string
  toolCalls: { tool: string; input: Record<string, unknown> }[]
  durationMs: number
  status: 'done' | 'failed'
}
```

Add `onTaskComplete` to `OrchestratorDeps`:

```typescript
export interface OrchestratorDeps {
  onStateChange: (state: OrchestratorState, ctx: OrchestratorContext) => Promise<void>
  onDraftReady: (draft: DraftSpec) => Promise<DraftSpec>
  onEvent: (event: ProgressEvent) => void
  onTaskComplete?: (step: CompletedStep) => void   // ← add this line
  sandbox: SandboxInterface
  maxRetries?: number
  agentOverrides?: Record<string, CustomAgentConfig>
  contextClient?: ProjectContextClient
  userID?: string
}
```

- [ ] **Step 2: Add buildStep helper method**

Add this private method to the `Orchestrator` class:

```typescript
private buildStep(
  agent: string,
  events: ProgressEvent[],
  durationMs: number,
  status: 'done' | 'failed',
  summaryOverride?: string,
): CompletedStep {
  const toolCalls = events
    .filter((e): e is Extract<ProgressEvent, { type: 'agent_tool_use' }> =>
      e.type === 'agent_tool_use',
    )
    .map((e) => ({
      tool: e.tool,
      input: (typeof e.input === 'object' && e.input !== null
        ? e.input
        : {}) as Record<string, unknown>,
    }))

  const fileWrite = events.find(
    (e): e is Extract<ProgressEvent, { type: 'agent_file_write' }> =>
      e.type === 'agent_file_write',
  )
  const n = toolCalls.length
  const summary =
    summaryOverride ??
    (fileWrite
      ? `${fileWrite.file} done (${n} tool call${n !== 1 ? 's' : ''})`
      : (events.find((e) => e.type === 'agent_start') as { message?: string } | undefined)
          ?.message ?? agent)

  return { agent, summary, toolCalls, durationMs, status }
}
```

- [ ] **Step 3: Modify generateTaskCode to capture per-task events**

Change the return type and body of `generateTaskCode`:

```typescript
private async generateTaskCode(
  task: PlanTask,
  errorContext?: string,
): Promise<{ code: string; events: ProgressEvent[]; durationMs: number }> {
  const agent = this.builders[task.agent]
  if (!agent) return { code: '', events: [], durationMs: 0 }

  const context = await this.readRelevantContext(task.agent)
  const existingContent =
    task.action === 'modify'
      ? await this.readSandboxFile(task.file).catch(() => undefined)
      : undefined

  const taskWithContext = errorContext
    ? { ...task, description: task.description + `\n\nFix context:\n${errorContext}` }
    : task

  const spawnFn: SpawnTaskFn = (params) => this.spawnTask(params)

  // Capture events for this specific task without breaking global event stream
  const taskEvents: ProgressEvent[] = []
  const taskEmit = (e: ProgressEvent) => {
    taskEvents.push(e)
    this.deps.onEvent(e)
  }

  const startedAt = Date.now()
  const code = await agent.executeTask(
    {
      task: taskWithContext,
      projectContext: context,
      existingFileContent: existingContent,
      userID: this.deps.userID,
      projectId: this.ctx.projectId,
    },
    taskEmit,
    this.deps.sandbox,
    spawnFn,
  )

  return { code, events: taskEvents, durationMs: Date.now() - startedAt }
}
```

- [ ] **Step 4: Update executeFixInstructions to use new return type and call onTaskComplete**

Find the section in `executeFixInstructions` where `generateTaskCode` results are processed:

```typescript
// Replace the existing Promise.all + for loop with:
const results = await Promise.all(
  tasks.map((task) => this.generateTaskCode(task, instruction.errorContext)),
)

try {
  for (let i = 0; i < tasks.length; i++) {
    const task = tasks[i]!
    const result = results[i]!
    try {
      await this.commitTask(task, result.code)
      task.status = 'done'
      this.emit({ type: 'task_status', taskId: task.id, status: 'done' })
      void this.extractKnowledge(task, result.code)
      this.deps.onTaskComplete?.(
        this.buildStep(task.agent, result.events, result.durationMs, 'done'),
      )
    } catch (err) {
      task.status = 'failed'
      this.emit({ type: 'task_status', taskId: task.id, status: 'failed' })
      this.deps.onTaskComplete?.(
        this.buildStep(task.agent, result.events, result.durationMs, 'failed'),
      )
      throw err
    }
  }
} finally {
  await this.writeSandboxFile(
    'contracts/task_plan.json',
    JSON.stringify(this.plan, null, 2),
  )
}
```

- [ ] **Step 5: Add onTaskComplete calls for PM, Architect, Test**

In `stepAnalyze`, add timing and call after `this.spec` is set:

```typescript
private async stepAnalyze(): Promise<void> {
  const pmStart = Date.now()
  const draft = await this.pm.draft(this.ctx.userInput, this.deps.onEvent)
  const pmDuration = Date.now() - pmStart
  // ... existing code unchanged ...
  const confirmedDraft = await this.deps.onDraftReady(draft)
  this.spec = this.pm.finalize(confirmedDraft)
  // NEW:
  this.deps.onTaskComplete?.({
    agent: 'pm',
    summary: `"${this.spec.title}" — ${this.spec.features.length} feature(s) in ${this.spec.business_domain}`,
    toolCalls: [],
    durationMs: pmDuration,
    status: 'done',
  })
  await this.writeSandboxFile('contracts/spec.json', JSON.stringify(this.spec, null, 2))
  await this.dispatch({ type: 'SPEC_READY' })
}
```

In `stepPlan`, add timing:

```typescript
private async stepPlan(): Promise<void> {
  this.emit({ type: 'agent_start', agent: 'architect', message: `Planning "${this.spec!.title}"...` })
  const archStart = Date.now()
  this.plan = await this.architect.plan(this.spec!, this.deps)
  const archDuration = Date.now() - archStart
  // ... existing emit + context code unchanged ...
  // NEW (add after context writes, before dispatch):
  const roles = [...new Set(this.plan.tasks.map((t) => t.agent))]
  this.deps.onTaskComplete?.({
    agent: 'architect',
    summary: `${this.plan.tasks.length} task(s) → ${roles.join(', ')}`,
    toolCalls: [],
    durationMs: archDuration,
    status: 'done',
  })
  await this.dispatch({ type: 'PLAN_READY' })
}
```

In `stepValidate`, add timing:

```typescript
private async stepValidate(): Promise<void> {
  this.emit({ type: 'agent_start', agent: 'test', message: 'Running validation...' })
  const testStart = Date.now()
  this.lastReport = await this.test.validate(this.spec!, this.deps.sandbox)
  const testDuration = Date.now() - testStart
  // ... existing sandbox write unchanged ...
  // NEW:
  this.deps.onTaskComplete?.({
    agent: 'test',
    summary: `validation ${this.lastReport.overall}`,
    toolCalls: [],
    durationMs: testDuration,
    status: this.lastReport.overall === 'passed' ? 'done' : 'failed',
  })
  if (this.lastReport.overall === 'passed') {
    this.ctx.previewUrl = this.deps.sandbox.getPreviewUrl(3000)
    await this.dispatch({ type: 'VALIDATION_PASSED' })
  } else {
    await this.dispatch({ type: 'VALIDATION_FAILED' })
  }
}
```

- [ ] **Step 6: Verify agent service builds**

```bash
pnpm --filter @forge/agent-service build 2>/dev/null || pnpm test:harness
```

Check for TypeScript errors in orchestrator.ts. Fix any type errors before proceeding.

- [ ] **Step 7: Run harness tests**

```bash
pnpm test:harness
```

Expected: all 26 tests pass (orchestrator changes don't touch harness code).

- [ ] **Step 8: Commit**

```bash
git add apps/agent/src/orchestrator/orchestrator.ts
git commit -m "feat(agent): capture per-task events and add onTaskComplete to OrchestratorDeps"
```

---

## Task 7: Agent Service — go-api-client + job-runner onTaskComplete

**Files:**
- Modify: `apps/agent/src/lib/go-api-client.ts`
- Modify: `apps/agent/src/job-runner.ts`

- [ ] **Step 1: Add writeTaskStep to go-api-client.ts**

Add to `apps/agent/src/lib/go-api-client.ts`:

```typescript
interface TaskStepPayload {
  taskId: string
  seqNo: number
  agent: string
  summary: string
  toolCalls: { tool: string; input: Record<string, unknown> }[]
  durationMs: number
  status: 'done' | 'failed'
}

export async function writeTaskStep(step: TaskStepPayload, retries = 3): Promise<void> {
  const apiUrl = process.env['FORGE_API_URL']
  if (!apiUrl) return

  const token = process.env['INTERNAL_TOKEN'] ?? ''
  const { taskId, ...body } = step

  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      const res = await fetch(`${apiUrl}/internal/tasks/${taskId}/steps`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'X-Internal-Token': token } : {}),
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(5000),
      })
      if (res.ok) return
      if (attempt === retries - 1) {
        console.error(`[writeTaskStep] HTTP ${res.status} after ${retries} attempts`)
      }
    } catch (err) {
      if (attempt === retries - 1) {
        console.error(`[writeTaskStep] failed after ${retries} attempts:`, err)
      } else {
        await new Promise((r) => setTimeout(r, 200 * (attempt + 1)))
      }
    }
  }
}
```

- [ ] **Step 2: Implement onTaskComplete in job-runner.ts**

In `apps/agent/src/job-runner.ts`, add the import at the top:

```typescript
import { notifyGoAPI, writeTaskStep } from './lib/go-api-client.js'
```

Inside `runJob`, add a step counter and the `onTaskComplete` callback to the `Orchestrator` constructor options:

```typescript
// Add before `const orc = new Orchestrator(...)`:
let stepSeq = 0

// In the Orchestrator options object, add:
onTaskComplete: (step) => {
  if (!job.taskId) return
  const seqNo = stepSeq++
  writeTaskStep({
    taskId: job.taskId,
    seqNo,
    agent: step.agent,
    summary: step.summary,
    toolCalls: step.toolCalls,
    durationMs: step.durationMs,
    status: step.status,
  }).catch((err: unknown) => {
    console.error('[onTaskComplete] step write failed:', err)
  })
},
```

- [ ] **Step 3: Verify agent service starts without errors**

```bash
# Kill existing agent and restart
lsof -ti :3001 | xargs kill -9 2>/dev/null; sleep 2
cd /Users/cookie/project/forge/apps/agent && npm run dev > /tmp/agent.log 2>&1 &
sleep 3 && curl -s http://localhost:3001/health
```

Expected: `{"status":"ok","service":"forge-agent","jobs":0}`

- [ ] **Step 4: Run a quick smoke test**

Trigger the `create-project` scenario and confirm no errors in agent logs:

```bash
pnpm exec tsx e2e/scenarios/run.ts create-project 2>&1 | tail -5
```

Expected: `Status: PASSED` (or at minimum no new errors).

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/lib/go-api-client.ts apps/agent/src/job-runner.ts
git commit -m "feat(agent): implement onTaskComplete with writeTaskStep + retry in job-runner"
```

---

## Task 8: Frontend — useTaskSteps Hook + AgentFlowPanel

**Files:**
- Create: `packages/core/task/use-task-steps.ts`
- Modify: `packages/core/index.ts`
- Modify: `apps/web/src/pages/workspace/components/AgentFlowPanel.tsx`

- [ ] **Step 1: Create useTaskSteps hook**

Create `packages/core/task/use-task-steps.ts`:

```typescript
import { useQuery } from '@tanstack/react-query'
import { api } from '../api/client.ts'

export interface TaskStep {
  id: string
  taskId: string
  seqNo: number
  agent: string
  summary: string
  toolCalls: { tool: string; input: { path?: string; [key: string]: unknown } }[]
  durationMs: number
  status: 'done' | 'failed'
  createdAt: string
}

export function useTaskSteps(projectId: string | null, enabled: boolean) {
  return useQuery<TaskStep[]>({
    queryKey: ['task-steps', projectId],
    queryFn: async () => {
      const res = await api.get<{ data: TaskStep[] }>(
        `/api/v1/projects/${projectId}/tasks/latest/steps`,
      )
      return res.data ?? []
    },
    enabled: !!projectId && enabled,
    staleTime: Infinity,
  })
}
```

- [ ] **Step 2: Export from core index**

In `packages/core/index.ts`, add the export:

```typescript
export { useTaskSteps, type TaskStep } from './task/use-task-steps.ts'
```

- [ ] **Step 3: Run core typecheck**

```bash
pnpm --filter @forge/core exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 4: Update AgentFlowPanel to show step data for completed tasks**

In `apps/web/src/pages/workspace/components/AgentFlowPanel.tsx`, add after existing imports:

```typescript
import { useTaskSteps, type TaskStep } from '@forge/core'
```

Inside `AgentFlowPanel`, add the hook call:

```typescript
const phase = useWorkspaceStore((s) => s.phase)
const projectId = useWorkspaceStore(selectProjectId)
const { data: steps = [] } = useTaskSteps(
  projectId,
  phase === 'done' || phase === 'error',
)
```

Create a helper to look up a step by agent role:

```typescript
const stepByAgent = (role: string): TaskStep | undefined =>
  steps.find((s) => s.agent === role)
```

Update the `AgentCard` render to pass step data when available. In the `.map()` over `agentCards`:

```typescript
{Object.values(agentCards).map((card, i) => (
  <AgentCard
    key={card.role}
    card={card}
    step={stepByAgent(card.role)}
    // ... existing props
  />
))}
```

- [ ] **Step 5: Update AgentCard to accept and display step prop**

In the `AgentCard` function definition, extend the props type and use step data when present:

```typescript
function AgentCard({
  card,
  step,
  // ... existing props
}: {
  card: AgentCardState
  step?: TaskStep
  // ... existing prop types
}) {
  // Use step.summary when available (completed task from DB)
  const displaySummary = step?.summary ?? card.currentAction
  const displayDuration = step ? `${(step.durationMs / 1000).toFixed(1)}s` : null

  // ... rest of component, replace card.currentAction with displaySummary where shown
}
```

- [ ] **Step 6: Run web typecheck**

```bash
pnpm --filter @forge/web exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/core/task/use-task-steps.ts packages/core/index.ts \
        apps/web/src/pages/workspace/components/AgentFlowPanel.tsx
git commit -m "feat(web): add useTaskSteps hook and display step history in AgentFlowPanel"
```

---

## Done

The feature is complete when:

1. `make db-migrate` → `task_steps` table exists
2. `make test-go` → all Go tests pass including handler tests
3. `pnpm test:harness` → 26 harness tests pass
4. A full build in the browser → `GET /api/v1/projects/:id/tasks/latest/steps` returns step records
5. Refresh after a completed task → AgentFlowPanel shows step summaries from DB (not blank)
