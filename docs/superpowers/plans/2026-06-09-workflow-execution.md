# Workflow Execution Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up the full workflow execution pipeline — natural language → AI-generated WorkflowDefinition → persisted run record → step-by-step execution → real-time frontend monitoring.

**Architecture:** Three layers work together: the Agent service gains a `/generate-workflow` endpoint and fires `notifyWorkflowRun` callbacks; the Go API adds a `workflow_runs` table with create/status/events endpoints; the frontend replaces the placeholder generate handler and adds a `/workflows/:id/run` monitoring page. All new Go code follows the existing handler→domain→infra/postgres pattern.

**Tech Stack:** Go (chi, pgx/v5), TypeScript/Node (tsx/esm), React + TanStack Query

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `apps/api/migrations/011_workflow_runs.sql` | Create | workflow_runs table |
| `apps/api/domain/workflow_run.go` | Create | Domain type + repository interface |
| `apps/api/infra/postgres/workflow_run_repo.go` | Create | Postgres implementation |
| `apps/api/api/handler/workflow_run.go` | Create | Public run endpoints (generate proxy + runs CRUD + events proxy) |
| `apps/api/api/handler/internal_workflow_run.go` | Create | Internal PATCH status callback |
| `apps/api/api/router.go` | Modify | Register 5 new routes |
| `apps/api/cmd/server/main.go` | Modify | Wire WorkflowRunHandler + InternalWorkflowRunHandler |
| `apps/agent/src/job-store.ts` | Modify | Add `jobType: 'workflow'` option |
| `apps/agent/src/lib/go-api-client.ts` | Modify | Add `notifyWorkflowRun()` |
| `apps/agent/src/job-runner.ts` | Modify | Call `notifyWorkflowRun` for workflow jobs |
| `apps/agent/src/server.ts` | Modify | Add `POST /generate-workflow` handler |
| `packages/core/workflow/use-workflow-runs.ts` | Create | useGenerateWorkflow, useRunWorkflow, useWorkflowRunEvents |
| `packages/core/workflow/index.ts` | Modify | Export new hooks |
| `packages/core/index.ts` | Modify | Re-export new hooks + WorkflowRun type |
| `packages/core/types/index.ts` | Modify | Add WorkflowRun type |
| `apps/web/src/pages/workflows/[id]/run.tsx` | Create | Run monitoring page |
| `apps/web/src/routes.tsx` | Modify | Add `/workflows/:id/run` route |
| `apps/web/src/pages/workflows/components/CreateWorkflowModal.tsx` | Modify | Wire real generate API |

---

## Task 1: DB Migration — `workflow_runs` table

**Files:**
- Create: `apps/api/migrations/011_workflow_runs.sql`

- [ ] **Step 1: Create migration file**

```sql
-- 011_workflow_runs.sql
CREATE TABLE IF NOT EXISTS workflow_runs (
    id           TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
    workflow_id  TEXT        NOT NULL REFERENCES workflows(id) ON DELETE CASCADE,
    user_id      TEXT        NOT NULL,
    status       TEXT        NOT NULL DEFAULT 'queued',
    error        TEXT        NOT NULL DEFAULT '',
    agent_job_id TEXT        NOT NULL DEFAULT '',
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    finished_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow_id ON workflow_runs(workflow_id);
CREATE INDEX IF NOT EXISTS idx_workflow_runs_user_id     ON workflow_runs(user_id);
```

- [ ] **Step 2: Apply migration**

```bash
cd apps/api
go run ./cmd/migrate
```

Expected: `migration 011_workflow_runs.sql applied` (or "already applied" if idempotent).

- [ ] **Step 3: Commit**

```bash
git add apps/api/migrations/011_workflow_runs.sql
git commit -m "feat(api): add workflow_runs migration"
```

---

## Task 2: Go API — Domain type + repository interface

**Files:**
- Create: `apps/api/domain/workflow_run.go`

- [ ] **Step 1: Create domain file**

```go
package domain

import (
	"context"
	"time"
)

type WorkflowRunStatus string

const (
	WorkflowRunStatusQueued  WorkflowRunStatus = "queued"
	WorkflowRunStatusRunning WorkflowRunStatus = "running"
	WorkflowRunStatusDone    WorkflowRunStatus = "done"
	WorkflowRunStatusFailed  WorkflowRunStatus = "failed"
)

type WorkflowRun struct {
	ID         string            `json:"id"`
	WorkflowID string            `json:"workflowId"`
	UserID     string            `json:"userId"`
	Status     WorkflowRunStatus `json:"status"`
	Error      string            `json:"error"`
	AgentJobID string            `json:"agentJobId"`
	CreatedAt  time.Time         `json:"createdAt"`
	FinishedAt *time.Time        `json:"finishedAt"`
}

type WorkflowRunRepository interface {
	Create(ctx context.Context, run WorkflowRun) (WorkflowRun, error)
	GetByID(ctx context.Context, id string) (WorkflowRun, error)
	UpdateStatus(ctx context.Context, id string, status WorkflowRunStatus, errMsg string, finishedAt *time.Time) error
	UpdateAgentJobID(ctx context.Context, id string, agentJobID string) error
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd apps/api && go build ./domain/...
```

