# Schedule Trigger Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add cron-based automatic execution to workflows: a workflow with `status='active'` and `trigger.type='schedule'` fires automatically on its cron schedule, creating a `WorkflowRun` for each execution.

**Architecture:** A `CronScheduler` goroutine lives inside the Go API process, registered with `robfig/cron` at startup. It holds a map of `workflowID → cron.EntryID`. `WorkflowHandler.Update` and `.Delete` call `scheduler.Refresh` / `scheduler.Remove` to keep it in sync. The frontend canvas editor gains a `TriggerPanel` component to set and activate schedules.

**Tech Stack:** Go (`github.com/robfig/cron/v3`), pgx/v5, React + TanStack Query, Tailwind CSS

---

## File Map

| File | Action | Purpose |
|------|--------|---------|
| `apps/api/migrations/012_workflow_last_triggered.sql` | Create | Add `last_triggered_at` column |
| `apps/api/domain/workflow.go` | Modify | Add `LastTriggeredAt *time.Time` to `Workflow` |
| `apps/api/domain/repository.go` | Modify | Add `ListActiveScheduled` + `UpdateLastTriggered` to `WorkflowRepository` |
| `apps/api/infra/postgres/workflow_repo.go` | Modify | Implement new methods, update queries + scanWorkflow |
| `apps/api/internal/scheduler/scheduler.go` | Create | `CronScheduler` — loads, registers, fires workflows |
| `apps/api/api/handler/workflow.go` | Modify | Accept `*scheduler.CronScheduler`; validate cron; call Refresh/Remove |
| `apps/api/api/router.go` | Modify | `RouterDeps.WorkflowScheduler` field |
| `apps/api/cmd/server/main.go` | Modify | Instantiate + start CronScheduler |
| `apps/web/src/pages/workflows/[id]/components/TriggerPanel.tsx` | Create | Trigger settings UI (type, cron, tz, status toggle) |
| `apps/web/src/pages/workflows/[id]/edit.tsx` | Modify | Add ⏰ toolbar button + TriggerPanel overlay |

---

## Task 1: DB migration + install robfig/cron

**Files:**
- Create: `apps/api/migrations/012_workflow_last_triggered.sql`
- Modify: `apps/api/go.mod` (via `go get`)

- [ ] **Step 1: Create migration file**

```sql
-- 012_workflow_last_triggered.sql
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS last_triggered_at TIMESTAMPTZ;
```

- [ ] **Step 2: Apply migration**

```bash
cd apps/api && go run ./cmd/migrate
```

Expected: `012_workflow_last_triggered.sql applied` (or already applied).

- [ ] **Step 3: Install robfig/cron**

```bash
cd apps/api && go get github.com/robfig/cron/v3
```

Expected: go.mod gains `github.com/robfig/cron/v3` entry.

- [ ] **Step 4: Verify build**

```bash
cd apps/api && go build ./...
```

Expected: no output (clean build).

- [ ] **Step 5: Commit**

```bash
cd /Users/cookie/project/forge
git add apps/api/migrations/012_workflow_last_triggered.sql apps/api/go.mod apps/api/go.sum
git commit -m "feat(api): add last_triggered_at migration and robfig/cron dependency"
```

---

## Task 2: Domain — extend Workflow + WorkflowRepository

**Files:**
- Modify: `apps/api/domain/workflow.go`
- Modify: `apps/api/domain/repository.go`

- [ ] **Step 1: Add `LastTriggeredAt` to `Workflow` in `apps/api/domain/workflow.go`**

Replace the existing `Workflow` struct with:

```go
type Workflow struct {
	ID               string             `json:"id"`
	UserID           string             `json:"userId"`
	Name             string             `json:"name"`
	Description      string             `json:"description"`
	Definition       WorkflowDefinition `json:"definition"`
	Trigger          WorkflowTrigger    `json:"trigger"`
	Status           WorkflowStatus     `json:"status"`
	CreatedAt        time.Time          `json:"createdAt"`
	UpdatedAt        time.Time          `json:"updatedAt"`
	LastTriggeredAt  *time.Time         `json:"lastTriggeredAt,omitempty"`
}
```

- [ ] **Step 2: Add two methods to `WorkflowRepository` in `apps/api/domain/repository.go`**

Find the `WorkflowRepository` interface and add two methods:

```go
type WorkflowRepository interface {
	Create(ctx context.Context, w Workflow) (Workflow, error)
	GetByID(ctx context.Context, id string) (Workflow, error)
	ListByUserID(ctx context.Context, userID string) ([]Workflow, error)
	Update(ctx context.Context, w Workflow) (Workflow, error)
	Delete(ctx context.Context, id string) error
	// New:
	ListActiveScheduled(ctx context.Context) ([]Workflow, error)
	UpdateLastTriggered(ctx context.Context, id string, t time.Time) error
}
```

