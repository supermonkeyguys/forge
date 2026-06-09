# Go API 重构计划：数字员工平台后端

## 目标
在现有 Go API 基础上新增 Workflow、Capability 数据模型和路由，
同时保持现有 projects/tasks 接口向前兼容。

## 原则
- **不删旧表**，只新增表和字段
- 现有 `/api/v1/projects` 和 `/api/v1/projects/:id/tasks` 接口完全不变
- 新增 `/api/v1/workflows` 和 `/api/v1/capabilities` 接口

---

## 涉及文件

**新建：**
- `apps/api/domain/workflow.go`
- `apps/api/domain/capability.go`
- `apps/api/infra/postgres/workflow_repo.go`
- `apps/api/infra/postgres/capability_repo.go`
- `apps/api/api/handler/workflow.go`
- `apps/api/api/handler/capability.go`
- `apps/api/migrations/010_workflows.sql`

**修改：**
- `apps/api/domain/repository.go` — 新增 WorkflowRepository、CapabilityRepository 接口
- `apps/api/domain/task.go` — Task 结构体新增 WorkflowID 字段
- `apps/api/infra/postgres/task_repo.go` — UpdateStatus/Create 支持 workflow_id
- `apps/api/api/router.go` — 注册新路由
- `apps/api/api/handler/router_deps.go` 或 `router.go` — 新增 deps
- `apps/api/cmd/server/main.go` — 初始化新 repo

---

## 任务

### Task 1：定义 Workflow 领域模型

**文件：** `apps/api/domain/workflow.go`

```go
package domain

import "time"

type WorkflowStatus string

const (
    WorkflowStatusDraft  WorkflowStatus = "draft"
    WorkflowStatusActive WorkflowStatus = "active"
)

// WorkflowStep 是 WorkflowDefinition 中的一个执行步骤（存为 JSONB）
type WorkflowStep struct {
    ID           string   `json:"id"`
    Name         string   `json:"name"`
    Capability   string   `json:"capability"`  // browser|http|llm|notify|code
    Instructions string   `json:"instructions"`
    DependsOn    []string `json:"depends_on"`
    Config       map[string]any `json:"config,omitempty"`
}

// WorkflowDefinition 是 AI 生成的流程定义，存为 JSONB
type WorkflowDefinition struct {
    Steps []WorkflowStep `json:"steps"`
}

type WorkflowTrigger struct {
    Type   string         `json:"type"`   // manual|webhook|schedule
    Config map[string]any `json:"config,omitempty"`
}

type Workflow struct {
    ID          string             `json:"id"`
    UserID      string             `json:"userId"`
    Name        string             `json:"name"`
    Description string             `json:"description"`
    Definition  WorkflowDefinition `json:"definition"`
    Trigger     WorkflowTrigger    `json:"trigger"`
    Status      WorkflowStatus     `json:"status"`
    CreatedAt   time.Time          `json:"createdAt"`
    UpdatedAt   time.Time          `json:"updatedAt"`
}
```

**验证：** `go build ./...` 通过

---

### Task 2：定义 Capability 领域模型

**文件：** `apps/api/domain/capability.go`

```go
package domain

import "time"

type CapabilityType string

const (
    CapabilityTypeBrowser CapabilityType = "browser"
    CapabilityTypeHTTP    CapabilityType = "http"
    CapabilityTypeLLM     CapabilityType = "llm"
    CapabilityTypeNotify  CapabilityType = "notify"
    CapabilityTypeCode    CapabilityType = "code"
    CapabilityTypeFile    CapabilityType = "file"
)

type Capability struct {
    ID           string         `json:"id"`
    UserID       string         `json:"userId"`
    Name         string         `json:"name"`
    Type         CapabilityType `json:"type"`
    Description  string         `json:"description"`
    ConfigSchema map[string]any `json:"configSchema"` // JSON Schema for config
    Config       map[string]any `json:"config"`        // actual config (encrypted sensitive fields)
    CreatedAt    time.Time      `json:"createdAt"`
    UpdatedAt    time.Time      `json:"updatedAt"`
}
```

**验证：** `go build ./...` 通过

---

### Task 3：添加 Repository 接口

**文件：** `apps/api/domain/repository.go`（追加到末尾）

```go
type WorkflowRepository interface {
    Create(ctx context.Context, w Workflow) (Workflow, error)
    GetByID(ctx context.Context, id string) (Workflow, error)
    ListByUserID(ctx context.Context, userID string) ([]Workflow, error)
    Update(ctx context.Context, w Workflow) (Workflow, error)
    Delete(ctx context.Context, id string) error
}

type CapabilityRepository interface {
    Create(ctx context.Context, c Capability) (Capability, error)
    GetByID(ctx context.Context, id string) (Capability, error)
    ListByUserID(ctx context.Context, userID string) ([]Capability, error)
    Update(ctx context.Context, c Capability) (Capability, error)
    Delete(ctx context.Context, id string) error
}
```

