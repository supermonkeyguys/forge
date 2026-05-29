# Forge API 后端改进计划

> 基于代码审查结果，分 4 个 Phase 执行。每个 Phase 完成后必须通过 `go build ./...` + `go test ./...`。

---

## Phase 1 — 安全漏洞修复

**目标：消灭所有可被立即利用的安全问题**

### 1.1 修复 IDOR 越权

**文件：** `api/handler/project.go`

- [ ] `ProjectHandler.Get`：取回项目后加所有权校验

  ```go
  userID := middleware.UserIDFromContext(r.Context())
  // ...取回 project 后...
  if project.UserID != userID {
      middleware.WriteError(w, domain.ErrForbidden)
      return
  }
  ```

- [ ] `ProjectHandler.Delete`：同上加所有权校验；且取回项目后检查 `project.IsActive()`，活跃项目返回 `ErrForbidden`

### 1.2 强制环境变量校验

**文件：** `cmd/server/main.go`

- [ ] `JWT_SECRET` 为空时 `logger.Error("JWT_SECRET is required") + os.Exit(1)`
- [ ] `DATABASE_URL` 为空时同样拒绝启动

### 1.3 bcrypt DoS 防护

**文件：** `domain/user.go`

- [ ] `ValidPassword` 加上 `len(password) <= 72`

### 1.4 Agent dispatch 超时

**文件：** `api/handler/task.go`

- [ ] 声明包级 `agentHTTPClient = &http.Client{Timeout: 5 * time.Second}`
- [ ] `dispatchToAgent` 改用 `http.NewRequestWithContext` + `context.WithTimeout(context.Background(), 5*time.Second)`
- [ ] 移除 `//nolint:noctx` 注释

### 1.5 屏蔽 500 错误内部信息

**文件：** `api/middleware/error.go`

- [ ] `WriteError` 的 `default` 分支（500）将 `Message` 替换为 `"an internal error occurred"`
- [ ] 同时在此处 `slog.Error("internal error", "err", err)` 记录真实错误（需传入 logger 或用包级 logger）

**验证：**
```bash
go build ./...
go test ./...
```

---

## Phase 2 — 业务逻辑补全

**目标：让 API 行为正确，消除数据不一致**

### 2.1 DB 唯一约束冲突转换

**文件：** `infra/postgres/errors.go`（新建）

- [ ] 创建 `infra/postgres/errors.go`，实现：
  ```go
  func isUniqueViolation(err error) bool {
      var pgErr *pgconn.PgError
      return errors.As(err, &pgErr) && pgErr.Code == "23505"
  }
  ```
- [ ] `go.mod` 确认引入 `github.com/jackc/pgx/v5/pgconn`（已包含在 pgx 中）

**文件：** `infra/postgres/user_repo.go`, `project_repo.go`, `task_repo.go`

- [ ] 三个 `Create` 方法在 `scanX(row)` 返回错误后调用 `isUniqueViolation`，转换为 `domain.ErrAlreadyExists`

### 2.2 List 接口分页

**文件：** `domain/repository.go`

- [ ] 接口签名改为：
  ```go
  ListByUserID(ctx context.Context, userID string, limit, offset int) ([]Project, error)
  ListByProjectID(ctx context.Context, projectID string, limit, offset int) ([]Task, error)
  ```

**文件：** `infra/postgres/project_repo.go`, `task_repo.go`

- [ ] SQL 改为 `ORDER BY created_at DESC LIMIT $2 OFFSET $3`
- [ ] 函数签名同步更新

**文件：** `infra/mock/project_repo.go`, `task_repo.go`

- [ ] mock 函数签名同步更新

**文件：** `api/handler/project.go`, `task.go`

- [ ] 新增 `parsePagination(r *http.Request) (limit, offset int)` 私有函数：
  - 从 query string 读 `?page=1&limit=20`
  - `limit` 默认 20，最大 100
  - `offset = (page - 1) * limit`