Expected: no output (success).

- [ ] **Step 3: Commit**

```bash
git add apps/api/domain/workflow_run.go
git commit -m "feat(api): add WorkflowRun domain type and repository interface"
```

---

## Task 3: Go API — Postgres repository

**Files:**
- Create: `apps/api/infra/postgres/workflow_run_repo.go`

- [ ] **Step 1: Create repo file**

```go
package postgres

import (
	"context"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/forge-ai/forge/api/domain"
)

type workflowRunRepo struct {
	pool *pgxpool.Pool
}

func NewWorkflowRunRepo(pool *pgxpool.Pool) domain.WorkflowRunRepository {
	return &workflowRunRepo{pool: pool}
}

func (r *workflowRunRepo) Create(ctx context.Context, run domain.WorkflowRun) (domain.WorkflowRun, error) {
	const q = `
		INSERT INTO workflow_runs (workflow_id, user_id, status, error, agent_job_id)
		VALUES ($1, $2, $3, $4, $5)
		RETURNING id, workflow_id, user_id, status, error, agent_job_id, created_at, finished_at`
	row := r.pool.QueryRow(ctx, q,
		run.WorkflowID, run.UserID,
		string(run.Status), run.Error, run.AgentJobID)
	return scanWorkflowRun(row)
}

func (r *workflowRunRepo) GetByID(ctx context.Context, id string) (domain.WorkflowRun, error) {
	const q = `
		SELECT id, workflow_id, user_id, status, error, agent_job_id, created_at, finished_at
		FROM workflow_runs WHERE id = $1`
	row := r.pool.QueryRow(ctx, q, id)
	run, err := scanWorkflowRun(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.WorkflowRun{}, fmt.Errorf("workflowRunRepo.GetByID: %w", domain.ErrNotFound)
	}
	return run, err
}

func (r *workflowRunRepo) UpdateStatus(ctx context.Context, id string, status domain.WorkflowRunStatus, errMsg string, finishedAt *time.Time) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE workflow_runs SET status=$1, error=$2, finished_at=$3 WHERE id=$4`,
		string(status), errMsg, finishedAt, id)
	return err
}

func (r *workflowRunRepo) UpdateAgentJobID(ctx context.Context, id string, agentJobID string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE workflow_runs SET agent_job_id=$1 WHERE id=$2`,
		agentJobID, id)
	return err
}

func scanWorkflowRun(row interface{ Scan(dest ...any) error }) (domain.WorkflowRun, error) {
	var run domain.WorkflowRun
	var status string
	err := row.Scan(&run.ID, &run.WorkflowID, &run.UserID,
		&status, &run.Error, &run.AgentJobID,
		&run.CreatedAt, &run.FinishedAt)
	if err != nil {
		return domain.WorkflowRun{}, err
	}
	run.Status = domain.WorkflowRunStatus(status)
	return run, nil
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd apps/api && go build ./infra/postgres/...
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/api/infra/postgres/workflow_run_repo.go
git commit -m "feat(api): add WorkflowRun postgres repository"
```

---

## Task 4: Go API — Internal handler (agent callback)

**Files:**
- Create: `apps/api/api/handler/internal_workflow_run.go`

- [ ] **Step 1: Create handler file**

```go
package handler

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/forge-ai/forge/api/api/middleware"
	"github.com/forge-ai/forge/api/domain"
)

// InternalWorkflowRunHandler handles /internal/workflow-runs/* routes.
// Called by the Agent service when a workflow job reaches a terminal state.
type InternalWorkflowRunHandler struct {
	repo domain.WorkflowRunRepository
}

func NewInternalWorkflowRunHandler(repo domain.WorkflowRunRepository) *InternalWorkflowRunHandler {
	return &InternalWorkflowRunHandler{repo: repo}
}

// PATCH /internal/workflow-runs/{runID}/status
func (h *InternalWorkflowRunHandler) UpdateStatus(w http.ResponseWriter, r *http.Request) {
	runID := chi.URLParam(r, "runID")
	if runID == "" {
		middleware.WriteFieldError(w, "runID", "runID is required")
		return
	}

	var body struct {
		Status   string `json:"status"`
		ErrorMsg string `json:"errorMsg"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON")
		return
	}

	// Normalise "aborted" → "failed" (agent uses "aborted" for failures)
	if body.Status == "aborted" {
		body.Status = string(domain.WorkflowRunStatusFailed)
	}

	status := domain.WorkflowRunStatus(body.Status)
	var finishedAt *time.Time
	if status == domain.WorkflowRunStatusDone || status == domain.WorkflowRunStatusFailed {
		now := time.Now()
		finishedAt = &now
	}

	if err := h.repo.UpdateStatus(r.Context(), runID, status, body.ErrorMsg, finishedAt); err != nil {
		middleware.WriteError(w, err)
		return
	}

	w.WriteHeader(http.StatusNoContent)
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd apps/api && go build ./api/handler/...
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/api/api/handler/internal_workflow_run.go
git commit -m "feat(api): add InternalWorkflowRunHandler for agent status callbacks"
```

---

## Task 5: Go API — Public WorkflowRun handler

**Files:**
- Create: `apps/api/api/handler/workflow_run.go`

- [ ] **Step 1: Create handler file**

```go
package handler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"

	"github.com/forge-ai/forge/api/api/middleware"
	"github.com/forge-ai/forge/api/domain"
)