**验证：** `go build ./...` 通过

---

### Task 4：DB Migration

**文件：** `apps/api/migrations/010_workflows.sql`

```sql
-- Workflows table
CREATE TABLE IF NOT EXISTS workflows (
    id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id     TEXT NOT NULL,
    name        TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    definition  JSONB NOT NULL DEFAULT '{"steps":[]}',
    trigger     JSONB NOT NULL DEFAULT '{"type":"manual"}',
    status      TEXT NOT NULL DEFAULT 'draft',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_workflows_user_id ON workflows(user_id);

-- Capabilities table
CREATE TABLE IF NOT EXISTS capabilities (
    id            TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    user_id       TEXT NOT NULL,
    name          TEXT NOT NULL,
    type          TEXT NOT NULL,
    description   TEXT NOT NULL DEFAULT '',
    config_schema JSONB NOT NULL DEFAULT '{}',
    config        JSONB NOT NULL DEFAULT '{}',
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_capabilities_user_id ON capabilities(user_id);

-- Add workflow_id to tasks (nullable, backward compatible)
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS workflow_id TEXT REFERENCES workflows(id) ON DELETE SET NULL;
```

运行验证：
```bash
cd apps/api && go run ./cmd/migrate
```

---

### Task 5：Postgres 实现 WorkflowRepository

**文件：** `apps/api/infra/postgres/workflow_repo.go`

```go
package postgres

import (
    "context"
    "encoding/json"
    "errors"
    "github.com/jackc/pgx/v5"
    "github.com/forge-ai/forge/api/domain"
)

type workflowRepo struct{ db *pgx.Conn }

func NewWorkflowRepo(db *pgx.Conn) domain.WorkflowRepository {
    return &workflowRepo{db: db}
}

func (r *workflowRepo) Create(ctx context.Context, w domain.Workflow) (domain.Workflow, error) {
    defJSON, _ := json.Marshal(w.Definition)
    trigJSON, _ := json.Marshal(w.Trigger)
    row := r.db.QueryRow(ctx,
        `INSERT INTO workflows (id,user_id,name,description,definition,trigger,status,created_at,updated_at)
         VALUES (gen_random_uuid()::text,$1,$2,$3,$4,$5,$6,now(),now())
         RETURNING id,created_at,updated_at`,
        w.UserID, w.Name, w.Description, defJSON, trigJSON, w.Status,
    )
    return scanWorkflow(row, w)
}

func (r *workflowRepo) GetByID(ctx context.Context, id string) (domain.Workflow, error) {
    row := r.db.QueryRow(ctx,
        `SELECT id,user_id,name,description,definition,trigger,status,created_at,updated_at
         FROM workflows WHERE id=$1`, id)
    return scanWorkflowFull(row)
}

func (r *workflowRepo) ListByUserID(ctx context.Context, userID string) ([]domain.Workflow, error) {
    rows, err := r.db.Query(ctx,
        `SELECT id,user_id,name,description,definition,trigger,status,created_at,updated_at
         FROM workflows WHERE user_id=$1 ORDER BY created_at DESC`, userID)
    if err != nil { return nil, err }
    defer rows.Close()
    var list []domain.Workflow
    for rows.Next() {
        w, err := scanWorkflowFull(rows)
        if err != nil { return nil, err }
        list = append(list, w)
    }
    return list, nil
}

func (r *workflowRepo) Update(ctx context.Context, w domain.Workflow) (domain.Workflow, error) {
    defJSON, _ := json.Marshal(w.Definition)
    trigJSON, _ := json.Marshal(w.Trigger)
    _, err := r.db.Exec(ctx,
        `UPDATE workflows SET name=$1,description=$2,definition=$3,trigger=$4,status=$5,updated_at=now()
         WHERE id=$6`,
        w.Name, w.Description, defJSON, trigJSON, w.Status, w.ID,
    )
    if err != nil { return domain.Workflow{}, err }
    return r.GetByID(ctx, w.ID)
}

func (r *workflowRepo) Delete(ctx context.Context, id string) error {
    _, err := r.db.Exec(ctx, `DELETE FROM workflows WHERE id=$1`, id)
    return err
}

// scanWorkflowFull scans a full workflow row
type rowScanner interface {
    Scan(dest ...any) error
}

func scanWorkflowFull(row rowScanner) (domain.Workflow, error) {
    var w domain.Workflow
    var defJSON, trigJSON []byte
    err := row.Scan(&w.ID, &w.UserID, &w.Name, &w.Description,
        &defJSON, &trigJSON, &w.Status, &w.CreatedAt, &w.UpdatedAt)
    if err != nil {
        if errors.Is(err, pgx.ErrNoRows) { return w, domain.ErrNotFound }
        return w, err
    }
    _ = json.Unmarshal(defJSON, &w.Definition)
    _ = json.Unmarshal(trigJSON, &w.Trigger)
    return w, nil
}

func scanWorkflow(row rowScanner, base domain.Workflow) (domain.Workflow, error) {
    err := row.Scan(&base.ID, &base.CreatedAt, &base.UpdatedAt)
    return base, err
}
```

