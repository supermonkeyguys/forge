# Workspace KB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a shared company knowledge base scoped to each user's workspace — all agents can search it, privileged agents can write to it, humans manage it via a Settings KB tab.

**Architecture:** Go API adds `workspace_kb` table + CRUD endpoints. Agent Service adds `search_kb`/`save_to_kb` tools in `buildTools()` and auto-injects top matches into task system prompts. Frontend adds a KB tab under `/settings`.

**Tech Stack:** Go (pgx, chi), TypeScript (React, TanStack Query, Vitest), TailwindCSS.

---

## File Map

```
Created (Go API):
  apps/api/migrations/007_workspace_kb.sql
  apps/api/domain/workspace_kb.go
  apps/api/infra/postgres/workspace_kb_repo.go
  apps/api/infra/mock/workspace_kb_repo.go
  apps/api/api/handler/workspace_kb.go
  apps/api/api/handler/workspace_kb_test.go

Modified (Go API):
  apps/api/domain/repository.go        — add WorkspaceKBRepository interface
  apps/api/api/handler/internal.go     — add SearchKB internal handler
  apps/api/api/handler/internal_test.go
  apps/api/api/router.go               — add /kb routes + /internal/kb route
  apps/api/cmd/server/main.go          — wire kbRepo + handlers

Created (Agent Service):
  apps/agent/src/lib/workspace-kb-client.ts

Modified (Agent Service):
  apps/agent/src/agents/builder/base-builder.ts  — add search_kb/save_to_kb tools + auto-inject

Created (Frontend):
  packages/core/kb/use-kb.ts
  packages/core/kb/index.ts
  apps/web/src/pages/settings/components/KBSection.tsx

Modified (Frontend):
  packages/core/index.ts                            — export KB hooks
  apps/web/src/pages/settings/index.tsx             — add KB tab
```

---

## Task W1: DB migration + domain + repository interface

**Files:**
- Create: `apps/api/migrations/007_workspace_kb.sql`
- Create: `apps/api/domain/workspace_kb.go`
- Modify: `apps/api/domain/repository.go`

- [ ] **Step 1: Create migration**

```sql
-- apps/api/migrations/007_workspace_kb.sql
CREATE TABLE IF NOT EXISTS workspace_kb (
  id           TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id      TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title        TEXT        NOT NULL,
  content      TEXT        NOT NULL,
  tags         TEXT[]      NOT NULL DEFAULT '{}',
  source_agent TEXT        NOT NULL DEFAULT '',
  source_task  TEXT        NOT NULL DEFAULT '',
  verified     BOOLEAN     NOT NULL DEFAULT false,
  confidence   FLOAT       NOT NULL DEFAULT 0.8,
  stale_at     TIMESTAMPTZ,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS workspace_kb_user_id_idx ON workspace_kb(user_id);
CREATE INDEX IF NOT EXISTS workspace_kb_tags_idx    ON workspace_kb USING GIN(tags);
```

- [ ] **Step 2: Create domain/workspace_kb.go**

```go
package domain

import "time"

type WorkspaceKBEntry struct {
	ID          string     `json:"id"`
	UserID      string     `json:"userId"`
	Title       string     `json:"title"`
	Content     string     `json:"content"`
	Tags        []string   `json:"tags"`
	SourceAgent string     `json:"sourceAgent"`
	SourceTask  string     `json:"sourceTask"`
	Verified    bool       `json:"verified"`
	Confidence  float64    `json:"confidence"`
	StaleAt     *time.Time `json:"staleAt"`
	CreatedAt   time.Time  `json:"createdAt"`
	UpdatedAt   time.Time  `json:"updatedAt"`
}
```

- [ ] **Step 3: Add WorkspaceKBRepository to domain/repository.go**

```go
type WorkspaceKBRepository interface {
	Create(ctx context.Context, e WorkspaceKBEntry) (WorkspaceKBEntry, error)
	GetByID(ctx context.Context, id string) (WorkspaceKBEntry, error)
	Search(ctx context.Context, userID, query string, limit int) ([]WorkspaceKBEntry, error)
	List(ctx context.Context, userID string) ([]WorkspaceKBEntry, error)
	Update(ctx context.Context, e WorkspaceKBEntry) (WorkspaceKBEntry, error)
	Verify(ctx context.Context, id, userID string) (WorkspaceKBEntry, error)
	Delete(ctx context.Context, id, userID string) error
}
```

