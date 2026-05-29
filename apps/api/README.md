# Forge API

Go 后端服务，提供 REST API + SSE 实时推送。

- **端口**：`:8080`
- **技术栈**：Go 1.25 · Chi v5 · pgx v5 · golang-jwt

---

## 目录结构

```
apps/api/
├── cmd/
│   ├── server/        # 服务入口（依赖注入装配点）
│   └── migrate/       # 数据库迁移工具
├── domain/            # 业务实体 + Repository 接口（无外部依赖）
├── infra/
│   ├── postgres/      # Repository 实现（pgx 直写 SQL）
│   ├── mock/          # 手写 mock，供 handler 单测使用
│   └── sqlc/          # sqlc 配置 + SQL 查询文件
├── api/
│   ├── handler/       # HTTP handler（薄层，只做解析+序列化）
│   ├── middleware/    # JWT 认证 · 错误映射 · 限流 · 日志
│   └── router.go      # 路由装配
├── migrations/        # SQL 迁移文件（顺序执行）
└── .env               # 本地环境变量（不提交）
```

---

## 快速启动

### 前置条件

- Go 1.22+
- PostgreSQL 17（Docker 或本地均可）

### 1. 启动数据库

**方式 A — Docker（推荐）**

```bash
# 在项目根目录
make db-up      # 启动容器，自动等健康检查通过
make db-migrate # 建表
```

**方式 B — 本地 Homebrew**

```bash
brew services start postgresql@17
cd apps/api && go run ./cmd/migrate
```

> 两种方式不能同时占用 5432 端口，切换时先停另一个。

### 2. 配置环境变量

`apps/api/.env` 已预置，内容：

```bash
PORT=8080
DATABASE_URL=postgres://forge:forge@localhost:5432/forge
AGENT_SERVICE_URL=http://localhost:3001
JWT_SECRET=dev-secret-change-in-production-32bytes
```

> `JWT_SECRET` 和 `DATABASE_URL` 为必填项，为空时服务拒绝启动。

### 3. 启动服务

```bash
cd apps/api
go run ./cmd/server
# 或从项目根目录：
make dev-api
```

启动成功日志：

```json
{"level":"INFO","msg":"forge api server starting","addr":":8080"}
```

### 4. 验证

```bash
curl http://localhost:8080/health
# → {"data":{"db":"ok","status":"ok"}}
```

---

## API 一览

### 认证

| 方法 | 路径 | 说明 | 认证 |
|---|---|---|---|
| POST | `/api/v1/auth/register` | 注册 | — |
| POST | `/api/v1/auth/login` | 登录 | — |
| GET  | `/api/v1/auth/me` | 获取当前用户 | ✅ |

**注册**

```bash
curl -X POST http://localhost:8080/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","name":"Your Name","password":"password123"}'
```

```json
{
  "data": {
    "token": "<jwt>",
    "user": { "id": "...", "email": "...", "name": "...", "createdAt": "..." }
  }
}
```

**登录**

```bash
curl -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"you@example.com","password":"password123"}'
```

> 后续请求在 Header 中携带：`Authorization: Bearer <token>`

---

### 项目

| 方法 | 路径 | 说明 |
|---|---|---|
| GET    | `/api/v1/projects` | 列出当前用户的项目（分页） |
| POST   | `/api/v1/projects` | 创建项目 |
| GET    | `/api/v1/projects/:id` | 获取单个项目 |
| DELETE | `/api/v1/projects/:id` | 删除项目（进行中的项目禁止删除） |

**分页参数**：`?page=1&limit=20`（limit 最大 100）

**创建项目**

```bash
curl -X POST http://localhost:8080/api/v1/projects \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name":"My App"}'
```

