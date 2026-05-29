# Connect Frontend to Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 打通前端 → 后端 → Agent Service 的完整链路，让用户可以从登录、创建项目到触发 Agent 并实时看到进度。

**Architecture:** 
- 修复认证流程（真实 register/login 表单替换 dev mock）
- 接通 Project 创建和 SSE 订阅
- 后端新增 `/api/v1/projects/:projectID/stream` 路由（轮询最新 task 并代理其 SSE）
- `packages/core` 补齐 `useMe`、`useDeleteProject`、`Task` 类型

**Tech Stack:** Go 1.25 · React 18 · TanStack Query v5 · Zustand v4 · chi v5 · EventSource API

---

## File Map

| 文件 | 操作 | 说明 |
|---|---|---|
| `packages/core/types/index.ts` | 修改 | 补 `Task` 类型 |
| `packages/core/auth/use-me.ts` | 新建 | GET /api/v1/auth/me hook |
| `packages/core/project/use-projects.ts` | 修改 | 补 `useDeleteProject` |
| `packages/core/task/use-tasks.ts` | 新建 | useTask、useCreateTask hook |
| `packages/core/index.ts` | 修改 | 导出新 hook |
| `apps/api/api/handler/task.go` | 修改 | Stream 支持 token query param |
| `apps/api/api/router.go` | 修改 | 新增 `/projects/:projectID/stream` 路由 |
| `apps/api/api/handler/project_stream.go` | 新建 | ProjectStream handler（找最新 task → SSE） |
| `apps/web/src/pages/LoginPage.tsx` | 修改 | 改为真实 email/password 表单 |
| `apps/web/src/components/left-panel/RequirementInput.tsx` | 修改 | 删 mock，改调 Agent Service POST /run |
| `apps/web/src/components/left-panel/PMReview.tsx` | 修改 | handleConfirm 调真实 createProject |
| `apps/web/src/pages/ProjectsPage.tsx` | 修改 | 接通 deleteProject，重定向到 WorkspacePage |
| `apps/web/src/hooks/useAgentEvents.ts` | 修改 | 改用 token query param |
| `apps/web/src/hooks/useAgentStream.ts` | 删除 | 废弃文件 |
| `apps/web/src/main.tsx` | 修改 | 启动时调 useMe 恢复 session |

---

## Task 1: 补齐 packages/core 类型和 useMe hook

**Files:**
- Modify: `packages/core/types/index.ts`
- Create: `packages/core/auth/use-me.ts`
- Modify: `packages/core/index.ts`

- [ ] **Step 1: 在 types/index.ts 补 Task 类型**

在文件末尾 `AuthToken` 后面追加：

```typescript
// ── Task ─────────────────────────────────────────────────────────

export type TaskStatus =
  | 'idle'
  | 'analyzing'
  | 'planning'
  | 'building'
  | 'validating'
  | 'fixing'
  | 'waiting'
  | 'done'
  | 'failed'

export interface Task {
  id: string
  projectId: string
  userId: string
  prompt: string
  status: TaskStatus
  previewUrl: string
  errorMsg: string
  createdAt: string
  updatedAt: string
}
```

- [ ] **Step 2: 新建 use-me.ts**

创建文件 `packages/core/auth/use-me.ts`：

```typescript
/**
 * useMe — 验证当前 token 并恢复用户信息。
 * 在应用启动时调用，刷新后自动恢复登录状态。
 */
import { useQuery } from '@tanstack/react-query'
import { z } from 'zod'
import { api } from '../api/client.js'
import { parseWithFallback } from '../api/schema.js'
import { useAuthStore, selectToken } from './auth-store.js'
import type { User } from '../types/index.js'

const UserSchema = z.object({
  data: z.object({
    id: z.string(),
    email: z.string(),
    name: z.string(),
    createdAt: z.string(),
  }),
})

export function useMe() {
  const token = useAuthStore(selectToken)
  const setToken = useAuthStore((s) => s.setToken)

  return useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      const raw = await api.get<User>('/api/v1/auth/me', token ?? undefined)
      const parsed = parseWithFallback(UserSchema, raw, null)
      return parsed?.data ?? null
    },
    enabled: token !== null,
    staleTime: 5 * 60 * 1000,
    retry: false,
  })
}
```

- [ ] **Step 3: 在 index.ts 导出新内容**

在 `packages/core/index.ts` 的 Auth 区块补充：

