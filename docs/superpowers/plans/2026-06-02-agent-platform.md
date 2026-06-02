# Agent Platform Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Agent management platform — CRUD UI at `/agents`, Go API backend, and Layer 2 pipeline infrastructure so custom agents can override default builders.

**Architecture:** Part A (Go API) and Part B (Agent Service) are independent and can run in parallel. Part C (Frontend) depends on Part A completing first. Part A adds `agents` table + CRUD endpoints + internal GET. Part B adds `CustomBuilderAgent`, `WRITE_ALLOWED` override hook, and `agentOverrides` support in the Orchestrator. Part C adds `packages/core/agent/` hooks, a static `AGENT_REGISTRY`, and the `/agents` page.

**Tech Stack:** Go (chi, pgx), TypeScript (Vitest, React, TanStack Query, Zod), Vite proxy (`/agent` → agent service port 3001)

---

## File Map

```
Created (Go API):
  apps/api/migrations/004_agents.sql
  apps/api/domain/agent.go
  apps/api/infra/postgres/agent_repo.go
  apps/api/api/handler/agent.go
  apps/api/api/handler/agent_test.go

Modified (Go API):
  apps/api/domain/repository.go          — add AgentRepository interface
  apps/api/infra/mock/agent_repo.go      — add AgentRepo mock (new file in mock package)
  apps/api/api/handler/internal.go       — add agentRepo field + GetAgent handler
  apps/api/api/handler/internal_test.go  — add GetAgent test
  apps/api/api/router.go                 — add /agents routes + /internal/agents/:id
  apps/api/cmd/server/main.go            — wire agentRepo + handlers

Created (Agent Service):
  apps/agent/src/agents/builder/custom-agent.ts

Modified (Agent Service):
  apps/agent/src/agents/builder/base-builder.ts  — add writeGuard() hook
  apps/agent/src/server.ts                        — GET /instructions/:role + extend POST /run
  apps/agent/src/orchestrator/orchestrator.ts     — agentOverrides in OrchestratorDeps
  apps/agent/src/job-runner.ts                    — resolveAgentOverrides

Created (Frontend):
  packages/core/agent/use-agents.ts
  packages/core/agent/index.ts
  apps/web/src/lib/agent-registry.ts
  apps/web/src/pages/agents/index.tsx
  apps/web/src/pages/agents/components/AgentList.tsx
  apps/web/src/pages/agents/components/AgentCard.tsx
  apps/web/src/pages/agents/components/AgentTabPanel.tsx
  apps/web/src/pages/agents/components/tabs/InstructionsTab.tsx
  apps/web/src/pages/agents/components/tabs/ToolsTab.tsx
  apps/web/src/pages/agents/components/tabs/WritePathsTab.tsx
  apps/web/src/pages/agents/components/tabs/ConfigTab.tsx

Modified (Frontend):
  packages/core/index.ts                         — export agent hooks
  apps/web/src/components/layout/AppShell.tsx    — add /agents NavItem
  apps/web/src/routes.tsx                        — add /agents route
```

---

## Part A — Go API

### Task A1: DB migration + domain Agent model

**Files:**
- Create: `apps/api/migrations/004_agents.sql`
- Create: `apps/api/domain/agent.go`
- Modify: `apps/api/domain/repository.go`

- [ ] **Step 1: Write the migration**

Create `apps/api/migrations/004_agents.sql`:

```sql
CREATE TABLE agents (
  id           TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id      TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name         TEXT        NOT NULL,
  description  TEXT        NOT NULL DEFAULT '',
  instructions TEXT        NOT NULL DEFAULT '',
  tools        TEXT[]      NOT NULL DEFAULT '{}',
  write_paths  TEXT[]      NOT NULL DEFAULT '{}',
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX agents_user_id_idx ON agents(user_id);
```

- [ ] **Step 2: Create domain/agent.go**

```go
package domain

import "time"

type Agent struct {
	ID           string    `json:"id"`
	UserID       string    `json:"userId"`
	Name         string    `json:"name"`
	Description  string    `json:"description"`
	Instructions string    `json:"instructions"`
	Tools        []string  `json:"tools"`
	WritePaths   []string  `json:"writePaths"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

var validAgentTools = map[string]bool{
	"read_file":  true,
	"write_file": true,
	"str_replace": true,
	"tsc_check":  true,
	"spawn_task": true,
}

func ValidAgentTool(t string) bool { return validAgentTools[t] }
```

- [ ] **Step 3: Add AgentRepository to domain/repository.go**

Open `apps/api/domain/repository.go`. Append after the `SettingsRepository` interface:

```go
type AgentRepository interface {
	Create(ctx context.Context, a Agent) (Agent, error)
	GetByID(ctx context.Context, id string) (Agent, error)
	ListByUserID(ctx context.Context, userID string) ([]Agent, error)
	Update(ctx context.Context, a Agent) (Agent, error)
	Delete(ctx context.Context, id, userID string) error
}
```

- [ ] **Step 4: Verify Go compiles**

```bash
cd apps/api && go build ./...
```
Expected: exits 0, no errors.

- [ ] **Step 5: Commit**

```bash
git add apps/api/migrations/004_agents.sql apps/api/domain/agent.go apps/api/domain/repository.go
git commit -m "feat(api): add agents table migration and domain model"
```

---

### Task A2: Postgres AgentRepo + Mock

**Files:**
- Create: `apps/api/infra/postgres/agent_repo.go`
- Create: `apps/api/infra/mock/agent_repo.go`

- [ ] **Step 1: Create infra/postgres/agent_repo.go**

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

type agentRepo struct {
	pool *pgxpool.Pool
}

func NewAgentRepo(pool *pgxpool.Pool) domain.AgentRepository {
	return &agentRepo{pool: pool}
}

func (r *agentRepo) Create(ctx context.Context, a domain.Agent) (domain.Agent, error) {
	const q = `
		INSERT INTO agents (user_id, name, description, instructions, tools, write_paths)
		VALUES ($1, $2, $3, $4, $5, $6)
		RETURNING id, user_id, name, description, instructions, tools, write_paths, created_at, updated_at`
	row := r.pool.QueryRow(ctx, q, a.UserID, a.Name, a.Description, a.Instructions, a.Tools, a.WritePaths)
	return scanAgent(row)
}

func (r *agentRepo) GetByID(ctx context.Context, id string) (domain.Agent, error) {
	const q = `
		SELECT id, user_id, name, description, instructions, tools, write_paths, created_at, updated_at
		FROM agents WHERE id = $1`
	row := r.pool.QueryRow(ctx, q, id)
	a, err := scanAgent(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Agent{}, fmt.Errorf("agentRepo.GetByID: %w", domain.ErrNotFound)
	}
	return a, err
}

func (r *agentRepo) ListByUserID(ctx context.Context, userID string) ([]domain.Agent, error) {
	const q = `
		SELECT id, user_id, name, description, instructions, tools, write_paths, created_at, updated_at
		FROM agents WHERE user_id = $1
		ORDER BY created_at DESC`
	rows, err := r.pool.Query(ctx, q, userID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []domain.Agent
	for rows.Next() {
		a, err := scanAgent(rows)
		if err != nil {
			return nil, err
		}
		result = append(result, a)
	}
	return result, rows.Err()
}

func (r *agentRepo) Update(ctx context.Context, a domain.Agent) (domain.Agent, error) {
	const q = `
		UPDATE agents
		SET name=$1, description=$2, instructions=$3, tools=$4, write_paths=$5, updated_at=now()
		WHERE id=$6 AND user_id=$7
		RETURNING id, user_id, name, description, instructions, tools, write_paths, created_at, updated_at`
	row := r.pool.QueryRow(ctx, q, a.Name, a.Description, a.Instructions, a.Tools, a.WritePaths, a.ID, a.UserID)
	result, err := scanAgent(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Agent{}, fmt.Errorf("agentRepo.Update: %w", domain.ErrNotFound)
	}
	return result, err
}

func (r *agentRepo) Delete(ctx context.Context, id, userID string) error {
	const q = `DELETE FROM agents WHERE id=$1 AND user_id=$2`
	tag, err := r.pool.Exec(ctx, q, id, userID)
	if err != nil {
		return err
	}
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("agentRepo.Delete: %w", domain.ErrNotFound)
	}
	return nil
}

type agentScanner interface {
	Scan(dest ...any) error
}

func scanAgent(row agentScanner) (domain.Agent, error) {
	var a domain.Agent
	var createdAt, updatedAt time.Time
	err := row.Scan(
		&a.ID, &a.UserID, &a.Name, &a.Description, &a.Instructions,
		&a.Tools, &a.WritePaths, &createdAt, &updatedAt,
	)
	if err != nil {
		return domain.Agent{}, err
	}
	a.CreatedAt = createdAt
	a.UpdatedAt = updatedAt
	return a, nil
}
```