```json
{
  "data": {
    "id": "...",
    "name": "My App",
    "userId": "...",
    "status": "idle",
    "previewUrl": "",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

**项目状态枚举**：`idle` → `analyzing` → `planning` → `building` → `validating` → `done` | `waiting` | `failed`

---

### 任务

| 方法 | 路径 | 说明 |
|---|---|---|
| GET  | `/api/v1/projects/:projectID/tasks` | 列出项目下的任务 |
| POST | `/api/v1/projects/:projectID/tasks` | 创建任务（触发 Agent 执行） |
| GET  | `/api/v1/projects/:projectID/tasks/:taskID` | 获取单个任务 |
| GET  | `/api/v1/tasks/:taskID/stream` | SSE 实时进度流 |

**创建任务**

```bash
curl -X POST http://localhost:8080/api/v1/projects/<projectID>/tasks \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"prompt":"Build a todo app with React and a REST API"}'
```

**订阅 SSE 进度流**

```bash
curl -N -H "Authorization: Bearer <token>" \
  http://localhost:8080/api/v1/tasks/<taskID>/stream
```

```
event: agent_event
data: {"type":"task_state","status":"analyzing","previewUrl":"","errorMsg":""}

event: agent_event
data: {"type":"task_state","status":"building","previewUrl":"","errorMsg":""}

event: done
data: {"previewUrl":"https://xxx.e2b.dev"}
```

---

## 响应格式

**成功（单个资源）**

```json
{ "data": { ... } }
```

**成功（列表）**

```json
{ "data": [...], "total": 10, "page": 1, "limit": 20 }
```

**错误**

```json
{
  "error": {
    "code": "NOT_FOUND",
    "message": "not found",
    "field": "id"
  }
}
```

| HTTP 状态 | code | 含义 |
|---|---|---|
| 400 | `INVALID_INPUT` | 请求参数不合法 |
| 401 | `UNAUTHORIZED` | 未认证或 token 无效 |
| 403 | `FORBIDDEN` | 无权访问该资源 |
| 404 | `NOT_FOUND` | 资源不存在 |
| 409 | `ALREADY_EXISTS` | 资源已存在（如邮箱重复注册） |
| 429 | `RATE_LIMITED` | 请求过于频繁（认证接口限流） |
| 500 | `INTERNAL_ERROR` | 服务内部错误 |

---

## 测试

```bash
# 单元测试
cd apps/api
go test ./...

# 带覆盖率
go test -coverprofile=cover.out ./domain/... ./api/...
go tool cover -func=cover.out

# 集成测试（需要真实数据库）
go test -tags integration ./infra/postgres/...
```

覆盖率目标：`domain/` ≥ 90%，`api/handler/` ≥ 80%

---

## 数据库操作

```bash
# 从项目根目录
make db-up       # 启动 Docker postgres
make db-migrate  # 执行 migrations/
make db-reset    # 清空数据并重建（删 volume）
make db-psql     # 进入 psql 交互
make db-logs     # 查看 postgres 日志
make db-down     # 停止容器
```

迁移文件位于 `migrations/`，按文件名顺序执行，`001_init.sql` 建立初始 schema。

---

## 架构约束（六边形架构）

```
domain/     只依赖标准库，禁止 import pgx / net/http
infra/      实现 domain 接口，DB 错误必须在此转换为 domain.Err*
api/handler 只持有 domain 接口，禁止 import infra/postgres
cmd/server  唯一可以同时 import domain + infra + api 的文件
```

**Import 边界违反 = 架构违规**，`golangci-lint` 的 `depguard` 规则会在 CI 中检测。

---

## 中间件

| 中间件 | 说明 |
|---|---|
| `RequireAuth` | 验证 Bearer JWT，失败返回 401 |
| `IPRateLimit` | 认证路由限流：5 req/s，burst 10 |
| `RequestLogger` | 结构化 slog 请求日志（method/path/status/duration） |
| `RequestSize` | 请求体最大 1MB |
| `Recoverer` | panic 捕获，返回 500 |

---

## 生产部署注意事项

- `JWT_SECRET` 必须是随机 32+ 字节字符串
- `DATABASE_URL` 使用连接池参数（`pool_max_conns=10`）
- `WriteTimeout: 60s`（SSE 长连接），`ReadTimeout: 15s`
- 服务支持 `SIGTERM` 优雅关闭（30s drain），适配 Kubernetes / Docker Swarm