```typescript
export { useMe } from './auth/use-me.js'
```

在 Types 区块补充：

```typescript
  Task,
  TaskStatus,
```

完整 types export 行变为：

```typescript
export type {
  Project,
  ProjectStatus,
  Task,
  TaskStatus,
  AgentEvent,
  AgentEventType,
  AgentRole,
  Spec,
  SpecFeature,
  User,
  AuthToken,
} from './types/index.js'
```

- [ ] **Step 4: 验证编译**

```bash
cd /Users/cookie/project/forge/packages/core
npx tsc --noEmit
```

预期：无错误输出

- [ ] **Step 5: commit**

```bash
cd /Users/cookie/project/forge
git add packages/core/types/index.ts packages/core/auth/use-me.ts packages/core/index.ts
git commit -m "feat(core): add Task type and useMe hook"
```

---

## Task 2: packages/core 补 useDeleteProject 和 useCreateTask

**Files:**
- Modify: `packages/core/project/use-projects.ts`
- Create: `packages/core/task/use-tasks.ts`
- Modify: `packages/core/index.ts`

- [ ] **Step 1: 在 use-projects.ts 末尾添加 useDeleteProject**

```typescript
export function useDeleteProject() {
  const token = useAuthStore(selectToken)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (projectId: string) => {
      await api.delete(`/api/v1/projects/${projectId}`, token ?? undefined)
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
    },
  })
}
```

- [ ] **Step 2: 新建 use-tasks.ts**

创建 `packages/core/task/use-tasks.ts`：

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { z } from 'zod'
import { api } from '../api/client.js'
import { parseWithFallback } from '../api/schema.js'
import { useAuthStore, selectToken } from '../auth/auth-store.js'
import type { Task } from '../types/index.js'

const TaskSchema = z.object({
  id: z.string(),
  projectId: z.string(),
  userId: z.string(),
  prompt: z.string(),
  status: z.enum(['idle','analyzing','planning','building','validating','fixing','waiting','done','failed']),
  previewUrl: z.string(),
  errorMsg: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
})

export function useTask(projectId: string, taskId: string) {
  const token = useAuthStore(selectToken)

  return useQuery({
    queryKey: ['projects', projectId, 'tasks', taskId],
    queryFn: async () => {
      const raw = await api.get<Task>(`/api/v1/projects/${projectId}/tasks/${taskId}`, token ?? undefined)
      return parseWithFallback(z.object({ data: TaskSchema }), raw, null)?.data ?? null
    },
    enabled: token !== null && !!projectId && !!taskId,
    refetchInterval: (query) => {
      const status = query.state.data?.status
      if (!status) return 2000
      return ['done', 'failed'].includes(status) ? false : 2000
    },
  })
}