Note: `time` is already imported in `domain/workflow.go` but `repository.go` may need `"context"` and `"time"` imports — check and add if missing.

- [ ] **Step 3: Verify compilation**

```bash
cd apps/api && go build ./domain/...
```

Expected: compiler error about `workflowRepo` not implementing the interface — this is expected, will be fixed in Task 3.

- [ ] **Step 4: Commit**

```bash
cd /Users/cookie/project/forge
git add apps/api/domain/workflow.go apps/api/domain/repository.go
git commit -m "feat(api): extend Workflow domain with LastTriggeredAt and scheduler repo methods"
```

---

## Task 3: Postgres — implement new methods + update scanWorkflow

**Files:**
- Modify: `apps/api/infra/postgres/workflow_repo.go`

The existing `scanWorkflow` function scans 9 columns. After the migration, the table has `last_triggered_at`. All SELECT and RETURNING queries must include it.

- [ ] **Step 1: Replace `workflow_repo.go` entirely**

Replace the file content with:

```go
package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/forge-ai/forge/api/domain"
)

type workflowRepo struct {
	pool *pgxpool.Pool
}

func NewWorkflowRepo(pool *pgxpool.Pool) domain.WorkflowRepository {
	return &workflowRepo{pool: pool}
}

func (r *workflowRepo) Create(ctx context.Context, w domain.Workflow) (domain.Workflow, error) {
	defJSON, _ := json.Marshal(w.Definition)
	trigJSON, _ := json.Marshal(w.Trigger)
	const q = `
		INSERT INTO workflows (user_id, name, description, definition, trigger, status, created_at, updated_at)
		VALUES ($1, $2, $3, $4, $5, $6, now(), now())
		RETURNING id, user_id, name, description, definition, trigger, status, created_at, updated_at, last_triggered_at`
	row := r.pool.QueryRow(ctx, q, w.UserID, w.Name, w.Description, defJSON, trigJSON, string(w.Status))
	result, err := scanWorkflow(row)
	if err != nil {
		return domain.Workflow{}, fmt.Errorf("workflowRepo.Create: %w", err)
	}
	return result, nil
}

func (r *workflowRepo) GetByID(ctx context.Context, id string) (domain.Workflow, error) {
	const q = `
		SELECT id, user_id, name, description, definition, trigger, status, created_at, updated_at, last_triggered_at
		FROM workflows WHERE id = $1`
	row := r.pool.QueryRow(ctx, q, id)
	w, err := scanWorkflow(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Workflow{}, fmt.Errorf("workflowRepo.GetByID: %w", domain.ErrNotFound)
	}
	if err != nil {
		return domain.Workflow{}, fmt.Errorf("workflowRepo.GetByID: %w", err)
	}
	return w, nil
}

func (r *workflowRepo) ListByUserID(ctx context.Context, userID string) ([]domain.Workflow, error) {
	const q = `
		SELECT id, user_id, name, description, definition, trigger, status, created_at, updated_at, last_triggered_at
		FROM workflows WHERE user_id = $1 ORDER BY created_at DESC`
	rows, err := r.pool.Query(ctx, q, userID)
	if err != nil {
		return nil, fmt.Errorf("workflowRepo.ListByUserID: %w", err)
	}
	defer rows.Close()
	var list []domain.Workflow
	for rows.Next() {
		w, err := scanWorkflow(rows)
		if err != nil {
			return nil, fmt.Errorf("workflowRepo.ListByUserID scan: %w", err)
		}
		list = append(list, w)
	}
	return list, rows.Err()
}

func (r *workflowRepo) Update(ctx context.Context, w domain.Workflow) (domain.Workflow, error) {
	defJSON, _ := json.Marshal(w.Definition)
	trigJSON, _ := json.Marshal(w.Trigger)
	const q = `
		UPDATE workflows
		SET name=$1, description=$2, definition=$3, trigger=$4, status=$5, updated_at=now()
		WHERE id=$6
		RETURNING id, user_id, name, description, definition, trigger, status, created_at, updated_at, last_triggered_at`
	row := r.pool.QueryRow(ctx, q, w.Name, w.Description, defJSON, trigJSON, string(w.Status), w.ID)
	result, err := scanWorkflow(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Workflow{}, fmt.Errorf("workflowRepo.Update: %w", domain.ErrNotFound)
	}
	if err != nil {
		return domain.Workflow{}, fmt.Errorf("workflowRepo.Update: %w", err)
	}
	return result, nil
}

func (r *workflowRepo) Delete(ctx context.Context, id string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM workflows WHERE id=$1`, id)
	if err != nil {
		return fmt.Errorf("workflowRepo.Delete: %w", err)
	}
	return nil
}

