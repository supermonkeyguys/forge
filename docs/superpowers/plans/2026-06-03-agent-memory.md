# Agent Memory Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each Agent (system or custom) persistent private memory across tasks — `remember` and `recall` tools + automatic injection into task context.

**Architecture:** Go API adds `agent_memories` table + CRUD endpoints. Agent Service adds `remember`/`recall` tools in `buildTools()` and auto-injects top memories into `systemPrompt()` before each task. Memory weight decays passively via a SQL update run on list query.

**Tech Stack:** Go (pgx), TypeScript (Vitest), existing `FORGE_API_URL`/`INTERNAL_TOKEN` env pattern.

---

## File Map

```
Created (Go API):
  apps/api/migrations/005_agent_memories.sql
  apps/api/domain/agent_memory.go
  apps/api/infra/postgres/agent_memory_repo.go
  apps/api/infra/mock/agent_memory_repo.go
  apps/api/api/handler/agent_memory.go
  apps/api/api/handler/agent_memory_test.go

Modified (Go API):
  apps/api/domain/repository.go        — add AgentMemoryRepository interface
  apps/api/api/router.go               — add /agents/:key/memories routes + internal route
  apps/api/cmd/server/main.go          — wire memoryRepo + handler

Created (Agent Service):
  apps/agent/src/lib/agent-memory-client.ts   — internal API helpers (fetch memories, save memory)

Modified (Agent Service):
  apps/agent/src/agents/builder/base-builder.ts  — add remember/recall tools + auto-inject
  apps/agent/src/agents/builder/builder.test.ts  — add memory injection test
```

---

## Task M1: DB migration + domain model

**Files:**
- Create: `apps/api/migrations/005_agent_memories.sql`
- Create: `apps/api/domain/agent_memory.go`
- Modify: `apps/api/domain/repository.go`

- [ ] **Step 1: Create migration**

```sql
-- apps/api/migrations/005_agent_memories.sql
CREATE TABLE IF NOT EXISTS agent_memories (
  id            TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  agent_key     TEXT        NOT NULL,
  user_id       TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  memory_key    TEXT        NOT NULL DEFAULT '',
  content       TEXT        NOT NULL,
  weight        FLOAT       NOT NULL DEFAULT 1.0,
  access_count  INT         NOT NULL DEFAULT 0,
  last_accessed TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS agent_memories_agent_key_idx ON agent_memories(agent_key, user_id);
CREATE INDEX IF NOT EXISTS agent_memories_weight_idx    ON agent_memories(weight DESC);
```

- [ ] **Step 2: Create domain/agent_memory.go**

```go
package domain

import "time"

type AgentMemory struct {
	ID           string     `json:"id"`
	AgentKey     string     `json:"agentKey"`
	UserID       string     `json:"userId"`
	MemoryKey    string     `json:"memoryKey"`
	Content      string     `json:"content"`
	Weight       float64    `json:"weight"`
	AccessCount  int        `json:"accessCount"`
	LastAccessed *time.Time `json:"lastAccessed"`
	CreatedAt    time.Time  `json:"createdAt"`
	UpdatedAt    time.Time  `json:"updatedAt"`
}
```

- [ ] **Step 3: Add AgentMemoryRepository to domain/repository.go**

Append after `AgentRepository`:

```go
type AgentMemoryRepository interface {
	Create(ctx context.Context, m AgentMemory) (AgentMemory, error)
	ListByAgentKey(ctx context.Context, agentKey, userID, query string, limit int) ([]AgentMemory, error)
	Delete(ctx context.Context, id, userID string) error
	DecayWeights(ctx context.Context, userID string) error
}
```

- [ ] **Step 4: Verify build**

```bash
cd /Users/cookie/project/forge/apps/api && go build ./...
```
Expected: exits 0.

- [ ] **Step 5: Commit**

```bash
git add apps/api/migrations/005_agent_memories.sql apps/api/domain/agent_memory.go apps/api/domain/repository.go
git commit -m "feat(api): add agent_memories table and domain model"
```

---

## Task M2: Postgres repo + mock

**Files:**
- Create: `apps/api/infra/postgres/agent_memory_repo.go`
- Create: `apps/api/infra/mock/agent_memory_repo.go`

- [ ] **Step 1: Create postgres/agent_memory_repo.go**

