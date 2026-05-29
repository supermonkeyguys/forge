# Frontend Pages Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 为 Forge 前端补完路由、LoginPage（skip 模式）、ProjectsPage（列表+空状态），并改造 main.tsx 和 WorkspacePage 接入路由参数。

**Architecture:** `apps/web/src/routes.tsx` 定义路由树和 `ProtectedRoute` 守卫；`main.tsx` 挂载 `BrowserRouter`；`LoginPage` 写 mock token 绕过 auth；`ProjectsPage` 通过 `@forge/core` 的 `useProjects()` 读数据；`WorkspacePage` 从 `useParams` 读 projectId。

**Tech Stack:** React 18, React Router DOM v6, Zustand（`useAuthStore`），TanStack Query（`useProjects`），TypeScript，Vitest

---

## File Map

| 操作 | 文件 | 职责 |
|------|------|------|
| 新建 | `apps/web/src/routes.tsx` | 路由定义 + `ProtectedRoute` |
| 新建 | `apps/web/src/pages/LoginPage.tsx` | 登录页（skip 模式） |
| 新建 | `apps/web/src/pages/ProjectsPage.tsx` | 项目列表页 |
| 新建 | `apps/web/src/components/project-card/project-card.tsx` | 单个项目卡片组件（从 ProjectsPage 提取） |
| 修改 | `apps/web/src/main.tsx` | 包裹 BrowserRouter，渲染 Routes |
| 修改 | `apps/web/src/pages/WorkspacePage.tsx` | 从 `useParams` 读 projectId |
| 新建 | `apps/web/src/store/workspace-store.test.ts` | store reset 测试（已存在，不覆盖） |

---

### Task 1: 改造 main.tsx，挂载 BrowserRouter

**Files:**
- Modify: `apps/web/src/main.tsx`

- [ ] **Step 1: 更新 main.tsx**

将 `apps/web/src/main.tsx` 完整替换为：

```tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { BrowserRouter } from 'react-router-dom'
import { AppRoutes } from './routes.js'
import './styles/global.css'

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 30_000 },
    mutations: { retry: 0 },
  },
})

const root = document.getElementById('root')!
createRoot(root).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </QueryClientProvider>
  </StrictMode>,
)
```

- [ ] **Step 2: 验证 TypeScript 编译**

```bash
cd apps/web && pnpm typecheck
```

期望：报错（因为 `routes.tsx` 还不存在），但不是 main.tsx 本身的类型错误。

---

### Task 2: 新建 routes.tsx（路由树 + ProtectedRoute）

**Files:**
- Create: `apps/web/src/routes.tsx`

- [ ] **Step 1: 创建 routes.tsx**

```tsx
import { Navigate, Outlet, Route, Routes } from 'react-router-dom'
import { useAuthStore, selectIsAuthed } from '@forge/core'
import { LoginPage } from './pages/LoginPage.js'
import { ProjectsPage } from './pages/ProjectsPage.js'
import { WorkspacePage } from './pages/WorkspacePage.js'

function ProtectedRoute() {
  const isAuthed = useAuthStore(selectIsAuthed)
  return isAuthed ? <Outlet /> : <Navigate to="/login" replace />
}

export function AppRoutes() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/projects" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route element={<ProtectedRoute />}>
        <Route path="/projects" element={<ProjectsPage />} />
        <Route path="/projects/:id" element={<WorkspacePage />} />
      </Route>
    </Routes>
  )
}
```

- [ ] **Step 2: 验证编译**

```bash
cd apps/web && pnpm typecheck
```

期望：报错 LoginPage / ProjectsPage 不存在（因为还没创建），WorkspacePage 已存在所以该行不报错。

---

### Task 3: 新建 LoginPage

**Files:**
- Create: `apps/web/src/pages/LoginPage.tsx`

- [ ] **Step 1: 创建 LoginPage.tsx**