- [ ] **Step 4: Build + commit**

```bash
cd /Users/cookie/project/forge/apps/api && go build ./... && git add apps/api/migrations/007_workspace_kb.sql apps/api/domain/workspace_kb.go apps/api/domain/repository.go && git commit -m "feat(api): add workspace_kb table and domain model"
```

---

## Task W2: Postgres repo + mock

**Files:**
- Create: `apps/api/infra/postgres/workspace_kb_repo.go`
- Create: `apps/api/infra/mock/workspace_kb_repo.go`

- [ ] **Step 1: Create postgres/workspace_kb_repo.go**

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

type workspaceKBRepo struct{ pool *pgxpool.Pool }

func NewWorkspaceKBRepo(pool *pgxpool.Pool) domain.WorkspaceKBRepository {
	return &workspaceKBRepo{pool: pool}
}

const kbSelect = `id, user_id, title, content, tags, source_agent, source_task, verified, confidence, stale_at, created_at, updated_at`

func (r *workspaceKBRepo) Create(ctx context.Context, e domain.WorkspaceKBEntry) (domain.WorkspaceKBEntry, error) {
	q := fmt.Sprintf(`INSERT INTO workspace_kb (user_id, title, content, tags, source_agent, source_task, verified, confidence)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING %s`, kbSelect)
	row := r.pool.QueryRow(ctx, q, e.UserID, e.Title, e.Content, e.Tags, e.SourceAgent, e.SourceTask, e.Verified, e.Confidence)
	return scanKB(row)
}

func (r *workspaceKBRepo) GetByID(ctx context.Context, id string) (domain.WorkspaceKBEntry, error) {
	row := r.pool.QueryRow(ctx, fmt.Sprintf(`SELECT %s FROM workspace_kb WHERE id=$1`, kbSelect), id)
	e, err := scanKB(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.WorkspaceKBEntry{}, fmt.Errorf("workspaceKBRepo.GetByID: %w", domain.ErrNotFound)
	}
	return e, err
}

func (r *workspaceKBRepo) Search(ctx context.Context, userID, query string, limit int) ([]domain.WorkspaceKBEntry, error) {
	if limit <= 0 || limit > 20 { limit = 5 }
	q := fmt.Sprintf(`SELECT %s FROM workspace_kb WHERE user_id=$1 AND (title ILIKE $2 OR content ILIKE $2) AND verified=true AND (stale_at IS NULL OR stale_at > now()) ORDER BY confidence DESC LIMIT $3`, kbSelect)
	rows, err := r.pool.Query(ctx, q, userID, "%"+query+"%", limit)
	if err != nil { return nil, err }
	defer rows.Close()
	return collectKBRows(rows)
}

func (r *workspaceKBRepo) List(ctx context.Context, userID string) ([]domain.WorkspaceKBEntry, error) {
	q := fmt.Sprintf(`SELECT %s FROM workspace_kb WHERE user_id=$1 ORDER BY created_at DESC`, kbSelect)
	rows, err := r.pool.Query(ctx, q, userID)
	if err != nil { return nil, err }
	defer rows.Close()
	return collectKBRows(rows)
}

func (r *workspaceKBRepo) Update(ctx context.Context, e domain.WorkspaceKBEntry) (domain.WorkspaceKBEntry, error) {
	q := fmt.Sprintf(`UPDATE workspace_kb SET title=$1,content=$2,tags=$3,confidence=$4,updated_at=now() WHERE id=$5 AND user_id=$6 RETURNING %s`, kbSelect)
	row := r.pool.QueryRow(ctx, q, e.Title, e.Content, e.Tags, e.Confidence, e.ID, e.UserID)
	result, err := scanKB(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.WorkspaceKBEntry{}, fmt.Errorf("workspaceKBRepo.Update: %w", domain.ErrNotFound)
	}
	return result, err
}

func (r *workspaceKBRepo) Verify(ctx context.Context, id, userID string) (domain.WorkspaceKBEntry, error) {
	q := fmt.Sprintf(`UPDATE workspace_kb SET verified=true, updated_at=now() WHERE id=$1 AND user_id=$2 RETURNING %s`, kbSelect)
	row := r.pool.QueryRow(ctx, q, id, userID)
	result, err := scanKB(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.WorkspaceKBEntry{}, fmt.Errorf("workspaceKBRepo.Verify: %w", domain.ErrNotFound)
	}
	return result, err
}