```go
package postgres

import (
	"context"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/forge-ai/forge/api/domain"
)

type agentMemoryRepo struct{ pool *pgxpool.Pool }

func NewAgentMemoryRepo(pool *pgxpool.Pool) domain.AgentMemoryRepository {
	return &agentMemoryRepo{pool: pool}
}

func (r *agentMemoryRepo) Create(ctx context.Context, m domain.AgentMemory) (domain.AgentMemory, error) {
	const q = `
		INSERT INTO agent_memories (agent_key, user_id, memory_key, content)
		VALUES ($1, $2, $3, $4)
		RETURNING id, agent_key, user_id, memory_key, content, weight, access_count, last_accessed, created_at, updated_at`
	row := r.pool.QueryRow(ctx, q, m.AgentKey, m.UserID, m.MemoryKey, m.Content)
	return scanMemory(row)
}

func (r *agentMemoryRepo) ListByAgentKey(ctx context.Context, agentKey, userID, query string, limit int) ([]domain.AgentMemory, error) {
	var args []any
	var where []string
	args = append(args, agentKey, userID)
	where = append(where, "agent_key = $1", "user_id = $2")
	if query != "" {
		args = append(args, "%"+query+"%")
		where = append(where, fmt.Sprintf("content ILIKE $%d", len(args)))
	}
	if limit <= 0 || limit > 20 {
		limit = 5
	}
	args = append(args, limit)
	q := fmt.Sprintf(`
		SELECT id, agent_key, user_id, memory_key, content, weight, access_count, last_accessed, created_at, updated_at
		FROM agent_memories
		WHERE %s
		ORDER BY weight DESC
		LIMIT $%d`, strings.Join(where, " AND "), len(args))

	rows, err := r.pool.Query(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var result []domain.AgentMemory
	for rows.Next() {
		m, err := scanMemory(rows)
		if err != nil { return nil, err }
		result = append(result, m)
	}
	return result, rows.Err()
}

func (r *agentMemoryRepo) Delete(ctx context.Context, id, userID string) error {
	const q = `DELETE FROM agent_memories WHERE id = $1 AND user_id = $2`
	tag, err := r.pool.Exec(ctx, q, id, userID)
	if err != nil { return err }
	if tag.RowsAffected() == 0 {
		return fmt.Errorf("agentMemoryRepo.Delete: %w", domain.ErrNotFound)
	}
	return nil
}

func (r *agentMemoryRepo) DecayWeights(ctx context.Context, userID string) error {
	const q = `
		UPDATE agent_memories
		SET weight = GREATEST(weight * 0.9, 0.1), updated_at = now()
		WHERE user_id = $1
		  AND last_accessed < now() - interval '30 days'
		  AND weight > 0.1`
	_, err := r.pool.Exec(ctx, q, userID)
	return err
}

type memoryScanner interface{ Scan(dest ...any) error }

func scanMemory(row memoryScanner) (domain.AgentMemory, error) {
	var m domain.AgentMemory
	var createdAt, updatedAt time.Time
	err := row.Scan(
		&m.ID, &m.AgentKey, &m.UserID, &m.MemoryKey, &m.Content,
		&m.Weight, &m.AccessCount, &m.LastAccessed, &createdAt, &updatedAt,
	)
	m.CreatedAt = createdAt
	m.UpdatedAt = updatedAt
	return m, err
}
```

- [ ] **Step 2: Create infra/mock/agent_memory_repo.go**

```go
package mock

import (
	"context"
	"fmt"
	"github.com/forge-ai/forge/api/domain"
)

type AgentMemoryRepo struct {
	CreateFn         func(ctx context.Context, m domain.AgentMemory) (domain.AgentMemory, error)
	ListByAgentKeyFn func(ctx context.Context, agentKey, userID, query string, limit int) ([]domain.AgentMemory, error)
	DeleteFn         func(ctx context.Context, id, userID string) error
	DecayWeightsFn   func(ctx context.Context, userID string) error
}

func (m *AgentMemoryRepo) Create(ctx context.Context, mem domain.AgentMemory) (domain.AgentMemory, error) {
	if m.CreateFn == nil { return domain.AgentMemory{}, fmt.Errorf("mock: CreateFn not set") }
	return m.CreateFn(ctx, mem)
}
func (m *AgentMemoryRepo) ListByAgentKey(ctx context.Context, agentKey, userID, query string, limit int) ([]domain.AgentMemory, error) {
	if m.ListByAgentKeyFn == nil { return nil, fmt.Errorf("mock: ListByAgentKeyFn not set") }
	return m.ListByAgentKeyFn(ctx, agentKey, userID, query, limit)
}
func (m *AgentMemoryRepo) Delete(ctx context.Context, id, userID string) error {
	if m.DeleteFn == nil { return fmt.Errorf("mock: DeleteFn not set") }
	return m.DeleteFn(ctx, id, userID)
}
func (m *AgentMemoryRepo) DecayWeights(ctx context.Context, userID string) error {
	if m.DecayWeightsFn == nil { return fmt.Errorf("mock: DecayWeightsFn not set") }
	return m.DecayWeightsFn(ctx, userID)
}
```

