# Knowledge System V2 — Go API Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `workspace_kb` + `project_context_sections` with a single unified `project_kb` table. Add typed CRUD endpoints scoped to projects. Add file/URL ingest endpoint. Migrate existing data.

**Architecture:** Single migration creates `project_kb` and migrates data from both old tables. New domain type `ProjectKBEntry` replaces `WorkspaceKBEntry` and `ProjectContextSection`. New `ProjectKBHandler` handles project-scoped CRUD. `InternalHandler` gets new KB methods using the new repo. Old KB handlers and repos are removed.

**Tech Stack:** Go, pgx/v5, chi, existing handler/repo patterns.

---

## File Map

```
Created:
  apps/api/migrations/008_project_kb.sql
  apps/api/domain/project_kb.go
  apps/api/infra/postgres/project_kb_repo.go
  apps/api/infra/mock/project_kb_repo.go
  apps/api/api/handler/project_kb.go
  apps/api/api/handler/project_kb_test.go

Modified:
  apps/api/domain/repository.go        — add ProjectKBRepository, remove WorkspaceKBRepository + ProjectContextRepository
  apps/api/api/handler/internal.go     — replace SearchKB/CreateKBEntry with new project-scoped methods
  apps/api/api/handler/internal_test.go
  apps/api/api/router.go               — add /projects/:id/kb routes, update /internal/kb
  apps/api/cmd/server/main.go          — wire new repo, remove old repos

Removed (after migration):
  apps/api/infra/postgres/workspace_kb_repo.go
  apps/api/infra/mock/workspace_kb_repo.go
  apps/api/infra/postgres/project_context_repo.go
  apps/api/infra/mock/project_context_repo.go
  apps/api/api/handler/workspace_kb.go
  apps/api/api/handler/workspace_kb_test.go
```

---

## Task K1: Migration + domain model + repository interface

**Files:**
- Create: `apps/api/migrations/008_project_kb.sql`
- Create: `apps/api/domain/project_kb.go`
- Modify: `apps/api/domain/repository.go`

- [ ] **Step 1: Create migration**

```sql
-- apps/api/migrations/008_project_kb.sql
CREATE TABLE IF NOT EXISTS project_kb (
  id           TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id   TEXT        REFERENCES projects(id) ON DELETE CASCADE,
  user_id      TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_global    BOOLEAN     NOT NULL DEFAULT false,
  type         TEXT        NOT NULL DEFAULT 'spec',
  title        TEXT        NOT NULL,
  content      TEXT        NOT NULL,
  tags         TEXT[]      NOT NULL DEFAULT '{}',
  input_type   TEXT        NOT NULL DEFAULT 'text',
  source_ref   TEXT        NOT NULL DEFAULT '',
  source_agent TEXT        NOT NULL DEFAULT '',
  source_task  TEXT        NOT NULL DEFAULT '',
  status       TEXT        NOT NULL DEFAULT 'pending',
  confidence   FLOAT       NOT NULL DEFAULT 0.8,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_kb_project_id_idx ON project_kb(project_id);
CREATE INDEX IF NOT EXISTS project_kb_user_id_idx    ON project_kb(user_id);
CREATE INDEX IF NOT EXISTS project_kb_type_idx       ON project_kb(type);
CREATE INDEX IF NOT EXISTS project_kb_status_idx     ON project_kb(status);
CREATE INDEX IF NOT EXISTS project_kb_tags_idx       ON project_kb USING GIN(tags);

-- Migrate workspace_kb → project_kb (global specs)
INSERT INTO project_kb (id, user_id, is_global, type, title, content, tags,
                        source_agent, source_task, status, confidence, created_at, updated_at)
SELECT id, user_id, true, 'spec', title, content, tags,
       source_agent, source_task,
       CASE WHEN verified THEN 'verified' ELSE 'pending' END,
       confidence, created_at, updated_at
FROM workspace_kb
ON CONFLICT (id) DO NOTHING;

-- Migrate project_context_sections → project_kb
INSERT INTO project_kb (project_id, user_id, is_global, type, title, content,
                        source_agent, source_task, status, confidence, created_at, updated_at)
SELECT pcs.project_id, p.user_id, false, 'spec', pcs.heading, pcs.content,
       pcs.agent_role, pcs.task_id, 'verified', 1.0, pcs.created_at, pcs.updated_at
FROM project_context_sections pcs
JOIN projects p ON p.id = pcs.project_id
ON CONFLICT DO NOTHING;
```

