# Network Request Optimizations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate 800KB+ task payload on `/tasks/latest`, reduce polling overhead via visibility pause and exponential backoff, and virtualize Kanban card lists to handle large project counts.

**Architecture:** Five independent tasks. Tasks 1–2 are a backend/frontend pair: backend adds a lean `/tasks/latest` (no eventsJson) and a separate `/tasks/latest/events` endpoint; frontend switches `restoreFromDB` to hit the new endpoint. Tasks 3–4 are pure frontend. Task 5 adds React Query select transforms to prevent heavy fields from entering the render cycle.

**Tech Stack:** Go (chi router, pgx), React 18, TanStack Query v5, TanStack Virtual v3, Vitest

---

## File Map

| File | Change |
|------|--------|
| `apps/api/domain/repository.go` | Add `GetLatestSummaryByProjectID` to interface |
| `apps/api/infra/postgres/task_repo.go` | Implement `GetLatestSummaryByProjectID` + `scanTaskSummary` |
| `apps/api/infra/mock/task_repo.go` | Add `GetLatestSummaryByProjectIDFn` |
| `apps/api/api/handler/task.go` | `Latest` uses summary; add `LatestEvents` handler |
| `apps/api/api/router.go` | Register `GET /latest/events` route |
| `apps/api/api/handler/task_test.go` | Tests for lean Latest + new LatestEvents |
| `packages/core/task/use-agent-events.ts` | restoreFromDB URL + polling refactor |
| `apps/web/src/pages/projects/components/KanbanColumn.tsx` | TanStack Virtual scrolling |
| `packages/core/project/use-projects.ts` | staleTime bump |
| `packages/core/task/use-tasks.ts` | select transform to strip eventsJson |

---

### Task 1: Go backend — lean `/tasks/latest` + new `/tasks/latest/events`

**Files:**
- Modify: `apps/api/domain/repository.go`
- Modify: `apps/api/infra/postgres/task_repo.go`
- Modify: `apps/api/infra/mock/task_repo.go`
- Modify: `apps/api/api/handler/task.go`
- Modify: `apps/api/api/router.go`
- Modify: `apps/api/api/handler/task_test.go`

**Why:** `GET /tasks/latest` currently returns the full `Task` including `eventsJson` — potentially 800KB. The endpoint is called on every workspace load just to check status/previewUrl. We split it: default returns a lean summary (no `eventsJson`); a new `/tasks/latest/events` endpoint returns the full task (including eventsJson) only when explicitly requested.

- [ ] **Step 1: Add `GetLatestSummaryByProjectID` to the TaskRepository interface**

In `apps/api/domain/repository.go`, add one line to `TaskRepository`:

```go
type TaskRepository interface {
	Create(ctx context.Context, t Task) (Task, error)
	GetByID(ctx context.Context, id string) (Task, error)
	GetLatestByProjectID(ctx context.Context, projectID string) (Task, error)
	GetLatestSummaryByProjectID(ctx context.Context, projectID string) (Task, error) // no eventsJson
	ListByProjectID(ctx context.Context, projectID string, limit, offset int) ([]Task, error)
	UpdateStatus(ctx context.Context, id string, status TaskStatus, previewURL, errorMsg string) (Task, error)
	SaveEvents(ctx context.Context, id string, eventsJSON string) error
}
```

- [ ] **Step 2: Implement `GetLatestSummaryByProjectID` in postgres repo**

In `apps/api/infra/postgres/task_repo.go`, add after the existing `GetLatestByProjectID` method:

```go
func (r *taskRepo) GetLatestSummaryByProjectID(ctx context.Context, projectID string) (domain.Task, error) {
	const q = `
		SELECT id, project_id, user_id, prompt, status, preview_url, error_msg, created_at, updated_at
		FROM tasks WHERE project_id = $1
		ORDER BY created_at DESC LIMIT 1`

	row := r.pool.QueryRow(ctx, q, projectID)
	task, err := scanTaskSummary(row)
	if errors.Is(err, pgx.ErrNoRows) {
		return domain.Task{}, fmt.Errorf("taskRepo.GetLatestSummaryByProjectID: %w", domain.ErrNotFound)
	}
	return task, err
}
```