func (r *workflowRepo) ListActiveScheduled(ctx context.Context) ([]domain.Workflow, error) {
	const q = `
		SELECT id, user_id, name, description, definition, trigger, status, created_at, updated_at, last_triggered_at
		FROM workflows
		WHERE status = 'active' AND trigger->>'type' = 'schedule'
		ORDER BY created_at`
	rows, err := r.pool.Query(ctx, q)
	if err != nil {
		return nil, fmt.Errorf("workflowRepo.ListActiveScheduled: %w", err)
	}
	defer rows.Close()
	var list []domain.Workflow
	for rows.Next() {
		w, err := scanWorkflow(rows)
		if err != nil {
			return nil, fmt.Errorf("workflowRepo.ListActiveScheduled scan: %w", err)
		}
		list = append(list, w)
	}
	return list, rows.Err()
}

func (r *workflowRepo) UpdateLastTriggered(ctx context.Context, id string, t time.Time) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE workflows SET last_triggered_at=$1 WHERE id=$2`, t, id)
	return err
}

func scanWorkflow(row interface{ Scan(dest ...any) error }) (domain.Workflow, error) {
	var w domain.Workflow
	var defJSON, trigJSON []byte
	var status string
	err := row.Scan(&w.ID, &w.UserID, &w.Name, &w.Description,
		&defJSON, &trigJSON, &status, &w.CreatedAt, &w.UpdatedAt, &w.LastTriggeredAt)
	if err != nil {
		return domain.Workflow{}, err
	}
	w.Status = domain.WorkflowStatus(status)
	_ = json.Unmarshal(defJSON, &w.Definition)
	_ = json.Unmarshal(trigJSON, &w.Trigger)
	return w, nil
}
```

- [ ] **Step 2: Verify compilation**

```bash
cd apps/api && go build ./infra/postgres/...
```

Expected: no output.

- [ ] **Step 3: Commit**

```bash
cd /Users/cookie/project/forge
git add apps/api/infra/postgres/workflow_repo.go
git commit -m "feat(api): update workflow repo to scan last_triggered_at and add scheduler query methods"
```

---

## Task 4: CronScheduler

**Files:**
- Create: `apps/api/internal/scheduler/scheduler.go`

- [ ] **Step 1: Create directory**

```bash
mkdir -p apps/api/internal/scheduler
```

- [ ] **Step 2: Create `apps/api/internal/scheduler/scheduler.go`**