- [ ] **Step 2: Create domain/project_kb.go**

```go
package domain

import "time"

type ProjectKBEntry struct {
	ID          string     `json:"id"`
	ProjectID   *string    `json:"projectId"`   // nil = global
	UserID      string     `json:"userId"`
	IsGlobal    bool       `json:"isGlobal"`
	Type        string     `json:"type"`        // principle | spec | test_asset | past_output
	Title       string     `json:"title"`
	Content     string     `json:"content"`
	Tags        []string   `json:"tags"`
	InputType   string     `json:"inputType"`   // text | url | file
	SourceRef   string     `json:"sourceRef"`
	SourceAgent string     `json:"sourceAgent"`
	SourceTask  string     `json:"taskId"`
	Status      string     `json:"status"`      // processing | pending | verified | deprecated
	Confidence  float64    `json:"confidence"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
}

var ValidKBTypes   = map[string]bool{"principle": true, "spec": true, "test_asset": true, "past_output": true}
var ValidKBStatus  = map[string]bool{"processing": true, "pending": true, "verified": true, "deprecated": true}
var ValidInputTypes = map[string]bool{"text": true, "url": true, "file": true}
```

- [ ] **Step 3: Update domain/repository.go**

Remove `WorkspaceKBRepository` and `ProjectContextRepository` interfaces.
Add `ProjectKBRepository`:

```go
type ProjectKBRepository interface {
	Create(ctx context.Context, e ProjectKBEntry) (ProjectKBEntry, error)
	GetByID(ctx context.Context, id string) (ProjectKBEntry, error)
	List(ctx context.Context, projectID, userID, entryType, status string) ([]ProjectKBEntry, error)
	Search(ctx context.Context, projectID, userID, query string, entryType string, limit int) ([]ProjectKBEntry, error)
	Update(ctx context.Context, e ProjectKBEntry) (ProjectKBEntry, error)
	SetStatus(ctx context.Context, id, userID, status string) (ProjectKBEntry, error)
	Delete(ctx context.Context, id, userID string) error
	UpdateContent(ctx context.Context, id, content, status string) error  // used by ingest job
}
```

- [ ] **Step 4: Build check**

```bash
cd /Users/cookie/project/forge/apps/api && go build ./...
```
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/api/migrations/008_project_kb.sql apps/api/domain/project_kb.go apps/api/domain/repository.go
git commit -m "feat(api): add project_kb table, domain model, migrate from workspace_kb + project_context_sections"
```

---

## Task K2: Postgres repo + mock

**Files:**
- Create: `apps/api/infra/postgres/project_kb_repo.go`
- Create: `apps/api/infra/mock/project_kb_repo.go`

- [ ] **Step 1: Create postgres/project_kb_repo.go**

```go
package postgres

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/forge-ai/forge/api/domain"
)

type projectKBRepo struct{ pool *pgxpool.Pool }

func NewProjectKBRepo(pool *pgxpool.Pool) domain.ProjectKBRepository {
	return &projectKBRepo{pool: pool}
}

const pkbSelect = `id, project_id, user_id, is_global, type, title, content, tags,
	input_type, source_ref, source_agent, source_task, status, confidence, created_at, updated_at`

func (r *projectKBRepo) Create(ctx context.Context, e domain.ProjectKBEntry) (domain.ProjectKBEntry, error) {
	q := fmt.Sprintf(`INSERT INTO project_kb
		(project_id, user_id, is_global, type, title, content, tags,
		 input_type, source_ref, source_agent, source_task, status, confidence)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
		RETURNING %s`, pkbSelect)
	row := r.pool.QueryRow(ctx, q,
		e.ProjectID, e.UserID, e.IsGlobal, e.Type, e.Title, e.Content, e.Tags,
		e.InputType, e.SourceRef, e.SourceAgent, e.SourceTask, e.Status, e.Confidence)
	return scanPKB(row)
}

func (r *projectKBRepo) GetByID(ctx context.Context, id string) (domain.ProjectKBEntry, error) {
	row := r.pool.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM project_kb WHERE id=$1`, pkbSelect), id)
	e, err := scanPKB(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ProjectKBEntry{}, fmt.Errorf("projectKBRepo.GetByID: %w", domain.ErrNotFound)
	}
	return e, err
}