export function useCreateTask(projectId: string) {
  const token = useAuthStore(selectToken)
  const queryClient = useQueryClient()

  return useMutation({
    mutationFn: async (prompt: string) => {
      const raw = await api.post<Task>(
        `/api/v1/projects/${projectId}/tasks`,
        { prompt },
        token ?? undefined,
      )
      return parseWithFallback(z.object({ data: TaskSchema }), raw, null)?.data ?? null
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['projects', projectId, 'tasks'] })
    },
  })
}
```

- [ ] **Step 3: 在 index.ts 导出**

在 Task/Agent events 区块改为：

```typescript
// Task / Agent events
export { useAgentEvents } from './task/use-agent-events.js'
export { useTask, useCreateTask } from './task/use-tasks.js'
```

在 Project 区块补充：

```typescript
export { useProjects, useProject, useCreateProject, useDeleteProject } from './project/use-projects.js'
```

- [ ] **Step 4: 验证编译**

```bash
cd /Users/cookie/project/forge/packages/core
npx tsc --noEmit
```

预期：无错误

- [ ] **Step 5: commit**

```bash
cd /Users/cookie/project/forge
git add packages/core/project/use-projects.ts packages/core/task/use-tasks.ts packages/core/index.ts
git commit -m "feat(core): add useDeleteProject and useCreateTask"
```

---

## Task 3: 后端补 /projects/:projectID/stream 路由

后端当前 SSE 路由是 `/api/v1/tasks/:taskID/stream`，但前端 `useAgentEvents` 订阅的是 `/api/v1/projects/:projectID/stream`。需要新增一个 project-level stream：找到该 project 最新的 task，并执行相同的 SSE 逻辑。

**Files:**
- Create: `apps/api/api/handler/project_stream.go`
- Modify: `apps/api/api/router.go`
- Modify: `apps/api/api/handler/task.go`（支持 token query param）

- [ ] **Step 1: 修改 task.go 的 Stream handler 支持 query param token**

在 `apps/api/api/handler/task.go` 的 `Stream` 方法中，`RequireAuth` 中间件需要能读 `?token=` 参数。  
最简单：在 Stream handler 开头额外从 query param 读 userID（作为 fallback）：

在 `apps/api/api/middleware/auth.go` 的 `RequireAuth` 函数中，`extractBearerToken` 失败后，尝试从 query param 读：

```go
func RequireAuth(jwtSecret string) func(http.Handler) http.Handler {
	return func(next http.Handler) http.Handler {
		return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			token := extractBearerToken(r)
			if token == "" {
				// SSE clients cannot set headers — fall back to ?token= query param
				token = r.URL.Query().Get("token")
			}
			if token == "" {
				WriteError(w, domain.ErrUnauthorized)
				return
			}

			userID, err := validateJWT(token, jwtSecret)
			if err != nil {
				WriteError(w, domain.ErrUnauthorized)
				return
			}

			ctx := context.WithValue(r.Context(), userIDKey, userID)
			next.ServeHTTP(w, r.WithContext(ctx))
		})
	}
}
```

- [ ] **Step 2: 新建 project_stream.go**

创建 `apps/api/api/handler/project_stream.go`：

```go
package handler

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/forge-ai/forge/api/api/middleware"
	"github.com/forge-ai/forge/api/domain"
)