```go
package scheduler

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"

	"github.com/robfig/cron/v3"

	"github.com/forge-ai/forge/api/domain"
)

var schedHTTPClient = &http.Client{Timeout: 10 * time.Second}

// CronScheduler manages in-process cron jobs for workflow schedule triggers.
type CronScheduler struct {
	c        *cron.Cron
	repo     domain.WorkflowRepository
	runRepo  domain.WorkflowRunRepository
	agentURL string
	logger   *slog.Logger

	mu       sync.Mutex
	entryIDs map[string]cron.EntryID // workflowID → entryID
}

// NewCronScheduler creates (but does not start) a CronScheduler.
func NewCronScheduler(
	repo domain.WorkflowRepository,
	runRepo domain.WorkflowRunRepository,
	agentURL string,
	logger *slog.Logger,
) *CronScheduler {
	return &CronScheduler{
		c:        cron.New(),
		repo:     repo,
		runRepo:  runRepo,
		agentURL: agentURL,
		logger:   logger,
		entryIDs: make(map[string]cron.EntryID),
	}
}

// Start loads all active scheduled workflows and starts the cron runner.
func (s *CronScheduler) Start(ctx context.Context) error {
	workflows, err := s.repo.ListActiveScheduled(ctx)
	if err != nil {
		return fmt.Errorf("scheduler.Start: %w", err)
	}
	for _, wf := range workflows {
		if err := s.addEntry(wf); err != nil {
			s.logger.Warn("scheduler: failed to register workflow", "workflowID", wf.ID, "error", err)
		}
	}
	s.logger.Info("scheduler started", "jobs", len(s.entryIDs))
	s.c.Start()
	return nil
}

// Stop gracefully stops the cron runner.
func (s *CronScheduler) Stop() {
	s.c.Stop()
}

// Refresh updates the cron entry for a workflow after it is created or updated.
// If the workflow is no longer active or scheduled, the entry is removed.
func (s *CronScheduler) Refresh(workflowID string, trigger domain.WorkflowTrigger, status domain.WorkflowStatus) {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Remove existing entry if any
	if id, ok := s.entryIDs[workflowID]; ok {
		s.c.Remove(id)
		delete(s.entryIDs, workflowID)
	}

	if status != domain.WorkflowStatusActive || trigger.Type != "schedule" {
		return
	}

	wf := domain.Workflow{ID: workflowID, Trigger: trigger, Status: status}
	if err := s.addEntryLocked(wf); err != nil {
		s.logger.Warn("scheduler.Refresh: failed to add entry", "workflowID", workflowID, "error", err)
	}
}

// Remove removes the cron entry for a deleted workflow.
func (s *CronScheduler) Remove(workflowID string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if id, ok := s.entryIDs[workflowID]; ok {
		s.c.Remove(id)
		delete(s.entryIDs, workflowID)
	}
}

// addEntry is called without lock held (used at Start time, single-threaded).
func (s *CronScheduler) addEntry(wf domain.Workflow) error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.addEntryLocked(wf)
}

// addEntryLocked is called with lock already held.
func (s *CronScheduler) addEntryLocked(wf domain.Workflow) error {
	cronExpr, _ := wf.Trigger.Config["cron"].(string)
	if cronExpr == "" {
		return fmt.Errorf("missing cron expression for workflow %s", wf.ID)
	}

	tz, _ := wf.Trigger.Config["tz"].(string)
	if tz == "" {
		tz = "UTC"
	}

	loc, err := time.LoadLocation(tz)
	if err != nil {
		return fmt.Errorf("invalid timezone %q: %w", tz, err)
	}

	// Build a cron parser with location
	parser := cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow)
	schedule, err := parser.Parse(cronExpr)
	if err != nil {
		return fmt.Errorf("invalid cron expr %q: %w", cronExpr, err)
	}
	_ = loc // loc is used via schedule internals; robfig/cron uses the parser's location

	// Use AddJob with the pre-parsed schedule
	workflowID := wf.ID
	entryID := s.c.Schedule(schedule, cron.FuncJob(func() {
		s.triggerRun(workflowID)
	}))

	// Re-create with timezone-aware location
	// Remove the entry we just added and re-add with location
	s.c.Remove(entryID)

	// Build spec with location prefix for robfig/cron
	specWithLoc := fmt.Sprintf("CRON_TZ=%s %s", tz, cronExpr)
	entryIDFinal, err := s.c.AddFunc(specWithLoc, func() {
		s.triggerRun(workflowID)
	})
	if err != nil {
		return fmt.Errorf("cron.AddFunc: %w", err)
	}

	s.entryIDs[wf.ID] = entryIDFinal
	s.logger.Info("scheduler: registered", "workflowID", wf.ID, "cron", cronExpr, "tz", tz)
	return nil
}

func (s *CronScheduler) triggerRun(workflowID string) {
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	// Fetch latest workflow definition
	wf, err := s.repo.GetByID(ctx, workflowID)
	if err != nil {
		s.logger.Error("scheduler.triggerRun: workflow not found", "workflowID", workflowID, "error", err)
		return
	}

	// Create WorkflowRun record
	run, err := s.runRepo.Create(ctx, domain.WorkflowRun{
		WorkflowID: workflowID,
		UserID:     wf.UserID,
		Status:     domain.WorkflowRunStatusQueued,
	})
	if err != nil {
		s.logger.Error("scheduler.triggerRun: failed to create run", "workflowID", workflowID, "error", err)
		return
	}

	// Dispatch to agent
	defJSON, _ := json.Marshal(wf.Definition)
	payload, _ := json.Marshal(map[string]any{
		"taskId":             run.ID,
		"projectId":          wf.UserID,
		"workflowDefinition": json.RawMessage(defJSON),
		"jobType":            "workflow",
	})

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		s.agentURL+"/run-workflow", bytes.NewReader(payload))
	if err != nil {
		s.markRunFailed(run.ID, "failed to build request")
		return
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := schedHTTPClient.Do(req)
	if err != nil || resp == nil {
		s.markRunFailed(run.ID, "agent unreachable")
		s.logger.Error("scheduler.triggerRun: agent unreachable", "workflowID", workflowID)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusAccepted {
		s.markRunFailed(run.ID, fmt.Sprintf("agent returned %d", resp.StatusCode))
		return
	}

	// Store agentJobId
	var agentResp struct {
		Data struct{ JobID string `json:"jobId"` } `json:"data"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&agentResp); err == nil && agentResp.Data.JobID != "" {
		_ = s.runRepo.UpdateAgentJobID(context.Background(), run.ID, agentResp.Data.JobID)
	}

	// Record trigger time
	_ = s.repo.UpdateLastTriggered(context.Background(), workflowID, time.Now())
	s.logger.Info("scheduler.triggerRun: dispatched", "workflowID", workflowID, "runID", run.ID)
}