Also add `scanTaskSummary` after the existing `scanTask` function (note: 9 fields, no events_json):

```go
func scanTaskSummary(row interface {
	Scan(dest ...any) error
}) (domain.Task, error) {
	var t domain.Task
	var status string
	err := row.Scan(
		&t.ID, &t.ProjectID, &t.UserID, &t.Prompt,
		&status, &t.PreviewURL, &t.ErrorMsg,
		&t.CreatedAt, &t.UpdatedAt,
	)
	if err != nil {
		return domain.Task{}, err
	}
	t.Status = domain.TaskStatus(status)
	return t, nil
}
```

- [ ] **Step 3: Add mock for `GetLatestSummaryByProjectID`**

In `apps/api/infra/mock/task_repo.go`, add to the struct and method:

```go
type TaskRepo struct {
	CreateFn                         func(ctx context.Context, t domain.Task) (domain.Task, error)
	GetByIDFn                        func(ctx context.Context, id string) (domain.Task, error)
	GetLatestByProjectIDFn           func(ctx context.Context, projectID string) (domain.Task, error)
	GetLatestSummaryByProjectIDFn    func(ctx context.Context, projectID string) (domain.Task, error)
	ListByProjectIDFn                func(ctx context.Context, projectID string, limit, offset int) ([]domain.Task, error)
	UpdateStatusFn                   func(ctx context.Context, id string, status domain.TaskStatus, previewURL, errorMsg string) (domain.Task, error)
	SaveEventsFn                     func(ctx context.Context, id string, eventsJSON string) error
}
```

Add the method after `GetLatestByProjectID`:

```go
func (m *TaskRepo) GetLatestSummaryByProjectID(ctx context.Context, projectID string) (domain.Task, error) {
	if m.GetLatestSummaryByProjectIDFn == nil {
		return domain.Task{}, fmt.Errorf("mock: GetLatestSummaryByProjectIDFn not set")
	}
	return m.GetLatestSummaryByProjectIDFn(ctx, projectID)
}
```

- [ ] **Step 4: Update `Latest` handler to use summary, add `LatestEvents` handler**

In `apps/api/api/handler/task.go`, replace the `Latest` method and add `LatestEvents`:

```go
// GET /api/v1/projects/{projectID}/tasks/latest
// Returns the most recent task summary (no eventsJson) for a project, or null if none.
func (h *TaskHandler) Latest(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	userID := middleware.UserIDFromContext(r.Context())

	task, err := h.taskRepo.GetLatestSummaryByProjectID(r.Context(), projectID)
	if errors.Is(err, domain.ErrNotFound) {
		middleware.WriteJSON(w, http.StatusOK, nil)
		return
	}
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if task.UserID != userID {
		middleware.WriteError(w, domain.ErrForbidden)
		return
	}

	middleware.WriteJSON(w, http.StatusOK, task)
}

// GET /api/v1/projects/{projectID}/tasks/latest/events
// Returns the most recent task including full eventsJson. Only call when restoring history.
func (h *TaskHandler) LatestEvents(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	userID := middleware.UserIDFromContext(r.Context())

	task, err := h.taskRepo.GetLatestByProjectID(r.Context(), projectID)
	if errors.Is(err, domain.ErrNotFound) {
		middleware.WriteJSON(w, http.StatusOK, nil)
		return
	}
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if task.UserID != userID {
		middleware.WriteError(w, domain.ErrForbidden)
		return
	}

	middleware.WriteJSON(w, http.StatusOK, task)
}
```

- [ ] **Step 5: Register `/latest/events` route in router**

In `apps/api/api/router.go`, inside the tasks sub-router add the new route **before** `/{taskID}` (chi matches in registration order):