func (r *workspaceKBRepo) Delete(ctx context.Context, id, userID string) error {
	tag, err := r.pool.Exec(ctx, `DELETE FROM workspace_kb WHERE id=$1 AND user_id=$2`, id, userID)
	if err != nil { return err }
	if tag.RowsAffected() == 0 { return fmt.Errorf("workspaceKBRepo.Delete: %w", domain.ErrNotFound) }
	return nil
}

func collectKBRows(rows interface{ Next() bool; Scan(...any) error; Err() error }) ([]domain.WorkspaceKBEntry, error) {
	var result []domain.WorkspaceKBEntry
	for rows.Next() {
		e, err := scanKB(rows)
		if err != nil { return nil, err }
		result = append(result, e)
	}
	return result, rows.Err()
}

type kbScanner interface{ Scan(dest ...any) error }

func scanKB(row kbScanner) (domain.WorkspaceKBEntry, error) {
	var e domain.WorkspaceKBEntry
	var createdAt, updatedAt time.Time
	err := row.Scan(&e.ID, &e.UserID, &e.Title, &e.Content, &e.Tags, &e.SourceAgent, &e.SourceTask, &e.Verified, &e.Confidence, &e.StaleAt, &createdAt, &updatedAt)
	e.CreatedAt, e.UpdatedAt = createdAt, updatedAt
	return e, err
}
```

- [ ] **Step 2: Create infra/mock/workspace_kb_repo.go**

```go
package mock

import (
	"context"
	"fmt"
	"github.com/forge-ai/forge/api/domain"
)

type WorkspaceKBRepo struct {
	CreateFn  func(ctx context.Context, e domain.WorkspaceKBEntry) (domain.WorkspaceKBEntry, error)
	GetByIDFn func(ctx context.Context, id string) (domain.WorkspaceKBEntry, error)
	SearchFn  func(ctx context.Context, userID, query string, limit int) ([]domain.WorkspaceKBEntry, error)
	ListFn    func(ctx context.Context, userID string) ([]domain.WorkspaceKBEntry, error)
	UpdateFn  func(ctx context.Context, e domain.WorkspaceKBEntry) (domain.WorkspaceKBEntry, error)
	VerifyFn  func(ctx context.Context, id, userID string) (domain.WorkspaceKBEntry, error)
	DeleteFn  func(ctx context.Context, id, userID string) error
}