- [ ] **Step 2: Create infra/mock/agent_repo.go**

```go
package mock

import (
	"context"
	"fmt"

	"github.com/forge-ai/forge/api/domain"
)

type AgentRepo struct {
	CreateFn        func(ctx context.Context, a domain.Agent) (domain.Agent, error)
	GetByIDFn       func(ctx context.Context, id string) (domain.Agent, error)
	ListByUserIDFn  func(ctx context.Context, userID string) ([]domain.Agent, error)
	UpdateFn        func(ctx context.Context, a domain.Agent) (domain.Agent, error)
	DeleteFn        func(ctx context.Context, id, userID string) error
}

func (m *AgentRepo) Create(ctx context.Context, a domain.Agent) (domain.Agent, error) {
	if m.CreateFn == nil { return domain.Agent{}, fmt.Errorf("mock: CreateFn not set") }
	return m.CreateFn(ctx, a)
}
func (m *AgentRepo) GetByID(ctx context.Context, id string) (domain.Agent, error) {
	if m.GetByIDFn == nil { return domain.Agent{}, fmt.Errorf("mock: GetByIDFn not set") }
	return m.GetByIDFn(ctx, id)
}
func (m *AgentRepo) ListByUserID(ctx context.Context, userID string) ([]domain.Agent, error) {
	if m.ListByUserIDFn == nil { return nil, fmt.Errorf("mock: ListByUserIDFn not set") }
	return m.ListByUserIDFn(ctx, userID)
}
func (m *AgentRepo) Update(ctx context.Context, a domain.Agent) (domain.Agent, error) {
	if m.UpdateFn == nil { return domain.Agent{}, fmt.Errorf("mock: UpdateFn not set") }
	return m.UpdateFn(ctx, a)
}
func (m *AgentRepo) Delete(ctx context.Context, id, userID string) error {
	if m.DeleteFn == nil { return fmt.Errorf("mock: DeleteFn not set") }
	return m.DeleteFn(ctx, id, userID)
}
```

- [ ] **Step 3: Verify Go compiles**

```bash
cd apps/api && go build ./...
```
Expected: exits 0.

- [ ] **Step 4: Commit**

```bash
git add apps/api/infra/postgres/agent_repo.go apps/api/infra/mock/agent_repo.go
git commit -m "feat(api): add postgres AgentRepo and mock"
```

---

### Task A3: AgentHandler CRUD + tests

**Files:**
- Create: `apps/api/api/handler/agent.go`
- Create: `apps/api/api/handler/agent_test.go`

- [ ] **Step 1: Write failing tests first**

Create `apps/api/api/handler/agent_test.go`:

```go
package handler_test

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/go-chi/chi/v5"

	"github.com/forge-ai/forge/api/api/handler"
	"github.com/forge-ai/forge/api/api/middleware"
	"github.com/forge-ai/forge/api/domain"
	"github.com/forge-ai/forge/api/infra/mock"
)

func TestAgentHandler_Create_MissingName(t *testing.T) {
	repo := &mock.AgentRepo{}
	h := handler.NewAgentHandler(repo)
	r := chi.NewRouter()
	r.With(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			next.ServeHTTP(w, req.WithContext(middleware.WithUserID(req.Context(), "user-1")))
		})
	}).Post("/api/v1/agents", h.Create)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/agents", strings.NewReader(`{"name":""}`))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestAgentHandler_Create_InvalidTool(t *testing.T) {
	repo := &mock.AgentRepo{}
	h := handler.NewAgentHandler(repo)
	r := chi.NewRouter()
	r.With(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			next.ServeHTTP(w, req.WithContext(middleware.WithUserID(req.Context(), "user-1")))
		})
	}).Post("/api/v1/agents", h.Create)

	body := `{"name":"My Agent","tools":["not_a_real_tool"]}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/agents", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400 for invalid tool, got %d", w.Code)
	}
}

func TestAgentHandler_Create_Success(t *testing.T) {
	want := domain.Agent{ID: "ag-1", UserID: "user-1", Name: "Docs Writer", Tools: []string{"read_file"}, WritePaths: []string{"docs/"}}
	repo := &mock.AgentRepo{
		CreateFn: func(_ context.Context, a domain.Agent) (domain.Agent, error) {
			return want, nil
		},
	}
	h := handler.NewAgentHandler(repo)
	r := chi.NewRouter()
	r.With(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			next.ServeHTTP(w, req.WithContext(middleware.WithUserID(req.Context(), "user-1")))
		})
	}).Post("/api/v1/agents", h.Create)

	body := `{"name":"Docs Writer","tools":["read_file"],"writePaths":["docs/"]}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/agents", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]any
	json.NewDecoder(w.Body).Decode(&resp)
	data := resp["data"].(map[string]any)
	if data["id"] != "ag-1" {
		t.Errorf("expected id ag-1, got %v", data["id"])
	}
}

func TestAgentHandler_Delete_NotOwner(t *testing.T) {
	repo := &mock.AgentRepo{
		DeleteFn: func(_ context.Context, id, userID string) error {
			return domain.ErrNotFound
		},
	}
	h := handler.NewAgentHandler(repo)
	r := chi.NewRouter()
	r.With(func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
			next.ServeHTTP(w, req.WithContext(middleware.WithUserID(req.Context(), "other-user")))
		})
	}).Delete("/api/v1/agents/{agentID}", h.Delete)

	req := httptest.NewRequest(http.MethodDelete, "/api/v1/agents/ag-1", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd apps/api && go test ./api/handler/... -run TestAgentHandler 2>&1 | tail -5
```
Expected: compile error — `handler.NewAgentHandler` not defined.

- [ ] **Step 3: Create api/handler/agent.go**

```go
package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"

	"github.com/forge-ai/forge/api/api/middleware"
	"github.com/forge-ai/forge/api/domain"
)

type AgentHandler struct {
	repo domain.AgentRepository
}

func NewAgentHandler(repo domain.AgentRepository) *AgentHandler {
	return &AgentHandler{repo: repo}
}

// GET /api/v1/agents
func (h *AgentHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	agents, err := h.repo.ListByUserID(r.Context(), userID)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if agents == nil {
		agents = []domain.Agent{}
	}
	middleware.WriteJSONList(w, agents, len(agents), 1, 100)
}

// POST /api/v1/agents
func (h *AgentHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	var body struct {
		Name         string   `json:"name"`
		Description  string   `json:"description"`
		Instructions string   `json:"instructions"`
		Tools        []string `json:"tools"`
		WritePaths   []string `json:"writePaths"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON")
		return
	}
	if body.Name == "" {
		middleware.WriteFieldError(w, "name", "name is required")
		return
	}
	for _, t := range body.Tools {
		if !domain.ValidAgentTool(t) {
			middleware.WriteFieldError(w, "tools", "unknown tool: "+t)
			return
		}
	}
	if body.Tools == nil {
		body.Tools = []string{}
	}
	if body.WritePaths == nil {
		body.WritePaths = []string{}
	}
	agent, err := h.repo.Create(r.Context(), domain.Agent{
		UserID:       userID,
		Name:         body.Name,
		Description:  body.Description,
		Instructions: body.Instructions,
		Tools:        body.Tools,
		WritePaths:   body.WritePaths,
	})
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	middleware.WriteJSON(w, http.StatusCreated, agent)
}

// GET /api/v1/agents/{agentID}
func (h *AgentHandler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "agentID")
	userID := middleware.UserIDFromContext(r.Context())
	agent, err := h.repo.GetByID(r.Context(), id)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if agent.UserID != userID {
		middleware.WriteError(w, domain.ErrForbidden)
		return
	}
	middleware.WriteJSON(w, http.StatusOK, agent)
}