```go
r.Route("/tasks", func(r chi.Router) {
    r.Get("/", deps.Task.List)
    r.Post("/", deps.Task.Create)
    r.Get("/latest", deps.Task.Latest)
    r.Get("/latest/events", deps.Task.LatestEvents)
    r.Get("/{taskID}", deps.Task.Get)
})
```

- [ ] **Step 6: Write tests for lean `Latest` and new `LatestEvents`**

In `apps/api/api/handler/task_test.go`, add these two tests:

```go
func TestTaskHandler_Latest_ExcludesEventsJson(t *testing.T) {
	const secret = "test-secret"
	projectRepo := &mock.ProjectRepo{}
	taskRepo := &mock.TaskRepo{
		GetLatestSummaryByProjectIDFn: func(_ context.Context, projectID string) (domain.Task, error) {
			return domain.Task{
				ID:         "task-1",
				ProjectID:  projectID,
				UserID:     "u1",
				Status:     domain.TaskStatusDone,
				PreviewURL: "http://preview.example.com",
				EventsJSON: "", // summary — never populated
			}, nil
		},
	}

	h := handler.NewTaskHandler(taskRepo, projectRepo, "")
	r := chi.NewRouter()
	r.Use(middleware.RequireAuth(secret))
	r.Get("/projects/{projectID}/tasks/latest", h.Latest)

	req := httptest.NewRequest(http.MethodGet, "/projects/proj-1/tasks/latest", nil)
	req.Header.Set("Authorization", taskToken("u1", secret))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp struct {
		Data map[string]interface{} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if _, ok := resp.Data["eventsJson"]; ok {
		t.Error("eventsJson must be absent from lean Latest response")
	}
}

func TestTaskHandler_LatestEvents_IncludesEventsJson(t *testing.T) {
	const secret = "test-secret"
	projectRepo := &mock.ProjectRepo{}
	taskRepo := &mock.TaskRepo{
		GetLatestByProjectIDFn: func(_ context.Context, projectID string) (domain.Task, error) {
			return domain.Task{
				ID:         "task-1",
				ProjectID:  projectID,
				UserID:     "u1",
				Status:     domain.TaskStatusDone,
				EventsJSON: `[{"type":"agent_start"}]`,
			}, nil
		},
	}

	h := handler.NewTaskHandler(taskRepo, projectRepo, "")
	r := chi.NewRouter()
	r.Use(middleware.RequireAuth(secret))
	r.Get("/projects/{projectID}/tasks/latest/events", h.LatestEvents)

	req := httptest.NewRequest(http.MethodGet, "/projects/proj-1/tasks/latest/events", nil)
	req.Header.Set("Authorization", taskToken("u1", secret))
	w := httptest.NewRecorder()
	r.ServeHTTP(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d: %s", w.Code, w.Body.String())
	}

	var resp struct {
		Data map[string]interface{} `json:"data"`
	}
	if err := json.Unmarshal(w.Body.Bytes(), &resp); err != nil {
		t.Fatalf("unmarshal: %v", err)
	}
	if resp.Data["eventsJson"] == nil {
		t.Error("eventsJson must be present in LatestEvents response")
	}
}
```

- [ ] **Step 7: Run Go tests**

```bash
cd /Users/cookie/project/forge/apps/api && go test ./...
```

Expected: all tests pass including the two new ones.

- [ ] **Step 8: Commit**

```bash
cd /Users/cookie/project/forge
git add apps/api/domain/repository.go \
        apps/api/infra/postgres/task_repo.go \
        apps/api/infra/mock/task_repo.go \
        apps/api/api/handler/task.go \
        apps/api/api/router.go \
        apps/api/api/handler/task_test.go
git commit -m "perf(api): lean /tasks/latest strips eventsJson, add /tasks/latest/events"
```

---

### Task 2: Frontend — update `restoreFromDB` to use new events endpoint

**Files:**
- Modify: `packages/core/task/use-agent-events.ts`