func (m *WorkspaceKBRepo) Create(ctx context.Context, e domain.WorkspaceKBEntry) (domain.WorkspaceKBEntry, error) {
	if m.CreateFn == nil { return domain.WorkspaceKBEntry{}, fmt.Errorf("mock: CreateFn not set") }
	return m.CreateFn(ctx, e)
}
func (m *WorkspaceKBRepo) GetByID(ctx context.Context, id string) (domain.WorkspaceKBEntry, error) {
	if m.GetByIDFn == nil { return domain.WorkspaceKBEntry{}, fmt.Errorf("mock: GetByIDFn not set") }
	return m.GetByIDFn(ctx, id)
}
func (m *WorkspaceKBRepo) Search(ctx context.Context, userID, query string, limit int) ([]domain.WorkspaceKBEntry, error) {
	if m.SearchFn == nil { return nil, fmt.Errorf("mock: SearchFn not set") }
	return m.SearchFn(ctx, userID, query, limit)
}
func (m *WorkspaceKBRepo) List(ctx context.Context, userID string) ([]domain.WorkspaceKBEntry, error) {
	if m.ListFn == nil { return nil, fmt.Errorf("mock: ListFn not set") }
	return m.ListFn(ctx, userID)
}
func (m *WorkspaceKBRepo) Update(ctx context.Context, e domain.WorkspaceKBEntry) (domain.WorkspaceKBEntry, error) {
	if m.UpdateFn == nil { return domain.WorkspaceKBEntry{}, fmt.Errorf("mock: UpdateFn not set") }
	return m.UpdateFn(ctx, e)
}
func (m *WorkspaceKBRepo) Verify(ctx context.Context, id, userID string) (domain.WorkspaceKBEntry, error) {
	if m.VerifyFn == nil { return domain.WorkspaceKBEntry{}, fmt.Errorf("mock: VerifyFn not set") }
	return m.VerifyFn(ctx, id, userID)
}
func (m *WorkspaceKBRepo) Delete(ctx context.Context, id, userID string) error {
	if m.DeleteFn == nil { return fmt.Errorf("mock: DeleteFn not set") }
	return m.DeleteFn(ctx, id, userID)
}
```

- [ ] **Step 3: Build + commit**

```bash
cd /Users/cookie/project/forge/apps/api && go build ./... && git add apps/api/infra/ && git commit -m "feat(api): add WorkspaceKBRepo postgres implementation and mock"
```

---

## Task W3: WorkspaceKBHandler + internal search + router + main.go

**Files:**
- Create: `apps/api/api/handler/workspace_kb.go`
- Create: `apps/api/api/handler/workspace_kb_test.go`
- Modify: `apps/api/api/handler/internal.go` + `internal_test.go`
- Modify: `apps/api/api/router.go`
- Modify: `apps/api/cmd/server/main.go`

- [ ] **Step 1: Write failing test**

Create `apps/api/api/handler/workspace_kb_test.go`:

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

func TestWorkspaceKBHandler_Create_MissingTitle(t *testing.T) {
	h := handler.NewWorkspaceKBHandler(&mock.WorkspaceKBRepo{})
	r := chi.NewRouter()
	r.Post("/api/v1/kb", h.Create)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/kb", strings.NewReader(`{"title":""}`))
	req = withUser(req, "u-1")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

func TestWorkspaceKBHandler_Create_Success(t *testing.T) {
	want := domain.WorkspaceKBEntry{ID: "kb-1", Title: "Brand guide", Content: "Use blue", Verified: true}
	h := handler.NewWorkspaceKBHandler(&mock.WorkspaceKBRepo{
		CreateFn: func(_ context.Context, e domain.WorkspaceKBEntry) (domain.WorkspaceKBEntry, error) {
			return want, nil
		},
	})
	r := chi.NewRouter()
	r.Post("/api/v1/kb", h.Create)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/kb", strings.NewReader(`{"title":"Brand guide","content":"Use blue"}`))
	req = withUser(req, "u-1")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]any
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["data"].(map[string]any)["id"] != "kb-1" {
		t.Error("expected id kb-1")
	}
}
```

Run: `cd apps/api && go test ./api/handler/... -run TestWorkspaceKB 2>&1 | tail -5` — expect compile error.

- [ ] **Step 2: Create handler/workspace_kb.go**

```go
package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/forge-ai/forge/api/api/middleware"
	"github.com/forge-ai/forge/api/domain"
)

type WorkspaceKBHandler struct{ repo domain.WorkspaceKBRepository }

func NewWorkspaceKBHandler(repo domain.WorkspaceKBRepository) *WorkspaceKBHandler {
	return &WorkspaceKBHandler{repo: repo}
}

// GET /api/v1/kb?q=
func (h *WorkspaceKBHandler) List(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	q := r.URL.Query().Get("q")
	var entries []domain.WorkspaceKBEntry
	var err error
	if q != "" {
		entries, err = h.repo.Search(r.Context(), userID, q, 20)
	} else {
		entries, err = h.repo.List(r.Context(), userID)
	}
	if err != nil { middleware.WriteError(w, err); return }
	if entries == nil { entries = []domain.WorkspaceKBEntry{} }
	middleware.WriteJSONList(w, entries, len(entries), 1, 100)
}

// POST /api/v1/kb
func (h *WorkspaceKBHandler) Create(w http.ResponseWriter, r *http.Request) {
	userID := middleware.UserIDFromContext(r.Context())
	var body struct {
		Title   string   `json:"title"`
		Content string   `json:"content"`
		Tags    []string `json:"tags"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON"); return
	}
	if body.Title == "" { middleware.WriteFieldError(w, "title", "title is required"); return }
	if body.Content == "" { middleware.WriteFieldError(w, "content", "content is required"); return }
	if body.Tags == nil { body.Tags = []string{} }
	entry, err := h.repo.Create(r.Context(), domain.WorkspaceKBEntry{
		UserID: userID, Title: body.Title, Content: body.Content, Tags: body.Tags,
		Verified: true, Confidence: 1.0, // Human-created entries are always verified
	})
	if err != nil { middleware.WriteError(w, err); return }
	middleware.WriteJSON(w, http.StatusCreated, entry)
}

