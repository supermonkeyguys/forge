# Design: Agent → Go API Status Callback Chain

**Date:** 2026-05-28  
**Status:** Approved

## Problem

Go API dispatches tasks to Agent Service via fire-and-forget `POST /run`. Agent job state (analyzing → planning → building → done) lives only in the Agent's in-memory `jobs` Map. Go API's `tasks` table `status` column stays `idle` forever. The SSE stream (`GET /tasks/:id/stream`) polls the DB every 2 seconds and always returns `idle` — the frontend never sees real progress.

Additionally, `dispatchToAgent` had two pre-existing bugs (fixed before this spec):
- URL was `/api/v1/jobs` instead of `/run`
- Body field was `prompt` instead of `userInput`

## Solution Overview

Agent calls `PATCH /internal/tasks/:id/status` on every state transition. Go API updates the DB. SSE picks up the change on next poll.

```
Frontend          Go API                    Agent Service
   │                 │                           │
   │ POST /tasks      │                           │
   │────────────────▶│                           │
   │                 │ POST /run                 │
   │                 │──────────────────────────▶│
   │                 │                           │ job running...
   │ GET /stream      │                           │
   │────────────────▶│                           │
   │                 │◀──────────────────────────│ PATCH /internal/tasks/:id/status
   │                 │  UPDATE tasks SET status   │  {status: "analyzing"}
   │◀────────────────│                           │
   │ status: analyzing│                           │
   │                 │◀──────────────────────────│ PATCH /internal/tasks/:id/status
   │                 │  UPDATE tasks SET status   │  {status: "done", previewUrl: "..."}
   │◀────────────────│                           │
   │ status: done     │                           │
```

## Go API Changes

### New handler: `api/handler/internal.go`

```go
type InternalHandler struct {
    taskRepo domain.TaskRepository
}

// PATCH /internal/tasks/{taskID}/status
func (h *InternalHandler) UpdateTaskStatus(w http.ResponseWriter, r *http.Request)
```

Request body:
```json
{
  "status": "building",
  "previewUrl": "",
  "errorMsg": ""
}
```

- Validates `status` against `domain.ValidTaskStatus()`; returns 400 on invalid value
- Calls `taskRepo.UpdateStatus(ctx, taskID, status, previewUrl, errorMsg)`
- Returns 200 + updated task JSON

### New middleware: `api/middleware/internal_auth.go`

```go
func RequireInternalToken(token string) func(http.Handler) http.Handler
```

- Reads `X-Internal-Token` request header
- If `token == ""` (not configured): skips check — allows local dev without config
- If header missing or doesn't match: returns 401 `{"error":"unauthorized"}`

### Router change: `api/router.go`

New `InternalHandler` field added to `RouterDeps`. New route group:

```go
r.Route("/internal", func(r chi.Router) {
    r.Use(middleware.RequireInternalToken(deps.InternalToken))
    r.Patch("/tasks/{taskID}/status", deps.Internal.UpdateTaskStatus)
})
```

No `RequireAuth` JWT middleware — this route is service-to-service only.

### Config change: `cmd/server/main.go`

New `InternalToken` field in `config` struct, read from `INTERNAL_TOKEN` env var (optional, empty = skip auth).

### Tests: `api/handler/internal_test.go`

| Case | Expected |
|------|----------|
| Valid token + valid status | 200, task updated |
| Wrong token | 401 |
| Missing token (token configured) | 401 |
| No token configured | 200 (skip check) |
| Invalid status value | 400 |
| Unknown taskID | 404 |

## Agent Service Changes

### New function: `notifyGoAPI()` in `src/index.ts`

```ts
async function notifyGoAPI(
  taskId: string,
  status: string,
  extras?: { previewUrl?: string; errorMsg?: string }
): Promise<void>
```

- Reads `FORGE_API_URL` (default `http://localhost:8080`) and `INTERNAL_TOKEN` env vars at call time
- If `FORGE_API_URL` is empty string: returns immediately (agent running standalone)
- On HTTP error or network failure: `console.error` and return — never throws
- Sends `PATCH {FORGE_API_URL}/internal/tasks/{taskId}/status` with `X-Internal-Token` header

### `runJob()` change: call `notifyGoAPI` in `onStateChange`

```ts
onStateChange: async (state: OrchestratorState, ctx: OrchestratorContext) => {
  job.status = state
  if (ctx.reviewUrl) job.reviewUrl = ctx.reviewUrl
  job.updatedAt = new Date().toISOString()
  if (job.taskId) {
    const extras = state === 'done'
      ? { previewUrl: job.previewUrl ?? undefined }
      : state === 'aborted'
      ? { errorMsg: job.error ?? undefined }
      : undefined
    await notifyGoAPI(job.taskId, state, extras)
  }
},
```

### New field: `Job.taskId`

Already added (pre-spec bug fix). Parsed from `POST /run` body, stored on Job.

### Environment variables

| Var | Side | Default | Purpose |
|-----|------|---------|---------|
| `INTERNAL_TOKEN` | Go API | `""` (skip) | Shared secret for internal endpoint |
| `FORGE_API_URL` | Agent | `http://localhost:8080` | Go API base URL for callbacks |
| `INTERNAL_TOKEN` | Agent | `""` | Must match Go API value |

### Tests: `src/index.test.ts` (new file)

| Case | Expected |
|------|----------|
| `onStateChange` fires → `notifyGoAPI` called with correct taskId + state | ✓ |
| `FORGE_API_URL` empty → `notifyGoAPI` returns without HTTP call | ✓ |
| HTTP call fails → error logged, no exception thrown | ✓ |
| Terminal state `done` → `previewUrl` included in body | ✓ |
| `job.taskId` is null → `notifyGoAPI` not called | ✓ |

## What Changes vs. Current State

| Component | Before | After |
|-----------|--------|-------|
| `task.status` in DB | always `idle` | updated on every state transition |
| SSE stream | always returns `idle` | returns real orchestrator state |
| Agent `runJob` | updates only in-memory `job.status` | also calls Go API via PATCH |
| Go API internal routes | none | `PATCH /internal/tasks/:id/status` |
| Security | n/a | `X-Internal-Token` header |

## Out of Scope

- BullMQ queue (Phase 1 upgrade, noted in index.ts comments)
- Agent pushing individual `ProgressEvent` entries to Go API (streaming agent thoughts — separate concern)
- `POST /confirm-draft` callback to Go API (PM review flow — separate feature)