- [ ] `List` handler 调用此函数，将 limit/offset 传入 repo
- [ ] `WriteJSONList` 传入真实 limit/page 值

### 2.3 mock nil 防护

**文件：** `infra/mock/project_repo.go`, `task_repo.go`

- [ ] 所有 `*Fn` 方法加 nil guard：
  ```go
  if m.CreateFn == nil {
      return domain.Project{}, fmt.Errorf("mock: CreateFn not set")
  }
  ```

### 2.4 清理死代码

- [ ] 删除 `internal/handler/task.go`（空壳文件）
- [ ] 检查并清理 `internal/` 目录下其他空目录

**验证：**
```bash
go build ./...
go test ./...
```

---

## Phase 3 — 测试补全

**目标：domain 90%+，handler 80%+**

### 3.1 `domain/project_test.go` 补全

- [ ] `TestProject_IsActive` — 穷举所有 ProjectStatus 的 true/false
- [ ] `TestProject_CanRetry` — failed/waiting=true，其余=false
- [ ] `TestProject_IsTerminal` — done/failed=true，其余=false
- [ ] `TestValidStatus` — 合法值返回 true，`"unknown"` 返回 false
- [ ] `TestValidEmail`、`TestValidPassword` — 移到 `domain/user_test.go`（新建）

### 3.2 `api/handler/task_test.go`（新建）

- [ ] `TestTaskHandler_Create_MissingPrompt` — 400
- [ ] `TestTaskHandler_Create_ProjectNotFound` — 404
- [ ] `TestTaskHandler_Create_ProjectForbidden` — 403（project.UserID != 当前用户）
- [ ] `TestTaskHandler_Create_Success` — 201，返回 task 对象
- [ ] `TestTaskHandler_Get_Success` — 200
- [ ] `TestTaskHandler_Get_NotFound` — 404
- [ ] `TestTaskHandler_Get_Forbidden` — 403

### 3.3 `api/handler/auth_test.go`（新建）

- [ ] `TestAuthHandler_Register_InvalidEmail` — 400，field=email
- [ ] `TestAuthHandler_Register_WeakPassword` — 400，field=password
- [ ] `TestAuthHandler_Register_MissingName` — 400，field=name
- [ ] `TestAuthHandler_Register_DuplicateEmail` — 409
- [ ] `TestAuthHandler_Register_Success` — 201，响应含 token 和 user（无 password 字段）
- [ ] `TestAuthHandler_Login_Success` — 200，含 token
- [ ] `TestAuthHandler_Login_WrongPassword` — 401（不区分用户不存在/密码错误，防枚举）
- [ ] `TestAuthHandler_Me_Unauthorized` — 401（无 token）
- [ ] `TestAuthHandler_Me_Success` — 200

  > 注意：auth_test.go 需要 stub PasswordHasher，不能真正跑 bcrypt（太慢），用：
  ```go
  type plainHasher struct{}
  func (plainHasher) Hash(p string) (string, error) { return "hashed:" + p, nil }
  func (plainHasher) Verify(h, p string) error {
      if h != "hashed:"+p { return errors.New("wrong") }
      return nil
  }
  ```

### 3.4 `api/middleware/auth_test.go`（新建）

- [ ] `TestRequireAuth_NoToken` — 401
- [ ] `TestRequireAuth_InvalidToken` — 401
- [ ] `TestRequireAuth_ExpiredToken` — 401（生成一个 exp=-1 的 token）
- [ ] `TestRequireAuth_ValidToken` — handler 被调用，context 中 userID 正确
- [ ] `TestGenerateAndValidateJWT` — 生成后解析，sub 字段匹配

**验证：**
```bash
go test -coverprofile=cover.out ./domain/... ./api/...
go tool cover -func=cover.out | grep -E "domain|handler|middleware"
# domain: ≥90%, handler: ≥80%
```

---

## Phase 4 — 生产就绪性

**目标：服务可以安全运行在生产环境**

### 4.1 请求体大小限制

**文件：** `api/router.go`