**验证：** `go build ./...` 通过

---

### Task 6：Postgres 实现 CapabilityRepository

**文件：** `apps/api/infra/postgres/capability_repo.go`

结构参考 workflow_repo.go，表字段对应 `capabilities` 表。字段：`id, user_id, name, type, description, config_schema, config, created_at, updated_at`。

JSONB 字段：`config_schema`、`config` 同样用 `json.Marshal/Unmarshal`。

**验证：** `go build ./...` 通过

---

### Task 7：Workflow HTTP Handler

**文件：** `apps/api/api/handler/workflow.go`

实现以下方法（参考现有 `task.go` 风格）：

```go
type WorkflowHandler struct {
    repo domain.WorkflowRepository
}

func NewWorkflowHandler(repo domain.WorkflowRepository) *WorkflowHandler

// POST /api/v1/workflows
func (h *WorkflowHandler) Create(w http.ResponseWriter, r *http.Request)
// 从 body 读取 {name, description, definition, trigger}，userID 从 middleware 取

// GET /api/v1/workflows
func (h *WorkflowHandler) List(w http.ResponseWriter, r *http.Request)
// 返回当前用户所有 workflows

// GET /api/v1/workflows/:id
func (h *WorkflowHandler) Get(w http.ResponseWriter, r *http.Request)
// 权限检查：workflow.UserID == 当前用户

// PUT /api/v1/workflows/:id
func (h *WorkflowHandler) Update(w http.ResponseWriter, r *http.Request)

// DELETE /api/v1/workflows/:id
func (h *WorkflowHandler) Delete(w http.ResponseWriter, r *http.Request)
```

返回格式统一用 `middleware.WriteJSON(w, http.StatusOK, data)`。

---

### Task 8：Capability HTTP Handler

**文件：** `apps/api/api/handler/capability.go`

同 WorkflowHandler 结构，实现 Create/List/Get/Update/Delete。

特殊处理：`config` 字段中敏感信息（密码、token）在存储前不加密（暂不实现加密，留注释 TODO）。

---

### Task 9：注册路由

**文件：** `apps/api/api/router.go`

在认证路由组内新增：

```go
// Workflows
r.Route("/workflows", func(r chi.Router) {
    r.Get("/", deps.Workflow.List)
    r.Post("/", deps.Workflow.Create)
    r.Get("/{workflowID}", deps.Workflow.Get)
    r.Put("/{workflowID}", deps.Workflow.Update)
    r.Delete("/{workflowID}", deps.Workflow.Delete)
})

// Capabilities
r.Route("/capabilities", func(r chi.Router) {
    r.Get("/", deps.Capability.List)
    r.Post("/", deps.Capability.Create)
    r.Get("/{capabilityID}", deps.Capability.Get)
    r.Put("/{capabilityID}", deps.Capability.Update)
    r.Delete("/{capabilityID}", deps.Capability.Delete)
})
```

RouterDeps 新增：
```go
Workflow    *handler.WorkflowHandler
Capability  *handler.CapabilityHandler
```

---

### Task 10：初始化注入

**文件：** `apps/api/cmd/server/main.go`

参考现有 taskRepo/projectRepo 初始化模式，新增：

```go
workflowRepo    := postgres.NewWorkflowRepo(db)
capabilityRepo  := postgres.NewCapabilityRepo(db)

deps := api.RouterDeps{
    // ... 现有字段不变 ...
    Workflow:   handler.NewWorkflowHandler(workflowRepo),
    Capability: handler.NewCapabilityHandler(capabilityRepo),
}
```

---

## 验收标准

```bash
cd apps/api

# 编译通过
go build ./...

# 迁移通过
go run ./cmd/migrate

# 接口可用
curl -X POST http://localhost:8080/api/v1/workflows \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"测试流程","description":"","definition":{"steps":[]},"trigger":{"type":"manual"}}'
# 期望：201 with workflow object

curl http://localhost:8080/api/v1/workflows \
  -H "Authorization: Bearer <token>"
# 期望：200 with array

curl http://localhost:8080/api/v1/capabilities \
  -H "Authorization: Bearer <token>"
# 期望：200 with array

# 旧接口不变
curl http://localhost:8080/api/v1/projects \
  -H "Authorization: Bearer <token>"
# 期望：200（旧接口正常）
```