// WorkflowRunHandler handles workflow generation and execution routes.
type WorkflowRunHandler struct {
	workflowRepo    domain.WorkflowRepository
	workflowRunRepo domain.WorkflowRunRepository
	agentURL        string
}

func NewWorkflowRunHandler(
	workflowRepo domain.WorkflowRepository,
	workflowRunRepo domain.WorkflowRunRepository,
	agentURL string,
) *WorkflowRunHandler {
	return &WorkflowRunHandler{
		workflowRepo:    workflowRepo,
		workflowRunRepo: workflowRunRepo,
		agentURL:        agentURL,
	}
}

// POST /api/v1/workflows/generate
// Proxies to Agent /generate-workflow; returns WorkflowDefinition for preview.
func (h *WorkflowRunHandler) Generate(w http.ResponseWriter, r *http.Request) {
	var body struct {
		UserInput      string   `json:"userInput"`
		Clarifications []string `json:"clarifications"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON")
		return
	}
	if body.UserInput == "" {
		middleware.WriteFieldError(w, "userInput", "userInput is required")
		return
	}

	payload, _ := json.Marshal(map[string]any{
		"userInput":      body.UserInput,
		"clarifications": body.Clarifications,
	})
	ctx, cancel := context.WithTimeout(r.Context(), 60*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		h.agentURL+"/generate-workflow", bytes.NewReader(payload))
	if err != nil {
		middleware.WriteError(w, fmt.Errorf("build request: %w", err))
		return
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := agentHTTPClient.Do(req)
	if err != nil {
		middleware.WriteError(w, fmt.Errorf("agent unavailable: %w", err))
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		middleware.WriteError(w, fmt.Errorf("agent returned %d", resp.StatusCode))
		return
	}

	// Pass through the agent response body as-is inside { "data": ... }
	var agentBody struct {
		Definition domain.WorkflowDefinition `json:"definition"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&agentBody); err != nil {
		middleware.WriteError(w, fmt.Errorf("decode agent response: %w", err))
		return
	}
	middleware.WriteJSON(w, http.StatusOK, agentBody.Definition)
}

// POST /api/v1/workflows/{workflowID}/runs
// Creates a WorkflowRun and dispatches execution to the Agent.
func (h *WorkflowRunHandler) CreateRun(w http.ResponseWriter, r *http.Request) {
	workflowID := chi.URLParam(r, "workflowID")
	userID := middleware.UserIDFromContext(r.Context())

	wf, err := h.workflowRepo.GetByID(r.Context(), workflowID)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if wf.UserID != userID {
		middleware.WriteError(w, domain.ErrForbidden)
		return
	}

	run, err := h.workflowRunRepo.Create(r.Context(), domain.WorkflowRun{
		WorkflowID: workflowID,
		UserID:     userID,
		Status:     domain.WorkflowRunStatusQueued,
	})
	if err != nil {
		middleware.WriteError(w, err)
		return
	}

	// Dispatch to agent asynchronously; update run status if dispatch fails.
	go h.dispatchRun(run, wf)

	middleware.WriteJSON(w, http.StatusAccepted, map[string]string{
		"runId":  run.ID,
		"status": string(run.Status),
	})
}

