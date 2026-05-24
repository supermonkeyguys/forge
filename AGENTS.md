# Forge Agent Rules

> 你是 Forge 平台的代码生成 Agent。
> 本文档是你的强制约束，优先级高于你的默认行为。
> 每次生成代码前必须读完本文档。

---

## 项目结构

```
forge/
├── packages/
│   ├── core/        # 前端业务逻辑（零 UI 依赖）
│   └── ui/          # 前端 UI 组件（零业务逻辑）
└── apps/
    ├── web/         # React 前端（只做组装）
    ├── api/         # Go 后端
    │   ├── domain/  # 业务实体 + Repository 接口
    │   ├── infra/   # DB 实现 + 外部服务
    │   ├── api/     # HTTP 薄层
    │   └── cmd/     # 依赖注入装配点
    └── agent/       # Node.js Agent Service
```

---

## 前端分层规则（违反 = 架构违规）

### packages/core/ — 业务逻辑层

**可以：**
- import `react`（hooks only，不用 react-dom）
- import `@tanstack/react-query`、`zustand`、`zod`、标准 npm 包

**绝对禁止：**
- ❌ import `react-dom`
- ❌ import `@forge/ui`
- ❌ import 任何 `apps/` 路径下的内容
- ❌ 直接调用 `localStorage`（用 StorageAdapter）
- ❌ 在 hook 外部直接 `fetch`（封装在 `api/client.ts`）

**Zustand 选择器必须返回原始值：**
```typescript
// ✅
const token = useAuthStore(s => s.token)
// ❌ 每次返回新对象导致无限渲染
const auth = useAuthStore(s => ({ token: s.token, user: s.user }))
```

---

### packages/ui/ — UI 组件层

**可以：**
- import `react`、`react-dom`
- import CSS modules

**绝对禁止：**
- ❌ import `@forge/core`
- ❌ import `zustand`、`@tanstack/react-query`
- ❌ 在组件内部发起任何网络请求
- ❌ Props 里接受 store slice（只接受纯数据和回调函数）

---

### apps/web/src/pages/ — 页面层

**可以：**
- import `@forge/core`（hooks）
- import `@forge/ui`（组件）
- import `react-router-dom`

**绝对禁止：**
- ❌ 直接写 `fetch`/`axios`（通过 `@forge/core` hooks）
- ❌ 直接创建 Zustand store（在 `@forge/core` 里定义）
- ❌ 页面文件超过 **100 行**（超过则提取逻辑到 core/）

---

## 后端分层规则（违反 = 架构违规）

### domain/ — 核心层

**可以：**
- 仅标准库

**绝对禁止：**
- ❌ import `database/sql`、`pgx`、任何数据库包
- ❌ import `net/http`、`chi`、任何 HTTP 框架
- ❌ import 任何第三方包

**Repository 接口必须定义在这里（不是 infra）：**
```go
// domain/repository.go
type ProjectRepository interface {
    Create(ctx context.Context, p Project) (Project, error)
    GetByID(ctx context.Context, id string) (Project, error)
}
```

**错误必须用哨兵错误：**
```go
// domain/errors.go
var (
    ErrNotFound     = errors.New("not found")
    ErrUnauthorized = errors.New("unauthorized")
)
```

---

### infra/ — 基础设施层

**可以：**
- import `domain/`
- import `pgx`、sqlc 生成代码、第三方 SDK

**绝对禁止：**
- ❌ import `api/`
- ❌ 在此层定义新的业务规则
- ❌ 暴露 DB 层错误给上层（必须转换为 `domain.Err*`）

**DB 错误必须在此层转换：**
```go
if errors.Is(err, pgx.ErrNoRows) {
    return domain.Project{}, domain.ErrNotFound  // ✅ 转换
}
```

---

### api/handler/ — HTTP 层

**可以：**
- import `domain/`（接口）
- import `net/http`、`chi`

**绝对禁止：**
- ❌ import `infra/postgres`（具体类型，只能用接口）
- ❌ 在 handler 内写业务判断逻辑（if/else 判断业务状态）
- ❌ 在 handler 内直接将 domain 错误转换为 HTTP 状态码

**Handler 只做三件事：**
1. 解析请求参数
2. 调用 domain Repository 或 service
3. 序列化响应

**所有错误映射集中在 `api/middleware/error.go`。**

---

### cmd/server/main.go — 装配层

**这是唯一允许同时 import domain/、infra/、api/ 的文件。**
**只做依赖注入，不写任何业务逻辑。**

---

## 测试覆盖要求

| 层 | 最低覆盖率 | 必须测试 |
|---|---|---|
| `packages/core/` | 80% | 每个 hook 的 loading/success/error 三态 |
| `packages/ui/` | N/A | 每个组件至少一个 Default story |
| `domain/` | 90% | 纯函数逻辑 + 所有错误路径 |
| `api/handler/` | 80% | 正常请求 + 非法输入 + domain 错误映射 |
| `infra/postgres/` | 关键查询 100% | Create/GetByID（integration tag） |

**每个业务逻辑文件必须有对应的测试文件，无测试文件 = 不完整的任务。**

---

## 文件命名约定

| 文件类型 | 约定 | 例子 |
|---|---|---|
| TypeScript | kebab-case | `use-login.ts` |
| React 组件 | kebab-case 文件名 | `button.tsx` → `export function Button` |
| Go 文件 | snake_case | `project_repo.go` |
| 测试文件 | 同名 + 后缀 | `use-login.test.ts`、`project_repo_test.go` |
| SQL 查询 | `{resource}.sql` | `project.sql` |

---

## API 设计约定

- URL：`/api/v1/{复数名词}` — 不用动词
- 响应成功：`{ "data": ... }`
- 响应列表：`{ "data": [...], "total": N }`
- 响应错误：`{ "error": { "code": "NOT_FOUND", "message": "..." } }`
- SSE 流：`GET /api/v1/{resource}/{id}/stream`

---

## 代码生成清单

完成一个功能时，确认以下所有文件都已创建：

**前端功能（例：用户登录）**
- [ ] `packages/core/auth/use-login.ts` — hook
- [ ] `packages/core/auth/auth.test.ts` — 单测
- [ ] `packages/core/auth/auth-store.ts` — 如需状态
- [ ] `packages/ui/button/button.tsx` — 如需新组件
- [ ] `apps/web/src/pages/LoginPage.tsx` — 页面（只组装）

**后端功能（例：项目 CRUD）**
- [ ] `domain/project.go` — 实体 + 纯函数
- [ ] `domain/repository.go` — 接口（追加）
- [ ] `infra/sqlc/queries/project.sql` — SQL 查询
- [ ] `infra/postgres/project_repo.go` — 实现
- [ ] `infra/mock/project_repo_mock.go` — mock
- [ ] `api/handler/project.go` — handler
- [ ] `api/handler/project_test.go` — handler 测试

---

## 禁止行为

- ❌ 不问就假设需求（有歧义必须在 spec.json 中标记 `clarifying_questions`）
- ❌ 生成代码后不写测试
- ❌ 在 page.tsx 里写业务逻辑
- ❌ 在 domain/ 里写 SQL 或 HTTP 代码
- ❌ 在 handler/ 里直接 import infra/postgres
- ❌ 用 `as` 对 API 响应做类型断言（用 `parseWithFallback`）
- ❌ 生成超过文件职责的代码（API handler 不能超过 60 行）
