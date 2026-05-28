# Backend Test Pyramid — Forge API

**Date:** 2026-05-28  
**Scope:** `apps/api/`  
**Status:** Approved for implementation

---

## 背景

现有测试状态：

| 层 | 状态 |
|---|---|
| `domain/` 纯函数单元测试 | ✅ 完整 |
| `api/handler/` mock 单元测试 | ✅ 完整 |
| `api/middleware/` 单元测试 | ✅ 存在 |
| `infra/postgres/` | ❌ 完全空白 |
| 集成冒烟（全链路） | ❌ 空白 |

本次只新增两层，不改动已有测试。

---

## 金字塔结构

```
          /\
         /E2E\          ← 不在本次范围（Playwright 已存在）
        /──────\
       / 集成层  \       ← 6 条冒烟：完整链路 API → 真实 DB
      /──────────\
     /  infra 层  \     ← postgres repo CRUD 正确性（真实 DB）
    /──────────────\
   /   handler 层   \   ← 已有 mock 测试，不动
  /──────────────────\
 /     domain 层      \ ← 已有纯函数测试，不动
/──────────────────────\
```

---

## 新增依赖

`apps/api/go.mod` 新增：

```
github.com/testcontainers/testcontainers-go
github.com/testcontainers/testcontainers-go/modules/postgres
```

仅在 `//go:build integration` 文件中引用，不污染生产二进制。

---

## 共享基础设施

### `infra/testutil/db.go`

```go
//go:build integration

package testutil

// SetupTestDB 启动 PostgreSQL 17 容器，运行 migrations/001_init.sql，
// 返回 pool 和自动 cleanup。
// 使用 TestMain 中的 m.Run() 前后共享同一容器，避免每个测试重启。
func SetupTestDB(t *testing.T) *pgxpool.Pool
```

设计要点：
- 容器使用 `testcontainers/postgres` 模块，内置 `wait.ForLog("database system is ready")`
- `t.Cleanup` 中只清理数据（TRUNCATE），不销毁容器（容器在 TestMain 级别销毁）
- 迁移文件路径：`../../migrations/001_init.sql`（相对于 testutil 包）

---

## 层一：infra/postgres 测试

**Build tag：** `//go:build integration`

**文件结构：**

```
infra/postgres/
├── user_repo_test.go
├── project_repo_test.go
├── task_repo_test.go
└── setup_test.go        ← TestMain，管理容器生命周期
```

### user_repo 测试用例（5 个）

| 用例 | 验证点 |
|---|---|
| Create 成功 | 返回有 ID、email 正确、password 字段保留 |
| GetByEmail 存在 | 返回正确 User |
| GetByEmail 不存在 | 返回 `domain.ErrNotFound` |
| GetByID 存在 | 返回正确 User |
| Create 重复邮箱 | 返回 `domain.ErrAlreadyExists` |

### project_repo 测试用例（7 个）

| 用例 | 验证点 |
|---|---|
| Create 成功 | ID 非空、status = idle、preview_url = "" |
| GetByID 存在 | 字段完整 |
| GetByID 不存在 | `domain.ErrNotFound` |
| ListByUserID 有数据 | 按 created_at DESC 排序 |
| ListByUserID 无数据 | 返回空 slice，不报错 |
| UpdateStatus 成功 | status 和 preview_url 已更新 |
| Delete 成功 | 后续 GetByID 返回 ErrNotFound |

### task_repo 测试用例（6 个）

| 用例 | 验证点 |
|---|---|
| Create 成功 | ID 非空、status = idle、error_msg = "" |
| GetByID 存在 | 字段完整 |
| GetByID 不存在 | `domain.ErrNotFound` |
| ListByProjectID 有数据 | 按 created_at DESC 排序 |
| ListByProjectID 无数据 | 返回空 slice |
| UpdateStatus 成功 | status、preview_url、error_msg 已更新 |

**共 18 个 infra 层用例。**

---

## 层二：集成冒烟测试

**Build tag：** `//go:build integration`

**文件：** `api/integration_test.go`

**策略：** 用 `httptest.NewServer` 启动完整路由（真实中间件 + 真实 repo + 真实 DB），通过标准 `net/http` 客户端发请求。`agentURL` 设为空字符串，跳过 Agent dispatch。

### 6 条冒烟路径（顺序执行，共享状态）

```
1. POST /api/v1/auth/register
   → 201，响应 body 包含 token 和 user.id
   → 保存 token、userID 供后续用例复用

2. POST /api/v1/auth/login（用步骤1的凭据）
   → 200，返回新 token

3. POST /api/v1/projects
   → 201，status = "idle"，保存 projectID

4. POST /api/v1/projects/:id/tasks
   → 201，status = "idle"，保存 taskID

5. GET /api/v1/projects/:id/tasks
   → 200，data 数组长度 >= 1，包含步骤4创建的 task

6. GET /api/v1/projects/:id/stream（SSE）
   → 200，Content-Type = text/event-stream
   → 读第一个 SSE 事件行，验证包含 "agent_event"
   → 读到第一个事件后立即关闭连接（不长轮询）
```

**共 6 个集成层用例。**

---

## Makefile

现有命令已正确，补充 `-count=1` 禁用缓存：

```makefile
test-go-integration:
    cd apps/api && go test -tags integration -count=1 -timeout 120s ./...
```

`-timeout 120s` 为容器启动预留足够时间。

---

## CI 注意事项

- GitHub Actions / GitLab CI 等标准环境均支持 Docker-in-Docker，testcontainers 开箱可用
- 普通单元测试（`make test-go`）不受影响，不需要 Docker
- 集成测试在独立 job 或手动触发，不阻塞主流水线

---

## 文件清单（新增）

```
apps/api/
├── infra/
│   ├── testutil/
│   │   └── db.go                     ← 共享容器 setup
│   └── postgres/
│       ├── setup_test.go             ← TestMain
│       ├── user_repo_test.go
│       ├── project_repo_test.go
│       └── task_repo_test.go
└── api/
    └── integration_test.go           ← 6 条冒烟
```

**不修改任何现有文件。**
