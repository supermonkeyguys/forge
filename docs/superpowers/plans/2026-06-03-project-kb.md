# Project KB Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the flat `project_context.md` markdown file in E2B sandbox with a structured DB-backed section store — version-tracked, per-agent-role filtered, and persistent beyond sandbox lifetime.

**Architecture:** Go API adds `project_context_sections` table with UPSERT-by-heading semantics. Agent Service adds a `ProjectContextClient` injected into `OrchestratorDeps`. When the client is present (production), reads/writes go to the API; when absent (tests), the orchestrator falls back to sandbox file operations unchanged. The `upsertContextSection()` string function is retired.

**Tech Stack:** Go (pgx, chi), TypeScript (Vitest), existing `FORGE_API_URL`/`INTERNAL_TOKEN` env pattern.

---

## File Map

```
Created (Go API):
  apps/api/migrations/006_project_context_sections.sql
  apps/api/domain/project_context.go
  apps/api/infra/postgres/project_context_repo.go
  apps/api/infra/mock/project_context_repo.go
  apps/api/api/handler/project_context.go
  apps/api/api/handler/project_context_test.go

Modified (Go API):
  apps/api/domain/repository.go        — add ProjectContextRepository interface
  apps/api/api/handler/internal.go     — add UpsertSection + GetSections internal handlers
  apps/api/api/handler/internal_test.go
  apps/api/api/router.go               — add /projects/:id/context routes + internal routes
  apps/api/cmd/server/main.go          — wire contextRepo + handlers

Created (Agent Service):
  apps/agent/src/lib/project-context-client.ts  — typed API client

Modified (Agent Service):
  apps/agent/src/orchestrator/orchestrator.ts    — inject ProjectContextClient, update read/write
  apps/agent/src/orchestrator/orchestrator.test.ts
```

---

## Task P1: DB migration + domain + repository interface

**Files:**
- Create: `apps/api/migrations/006_project_context_sections.sql`
- Create: `apps/api/domain/project_context.go`
- Modify: `apps/api/domain/repository.go`

- [ ] **Step 1: Create migration**

```sql
-- apps/api/migrations/006_project_context_sections.sql
CREATE TABLE IF NOT EXISTS project_context_sections (
  id          TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id  TEXT        NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  heading     TEXT        NOT NULL,
  content     TEXT        NOT NULL DEFAULT '',
  agent_role  TEXT        NOT NULL DEFAULT '',
  task_id     TEXT        NOT NULL DEFAULT '',
  version     INT         NOT NULL DEFAULT 1,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(project_id, heading)
);

CREATE INDEX IF NOT EXISTS project_context_sections_project_id_idx
  ON project_context_sections(project_id);
```

- [ ] **Step 2: Create domain/project_context.go**

```go
package domain

import "time"

type ProjectContextSection struct {
	ID        string    `json:"id"`
	ProjectID string    `json:"projectId"`
	Heading   string    `json:"heading"`
	Content   string    `json:"content"`
	AgentRole string    `json:"agentRole"`
	TaskID    string    `json:"taskId"`
	Version   int       `json:"version"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}
```

- [ ] **Step 3: Add ProjectContextRepository to domain/repository.go**

```go
type ProjectContextRepository interface {
	UpsertSection(ctx context.Context, s ProjectContextSection) (ProjectContextSection, error)
	ListByProjectID(ctx context.Context, projectID string) ([]ProjectContextSection, error)
	DeleteByProjectID(ctx context.Context, projectID string) error
}
```

- [ ] **Step 4: Build check**

```bash
cd /Users/cookie/project/forge/apps/api && go build ./...
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/migrations/006_project_context_sections.sql apps/api/domain/project_context.go apps/api/domain/repository.go
git commit -m "feat(api): add project_context_sections table and domain model"
```

---

## Task P2: Postgres repo + mock

**Files:**
- Create: `apps/api/infra/postgres/project_context_repo.go`
- Create: `apps/api/infra/mock/project_context_repo.go`

- [ ] **Step 1: Create postgres/project_context_repo.go**

```go
package postgres

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/forge-ai/forge/api/domain"
)

type projectContextRepo struct{ pool *pgxpool.Pool }