func (s *CronScheduler) markRunFailed(runID, msg string) {
	now := time.Now()
	_ = s.runRepo.UpdateStatus(context.Background(), runID,
		domain.WorkflowRunStatusFailed, msg, &now)
}
```

Note: `robfig/cron` v3 supports `CRON_TZ=<tz>` prefix in the spec string natively. This is the idiomatic way to set per-job timezone.

- [ ] **Step 3: Verify compilation**

```bash
cd apps/api && go build ./internal/scheduler/...
```

Expected: no output.

- [ ] **Step 4: Commit**

```bash
cd /Users/cookie/project/forge
git add apps/api/internal/scheduler/scheduler.go
git commit -m "feat(api): add CronScheduler for workflow schedule triggers"
```

---

## Task 5: Wire Go API — WorkflowHandler + main.go + router.go

**Files:**
- Modify: `apps/api/api/handler/workflow.go`
- Modify: `apps/api/api/router.go`
- Modify: `apps/api/cmd/server/main.go`

### 5a: WorkflowHandler — inject scheduler + validate cron + call Refresh/Remove

- [ ] **Step 1: Update `apps/api/api/handler/workflow.go`**

Replace the entire file:

```go
package handler

import (
	"encoding/json"
	"errors"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/robfig/cron/v3"

	"github.com/forge-ai/forge/api/api/middleware"
	"github.com/forge-ai/forge/api/domain"
)

// WorkflowScheduler is the minimal interface WorkflowHandler needs from the scheduler.
type WorkflowScheduler interface {
	Refresh(workflowID string, trigger domain.WorkflowTrigger, status domain.WorkflowStatus)
	Remove(workflowID string)
}

type WorkflowHandler struct {
	repo      domain.WorkflowRepository
	scheduler WorkflowScheduler // may be nil in tests
}

func NewWorkflowHandler(repo domain.WorkflowRepository, scheduler WorkflowScheduler) *WorkflowHandler {
	return &WorkflowHandler{repo: repo, scheduler: scheduler}
}

// POST /api/v1/workflows
func (h *WorkflowHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())

	var body struct {
		Name        string                    `json:"name"`
		Description string                    `json:"description"`
		Definition  domain.WorkflowDefinition `json:"definition"`
		Trigger     domain.WorkflowTrigger    `json:"trigger"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON")
		return
	}
	if body.Name == "" {
		middleware.WriteFieldError(w, "name", "name is required")
		return
	}
	if err := validateTrigger(body.Trigger); err != nil {
		middleware.WriteFieldError(w, "trigger", err.Error())
		return
	}

	wf, err := h.repo.Create(r.Context(), domain.Workflow{
		UserID:      userID,
		Name:        body.Name,
		Description: body.Description,
		Definition:  body.Definition,
		Trigger:     body.Trigger,
		Status:      domain.WorkflowStatusDraft,
	})
	if err != nil {
		middleware.WriteError(w, err)
		return
	}

	if h.scheduler != nil {
		h.scheduler.Refresh(wf.ID, wf.Trigger, wf.Status)
	}
	middleware.WriteJSON(w, http.StatusCreated, wf)
}

// GET /api/v1/workflows
func (h *WorkflowHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	list, err := h.repo.ListByUserID(r.Context(), userID)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if list == nil {
		list = []domain.Workflow{}
	}
	middleware.WriteJSON(w, http.StatusOK, list)
}

// GET /api/v1/workflows/{workflowID}
func (h *WorkflowHandler) Get(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	id := chi.URLParam(r, "workflowID")

	wf, err := h.repo.GetByID(r.Context(), id)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if wf.UserID != userID {
		middleware.WriteError(w, domain.ErrForbidden)
		return
	}
	middleware.WriteJSON(w, http.StatusOK, wf)
}

// PUT /api/v1/workflows/{workflowID}
func (h *WorkflowHandler) Update(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	id := chi.URLParam(r, "workflowID")

	existing, err := h.repo.GetByID(r.Context(), id)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if existing.UserID != userID {
		middleware.WriteError(w, domain.ErrForbidden)
		return
	}

	var body struct {
		Name        string                    `json:"name"`
		Description string                    `json:"description"`
		Definition  domain.WorkflowDefinition `json:"definition"`
		Trigger     domain.WorkflowTrigger    `json:"trigger"`
		Status      domain.WorkflowStatus     `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON")
		return
	}
	if body.Name == "" {
		body.Name = existing.Name
	}
	if body.Status == "" {
		body.Status = existing.Status
	}
	if err := validateTrigger(body.Trigger); err != nil {
		middleware.WriteFieldError(w, "trigger", err.Error())
		return
	}

	updated, err := h.repo.Update(r.Context(), domain.Workflow{
		ID:          id,
		UserID:      userID,
		Name:        body.Name,
		Description: body.Description,
		Definition:  body.Definition,
		Trigger:     body.Trigger,
		Status:      body.Status,
	})
	if err != nil {
		middleware.WriteError(w, err)
		return
	}

	if h.scheduler != nil {
		h.scheduler.Refresh(updated.ID, updated.Trigger, updated.Status)
	}
	middleware.WriteJSON(w, http.StatusOK, updated)
}

