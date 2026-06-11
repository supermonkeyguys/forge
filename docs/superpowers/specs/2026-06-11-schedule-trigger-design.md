# Schedule Trigger — Design Spec

**Date:** 2026-06-11  
**Status:** Approved  
**Scope:** Add cron-based automatic execution to workflows. A workflow with `status='active'` and `trigger.type='schedule'` fires automatically according to its cron expression. No webhook support in this spec.

---

## Background

The `WorkflowTrigger` type already exists in the DB schema and TypeScript types:
```typescript
{ type: 'manual' | 'webhook' | 'schedule', config?: Record<string, unknown> }
```
Currently only `manual` is functional. This spec wires up `schedule`.

Workflow `status` values:
- `'draft'` — not triggered automatically (default)
- `'active'` — schedule is live

---

## Goals

1. A workflow with `trigger.type='schedule'` and `status='active'` runs automatically on its cron schedule
2. The schedule is set and previewed in the canvas editor
3. Activating/deactivating the schedule is a single toggle
4. A new run is created in `workflow_runs` for each scheduled execution (traceable)

---

## Architecture

### Trigger Config Schema

`WorkflowTrigger.config` for schedule triggers:
```json
{ "cron": "0 8 * * *", "tz": "Asia/Shanghai" }
```

Standard 5-field cron (minute hour day-of-month month day-of-week). Examples:
- `"0 8 * * *"` — every day at 08:00
- `"0 9 * * 1-5"` — weekdays at 09:00
- `"*/30 * * * *"` — every 30 minutes

Timezone uses IANA format (`Asia/Shanghai`, `UTC`, `America/New_York`).

### CronScheduler (Go)

Lives in `apps/api/internal/scheduler/scheduler.go`. Started once at server startup, runs for the lifetime of the process.

```
CronScheduler
  ├── c: *cron.Cron              (robfig/cron v3, with seconds disabled)
  ├── repo: WorkflowRepository
  ├── runRepo: WorkflowRunRepository
  ├── agentURL: string
  ├── mu: sync.Mutex
  └── entryIDs: map[workflowID]cron.EntryID

Start(ctx) error
  → query: SELECT * FROM workflows WHERE status='active' AND trigger->>'type'='schedule'
  → for each: addEntry(workflow)
  → c.Start()

Refresh(workflowID, trigger WorkflowTrigger, status WorkflowStatus)
  → mu.Lock()
  → if old entry exists: c.Remove(entryID); delete(entryIDs, workflowID)
  → if status=='active' && trigger.type=='schedule': addEntry(...)
  → mu.Unlock()

Remove(workflowID string)
  → mu.Lock()
  → if entry exists: c.Remove(entryID); delete(entryIDs, workflowID)
  → mu.Unlock()

addEntry(workflow) error
  → parse cron expr with timezone from trigger.config
  → entryID = c.AddFunc(expr, func() { s.triggerRun(workflow.ID) })
  → entryIDs[workflow.ID] = entryID

triggerRun(workflowID string)
  → fetch latest workflow from DB
  → create WorkflowRun record (status=queued)
  → POST agent /run-workflow { taskId: run.ID, projectId: wf.UserID, workflowDefinition }
  → on error: mark run failed; log error
  → update workflow last_triggered_at = now()
```

### DB Migration

```sql
-- 012_workflow_last_triggered.sql
ALTER TABLE workflows ADD COLUMN IF NOT EXISTS last_triggered_at TIMESTAMPTZ;
```

`last_triggered_at` is updated after each successful trigger dispatch. It's informational only — cron scheduling is managed by the in-process scheduler (not DB-driven polling), so restart does NOT replay missed runs.

### Wiring into main.go

```go
scheduler := scheduler.NewCronScheduler(workflowRepo, workflowRunRepo, cfg.AgentServiceURL)
if err := scheduler.Start(context.Background()); err != nil {
    logger.Error("cron scheduler failed to start", "error", err)
    os.Exit(1)
}
defer scheduler.Stop()
```

The `WorkflowHandler` receives a `*scheduler.CronScheduler` and calls `scheduler.Refresh(id, trigger, status)` after every successful `Update`.

---

## UI

### Canvas Editor Toolbar

A "触发" button added to the right of the toolbar in `edit.tsx`. Clicking opens `TriggerPanel` as an overlay anchored to the button.

```
[← 工作流名] ── [重新布局] [添加步骤] [保存] [执行]  [⏰ 触发]
```

### TriggerPanel.tsx

Slide-down panel from the toolbar:

```
┌──────────────────────────────────────────┐
│  触发方式                                │
│  ○ 手动   ● 定时                         │
│                                          │
│  Cron 表达式                             │
│  [0 8 * * *_______________________]      │
│  每天 08:00                              │  ← human-readable hint
│                                          │
│  时区                                    │
│  [Asia/Shanghai ▾]                       │
│                                          │
│  状态                                    │
│  ○ 草稿（不自动触发）                    │
│  ● 启用（按计划自动触发）                │
│                                          │
│  [取消]  [保存触发设置]                  │
└──────────────────────────────────────────┘
```

"保存触发设置" calls `useUpdateWorkflow({ id, trigger, status })`. On success the scheduler refreshes automatically via the backend Update handler.

The human-readable cron hint is produced client-side (a minimal parser, no library needed for basic cases: handle `* * * * *`, `0 N * * *`, `0 N * * 1-5`, `*/N * * * *`).

---

## Files

### New (3)

| File | Purpose |
|------|---------|
| `apps/api/internal/scheduler/scheduler.go` | CronScheduler implementation |
| `apps/api/migrations/012_workflow_last_triggered.sql` | Add last_triggered_at column |
| `apps/web/src/pages/workflows/[id]/components/TriggerPanel.tsx` | Trigger settings UI |

### Modified (5)

| File | Change |
|------|--------|
| `apps/api/go.mod` | Add `github.com/robfig/cron/v3` |
| `apps/api/cmd/server/main.go` | Instantiate + start CronScheduler |
| `apps/api/api/handler/workflow.go` | Inject scheduler; call `Refresh` on Update, `Remove` on Delete |
| `apps/api/api/router.go` | Pass scheduler to WorkflowHandler constructor |
| `apps/web/src/pages/workflows/[id]/edit.tsx` | Add 触发 toolbar button + TriggerPanel |

---

## Error Handling

- **Invalid cron expression** (save time): Go API returns 400 with "invalid cron expression"
- **Agent unavailable at trigger time**: mark WorkflowRun as failed; log error; do NOT retry in this version
- **Workflow deleted while scheduled**: The `Delete` handler calls `scheduler.Remove(workflowID)` which removes the cron entry. `CronScheduler` exposes `Remove(workflowID string)` alongside `Refresh`. The `apps/api/api/handler/workflow.go` Delete handler calls it after a successful DB delete.
- **Server restart**: `Start()` re-reads all active workflows from DB and re-registers them. Runs that would have fired during downtime are NOT replayed (intentional — a digital employee that missed its slot should not flood the user with catch-up runs)

---

## Out of Scope

- Webhook trigger
- Retry on failure
- Multi-instance deduplication (single API server assumed)
- Cron expression visual builder
- Run history per workflow (exists via workflow_runs table already)