// Stream 的 project 版本：找到该 project 下最新的 task，代理其 SSE 流。
// GET /api/v1/projects/:projectID/stream
func (h *TaskHandler) ProjectStream(w http.ResponseWriter, r *http.Request) {
	projectID := chi.URLParam(r, "projectID")
	userID := middleware.UserIDFromContext(r.Context())

	// Verify project ownership
	project, err := h.projectRepo.GetByID(r.Context(), projectID)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}
	if project.UserID != userID {
		middleware.WriteError(w, domain.ErrForbidden)
		return
	}

	// Find the latest task for this project
	tasks, err := h.taskRepo.ListByProjectID(r.Context(), projectID, 1, 0)
	if err != nil {
		middleware.WriteError(w, err)
		return
	}

	// No tasks yet — send idle state and close
	if len(tasks) == 0 {
		w.Header().Set("Content-Type", "text/event-stream")
		w.Header().Set("Cache-Control", "no-cache")
		w.Header().Set("Connection", "keep-alive")
		w.Header().Set("X-Accel-Buffering", "no")
		w.WriteHeader(http.StatusOK)
		data, _ := json.Marshal(map[string]string{"type": "task_state", "status": "idle"})
		fmt.Fprintf(w, "event: agent_event\ndata: %s\n\n", data)
		return
	}

	task := tasks[0]

	// SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no")
	w.WriteHeader(http.StatusOK)

	flusher, ok := w.(http.Flusher)
	if !ok {
		data, _ := json.Marshal(map[string]string{"type": "task_state", "status": string(task.Status)})
		fmt.Fprintf(w, "event: agent_event\ndata: %s\n\n", data)
		return
	}

	ticker := time.NewTicker(2 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-r.Context().Done():
			return
		case <-ticker.C:
			t, err := h.taskRepo.GetByID(r.Context(), task.ID)
			if err != nil {
				fmt.Fprintf(w, "event: error\ndata: {\"error\":\"task not found\"}\n\n")
				flusher.Flush()
				return
			}

			data, _ := json.Marshal(map[string]string{
				"type":       "task_state",
				"status":     string(t.Status),
				"previewUrl": t.PreviewURL,
				"errorMsg":   t.ErrorMsg,
			})
			fmt.Fprintf(w, "event: agent_event\ndata: %s\n\n", data)
			flusher.Flush()

			if t.IsTerminal() {
				fmt.Fprintf(w, "event: done\ndata: {\"previewUrl\":\"%s\"}\n\n", t.PreviewURL)
				flusher.Flush()
				return
			}
		}
	}
}
```

- [ ] **Step 3: 在 router.go 注册新路由**

在 `apps/api/api/router.go` 的 Projects 路由组内，`/{projectID}` 子路由中添加：

```go
r.Route("/{projectID}", func(r chi.Router) {
    r.Get("/", deps.Project.Get)
    r.Delete("/", deps.Project.Delete)
    r.Get("/stream", deps.Task.ProjectStream)   // ← 新增这行

    // Tasks nested under project
    r.Route("/tasks", func(r chi.Router) {
        r.Get("/", deps.Task.List)
        r.Post("/", deps.Task.Create)
        r.Get("/{taskID}", deps.Task.Get)
    })
})
```

- [ ] **Step 4: 编译验证**

```bash
cd /Users/cookie/project/forge/apps/api
GOPROXY=direct GONOSUMDB="*" go build ./...
```

预期：无错误

- [ ] **Step 5: 手动验证 SSE（需要 API 在跑）**

```bash
# 先注册 + 登录拿 token
TOKEN=$(curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@forge.local","password":"devpassword123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

# 创建 project
PROJECT_ID=$(curl -s -X POST http://localhost:8080/api/v1/projects \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"test"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['id'])")

# 订阅 project stream（无 task 时收到 idle 状态）
curl -s "http://localhost:8080/api/v1/projects/$PROJECT_ID/stream?token=$TOKEN"
```

预期输出：
```
event: agent_event
data: {"type":"task_state","status":"idle"}
```

- [ ] **Step 6: 运行后端测试**

```bash
cd /Users/cookie/project/forge/apps/api
GOPROXY=direct GONOSUMDB="*" go test ./...
```

预期：所有测试通过

- [ ] **Step 7: commit**

```bash
cd /Users/cookie/project/forge
git add apps/api/api/handler/project_stream.go apps/api/api/router.go apps/api/api/middleware/auth.go
git commit -m "feat(api): add /projects/:id/stream route + SSE token query param support"
```

---

## Task 4: 前端 LoginPage 接真实 register/login API

当前 LoginPage 只有一个"跳过"按钮调 `useDevLogin`。改为有可用的 email/password 表单，同时保留 dev 快速登录按钮。

**Files:**
- Modify: `apps/web/src/pages/LoginPage.tsx`

- [ ] **Step 1: 替换 LoginPage.tsx**

完整替换文件内容：

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLogin, useDevLogin, ApiError } from '@forge/core'

export function LoginPage() {
  const navigate = useNavigate()
  const { mutate: login, isPending: loginPending } = useLogin()
  const { mutate: devLogin, isPending: devPending } = useDevLogin()

  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleLogin = () => {
    if (!email || !password) {
      setError('请输入邮箱和密码')
      return
    }
    setError('')
    login(
      { email, password },
      {
        onSuccess: () => navigate('/projects'),
        onError: (err) => {
          if (err instanceof ApiError && err.status === 401) {
            setError('邮箱或密码错误')
          } else {
            setError('登录失败，请稍后重试')
          }
        },
      },
    )
  }

  const handleDevLogin = () => {
    setError('')
    devLogin(undefined, { onSuccess: () => navigate('/projects') })
  }

  const isPending = loginPending || devPending

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div style={{ width: 320, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔨</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Forge</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>AI 应用生成平台</p>
        </div>

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="邮箱"
            type="email"
            disabled={isPending}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            style={{
              width: '100%',
              background: 'var(--bg-card)',
              border: `1px solid ${error ? 'var(--red)' : 'var(--border)'}`,
              borderRadius: 'var(--radius)',
              color: 'var(--text)',
              fontSize: 13,
              padding: '10px 14px',
            }}
          />
          <input
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="密码"
            type="password"
            disabled={isPending}
            onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
            style={{
              width: '100%',
              background: 'var(--bg-card)',
              border: `1px solid ${error ? 'var(--red)' : 'var(--border)'}`,
              borderRadius: 'var(--radius)',
              color: 'var(--text)',
              fontSize: 13,
              padding: '10px 14px',
            }}
          />

          {error && (
            <p style={{ fontSize: 12, color: 'var(--red, #ef4444)', margin: 0 }}>{error}</p>
          )}

          <button
            onClick={handleLogin}
            disabled={isPending}
            style={{
              width: '100%',
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 'var(--radius)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 500,
              padding: '10px 14px',
              cursor: isPending ? 'not-allowed' : 'pointer',
              opacity: isPending ? 0.7 : 1,
            }}
          >
            {loginPending ? '登录中...' : '登录'}
          </button>

          <button
            onClick={handleDevLogin}
            disabled={isPending}
            style={{
              width: '100%',
              background: 'transparent',
              border: '1px dashed var(--accent)',
              borderRadius: 'var(--radius)',
              color: 'var(--accent)',
              fontSize: 12,
              padding: '8px 14px',
              cursor: isPending ? 'not-allowed' : 'pointer',
              opacity: isPending ? 0.6 : 1,
            }}
          >
            {devPending ? '登录中...' : '→ 快速登录（开发模式）'}
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 验证 TypeScript**

```bash
cd /Users/cookie/project/forge/apps/web
npx tsc --noEmit
```

预期：无错误

- [ ] **Step 3: commit**

```bash
cd /Users/cookie/project/forge
git add apps/web/src/pages/LoginPage.tsx
git commit -m "feat(web): real login form with email/password"
```

---

## Task 5: 前端 main.tsx 启动时调 useMe 恢复 session

刷新页面后 Zustand store 清空（内存存储），token 丢失。需要在应用启动时从 localStorage 读 token 并验证。

**Files:**
- Modify: `packages/core/auth/auth-store.ts`
- Modify: `apps/web/src/main.tsx`

- [ ] **Step 1: auth-store 初始化时从 localStorage 读 token**

在 `packages/core/auth/auth-store.ts` 中，初始化 store 时读取 localStorage：

```typescript
import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { User } from '../types/index.js'

interface AuthState {
  token: string | null
  user: User | null
  setToken: (token: string, user: User) => void
  logout: () => void
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      setToken: (token, user) => set({ token, user }),
      logout: () => set({ token: null, user: null }),
    }),
    {
      name: 'forge-auth',
      partialize: (s) => ({ token: s.token, user: s.user }),
    },
  ),
)