func (r *projectKBRepo) List(ctx context.Context, projectID, userID, entryType, status string) ([]domain.ProjectKBEntry, error) {
	var args []any
	var where []string
	args = append(args, userID)
	where = append(where, "user_id = $1")

	if projectID != "" {
		args = append(args, projectID)
		where = append(where, fmt.Sprintf("(project_id = $%d OR is_global = true)", len(args)))
	} else {
		where = append(where, "is_global = true")
	}
	if entryType != "" {
		args = append(args, entryType)
		where = append(where, fmt.Sprintf("type = $%d", len(args)))
	}
	if status != "" {
		args = append(args, status)
		where = append(where, fmt.Sprintf("status = $%d", len(args)))
	}

	q := fmt.Sprintf(`SELECT %s FROM project_kb WHERE %s ORDER BY created_at DESC`,
		pkbSelect, strings.Join(where, " AND "))
	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil { return nil, err }
	defer rows.Close()
	return collectPKBRows(rows)
}

func (r *projectKBRepo) Search(ctx context.Context, projectID, userID, query, entryType string, limit int) ([]domain.ProjectKBEntry, error) {
	if limit <= 0 || limit > 20 { limit = 5 }
	var args []any
	var where []string
	args = append(args, userID)
	where = append(where, "user_id = $1")
	if projectID != "" {
		args = append(args, projectID)
		where = append(where, fmt.Sprintf("(project_id = $%d OR is_global = true)", len(args)))
	}
	if entryType != "" {
		args = append(args, entryType)
		where = append(where, fmt.Sprintf("type = $%d", len(args)))
	}
	where = append(where, "status = 'verified'")
	args = append(args, "%"+query+"%")
	where = append(where, fmt.Sprintf("(title ILIKE $%d OR content ILIKE $%d)", len(args), len(args)))
	args = append(args, limit)
	q := fmt.Sprintf(`SELECT %s FROM project_kb WHERE %s ORDER BY confidence DESC LIMIT $%d`,
		pkbSelect, strings.Join(where, " AND "), len(args))
	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil { return nil, err }
	defer rows.Close()
	return collectPKBRows(rows)
}

func (r *projectKBRepo) Update(ctx context.Context, e domain.ProjectKBEntry) (domain.ProjectKBEntry, error) {
	q := fmt.Sprintf(`UPDATE project_kb SET title=$1,content=$2,tags=$3,updated_at=now()
		WHERE id=$4 AND user_id=$5 RETURNING %s`, pkbSelect)
	row := r.pool.QueryRow(ctx, q, e.Title, e.Content, e.Tags, e.ID, e.UserID)
	result, err := scanPKB(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ProjectKBEntry{}, fmt.Errorf("projectKBRepo.Update: %w", domain.ErrNotFound)
	}
	return result, err
}

func (r *projectKBRepo) SetStatus(ctx context.Context, id, userID, status string) (domain.ProjectKBEntry, error) {
	q := fmt.Sprintf(`UPDATE project_kb SET status=$1,updated_at=now()
		WHERE id=$2 AND user_id=$3 RETURNING %s`, pkbSelect)
	row := r.pool.QueryRow(ctx, q, status, id, userID)
	result, err := scanPKB(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.ProjectKBEntry{}, fmt.Errorf("projectKBRepo.SetStatus: %w", domain.ErrNotFound)
	}
	return result, err
}