**Why:** `restoreFromDB` currently fetches `/tasks/latest` which now returns no `eventsJson`. It must call `/tasks/latest/events` instead to get the full event history for history restoration.

- [ ] **Step 1: Read current `use-agent-events.ts`**

File: `packages/core/task/use-agent-events.ts`

Locate `restoreFromDB` — it fetches `/api/v1/projects/${projectId}/tasks/latest` and reads `task.eventsJson`.

- [ ] **Step 2: Change the URL in `restoreFromDB`**

Find this line:
```ts
const res = await fetch(`/api/v1/projects/${projectId}/tasks/latest`, {
```

Replace with:
```ts
const res = await fetch(`/api/v1/projects/${projectId}/tasks/latest/events`, {
```

No other changes needed — the response shape is identical (same `domain.Task` struct, just this endpoint always includes `eventsJson`).

- [ ] **Step 3: Build check**

```bash
cd /Users/cookie/project/forge/apps/web && bash scripts/check-bundle.sh
```

Expected: build passes, chunk sizes unchanged.

- [ ] **Step 4: Commit**

```bash
cd /Users/cookie/project/forge
git add packages/core/task/use-agent-events.ts
git commit -m "perf(web): restoreFromDB hits /tasks/latest/events to get full event history"
```

---

### Task 3: Frontend — tab visibility pause + exponential backoff in polling

**Files:**
- Modify: `packages/core/task/use-agent-events.ts`

**Why:** The agent polling currently runs every 1 second regardless of tab visibility or idle state. Two improvements: (1) pause polling when the browser tab is hidden, resume when visible; (2) apply exponential backoff (max 15s) when consecutive polls return no new events, reducing unnecessary requests during long build phases.

**Important:** The current `setInterval`-based loop must be replaced with a recursive `setTimeout` approach to support variable intervals.

- [ ] **Step 1: Read current polling code in `use-agent-events.ts`**

In the second `useEffect` (agent service polling), locate:
```ts
void poll()
const interval = setInterval(poll, 1000)
return () => {
  active = false
  clearInterval(interval)
}
```

- [ ] **Step 2: Replace setInterval with recursive setTimeout + visibility pause**

Replace the section from `void poll()` through the cleanup return with:

```ts
let emptyRuns = 0
let nextPollId: ReturnType<typeof setTimeout> | null = null

const scheduleNext = () => {
  if (!active) return
  // Increase delay after 3 consecutive empty polls: 1s → 1.5s → 2.3s → ... → 15s max
  const delay = emptyRuns === 0
    ? 1_000
    : Math.min(1_000 * Math.pow(1.5, Math.floor(emptyRuns / 3)), 15_000)
  nextPollId = setTimeout(() => { void poll() }, delay)
}

// Kick off first poll immediately, then self-schedule
void poll()

// Resume polling when tab becomes visible again
const handleVisible = () => {
  if (!document.hidden && active) {
    if (nextPollId !== null) clearTimeout(nextPollId)
    void poll()
  }
}
document.addEventListener('visibilitychange', handleVisible)

return () => {
  active = false
  if (nextPollId !== null) clearTimeout(nextPollId)
  document.removeEventListener('visibilitychange', handleVisible)
}
```

Also update the `poll` function to: (a) skip when tab hidden, (b) track empty runs, (c) self-schedule instead of relying on setInterval. Find the `const poll = async () => {` block and update the end of the try block and the return path:

After `sinceIndex = job.totalEvents` and the event loop, add:

```ts
// Track empty runs for backoff
if (job.events.length === 0) {
  emptyRuns++
} else {
  emptyRuns = 0
}
```

Replace the terminal check block:
```ts
// OLD:
if (TERMINAL_STATUSES.has(job.status)) {
  active = false
}
```
With:
```ts
if (TERMINAL_STATUSES.has(job.status)) {
  active = false
} else {
  scheduleNext()
}
```