export const selectToken = (s: AuthState) => s.token
export const selectUser = (s: AuthState) => s.user
export const selectIsAuthed = (s: AuthState) => s.token !== null
export const selectSetToken = (s: AuthState) => s.setToken
```

> 注意：`zustand/middleware` 的 `persist` 已包含在 zustand v4 中，不需要额外安装。

- [ ] **Step 2: 验证 zustand persist 可用**

```bash
cd /Users/cookie/project/forge/packages/core
node -e "const z = require('./node_modules/zustand'); console.log(Object.keys(require('./node_modules/zustand/middleware')))"
```

预期：输出包含 `persist`

如果报错，先检查 zustand 版本：

```bash
cat /Users/cookie/project/forge/packages/core/node_modules/zustand/package.json | grep '"version"'
```

- [ ] **Step 3: 验证 TypeScript 编译**

```bash
cd /Users/cookie/project/forge/packages/core
npx tsc --noEmit
```

预期：无错误

- [ ] **Step 4: commit**

```bash
cd /Users/cookie/project/forge
git add packages/core/auth/auth-store.ts
git commit -m "feat(core): persist auth token to localStorage via zustand persist"
```

---

## Task 6: 前端 RequirementInput 和 PMReview 接真实 API

**Files:**
- Modify: `apps/web/src/components/left-panel/RequirementInput.tsx`
- Modify: `apps/web/src/components/left-panel/PMReview.tsx`
- Modify: `apps/web/src/store/workspace-store.ts`

当前：RequirementInput 直接造 mock draft，PMReview 的 handleConfirm 用 mock projectId。

目标：
1. RequirementInput 的 handleSubmit → POST Agent Service `/run` → 把返回的 `jobId` 存到 store
2. PMReview 的 handleConfirm → POST `/api/v1/projects` 创建 project → 把 projectId 写入 store 并跳转 WorkspacePage

> 注：RequirementInput 依赖 Agent Service（`:3001`），如果 Agent Service 没跑，这一步暂时保留 mock。PMReview 接真实后端是 P0。

- [ ] **Step 1: workspace-store 补 agentJobId 和 setAgentJobId**

在 `apps/web/src/store/workspace-store.ts` 的 state interface 里加：

```typescript
// ── Agent Service job ─────────────────────────────────────────────
agentJobId: string | null
setAgentJobId: (jobId: string) => void
```

在 store 实现里加：

```typescript
agentJobId: null,
setAgentJobId: (jobId) => set({ agentJobId: jobId }),
```

在 initialState 里加：

```typescript
agentJobId: null,
```

在 selectorsのセクション 末尾加：

```typescript
export const selectAgentJobId = (s: WorkspaceState) => s.agentJobId
```

- [ ] **Step 2: 修改 PMReview 的 handleConfirm 调真实后端**

找到 `handleConfirm` 函数，替换为：

```typescript
const { mutate: createProject, isPending: isCreating } = useCreateProject()
const navigate = useNavigate()