func NewProjectContextRepo(pool *pgxpool.Pool) domain.ProjectContextRepository {
	return &projectContextRepo{pool: pool}
}

func (r *projectContextRepo) UpsertSection(ctx context.Context, s domain.ProjectContextSection) (domain.ProjectContextSection, error) {
	const q = `
		INSERT INTO project_context_sections (project_id, heading, content, agent_role, task_id)
		VALUES ($1, $2, $3, $4, $5)
		ON CONFLICT (project_id, heading)
		DO UPDATE SET content = EXCLUDED.content,
		              agent_role = EXCLUDED.agent_role,
		              task_id = EXCLUDED.task_id,
		              version = project_context_sections.version + 1,
		              updated_at = now()
		RETURNING id, project_id, heading, content, agent_role, task_id, version, created_at, updated_at`
	row := r.pool.QueryRow(ctx, q, s.ProjectID, s.Heading, s.Content, s.AgentRole, s.TaskID)
	return scanSection(row)
}

func (r *projectContextRepo) ListByProjectID(ctx context.Context, projectID string) ([]domain.ProjectContextSection, error) {
	const q = `
		SELECT id, project_id, heading, content, agent_role, task_id, version, created_at, updated_at
		FROM project_context_sections
		WHERE project_id = $1
		ORDER BY created_at ASC`
	rows, err := r.pool.Query(ctx, q, projectID)
	if err != nil { return nil, err }
	defer rows.Close()
	var result []domain.ProjectContextSection
	for rows.Next() {
		s, err := scanSection(rows)
		if err != nil { return nil, err }
		result = append(result, s)
	}
	return result, rows.Err()
}

func (r *projectContextRepo) DeleteByProjectID(ctx context.Context, projectID string) error {
	_, err := r.pool.Exec(ctx, `DELETE FROM project_context_sections WHERE project_id = $1`, projectID)
	return err
}

type sectionScanner interface{ Scan(dest ...any) error }

func scanSection(row sectionScanner) (domain.ProjectContextSection, error) {
	var s domain.ProjectContextSection
	var createdAt, updatedAt time.Time
	err := row.Scan(&s.ID, &s.ProjectID, &s.Heading, &s.Content, &s.AgentRole, &s.TaskID, &s.Version, &createdAt, &updatedAt)
	s.CreatedAt, s.UpdatedAt = createdAt, updatedAt
	return s, err
}
```

- [ ] **Step 2: Create infra/mock/project_context_repo.go**

```go
package mock

import (
	"context"
	"fmt"
	"github.com/forge-ai/forge/api/domain"
)

type ProjectContextRepo struct {
	UpsertSectionFn     func(ctx context.Context, s domain.ProjectContextSection) (domain.ProjectContextSection, error)
	ListByProjectIDFn   func(ctx context.Context, projectID string) ([]domain.ProjectContextSection, error)
	DeleteByProjectIDFn func(ctx context.Context, projectID string) error
}

func (m *ProjectContextRepo) UpsertSection(ctx context.Context, s domain.ProjectContextSection) (domain.ProjectContextSection, error) {
	if m.UpsertSectionFn == nil { return domain.ProjectContextSection{}, fmt.Errorf("mock: UpsertSectionFn not set") }
	return m.UpsertSectionFn(ctx, s)
}
func (m *ProjectContextRepo) ListByProjectID(ctx context.Context, projectID string) ([]domain.ProjectContextSection, error) {
	if m.ListByProjectIDFn == nil { return nil, fmt.Errorf("mock: ListByProjectIDFn not set") }
	return m.ListByProjectIDFn(ctx, projectID)
}
func (m *ProjectContextRepo) DeleteByProjectID(ctx context.Context, projectID string) error {
	if m.DeleteByProjectIDFn == nil { return fmt.Errorf("mock: DeleteByProjectIDFn not set") }
	return m.DeleteByProjectIDFn(ctx, projectID)
}
```

- [ ] **Step 3: Build + commit**

```bash
cd /Users/cookie/project/forge/apps/api && go build ./... && git add apps/api/infra/postgres/project_context_repo.go apps/api/infra/mock/project_context_repo.go && git commit -m "feat(api): add ProjectContextRepo postgres implementation and mock"
```

---

## Task P3: Internal handler endpoints + router + main.go

**Files:**
- Modify: `apps/api/api/handler/internal.go`
- Modify: `apps/api/api/handler/internal_test.go`
- Modify: `apps/api/api/router.go`
- Modify: `apps/api/cmd/server/main.go`

- [ ] **Step 1: Write failing tests for internal context endpoints**

In `apps/api/api/handler/internal_test.go`, add:

```go
func TestInternalHandler_UpsertSection_Success(t *testing.T) {
	want := domain.ProjectContextSection{
		ID: "s-1", ProjectID: "proj-1", Heading: "Data Models", Content: "User has id, email", Version: 1,
	}
	contextRepo := &mock.ProjectContextRepo{
		UpsertSectionFn: func(_ context.Context, s domain.ProjectContextSection) (domain.ProjectContextSection, error) {
			return want, nil
		},
	}
	h := handler.NewInternalHandler(nil, nil, contextRepo)
	r := chi.NewRouter()
	r.Put("/internal/projects/{projectID}/context/{heading}", h.UpsertSection)

	body := `{"content":"User has id, email","agentRole":"schema","taskId":"T001"}`
	req := httptest.NewRequest(http.MethodPut, "/internal/projects/proj-1/context/Data%20Models", strings.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d: %s", w.Code, w.Body.String())
	}
}