```tsx
import { useNavigate } from 'react-router-dom'
import { useAuthStore } from '@forge/core'

const MOCK_USER = {
  id: 'dev-user',
  email: 'dev@forge.local',
  name: 'Dev User',
  createdAt: new Date().toISOString(),
}

export function LoginPage() {
  const navigate = useNavigate()
  const setToken = useAuthStore((s) => s.setToken)

  const handleSkip = () => {
    setToken('dev-token', MOCK_USER)
    navigate('/projects')
  }

  return (
    <div style={{
      height: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--bg)',
    }}>
      <div style={{
        width: 320,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 24,
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: 32, marginBottom: 8 }}>🔨</div>
          <h1 style={{ fontSize: 22, fontWeight: 700, marginBottom: 4 }}>Forge</h1>
          <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>AI 应用生成平台</p>
        </div>

        <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 10 }}>
          <input
            disabled
            placeholder="邮箱（暂不支持）"
            style={{
              width: '100%',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              color: 'var(--text-dim)',
              fontSize: 13,
              padding: '10px 14px',
              cursor: 'not-allowed',
            }}
          />
          <input
            disabled
            type="password"
            placeholder="密码（暂不支持）"
            style={{
              width: '100%',
              background: 'var(--bg-card)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius)',
              color: 'var(--text-dim)',
              fontSize: 13,
              padding: '10px 14px',
              cursor: 'not-allowed',
            }}
          />
          <button
            onClick={handleSkip}
            style={{
              width: '100%',
              background: 'transparent',
              border: '1px dashed var(--accent)',
              borderRadius: 'var(--radius)',
              color: 'var(--accent)',
              fontSize: 13,
              padding: '10px 14px',
              cursor: 'pointer',
              marginTop: 4,
            }}
          >
            → 跳过登录（开发模式）
          </button>
        </div>

        <p style={{ fontSize: 11, color: 'var(--text-dim)', textAlign: 'center' }}>
          真实登录将在后端 auth 完成后启用
        </p>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 验证编译**

```bash
cd apps/web && pnpm typecheck
```

期望：LoginPage 相关错误消失，仍报 ProjectsPage 不存在。

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/main.tsx apps/web/src/routes.tsx apps/web/src/pages/LoginPage.tsx
git commit -m "feat: add BrowserRouter, AppRoutes, LoginPage (skip mode)"
```

---

### Task 4: 新建 project-card 组件

ProjectsPage 超过 100 行，提前提取卡片组件。

**Files:**
- Create: `apps/web/src/components/project-card/project-card.tsx`

- [ ] **Step 1: 创建 project-card.tsx**

```tsx
import { useNavigate } from 'react-router-dom'
import type { Project } from '@forge/core'

const STATUS_LABEL: Record<string, string> = {
  done:       '完成',
  building:   '生成中',
  analyzing:  '生成中',
  planning:   '生成中',
  validating: '生成中',
  fixing:     '生成中',
  failed:     '失败',
  waiting:    '等待',
  idle:       '待机',
}

const STATUS_COLOR: Record<string, string> = {
  done:      'var(--green)',
  failed:    'var(--red)',
  waiting:   'var(--yellow)',
  building:  'var(--accent)',
  analyzing: 'var(--accent)',
  planning:  'var(--accent)',
  validating:'var(--accent)',
  fixing:    'var(--accent)',
  idle:      'var(--text-dim)',
}

const IN_PROGRESS = new Set(['building', 'analyzing', 'planning', 'validating', 'fixing'])

interface ProjectCardProps {
  project: Project
  onDelete: (id: string) => void
}

export function ProjectCard({ project, onDelete }: ProjectCardProps) {
  const navigate = useNavigate()
  const color = STATUS_COLOR[project.status] ?? 'var(--text-dim)'
  const label = STATUS_LABEL[project.status] ?? project.status

  return (
    <div style={{
      background: 'var(--bg-card)',
      border: `1px solid ${IN_PROGRESS.has(project.status) ? 'rgba(91,110,245,0.3)' : 'var(--border)'}`,
      borderRadius: 'var(--radius)',
      padding: 16,
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 600, flex: 1, marginRight: 8 }}>
          {project.name}
        </div>
        <span style={{
          background: color + '20',
          color,
          border: `1px solid ${color}40`,
          borderRadius: 4,
          fontSize: 11,
          padding: '2px 7px',
          whiteSpace: 'nowrap',
        }}>
          {label}
        </span>
      </div>

      <div style={{ fontSize: 11, color: 'var(--text-dim)', marginBottom: 12 }}>
        {new Date(project.createdAt).toLocaleDateString('zh-CN')}
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        {project.status === 'done' && (
          <>
            {project.previewUrl && (
              <ActionButton onClick={() => window.open(project.previewUrl!, '_blank')} label="预览" />
            )}
            <ActionButton onClick={() => navigate(`/projects/${project.id}`)} label="打开" />
          </>
        )}
        {IN_PROGRESS.has(project.status) && (
          <ActionButton onClick={() => navigate(`/projects/${project.id}`)} label="查看进度" primary />
        )}
        {(project.status === 'idle' || project.status === 'waiting') && (
          <ActionButton onClick={() => navigate(`/projects/${project.id}`)} label="打开" />
        )}
        {project.status === 'failed' && (
          <>
            <ActionButton onClick={() => navigate(`/projects/${project.id}`)} label="重试" />
            <ActionButton onClick={() => onDelete(project.id)} label="删除" />
          </>
        )}
      </div>
    </div>
  )
}

function ActionButton({ onClick, label, primary }: { onClick: () => void; label: string; primary?: boolean }) {
  return (
    <button
      onClick={onClick}
      style={{
        flex: 1,
        background: 'var(--bg-hover)',
        border: 'none',
        borderRadius: 'var(--radius-sm)',
        color: primary ? 'var(--accent)' : 'var(--text-muted)',
        fontSize: 11,
        padding: '6px 0',
        cursor: 'pointer',
      }}
    >
      {label}
    </button>
  )
}
```