const handleConfirm = async () => {
  if (selectedCount === 0 || isStarting) return
  setIsStarting(true)

  createProject(draft.title || userInput.slice(0, 40), {
    onSuccess: (result) => {
      const projectId = result?.data?.id
      if (!projectId) {
        setIsStarting(false)
        return
      }
      startGeneration(projectId)
      navigate(`/projects/${projectId}`)
    },
    onError: () => {
      setIsStarting(false)
    },
  })
}
```

需要在文件顶部加 imports：

```typescript
import { useNavigate } from 'react-router-dom'
import { useCreateProject } from '@forge/core'
```

并把 `isStarting` 的 disabled 条件改为：

```typescript
disabled={selectedCount === 0 || isStarting || isCreating}
```

- [ ] **Step 3: 验证 TypeScript**

```bash
cd /Users/cookie/project/forge/apps/web
npx tsc --noEmit
```

预期：无错误

- [ ] **Step 4: commit**

```bash
cd /Users/cookie/project/forge
git add apps/web/src/store/workspace-store.ts \
        apps/web/src/components/left-panel/PMReview.tsx
git commit -m "feat(web): PMReview calls real createProject API"
```

---

## Task 7: 前端 ProjectsPage 接通删除功能

**Files:**
- Modify: `apps/web/src/pages/ProjectsPage.tsx`

- [ ] **Step 1: 替换 handleDelete**

在 `ProjectsPage.tsx` 顶部加：

```typescript
import { useProjects, useDeleteProject } from '@forge/core'
```

（替换原来只有 `useProjects` 的 import）

替换 `handleDelete`：

```typescript
const { mutate: deleteProject } = useDeleteProject()

const handleDelete = (id: string) => {
  if (!window.confirm('确定删除这个项目？此操作不可撤销。')) return
  deleteProject(id)
}
```

- [ ] **Step 2: 验证 TypeScript**

```bash
cd /Users/cookie/project/forge/apps/web
npx tsc --noEmit
```

预期：无错误

- [ ] **Step 3: commit**

```bash
cd /Users/cookie/project/forge
git add apps/web/src/pages/ProjectsPage.tsx
git commit -m "feat(web): wire up delete project"
```

---

## Task 8: 删除废弃文件 + useAgentEvents 修复 token

**Files:**
- Delete: `apps/web/src/hooks/useAgentStream.ts`
- Modify: `apps/web/src/hooks/useAgentEvents.ts`

- [ ] **Step 1: 删除 useAgentStream.ts**

```bash
rm /Users/cookie/project/forge/apps/web/src/hooks/useAgentStream.ts
```

- [ ] **Step 2: 修改 useAgentEvents.ts 传入 token**

当前代码中 `EventSource` 连接没有 token：

```typescript
const url = `/api/v1/projects/${projectId}/stream`
```

改为从 store 读 token 并传给 query param：

```typescript
import { useEffect } from 'react'
import { useAuthStore, selectToken } from '@forge/core'
import { useWorkspaceStore } from '../store/workspace-store.js'
import type { AgentEvent } from '@forge/core'