At the top of `poll`, add the visibility guard:
```ts
const poll = async () => {
  if (!active) return
  if (document.hidden) return  // visibilitychange will reschedule
  try {
    // ... existing fetch logic unchanged ...
```

In the `catch` block, add scheduling:
```ts
} catch {
  // agent service not running yet — retry next tick
  emptyRuns++
  scheduleNext()
}
```

- [ ] **Step 3: Build check**

```bash
cd /Users/cookie/project/forge/apps/web && bash scripts/check-bundle.sh
```

Expected: build passes.

- [ ] **Step 4: TypeScript check for packages/core**

```bash
cd /Users/cookie/project/forge && pnpm --filter @forge/core exec tsc --noEmit
```

Expected: no errors.

- [ ] **Step 5: Commit**

```bash
cd /Users/cookie/project/forge
git add packages/core/task/use-agent-events.ts
git commit -m "perf(web): pause agent polling when tab hidden, exponential backoff on empty polls"
```

---

### Task 4: TanStack Virtual for KanbanColumn

**Files:**
- Modify: `apps/web/package.json` (via pnpm add)
- Modify: `apps/web/src/pages/projects/components/KanbanColumn.tsx`

**Why:** KanbanColumn renders all project cards with `projects.map()`. With many projects (100+), all DOM nodes are created and laid out even when off-screen. `@tanstack/react-virtual` renders only the cards visible in the scrollable column container, keeping DOM size constant regardless of project count.

**Note on animations:** `KanbanCard` uses `document.querySelector('[data-card-id="..."]')` for status-change animations. Virtual scroll may remove off-screen cards from DOM. This is acceptable: a card must be in view for its status to change (the user must be watching it), so the animation target will be in DOM when needed.

- [ ] **Step 1: Install @tanstack/react-virtual**

```bash
cd /Users/cookie/project/forge && pnpm --filter @forge/web add @tanstack/react-virtual
```

Expected: package added to `apps/web/package.json` dependencies.

- [ ] **Step 2: Update KanbanColumn to use useVirtualizer**

Replace the full content of `apps/web/src/pages/projects/components/KanbanColumn.tsx`:

```tsx
import { useRef } from 'react'
import { useVirtualizer } from '@tanstack/react-virtual'
import type { Project } from '@forge/core'
import { cn } from '../../../lib/utils'
import { KanbanCard } from './KanbanCard'
import { COL_META, type ColKey } from '../index'

const ITEM_HEIGHT = 104 // px — estimated card height (card padding + content + gap)
const OVERSCAN = 3     // extra cards rendered above/below viewport

export function KanbanColumn({
  colKey, projects, onOpen, onDelete,
}: {
  colKey: ColKey
  projects: Project[]
  onOpen: (id: string) => void
  onDelete: (id: string) => void
}) {
  const meta = COL_META[colKey]
  const parentRef = useRef<HTMLDivElement>(null)

  const rowVirtualizer = useVirtualizer({
    count: projects.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => ITEM_HEIGHT,
    overscan: OVERSCAN,
    gap: 8, // matches gap-2 (0.5rem = 8px)
  })

  return (
    <div className="flex w-[236px] flex-shrink-0 flex-col gap-2">
      {/* Column header */}
      <div className="flex flex-shrink-0 items-center gap-1.5 px-0.5">
        <span className={cn('h-[7px] w-[7px] flex-shrink-0 rounded-full', meta.dotClass)} />
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-white/38">
          {meta.label}
        </span>
        <span className="ml-auto rounded-full bg-white/[0.06] px-1.5 py-px text-[11px] text-white/20">
          {projects.length}
        </span>
      </div>

      {/* Scrollable lane */}
      <div
        ref={parentRef}
        className={cn(
          'col-lane-inner flex flex-1 flex-col overflow-y-auto rounded-[14px] border-[1.5px] border-dashed p-2.5',
          meta.laneClass,
        )}
      >
        {projects.length === 0 ? (
          <div className="flex flex-1 items-center justify-center text-[11.5px] italic text-white/16">
            {meta.emptyText}
          </div>
        ) : (
          <div
            style={{ height: `${rowVirtualizer.getTotalSize()}px`, position: 'relative' }}
          >
            {rowVirtualizer.getVirtualItems().map((virtualRow) => {
              const project = projects[virtualRow.index]
              return (
                <div
                  key={project.id}
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    width: '100%',
                    height: `${virtualRow.size}px`,
                    transform: `translateY(${virtualRow.start}px)`,
                  }}
                >
                  <KanbanCard
                    project={project}
                    onOpen={onOpen}
                    onDelete={onDelete}
                  />
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Build check**

```bash
cd /Users/cookie/project/forge/apps/web && bash scripts/check-bundle.sh
```

Expected: build passes. A new small `@tanstack/react-virtual` chunk should appear (< 20 KB).

- [ ] **Step 4: Run web tests**

```bash
cd /Users/cookie/project/forge/apps/web && npm run test -- --run
```

Expected: tests pass (no KanbanColumn tests exist, existing store tests unaffected).

- [ ] **Step 5: Commit**

```bash
cd /Users/cookie/project/forge
git add apps/web/package.json apps/web/src/pages/projects/components/KanbanColumn.tsx
# also add pnpm-lock.yaml if changed
git add pnpm-lock.yaml 2>/dev/null || true
git commit -m "perf(web): virtualize KanbanColumn with @tanstack/react-virtual"
```

---

### Task 5: React Query optimizations — staleTime + select transforms

**Files:**
- Modify: `packages/core/project/use-projects.ts`
- Modify: `packages/core/task/use-tasks.ts`

**Why:** Two targeted React Query improvements. (1) Projects list changes infrequently — raise `staleTime` from the global 30s to 60s to halve background refetch frequency. (2) Task list queries (used in workspace) scan the `events_json` DB column and put it in the React Query cache as a JS string — the `select` option lets us strip it before the data enters the render cycle, preventing 800KB strings from being referenced by components that only need status/previewUrl.

- [ ] **Step 1: Add staleTime to useProjects**

In `packages/core/project/use-projects.ts`, update the `useQuery` call in `useProjects`:

```ts
return useQuery({
  queryKey: ['projects'],
  queryFn: async () => {
    const raw = await api.getList<Project>('/api/v1/projects', token ?? undefined)
    return parseWithFallback(ProjectListResponseSchema, raw, {
      data: [],
      total: 0,
      page: 1,
      limit: 20,
    })
  },
  enabled: token !== null,
  staleTime: 60_000, // projects change infrequently; halve background refetches
})
```

- [ ] **Step 2: Add select transform to useTask (single task)**

In `packages/core/task/use-tasks.ts`, locate the `useTask` hook (or the single task query) and add a `select` that removes `eventsJson` from the cached value for list contexts. Read the file first to see what exists.

If `use-tasks.ts` has a `useTaskList` or returns tasks with `eventsJson`, add:

```ts
select: (data) => {
  if (!data) return data
  // Strip eventsJson from cached task — use /tasks/latest/events when history is needed
  const { eventsJson: _dropped, ...summary } = data as (typeof data & { eventsJson?: string })
  return summary as typeof data
},
```

If the file has no such hook, skip this step (eventsJson is only in the `tasks/latest` path which Task 1 already handles).

- [ ] **Step 3: Build check**

```bash
cd /Users/cookie/project/forge/apps/web && bash scripts/check-bundle.sh
```

Expected: build passes.

- [ ] **Step 4: Run core tests**

```bash
cd /Users/cookie/project/forge && pnpm --filter @forge/core test -- --run
```

Expected: all tests pass.

- [ ] **Step 5: Commit**

```bash
cd /Users/cookie/project/forge
git add packages/core/project/use-projects.ts packages/core/task/use-tasks.ts
git commit -m "perf(web): raise projects staleTime to 60s, strip eventsJson via select transform"
```