- [ ] **Step 2: 验证编译**

```bash
cd apps/web && pnpm typecheck
```

期望：project-card.tsx 无类型错误。

---

### Task 5: 新建 ProjectsPage

**Files:**
- Create: `apps/web/src/pages/ProjectsPage.tsx`

- [ ] **Step 1: 创建 ProjectsPage.tsx**

```tsx
import { useNavigate } from 'react-router-dom'
import { useProjects } from '@forge/core'
import { ProjectCard } from '../components/project-card/project-card.js'

export function ProjectsPage() {
  const navigate = useNavigate()
  const { data, isLoading, isError } = useProjects()
  const projects = data?.data ?? []

  const handleDelete = (_id: string) => {
    // TODO: wire up delete mutation when Go API is ready
  }

  if (isLoading) {
    return <PageShell><LoadingState /></PageShell>
  }

  if (isError) {
    return <PageShell><ErrorState /></PageShell>
  }

  return (
    <PageShell>
      <div style={{ maxWidth: 900, margin: '0 auto', padding: '32px 24px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 24 }}>
          <div>
            <h1 style={{ fontSize: 20, fontWeight: 700 }}>我的项目</h1>
            {projects.length > 0 && (
              <p style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                {projects.length} 个项目
              </p>
            )}
          </div>
          <button
            onClick={() => navigate('/projects/new')}
            style={{
              background: 'var(--accent)',
              border: 'none',
              borderRadius: 'var(--radius)',
              color: '#fff',
              fontSize: 13,
              fontWeight: 500,
              padding: '8px 16px',
              cursor: 'pointer',
            }}
          >
            + 新建项目
          </button>
        </div>

        {projects.length === 0 ? (
          <EmptyState onNew={() => navigate('/projects/new')} />
        ) : (
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))',
            gap: 12,
          }}>
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </PageShell>
  )
}

function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{ height: '100vh', background: 'var(--bg)', overflowY: 'auto' }}>
      {children}
    </div>
  )
}

function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 16,
      paddingTop: 80,
    }}>
      <div style={{ fontSize: 56, opacity: 0.15 }}>🔨</div>
      <div style={{ textAlign: 'center' }}>
        <h2 style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>还没有项目</h2>
        <p style={{ fontSize: 13, color: 'var(--text-muted)' }}>
          用自然语言描述你的 App，Agent 团队来生成它
        </p>
      </div>
      <button
        onClick={onNew}
        style={{
          background: 'var(--accent)',
          border: 'none',
          borderRadius: 'var(--radius)',
          color: '#fff',
          fontSize: 14,
          fontWeight: 500,
          padding: '10px 24px',
          cursor: 'pointer',
          marginTop: 8,
        }}
      >
        创建第一个项目
      </button>
    </div>
  )
}

function LoadingState() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--text-dim)' }}>
      加载中...
    </div>
  )
}

function ErrorState() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', color: 'var(--red)' }}>
      加载失败，请刷新重试
    </div>
  )
}
```

- [ ] **Step 2: 验证编译**

```bash
cd apps/web && pnpm typecheck
```