export function useAgentEvents(projectId: string | null) {
  const token = useAuthStore(selectToken)
  const addEvent = useWorkspaceStore((s) => s.addEvent)
  const setPreviewUrl = useWorkspaceStore((s) => s.setPreviewUrl)
  const setWaiting = useWorkspaceStore((s) => s.setWaiting)

  useEffect(() => {
    if (!projectId || !token) return

    const url = `/api/v1/projects/${projectId}/stream?token=${encodeURIComponent(token)}`
    const es = new EventSource(url)

    es.addEventListener('agent_event', (e: MessageEvent) => {
      try {
        const event = JSON.parse(e.data) as AgentEvent
        addEvent(event)
        if (event.type === 'waiting' && event.reason) {
          setWaiting(event.reason)
        }
      } catch {
        // malformed event — ignore
      }
    })

    es.addEventListener('done', (e: MessageEvent) => {
      try {
        const data = JSON.parse(e.data) as { previewUrl: string }
        if (data.previewUrl) setPreviewUrl(data.previewUrl)
      } catch {}
      es.close()
    })

    es.onerror = () => {
      // SSE auto-reconnects on error — no action needed
    }

    return () => es.close()
  }, [projectId, token, addEvent, setPreviewUrl, setWaiting])
}
```

- [ ] **Step 3: 验证无孤儿 import**

```bash
grep -r "useAgentStream" /Users/cookie/project/forge/apps/web/src
```

预期：无输出（没有文件引用已删除的 hook）

- [ ] **Step 4: 验证 TypeScript**

```bash
cd /Users/cookie/project/forge/apps/web
npx tsc --noEmit
```

预期：无错误

- [ ] **Step 5: commit**

```bash
cd /Users/cookie/project/forge
git add apps/web/src/hooks/useAgentEvents.ts
git rm apps/web/src/hooks/useAgentStream.ts
git commit -m "fix(web): SSE token via query param, remove deprecated useAgentStream"
```

---

## Task 9: 全链路端到端验证

- [ ] **Step 1: 启动后端**

```bash
# 确保 postgres 在跑
export PATH="/usr/local/bin:$PATH"
cd /Users/cookie/project/forge
docker compose ps postgres  # 应该是 Up (healthy)

# 如未启动
make db-up

# 启动 API
cd apps/api && go run ./cmd/server &
sleep 2
curl http://localhost:8080/health
```

预期：`{"data":{"db":"ok","status":"ok"}}`

- [ ] **Step 2: 启动前端**

```bash
cd /Users/cookie/project/forge/apps/web
npm run dev
```

预期：Vite 输出 `Local: http://localhost:5173`

- [ ] **Step 3: 验证登录流程**

打开 `http://localhost:5173`，点「快速登录（开发模式）」：
- 预期：跳转到 `/projects` 页面
- 刷新页面后仍保持登录状态（localStorage persist）

- [ ] **Step 4: 验证 Project 创建**

在 WorkspacePage 输入需求，点「生成应用」，查看 PM Review 页面，点「确认并生成」：
- 预期：URL 变为 `/projects/:id`，中间面板显示 running 状态

- [ ] **Step 5: 验证 SSE 连接**

```bash
# 用当前 token（从 localStorage 读取，或重新登录获取）
TOKEN=$(curl -s -X POST http://localhost:8080/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"dev@forge.local","password":"devpassword123"}' \
  | python3 -c "import sys,json; print(json.load(sys.stdin)['data']['token'])")

# 获取最新 project id
PROJECT_ID=$(curl -s http://localhost:8080/api/v1/projects \
  -H "Authorization: Bearer $TOKEN" \
  | python3 -c "import sys,json; d=json.load(sys.stdin); print(d['data'][0]['id']) if d['data'] else print('')")

# 订阅 SSE
curl -N "http://localhost:8080/api/v1/projects/$PROJECT_ID/stream?token=$TOKEN"
```

预期：连接建立，收到至少一条 `agent_event` 数据

- [ ] **Step 6: 验证删除**

在 ProjectsPage 点击删除按钮，确认弹窗：
- 预期：项目从列表消失，页面刷新后不再出现

- [ ] **Step 7: 后端测试全绿**

```bash
cd /Users/cookie/project/forge/apps/api
GOPROXY=direct GONOSUMDB="*" go test ./...
```

预期：全部 PASS

- [ ] **Step 8: 最终 commit**

```bash
cd /Users/cookie/project/forge
git add -A
git commit -m "feat: full frontend-backend integration complete"
```

---

## Self-Review Checklist

**Spec coverage：**
- ✅ Task 1: `Task` 类型 + `useMe` hook
- ✅ Task 2: `useDeleteProject` + `useCreateTask`
- ✅ Task 3: 后端 `/projects/:id/stream` + SSE token query param
- ✅ Task 4: 真实登录表单
- ✅ Task 5: localStorage persist（刷新不登出）
- ✅ Task 6: PMReview 接真实 createProject
- ✅ Task 7: 删除项目接通
- ✅ Task 8: 删废弃文件 + SSE token 修复
- ✅ Task 9: 端到端验证

**已知跳过（超出本次 scope）：**
- RequirementInput 调 Agent Service（Agent Service 需独立启动）
- BullMQ 持久化
- packages/ui Badge/Card/Modal