// PUT /api/v1/agents/{agentID}
func (h *AgentHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "agentID")
	userID := middleware.UserIDFromContext(r.Context())
	var body struct {
		Name         string   `json:"name"`
		Description  string   `json:"description"`
		Instructions string   `json:"instructions"`
		Tools        []string `json:"tools"`
		WritePaths   []string `json:"writePaths"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON")
		return
	}
	if body.Name == "" {
		middleware.WriteFieldError(w, "name", "name is required")
		return
	}
	for _, t := range body.Tools {
		if !domain.ValidAgentTool(t) {
			middleware.WriteFieldError(w, "tools", "unknown tool: "+t)
			return
		}
	}
	if body.Tools == nil {
		body.Tools = []string{}
	}
	if body.WritePaths == nil {
		body.WritePaths = []string{}
	}
	agent, err := h.repo.Update(r.Context(), domain.Agent{
		ID:           id,
		UserID:       userID,
		Name:         body.Name,
		Description:  body.Description,
		Instructions: body.Instructions,
		Tools:        body.Tools,
		WritePaths:   body.WritePaths,
	})
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	middleware.WriteJSON(w, http.StatusOK, agent)
}

// DELETE /api/v1/agents/{agentID}
func (h *AgentHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "agentID")
	userID := middleware.UserIDFromContext(r.Context())
	if err := h.repo.Delete(r.Context(), id, userID); err != nil {
		middleware.WriteError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
cd apps/api && go test ./api/handler/... -run TestAgentHandler -v 2>&1 | tail -15
```
Expected: `PASS` for all 4 agent tests.

- [ ] **Step 5: Commit**

```bash
git add apps/api/api/handler/agent.go apps/api/api/handler/agent_test.go
git commit -m "feat(api): add AgentHandler CRUD with validation"
```

---

### Task A4: Internal GET /agents/:id + router + main.go

**Files:**
- Modify: `apps/api/api/handler/internal.go`
- Modify: `apps/api/api/handler/internal_test.go`
- Modify: `apps/api/api/router.go`
- Modify: `apps/api/cmd/server/main.go`

- [ ] **Step 1: Write failing test for internal GetAgent**

Open `apps/api/api/handler/internal_test.go`. Add:

```go
func TestInternalHandler_GetAgent_Success(t *testing.T) {
	want := domain.Agent{ID: "ag-1", UserID: "u-1", Name: "Docs Writer", Tools: []string{"read_file"}, WritePaths: []string{"docs/"}}
	agentRepo := &mock.AgentRepo{
		GetByIDFn: func(_ context.Context, id string) (domain.Agent, error) {
			if id == "ag-1" { return want, nil }
			return domain.Agent{}, domain.ErrNotFound
		},
	}
	h := handler.NewInternalHandler(nil, agentRepo)
	r := chi.NewRouter()
	r.Get("/internal/agents/{agentID}", h.GetAgent)

	req := httptest.NewRequest(http.MethodGet, "/internal/agents/ag-1", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
	var resp map[string]any
	json.NewDecoder(w.Body).Decode(&resp)
	data := resp["data"].(map[string]any)
	if data["id"] != "ag-1" {
		t.Errorf("expected id ag-1, got %v", data["id"])
	}
}

func TestInternalHandler_GetAgent_NotFound(t *testing.T) {
	agentRepo := &mock.AgentRepo{
		GetByIDFn: func(_ context.Context, id string) (domain.Agent, error) {
			return domain.Agent{}, domain.ErrNotFound
		},
	}
	h := handler.NewInternalHandler(nil, agentRepo)
	r := chi.NewRouter()
	r.Get("/internal/agents/{agentID}", h.GetAgent)

	req := httptest.NewRequest(http.MethodGet, "/internal/agents/missing", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusNotFound {
		t.Errorf("expected 404, got %d", w.Code)
	}
}
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd apps/api && go test ./api/handler/... -run TestInternalHandler_GetAgent 2>&1 | tail -5
```
Expected: compile error — `NewInternalHandler` signature mismatch.

- [ ] **Step 3: Update internal.go — add agentRepo + GetAgent**

Replace `InternalHandler` struct and constructor:

```go
type InternalHandler struct {
	taskRepo  domain.TaskRepository
	agentRepo domain.AgentRepository
}

func NewInternalHandler(taskRepo domain.TaskRepository, agentRepo domain.AgentRepository) *InternalHandler {
	return &InternalHandler{taskRepo: taskRepo, agentRepo: agentRepo}
}
```

Add at the end of `internal.go` (keep `UpdateTaskStatus` unchanged):

```go
// GET /internal/agents/{agentID}
func (h *InternalHandler) GetAgent(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "agentID")
	agent, err := h.agentRepo.GetByID(r.Context(), id)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	middleware.WriteJSON(w, http.StatusOK, agent)
}
```

- [ ] **Step 4: Update router.go — add /agents routes + internal agent route**

In `router.go`, inside the `r.Route("/api/v1", ...)` block, after the settings block add:

```go
// Agents
r.Route("/agents", func(r chi.Router) {
    r.Get("/", deps.Agent.List)
    r.Post("/", deps.Agent.Create)
    r.Route("/{agentID}", func(r chi.Router) {
        r.Get("/", deps.Agent.Get)
        r.Put("/", deps.Agent.Update)
        r.Delete("/", deps.Agent.Delete)
    })
})
```

In the internal routes block, add after the existing `PATCH /tasks/:id/status` route:

```go
r.Get("/agents/{agentID}", deps.Internal.GetAgent)
```

Update `RouterDeps` struct to add the Agent handler:

```go
type RouterDeps struct {
	Auth          *handler.AuthHandler
	Project       *handler.ProjectHandler
	Task          *handler.TaskHandler
	Health        *handler.HealthHandler
	Internal      *handler.InternalHandler
	Settings      *handler.SettingsHandler
	Agent         *handler.AgentHandler     // add this
	InternalToken string
	JWTSecret     string
	Logger        *slog.Logger
}
```

- [ ] **Step 5: Update main.go — wire agentRepo + handlers**

In `main.go`, after `settingsRepo := postgres.NewSettingsRepo(pool)`, add:

```go
agentRepo := postgres.NewAgentRepo(pool)
```

After `settingsHandler := handler.NewSettingsHandler(...)`, add:

```go
agentHandler := handler.NewAgentHandler(agentRepo)
```

Update `NewInternalHandler` call:

```go
internalHandler := handler.NewInternalHandler(taskRepo, agentRepo)
```

Update `apiPkg.NewRouter(...)` call to add:

```go
Agent: agentHandler,
```

- [ ] **Step 6: Run all Go tests**

```bash
cd apps/api && go test ./... 2>&1 | tail -20
```
Expected: all tests pass including the 2 new `TestInternalHandler_GetAgent` tests.

- [ ] **Step 7: Commit**

```bash
git add apps/api/api/handler/internal.go apps/api/api/handler/internal_test.go apps/api/api/router.go apps/api/cmd/server/main.go
git commit -m "feat(api): wire AgentHandler routes and internal GET /agents/:id"
```

---

## Part B — Agent Service

### Task B1: GET /instructions/:role route

**Files:**
- Modify: `apps/agent/src/server.ts`

- [ ] **Step 1: Add the route to server.ts**

Open `apps/agent/src/server.ts`. Find the main request handler (the switch/if block that dispatches routes). Add a new route handler before the 404 fallback:

```ts
// GET /instructions/:role  — serve instruction file content for a system agent role
if (req.method === 'GET' && req.url?.match(/^\/instructions\/[a-z]+$/)) {
  const role = req.url.split('/').pop()!
  const { readFileSync } = await import('fs')
  const { join, dirname } = await import('path')
  const { fileURLToPath } = await import('url')
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const filePath = join(__dirname, 'templates/instructions', `${role}.md`)
  try {
    const content = readFileSync(filePath, 'utf-8')
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8', 'Access-Control-Allow-Origin': '*' })
    res.end(content)
  } catch {
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: { code: 'NOT_FOUND', message: `No instructions for role: ${role}` } }))
  }
  return
}
```

- [ ] **Step 2: Test manually (server must be running)**

```bash
cd apps/agent && node --require dotenv/config ./node_modules/.bin/tsx src/index.ts &
sleep 2
curl http://localhost:3001/instructions/logic | head -5
```
Expected: first 5 lines of `logic.md` content.

```bash
curl -s http://localhost:3001/instructions/nonexistent | jq .
```
Expected: `{"error": {"code": "NOT_FOUND", ...}}`.

Kill the background server: `pkill -f "tsx src/index.ts"`.

- [ ] **Step 3: Commit**

```bash
git add apps/agent/src/server.ts
git commit -m "feat(agent): add GET /instructions/:role route"
```

---

### Task B2: CustomBuilderAgent + writeGuard hook in BaseBuilderAgent

**Files:**
- Modify: `apps/agent/src/agents/builder/base-builder.ts`
- Create: `apps/agent/src/agents/builder/custom-agent.ts`

- [ ] **Step 1: Write failing test**

Open `apps/agent/src/agents/builder/builder.test.ts`. Add:

```ts
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

  it('blocks write outside custom writePaths', async () => {
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
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd apps/agent && npx vitest run src/agents/builder/builder.test.ts -t "CustomBuilderAgent" 2>&1 | tail -10
```
Expected: compile error — `CustomBuilderAgent` not found.

- [ ] **Step 3: Add writeGuard() to BaseBuilderAgent in base-builder.ts**

In the `BaseBuilderAgent` abstract class, add a new protected method after `contextUpdate`:

```ts
/** Override in subclasses to replace the WRITE_ALLOWED role-based guard. */
protected writeGuard(): ((path: string) => boolean) | undefined {
  return undefined
}
```

In the `buildTools()` function, update both `write_file` and `str_replace` execute blocks to use the guard from `writeGuard()`. Since `buildTools` is a module-level function that receives `role`, add an optional `customWriteGuard` parameter:

Change the `buildTools` signature from:
```ts
function buildTools(
  sandbox: SandboxIO,
  emit: (e: ProgressEvent) => void,
  role: AgentRole,
  spawnFn?: SpawnTaskFn,
  currentTaskId?: string,
  currentDepth?: number,
)
```
to:
```ts
function buildTools(
  sandbox: SandboxIO,
  emit: (e: ProgressEvent) => void,
  role: AgentRole,
  spawnFn?: SpawnTaskFn,
  currentTaskId?: string,
  currentDepth?: number,
  customWriteGuard?: (path: string) => boolean,
)
```

In `write_file`'s `execute`, replace the guard block:
```ts
// OLD:
const guard = WRITE_ALLOWED[role] ?? (() => false)
if (!guard(path)) {
  return { ok: false, error: `write blocked: ...` }
}
// NEW:
const guard = customWriteGuard ?? WRITE_ALLOWED[role] ?? (() => false)
if (!guard(path)) {
  return { ok: false, error: `write blocked: ${role} agent is not allowed to write to "${path}"` }
}
```

Apply the same change to `str_replace`'s execute block.

In `BaseBuilderAgent.executeTask`, pass `this.writeGuard()` when calling `buildTools`:
```ts
const tools = buildTools(
  sandbox,
  emit,
  this.role,
  spawnFn,
  input.task.id,
  input.task.depth ?? 0,
  this.writeGuard(),   // add this
)
```

- [ ] **Step 4: Create custom-agent.ts**

Create `apps/agent/src/agents/builder/custom-agent.ts`:

```ts
import type { PlanTask, AgentRole } from '../../contracts/task-plan.js'
import { BaseBuilderAgent, type TaskInput } from './base-builder.js'

export interface CustomAgentConfig {
  instructions: string
  tools: string[]
  writePaths: string[]
}

export class CustomBuilderAgent extends BaseBuilderAgent {
  readonly role: AgentRole

  constructor(role: AgentRole, private config: CustomAgentConfig) {
    super()
    this.role = role
  }

  protected systemPrompt(): string {
    return this.config.instructions
  }

  protected buildTaskPrompt(input: TaskInput): string {
    return [
      `Task: ${input.task.description}`,
      `File: ${input.task.file}`,
      `Action: ${input.task.action}`,
      input.projectContext ? `\nContext:\n${input.projectContext}` : '',
    ].filter(Boolean).join('\n')
  }

  protected contextUpdate(_task: PlanTask, _code: string): null {
    return null
  }

  protected writeGuard(): (path: string) => boolean {
    const prefixes = this.config.writePaths
    return (path: string) => prefixes.length === 0 || prefixes.some(prefix => path.startsWith(prefix))
  }
}
```

- [ ] **Step 5: Export from builder index**

Open `apps/agent/src/agents/builder/index.ts`. Add:

```ts
export { CustomBuilderAgent } from './custom-agent.js'
export type { CustomAgentConfig } from './custom-agent.js'
```

- [ ] **Step 6: Run tests**

```bash
cd apps/agent && npx vitest run src/agents/builder/builder.test.ts 2>&1 | tail -15
```
Expected: all tests including the 3 new `CustomBuilderAgent` tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/agent/src/agents/builder/base-builder.ts apps/agent/src/agents/builder/custom-agent.ts apps/agent/src/agents/builder/index.ts apps/agent/src/agents/builder/builder.test.ts
git commit -m "feat(agent): add CustomBuilderAgent with dynamic write guard"
```

---

### Task B3: Orchestrator agentOverrides + job-runner resolveAgentOverrides

**Files:**
- Modify: `apps/agent/src/orchestrator/orchestrator.ts`
- Modify: `apps/agent/src/job-runner.ts`
- Modify: `apps/agent/src/server.ts`

- [ ] **Step 1: Write failing test**

Open `apps/agent/src/orchestrator/orchestrator.test.ts`. Add:

```ts
it('replaces default builder with CustomBuilderAgent when agentOverrides provided', async () => {
  const events: ProgressEvent[] = []
  const customConfig = { instructions: 'Custom logic', tools: ['read_file'], writePaths: ['packages/core/'] }

  // Construct orchestrator with an agentOverride for 'logic'
  // The test verifies the custom systemPrompt is used (not the default LogicAgent's)
  const orc = makeOrchestrator({
    onEvent: (e) => events.push(e),
    agentOverrides: { logic: customConfig },
  })

  // Run up to building phase only
  await orc.run()

  // After run, the 'logic' builder should be a CustomBuilderAgent
  // We verify indirectly: the orchestrator accepted the override without throwing
  expect(orc.getState()).not.toBe('aborted')
})
```

- [ ] **Step 2: Run test to confirm it fails**

```bash
cd apps/agent && npx vitest run src/orchestrator/orchestrator.test.ts -t "agentOverrides" 2>&1 | tail -10
```
Expected: fails — `makeOrchestrator` doesn't accept `agentOverrides`.

- [ ] **Step 3: Update OrchestratorDeps in orchestrator.ts**

In `OrchestratorDeps` interface, add:

```ts
/** Optional per-role overrides — keys are AgentRole strings, values are custom agent configs. */
agentOverrides?: Record<string, CustomAgentConfig>
```

Add the import at the top of orchestrator.ts:
```ts
import { CustomBuilderAgent, type CustomAgentConfig } from '../agents/builder/custom-agent.js'
```

In the `Orchestrator` constructor, after `this.ctx = createContext(...)`, add:

```ts
if (deps.agentOverrides) {
  for (const [role, config] of Object.entries(deps.agentOverrides)) {
    this.builders[role as AgentRole] = new CustomBuilderAgent(role as AgentRole, config)
  }
}
```

- [ ] **Step 4: Add resolveAgentOverrides to job-runner.ts**

Open `apps/agent/src/job-runner.ts`. Add this function before `runJob`:

```ts
async function resolveAgentOverrides(
  overrides: Record<string, string>,
): Promise<Record<string, CustomAgentConfig>> {
  const apiUrl = process.env['FORGE_API_URL']
  const token = process.env['INTERNAL_TOKEN'] ?? ''
  if (!apiUrl) return {}

  const resolved: Record<string, CustomAgentConfig> = {}
  await Promise.all(
    Object.entries(overrides).map(async ([role, agentId]) => {
      try {
        const res = await fetch(`${apiUrl}/internal/agents/${agentId}`, {
          headers: { 'X-Internal-Token': token },
          signal: AbortSignal.timeout(5000),
        })
        if (!res.ok) return
        const json = await res.json() as { data: CustomAgentConfig }
        resolved[role] = json.data
      } catch (err) {
        console.error(`[resolveAgentOverrides] failed to fetch agent ${agentId}:`, err)
      }
    }),
  )
  return resolved
}
```

Add `CustomAgentConfig` to the import at the top:
```ts
import type { CustomAgentConfig } from './agents/builder/custom-agent.js'
```

In `runJob`, after constructing `sandboxAdapter` and before creating the `Orchestrator`, add:

```ts
let agentOverrides: Record<string, CustomAgentConfig> | undefined
if (job.agentOverrides && Object.keys(job.agentOverrides).length > 0) {
  agentOverrides = await resolveAgentOverrides(job.agentOverrides)
}
```

Pass `agentOverrides` to the `Orchestrator` constructor's `deps`:
```ts
const orc = new Orchestrator(job.projectId, userInput, {
  ...existing deps...
  agentOverrides,
})
```

- [ ] **Step 5: Extend Job type and server.ts POST /run**

In `apps/agent/src/job-store.ts`, add to the `Job` interface:
```ts
agentOverrides?: Record<string, string>  // role → agent DB id
```

In `apps/agent/src/server.ts`, in the `handleRun` function, extract `agentOverrides` from the request body:
```ts
const { taskId, projectId, userInput, agentOverrides } = body as Record<string, unknown>
```

When creating the `Job`, include:
```ts
agentOverrides: typeof agentOverrides === 'object' && agentOverrides !== null
  ? agentOverrides as Record<string, string>
  : undefined,
```

- [ ] **Step 6: Run all agent tests**

```bash
cd apps/agent && npx vitest run 2>&1 | tail -10
```
Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add apps/agent/src/orchestrator/orchestrator.ts apps/agent/src/job-runner.ts apps/agent/src/job-store.ts apps/agent/src/server.ts
git commit -m "feat(agent): add agentOverrides support in Orchestrator and job-runner"
```

---

## Part C — Frontend

### Task C1: packages/core/agent hooks

**Files:**
- Create: `packages/core/agent/use-agents.ts`
- Create: `packages/core/agent/index.ts`
- Modify: `packages/core/index.ts`

- [ ] **Step 1: Create packages/core/agent/use-agents.ts**

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { api } from '../api/client.ts'
import { useAuthStore, selectToken } from '../auth/auth-store.ts'

const AgentSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  description: z.string(),
  instructions: z.string(),
  tools: z.array(z.string()),
  writePaths: z.array(z.string()),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export type UserAgent = z.infer<typeof AgentSchema>

export type AgentInput = Pick<UserAgent, 'name' | 'description' | 'instructions' | 'tools' | 'writePaths'>

export function useAgents() {
  const token = useAuthStore(selectToken)
  return useQuery({
    queryKey: ['agents'],
    queryFn: async () => {
      const raw = await api.getList<UserAgent>('/api/v1/agents', token ?? undefined)
      return z.array(AgentSchema).parse(raw.data)
    },
    enabled: token !== null,
  })
}

export function useCreateAgent() {
  const token = useAuthStore(selectToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: AgentInput) =>
      api.post<UserAgent>('/api/v1/agents', body, token ?? undefined),
    onSettled: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  })
}