func (r *projectKBRepo) Delete(ctx context.Context, id, userID string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM project_kb WHERE id=$1 AND user_id=$2`, id, userID)
	if err != nil { return err }
	if tag.RowsAffected() == 0 { return fmt.Errorf("projectKBRepo.Delete: %w", domain.ErrNotFound) }
	return nil
}

func (r *projectKBRepo) UpdateContent(ctx context.Context, id, content, status string) error {
	_, err := r.pool.Exec(ctx,
		`UPDATE project_kb SET content=$1, status=$2, updated_at=now() WHERE id=$3`,
		content, status, id)
	return err
}

type pkbRowsIface interface {
	Next() bool
	Scan(...any) error
	Err() error
}

func collectPKBRows(rows pkbRowsIface) ([]domain.ProjectKBEntry, error) {
	var result []domain.ProjectKBEntry
	for rows.Next() {
		e, err := scanPKB(rows)
		if err != nil { return nil, err }
		result = append(result, e)
	}
	return result, rows.Err()
}

type pkbScanner interface{ Scan(dest ...any) error }

func scanPKB(row pkbScanner) (domain.ProjectKBEntry, error) {
	var e domain.ProjectKBEntry
	var createdAt, updatedAt time.Time
	err := row.Scan(
		&e.ID, &e.ProjectID, &e.UserID, &e.IsGlobal, &e.Type, &e.Title, &e.Content, &e.Tags,
		&e.InputType, &e.SourceRef, &e.SourceAgent, &e.SourceTask, &e.Status, &e.Confidence,
		&createdAt, &updatedAt,
	)
	e.CreatedAt, e.UpdatedAt = createdAt, updatedAt
	return e, err
}
```

- [ ] **Step 2: Create infra/mock/project_kb_repo.go**

```go
package mock

import (
	"context"
	"fmt"
	"github.com/forge-ai/forge/api/domain"
)

type ProjectKBRepo struct {
	CreateFn        func(ctx context.Context, e domain.ProjectKBEntry) (domain.ProjectKBEntry, error)
	GetByIDFn       func(ctx context.Context, id string) (domain.ProjectKBEntry, error)
	ListFn          func(ctx context.Context, projectID, userID, entryType, status string) ([]domain.ProjectKBEntry, error)
	SearchFn        func(ctx context.Context, projectID, userID, query, entryType string, limit int) ([]domain.ProjectKBEntry, error)
	UpdateFn        func(ctx context.Context, e domain.ProjectKBEntry) (domain.ProjectKBEntry, error)
	SetStatusFn     func(ctx context.Context, id, userID, status string) (domain.ProjectKBEntry, error)
	DeleteFn        func(ctx context.Context, id, userID string) error
	UpdateContentFn func(ctx context.Context, id, content, status string) error
}

func (m *ProjectKBRepo) Create(ctx context.Context, e domain.ProjectKBEntry) (domain.ProjectKBEntry, error) {
	if m.CreateFn == nil { return domain.ProjectKBEntry{}, fmt.Errorf("mock: CreateFn not set") }
	return m.CreateFn(ctx, e)
}
func (m *ProjectKBRepo) GetByID(ctx context.Context, id string) (domain.ProjectKBEntry, error) {
	if m.GetByIDFn == nil { return domain.ProjectKBEntry{}, fmt.Errorf("mock: GetByIDFn not set") }
	return m.GetByIDFn(ctx, id)
}
func (m *ProjectKBRepo) List(ctx context.Context, projectID, userID, entryType, status string) ([]domain.ProjectKBEntry, error) {
	if m.ListFn == nil { return nil, fmt.Errorf("mock: ListFn not set") }
	return m.ListFn(ctx, projectID, userID, entryType, status)
}
func (m *ProjectKBRepo) Search(ctx context.Context, projectID, userID, query, entryType string, limit int) ([]domain.ProjectKBEntry, error) {
	if m.SearchFn == nil { return nil, fmt.Errorf("mock: SearchFn not set") }
	return m.SearchFn(ctx, projectID, userID, query, entryType, limit)
}
func (m *ProjectKBRepo) Update(ctx context.Context, e domain.ProjectKBEntry) (domain.ProjectKBEntry, error) {
	if m.UpdateFn == nil { return domain.ProjectKBEntry{}, fmt.Errorf("mock: UpdateFn not set") }
	return m.UpdateFn(ctx, e)
}
func (m *ProjectKBRepo) SetStatus(ctx context.Context, id, userID, status string) (domain.ProjectKBEntry, error) {
	if m.SetStatusFn == nil { return domain.ProjectKBEntry{}, fmt.Errorf("mock: SetStatusFn not set") }
	return m.SetStatusFn(ctx, id, userID, status)
}
func (m *ProjectKBRepo) Delete(ctx context.Context, id, userID string) error {
	if m.DeleteFn == nil { return fmt.Errorf("mock: DeleteFn not set") }
	return m.DeleteFn(ctx, id, userID)
}
func (m *ProjectKBRepo) UpdateContent(ctx context.Context, id, content, status string) error {
	if m.UpdateContentFn == nil { return fmt.Errorf("mock: UpdateContentFn not set") }
	return m.UpdateContentFn(ctx, id, content, status)
}
```

- [ ] **Step 3: Build + commit**

```bash
cd /Users/cookie/project/forge/apps/api && go build ./... && git add apps/api/infra/postgres/project_kb_repo.go apps/api/infra/mock/project_kb_repo.go && git commit -m "feat(api): add ProjectKBRepo postgres and mock"
```

---

## Task K3: ProjectKBHandler + tests + cleanup old handlers

**Files:**
- Create: `apps/api/api/handler/project_kb.go`
- Create: `apps/api/api/handler/project_kb_test.go`
- Delete: `apps/api/api/handler/workspace_kb.go`
- Delete: `apps/api/api/handler/workspace_kb_test.go`
- Modify: `apps/api/api/handler/internal.go`

- [ ] **Step 1: Write failing test**

Create `apps/api/api/handler/project_kb_test.go`:

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
	"github.com/forge-ai/forge/api/domain"
	"github.com/forge-ai/forge/api/infra/mock"
)