// PUT /api/v1/kb/{id}
func (h *WorkspaceKBHandler) Update(w http.ResponseWriter, r *http.Request) {
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
	entry, err := h.repo.Update(r.Context(), domain.WorkspaceKBEntry{
		ID: id, UserID: userID, Title: body.Title, Content: body.Content, Tags: body.Tags,
	})
	if err != nil { middleware.WriteError(w, err); return }
	middleware.WriteJSON(w, http.StatusOK, entry)
}

// PATCH /api/v1/kb/{id}/verify
func (h *WorkspaceKBHandler) Verify(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := middleware.UserIDFromContext(r.Context())
	entry, err := h.repo.Verify(r.Context(), id, userID)
	if err != nil { middleware.WriteError(w, err); return }
	middleware.WriteJSON(w, http.StatusOK, entry)
}

// DELETE /api/v1/kb/{id}
func (h *WorkspaceKBHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	userID := middleware.UserIDFromContext(r.Context())
	if err := h.repo.Delete(r.Context(), id, userID); err != nil {
		middleware.WriteError(w, err); return
	}
	w.WriteHeader(http.StatusNoContent)
}
```

- [ ] **Step 3: Add internal SearchKB handler to internal.go**

Add `kbRepo domain.WorkspaceKBRepository` field to `InternalHandler`. Update `NewInternalHandler` to accept it. Add handler:

```go
// GET /internal/kb?q=&userid=
func (h *InternalHandler) SearchKB(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("userid")
	q := r.URL.Query().Get("q")
	if userID == "" { middleware.WriteFieldError(w, "userid", "userid is required"); return }
	entries, err := h.kbRepo.Search(r.Context(), userID, q, 5)
	if err != nil { middleware.WriteError(w, err); return }
	if entries == nil { entries = []domain.WorkspaceKBEntry{} }
	middleware.WriteJSONList(w, entries, len(entries), 1, 5)
}