func TestInternalHandler_GetSections_Success(t *testing.T) {
	sections := []domain.ProjectContextSection{
		{ID: "s-1", Heading: "App Overview", Content: "A task manager"},
	}
	contextRepo := &mock.ProjectContextRepo{
		ListByProjectIDFn: func(_ context.Context, projectID string) ([]domain.ProjectContextSection, error) {
			return sections, nil
		},
	}
	h := handler.NewInternalHandler(nil, nil, contextRepo)
	r := chi.NewRouter()
	r.Get("/internal/projects/{projectID}/context", h.GetSections)

	req := httptest.NewRequest(http.MethodGet, "/internal/projects/proj-1/context", nil)
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Errorf("expected 200, got %d", w.Code)
	}
}
```

Run: `cd apps/api && go test ./api/handler/... -run TestInternalHandler_Upsert -run TestInternalHandler_GetSections 2>&1 | tail -5`
Expected: compile error — `NewInternalHandler` signature mismatch.

- [ ] **Step 2: Update internal.go**

Add `contextRepo domain.ProjectContextRepository` to `InternalHandler` struct. Update `NewInternalHandler`:

```go
func NewInternalHandler(
    taskRepo  domain.TaskRepository,
    agentRepo domain.AgentRepository,
    contextRepo domain.ProjectContextRepository,
) *InternalHandler {
    return &InternalHandler{taskRepo: taskRepo, agentRepo: agentRepo, contextRepo: contextRepo}
}
```

Add two new handlers at end of `internal.go`:

```go
// PUT /internal/projects/{projectID}/context/{heading}
func (h *InternalHandler) UpsertSection(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	heading, _ := url.PathUnescape(chi.URLParam(r, "heading"))
	var body struct {
		Content   string `json:"content"`
		AgentRole string `json:"agentRole"`
		TaskID    string `json:"taskId"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON")
		return
	}
	section, err := h.contextRepo.UpsertSection(r.Context(), domain.ProjectContextSection{
		ProjectID: projectID,
		Heading:   heading,
		Content:   body.Content,
		AgentRole: body.AgentRole,
		TaskID:    body.TaskID,
	})
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	middleware.WriteJSON(w, http.StatusOK, section)
}

// GET /internal/projects/{projectID}/context
func (h *InternalHandler) GetSections(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	sections, err := h.contextRepo.ListByProjectID(r.Context(), projectID)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if sections == nil { sections = []domain.ProjectContextSection{} }

	// Also support ?format=markdown for full text rendering
	if r.URL.Query().Get("format") == "markdown" {
		var sb strings.Builder
		for _, s := range sections {
			sb.WriteString("## " + s.Heading + "\n\n" + s.Content + "\n\n")
		}
		w.Header().Set("Content-Type", "text/plain")
		w.WriteHeader(http.StatusOK)
		w.Write([]byte(sb.String()))
		return
	}
	middleware.WriteJSONList(w, sections, len(sections), 1, 100)
}
```

Add `"net/url"` and `"strings"` to imports.

- [ ] **Step 3: Update router.go, main.go**

In `RouterDeps`, add `Context *handler.ProjectContextHandler` (or reuse internal for context ops). Add internal routes:

```go
r.Put("/projects/{projectID}/context/{heading}", deps.Internal.UpsertSection)
r.Get("/projects/{projectID}/context",           deps.Internal.GetSections)
```

In `main.go`:
```go
contextRepo := postgres.NewProjectContextRepo(pool)
internalHandler := handler.NewInternalHandler(taskRepo, agentRepo, contextRepo)
```

- [ ] **Step 4: Run all Go tests**

```bash
cd /Users/cookie/project/forge/apps/api && go test ./... 2>&1 | tail -10
```

- [ ] **Step 5: Commit**

```bash
git add apps/api/api/handler/internal.go apps/api/api/handler/internal_test.go apps/api/api/router.go apps/api/cmd/server/main.go
git commit -m "feat(api): add project context section endpoints (UpsertSection, GetSections)"
```

---

## Task P4: Agent Service — ProjectContextClient + orchestrator integration

**Files:**
- Create: `apps/agent/src/lib/project-context-client.ts`
- Modify: `apps/agent/src/orchestrator/orchestrator.ts`
- Modify: `apps/agent/src/orchestrator/orchestrator.test.ts`

- [ ] **Step 1: Create project-context-client.ts**

```ts
// apps/agent/src/lib/project-context-client.ts
const FORGE_API_URL = process.env['FORGE_API_URL'] ?? ''
const INTERNAL_TOKEN = process.env['INTERNAL_TOKEN'] ?? ''

const ROLE_SECTIONS: Record<string, string[]> = {
  schema: ['App Overview', 'Architecture Decisions'],
  logic:  ['App Overview', 'Data Models', 'API Contracts'],
  api:    ['App Overview', 'Data Models', 'Architecture Decisions'],
  ui:     ['App Overview', 'Available Hooks'],
  page:   ['App Overview', 'Available Hooks', 'Available UI Components', 'API Contracts'],
}

export interface ProjectContextClient {
  upsertSection(projectId: string, heading: string, content: string, agentRole: string, taskId: string): Promise<void>
  getRelevantContext(projectId: string, role: string): Promise<string>
}

export function createProjectContextClient(): ProjectContextClient | null {
  if (!FORGE_API_URL) return null

  const headers = {
    'Content-Type': 'application/json',
    'X-Internal-Token': INTERNAL_TOKEN,
  }

  return {
    async upsertSection(projectId, heading, content, agentRole, taskId) {
      await fetch(
        `${FORGE_API_URL}/internal/projects/${projectId}/context/${encodeURIComponent(heading)}`,
        {
          method: 'PUT',
          headers,
          body: JSON.stringify({ content, agentRole, taskId }),
          signal: AbortSignal.timeout(5000),
        },
      )
    },

    async getRelevantContext(projectId, role) {
      const needed = ROLE_SECTIONS[role]
      const url = new URL(`${FORGE_API_URL}/internal/projects/${projectId}/context`)
      url.searchParams.set('format', 'markdown')
      const res = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(5000) })
      if (!res.ok) return ''
      const full = await res.text()
      if (!needed) return full
      // Filter to relevant sections
      const sections = full.split(/^(?=## )/m)
      return sections
        .filter((s) => !s.startsWith('## ') || needed.some((n) => s.startsWith(`## ${n}`)))
        .join('')
    },
  }
}
```

- [ ] **Step 2: Write failing test in orchestrator.test.ts**

```ts
it('uses ProjectContextClient for read/write when provided', async () => {
  const upserted: Array<{ heading: string; content: string }> = []
  const contextClient = {
    upsertSection: async (_p: string, heading: string, content: string) => {
      upserted.push({ heading, content })
    },
    getRelevantContext: async () => '## App Overview\n\nTest app\n\n',
  }
  const orc = makeOrchestrator({ contextClient })
  await orc.run()
  // Verify at least one upsert happened (initial context write)
  expect(upserted.length).toBeGreaterThan(0)
})
```

Run to confirm it fails: `cd apps/agent && npx vitest run src/orchestrator/orchestrator.test.ts -t "ProjectContextClient" 2>&1 | tail -5`

- [ ] **Step 3: Update OrchestratorDeps in orchestrator.ts**

Add import:
```ts
import { type ProjectContextClient } from '../lib/project-context-client.js'
```

Add to `OrchestratorDeps`:
```ts
contextClient?: ProjectContextClient
```

- [ ] **Step 4: Update readRelevantContext()**

Replace the method body with:

```ts
private async readRelevantContext(role: AgentRole): Promise<string> {
  if (this.deps.contextClient) {
    return this.deps.contextClient.getRelevantContext(this.ctx.projectId, role)
  }
  // Fallback: sandbox file (used in tests and when FORGE_API_URL not set)
  const full = await this.readSandboxFile('contracts/project_context.md')
  if (!full) return ''
  const NEEDED: Record<AgentRole, string[]> = {
    schema: ['App Overview', 'Architecture Decisions'],
    logic:  ['App Overview', 'Data Models', 'API Contracts'],
    api:    ['App Overview', 'Data Models', 'Architecture Decisions'],
    ui:     ['App Overview', 'Available Hooks'],
    page:   ['App Overview', 'Available Hooks', 'Available UI Components', 'API Contracts'],
  }
  const needed = NEEDED[role]
  if (!needed) return full
  const sections = full.split(/^(?=## )/m)
  return sections
    .filter((s) => !s.startsWith('## ') || needed.some((n) => s.startsWith(`## ${n}`)))
    .join('')
}
```

- [ ] **Step 5: Update commitTask()**

Replace the context upsert block in `commitTask()`:

```ts
private async commitTask(task: PlanTask, _code: string): Promise<void> {
  const agent = this.builders[task.agent]
  if (!agent) return
  const update = (agent as any).contextUpdate(task, _code)
  if (!update) return

  if (this.deps.contextClient) {
    // Extract heading from the update string (first ## line)
    const headingMatch = update.match(/^## ([^\n]+)/m)
    const heading = headingMatch?.[1] ?? task.agent
    const content = update.replace(/^## [^\n]+\n/, '').trim()
    await this.deps.contextClient.upsertSection(this.ctx.projectId, heading, content, task.agent, task.id)
  } else {
    // Fallback: sandbox file
    const current = await this.readSandboxFile('contracts/project_context.md')
    await this.writeSandboxFile(
      'contracts/project_context.md',
      upsertContextSection(current, update),
    )
  }
}
```

- [ ] **Step 6: Update stepPlan() to write initial context**

In `stepPlan()`, after `const context = this.architect.buildInitialContext(...)`, add:

```ts
if (this.deps.contextClient) {
  // Write initial context sections to DB
  const sections = context.split(/^(?=## )/m).filter(s => s.startsWith('## '))
  for (const section of sections) {
    const headingMatch = section.match(/^## ([^\n]+)/)
    if (!headingMatch) continue
    const heading = headingMatch[1]!
    const content = section.replace(/^## [^\n]+\n/, '').trim()
    await this.deps.contextClient.upsertSection(this.ctx.projectId, heading, content, 'architect', 'init')
  }
} else {
  await this.writeSandboxFile('contracts/project_context.md', context)
}
```

Remove the existing `this.writeSandboxFile('contracts/project_context.md', context)` from stepPlan.

- [ ] **Step 7: Wire client in job-runner.ts**

In `apps/agent/src/job-runner.ts`:

```ts
import { createProjectContextClient } from './lib/project-context-client.js'
```

When constructing the Orchestrator:
```ts
const orc = new Orchestrator(job.projectId, userInput, {
  ...existing deps,
  contextClient: createProjectContextClient() ?? undefined,
})
```

- [ ] **Step 8: Run all tests**

```bash
cd /Users/cookie/project/forge/apps/agent && npx vitest run 2>&1 | tail -10
```
Expected: all tests pass (existing tests use no contextClient, so fall back to sandbox).

- [ ] **Step 9: Commit**

```bash
git add apps/agent/src/lib/project-context-client.ts apps/agent/src/orchestrator/orchestrator.ts apps/agent/src/orchestrator/orchestrator.test.ts apps/agent/src/job-runner.ts
git commit -m "feat(agent): replace sandbox project_context.md with DB-backed ProjectContextClient"
```