func TestProjectKBHandler_Create_Success(t *testing.T) {
	pid := "proj-1"
	want := domain.ProjectKBEntry{ID: "kb-1", UserID: "u-1", Title: "API convention", Type: "principle", Status: "verified"}
	h := handler.NewProjectKBHandler(&mock.ProjectKBRepo{
		CreateFn: func(_ context.Context, e domain.ProjectKBEntry) (domain.ProjectKBEntry, error) {
			return want, nil
		},
	})
	r := chi.NewRouter()
	r.Post("/api/v1/projects/{projectID}/kb", h.Create)

	body := `{"title":"API convention","content":"Use REST","type":"principle"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/projects/proj-1/kb", strings.NewReader(body))
	req = withUser(req, "u-1")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)
	_ = pid

	if w.Code != http.StatusCreated {
		t.Errorf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]any
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["data"].(map[string]any)["id"] != "kb-1" {
		t.Error("expected id kb-1")
	}
}

func TestProjectKBHandler_Create_MissingTitle(t *testing.T) {
	h := handler.NewProjectKBHandler(&mock.ProjectKBRepo{})
	r := chi.NewRouter()
	r.Post("/api/v1/projects/{projectID}/kb", h.Create)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/projects/proj-1/kb", strings.NewReader(`{"title":""}`))
	req = withUser(req, "u-1")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}
```

Run: `cd apps/api && go test ./api/handler/... -run TestProjectKBHandler 2>&1 | tail -5` — expect compile error.

- [ ] **Step 2: Create handler/project_kb.go**

```go
package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/forge-ai/forge/api/api/middleware"
	"github.com/forge-ai/forge/api/domain"
)

type ProjectKBHandler struct{ repo domain.ProjectKBRepository }

func NewProjectKBHandler(repo domain.ProjectKBRepository) *ProjectKBHandler {
	return &ProjectKBHandler{repo: repo}
}

// GET /api/v1/projects/{projectID}/kb?type=&status=
func (h *ProjectKBHandler) List(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	userID := middleware.UserIDFromContext(r.Context())
	entryType := r.URL.Query().Get("type")
	status := r.URL.Query().Get("status")
	entries, err := h.repo.List(r.Context(), projectID, userID, entryType, status)
	if err != nil { middleware.WriteError(w, err); return }
	if entries == nil { entries = []domain.ProjectKBEntry{} }
	middleware.WriteJSONList(w, entries, len(entries), 1, 100)
}

// POST /api/v1/projects/{projectID}/kb
func (h *ProjectKBHandler) Create(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	userID := middleware.UserIDFromContext(r.Context())
	var body struct {
		Title   string   `json:"title"`
		Content string   `json:"content"`
		Type    string   `json:"type"`
		Tags    []string `json:"tags"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON"); return
	}
	if body.Title == "" { middleware.WriteFieldError(w, "title", "title is required"); return }
	if body.Content == "" { middleware.WriteFieldError(w, "content", "content is required"); return }
	if body.Type == "" { body.Type = "spec" }
	if !domain.ValidKBTypes[body.Type] { middleware.WriteFieldError(w, "type", "invalid type"); return }
	if body.Tags == nil { body.Tags = []string{} }
	pid := projectID
	entry, err := h.repo.Create(r.Context(), domain.ProjectKBEntry{
		ProjectID: &pid, UserID: userID, Type: body.Type,
		Title: body.Title, Content: body.Content, Tags: body.Tags,
		InputType: "text", Status: "verified", Confidence: 1.0,
	})
	if err != nil { middleware.WriteError(w, err); return }
	middleware.WriteJSON(w, http.StatusCreated, entry)
}