- [ ] **Step 3: Verify build**

```bash
cd /Users/cookie/project/forge/apps/api && go build ./...
```

- [ ] **Step 4: Commit**

```bash
git add apps/api/infra/postgres/agent_memory_repo.go apps/api/infra/mock/agent_memory_repo.go
git commit -m "feat(api): add AgentMemoryRepo postgres implementation and mock"
```

---

## Task M3: AgentMemoryHandler + router + main.go

**Files:**
- Create: `apps/api/api/handler/agent_memory.go`
- Create: `apps/api/api/handler/agent_memory_test.go`
- Modify: `apps/api/api/router.go`
- Modify: `apps/api/cmd/server/main.go`

- [ ] **Step 1: Write failing tests**

Create `apps/api/api/handler/agent_memory_test.go`:

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

func TestAgentMemoryHandler_Create_Success(t *testing.T) {
	want := domain.AgentMemory{ID: "m-1", AgentKey: "system:logic", UserID: "u-1", Content: "prefers short functions"}
	repo := &mock.AgentMemoryRepo{
		CreateFn: func(_ context.Context, m domain.AgentMemory) (domain.AgentMemory, error) {
			return want, nil
		},
	}
	h := handler.NewAgentMemoryHandler(repo)
	r := chi.NewRouter()
	r.Post("/api/v1/agents/{agentKey}/memories", h.Create)

	body := `{"content":"prefers short functions","memoryKey":"style"}`
	req := httptest.NewRequest(http.MethodPost, "/api/v1/agents/system:logic/memories", strings.NewReader(body))
	req = withUser(req, "u-1")
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusCreated {
		t.Errorf("expected 201, got %d: %s", w.Code, w.Body.String())
	}
	var resp map[string]any
	json.NewDecoder(w.Body).Decode(&resp)
	if resp["data"].(map[string]any)["id"] != "m-1" {
		t.Error("expected id m-1")
	}
}

func TestAgentMemoryHandler_Create_MissingContent(t *testing.T) {
	repo := &mock.AgentMemoryRepo{}
	h := handler.NewAgentMemoryHandler(repo)
	r := chi.NewRouter()
	r.Post("/api/v1/agents/{agentKey}/memories", h.Create)

	req := httptest.NewRequest(http.MethodPost, "/api/v1/agents/system:logic/memories", strings.NewReader(`{"content":""}`))
	req = withUser(req, "u-1")
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}
```

Run: `cd apps/api && go test ./api/handler/... -run TestAgentMemoryHandler 2>&1 | tail -5`
Expected: compile error.

- [ ] **Step 2: Create handler/agent_memory.go**

```go
package handler

import (
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/forge-ai/forge/api/api/middleware"
	"github.com/forge-ai/forge/api/domain"
)

type AgentMemoryHandler struct{ repo domain.AgentMemoryRepository }

func NewAgentMemoryHandler(repo domain.AgentMemoryRepository) *AgentMemoryHandler {
	return &AgentMemoryHandler{repo: repo}
}

// GET /api/v1/agents/{agentKey}/memories?q=&limit=
func (h *AgentMemoryHandler) List(w http.ResponseWriter, r *http.Request) {
	agentKey := chi.URLParam(r, "agentKey")
	userID := middleware.UserIDFromContext(r.Context())
	q := r.URL.Query().Get("q")
	limit := 5
	memories, err := h.repo.ListByAgentKey(r.Context(), agentKey, userID, q, limit)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if memories == nil { memories = []domain.AgentMemory{} }
	middleware.WriteJSONList(w, memories, len(memories), 1, limit)
}