- [ ] 全局 middleware 加 `chimw.RequestSize(1 << 20)`（1MB 上限）
  - chi 内置：`"github.com/go-chi/chi/v5/middleware".RequestSize`

### 4.2 速率限制（认证路由）

**文件：** `api/router.go`，新建 `api/middleware/ratelimit.go`

- [ ] 引入 `golang.org/x/time/rate`
- [ ] 实现基于 IP 的简单令牌桶中间件：
  ```go
  // middleware/ratelimit.go
  func IPRateLimit(rps float64, burst int) func(http.Handler) http.Handler
  ```
- [ ] `/api/v1/auth/register` 和 `/api/v1/auth/login` 路由使用 `IPRateLimit(5, 10)`（每 IP 每秒 5 次，burst 10）

### 4.3 结构化请求日志

**文件：** `api/middleware/logger.go`（新建），`api/router.go`

- [ ] 实现 slog 请求日志中间件，记录：`method`, `path`, `status`, `duration`, `request_id`
- [ ] 在 router 中替换（或补充）chi 的默认 Logger

### 4.4 Graceful Shutdown

**文件：** `cmd/server/main.go`

- [ ] 将 `http.ListenAndServe` 替换为 `http.Server{}`
- [ ] 监听 `os.Signal`（`SIGTERM`, `SIGINT`）
- [ ] 收到信号后调用 `server.Shutdown(ctx)`（30s timeout），等待进行中请求完成
- [ ] pool.Close() 放在 shutdown 完成后

### 4.5 健康检查增强

**文件：** `api/handler/health.go`（新建），`api/router.go`

- [ ] `/health` 路由迁移到独立 handler
- [ ] handler 执行 `pool.Ping(ctx)` 检查 DB 连接，失败返回 503

**验证：**
```bash
go build ./...
go test ./...
# 手动测试：
# curl -X POST /api/v1/auth/register -d '{"email":"a@b.com","name":"x","password":"12345678"}'
# 连续发 11 次，第 11 次应返回 429
# kill -SIGTERM <pid>，确认无 "connection reset" 错误
```

---

## 执行顺序

```
Phase 1 → Phase 2 → Phase 3 → Phase 4
```

每个 Phase 结束后：
1. `go build ./...` 必须通过
2. `go test ./...` 必须通过
3. 提交一个独立 commit，commit message 格式：`fix(api): phase N — <简述>`

---

## 文件变更一览

| Phase | 文件 | 操作 |
|---|---|---|
| 1 | `api/handler/project.go` | 修改 |
| 1 | `cmd/server/main.go` | 修改 |
| 1 | `domain/user.go` | 修改 |
| 1 | `api/handler/task.go` | 修改 |
| 1 | `api/middleware/error.go` | 修改 |
| 2 | `infra/postgres/errors.go` | 新建 |
| 2 | `infra/postgres/user_repo.go` | 修改 |
| 2 | `infra/postgres/project_repo.go` | 修改 |
| 2 | `infra/postgres/task_repo.go` | 修改 |
| 2 | `domain/repository.go` | 修改 |
| 2 | `infra/mock/project_repo.go` | 修改 |
| 2 | `infra/mock/task_repo.go` | 修改 |
| 2 | `api/handler/project.go` | 修改 |
| 2 | `api/handler/task.go` | 修改 |
| 2 | `internal/handler/task.go` | 删除 |
| 3 | `domain/project_test.go` | 修改 |
| 3 | `domain/user_test.go` | 新建 |
| 3 | `api/handler/task_test.go` | 新建 |
| 3 | `api/handler/auth_test.go` | 新建 |
| 3 | `api/middleware/auth_test.go` | 新建 |
| 4 | `api/router.go` | 修改 |
| 4 | `api/middleware/ratelimit.go` | 新建 |
| 4 | `api/middleware/logger.go` | 新建 |
| 4 | `api/handler/health.go` | 新建 |
| 4 | `cmd/server/main.go` | 修改 |