func (h *WorkflowRunHandler) dispatchRun(run domain.WorkflowRun, wf domain.Workflow) {
	defJSON, _ := json.Marshal(wf.Definition)
	payload, _ := json.Marshal(map[string]any{
		"taskId":             run.ID,
		"projectId":          wf.UserID,
		"workflowDefinition": json.RawMessage(defJSON),
		"jobType":            "workflow",
	})

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		h.agentURL+"/run-workflow", bytes.NewReader(payload))
	if err != nil {
		h.markFailed(run.ID, "failed to build agent request")
		return
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := agentHTTPClient.Do(req)
	if err != nil || resp == nil {
		h.markFailed(run.ID, "agent unreachable")
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusAccepted {
		h.markFailed(run.ID, fmt.Sprintf("agent returned %d", resp.StatusCode))
		return
	}

	// Read jobId from agent response and store it for event proxying.
	var agentResp struct {
		Data struct {
			JobID string `json:"jobId"`
		} `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&agentResp); err == nil && agentResp.Data.JobID != "" {
		_ = h.workflowRunRepo.UpdateAgentJobID(context.Background(), run.ID, agentResp.Data.JobID)
	}
}

func (h *WorkflowRunHandler) markFailed(runID, errMsg string) {
	now := time.Now()
	_ = h.workflowRunRepo.UpdateStatus(context.Background(), runID,
		domain.WorkflowRunStatusFailed, errMsg, &now)
}

// GET /api/v1/workflow-runs/{runID}
func (h *WorkflowRunHandler) GetRun(w http.ResponseWriter, r *http.Request) {
	runID := chi.URLParam(r, "runID")
	userID := middleware.UserIDFromContext(r.Context())

	run, err := h.workflowRunRepo.GetByID(r.Context(), runID)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if run.UserID != userID {
		middleware.WriteError(w, domain.ErrForbidden)
		return
	}
	middleware.WriteJSON(w, http.StatusOK, run)
}

// GET /api/v1/workflow-runs/{runID}/events
// Proxies Agent /status/:jobId while run is active; falls back to DB on eviction.
func (h *WorkflowRunHandler) GetRunEvents(w http.ResponseWriter, r *http.Request) {
	runID := chi.URLParam(r, "runID")
	userID := middleware.UserIDFromContext(r.Context())

	run, err := h.workflowRunRepo.GetByID(r.Context(), runID)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if run.UserID != userID {
		middleware.WriteError(w, domain.ErrForbidden)
		return
	}

	// If we don't have an agentJobId yet, return current status with empty events.
	if run.AgentJobID == "" {
		middleware.WriteJSON(w, http.StatusOK, map[string]any{
			"status": string(run.Status),
			"events": []any{},
		})
		return
	}

	// Proxy to agent /status/:jobId
	ctx, cancel := context.WithTimeout(r.Context(), 5*time.Second)
	defer cancel()

	agentReq, err := http.NewRequestWithContext(ctx, http.MethodGet,
		h.agentURL+"/status/"+run.AgentJobID, nil)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	agentResp, err := agentHTTPClient.Do(agentReq)
	if err != nil || agentResp.StatusCode == http.StatusNotFound {
		// Agent job evicted — fall back to DB status, empty events.
		middleware.WriteJSON(w, http.StatusOK, map[string]any{
			"status": string(run.Status),
			"events": []any{},
		})
		return
	}
	defer agentResp.Body.Close()

	body, _ := io.ReadAll(agentResp.Body)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	_, _ = w.Write(body)
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd apps/api && go build ./api/handler/...
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add apps/api/api/handler/workflow_run.go
git commit -m "feat(api): add WorkflowRunHandler (generate proxy + run CRUD + events proxy)"
```

---

## Task 6: Go API — Router + main.go wiring

**Files:**
- Modify: `apps/api/api/router.go`
- Modify: `apps/api/cmd/server/main.go`

- [ ] **Step 1: Update RouterDeps struct in `router.go`**

Find the `RouterDeps` struct and add the new handler:

```go
// In RouterDeps struct, after `Workflow *handler.WorkflowHandler`:
WorkflowRun         *handler.WorkflowRunHandler
InternalWorkflowRun *handler.InternalWorkflowRunHandler
```

- [ ] **Step 2: Add routes to `router.go`**

Inside the `/api/v1` authenticated block, after the existing `/workflows` route group, add:

```go
// Workflow generation (no :id scope — called before save)
if deps.WorkflowRun != nil {
    r.Post("/workflows/generate", deps.WorkflowRun.Generate)

    // Run a specific saved workflow
    r.Post("/workflows/{workflowID}/runs", deps.WorkflowRun.CreateRun)

    // Workflow run status and events
    r.Get("/workflow-runs/{runID}", deps.WorkflowRun.GetRun)
    r.Get("/workflow-runs/{runID}/events", deps.WorkflowRun.GetRunEvents)
}
```

> **Important:** The `r.Post("/workflows/generate", ...)` route MUST be registered BEFORE the existing `r.Route("/workflows", ...)` chi group, or chi will route it into the `/{workflowID}` pattern. Alternatively, place it outside the `r.Route("/workflows", ...)` block as shown above.

- [ ] **Step 3: Add internal route in `router.go`**

Inside the `/internal` block, after existing internal routes, add:

```go
if deps.InternalWorkflowRun != nil {
    r.Patch("/workflow-runs/{runID}/status", deps.InternalWorkflowRun.UpdateStatus)
}
```

- [ ] **Step 4: Wire in `main.go`**

In `main()`, after `workflowRepo := postgres.NewWorkflowRepo(pool)`, add:

```go
workflowRunRepo := postgres.NewWorkflowRunRepo(pool)
```

After `workflowHandler := handler.NewWorkflowHandler(workflowRepo)`, add:

```go
workflowRunHandler := handler.NewWorkflowRunHandler(workflowRepo, workflowRunRepo, cfg.AgentServiceURL)
internalWorkflowRunHandler := handler.NewInternalWorkflowRunHandler(workflowRunRepo)
```

In the `apiPkg.NewRouter(apiPkg.RouterDeps{...})` call, add:

```go
WorkflowRun:         workflowRunHandler,
InternalWorkflowRun: internalWorkflowRunHandler,
```

- [ ] **Step 5: Build**

```bash
cd apps/api && go build ./...
```

Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add apps/api/api/router.go apps/api/cmd/server/main.go
git commit -m "feat(api): register workflow run routes and wire dependencies"
```

---

## Task 7: Agent — `jobType` field + `notifyWorkflowRun` + `/generate-workflow` endpoint

**Files:**
- Modify: `apps/agent/src/job-store.ts`
- Modify: `apps/agent/src/lib/go-api-client.ts`
- Modify: `apps/agent/src/job-runner.ts`
- Modify: `apps/agent/src/server.ts`

- [ ] **Step 1: Add `'workflow'` to `jobType` in `job-store.ts`**

Find the `Job` interface line:
```ts
jobType?: 'build' | 'kb_ingest'
```
Change to:
```ts
jobType?: 'build' | 'kb_ingest' | 'workflow'
```

- [ ] **Step 2: Add `notifyWorkflowRun` to `go-api-client.ts`**

Append after the existing `notifyGoAPI` function:

```typescript
export async function notifyWorkflowRun(
  runId: string,
  status: string,
  errMsg?: string,
): Promise<void> {
  const apiUrl = process.env['FORGE_API_URL']
  if (!apiUrl) return

  const token = process.env['INTERNAL_TOKEN'] ?? ''
  const body = JSON.stringify({ status, errorMsg: errMsg ?? '' })

  try {
    const res = await fetch(`${apiUrl}/internal/workflow-runs/${runId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Token': token,
      },
      body,
      signal: AbortSignal.timeout(5_000),
    })
    if (!res.ok) {
      console.error(`[notifyWorkflowRun] HTTP ${res.status} for run ${runId}`)
    }
  } catch (err) {
    console.error(`[notifyWorkflowRun] failed for run ${runId}:`, err)
  }
}
```

- [ ] **Step 3: Update `runWorkflowJob` in `job-runner.ts` to use `notifyWorkflowRun`**

At the top of `job-runner.ts`, the existing imports already include `notifyGoAPI`. Add `notifyWorkflowRun` to the same import line:

```typescript
import { notifyGoAPI, writeTaskStep, notifyWorkflowRun } from './lib/go-api-client.js'
```

Inside `runWorkflowJob`, find the two places where `notifyGoAPI` is called and replace them:

```typescript
// On step failure — replace:
//   await notifyGoAPI(job.taskId, 'aborted', { errorMsg: result.error })
// With:
if (job.taskId) {
  await notifyWorkflowRun(job.taskId, 'aborted', result.error)
}

// On success — replace:
//   await notifyGoAPI(job.taskId, 'done', {})
// With:
if (job.taskId) {
  await notifyWorkflowRun(job.taskId, 'done')
}
```

- [ ] **Step 4: Add `POST /generate-workflow` to `server.ts`**

Find the comment `// ── Route: POST /run-workflow ─────────────────────────────────────` and insert the new handler BEFORE it:

```typescript
// ── Route: POST /generate-workflow ───────────────────────────────

async function handleGenerateWorkflow(req: IncomingMessage, res: ServerResponse): Promise<void> {
  let body: unknown
  try { body = await readBody(req) } catch {
    return sendError(res, 400, 'invalid JSON body')
  }

  const { userInput, clarifications } = body as Record<string, unknown>
  if (typeof userInput !== 'string' || !userInput.trim()) {
    return sendError(res, 400, 'userInput is required')
  }

  try {
    const { generateWorkflowDefinition } = await import('./agents/pm-agent.js')
    const definition = await generateWorkflowDefinition(
      userInput,
      Array.isArray(clarifications) ? (clarifications as string[]) : [],
    )
    send(res, 200, { definition })
  } catch (err) {
    console.error('[generate-workflow] error:', err)
    sendError(res, 500, err instanceof Error ? err.message : 'generation failed')
  }
}
```

In the router dispatch block (the `createServer` callback), add the route after the `/health` check:

```typescript
if (method === 'POST' && url === '/generate-workflow') {
  return void handleGenerateWorkflow(req, res)
}
```

- [ ] **Step 5: Type-check**

```bash
cd apps/agent && node_modules/.bin/tsc --noEmit 2>&1 | grep -E "(go-api-client|job-runner|job-store|server)" | grep -v "\.test\."
```

Expected: no output from these files (pre-existing errors in test/builder files are OK).

- [ ] **Step 6: Commit**

```bash
git add apps/agent/src/job-store.ts \
        apps/agent/src/lib/go-api-client.ts \
        apps/agent/src/job-runner.ts \
        apps/agent/src/server.ts
git commit -m "feat(agent): add /generate-workflow endpoint + notifyWorkflowRun callback"
```

---

## Task 8: Core package — hooks

**Files:**
- Create: `packages/core/workflow/use-workflow-runs.ts`
- Modify: `packages/core/workflow/index.ts`
- Modify: `packages/core/types/index.ts`
- Modify: `packages/core/index.ts`

- [ ] **Step 1: Add `WorkflowRun` type to `packages/core/types/index.ts`**

After the `Workflow` interface block, add:

```typescript
export type WorkflowRunStatus = 'queued' | 'running' | 'done' | 'failed'

export interface WorkflowRun {
  id:         string
  workflowId: string
  userId:     string
  status:     WorkflowRunStatus
  error:      string
  agentJobId: string
  createdAt:  string
  finishedAt: string | null
}

export interface WorkflowRunEvents {
  status: WorkflowRunStatus
  events: Array<{ type: string; agent: string; content: string }>
}
```

- [ ] **Step 2: Create `packages/core/workflow/use-workflow-runs.ts`**

```typescript
import { useMutation, useQuery } from '@tanstack/react-query'
import { api } from '../api/client.ts'
import { useAuthStore, selectToken } from '../auth/auth-store.ts'
import type { WorkflowDefinition, WorkflowRun, WorkflowRunEvents, WorkflowRunStatus } from '../types/index.ts'

const TERMINAL: WorkflowRunStatus[] = ['done', 'failed']

export function useGenerateWorkflow() {
  const token = useAuthStore(selectToken)
  return useMutation({
    mutationFn: async (input: { userInput: string; clarifications?: string[] }) => {
      const res = await api.post<WorkflowDefinition>('/api/v1/workflows/generate', {
        userInput:      input.userInput,
        clarifications: input.clarifications ?? [],
      }, token ?? undefined)
      return res.data!
    },
  })
}

export function useRunWorkflow(workflowId: string) {
  const token = useAuthStore(selectToken)
  return useMutation({
    mutationFn: async () => {
      const res = await api.post<{ runId: string; status: WorkflowRunStatus }>(
        `/api/v1/workflows/${workflowId}/runs`,
        {},
        token ?? undefined,
      )
      return res.data!
    },
  })
}

export function useWorkflowRunEvents(runId: string | null) {
  const token = useAuthStore(selectToken)
  return useQuery<WorkflowRunEvents>({
    queryKey:       ['workflow-run-events', runId],
    queryFn:        async () => {
      const res = await api.get<WorkflowRunEvents>(
        `/api/v1/workflow-runs/${runId}/events`,
        token ?? undefined,
      )
      return res.data ?? { status: 'queued', events: [] }
    },
    enabled:        !!runId && !!token,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      return status && TERMINAL.includes(status) ? false : 500
    },
  })
}

export function useWorkflowRun(runId: string | null) {
  const token = useAuthStore(selectToken)
  return useQuery<WorkflowRun>({
    queryKey: ['workflow-run', runId],
    queryFn:  async () => {
      const res = await api.get<WorkflowRun>(
        `/api/v1/workflow-runs/${runId}`,
        token ?? undefined,
      )
      return res.data!
    },
    enabled: !!runId && !!token,
  })
}
```

- [ ] **Step 3: Update `packages/core/workflow/index.ts`**

Add to the existing exports:

```typescript
export { useGenerateWorkflow, useRunWorkflow, useWorkflowRunEvents, useWorkflowRun } from './use-workflow-runs.ts'
```

- [ ] **Step 4: Update `packages/core/index.ts`**

After the line `export { useWorkflows, useCreateWorkflow, useDeleteWorkflow } from './workflow/index.ts'`, add:

```typescript
export { useGenerateWorkflow, useRunWorkflow, useWorkflowRunEvents, useWorkflowRun } from './workflow/index.ts'
```

After the `WorkflowDefinition,` export line, add:

```typescript
  WorkflowRun,
  WorkflowRunStatus,
  WorkflowRunEvents,
```

- [ ] **Step 5: Type-check core**

```bash
cd packages/core && npx tsc --noEmit 2>&1 | head -20
```

Expected: no errors (or only pre-existing ones).

- [ ] **Step 6: Commit**

```bash
git add packages/core/workflow/use-workflow-runs.ts \
        packages/core/workflow/index.ts \
        packages/core/types/index.ts \
        packages/core/index.ts
git commit -m "feat(core): add useGenerateWorkflow, useRunWorkflow, useWorkflowRunEvents hooks"
```

---

## Task 9: Frontend — Wire `CreateWorkflowModal`

**Files:**
- Modify: `apps/web/src/pages/workflows/components/CreateWorkflowModal.tsx`

- [ ] **Step 1: Replace placeholder generate with real API call**

Replace the entire file content with:

```typescript
import { useState } from 'react'
import { useCreateWorkflow, useGenerateWorkflow } from '@forge/core'
import type { WorkflowDefinition } from '@forge/core'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'

interface Props { onClose: () => void }

export function CreateWorkflowModal({ onClose }: Props) {
  const [step, setStep] = useState<'describe' | 'generating' | 'confirm' | 'error'>('describe')
  const [input, setInput] = useState('')
  const [generatedDef, setGeneratedDef] = useState<WorkflowDefinition | null>(null)
  const [errorMsg, setErrorMsg] = useState('')

  const { mutateAsync: generate, isPending: isGenerating } = useGenerateWorkflow()
  const { mutate: create, isPending: isSaving } = useCreateWorkflow()

  const handleGenerate = async () => {
    setStep('generating')
    try {
      const definition = await generate({ userInput: input })
      setGeneratedDef(definition)
      setStep('confirm')
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : 'AI 生成失败，请重试')
      setStep('error')
    }
  }

  const handleConfirm = () => {
    if (!generatedDef) return
    create(
      { name: input.slice(0, 40), description: input, definition: generatedDef },
      { onSuccess: onClose },
    )
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-background p-6 shadow-xl">
        <h2 className="text-base font-semibold mb-4">新建工作流</h2>

        {step === 'describe' && (
          <>
            <p className="text-sm text-muted-foreground mb-3">
              描述你想自动化的工作流程，AI 会帮你生成执行步骤
            </p>
            <Input
              placeholder="例如：每天从邮件提取发票信息，核对金额后发送通知"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && input.trim() && handleGenerate()}
              className="mb-4"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={onClose}>取消</Button>
              <Button onClick={handleGenerate} disabled={!input.trim() || isGenerating}>
                生成流程
              </Button>
            </div>
          </>
        )}

        {step === 'generating' && (
          <div className="flex items-center gap-3 py-8 justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
            <span className="text-sm text-muted-foreground">AI 正在生成工作流...</span>
          </div>
        )}

        {step === 'error' && (
          <>
            <p className="text-sm text-destructive mb-4">{errorMsg}</p>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={onClose}>取消</Button>
              <Button onClick={() => setStep('describe')}>重新描述</Button>
            </div>
          </>
        )}

        {step === 'confirm' && generatedDef && (
          <>
            <p className="text-sm text-muted-foreground mb-3">生成的流程步骤：</p>
            <div className="flex flex-col gap-2 mb-4 max-h-64 overflow-y-auto">
              {generatedDef.steps.map((s, i) => (
                <div key={s.id} className="flex items-start gap-3 rounded-lg border border-border/40 p-3">
                  <span className="text-xs text-muted-foreground mt-0.5">{i + 1}</span>
                  <div>
                    <p className="text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {s.capability} · {s.instructions.slice(0, 80)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setStep('describe')}>重新生成</Button>
              <Button onClick={handleConfirm} disabled={isSaving}>
                {isSaving ? '保存中...' : '确认创建'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Commit**

```bash
git add apps/web/src/pages/workflows/components/CreateWorkflowModal.tsx
git commit -m "feat(web): wire CreateWorkflowModal to real AI generate endpoint"
```

---

## Task 10: Frontend — Run monitoring page

**Files:**
- Create: `apps/web/src/pages/workflows/[id]/run.tsx`
- Modify: `apps/web/src/routes.tsx`

- [ ] **Step 1: Create the run page**

Create directory and file:

```bash
mkdir -p apps/web/src/pages/workflows/\[id\]
```

File: `apps/web/src/pages/workflows/[id]/run.tsx`

```typescript
import { useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { useWorkflows, useRunWorkflow, useWorkflowRunEvents } from '@forge/core'
import type { WorkflowRunStatus } from '@forge/core'
import { Button } from '../../../components/ui/button'
import { Icons } from '../../../components/ui/icons'

const CAPABILITY_LABEL: Record<string, string> = {
  browser: '浏览器',
  http: 'HTTP',
  llm: 'AI 分析',
  notify: '通知',
  code: '代码生成',
  file: '文件',
}

type RunState = 'idle' | 'running' | 'done' | 'failed'

function statusToRunState(s: WorkflowRunStatus | undefined): RunState {
  if (!s || s === 'queued') return 'running'
  if (s === 'running') return 'running'
  if (s === 'done') return 'done'
  return 'failed'
}

export function WorkflowRunPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()

  const { data: workflows } = useWorkflows()
  const workflow = workflows?.find(w => w.id === id)

  const [runId, setRunId] = useState<string | null>(null)
  const { mutate: startRun, isPending: isStarting } = useRunWorkflow(id ?? '')
  const { data: runEvents } = useWorkflowRunEvents(runId)

  const runState: RunState = runId
    ? statusToRunState(runEvents?.status)
    : 'idle'

  const stepEvents = runEvents?.events ?? []

  // Determine per-step status from events
  const stepStatuses: Record<string, 'pending' | 'running' | 'done' | 'failed'> = {}
  if (workflow) {
    for (const s of workflow.definition.steps) stepStatuses[s.id] = 'pending'
  }
  for (const ev of stepEvents) {
    if (ev.type === 'agent_start')   stepStatuses[ev.agent] = 'running'
    if (ev.type === 'agent_done')    stepStatuses[ev.agent] = 'done'
    if (ev.type === 'agent_error')   stepStatuses[ev.agent] = 'failed'
  }

  const handleStart = () => {
    startRun(undefined, {
      onSuccess: ({ runId }) => setRunId(runId),
    })
  }

  if (!workflow) {
    return (
      <div className="p-8 text-muted-foreground text-sm">
        加载中...
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-6 p-8 max-w-2xl mx-auto">
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

      {/* Step preview */}
      <div className="flex flex-col gap-2">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">工作流步骤</p>
        {workflow.definition.steps.map((s, i) => {
          const st = stepStatuses[s.id] ?? 'pending'
          return (
            <div
              key={s.id}
              className={`flex items-center gap-3 rounded-lg border p-3 transition-colors ${
                st === 'running' ? 'border-primary/40 bg-primary/5' :
                st === 'done'    ? 'border-green-500/30 bg-green-500/5' :
                st === 'failed'  ? 'border-destructive/30 bg-destructive/5' :
                'border-border/40'
              }`}
            >
              <span className="text-xs text-muted-foreground w-4 shrink-0">{i + 1}</span>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium truncate">{s.name}</p>
                <p className="text-xs text-muted-foreground">
                  {CAPABILITY_LABEL[s.capability] ?? s.capability}
                </p>
              </div>
              <span className="shrink-0">
                {st === 'running' && (
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
                )}
                {st === 'done' && <Icons.CheckCircle className="h-4 w-4 text-green-500" />}
                {st === 'failed' && <Icons.XCircle className="h-4 w-4 text-destructive" />}
              </span>
            </div>
          )
        })}
      </div>

      {/* Action button */}
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

      {/* Result banner */}
      {runState === 'done' && (
        <div className="rounded-lg border border-green-500/30 bg-green-500/5 px-4 py-3 text-sm text-green-400">
          工作流执行完成
        </div>
      )}
      {runState === 'failed' && (
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 px-4 py-3 text-sm text-destructive">
          执行失败：{runEvents?.events?.findLast(e => e.type === 'agent_error')?.content ?? '未知错误'}
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
  )
}
```

- [ ] **Step 2: Register route in `routes.tsx`**

Find the `WorkflowsPage` lazy import and add:

```typescript
const WorkflowRunPage = lazy(() =>
  import('./pages/workflows/[id]/run').then(m => ({ default: m.WorkflowRunPage }))
)
```

In the routes JSX, inside the `<Route path="/workflows" element={<WorkflowsPage />} />` section, add (as a sibling Route, not nested):

```tsx
<Route path="/workflows/:id/run" element={<WorkflowRunPage />} />
```

- [ ] **Step 3: Verify `Icons` used in run page exist**

```bash
grep -n "CheckCircle\|XCircle\|ChevronLeft\|Play" apps/web/src/components/ui/icons.tsx | head -10
```

If any are missing, add them to the icons file. Example for `CheckCircle` (using lucide-react pattern):

```typescript
export { CheckCircle, XCircle, ChevronLeft, Play } from 'lucide-react'
```

Or check the actual icons.tsx and use whatever names are there (e.g. `Icons.Check` instead of `Icons.CheckCircle`).

- [ ] **Step 4: Check TypeScript**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | head -20
```

Expected: no new errors introduced by our files.

- [ ] **Step 5: Commit**

```bash
git add "apps/web/src/pages/workflows/[id]/run.tsx" \
        apps/web/src/routes.tsx
git commit -m "feat(web): add workflow run monitoring page at /workflows/:id/run"
```

---

## Task 11: End-to-End smoke test

- [ ] **Step 1: Start all services**

```bash
# Terminal 1 — Go API
cd apps/api && go run ./cmd/server

# Terminal 2 — Agent
cd apps/agent && node --env-file=.env --import tsx/esm src/index.ts

# Terminal 3 — Web
cd apps/web && npm run dev
```

- [ ] **Step 2: Test generate endpoint directly**

```bash
curl -s -X POST http://localhost:3001/generate-workflow \
  -H "Content-Type: application/json" \
  -d '{"userInput":"分析一段文字并输出摘要","clarifications":[]}' | python3 -m json.tool
```

Expected: JSON with `{ "definition": { "steps": [...] } }` where steps have capability types.

- [ ] **Step 3: Test via Go API (requires auth token)**

```bash
TOKEN="<paste JWT from browser dev tools after login>"

curl -s -X POST http://localhost:8080/api/v1/workflows/generate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"userInput":"每天汇总今日新闻"}' | python3 -m json.tool
```

Expected: `{ "data": { "steps": [...] } }`

- [ ] **Step 4: Create a workflow via UI**

1. Open `http://localhost:5173/workflows`
2. Click "新建工作流"
3. Type: `每天汇总今日新闻并发送通知`
4. Click "生成流程" — should show real steps (not the placeholder 1-step mock)
5. Click "确认创建"
6. Workflow card should appear in the list

- [ ] **Step 5: Run workflow via UI**

1. Click "运行" on the new workflow card
2. Verify you land on `/workflows/:id/run`
3. Verify the step list is shown with the correct steps
4. Click "开始执行"
5. Watch step cards update: pending → running → done (or failed)
6. Verify the event log appears below

- [ ] **Step 6: Verify DB state**

```bash
# Connect to postgres and check run record
psql $DATABASE_URL -c "SELECT id, status, agent_job_id, finished_at FROM workflow_runs ORDER BY created_at DESC LIMIT 3;"
```

Expected: a row with `status='done'` (or `failed`) and a non-empty `agent_job_id`.

- [ ] **Step 7: Final commit**

```bash
git add -A
git commit -m "feat: complete workflow execution flow (generate + run + monitoring)"
```

---

## Self-Review Checklist

- [x] **Spec § Generate flow** → Task 7 (agent endpoint) + Task 5 (Go API proxy) + Task 9 (modal)
- [x] **Spec § Execute flow** → Task 5 (Go API run) + Task 7 (notifyWorkflowRun) + Task 8 (hooks) + Task 10 (page)
- [x] **Spec § DB entity** → Task 1 (migration) + Task 2 (domain) + Task 3 (repo)
- [x] **Spec § Internal callback** → Task 4 (handler) + Task 6 (route)
- [x] **Spec § Events proxy** → Task 5 (GetRunEvents) + Task 8 (useWorkflowRunEvents)
- [x] **Spec § jobType** → Task 7 step 1 (job-store.ts)
- [x] **Spec § notifyWorkflowRun** → Task 7 step 2-3
- [x] **Spec § Error handling** → Task 5 (markFailed on agent error), Task 10 (error banner on run page)
- [x] **Type consistency** → `WorkflowRun`/`WorkflowRunStatus`/`WorkflowRunEvents` defined in Task 8 step 1 and used consistently in Task 8 step 2 and Task 10