// DELETE /api/v1/workflows/{workflowID}
func (h *WorkflowHandler) Delete(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	id := chi.URLParam(r, "workflowID")

	existing, err := h.repo.GetByID(r.Context(), id)
	if errors.Is(err, domain.ErrNotFound) {
		middleware.WriteError(w, domain.ErrNotFound)
		return
	}
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if existing.UserID != userID {
		middleware.WriteError(w, domain.ErrForbidden)
		return
	}

	if err := h.repo.Delete(r.Context(), id); err != nil {
		middleware.WriteError(w, err)
		return
	}

	if h.scheduler != nil {
		h.scheduler.Remove(id)
	}
	w.WriteHeader(http.StatusNoContent)
}

// validateTrigger returns an error if a schedule trigger has an invalid cron expression.
func validateTrigger(t domain.WorkflowTrigger) error {
	if t.Type != "schedule" {
		return nil
	}
	cronExpr, _ := t.Config["cron"].(string)
	if cronExpr == "" {
		return fmt.Errorf("schedule trigger requires config.cron")
	}
	parser := cron.NewParser(cron.Minute | cron.Hour | cron.Dom | cron.Month | cron.Dow)
	if _, err := parser.Parse(cronExpr); err != nil {
		return fmt.Errorf("invalid cron expression: %w", err)
	}
	return nil
}
```

Note: `"fmt"` is already in the imports above — no separate action needed.

- [ ] **Step 2: Update `RouterDeps` in `apps/api/api/router.go`**

In the `RouterDeps` struct, change:
```go
Workflow      *handler.WorkflowHandler
```
No change needed there since `WorkflowHandler` is still `*handler.WorkflowHandler`. But `NewWorkflowHandler` now needs a second argument. Update `main.go` in the next step.

- [ ] **Step 3: Update `apps/api/cmd/server/main.go`**

After `workflowRepo := postgres.NewWorkflowRepo(pool)` (around line 49), add:

```go
// Cron scheduler — manages schedule triggers
cronScheduler := scheduler.NewCronScheduler(workflowRepo, workflowRunRepo, cfg.AgentServiceURL, logger)
if err := cronScheduler.Start(context.Background()); err != nil {
    logger.Error("cron scheduler failed to start", "error", err)
    os.Exit(1)
}
defer cronScheduler.Stop()
```

Change the `workflowHandler` line from:
```go
workflowHandler := handler.NewWorkflowHandler(workflowRepo)
```
to:
```go
workflowHandler := handler.NewWorkflowHandler(workflowRepo, cronScheduler)
```

Add the import:
```go
"github.com/forge-ai/forge/api/internal/scheduler"
```

- [ ] **Step 4: Build**

```bash
cd apps/api && go build ./...
```

Expected: no output.

- [ ] **Step 5: Commit**

```bash
cd /Users/cookie/project/forge
git add apps/api/api/handler/workflow.go \
        apps/api/api/router.go \
        apps/api/cmd/server/main.go
git commit -m "feat(api): wire CronScheduler into WorkflowHandler and server startup"
```

---

## Task 6: Frontend — TriggerPanel.tsx

**Files:**
- Create: `apps/web/src/pages/workflows/[id]/components/TriggerPanel.tsx`

- [ ] **Step 1: Create file**

```typescript
import { useState, useEffect } from 'react'
import { Button } from '../../../../components/ui/button'
import { Input } from '../../../../components/ui/input'
import { Icons } from '../../../../components/ui/icons'
import type { WorkflowTrigger, WorkflowStatus } from '@forge/core'

const TIMEZONES = [
  'Asia/Shanghai', 'Asia/Tokyo', 'Asia/Seoul',
  'UTC',
  'America/New_York', 'America/Los_Angeles',
  'Europe/London', 'Europe/Berlin',
]

function cronHint(expr: string): string {
  const parts = expr.trim().split(/\s+/)
  if (parts.length !== 5) return ''
  const [min, hour, , , dow] = parts
  if (min === '*' && hour === '*') return '每分钟'
  if (min.startsWith('*/')) return `每 ${min.slice(2)} 分钟`
  if (hour !== '*' && min !== '*' && dow === '*') return `每天 ${hour.padStart(2,'0')}:${min.padStart(2,'0')}`
  if (hour !== '*' && min !== '*' && dow === '1-5') return `工作日 ${hour.padStart(2,'0')}:${min.padStart(2,'0')}`
  return expr
}

interface Props {
  workflowId: string
  trigger:    WorkflowTrigger
  status:     WorkflowStatus
  onSave:     (trigger: WorkflowTrigger, status: WorkflowStatus) => void
  onClose:    () => void
}