// POST /internal/kb  (agent write, unverified)
func (h *InternalHandler) CreateKBEntry(w http.ResponseWriter, r *http.Request) {
	var body struct {
		UserID      string   `json:"userId"`
		Title       string   `json:"title"`
		Content     string   `json:"content"`
		Tags        []string `json:"tags"`
		SourceAgent string   `json:"sourceAgent"`
		SourceTask  string   `json:"sourceTask"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON"); return
	}
	if body.Tags == nil { body.Tags = []string{} }
	entry, err := h.kbRepo.Create(r.Context(), domain.WorkspaceKBEntry{
		UserID: body.UserID, Title: body.Title, Content: body.Content, Tags: body.Tags,
		SourceAgent: body.SourceAgent, SourceTask: body.SourceTask,
		Verified: false, Confidence: 0.8, // Agent entries need human verification
	})
	if err != nil { middleware.WriteError(w, err); return }
	middleware.WriteJSON(w, http.StatusCreated, entry)
}
```

- [ ] **Step 4: Update router.go**

Add `KB *handler.WorkspaceKBHandler` to `RouterDeps`. In `/api/v1` block add:

```go
r.Route("/kb", func(r chi.Router) {
    r.Get("/",         deps.KB.List)
    r.Post("/",        deps.KB.Create)
    r.Route("/{id}", func(r chi.Router) {
        r.Put("/",        deps.KB.Update)
        r.Patch("/verify", deps.KB.Verify)
        r.Delete("/",     deps.KB.Delete)
    })
})
```

In `/internal` block add:
```go
r.Get("/kb",  deps.Internal.SearchKB)
r.Post("/kb", deps.Internal.CreateKBEntry)
```

- [ ] **Step 5: Update main.go**

```go
kbRepo := postgres.NewWorkspaceKBRepo(pool)
kbHandler := handler.NewWorkspaceKBHandler(kbRepo)
internalHandler := handler.NewInternalHandler(taskRepo, agentRepo, contextRepo, kbRepo)
// add KB: kbHandler to RouterDeps
```

- [ ] **Step 6: Run all Go tests**

```bash
cd /Users/cookie/project/forge/apps/api && go test ./... 2>&1 | tail -10
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/api/handler/workspace_kb.go apps/api/api/handler/workspace_kb_test.go apps/api/api/handler/internal.go apps/api/api/router.go apps/api/cmd/server/main.go
git commit -m "feat(api): add WorkspaceKB CRUD endpoints and internal search/write"
```

---

## Task W4: Agent Service — search_kb/save_to_kb tools + auto-inject

**Files:**
- Create: `apps/agent/src/lib/workspace-kb-client.ts`
- Modify: `apps/agent/src/agents/builder/base-builder.ts`

- [ ] **Step 1: Create workspace-kb-client.ts**

```ts
const FORGE_API_URL = process.env['FORGE_API_URL'] ?? ''
const INTERNAL_TOKEN = process.env['INTERNAL_TOKEN'] ?? ''

export interface KBEntry { id: string; title: string; content: string; tags: string[]; verified: boolean }

export function buildKBContext(entries: Pick<KBEntry, 'title' | 'content'>[]): string {
  if (entries.length === 0) return ''
  return `\n\n## Company Knowledge\n${entries.map((e) => `### ${e.title}\n${e.content}`).join('\n\n')}`
}

export async function searchKB(userID: string, query: string, limit = 3): Promise<KBEntry[]> {
  if (!FORGE_API_URL || !userID) return []
  try {
    const url = `${FORGE_API_URL}/internal/kb?userid=${encodeURIComponent(userID)}&q=${encodeURIComponent(query)}&limit=${limit}`
    const res = await fetch(url, { headers: { 'X-Internal-Token': INTERNAL_TOKEN }, signal: AbortSignal.timeout(3000) })
    if (!res.ok) return []
    const json = await res.json() as { data: KBEntry[] }
    return json.data ?? []
  } catch { return [] }
}

export async function saveToKB(userID: string, title: string, content: string, tags: string[], sourceAgent: string, sourceTask: string): Promise<void> {
  if (!FORGE_API_URL || !userID) return
  try {
    await fetch(`${FORGE_API_URL}/internal/kb`, {
      method: 'POST',
      headers: { 'X-Internal-Token': INTERNAL_TOKEN, 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: userID, title, content, tags, sourceAgent, sourceTask }),
      signal: AbortSignal.timeout(3000),
    })
  } catch (err) { console.error('[saveToKB] failed:', err) }
}
```

- [ ] **Step 2: Add search_kb/save_to_kb tools to buildTools() in base-builder.ts**

Add import:
```ts
import { searchKB, saveToKB, buildKBContext } from '../../lib/workspace-kb-client.js'
```

The `buildTools` function needs access to `userID`. Add it as an 8th parameter:
```ts
function buildTools(
  sandbox, emit, role, spawnFn?, currentTaskId?, currentDepth?, customWriteGuard?,
  userID?: string,
)
```

Add two tools in buildTools (after the `remember`/`recall` tools if they exist):

```ts
search_kb: tool({
  description: 'Search the company knowledge base for information relevant to the current task.',
  parameters: z.object({
    query: z.string().describe('What you want to find in the company knowledge base'),
  }),
  execute: async ({ query }) => {
    emit({ type: 'agent_tool_use', agent: role, tool: 'search_kb', input: { query } })
    const entries = await searchKB(userID ?? '', query, 5)
    return { results: entries.map((e) => ({ title: e.title, content: e.content, verified: e.verified })) }
  },
}),

save_to_kb: tool({
  description: 'Save important company-level information to the shared knowledge base for all agents to use. Only use for information that is broadly relevant.',
  parameters: z.object({
    title:   z.string(),
    content: z.string(),
    tags:    z.array(z.string()),
  }),
  execute: async ({ title, content, tags }) => {
    emit({ type: 'agent_tool_use', agent: role, tool: 'save_to_kb', input: { title } })
    await saveToKB(userID ?? '', title, content, tags, role, currentTaskId ?? '')
    return { ok: true, note: 'Saved to company KB — pending human verification.' }
  },
}),
```

- [ ] **Step 3: Add KB context auto-injection to executeTask()**

In `executeTask()`, after the memory injection (or before `buildTools`), add:

```ts
const kbEntries = await searchKB(this.userID ?? '', input.task.description, 3)
const kbContext = buildKBContext(kbEntries)
```

Update system prompt concatenation:
```ts
const systemWithContext = this.systemPrompt() + memoryContext + kbContext
```

Note: `this.userID` needs to be injected. Add `protected userID?: string` to `BaseBuilderAgent`. In `Orchestrator.generateTaskCode()`, pass `userID` when constructing agent instances, or inject via a setter on the builder.

Simplest approach: add `userID` to `BuilderTaskInput`:
```ts
// In types.ts, BuilderTaskInput:
userID?: string
```

Pass `userID` from `OrchestratorDeps` (add `userID?: string` there, set from job creator's user ID).

- [ ] **Step 4: Run all agent tests**

```bash
cd /Users/cookie/project/forge/apps/agent && npx vitest run 2>&1 | tail -5
```

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/lib/workspace-kb-client.ts apps/agent/src/agents/builder/base-builder.ts apps/agent/src/agents/types.ts apps/agent/src/orchestrator/orchestrator.ts
git commit -m "feat(agent): add search_kb/save_to_kb tools and KB context auto-injection"
```