期望：ProjectsPage 无类型错误，此时 routes.tsx 中 ProjectsPage 引用也应解析成功。

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/project-card/project-card.tsx apps/web/src/pages/ProjectsPage.tsx
git commit -m "feat: add ProjectsPage with project cards and empty state"
```

---

### Task 6: 改造 WorkspacePage 接入路由参数

当前 `WorkspacePage` 从 store 读 `projectId`，改为从 `useParams` 读。当路径为 `/projects/new` 时，`id === 'new'`，projectId 为 null，phase 初始为 `input`。

**Files:**
- Modify: `apps/web/src/pages/WorkspacePage.tsx`

- [ ] **Step 1: 更新 WorkspacePage.tsx**

将文件完整替换为：

```tsx
/**
 * WorkspacePage — three-column layout.
 *
 * [Left 320px]        [Center flex-1]       [Right 480px]
 * ConversationPanel   AgentFlowPanel         PreviewPanel
 *
 * projectId comes from the URL param (:id).
 * When id === 'new', the workspace starts in 'input' phase with no project.
 */

import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useAgentEvents } from '../hooks/useAgentEvents.js'
import { useWorkspaceStore, selectProjectId } from '../store/workspace-store.js'
import { ConversationPanel } from '../components/left-panel/ConversationPanel.js'
import { AgentFlowPanel } from '../components/center-panel/AgentFlowPanel.js'
import { PreviewPanel } from '../components/right-panel/PreviewPanel.js'

export function WorkspacePage() {
  const { id } = useParams<{ id: string }>()
  const projectId = id === 'new' ? null : (id ?? null)

  const storeProjectId = useWorkspaceStore(selectProjectId)
  const startGeneration = useWorkspaceStore((s) => s.startGeneration)
  const reset = useWorkspaceStore((s) => s.reset)

  // Sync route param into store when navigating to an existing project
  useEffect(() => {
    if (projectId && projectId !== storeProjectId) {
      startGeneration(projectId)
    }
    if (!projectId) {
      reset()
    }
  }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  // Connect SSE when a project is active
  useAgentEvents(storeProjectId)

  return (
    <>
      <style>{`
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50%       { opacity: 0.4; }
        }
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
      `}</style>

      <div style={{
        display: 'grid',
        gridTemplateColumns: '320px 1fr 480px',
        height: '100vh',
        overflow: 'hidden',
      }}>
        <ConversationPanel />
        <AgentFlowPanel />
        <PreviewPanel />
      </div>
    </>
  )
}
```

- [ ] **Step 2: 验证编译**

```bash
cd apps/web && pnpm typecheck
```

期望：零类型错误。

- [ ] **Step 3: 运行现有测试**

```bash
cd apps/web && pnpm test --run
```

期望：所有测试通过（`workspace-store.test.ts` 不涉及路由，应继续通过）。

- [ ] **Step 4: 验证 dev server 可以启动**

```bash
cd apps/web && pnpm dev
```

访问 `http://localhost:5173`：
- 应跳转到 `/login`（无 token）
- 点击「跳过登录」→ 跳转到 `/projects`
- `/projects` 显示加载中（因为 `useProjects` 调用真实 API，此时 API 未启动，会显示 Error 状态）
- 手动访问 `/projects/new` 应显示 WorkspacePage 的 `input` 阶段

- [ ] **Step 5: Commit**

```bash
git add apps/web/src/pages/WorkspacePage.tsx
git commit -m "feat: WorkspacePage reads projectId from route params"
```

---

### Task 7: 最终整合验证

- [ ] **Step 1: 全量类型检查**

```bash
cd apps/web && pnpm typecheck
```

期望：零错误。

- [ ] **Step 2: 运行全部测试**

```bash
cd apps/web && pnpm test --run
```

期望：所有测试通过。

- [ ] **Step 3: 手动验证路由流程**

启动 dev server：`cd apps/web && pnpm dev`

| 操作 | 期望结果 |
|------|----------|
| 访问 `/` | 重定向到 `/projects` |
| 无 token 时访问 `/projects` | 重定向到 `/login` |
| 点击「跳过登录」 | 跳到 `/projects`，显示空状态或项目列表 |
| 点击「创建第一个项目」| 跳到 `/projects/new`，WorkspacePage input 阶段 |
| 手动访问 `/projects/new` | WorkspacePage 正常，input 阶段 |
| 刷新 `/projects/new` | 不崩溃，仍然是 input 阶段 |

- [ ] **Step 4: 最终 commit**

```bash
git add -A
git commit -m "feat: complete frontend routing — LoginPage, ProjectsPage, route params"
```