export function TriggerPanel({ workflowId: _, trigger, status, onSave, onClose }: Props) {
  const [type,       setType]       = useState<'manual' | 'schedule'>(
    trigger.type === 'schedule' ? 'schedule' : 'manual'
  )
  const [cronExpr,   setCronExpr]   = useState<string>(
    (trigger.config?.['cron'] as string) ?? '0 8 * * *'
  )
  const [tz,         setTz]         = useState<string>(
    (trigger.config?.['tz'] as string) ?? 'Asia/Shanghai'
  )
  const [active,     setActive]     = useState(status === 'active')

  const hint = type === 'schedule' ? cronHint(cronExpr) : ''

  const handleSave = () => {
    const newTrigger: WorkflowTrigger =
      type === 'schedule'
        ? { type: 'schedule', config: { cron: cronExpr, tz } }
        : { type: 'manual' }
    const newStatus: WorkflowStatus = active ? 'active' : 'draft'
    onSave(newTrigger, newStatus)
  }

  return (
    <div className="absolute right-0 top-10 z-20 w-80 rounded-xl border border-border bg-background shadow-xl p-4 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <span className="text-sm font-semibold">触发设置</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <Icons.X className="h-4 w-4" />
        </button>
      </div>

      {/* Trigger type */}
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-medium text-muted-foreground">触发方式</label>
        <div className="flex gap-4 text-sm">
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" value="manual" checked={type === 'manual'} onChange={() => setType('manual')} />
            手动
          </label>
          <label className="flex items-center gap-1.5 cursor-pointer">
            <input type="radio" value="schedule" checked={type === 'schedule'} onChange={() => setType('schedule')} />
            定时
          </label>
        </div>
      </div>

      {type === 'schedule' && (
        <>
          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">Cron 表达式</label>
            <Input
              value={cronExpr}
              onChange={e => setCronExpr(e.target.value)}
              placeholder="0 8 * * *"
              className="font-mono text-sm"
            />
            {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">时区</label>
            <select
              value={tz}
              onChange={e => setTz(e.target.value)}
              className="h-9 rounded-md border border-input bg-background px-3 text-sm"
            >
              {TIMEZONES.map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-xs font-medium text-muted-foreground">状态</label>
            <div className="flex gap-4 text-sm">
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" checked={!active} onChange={() => setActive(false)} />
                草稿（不自动触发）
              </label>
              <label className="flex items-center gap-1.5 cursor-pointer">
                <input type="radio" checked={active} onChange={() => setActive(true)} />
                启用
              </label>
            </div>
          </div>
        </>
      )}

      <div className="flex gap-2 justify-end pt-1">
        <Button variant="ghost" size="sm" onClick={onClose}>取消</Button>
        <Button size="sm" onClick={handleSave}>保存触发设置</Button>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Type-check**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep "TriggerPanel" | head -5
```

Expected: no errors.

- [ ] **Step 3: Commit**

```bash
cd /Users/cookie/project/forge
git add "apps/web/src/pages/workflows/[id]/components/TriggerPanel.tsx"
git commit -m "feat(web): add TriggerPanel component for workflow schedule settings"
```

---

## Task 7: Frontend — edit.tsx update

**Files:**
- Modify: `apps/web/src/pages/workflows/[id]/edit.tsx`

Add the ⏰ trigger button to the toolbar and integrate `TriggerPanel`.

- [ ] **Step 1: Add imports and state to `edit.tsx`**

Add to imports:
```typescript
import { TriggerPanel } from './components/TriggerPanel'
import type { WorkflowTrigger, WorkflowStatus } from '@forge/core'
```

Add state inside `WorkflowEditorPage` (after existing state declarations):
```typescript
const [showTrigger, setShowTrigger] = useState(false)
const [localTrigger, setLocalTrigger] = useState<WorkflowTrigger>(
  workflow?.trigger ?? { type: 'manual' }
)
const [localStatus, setLocalStatus] = useState<WorkflowStatus>(
  workflow?.status ?? 'draft'
)
```

Add a `useEffect` to sync from workflow once loaded (after the existing initialisation effect):
```typescript
useEffect(() => {
  if (workflow && !initialised) {
    setLocalTrigger(workflow.trigger)
    setLocalStatus(workflow.status)
  }
}, [workflow, initialised])
```

- [ ] **Step 2: Add trigger save handler**

Add after `handleExecute`:
```typescript
const handleTriggerSave = useCallback(async (trigger: WorkflowTrigger, status: WorkflowStatus) => {
  if (!id) return
  setLocalTrigger(trigger)
  setLocalStatus(status)
  setShowTrigger(false)
  try {
    await update({ id, trigger, status })
  } catch {
    alert('触发设置保存失败')
  }
}, [id, update])
```

- [ ] **Step 3: Add toolbar button and TriggerPanel**

In the toolbar JSX, add after the `执行` button:
```tsx
<div className="relative">
  <Button
    size="sm" variant={localStatus === 'active' ? 'default' : 'ghost'}
    onClick={() => setShowTrigger(v => !v)}
  >
    <Icons.Bell className="h-3.5 w-3.5 mr-1.5" />
    {localStatus === 'active' ? '定时已启用' : '触发'}
  </Button>
  {showTrigger && workflow && (
    <TriggerPanel
      workflowId={id ?? ''}
      trigger={localTrigger}
      status={localStatus}
      onSave={handleTriggerSave}
      onClose={() => setShowTrigger(false)}
    />
  )}
</div>
```

- [ ] **Step 4: Type-check**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -v "TS5097" | grep "edit.tsx" | head -10
```

Expected: no new errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/cookie/project/forge
git add "apps/web/src/pages/workflows/[id]/edit.tsx"
git commit -m "feat(web): add trigger toolbar button and TriggerPanel integration in canvas editor"
```

---

## Task 8: Smoke test

- [ ] **Step 1: Restart Go API and verify scheduler logs**

```bash
cd apps/api && go run ./cmd/server
```

Expected log line on startup:
```
scheduler started jobs=N
```
(N = number of currently active+scheduled workflows, likely 0)

- [ ] **Step 2: Create a test workflow with schedule trigger via API**

Get a JWT from browser dev tools after login, then:

```bash
TOKEN="<paste JWT>"

# Create a schedule workflow
curl -s -X POST http://localhost:8080/api/v1/workflows \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{
    "name": "测试定时触发",
    "description": "每2分钟跑一次",
    "definition": {"steps": [{"id":"s1","name":"测试","capability":"llm","instructions":"输出当前时间","depends_on":[],"config":{}}]},
    "trigger": {"type": "schedule", "config": {"cron": "*/2 * * * *", "tz": "Asia/Shanghai"}}
  }' | python3 -m json.tool
```

Note the workflow `id` from the response.

- [ ] **Step 3: Activate the workflow**

```bash
WF_ID="<paste id from above>"
curl -s -X PUT http://localhost:8080/api/v1/workflows/$WF_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"测试定时触发","trigger":{"type":"schedule","config":{"cron":"*/2 * * * *","tz":"Asia/Shanghai"}},"status":"active"}' \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('status'), d.get('trigger'))"
```

Expected: `active {'type': 'schedule', 'config': {'cron': '*/2 * * * *', 'tz': 'Asia/Shanghai'}}`

Expected log line: `scheduler: registered workflowID=... cron=*/2 * * * * tz=Asia/Shanghai`

- [ ] **Step 4: Wait ~2 minutes and check workflow_runs**

```bash
psql $DATABASE_URL -c "SELECT id, workflow_id, status, created_at FROM workflow_runs WHERE workflow_id = '$WF_ID' ORDER BY created_at DESC LIMIT 5;"
```

Expected: one or more rows with `status='done'` (or `'failed'` if agent isn't running).

- [ ] **Step 5: Test invalid cron expression (should return 400)**

```bash
curl -s -X PUT http://localhost:8080/api/v1/workflows/$WF_ID \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"name":"test","trigger":{"type":"schedule","config":{"cron":"not-valid","tz":"UTC"}},"status":"active"}' \
  | python3 -m json.tool
```

Expected: `{"error": {"code": "BAD_REQUEST", "message": "...", "field": "trigger"}}`

- [ ] **Step 6: Test UI flow**

1. Open `/workflows`
2. Create a workflow (or use existing)
3. Open canvas editor
4. Click "触发" button in toolbar
5. Select "定时", enter `0 9 * * 1-5`, hint shows "工作日 09:00"
6. Select "启用"
7. Click "保存触发设置"
8. Verify toolbar button changes to "定时已启用"

---

## Self-Review

- [x] **Spec: cron config `{cron, tz}`** → Task 4 (`addEntryLocked`), Task 6 (`TriggerPanel`)
- [x] **Spec: `status='active'` to trigger** → Task 4 (`Refresh` checks status), Task 7 (local status state)
- [x] **Spec: `last_triggered_at` column** → Task 1 (migration), Task 2 (domain), Task 3 (repo)
- [x] **Spec: restart re-registers, no replay** → Task 4 (`Start()` calls `ListActiveScheduled`)
- [x] **Spec: invalid cron → 400** → Task 5 (`validateTrigger` in workflow.go)
- [x] **Spec: `Remove` on delete** → Task 5 (Delete handler calls `h.scheduler.Remove(id)`)
- [x] **Spec: `Refresh` on update** → Task 5 (Update handler calls `h.scheduler.Refresh(...)`)
- [x] **Spec: WorkflowRun created per trigger** → Task 4 (`triggerRun` creates run, dispatches agent)
- [x] **Spec: human-readable cron hint** → Task 6 (`cronHint` function)
- [x] **Type consistency**: `WorkflowScheduler` interface in `workflow.go` matches `CronScheduler` methods in `scheduler.go`; `domain.WorkflowTrigger` / `domain.WorkflowStatus` used consistently everywhere
- [x] **No placeholders**: all code blocks are complete