---

## Task W5: Frontend — KB management section in Settings

**Files:**
- Create: `packages/core/kb/use-kb.ts`
- Create: `packages/core/kb/index.ts`
- Modify: `packages/core/index.ts`
- Create: `apps/web/src/pages/settings/components/KBSection.tsx`
- Modify: `apps/web/src/pages/settings/index.tsx`

- [ ] **Step 1: Create packages/core/kb/use-kb.ts**

```ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { api } from '../api/client.ts'
import { useAuthStore, selectToken } from '../auth/auth-store.ts'

const KBEntrySchema = z.object({
  id: z.string(), userId: z.string(), title: z.string(), content: z.string(),
  tags: z.array(z.string()), sourceAgent: z.string(), verified: z.boolean(),
  confidence: z.number(), createdAt: z.string(), updatedAt: z.string(),
})

export type KBEntry = z.infer<typeof KBEntrySchema>
export type KBInput = Pick<KBEntry, 'title' | 'content' | 'tags'>

export function useKBEntries(q?: string) {
  const token = useAuthStore(selectToken)
  return useQuery({
    queryKey: ['kb', q],
    queryFn: async () => {
      const path = q ? `/api/v1/kb?q=${encodeURIComponent(q)}` : '/api/v1/kb'
      const raw = await api.getList<KBEntry>(path, token ?? undefined)
      return z.array(KBEntrySchema).parse(raw.data)
    },
    enabled: token !== null,
  })
}

export function useCreateKBEntry() {
  const token = useAuthStore(selectToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body: KBInput) => api.post<KBEntry>('/api/v1/kb', body, token ?? undefined),
    onSettled: () => qc.invalidateQueries({ queryKey: ['kb'] }),
  })
}

export function useVerifyKBEntry() {
  const token = useAuthStore(selectToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.put<KBEntry>(`/api/v1/kb/${id}/verify`, {}, token ?? undefined),
    onSettled: () => qc.invalidateQueries({ queryKey: ['kb'] }),
  })
}

export function useDeleteKBEntry() {
  const token = useAuthStore(selectToken)
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: string) => api.delete(`/api/v1/kb/${id}`, token ?? undefined),
    onSettled: () => qc.invalidateQueries({ queryKey: ['kb'] }),
  })
}
```

- [ ] **Step 2: Create packages/core/kb/index.ts**

```ts
export { useKBEntries, useCreateKBEntry, useVerifyKBEntry, useDeleteKBEntry } from './use-kb.ts'
export type { KBEntry, KBInput } from './use-kb.ts'
```

- [ ] **Step 3: Export from packages/core/index.ts**

After Agent management exports, add:
```ts
// Workspace KB
export { useKBEntries, useCreateKBEntry, useVerifyKBEntry, useDeleteKBEntry } from './kb/index.ts'
export type { KBEntry, KBInput } from './kb/index.ts'
```

- [ ] **Step 4: Create apps/web/src/pages/settings/components/KBSection.tsx**