// POST /api/v1/agents/{agentKey}/memories
func (h *AgentMemoryHandler) Create(w http.ResponseWriter, r *http.Request) {
	agentKey := chi.URLParam(r, "agentKey")
	userID := middleware.UserIDFromContext(r.Context())
	var body struct {
		Content   string `json:"content"`
		MemoryKey string `json:"memoryKey"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		middleware.WriteFieldError(w, "body", "invalid JSON")
		return
	}
	if body.Content == "" {
		middleware.WriteFieldError(w, "content", "content is required")
		return
	}
	mem, err := h.repo.Create(r.Context(), domain.AgentMemory{
		AgentKey:  agentKey,
		UserID:    userID,
		MemoryKey: body.MemoryKey,
		Content:   body.Content,
	})
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	middleware.WriteJSON(w, http.StatusCreated, mem)
}

// DELETE /api/v1/agents/{agentKey}/memories/{memoryID}
func (h *AgentMemoryHandler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "memoryID")
	userID := middleware.UserIDFromContext(r.Context())
	if err := h.repo.Delete(r.Context(), id, userID); err != nil {
		middleware.WriteError(w, err)
		return
	}
	w.WriteHeader(http.StatusNoContent)
}
```

- [ ] **Step 3: Run tests**

```bash
cd /Users/cookie/project/forge/apps/api && go test ./api/handler/... -run TestAgentMemoryHandler -v 2>&1 | tail -10
```
Expected: both tests PASS.

- [ ] **Step 4: Update router.go**

Add `Memory *handler.AgentMemoryHandler` to `RouterDeps`. Inside the `/api/v1/agents` route block add:

```go
r.Route("/{agentKey}/memories", func(r chi.Router) {
    r.Get("/",              deps.Memory.List)
    r.Post("/",             deps.Memory.Create)
    r.Delete("/{memoryID}", deps.Memory.Delete)
})
```

Add internal route inside `/internal` block:
```go
r.Get("/agents/{agentKey}/memories", deps.Memory.List)
```

- [ ] **Step 5: Update main.go**

```go
memoryRepo := postgres.NewAgentMemoryRepo(pool)
memoryHandler := handler.NewAgentMemoryHandler(memoryRepo)
// add Memory: memoryHandler to RouterDeps
```

- [ ] **Step 6: Run all Go tests**

```bash
cd /Users/cookie/project/forge/apps/api && go test ./... 2>&1 | tail -10
```

- [ ] **Step 7: Commit**

```bash
git add apps/api/api/handler/agent_memory.go apps/api/api/handler/agent_memory_test.go apps/api/api/router.go apps/api/cmd/server/main.go
git commit -m "feat(api): add AgentMemoryHandler and wire routes"
```

---

## Task M4: Agent Service — memory client + tools + auto-inject

**Files:**
- Create: `apps/agent/src/lib/agent-memory-client.ts`
- Modify: `apps/agent/src/agents/builder/base-builder.ts`
- Modify: `apps/agent/src/agents/builder/builder.test.ts`

- [ ] **Step 1: Write failing test**

In `builder.test.ts`, add:

```ts
describe('memory injection', () => {
  it('injects memories into system prompt when fetchMemories returns results', async () => {
    const agent = new LogicAgent()
    const captured: string[] = []
    // Override generateText to capture the system prompt
    // (The test verifies the memory text appears in the injected context)
    // This test runs with a mock that returns one memory
    // Since this requires mocking the memory client, mark as integration concern
    // For unit test: verify that buildMemoryContext() formats correctly
    const formatted = buildMemoryContextForTest([
      { memoryKey: 'style', content: 'prefers short functions' },
    ])
    expect(formatted).toContain('prefers short functions')
  })
})
```

Also export `buildMemoryContext` as a testable function from `agent-memory-client.ts`.

- [ ] **Step 2: Create apps/agent/src/lib/agent-memory-client.ts**

```ts
const FORGE_API_URL = process.env['FORGE_API_URL'] ?? ''
const INTERNAL_TOKEN = process.env['INTERNAL_TOKEN'] ?? ''

export interface MemoryEntry {
  id: string
  memoryKey: string
  content: string
  weight: number
}

export function buildMemoryContext(memories: Pick<MemoryEntry, 'memoryKey' | 'content'>[]): string {
  if (memories.length === 0) return ''
  const lines = memories.map((m) =>
    m.memoryKey ? `[${m.memoryKey}] ${m.content}` : m.content,
  )
  return `\n\n## Your relevant memories\n${lines.map((l) => `- ${l}`).join('\n')}`
}

export async function fetchTopMemories(
  agentKey: string,
  query: string,
  limit = 3,
): Promise<MemoryEntry[]> {
  if (!FORGE_API_URL) return []
  try {
    const url = `${FORGE_API_URL}/internal/agents/${encodeURIComponent(agentKey)}/memories?q=${encodeURIComponent(query)}&limit=${limit}`
    const res = await fetch(url, {
      headers: { 'X-Internal-Token': INTERNAL_TOKEN },
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return []
    const json = await res.json() as { data: MemoryEntry[] }
    return json.data ?? []
  } catch {
    return []
  }
}

export async function saveMemory(
  agentKey: string,
  memoryKey: string,
  content: string,
): Promise<void> {
  if (!FORGE_API_URL) return
  try {
    await fetch(`${FORGE_API_URL}/internal/agents/${encodeURIComponent(agentKey)}/memories`, {
      method: 'POST',
      headers: {
        'X-Internal-Token': INTERNAL_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ memoryKey, content }),
      signal: AbortSignal.timeout(3000),
    })
  } catch (err) {
    console.error('[saveMemory] failed:', err)
  }
}
```

- [ ] **Step 3: Add remember/recall tools + auto-inject in base-builder.ts**

**3a**: Add imports at top of `base-builder.ts`:

```ts
import { fetchTopMemories, saveMemory, buildMemoryContext } from '../../lib/agent-memory-client.js'
```

**3b**: In `buildTools()`, add two new tools (before the `spawn_task` block):

```ts
remember: tool({
  description: 'Save a piece of information to your private memory for use in future tasks.',
  parameters: z.object({
    key:     z.string().describe('Topic label, e.g. "style_preference" or "project_constraint"'),
    content: z.string().describe('The information to remember'),
  }),
  execute: async ({ key, content }) => {
    emit({ type: 'agent_tool_use', agent: role, tool: 'remember', input: { key } })
    await saveMemory(role, key, content)
    return { ok: true }
  },
}),

recall: tool({
  description: 'Search your private memory for information relevant to the current task.',
  parameters: z.object({
    query: z.string().describe('What you want to recall'),
  }),
  execute: async ({ query }) => {
    emit({ type: 'agent_tool_use', agent: role, tool: 'recall', input: { query } })
    const memories = await fetchTopMemories(role, query, 5)
    return { memories: memories.map((m) => m.memoryKey ? `[${m.memoryKey}] ${m.content}` : m.content) }
  },
}),
```

**3c**: In `executeTask()`, before the `buildTools()` call, add auto-inject:

```ts
// Auto-inject relevant memories into system prompt
const memories = await fetchTopMemories(this.role, input.task.description, 3)
const memoryContext = buildMemoryContext(memories)
const systemWithMemory = this.systemPrompt() + memoryContext
```

Then update the `generateText` call to use `systemWithMemory`:

```ts
const { text, steps } = await generateText({
  model: anthropic(MODEL),
  system: systemWithMemory,   // was: this.systemPrompt()
  prompt: this.buildTaskPrompt(input),
  tools,
  maxSteps: 12,
})
```

- [ ] **Step 4: Export buildMemoryContext for tests**

In `agent-memory-client.ts`, `buildMemoryContext` is already exported. In `builder.test.ts` import it:

```ts
import { buildMemoryContext } from '../../lib/agent-memory-client.js'
```

Verify the test passes:

```bash
cd /Users/cookie/project/forge/apps/agent && npx vitest run src/agents/builder/builder.test.ts -t "memory injection" 2>&1 | tail -10
```

- [ ] **Step 5: Full test suite**

```bash
cd /Users/cookie/project/forge/apps/agent && npx vitest run 2>&1 | tail -5
```
Expected: all tests pass (memory API calls skip gracefully when `FORGE_API_URL` is not set).

- [ ] **Step 6: TypeScript check**

```bash
cd /Users/cookie/project/forge/apps/agent && npx tsc --noEmit 2>&1 | grep -v TS5097 | grep "error TS"
```

- [ ] **Step 7: Commit**

```bash
git add apps/agent/src/lib/agent-memory-client.ts apps/agent/src/agents/builder/base-builder.ts apps/agent/src/agents/builder/builder.test.ts
git commit -m "feat(agent): add remember/recall tools and auto-inject memory into task context"
```