// PUT /api/v1/projects/{projectID}/kb/{id}
func (h *ProjectKBHandler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := middleware.UserIDFromContext(r.Context())
	var body struct {
		Title   string   `json:"title"`
		Content string   `json:"content"`
		Tags    []string `json:"tags"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON"); return
	}
	if body.Tags == nil { body.Tags = []string{} }
	entry, err := h.repo.Update(r.Context(), domain.ProjectKBEntry{
		ID: id, UserID: userID, Title: body.Title, Content: body.Content, Tags: body.Tags,
	})
	if err != nil { middleware.WriteError(w, err); return }
	middleware.WriteJSON(w, http.StatusOK, entry)
}

// PUT /api/v1/projects/{projectID}/kb/{id}/verify
func (h *ProjectKBHandler) Verify(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := middleware.UserIDFromContext(r.Context())
	entry, err := h.repo.SetStatus(r.Context(), id, userID, "verified")
	if err != nil { middleware.WriteError(w, err); return }
	middleware.WriteJSON(w, http.StatusOK, entry)
}

// PUT /api/v1/projects/{projectID}/kb/{id}/deprecate
func (h *ProjectKBHandler) Deprecate(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := middleware.UserIDFromContext(r.Context())
	entry, err := h.repo.SetStatus(r.Context(), id, userID, "deprecated")
	if err != nil { middleware.WriteError(w, err); return }
	middleware.WriteJSON(w, http.StatusOK, entry)
}

// DELETE /api/v1/projects/{projectID}/kb/{id}
func (h *ProjectKBHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := middleware.UserIDFromContext(r.Context())
	if err := h.repo.Delete(r.Context(), id, userID); err != nil {
		middleware.WriteError(w, err); return
	}
	w.WriteHeader(http.StatusNoContent)
}
```

- [ ] **Step 3: Update internal.go — replace SearchKB/CreateKBEntry with project-scoped versions**

Remove `kbRepo domain.WorkspaceKBRepository` field. Add `pkbRepo domain.ProjectKBRepository`.
Update `NewInternalHandler` to replace `kbRepo WorkspaceKBRepository` with `pkbRepo ProjectKBRepository`.

Replace `SearchKB` and `CreateKBEntry` methods:

```go
// GET /internal/projects/{projectID}/kb?type=principle&q=&limit=
func (h *InternalHandler) SearchProjectKB(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	userID := r.URL.Query().Get("userid")
	q := r.URL.Query().Get("q")
	entryType := r.URL.Query().Get("type")
	entries, err := h.pkbRepo.Search(r.Context(), projectID, userID, q, entryType, 10)
	if err != nil { middleware.WriteError(w, err); return }
	if entries == nil { entries = []domain.ProjectKBEntry{} }
	middleware.WriteJSONList(w, entries, len(entries), 1, 10)
}

// POST /internal/projects/{projectID}/kb  — Agent submits pending entry
func (h *InternalHandler) CreateProjectKBEntry(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	var body struct {
		UserID      string   `json:"userId"`
		Type        string   `json:"type"`
		Title       string   `json:"title"`
		Content     string   `json:"content"`
		Tags        []string `json:"tags"`
		SourceAgent string   `json:"sourceAgent"`
		SourceTask  string   `json:"sourceTask"`
		Confidence  float64  `json:"confidence"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON"); return
	}
	if body.Tags == nil { body.Tags = []string{} }
	if body.Type == "" { body.Type = "spec" }
	if body.Confidence == 0 { body.Confidence = 0.8 }
	pid := projectID
	entry, err := h.pkbRepo.Create(r.Context(), domain.ProjectKBEntry{
		ProjectID: &pid, UserID: body.UserID, Type: body.Type,
		Title: body.Title, Content: body.Content, Tags: body.Tags,
		SourceAgent: body.SourceAgent, SourceTask: body.SourceTask,
		InputType: "text", Status: "pending", Confidence: body.Confidence,
	})
	if err != nil { middleware.WriteError(w, err); return }
	middleware.WriteJSON(w, http.StatusCreated, entry)
}