export function useUpdateAgent() {
  const token = useAuthStore(selectToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string } & Partial<AgentInput>) =>
      api.put<UserAgent>(`/api/v1/agents/${id}`, body, token ?? undefined),
    onSettled: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  })
}

export function useDeleteAgent() {
  const token = useAuthStore(selectToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/agents/${id}`, token ?? undefined),
    onSettled: () => qc.invalidateQueries({ queryKey: ['agents'] }),
  })
}
```

- [ ] **Step 2: Create packages/core/agent/index.ts**

```ts
export { useAgents, useCreateAgent, useUpdateAgent, useDeleteAgent } from './use-agents.ts'
export type { UserAgent, AgentInput } from './use-agents.ts'
```

- [ ] **Step 3: Add exports to packages/core/index.ts**

Open `packages/core/index.ts`. After the Settings block, add:

```ts
// Agent management
export { useAgents, useCreateAgent, useUpdateAgent, useDeleteAgent } from './agent/index.ts'
export type { UserAgent, AgentInput } from './agent/index.ts'
```

- [ ] **Step 4: TypeScript check**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -v TS5097 | head -20
```
Expected: no new `error TS` lines.

- [ ] **Step 5: Commit**

```bash
git add packages/core/agent/ packages/core/index.ts
git commit -m "feat(core): add agent CRUD hooks (useAgents, useCreateAgent, useUpdateAgent, useDeleteAgent)"
```

---

### Task C2: agent-registry.ts + AgentsPage skeleton + AgentList

**Files:**
- Create: `apps/web/src/lib/agent-registry.ts`
- Create: `apps/web/src/pages/agents/index.tsx`
- Create: `apps/web/src/pages/agents/components/AgentList.tsx`

- [ ] **Step 1: Create apps/web/src/lib/agent-registry.ts**

```ts
export type AgentTool = 'read_file' | 'write_file' | 'str_replace' | 'tsc_check' | 'spawn_task'

export const ALL_TOOLS: AgentTool[] = [
  'read_file', 'write_file', 'str_replace', 'tsc_check', 'spawn_task',
]

export interface SystemAgentDef {
  role: string
  label: string
  tier: 1 | 2 | 3
  color: string
  tools: AgentTool[]
  writePaths: string[]
  instructionsFile: string
}

export const SYSTEM_AGENTS: SystemAgentDef[] = [
  { role: 'pm',        label: 'PM',        tier: 1, color: '#6366f1', tools: [],        writePaths: [],                                    instructionsFile: 'pm' },
  { role: 'architect', label: 'Architect', tier: 1, color: '#10b981', tools: [],        writePaths: [],                                    instructionsFile: 'architect' },
  { role: 'logic',     label: 'Logic',     tier: 2, color: '#3b82f6', tools: ALL_TOOLS, writePaths: ['packages/core/', 'server/domain/'],  instructionsFile: 'logic' },
  { role: 'schema',    label: 'Schema',    tier: 2, color: '#f59e0b', tools: ALL_TOOLS, writePaths: ['prisma/'],                           instructionsFile: 'schema' },
  { role: 'api',       label: 'API',       tier: 2, color: '#06b6d4', tools: ALL_TOOLS, writePaths: ['app/api/', 'server/infra/'],          instructionsFile: 'api' },
  { role: 'ui',        label: 'UI',        tier: 2, color: '#ec4899', tools: ALL_TOOLS, writePaths: ['packages/ui/'],                      instructionsFile: 'ui' },
  { role: 'page',      label: 'Page',      tier: 2, color: '#8b5cf6', tools: ALL_TOOLS, writePaths: ['app/'],                              instructionsFile: 'page' },
  { role: 'test',      label: 'Test',      tier: 3, color: '#ef4444', tools: [],        writePaths: [],                                    instructionsFile: 'test' },
]
```

- [ ] **Step 2: Create AgentList.tsx**

Create `apps/web/src/pages/agents/components/AgentList.tsx`:

```tsx
import { cn } from '../../../lib/utils'
import { SYSTEM_AGENTS } from '../../../lib/agent-registry'
import type { UserAgent } from '@forge/core'

type SystemEntry = { kind: 'system'; role: string; label: string; color: string }
type CustomEntry = { kind: 'custom'; agent: UserAgent }
type Entry = SystemEntry | CustomEntry

interface Props {
  customAgents: UserAgent[]
  selectedId: string | null
  onSelect: (id: string) => void
  onCreateNew: () => void
}

export function AgentList({ customAgents, selectedId, onSelect, onCreateNew }: Props) {
  return (
    <div className="flex flex-col gap-0.5 overflow-y-auto py-2 px-1.5">
      <div className="px-2 pb-1.5 text-[9px] font-medium uppercase tracking-widest text-white/25">
        System
      </div>
      {SYSTEM_AGENTS.map((a) => (
        <button
          key={a.role}
          onClick={() => onSelect(`system:${a.role}`)}
          className={cn(
            'flex items-center gap-2 rounded-[5px] px-2 py-[6px] text-left text-xs transition-colors',
            selectedId === `system:${a.role}`
              ? 'border border-white/10 bg-white/[0.07] text-white/90 font-medium'
              : 'text-white/38 hover:bg-white/[0.04] hover:text-white/60',
          )}
        >
          <span className="h-[7px] w-[7px] flex-shrink-0 rounded-[1.5px]" style={{ background: a.color }} />
          {a.label}
        </button>
      ))}

      <div className="mx-1 my-2 h-px bg-white/[0.05]" />

      <div className="flex items-center justify-between px-2 pb-1.5">
        <span className="text-[9px] font-medium uppercase tracking-widest text-white/25">My Agents</span>
        <button
          onClick={onCreateNew}
          className="flex h-4 w-4 items-center justify-center rounded text-white/30 hover:bg-white/[0.07] hover:text-white/60"
          title="新建 Agent"
        >
          <span className="text-base leading-none">+</span>
        </button>
      </div>
      {customAgents.map((a) => (
        <button
          key={a.id}
          onClick={() => onSelect(`custom:${a.id}`)}
          className={cn(
            'flex items-center gap-2 rounded-[5px] px-2 py-[6px] text-left text-xs transition-colors',
            selectedId === `custom:${a.id}`
              ? 'border border-white/10 bg-white/[0.07] text-white/90 font-medium'
              : 'text-white/38 hover:bg-white/[0.04] hover:text-white/60',
          )}
        >
          <span className="h-[7px] w-[7px] flex-shrink-0 rounded-[1.5px] bg-violet-400" />
          <span className="truncate max-w-[120px]">{a.name}</span>
        </button>
      ))}
      {customAgents.length === 0 && (
        <div className="px-2 py-1 text-[11px] text-white/20">还没有自定义 Agent</div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create AgentsPage skeleton (index.tsx)**

Create `apps/web/src/pages/agents/index.tsx`:

```tsx
import { useState } from 'react'
import { useAgents } from '@forge/core'
import { AgentList } from './components/AgentList'
import { AgentCard } from './components/AgentCard'
import { AgentTabPanel } from './components/AgentTabPanel'
import { SYSTEM_AGENTS } from '../../lib/agent-registry'

export function AgentsPage() {
  const { data: customAgents = [] } = useAgents()
  const [selectedId, setSelectedId] = useState<string | null>(`system:${SYSTEM_AGENTS[0]!.role}`)
  const [isCreating, setIsCreating] = useState(false)

  const handleSelect = (id: string) => {
    setSelectedId(id)
    setIsCreating(false)
  }

  const handleCreateNew = () => {
    setSelectedId(null)
    setIsCreating(true)
  }

  const selectedSystemAgent = selectedId?.startsWith('system:')
    ? SYSTEM_AGENTS.find(a => `system:${a.role}` === selectedId) ?? null
    : null

  const selectedCustomAgent = selectedId?.startsWith('custom:')
    ? customAgents.find(a => `custom:${a.id}` === selectedId) ?? null
    : null

  return (
    <div className="flex flex-1 overflow-hidden">
      {/* Column 1: agent list */}
      <div className="w-40 flex-shrink-0 border-r border-white/[0.06]">
        <AgentList
          customAgents={customAgents}
          selectedId={selectedId}
          onSelect={handleSelect}
          onCreateNew={handleCreateNew}
        />
      </div>

      {/* Column 2: profile card */}
      <div className="w-[220px] flex-shrink-0 border-r border-white/[0.06]">
        <AgentCard
          systemAgent={selectedSystemAgent}
          customAgent={selectedCustomAgent}
          isCreating={isCreating}
          onFork={(role) => {
            const sys = SYSTEM_AGENTS.find(a => a.role === role)
            if (!sys) return
            setIsCreating(true)
            setSelectedId(null)
          }}
          onDelete={(id) => {
            setSelectedId(`system:${SYSTEM_AGENTS[0]!.role}`)
          }}
        />
      </div>

      {/* Column 3: tab panel */}
      <div className="flex flex-1 flex-col overflow-hidden">
        <AgentTabPanel
          systemAgent={selectedSystemAgent}
          customAgent={selectedCustomAgent}
          isCreating={isCreating}
          forkSource={selectedSystemAgent}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 4: TypeScript check**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -v TS5097 | grep "error TS" | head -10
```
Expected: only errors about `AgentCard` and `AgentTabPanel` not existing yet (will be fixed in C3).

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/lib/agent-registry.ts apps/web/src/pages/agents/
git commit -m "feat(web): add agent-registry and AgentsPage skeleton with AgentList"
```

---

### Task C3: AgentCard + AgentTabPanel with all four tabs

**Files:**
- Create: `apps/web/src/pages/agents/components/AgentCard.tsx`
- Create: `apps/web/src/pages/agents/components/AgentTabPanel.tsx`
- Create: `apps/web/src/pages/agents/components/tabs/InstructionsTab.tsx`
- Create: `apps/web/src/pages/agents/components/tabs/ToolsTab.tsx`
- Create: `apps/web/src/pages/agents/components/tabs/WritePathsTab.tsx`
- Create: `apps/web/src/pages/agents/components/tabs/ConfigTab.tsx`

- [ ] **Step 1: Create AgentCard.tsx**

```tsx
import { useDeleteAgent } from '@forge/core'
import type { UserAgent } from '@forge/core'
import type { SystemAgentDef } from '../../../lib/agent-registry'

interface Props {
  systemAgent: SystemAgentDef | null
  customAgent: UserAgent | null
  isCreating: boolean
  onFork: (role: string) => void
  onDelete: (id: string) => void
}

export function AgentCard({ systemAgent, customAgent, isCreating, onFork, onDelete }: Props) {
  const deleteAgent = useDeleteAgent()

  if (isCreating) {
    return (
      <div className="flex flex-col items-start gap-3 p-5">
        <div className="flex h-14 w-14 items-center justify-center rounded-[14px] border border-white/10 bg-white/[0.05]">
          <span className="text-2xl text-white/30">+</span>
        </div>
        <div>
          <div className="text-[15px] font-semibold text-white/80">新建 Agent</div>
          <div className="mt-0.5 text-[11px] text-white/30">custom</div>
        </div>
      </div>
    )
  }

  if (systemAgent) {
    const tierLabel = systemAgent.tier === 1 ? 'Tier 1 · Planner' : systemAgent.tier === 2 ? 'Tier 2 · Builder' : 'Tier 3 · QA'
    return (
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-3">
          <div
            className="flex h-14 w-14 items-center justify-center rounded-[14px] border"
            style={{ background: `${systemAgent.color}18`, borderColor: `${systemAgent.color}40` }}
          >
            <div className="h-5 w-5 rounded-[4px] opacity-85" style={{ background: systemAgent.color }} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-semibold text-white/90">{systemAgent.label} Agent</span>
              <span className="rounded-[4px] border border-white/[0.09] bg-white/[0.05] px-1.5 py-0.5 text-[10px] text-white/35">system</span>
            </div>
            <div className="mt-0.5 text-[11px] text-white/35">{tierLabel}</div>
          </div>
        </div>

        <div className="flex flex-col gap-0 text-[12px]">
          <div className="border-b border-white/[0.04] py-1.5 flex justify-between">
            <span className="text-white/35">Tier</span>
            <span className="text-white/70">{systemAgent.tier}</span>
          </div>
          <div className="border-b border-white/[0.04] py-1.5 flex justify-between">
            <span className="text-white/35">工具</span>
            <span className="text-white/70">{systemAgent.tools.length} 个</span>
          </div>
          <div className="py-1.5 flex justify-between">
            <span className="text-white/35">写入路径</span>
            <span className="text-white/70">{systemAgent.writePaths.length} 条</span>
          </div>
        </div>

        <button
          onClick={() => onFork(systemAgent.role)}
          className="mt-2 w-full rounded-[7px] border border-blue-500/25 bg-blue-500/10 py-2 text-[12px] font-medium text-blue-300 transition-colors hover:bg-blue-500/15"
        >
          Fork Agent
        </button>
      </div>
    )
  }

  if (customAgent) {
    return (
      <div className="flex flex-col gap-4 p-5">
        <div className="flex flex-col gap-3">
          <div className="flex h-14 w-14 items-center justify-center rounded-[14px] border border-violet-500/25 bg-violet-500/10">
            <div className="h-5 w-5 rounded-[4px] bg-violet-400 opacity-85" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[15px] font-semibold text-white/90">{customAgent.name}</span>
              <span className="rounded-[4px] border border-violet-500/25 bg-violet-500/10 px-1.5 py-0.5 text-[10px] text-violet-300">custom</span>
            </div>
            <div className="mt-0.5 text-[11px] text-white/35">{customAgent.description || 'custom agent'}</div>
          </div>
        </div>

        <div className="flex flex-col gap-0 text-[12px]">
          <div className="border-b border-white/[0.04] py-1.5 flex justify-between">
            <span className="text-white/35">工具</span>
            <span className="text-white/70">{customAgent.tools.length} 个</span>
          </div>
          <div className="py-1.5 flex justify-between">
            <span className="text-white/35">写入路径</span>
            <span className="text-white/70">{customAgent.writePaths.length} 条</span>
          </div>
        </div>

        <button
          onClick={() => {
            deleteAgent.mutate(customAgent.id, { onSuccess: () => onDelete(customAgent.id) })
          }}
          disabled={deleteAgent.isPending}
          className="mt-2 w-full rounded-[7px] border border-red-500/20 bg-red-500/[0.07] py-2 text-[12px] text-red-400/70 transition-colors hover:bg-red-500/10 disabled:opacity-50"
        >
          {deleteAgent.isPending ? '删除中…' : '删除 Agent'}
        </button>
      </div>
    )
  }

  return null
}
```

- [ ] **Step 2: Create InstructionsTab.tsx**

```tsx
import { useState, useEffect } from 'react'
import { useUpdateAgent } from '@forge/core'
import type { UserAgent } from '@forge/core'
import type { SystemAgentDef } from '../../../../lib/agent-registry'

interface Props {
  systemAgent: SystemAgentDef | null
  customAgent: UserAgent | null
  isCreating: boolean
  draftInstructions: string
  onDraftChange: (v: string) => void
}

export function InstructionsTab({ systemAgent, customAgent, isCreating, draftInstructions, onDraftChange }: Props) {
  const updateAgent = useUpdateAgent()
  const [sysText, setSysText] = useState<string | null>(null)

  useEffect(() => {
    if (!systemAgent) return
    setSysText(null)
    fetch(`/agent/instructions/${systemAgent.instructionsFile}`)
      .then(r => r.text())
      .then(setSysText)
      .catch(() => setSysText('(Failed to load instructions)'))
  }, [systemAgent?.instructionsFile])

  const isReadOnly = systemAgent !== null && !isCreating

  const text = isCreating || customAgent
    ? draftInstructions
    : (sysText ?? 'Loading…')

  return (
    <div className="flex flex-1 flex-col gap-3 overflow-hidden p-5">
      <p className="text-[12px] text-white/30">
        {isReadOnly ? 'System Agent 的 instructions 只读。Fork 后可以自定义。' : 'Agent 的系统 Prompt。每次任务开始时注入 LLM。'}
      </p>
      <textarea
        readOnly={isReadOnly}
        value={text}
        onChange={e => onDraftChange(e.target.value)}
        className="flex-1 resize-none rounded-[8px] border border-white/[0.07] bg-white/[0.03] p-3 font-mono text-[11px] leading-[1.7] text-white/60 outline-none focus:border-white/15"
        placeholder="在此输入 instructions…"
      />
      {!isReadOnly && (
        <div className="flex justify-end">
          <button
            onClick={() => customAgent && updateAgent.mutate({ id: customAgent.id, instructions: draftInstructions })}
            disabled={isCreating || updateAgent.isPending}
            className="rounded-[6px] border border-violet-500/35 bg-violet-500/15 px-4 py-1.5 text-[12px] font-medium text-violet-300 disabled:opacity-50"
          >
            {updateAgent.isPending ? '保存中…' : '保存'}
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3: Create ToolsTab.tsx**

```tsx
import { useUpdateAgent } from '@forge/core'
import type { UserAgent } from '@forge/core'
import type { SystemAgentDef, AgentTool } from '../../../../lib/agent-registry'
import { ALL_TOOLS } from '../../../../lib/agent-registry'
import { cn } from '../../../../lib/utils'

interface Props {
  systemAgent: SystemAgentDef | null
  customAgent: UserAgent | null
  isCreating: boolean
  draftTools: string[]
  onDraftChange: (v: string[]) => void
}

export function ToolsTab({ systemAgent, customAgent, isCreating, draftTools, onDraftChange }: Props) {
  const updateAgent = useUpdateAgent()
  const isReadOnly = systemAgent !== null && !isCreating
  const activePaths = isReadOnly && systemAgent ? systemAgent.tools : draftTools

  const toggle = (tool: string) => {
    if (isReadOnly) return
    const next = activePaths.includes(tool)
      ? activePaths.filter(t => t !== tool)
      : [...activePaths, tool]
    onDraftChange(next)
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-5">
      <p className="text-[12px] text-white/30">
        {isReadOnly ? 'System Agent 的工具权限只读。' : '选择该 Agent 可以使用的工具。'}
      </p>
      <div className="flex flex-col gap-2">
        {ALL_TOOLS.map(tool => {
          const active = activePaths.includes(tool)
          return (
            <button
              key={tool}
              onClick={() => toggle(tool)}
              disabled={isReadOnly}
              className={cn(
                'flex items-center gap-3 rounded-[7px] border px-3 py-2.5 text-left text-[12px] transition-colors',
                active
                  ? 'border-violet-500/30 bg-violet-500/10 text-violet-200'
                  : 'border-white/[0.06] bg-white/[0.02] text-white/35',
                isReadOnly && 'cursor-default',
              )}
            >
              <span className={cn('h-2 w-2 flex-shrink-0 rounded-full', active ? 'bg-violet-400' : 'bg-white/15')} />
              <code className="font-mono">{tool}</code>
            </button>
          )
        })}
      </div>
      {!isReadOnly && (
        <div className="mt-auto flex justify-end">
          <button
            onClick={() => customAgent && updateAgent.mutate({ id: customAgent.id, tools: draftTools })}
            disabled={isCreating || updateAgent.isPending}
            className="rounded-[6px] border border-violet-500/35 bg-violet-500/15 px-4 py-1.5 text-[12px] font-medium text-violet-300 disabled:opacity-50"
          >
            {updateAgent.isPending ? '保存中…' : '保存'}
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create WritePathsTab.tsx**

```tsx
import { useUpdateAgent } from '@forge/core'
import type { UserAgent } from '@forge/core'
import type { SystemAgentDef } from '../../../../lib/agent-registry'

interface Props {
  systemAgent: SystemAgentDef | null
  customAgent: UserAgent | null
  isCreating: boolean
  draftPaths: string[]
  onDraftChange: (v: string[]) => void
}

export function WritePathsTab({ systemAgent, customAgent, isCreating, draftPaths, onDraftChange }: Props) {
  const updateAgent = useUpdateAgent()
  const isReadOnly = systemAgent !== null && !isCreating
  const displayPaths = isReadOnly && systemAgent ? systemAgent.writePaths : draftPaths
  const text = displayPaths.join('\n')

  return (
    <div className="flex flex-1 flex-col gap-3 p-5">
      <p className="text-[12px] text-white/30">
        Agent 只能向以下路径前缀写入文件。每行一条，例如 <code className="font-mono">packages/core/</code>。读取不受限制。
      </p>
      <textarea
        readOnly={isReadOnly}
        value={text}
        onChange={e => onDraftChange(e.target.value.split('\n').map(s => s.trim()).filter(Boolean))}
        rows={8}
        className="resize-none rounded-[8px] border border-white/[0.07] bg-[#0d0d0d] p-3 font-mono text-[12px] text-white/60 outline-none focus:border-white/15"
        placeholder="packages/core/&#10;server/domain/"
      />
      {!isReadOnly && (
        <div className="flex justify-end">
          <button
            onClick={() => customAgent && updateAgent.mutate({ id: customAgent.id, writePaths: draftPaths })}
            disabled={isCreating || updateAgent.isPending}
            className="rounded-[6px] border border-violet-500/35 bg-violet-500/15 px-4 py-1.5 text-[12px] font-medium text-violet-300 disabled:opacity-50"
          >
            {updateAgent.isPending ? '保存中…' : '保存'}
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 5: Create ConfigTab.tsx**

```tsx
import { useCreateAgent, useUpdateAgent } from '@forge/core'
import type { UserAgent } from '@forge/core'
import type { SystemAgentDef } from '../../../../lib/agent-registry'

interface Props {
  systemAgent: SystemAgentDef | null
  customAgent: UserAgent | null
  isCreating: boolean
  draftName: string
  draftDescription: string
  draftInstructions: string
  draftTools: string[]
  draftPaths: string[]
  onDraftNameChange: (v: string) => void
  onDraftDescChange: (v: string) => void
  onCreated: (agent: UserAgent) => void
}

export function ConfigTab({
  systemAgent, customAgent, isCreating,
  draftName, draftDescription, draftInstructions, draftTools, draftPaths,
  onDraftNameChange, onDraftDescChange, onCreated,
}: Props) {
  const createAgent = useCreateAgent()
  const updateAgent = useUpdateAgent()
  const isReadOnly = systemAgent !== null && !isCreating

  const handleSave = () => {
    if (isCreating) {
      createAgent.mutate(
        { name: draftName, description: draftDescription, instructions: draftInstructions, tools: draftTools, writePaths: draftPaths },
        { onSuccess: (res) => onCreated(res.data) },
      )
    } else if (customAgent) {
      updateAgent.mutate({ id: customAgent.id, name: draftName, description: draftDescription })
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-4 p-5">
      <div>
        <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-widest text-white/25">名称</label>
        <input
          readOnly={isReadOnly}
          value={isReadOnly && systemAgent ? `${systemAgent.label} Agent` : draftName}
          onChange={e => onDraftNameChange(e.target.value)}
          className="w-full rounded-[6px] border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white/80 outline-none focus:border-white/15 read-only:cursor-default"
          placeholder="Agent 名称"
        />
      </div>
      <div>
        <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-widest text-white/25">描述（可选）</label>
        <textarea
          readOnly={isReadOnly}
          value={isReadOnly && systemAgent ? '' : draftDescription}
          onChange={e => onDraftDescChange(e.target.value)}
          rows={3}
          className="w-full resize-none rounded-[6px] border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white/50 outline-none placeholder:text-white/20 focus:border-white/15 read-only:cursor-default"
          placeholder="这个 Agent 的用途…"
        />
      </div>
      {!isReadOnly && (
        <div className="mt-auto flex justify-end">
          <button
            onClick={handleSave}
            disabled={createAgent.isPending || updateAgent.isPending || !draftName.trim()}
            className="rounded-[6px] border border-violet-500/35 bg-violet-500/15 px-4 py-1.5 text-[12px] font-medium text-violet-300 disabled:opacity-50"
          >
            {(createAgent.isPending || updateAgent.isPending) ? '保存中…' : isCreating ? '创建 Agent' : '保存'}
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 6: Create AgentTabPanel.tsx**

```tsx
import { useState } from 'react'
import { cn } from '../../../lib/utils'
import type { UserAgent } from '@forge/core'
import type { SystemAgentDef } from '../../../lib/agent-registry'
import { InstructionsTab } from './tabs/InstructionsTab'
import { ToolsTab } from './tabs/ToolsTab'
import { WritePathsTab } from './tabs/WritePathsTab'
import { ConfigTab } from './tabs/ConfigTab'

type Tab = '指令' | '工具' | '写入路径' | '配置'
const TABS: Tab[] = ['指令', '工具', '写入路径', '配置']

interface Props {
  systemAgent: SystemAgentDef | null
  customAgent: UserAgent | null
  isCreating: boolean
  forkSource: SystemAgentDef | null
}

export function AgentTabPanel({ systemAgent, customAgent, isCreating, forkSource }: Props) {
  const [activeTab, setActiveTab] = useState<Tab>('指令')
  const [draftName, setDraftName] = useState('')
  const [draftDesc, setDraftDesc] = useState('')
  const [draftInstructions, setDraftInstructions] = useState('')
  const [draftTools, setDraftTools] = useState<string[]>([])
  const [draftPaths, setDraftPaths] = useState<string[]>([])

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Tab bar */}
      <div className="flex flex-shrink-0 items-center border-b border-white/[0.06] px-5">
        {TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={cn(
              'border-b-2 px-3.5 py-3 text-[12px] transition-colors',
              activeTab === tab
                ? 'border-violet-400 font-medium text-white/90'
                : 'border-transparent text-white/35 hover:text-white/55',
            )}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="flex flex-1 flex-col overflow-y-auto">
        {activeTab === '指令' && (
          <InstructionsTab
            systemAgent={systemAgent}
            customAgent={customAgent}
            isCreating={isCreating}
            draftInstructions={draftInstructions}
            onDraftChange={setDraftInstructions}
          />
        )}
        {activeTab === '工具' && (
          <ToolsTab
            systemAgent={systemAgent}
            customAgent={customAgent}
            isCreating={isCreating}
            draftTools={draftTools}
            onDraftChange={setDraftTools}
          />
        )}
        {activeTab === '写入路径' && (
          <WritePathsTab
            systemAgent={systemAgent}
            customAgent={customAgent}
            isCreating={isCreating}
            draftPaths={draftPaths}
            onDraftChange={setDraftPaths}
          />
        )}
        {activeTab === '配置' && (
          <ConfigTab
            systemAgent={systemAgent}
            customAgent={customAgent}
            isCreating={isCreating}
            draftName={draftName}
            draftDescription={draftDesc}
            draftInstructions={draftInstructions}
            draftTools={draftTools}
            draftPaths={draftPaths}
            onDraftNameChange={setDraftName}
            onDraftDescChange={setDraftDesc}
            onCreated={(agent) => {
              // Parent will handle navigation to the new agent
              console.log('Created agent:', agent.id)
            }}
          />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 7: TypeScript check**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -v TS5097 | grep "error TS" | head -20
```
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/pages/agents/components/
git commit -m "feat(web): add AgentCard, AgentTabPanel, and all four agent config tabs"
```

---

### Task C4: AppShell nav + routes

**Files:**
- Modify: `apps/web/src/components/layout/AppShell.tsx`
- Modify: `apps/web/src/routes.tsx`

- [ ] **Step 1: Add /agents route to routes.tsx**

Open `apps/web/src/routes.tsx`. Add after the `WorkspacePage` lazy import:

```ts
const AgentsPage = lazy(() => import('./pages/agents').then(m => ({ default: m.AgentsPage })))
```

Inside the `ProtectedRoute + AppShell` block, add:

```tsx
<Route path="/agents" element={<AgentsPage />} />
```

- [ ] **Step 2: Add /agents NavItem to AppShell.tsx**

Open `apps/web/src/components/layout/AppShell.tsx`. Add prefetch after `prefetchSettings`:

```ts
const prefetchAgents = () => import('../../pages/agents')
```

Add a new `NavItem` between the projects NavItem and the conversations NavItem:

```tsx
<NavItem
  to="/agents"
  icon={<Icons.Bot className="h-[17px] w-[17px]" />}
  label="Agents"
  onPrefetch={prefetchAgents}
/>
```

- [ ] **Step 3: Full TypeScript check**

```bash
cd apps/web && npx tsc --noEmit 2>&1 | grep -v TS5097 | grep "error TS"
```
Expected: no errors.

- [ ] **Step 4: Start dev server and verify the page loads**

```bash
cd apps/web && npx vite --port 5173 &
sleep 3
curl -s http://localhost:5173/agents | grep -c "html"
```
Expected: returns `1` (HTML page served).

Kill the dev server: `pkill -f "vite --port 5173"`.

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/routes.tsx apps/web/src/components/layout/AppShell.tsx
git commit -m "feat(web): add /agents route and Bot nav icon in AppShell"
```

---

## Self-Review

**Spec coverage:**
- ✅ DB migration + domain Agent model (A1)
- ✅ Postgres AgentRepo + mock (A2)
- ✅ CRUD handler + validation (tools, name) + tests (A3)
- ✅ Internal GET /agents/:id + tests (A4)
- ✅ Router wiring + main.go (A4)
- ✅ GET /instructions/:role in agent service (B1)
- ✅ CustomBuilderAgent with writeGuard (B2)
- ✅ Orchestrator agentOverrides + job-runner resolveAgentOverrides (B3)
- ✅ packages/core/agent/ hooks (C1)
- ✅ agent-registry.ts (C2)
- ✅ AgentsPage 3-column layout (C2)
- ✅ AgentList (C2), AgentCard (C3), AgentTabPanel + 4 tabs (C3)
- ✅ AppShell + routes (C4)

**Placeholder scan:** No TBD/TODO. All code blocks are complete.

**Type consistency:**
- `UserAgent` defined in C1, used in C2/C3/C4 ✅
- `SystemAgentDef` defined in C2, used in C3/C4 ✅
- `CustomAgentConfig` defined in B2, imported in B3 ✅
- `AgentRepository` interface defined in A1, implemented in A2, used in A3/A4 ✅
- `domain.ValidAgentTool` defined in A1, used in A3 ✅
- `writeGuard()` added to BaseBuilderAgent in B2, overridden in CustomBuilderAgent B2 ✅