```tsx
import { useState } from 'react'
import { useKBEntries, useCreateKBEntry, useVerifyKBEntry, useDeleteKBEntry } from '@forge/core'
import type { KBEntry } from '@forge/core'
import { cn } from '../../../lib/utils'

export function KBSection() {
  const { data: entries = [] } = useKBEntries()
  const createEntry = useCreateKBEntry()
  const verifyEntry = useVerifyKBEntry()
  const deleteEntry = useDeleteKBEntry()
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [isAdding, setIsAdding] = useState(false)

  const pending = entries.filter((e) => !e.verified)
  const verified = entries.filter((e) => e.verified)

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-[15px] font-semibold text-white/90">公司知识库</h2>
          <p className="mt-0.5 text-[12px] text-white/40">所有 Agent 在执行任务时会自动检索相关条目</p>
        </div>
        <button
          onClick={() => setIsAdding(true)}
          className="rounded-[6px] border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-[12px] text-violet-300 hover:bg-violet-500/15"
        >
          + 添加知识
        </button>
      </div>

      {isAdding && (
        <div className="flex flex-col gap-3 rounded-[8px] border border-white/[0.08] bg-white/[0.03] p-4">
          <input
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            placeholder="标题"
            className="w-full rounded-[6px] border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white/80 outline-none focus:border-white/15"
          />
          <textarea
            value={newContent}
            onChange={(e) => setNewContent(e.target.value)}
            placeholder="内容"
            rows={4}
            className="w-full resize-none rounded-[6px] border border-white/[0.08] bg-white/[0.04] px-3 py-2 text-[13px] text-white/60 outline-none focus:border-white/15"
          />
          <div className="flex justify-end gap-2">
            <button onClick={() => setIsAdding(false)} className="px-3 py-1.5 text-[12px] text-white/35">取消</button>
            <button
              onClick={() => {
                createEntry.mutate(
                  { title: newTitle, content: newContent, tags: [] },
                  { onSuccess: () => { setNewTitle(''); setNewContent(''); setIsAdding(false) } },
                )
              }}
              disabled={!newTitle.trim() || !newContent.trim() || createEntry.isPending}
              className="rounded-[6px] border border-violet-500/30 bg-violet-500/10 px-3 py-1.5 text-[12px] text-violet-300 disabled:opacity-50"
            >
              保存
            </button>
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div>
          <div className="mb-2 text-[10px] font-medium uppercase tracking-widest text-amber-400/60">待确认（Agent 提交）</div>
          <div className="flex flex-col gap-2">
            {pending.map((e) => (
              <KBCard key={e.id} entry={e}
                onVerify={() => verifyEntry.mutate(e.id)}
                onDelete={() => deleteEntry.mutate(e.id)}
              />
            ))}
          </div>
        </div>
      )}

      <div>
        {verified.length > 0 && (
          <div className="mb-2 text-[10px] font-medium uppercase tracking-widest text-white/25">已验证</div>
        )}
        <div className="flex flex-col gap-2">
          {verified.map((e) => (
            <KBCard key={e.id} entry={e}
              onDelete={() => deleteEntry.mutate(e.id)}
            />
          ))}
        </div>
        {entries.length === 0 && !isAdding && (
          <div className="py-6 text-center text-[12px] text-white/20">还没有知识条目。添加公司背景、规范或操作手册。</div>
        )}
      </div>
    </div>
  )
}

function KBCard({ entry, onVerify, onDelete }: { entry: KBEntry; onVerify?: () => void; onDelete: () => void }) {
  return (
    <div className={cn(
      'rounded-[7px] border p-3',
      entry.verified ? 'border-white/[0.06] bg-white/[0.02]' : 'border-amber-500/20 bg-amber-500/[0.04]',
    )}>
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1">
          <div className="text-[13px] font-medium text-white/80">{entry.title}</div>
          <div className="mt-1 line-clamp-2 text-[11px] text-white/40">{entry.content}</div>
          {entry.sourceAgent && (
            <div className="mt-1 text-[10px] text-white/20">来源：{entry.sourceAgent}</div>
          )}
        </div>
        <div className="flex items-center gap-1.5">
          {!entry.verified && onVerify && (
            <button
              onClick={onVerify}
              className="rounded-[4px] border border-green-500/30 bg-green-500/10 px-2 py-1 text-[10px] text-green-400 hover:bg-green-500/15"
            >
              确认
            </button>
          )}
          <button
            onClick={onDelete}
            className="rounded-[4px] border border-white/[0.06] bg-transparent px-2 py-1 text-[10px] text-white/30 hover:border-red-500/30 hover:text-red-400"
          >
            删除
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Add KB tab to settings page**

Read `apps/web/src/pages/settings/index.tsx`. Add `'kb'` to `SettingsSection` type. In `SettingsNav`, add a KB nav item. In the render block add:

```tsx
{activeSection === 'kb' && <KBSection />}
```

Import `KBSection` from `'./components/KBSection'`.

- [ ] **Step 6: TypeScript check**

```bash
cd /Users/cookie/project/forge/apps/web && npx tsc --noEmit 2>&1 | grep -v TS5097 | grep "error TS"
```

- [ ] **Step 7: Commit**

```bash
git add packages/core/kb/ packages/core/index.ts apps/web/src/pages/settings/
git commit -m "feat(web): add KB management section in Settings page"
```