// PATCH /internal/kb/:id/content — ingest job updates content
func (h *InternalHandler) UpdateKBContent(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var body struct {
		Content string `json:"content"`
		Status  string `json:"status"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON"); return
	}
	if body.Status == "" { body.Status = "pending" }
	if err := h.pkbRepo.UpdateContent(r.Context(), id, body.Content, body.Status); err != nil {
		middleware.WriteError(w, err); return
	}
	w.WriteHeader(http.StatusNoContent)
}
```

Update all test calls to `NewInternalHandler` to pass `nil` for replaced kbRepo and add pkbRepo.

- [ ] **Step 4: Run tests**

```bash
cd /Users/cookie/project/forge/apps/api && go test ./api/handler/... -run "TestProjectKBHandler|TestInternalHandler" -v 2>&1 | tail -20
```

- [ ] **Step 5: Delete old workspace KB files**

```bash
rm /Users/cookie/project/forge/apps/api/api/handler/workspace_kb.go
rm /Users/cookie/project/forge/apps/api/api/handler/workspace_kb_test.go
rm /Users/cookie/project/forge/apps/api/infra/postgres/workspace_kb_repo.go
rm /Users/cookie/project/forge/apps/api/infra/mock/workspace_kb_repo.go
rm /Users/cookie/project/forge/apps/api/infra/postgres/project_context_repo.go
rm /Users/cookie/project/forge/apps/api/infra/mock/project_context_repo.go
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(api): add ProjectKBHandler, update InternalHandler, remove old workspace_kb/project_context_repo files"
```

---

## Task K4: Router + main.go wiring

**Files:**
- Modify: `apps/api/api/router.go`
- Modify: `apps/api/cmd/server/main.go`

- [ ] **Step 1: Update router.go**

Read `apps/api/api/router.go`. Replace old KB routes with new project-scoped routes.

Remove `KB *handler.WorkspaceKBHandler` from RouterDeps. Add `ProjectKB *handler.ProjectKBHandler`.

Replace the old `/api/v1/kb` block with:
```go
// KB routes nested under projects
// (inside r.Route("/{projectID}", ...) block)
r.Route("/kb", func(r chi.Router) {
    r.Get("/",           deps.ProjectKB.List)
    r.Post("/",          deps.ProjectKB.Create)
    r.Route("/{id}", func(r chi.Router) {
        r.Put("/",           deps.ProjectKB.Update)
        r.Put("/verify",     deps.ProjectKB.Verify)
        r.Put("/deprecate",  deps.ProjectKB.Deprecate)
        r.Delete("/",        deps.ProjectKB.Delete)
    })
})
```

Update internal routes — replace old `/internal/kb` with:
```go
r.Get("/projects/{projectID}/kb",     deps.Internal.SearchProjectKB)
r.Post("/projects/{projectID}/kb",    deps.Internal.CreateProjectKBEntry)
r.Patch("/kb/{id}/content",           deps.Internal.UpdateKBContent)
```

Remove old `/internal/kb GET/POST` routes.

- [ ] **Step 2: Update main.go**

Read `apps/api/cmd/server/main.go`. Replace:
- `kbRepo := postgres.NewWorkspaceKBRepo(pool)` → `pkbRepo := postgres.NewProjectKBRepo(pool)`
- `kbHandler := handler.NewWorkspaceKBHandler(kbRepo)` → `pkbHandler := handler.NewProjectKBHandler(pkbRepo)`
- Remove `contextRepo := postgres.NewProjectContextRepo(pool)` (merged into project_kb)
- Update `NewInternalHandler(...)` to pass `pkbRepo` instead of `kbRepo, contextRepo`
- Update `RouterDeps` to use `ProjectKB: pkbHandler`

- [ ] **Step 3: Run all Go tests**

```bash
cd /Users/cookie/project/forge/apps/api && go test ./... 2>&1 | tail -10
```
Expected: all tests pass.

- [ ] **Step 4: Commit**

```bash
git add apps/api/api/router.go apps/api/cmd/server/main.go
git commit -m "feat(api): wire ProjectKBHandler routes, remove old workspace_kb and project_context routes"
```
