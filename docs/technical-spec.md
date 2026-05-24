# Forge — Technical Specification

> 本文档是 Forge 项目的技术方案与开发准则。
> 所有代码（人写的和 AI 生成的）必须遵守本文档的约定。

---

## 目录

1. [项目概述](#1-项目概述)
2. [整体架构](#2-整体架构)
3. [前端架构](#3-前端架构)
4. [后端架构](#4-后端架构)
5. [Agent Service 架构](#5-agent-service-架构)
6. [分层约束规则](#6-分层约束规则)
7. [测试策略](#7-测试策略)
8. [API 设计规范](#8-api-设计规范)
9. [错误处理规范](#9-错误处理规范)
10. [命名约定](#10-命名约定)
11. [环境与配置](#11-环境与配置)

---

## 1. 项目概述

Forge 是一个 AI 应用生成平台。用户用自然语言描述需求，AI Agent 团队协作生成、验证并交付可运行的全栈应用。

**核心差异化：**
- **透明度**：用户实时看到每个 Agent 的决策过程，不是黑盒
- **迭代友好**：变更是外科手术式的，不是全量重写
- **架构约束**：生成的代码强制分层，防止随迭代腐化

**技术栈总览：**

| 层 | 技术 | 说明 |
|---|---|---|
| 前端 | React 18 + Vite 5 | SPA，不用 Next.js |
| 状态管理 | TanStack Query v5 + Zustand v4 | 服务端状态 / 客户端状态严格分离 |
| 后端 | Go 1.22 + Chi v5 | API Server |
| 数据库 | PostgreSQL 17 + sqlc | 不用 ORM，SQL 生成类型安全代码 |
| Agent Service | Node.js 20 + Vercel AI SDK v4 | LLM 调用 + 任务编排 |
| LLM | Claude Sonnet 4.6（主）/ Haiku 4.5（辅） | Anthropic |
| 沙箱 | E2B | 运行用户生成的应用 |
| 任务队列 | BullMQ + Redis | Agent 任务调度 |
| 实时推送 | SSE（Server-Sent Events） | Agent 进度推送到前端 |

---

## 2. 整体架构

```
┌──────────────────────────────────────────────────────────────────┐
│                        React Frontend                             │
│                                                                  │
│  packages/core/          packages/ui/         apps/web/          │
│  (业务逻辑 hooks)         (纯 UI 组件)         (页面组装)          │
└─────────────────────────────┬────────────────────────────────────┘
                              │ HTTP REST + SSE
┌─────────────────────────────▼────────────────────────────────────┐
│                      Go API Server                                │
│                                                                  │
│  api/handler/    api/middleware/    domain/    infra/             │
│  (HTTP 薄层)     (auth/error)       (业务)     (DB/外部服务)       │
└─────────────────────────────┬────────────────────────────────────┘
                              │ HTTP / BullMQ (Redis)
┌─────────────────────────────▼────────────────────────────────────┐
│                   Node.js Agent Service                           │
│                                                                  │
│  orchestrator/           agents/               sandbox/          │
│  (状态机 + 调度)          (PM/Architect/...)    (E2B 封装)         │
└──────────────────────────────────────────────────────────────────┘
```

**数据流：**
```
用户输入
  → Go API 创建 Task 记录（PostgreSQL）
  → 发送 Job 到 BullMQ
  → Agent Service Worker 消费 Job
  → Orchestrator 驱动 Agent 团队执行
  → 每个 Agent 通过 E2B 写文件/运行代码
  → 进度事件通过 SSE 实时推送到前端
  → 最终结果（预览 URL）写回 Task 记录
```

---

## 3. 前端架构

### 3.1 包结构

```
forge/
├── packages/
│   ├── core/                    # 业务逻辑层（零 UI 依赖）
│   └── ui/                      # UI 组件层（零业务逻辑）
└── apps/
    └── web/                     # 应用层（只做组装）
```

### 3.2 packages/core — 业务逻辑层

**职责：** 所有与 UI 无关的逻辑，包括：
- API 调用（TanStack Query hooks）
- 客户端状态（Zustand stores）
- 数据转换、校验工具函数
- TypeScript 共享类型

**目录结构：**
```
packages/core/
├── api/
│   ├── client.ts          # fetch 封装，读 VITE_API_URL，统一错误处理
│   └── schema.ts          # parseWithFallback<T>(schema, data, fallback) 工具
├── auth/
│   ├── use-login.ts        # useMutation — POST /api/v1/auth/login
│   ├── use-me.ts           # useQuery — GET /api/v1/auth/me
│   ├── auth-store.ts       # Zustand — { token, user, setToken, logout }
│   └── auth.test.ts
├── project/
│   ├── use-projects.ts     # useQuery — GET /api/v1/projects
│   ├── use-create-project.ts # useMutation
│   └── project.test.ts
├── task/
│   ├── use-task.ts         # useQuery — GET /api/v1/tasks/:id
│   └── use-agent-events.ts # SSE 订阅，返回 AgentEvent[]
└── types/
    └── index.ts            # 与 contracts/ JSON schema 对齐的 TS 类型
```

**硬性规则：**
- ❌ 禁止 import `react-dom`
- ❌ 禁止 import `@forge/ui`
- ❌ 禁止 import 任何 `apps/` 路径
- ❌ 禁止直接使用 `localStorage`（用 StorageAdapter 接口）
- ✅ 允许 `react`（hooks）、`@tanstack/react-query`、`zustand`、`zod`

**Zustand Store 规范：**
```typescript
// ✅ 正确：选择器返回原始值
const token = useAuthStore(s => s.token)

// ❌ 错误：选择器每次返回新对象，导致无限渲染
const auth = useAuthStore(s => ({ token: s.token, user: s.user }))
// 改用：
const token = useAuthStore(s => s.token)
const user = useAuthStore(s => s.user)
```

**TanStack Query 规范：**
```typescript
// ✅ Query key 必须包含 workspaceId / projectId 等作用域
useQuery({ queryKey: ['projects', projectId, 'tasks'] })

// ✅ Mutation 在 onSettled 中 invalidate，不在 onSuccess
onSettled: () => queryClient.invalidateQueries({ queryKey: ['projects'] })
```

### 3.3 packages/ui — UI 组件层

**职责：** 原子 UI 组件，无业务语义，无 API 调用，无状态管理。

**目录结构：**
```
packages/ui/
├── button/
│   ├── button.tsx
│   └── button.stories.tsx
├── input/
│   ├── input.tsx
│   └── input.stories.tsx
├── badge/
├── card/
├── modal/
└── index.ts               # barrel export
```

**硬性规则：**
- ❌ 禁止 import `@forge/core`
- ❌ 禁止 import `zustand`、`@tanstack/react-query`
- ❌ 禁止在组件内发起任何网络请求
- ✅ Props 只接受纯数据和回调函数，不接受 Zustand store slice

**组件规范：**
```typescript
// ✅ 正确：Props 是纯数据
interface ButtonProps {
  label: string
  variant: 'primary' | 'ghost'
  disabled?: boolean
  onClick?: () => void
}

// ❌ 错误：组件内部调 API 或读 store
function UserButton() {
  const user = useAuthStore(s => s.user)  // 禁止
}
```

### 3.4 apps/web — 应用层

**职责：** 路由、页面组装。把 `@forge/core` 的 hooks 和 `@forge/ui` 的组件连接起来。

**目录结构：**
```
apps/web/src/
├── main.tsx               # Vite 入口，挂载 QueryClientProvider
├── routes.tsx             # react-router-dom 路由定义
├── pages/
│   ├── WorkspacePage.tsx  # 三栏布局：对话 | 协作流 | 预览
│   ├── ProjectsPage.tsx
│   └── LoginPage.tsx
├── components/            # 页面级组合组件（不是原子组件）
│   ├── agent-flow/        # Agent 协作可视化
│   └── preview-panel/     # E2B 预览 iframe
└── platform/
    └── navigation.tsx     # useNavigate 封装，共享代码通过此访问路由
```

**硬性规则：**
- ❌ 页面文件（`pages/*.tsx`）内禁止直接写 `fetch`/`axios`
- ❌ 禁止在页面内直接创建 Zustand store
- ❌ 页面文件不超过 **100 行**，超过说明逻辑需提取到 `core/`
- ✅ 只能通过 `@forge/core` 的 hooks 获取数据
- ✅ 只能通过 `@forge/ui` 或 `components/` 渲染 UI

---

## 4. 后端架构

### 4.1 分层结构（Hexagonal Architecture）

```
apps/api/
├── domain/          # 核心层：实体 + 业务规则 + Repository 接口（端口）
├── infra/           # 基础设施层：Repository 实现（适配器）+ 外部服务
├── api/             # 表现层：HTTP 适配
└── cmd/server/      # 装配层：依赖注入（唯一的 wire 点）
```

### 4.2 domain — 核心层

**职责：** 业务实体、业务规则、Repository 接口定义。完全不知道 HTTP、数据库、框架的存在。

```go
// domain/project.go
package domain

import (
    "errors"
    "time"
)

type ProjectStatus string

const (
    ProjectStatusIdle      ProjectStatus = "idle"
    ProjectStatusBuilding  ProjectStatus = "building"
    ProjectStatusDone      ProjectStatus = "done"
    ProjectStatusFailed    ProjectStatus = "failed"
)

type Project struct {
    ID          string
    Name        string
    UserID      string
    Status      ProjectStatus
    PreviewURL  string
    CreatedAt   time.Time
    UpdatedAt   time.Time
}

// 纯业务函数——无 DB 调用，可直接单测
func (p *Project) CanRetry() bool {
    return p.Status == ProjectStatusFailed
}
```

```go
// domain/repository.go
package domain

import "context"

// ProjectRepository 是端口（接口），定义在 domain 层
// 实现（适配器）在 infra 层
type ProjectRepository interface {
    Create(ctx context.Context, p Project) (Project, error)
    GetByID(ctx context.Context, id string) (Project, error)
    ListByUserID(ctx context.Context, userID string) ([]Project, error)
    Update(ctx context.Context, p Project) (Project, error)
}

type UserRepository interface {
    Create(ctx context.Context, u User) (User, error)
    GetByEmail(ctx context.Context, email string) (User, error)
    GetByID(ctx context.Context, id string) (User, error)
}
```

```go
// domain/errors.go
package domain

import "errors"

var (
    ErrNotFound      = errors.New("not found")
    ErrAlreadyExists = errors.New("already exists")
    ErrUnauthorized  = errors.New("unauthorized")
    ErrInvalidInput  = errors.New("invalid input")
)
```

**硬性规则：**
- ❌ 禁止 import `database/sql`、`pgx`、任何数据库驱动
- ❌ 禁止 import `net/http`、`chi`、任何 HTTP 框架
- ❌ 禁止 import 任何第三方包（只允许标准库）
- ✅ 只依赖标准库

### 4.3 infra — 基础设施层

**职责：** 实现 `domain` 层定义的 Repository 接口；封装外部服务调用。

```
infra/
├── postgres/
│   ├── db.go                  # pgx pool 初始化
│   ├── project_repo.go        # 实现 domain.ProjectRepository
│   └── user_repo.go
├── sqlc/
│   ├── sqlc.yaml
│   └── queries/
│       ├── project.sql
│       └── user.sql
└── mock/
    ├── project_repo_mock.go   # 手写 mock，供 api/handler 测试用
    └── user_repo_mock.go
```

```go
// infra/postgres/project_repo.go
package postgres

import (
    "context"
    "errors"

    "github.com/jackc/pgx/v5"
    "github.com/forge-ai/forge/api/domain"
    // sqlc 生成的代码
    db "github.com/forge-ai/forge/api/infra/sqlc"
)

type projectRepo struct {
    q *db.Queries
}

func NewProjectRepo(pool *pgx.Pool) domain.ProjectRepository {
    return &projectRepo{q: db.New(pool)}
}

func (r *projectRepo) GetByID(ctx context.Context, id string) (domain.Project, error) {
    row, err := r.q.GetProject(ctx, id)
    if errors.Is(err, pgx.ErrNoRows) {
        return domain.Project{}, domain.ErrNotFound  // 转换为 domain 错误
    }
    if err != nil {
        return domain.Project{}, err
    }
    return toDomainProject(row), nil  // DB 类型 → domain 类型转换
}
```

**硬性规则：**
- ✅ 必须实现 `domain` 层定义的接口，返回类型是 `domain.*` 类型
- ✅ DB 层错误（如 `pgx.ErrNoRows`）必须在此层转换为 `domain.Err*` 哨兵错误
- ❌ 禁止 import `api/` 或 `cmd/`
- ❌ 禁止在 infra 层定义新的业务规则

**Mock 规范（手写，不用 mockgen）：**
```go
// infra/mock/project_repo_mock.go
package mock

import (
    "context"
    "github.com/forge-ai/forge/api/domain"
)

type ProjectRepo struct {
    CreateFn    func(ctx context.Context, p domain.Project) (domain.Project, error)
    GetByIDFn   func(ctx context.Context, id string) (domain.Project, error)
}

func (m *ProjectRepo) Create(ctx context.Context, p domain.Project) (domain.Project, error) {
    return m.CreateFn(ctx, p)
}

func (m *ProjectRepo) GetByID(ctx context.Context, id string) (domain.Project, error) {
    return m.GetByIDFn(ctx, id)
}
```

### 4.4 api — 表现层

**职责：** HTTP 适配。解析请求 → 调用 domain service/repo → 序列化响应。不包含任何业务判断。

```
api/
├── router.go
├── handler/
│   ├── project.go
│   ├── project_test.go
│   ├── task.go
│   ├── task_test.go
│   └── health.go
└── middleware/
    ├── auth.go        # 验证 JWT，写 userID 进 context
    └── error.go       # domain 错误 → HTTP 状态码映射（唯一映射点）
```

```go
// api/handler/project.go
package handler

import (
    "encoding/json"
    "net/http"

    "github.com/go-chi/chi/v5"
    "github.com/forge-ai/forge/api/domain"
)

type ProjectHandler struct {
    repo domain.ProjectRepository  // 只持有接口，不知道 postgres 存在
}

func NewProjectHandler(repo domain.ProjectRepository) *ProjectHandler {
    return &ProjectHandler{repo: repo}
}

func (h *ProjectHandler) GetProject(w http.ResponseWriter, r *http.Request) {
    id := chi.URLParam(r, "id")

    project, err := h.repo.GetByID(r.Context(), id)
    if err != nil {
        // 不在这里写 if err == domain.ErrNotFound，交给 middleware/error.go
        writeError(w, err)
        return
    }

    writeJSON(w, http.StatusOK, project)
}
```

```go
// api/middleware/error.go  — 唯一的错误映射点
package middleware

import (
    "errors"
    "net/http"
    "github.com/forge-ai/forge/api/domain"
)

func DomainErrToHTTP(err error) int {
    switch {
    case errors.Is(err, domain.ErrNotFound):
        return http.StatusNotFound
    case errors.Is(err, domain.ErrAlreadyExists):
        return http.StatusConflict
    case errors.Is(err, domain.ErrUnauthorized):
        return http.StatusUnauthorized
    case errors.Is(err, domain.ErrInvalidInput):
        return http.StatusBadRequest
    default:
        return http.StatusInternalServerError
    }
}
```

**硬性规则：**
- ❌ handler 里禁止出现业务判断逻辑（if/else 判断业务状态）
- ❌ handler 里禁止直接 import `infra/postgres`（只通过接口）
- ✅ 所有 domain 错误到 HTTP 状态码的映射集中在 `middleware/error.go`

### 4.5 cmd/server — 装配层

**职责：** 唯一的依赖注入点。读配置 → 初始化 infra → 构建 handler → 启动服务器。

```go
// cmd/server/main.go
package main

func main() {
    cfg := loadConfig()          // 读环境变量

    // 1. 初始化基础设施
    pool := postgres.NewPool(cfg.DatabaseURL)

    // 2. 构建 Repository（infra 层具体类型）
    projectRepo := postgres.NewProjectRepo(pool)
    userRepo    := postgres.NewUserRepo(pool)

    // 3. 构建 Handler（传入的是 domain 接口）
    projectHandler := handler.NewProjectHandler(projectRepo)
    taskHandler    := handler.NewTaskHandler(projectRepo, cfg.AgentServiceURL)

    // 4. 装配路由
    router := api.NewRouter(api.RouterDeps{
        Project: projectHandler,
        Task:    taskHandler,
    })

    // 5. 启动
    http.ListenAndServe(":"+cfg.Port, router)
}
```

**规则：**
- `main.go` 是唯一允许同时 import `domain`、`infra`、`api` 的文件
- 不在 `main.go` 写任何业务逻辑，只做装配

---

## 5. Agent Service 架构

### 5.1 目录结构

```
apps/agent/src/
├── index.ts                    # HTTP 入口 + BullMQ Worker 注册
├── orchestrator/
│   ├── state-machine.ts        # 状态枚举 + transition 纯函数
│   ├── orchestrator.ts         # 状态机驱动，协调 Agent 执行
│   └── router.ts               # 错误分类 → 路由到对应 Agent 修复
├── agents/
│   ├── types.ts                # Agent 接口 + ProgressEvent 类型
│   ├── pm-agent.ts             # Tier 0：需求理解 + 放大
│   ├── architect-agent.ts      # Tier 1：变更规划
│   ├── schema-agent.ts         # Tier 2：数据库 schema
│   ├── logic-agent.ts          # Tier 2：业务逻辑 + 单测
│   ├── api-agent.ts            # Tier 2：HTTP 路由
│   ├── ui-agent.ts             # Tier 2：UI 组件
│   ├── page-agent.ts           # Tier 2：页面组装
│   ├── test-agent.ts           # Tier 3：运行验证
│   └── review-agent.ts         # Tier 3：架构约束检查
├── sandbox/
│   ├── e2b-client.ts           # E2B SDK 封装
│   └── templates/
│       └── nextjs/             # 预置的 Next.js 项目模板文件
└── contracts/
    ├── spec.ts                 # spec.json 的 zod schema
    ├── task-plan.ts            # task_plan.json 的 zod schema
    └── validation-report.ts   # validation_report.json 的 zod schema
```

### 5.2 Agent 通信协议

所有 Agent 不直接对话，只通过沙箱内的**契约文件**通信：

```
sandbox_workdir/contracts/
├── spec.json               # PM Agent 写，其他人读
├── task_plan.json          # Architect 写，Builder Agents 读
├── project_context.md      # 所有 Builder Agent 读写（append only）
├── design_spec.json        # UI Agent 维护，Page Agent 读
├── validation_report.json  # Test Agent 写，Orchestrator 读
└── review_report.json      # Review Agent 写，Orchestrator 读
```

### 5.3 ProgressEvent 规范

Agent 执行过程中通过 `emit()` 上报事件，Orchestrator 收集后通过 SSE 推送到前端：

```typescript
type ProgressEvent =
  | { type: 'agent_start';      agent: AgentRole; message: string }
  | { type: 'agent_thinking';   agent: AgentRole; content: string }
  | { type: 'agent_tool_use';   agent: AgentRole; tool: string; input: unknown }
  | { type: 'agent_file_write'; agent: AgentRole; file: string; action: 'create' | 'modify' }
  | { type: 'agent_done';       agent: AgentRole; summary: string }
  | { type: 'agent_error';      agent: AgentRole; error: string }
  | { type: 'state_change';     state: OrchestratorState }
  | { type: 'waiting';          reason: string; context: string }
```

---

## 6. 分层约束规则

### 6.1 前端 Import 边界

| 从 \ 到 | `@forge/core` | `@forge/ui` | `react-dom` | `apps/web` | API/fetch |
|---|---|---|---|---|---|
| `packages/core/` | — | ❌ | ❌ | ❌ | ✅（封装在 client.ts） |
| `packages/ui/` | ❌ | — | ✅ | ❌ | ❌ |
| `apps/web/pages/` | ✅ | ✅ | ✅ | — | ❌（通过 core hooks） |

### 6.2 后端 Import 边界

| 从 \ 到 | `domain/` | `infra/` | `api/` | 标准库 | 第三方（pgx 等） |
|---|---|---|---|---|---|
| `domain/` | — | ❌ | ❌ | ✅ | ❌ |
| `infra/` | ✅ | — | ❌ | ✅ | ✅ |
| `api/` | ✅（接口） | ❌（具体类型） | — | ✅ | ✅（chi） |
| `cmd/server/` | ✅ | ✅ | ✅ | ✅ | ✅ |

### 6.3 生成代码的文件归属规则

当 Agent 生成代码时，文件必须落到对应的层，违反会被 Review Agent 标记：

| 代码类型 | 必须放到 |
|---|---|
| API 调用 / TanStack Query hook | `packages/core/` |
| Zustand store | `packages/core/` |
| 纯 UI 组件（Button、Input） | `packages/ui/` |
| 页面文件 | `apps/web/src/pages/` |
| Go 业务实体 / 接口 | `domain/` |
| DB 查询 / SQL | `infra/sqlc/queries/` |
| Repository 实现 | `infra/postgres/` |
| HTTP handler | `api/handler/` |
| 路由注册 | `api/router.go` |

---

## 7. 测试策略

### 7.1 前端测试

```
包                  工具                    环境        覆盖要求
─────────────────────────────────────────────────────────────
packages/core/     Vitest                  Node        80%+
                   - 每个 hook 测 loading/success/error 三态
                   - store 测 action 和 selector

packages/ui/       Storybook + 交互测试    jsdom       每组件 ≥1 story
                   - 视觉回归（CI 跑 build 不报错）

apps/web/          Playwright              真实浏览器   关键路径 100%
                   - 登录流
                   - 创建项目 → 看到 Agent 进度
                   - 预览生成的应用
```

**Vitest 配置原则：**
```typescript
// packages/core/vitest.config.ts
export default defineConfig({
  test: {
    environment: 'node',    // 不是 jsdom，core 不能依赖 DOM
    coverage: {
      threshold: { lines: 80, functions: 80 }
    }
  }
})
```

### 7.2 后端测试

```
层                  工具                    依赖        覆盖要求
─────────────────────────────────────────────────────────────
domain/            go test                 无 mock     90%+
                   - 纯函数逻辑
                   - 错误路径

api/handler/       go test + httptest      mock repo   80%+
                   - 正常请求
                   - 非法输入（缺字段、错类型）
                   - domain 错误 → 正确 HTTP 状态码

infra/postgres/    go test (build: integration)  真实 DB  关键查询 100%
                   - testcontainers 起 PostgreSQL
                   - Create / GetByID / Update / Delete
```

**集成测试约定：**
```go
//go:build integration
// +build integration

// 只在 CI integration job 或本地显式运行：
// go test -tags integration ./infra/postgres/...
```

### 7.3 Agent Service 测试

```
模块               工具        策略
─────────────────────────────────────────────────────────────
state-machine.ts   Vitest      纯函数，穷举所有状态转换
agents/*.ts        Vitest      mock Vercel AI SDK，测 prompt 构建逻辑
e2b-client.ts      Vitest      mock E2B SDK，测错误处理
orchestrator.ts    Vitest      mock 所有 Agent，测重试 / 路由逻辑
```

---

## 8. API 设计规范

### 8.1 URL 结构

```
/api/v1/{resource}                  GET（列表）/ POST（创建）
/api/v1/{resource}/{id}             GET / PUT / DELETE
/api/v1/{resource}/{id}/{sub}       嵌套资源

例：
GET    /api/v1/projects
POST   /api/v1/projects
GET    /api/v1/projects/:id
GET    /api/v1/projects/:id/tasks
POST   /api/v1/projects/:id/tasks
GET    /api/v1/tasks/:id/stream     SSE 流（不算 REST resource）
```

### 8.2 响应格式

```json
// 成功（单个资源）
{ "data": { "id": "...", "name": "..." } }

// 成功（列表）
{ "data": [...], "total": 42, "page": 1, "limit": 20 }

// 错误
{
  "error": {
    "code": "NOT_FOUND",
    "message": "project not found",
    "field": "id"          // 可选，字段级错误
  }
}
```

### 8.3 SSE 事件格式

```
// GET /api/v1/tasks/:id/stream
// Content-Type: text/event-stream

event: agent_event
data: {"type":"agent_start","agent":"pm","message":"Analyzing requirements..."}

event: agent_event
data: {"type":"state_change","state":"planning"}

event: done
data: {"previewUrl":"https://xxx.e2b.dev"}
```

---

## 9. 错误处理规范

### 9.1 原则

```
domain 层      → 返回 domain.Err* 哨兵错误
infra 层       → 捕获 DB 错误，转换为 domain.Err*
api/handler    → 不判断具体错误，统一交给 writeError()
middleware     → 唯一的 domain 错误 → HTTP 状态码映射点
前端            → 所有 API 错误在 api/client.ts 统一处理
```

### 9.2 Go 错误包装

```go
// ✅ 正确：包装错误保留调用链
return fmt.Errorf("projectRepo.GetByID: %w", domain.ErrNotFound)

// 前端用 errors.Is 判断
if errors.Is(err, domain.ErrNotFound) { ... }
```

### 9.3 前端错误处理

```typescript
// packages/core/api/schema.ts
// API 响应必须经过 schema 验证，不能裸 as 类型断言
export function parseWithFallback<T>(
  schema: ZodSchema<T>,
  data: unknown,
  fallback: T
): T {
  const result = schema.safeParse(data)
  if (!result.success) {
    console.warn('API response validation failed', result.error)
    return fallback
  }
  return result.data
}
```

---

## 10. 命名约定

### 10.1 文件命名

| 位置 | 约定 | 例子 |
|---|---|---|
| TypeScript | kebab-case | `use-login.ts`, `auth-store.ts` |
| React 组件 | kebab-case（文件）/ PascalCase（导出） | `button.tsx` → `export function Button` |
| Go 文件 | snake_case | `project_repo.go`, `auth_middleware.go` |
| 测试文件 | 同源文件名 + `.test.ts` / `_test.go` | `use-login.test.ts`, `project_repo_test.go` |

### 10.2 Go 命名

```go
// Repository 接口：名词 + Repository
type ProjectRepository interface {}

// infra 实现：小写 + 私有
type projectRepo struct {}
func NewProjectRepo(...) domain.ProjectRepository  // 构造函数返回接口

// Domain 错误：Err + PascalCase
var ErrNotFound = errors.New("not found")

// Handler：名词 + Handler
type ProjectHandler struct {}
```

### 10.3 API Route 命名

- 资源用**复数名词**：`/projects`，`/tasks`
- 不用动词：❌ `/createProject`，✅ `POST /projects`
- 嵌套不超过 2 层：❌ `/users/:id/projects/:pid/tasks`

---

## 11. 环境与配置

### 11.1 必须的环境变量

```bash
# Go API Server
PORT=8080
DATABASE_URL=postgres://user:pass@localhost:5432/forge
AGENT_SERVICE_URL=http://localhost:3001
JWT_SECRET=<random-32-bytes>

# Agent Service（Node.js）
ANTHROPIC_API_KEY=sk-ant-...
E2B_API_KEY=e2b_...
REDIS_URL=redis://localhost:6379
GO_API_URL=http://localhost:8080   # 回调用

# React Frontend（构建时注入）
VITE_API_URL=http://localhost:8080
```

### 11.2 本地开发

```bash
# 一键启动全部服务
make dev

# 单独启动
make dev-api      # Go API :8080
make dev-agent    # Node.js Agent Service :3001
make dev-web      # React + Vite :5173

# 数据库
make db-up        # 启动 PostgreSQL（Docker）
make db-migrate   # 运行 migrations
make db-reset     # 重置数据库（开发用）
```

### 11.3 静态检查

```bash
# 前端
pnpm lint         # ESLint（含 import 边界规则）
pnpm typecheck    # tsc --noEmit

# 后端
golangci-lint run  # 含 depguard import 边界检查
go vet ./...

# 全量检查
make check
```
