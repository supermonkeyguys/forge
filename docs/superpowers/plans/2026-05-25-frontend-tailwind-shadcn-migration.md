# Frontend Tailwind + shadcn/ui Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 `apps/web/` 所有内联 `style={{}}` 替换为 Tailwind CSS class，引入 shadcn/ui 组件库，切换到 shadcn 标准暗色主题。

**Architecture:** Tailwind v4（CSS-first，无配置文件）+ shadcn/ui 组件源码复制到项目。分三阶段：基础设施 → 页面层 → 组件层。业务逻辑/store/hooks 零改动。

**Tech Stack:** Tailwind CSS v4, @tailwindcss/vite, shadcn/ui, Radix UI, clsx, tailwind-merge

---

## 文件清单

| 操作 | 文件 |
|------|------|
| 修改 | `apps/web/package.json` |
| 修改 | `apps/web/vite.config.ts` |
| 重写 | `apps/web/src/styles/global.css` |
| 新建 | `apps/web/src/lib/utils.ts` |
| 新建 | `apps/web/src/components/ui/` (shadcn add 生成) |
| 修改 | `apps/web/src/pages/LoginPage.tsx` |
| 修改 | `apps/web/src/pages/ProjectsPage.tsx` |
| 修改 | `apps/web/src/pages/WorkspacePage.tsx` |
| 修改 | `apps/web/src/components/project-card/project-page-states.tsx` |
| 修改 | `apps/web/src/components/project-card/project-card.tsx` |
| 修改 | `apps/web/src/components/left-panel/ConversationHistory.tsx` |
| 修改 | `apps/web/src/components/left-panel/RequirementInput.tsx` |
| 修改 | `apps/web/src/components/left-panel/PMReview.tsx` |
| 修改 | `apps/web/src/components/left-panel/ConversationPanel.tsx` |
| 修改 | `apps/web/src/components/center-panel/AgentFlowPanel.tsx` |
| 修改 | `apps/web/src/components/right-panel/PreviewPanel.tsx` |

---

## Task 1: 安装 Tailwind v4 + 配置 Vite

**Files:**
- Modify: `apps/web/package.json`
- Modify: `apps/web/vite.config.ts`

- [ ] **Step 1: 安装依赖**

```bash
cd apps/web
pnpm add -D tailwindcss@next @tailwindcss/vite
```

- [ ] **Step 2: 修改 vite.config.ts**

完整替换为：

```ts
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { resolve } from 'path'

export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
  ],
  resolve: {
    alias: {
      '@forge/core': resolve(__dirname, '../../packages/core'),
      '@forge/ui': resolve(__dirname, '../../packages/ui'),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:8080',
        changeOrigin: true,
      },
    },
  },
})
```

- [ ] **Step 3: 验证构建**

```bash
cd apps/web
pnpm run build
```

Expected: 构建成功，无报错

- [ ] **Step 4: Commit**

```bash
git add apps/web/package.json apps/web/vite.config.ts
git commit -m "chore(web): install tailwind v4 + vite plugin"
```

---

## Task 2: 初始化 shadcn/ui + 重写 global.css

**Files:**
- Rewrite: `apps/web/src/styles/global.css`
- Create: `apps/web/components.json`
- Create: `apps/web/src/lib/utils.ts`

- [ ] **Step 1: 初始化 shadcn**

```bash
cd apps/web
pnpm dlx shadcn@latest init
```

选项选择：
- Style: **Default**
- Base color: **Zinc**（灰色系，与现有 #0f0f0f 背景接近）
- CSS variables: **Yes**

这会生成 `components.json` 并重写 `src/styles/global.css`（或 `src/index.css`）。

- [ ] **Step 2: 确认 global.css 路径**

shadcn init 可能生成 `src/index.css`，需要确保 `src/main.tsx` 导入的是正确路径。检查 `src/main.tsx` 第 6 行：

```ts
import './styles/global.css'
```

如果 shadcn 生成了 `src/index.css`，将其内容合并到 `src/styles/global.css` 并删除 `src/index.css`。

- [ ] **Step 3: 确认 global.css 内容**

`src/styles/global.css` 最终应该是 shadcn init 生成的暗色主题内容，以 `@import "tailwindcss"` 开头，包含 shadcn CSS 变量。旧的 `--bg`、`--accent`、`--border` 等变量应全部删除。

- [ ] **Step 4: 确认 src/lib/utils.ts 存在**

shadcn init 会自动生成此文件，内容应为：

```ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

如未生成，手动创建：

```bash
mkdir -p apps/web/src/lib
```

```ts
// apps/web/src/lib/utils.ts
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

并安装依赖：

```bash
cd apps/web
pnpm add clsx tailwind-merge
```

- [ ] **Step 5: 验证 dev server 启动**

```bash
cd apps/web
pnpm run dev
```

Expected: 服务启动，访问 http://localhost:5173，页面可以渲染（样式会暂时破碎，正常）

- [ ] **Step 6: Commit**

```bash
git add apps/web/components.json apps/web/src/styles/global.css apps/web/src/lib/utils.ts apps/web/src/tsconfig.json
git commit -m "chore(web): init shadcn/ui dark theme, add cn() utility"
```

---

## Task 3: 添加 shadcn 组件

**Files:**
- Create: `apps/web/src/components/ui/button.tsx`
- Create: `apps/web/src/components/ui/input.tsx`
- Create: `apps/web/src/components/ui/textarea.tsx`
- Create: `apps/web/src/components/ui/card.tsx`
- Create: `apps/web/src/components/ui/badge.tsx`
- Create: `apps/web/src/components/ui/checkbox.tsx`
- Create: `apps/web/src/components/ui/scroll-area.tsx`
- Create: `apps/web/src/components/ui/separator.tsx`

- [ ] **Step 1: 批量 add 组件**

```bash
cd apps/web
pnpm dlx shadcn@latest add button input textarea card badge checkbox scroll-area separator
```

- [ ] **Step 2: 验证文件已生成**

```bash
ls apps/web/src/components/ui/
```

Expected: 看到 `button.tsx`, `input.tsx`, `textarea.tsx`, `card.tsx`, `badge.tsx`, `checkbox.tsx`, `scroll-area.tsx`, `separator.tsx`

- [ ] **Step 3: 验证 typecheck**

```bash
cd apps/web
pnpm run typecheck
```

Expected: 无报错

- [ ] **Step 4: Commit**

```bash
git add apps/web/src/components/ui/
git commit -m "chore(web): add shadcn ui components (button, input, textarea, card, badge, checkbox, scroll-area, separator)"
```

---

## Task 4: 迁移 LoginPage

**Files:**
- Modify: `apps/web/src/pages/LoginPage.tsx`

- [ ] **Step 1: 替换 LoginPage.tsx**

完整替换为：

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useLogin, useDevLogin, ApiError } from '@forge/core'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Card, CardContent } from '../components/ui/card'

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
    devLogin(undefined, {
      onSuccess: () => navigate('/projects'),
      onError: () => setError('快速登录失败，请检查后端服务是否启动'),
    })
  }

  const isPending = loginPending || devPending

  return (
    <div className="flex h-screen items-center justify-center bg-background">
      <Card className="w-80">
        <CardContent className="pt-6">
          <div className="mb-6 flex flex-col items-center gap-2 text-center">
            <div className="text-4xl">🔨</div>
            <h1 className="text-xl font-bold">Forge</h1>
            <p className="text-sm text-muted-foreground">AI 应用生成平台</p>
          </div>

          <div className="flex flex-col gap-3">
            <Input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="邮箱"
              type="email"
              disabled={isPending}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              className={error ? 'border-destructive' : ''}
            />
            <Input
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="密码"
              type="password"
              disabled={isPending}
              onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
              className={error ? 'border-destructive' : ''}
            />

            {error && (
              <p className="text-xs text-destructive">{error}</p>
            )}

            <Button
              onClick={handleLogin}
              disabled={isPending}
              className="w-full"
            >
              {loginPending ? '登录中...' : '登录'}
            </Button>

            <Button
              variant="outline"
              onClick={handleDevLogin}
              disabled={isPending}
              className="w-full border-dashed"
            >
              {devPending ? '登录中...' : '→ 快速登录（开发模式）'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
```

- [ ] **Step 2: 验证 typecheck**

```bash
cd apps/web
pnpm run typecheck
```

Expected: 无报错

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/LoginPage.tsx
git commit -m "feat(web): migrate LoginPage to shadcn/ui + Tailwind"
```

---

## Task 5: 迁移 ProjectsPage

**Files:**
- Modify: `apps/web/src/pages/ProjectsPage.tsx`

- [ ] **Step 1: 替换 ProjectsPage.tsx**

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useProjects, useDeleteProject } from '@forge/core'
import { ProjectCard } from '../components/project-card/project-card'
import { PageShell, EmptyState, LoadingState, ErrorState } from '../components/project-card/project-page-states'
import { Button } from '../components/ui/button'

export function ProjectsPage() {
  const navigate = useNavigate()
  const { data, isLoading, isError } = useProjects()
  const { mutate: deleteProject } = useDeleteProject()
  const projects = data?.data ?? []
  const [deleteError, setDeleteError] = useState<string | null>(null)

  const handleDelete = (id: string) => {
    if (!window.confirm('确定删除这个项目？此操作不可撤销。')) return
    deleteProject(id, {
      onError: () => setDeleteError('删除失败，请稍后重试'),
    })
  }

  if (isLoading) {
    return <PageShell><LoadingState /></PageShell>
  }

  if (isError) {
    return <PageShell><ErrorState /></PageShell>
  }

  return (
    <PageShell>
      <div className="mx-auto max-w-[900px] px-6 py-8">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold">我的项目</h1>
            {projects.length > 0 && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {projects.length} 个项目
              </p>
            )}
          </div>
          <Button onClick={() => navigate('/projects/new')} size="sm">
            + 新建项目
          </Button>
        </div>

        {deleteError && (
          <p className="mb-3 text-sm text-destructive">{deleteError}</p>
        )}

        {projects.length === 0 ? (
          <EmptyState onNew={() => navigate('/projects/new')} />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(240px,1fr))] gap-3">
            {projects.map((p) => (
              <ProjectCard key={p.id} project={p} onDelete={handleDelete} />
            ))}
          </div>
        )}
      </div>
    </PageShell>
  )
}
```

- [ ] **Step 2: 验证 typecheck**

```bash
cd apps/web
pnpm run typecheck
```

Expected: 无报错

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/ProjectsPage.tsx
git commit -m "feat(web): migrate ProjectsPage to shadcn/ui + Tailwind"
```

---

## Task 6: 迁移 WorkspacePage

**Files:**
- Modify: `apps/web/src/pages/WorkspacePage.tsx`

- [ ] **Step 1: 替换 WorkspacePage.tsx**

```tsx
import { useEffect } from 'react'
import { useParams } from 'react-router-dom'
import { useAgentEvents } from '../hooks/useAgentEvents'
import { useWorkspaceStore, selectProjectId } from '../store/workspace-store'
import { ConversationPanel } from '../components/left-panel/ConversationPanel'
import { AgentFlowPanel } from '../components/center-panel/AgentFlowPanel'
import { PreviewPanel } from '../components/right-panel/PreviewPanel'

export function WorkspacePage() {
  const { id } = useParams<{ id: string }>()
  const projectId = id === 'new' ? null : (id ?? null)

  const storeProjectId = useWorkspaceStore(selectProjectId)
  const startGeneration = useWorkspaceStore((s) => s.startGeneration)
  const reset = useWorkspaceStore((s) => s.reset)

  useEffect(() => {
    if (projectId && projectId !== storeProjectId) {
      startGeneration(projectId)
    }
    if (!projectId) {
      reset()
    }
  }, [projectId]) // eslint-disable-line react-hooks/exhaustive-deps

  useAgentEvents(storeProjectId)

  return (
    <div className="grid h-screen overflow-hidden [grid-template-columns:320px_1fr_480px]">
      <ConversationPanel />
      <AgentFlowPanel />
      <PreviewPanel />
    </div>
  )
}
```

- [ ] **Step 2: 验证 typecheck**

```bash
cd apps/web
pnpm run typecheck
```

Expected: 无报错

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/pages/WorkspacePage.tsx
git commit -m "feat(web): migrate WorkspacePage to Tailwind, remove inline keyframes"
```

---

## Task 7: 迁移 project-page-states

**Files:**
- Modify: `apps/web/src/components/project-card/project-page-states.tsx`

- [ ] **Step 1: 替换 project-page-states.tsx**

```tsx
import { Button } from '../ui/button'

export function PageShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="h-screen overflow-y-auto bg-background">
      {children}
    </div>
  )
}

export function EmptyState({ onNew }: { onNew: () => void }) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 pt-20">
      <div className="text-5xl opacity-15">🔨</div>
      <div className="text-center">
        <h2 className="mb-1.5 text-base font-semibold">还没有项目</h2>
        <p className="text-sm text-muted-foreground">
          用自然语言描述你的 App，Agent 团队来生成它
        </p>
      </div>
      <Button onClick={onNew} className="mt-2">
        创建第一个项目
      </Button>
    </div>
  )
}

export function LoadingState() {
  return (
    <div className="flex h-full items-center justify-center text-muted-foreground">
      加载中...
    </div>
  )
}

export function ErrorState() {
  return (
    <div className="flex h-full items-center justify-center text-destructive">
      加载失败，请刷新重试
    </div>
  )
}
```

- [ ] **Step 2: 验证 typecheck**

```bash
cd apps/web
pnpm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/project-card/project-page-states.tsx
git commit -m "feat(web): migrate project-page-states to Tailwind"
```

---

## Task 8: 迁移 ProjectCard

**Files:**
- Modify: `apps/web/src/components/project-card/project-card.tsx`

- [ ] **Step 1: 替换 project-card.tsx**

```tsx
import { useNavigate } from 'react-router-dom'
import type { Project, ProjectStatus } from '@forge/core'
import { Card, CardContent } from '../ui/card'
import { Badge } from '../ui/badge'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'

const STATUS_LABEL: Record<ProjectStatus, string> = {
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

const IN_PROGRESS = new Set(['building', 'analyzing', 'planning', 'validating', 'fixing'])

interface ProjectCardProps {
  project: Project
  onDelete: (id: string) => void
}

function statusVariant(status: ProjectStatus): { variant: 'default' | 'secondary' | 'destructive' | 'outline'; className?: string } {
  if (status === 'done') return { variant: 'outline', className: 'border-green-500 text-green-400' }
  if (status === 'failed') return { variant: 'destructive' }
  if (status === 'waiting') return { variant: 'outline', className: 'border-yellow-500 text-yellow-400' }
  if (IN_PROGRESS.has(status)) return { variant: 'secondary' }
  return { variant: 'outline' }
}

export function ProjectCard({ project, onDelete }: ProjectCardProps) {
  const navigate = useNavigate()
  const { variant, className } = statusVariant(project.status)

  return (
    <Card className={cn(
      IN_PROGRESS.has(project.status) && 'border-primary/30'
    )}>
      <CardContent className="p-4">
        <div className="mb-2 flex items-start justify-between gap-2">
          <div className="flex-1 text-sm font-semibold">{project.name}</div>
          <Badge variant={variant} className={cn('shrink-0 text-[11px]', className)}>
            {STATUS_LABEL[project.status]}
          </Badge>
        </div>

        <div className="mb-3 text-[11px] text-muted-foreground">
          {new Date(project.createdAt).toLocaleDateString('zh-CN')}
        </div>

        <div className="flex gap-1.5">
          {project.status === 'done' && (
            <>
              {project.previewUrl && (
                <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs" onClick={() => window.open(project.previewUrl!, '_blank')}>
                  预览
                </Button>
              )}
              <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs" onClick={() => navigate(`/projects/${project.id}`)}>
                打开
              </Button>
            </>
          )}
          {IN_PROGRESS.has(project.status) && (
            <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs text-primary" onClick={() => navigate(`/projects/${project.id}`)}>
              查看进度
            </Button>
          )}
          {(project.status === 'idle' || project.status === 'waiting') && (
            <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs" onClick={() => navigate(`/projects/${project.id}`)}>
              打开
            </Button>
          )}
          {project.status === 'failed' && (
            <>
              <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs" onClick={() => navigate(`/projects/${project.id}`)}>
                重试
              </Button>
              <Button variant="ghost" size="sm" className="flex-1 h-7 text-xs text-destructive" onClick={() => onDelete(project.id)}>
                删除
              </Button>
            </>
          )}
        </div>
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 2: 验证 typecheck**

```bash
cd apps/web
pnpm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/project-card/project-card.tsx
git commit -m "feat(web): migrate ProjectCard to shadcn Card/Badge/Button"
```

---

## Task 9: 迁移 ConversationHistory

**Files:**
- Modify: `apps/web/src/components/left-panel/ConversationHistory.tsx`

- [ ] **Step 1: 替换 ConversationHistory.tsx**

```tsx
import { useState, useEffect, useRef } from 'react'
import {
  useWorkspaceStore,
  selectPhase,
  selectOrchestratorState,
  selectWaitingReason,
  selectEvents,
} from '../../store/workspace-store'
import { Button } from '../ui/button'
import { Input } from '../ui/input'
import { ScrollArea } from '../ui/scroll-area'
import { cn } from '../../lib/utils'

export function ConversationHistory() {
  const phase = useWorkspaceStore(selectPhase)
  const orchState = useWorkspaceStore(selectOrchestratorState)
  const waitingReason = useWorkspaceStore(selectWaitingReason)
  const events = useWorkspaceStore(selectEvents)
  const [iterationInput, setIterationInput] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [events.length])

  const handleIteration = () => {
    if (!iterationInput.trim()) return
    // TODO: call resume API
    setIterationInput('')
  }

  const stateLabel: Record<string, string> = {
    analyzing:  '分析需求中...',
    planning:   '规划架构中...',
    building:   '生成代码中...',
    validating: '验证功能中...',
    fixing:     '修复问题中...',
    done:       '✓ 生成完成',
    waiting:    '⚠ 需要你的介入',
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* State indicator */}
      <div className="flex items-center gap-2 border-b border-border/50 px-5 py-3">
        {phase === 'running' && (
          <span className="h-2 w-2 shrink-0 rounded-full bg-primary animate-pulse" />
        )}
        {phase === 'done' && (
          <span className="h-2 w-2 shrink-0 rounded-full bg-green-500" />
        )}
        {phase === 'waiting' && (
          <span className="h-2 w-2 shrink-0 rounded-full bg-yellow-500" />
        )}
        <span className="text-sm text-muted-foreground">
          {orchState ? stateLabel[orchState] ?? orchState : '启动中...'}
        </span>
      </div>

      {/* Event log */}
      <ScrollArea className="flex-1 px-5 py-3">
        <div className="flex flex-col gap-1.5">
          {events
            .filter((e) => ['state_change', 'agent_done', 'agent_error', 'waiting'].includes(e.type))
            .map((event, i) => (
              <EventLine key={i} event={event} />
            ))}

          {phase === 'waiting' && waitingReason && (
            <div className="mt-2 rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-3 py-2.5">
              <p className="mb-1 text-xs font-medium text-yellow-500">AI 卡住了，需要你的帮助</p>
              <p className="text-xs text-muted-foreground">{waitingReason}</p>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>

      {/* Iteration input */}
      {(phase === 'done' || phase === 'waiting') && (
        <div className="border-t border-border/50 px-5 py-3">
          <div className="flex gap-2">
            <Input
              value={iterationInput}
              onChange={(e) => setIterationInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleIteration()}
              placeholder={phase === 'waiting' ? '告诉 AI 怎么解决...' : '继续迭代，例如：把按钮改成蓝色'}
              className="flex-1 text-sm"
            />
            <Button
              onClick={handleIteration}
              disabled={!iterationInput.trim()}
              size="sm"
            >
              发送
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

function EventLine({ event }: { event: ReturnType<typeof selectEvents>[number] }) {
  if (event.type === 'state_change') {
    const dotClass = cn(
      'h-1.5 w-1.5 shrink-0 rounded-full',
      event.state === 'done' ? 'bg-green-500' :
      event.state === 'waiting' ? 'bg-yellow-500' :
      event.state === 'failed' ? 'bg-destructive' :
      'bg-primary'
    )
    return (
      <div className="flex items-center gap-2">
        <span className={dotClass} />
        <span className="text-xs text-muted-foreground">{event.state}</span>
      </div>
    )
  }

  if (event.type === 'agent_done') {
    return (
      <div className="flex gap-2">
        <span className="shrink-0 text-xs text-green-500">✓</span>
        <span className="text-xs text-muted-foreground">
          <strong className="text-foreground">{event.agent}</strong>: {event.summary}
        </span>
      </div>
    )
  }

  if (event.type === 'agent_error') {
    return (
      <div className="flex gap-2">
        <span className="shrink-0 text-xs text-destructive">✗</span>
        <span className="text-xs text-muted-foreground">
          <strong className="text-destructive">{event.agent}</strong>: {event.error}
        </span>
      </div>
    )
  }

  return null
}
```

- [ ] **Step 2: 验证 typecheck**

```bash
cd apps/web
pnpm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/left-panel/ConversationHistory.tsx
git commit -m "feat(web): migrate ConversationHistory to shadcn/Tailwind"
```

---

## Task 10: 迁移 RequirementInput

**Files:**
- Modify: `apps/web/src/components/left-panel/RequirementInput.tsx`

- [ ] **Step 1: 替换 RequirementInput.tsx**

```tsx
import { useState, useRef, useEffect } from 'react'
import { useWorkspaceStore, selectUserInput } from '../../store/workspace-store'
import { useCreateProject } from '@forge/core'
import { Button } from '../ui/button'
import { Textarea } from '../ui/textarea'

const PLACEHOLDER_EXAMPLES = [
  '我需要一个报销申请系统',
  '做一个任务管理 App',
  '我想要一个预约系统',
  '帮我做一个简单的电商后台',
]

export function RequirementInput() {
  const userInput = useWorkspaceStore(selectUserInput)
  const setUserInput = useWorkspaceStore((s) => s.setUserInput)
  const setPhase = useWorkspaceStore((s) => s.setPhase)
  const setDraftSpec = useWorkspaceStore((s) => s.setDraftSpec)

  const [placeholder, setPlaceholder] = useState(PLACEHOLDER_EXAMPLES[0]!)
  const [isLoading, setIsLoading] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    let i = 0
    const id = setInterval(() => {
      i = (i + 1) % PLACEHOLDER_EXAMPLES.length
      setPlaceholder(PLACEHOLDER_EXAMPLES[i]!)
    }, 3000)
    return () => clearInterval(id)
  }, [])

  useEffect(() => {
    const el = textareaRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = Math.min(el.scrollHeight, 200) + 'px'
  }, [userInput])

  const handleSubmit = async () => {
    if (!userInput.trim() || isLoading) return
    setIsLoading(true)

    try {
      await new Promise((r) => setTimeout(r, 800))

      const mockDraft = {
        title: userInput.length > 20 ? userInput.slice(0, 20) + '...' : userInput,
        description: userInput,
        business_domain: 'custom-app',
        constraints: { auth: true, database: true, file_upload: false, email: false, payments: false },
        clarifying_questions: [],
        features: [
          {
            id: 'F001',
            name: '用户认证',
            confidence: 'high' as const,
            acceptance_criteria: ['支持邮箱+密码登录', '错误提示清晰', '登录成功跳转首页'],
            out_of_scope: [],
            selected: true,
          },
          {
            id: 'F002',
            name: '核心功能',
            confidence: 'high' as const,
            acceptance_criteria: ['用户可以创建记录', '支持编辑和删除', '列表分页展示'],
            out_of_scope: [],
            selected: true,
          },
          {
            id: 'F003',
            name: '数据导出',
            confidence: 'medium' as const,
            acceptance_criteria: ['支持导出为 CSV', '导出范围可筛选'],
            out_of_scope: [],
            selected: true,
          },
          {
            id: 'F004',
            name: '高级分析报表',
            confidence: 'low' as const,
            acceptance_criteria: ['图表展示趋势数据'],
            out_of_scope: [],
            selected: false,
          },
        ],
      }

      setDraftSpec(mockDraft)
      setPhase('pm-review')
    } catch {
      // TODO: error state
    } finally {
      setIsLoading(false)
    }
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault()
      handleSubmit()
    }
  }

  return (
    <div className="flex flex-1 flex-col gap-6 px-5 py-6">
      <div>
        <h2 className="mb-2 text-xl font-semibold">描述你想做的 App</h2>
        <p className="text-sm text-muted-foreground">AI 会帮你补全细节，再由 Agent 团队协作生成</p>
      </div>

      <Textarea
        ref={textareaRef}
        value={userInput}
        onChange={(e) => setUserInput(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        rows={4}
        className="min-h-[120px] resize-none text-sm leading-relaxed"
      />

      <Button
        onClick={handleSubmit}
        disabled={!userInput.trim() || isLoading}
        className="w-full"
      >
        {isLoading ? (
          <span className="flex items-center gap-2">
            <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-primary-foreground/30 border-t-primary-foreground" />
            分析需求中...
          </span>
        ) : (
          <span>生成应用 <kbd className="ml-1 text-xs opacity-60">⌘↵</kbd></span>
        )}
      </Button>

      <div>
        <p className="mb-2 text-xs text-muted-foreground/60">试试这些：</p>
        <div className="flex flex-col gap-1">
          {PLACEHOLDER_EXAMPLES.map((ex) => (
            <button
              key={ex}
              onClick={() => setUserInput(ex)}
              className="py-1 text-left text-xs text-muted-foreground transition-colors hover:text-foreground"
            >
              → {ex}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 验证 typecheck**

```bash
cd apps/web
pnpm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/left-panel/RequirementInput.tsx
git commit -m "feat(web): migrate RequirementInput to shadcn/Tailwind"
```

---

## Task 11: 迁移 PMReview

**Files:**
- Modify: `apps/web/src/components/left-panel/PMReview.tsx`

- [ ] **Step 1: 替换 PMReview.tsx**

```tsx
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useCreateProject } from '@forge/core'
import {
  useWorkspaceStore,
  selectDraftSpec,
  type DraftFeature,
} from '../../store/workspace-store'
import { Button } from '../ui/button'
import { Textarea } from '../ui/textarea'
import { Badge } from '../ui/badge'
import { Checkbox } from '../ui/checkbox'
import { ScrollArea } from '../ui/scroll-area'
import { cn } from '../../lib/utils'

const CONFIDENCE_LABEL: Record<DraftFeature['confidence'], string> = {
  high:   '必需',
  medium: '常见',
  low:    '可选',
}

const CONFIDENCE_CLASS: Record<DraftFeature['confidence'], string> = {
  high:   'text-green-500',
  medium: 'text-primary',
  low:    'text-muted-foreground',
}

export function PMReview() {
  const draft = useWorkspaceStore(selectDraftSpec)
  const setDraftSpec = useWorkspaceStore((s) => s.setDraftSpec)
  const setPhase = useWorkspaceStore((s) => s.setPhase)
  const startGeneration = useWorkspaceStore((s) => s.startGeneration)
  const userInput = useWorkspaceStore((s) => s.userInput)

  const { mutate: createProject, isPending: isCreating } = useCreateProject()
  const navigate = useNavigate()

  const [supplement, setSupplement] = useState('')
  const [isStarting, setIsStarting] = useState(false)

  if (!draft) return null

  const selectedCount = draft.features.filter((f) => f.selected).length

  const toggleFeature = (id: string) => {
    setDraftSpec({
      ...draft,
      features: draft.features.map((f) =>
        f.id === id ? { ...f, selected: !f.selected } : f,
      ),
    })
  }

  const handleConfirm = () => {
    if (selectedCount === 0 || isStarting || isCreating) return
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

  const byConfidence = (tier: DraftFeature['confidence']) =>
    draft.features.filter((f) => f.confidence === tier)

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      {/* Subheader */}
      <div className="border-b border-border/50 px-5 pb-3 pt-4">
        <button
          onClick={() => setPhase('input')}
          className="mb-1 text-sm text-muted-foreground hover:text-foreground"
        >
          ← 返回
        </button>
        <h3 className="text-[15px] font-semibold">我理解你想做「{draft.title}」</h3>
        <p className="mt-0.5 text-xs text-muted-foreground">以下功能由 AI 推导，确认后开始生成</p>
      </div>

      {/* Feature list */}
      <ScrollArea className="flex-1 px-5 py-3">
        <div className="flex flex-col gap-4">
          {/* Constraints badges */}
          <div className="flex flex-wrap gap-1.5">
            {draft.constraints.auth && <ConstraintBadge label="需要登录" />}
            {draft.constraints.database && <ConstraintBadge label="需要数据库" />}
            {draft.constraints.file_upload && <ConstraintBadge label="文件上传" />}
            {draft.constraints.email && <ConstraintBadge label="邮件通知" />}
            {draft.constraints.payments && <ConstraintBadge label="支付功能" />}
          </div>

          {(['high', 'medium', 'low'] as const).map((tier) => {
            const features = byConfidence(tier)
            if (features.length === 0) return null
            return (
              <div key={tier}>
                <div className={cn('mb-1.5 text-[11px] font-semibold uppercase tracking-wide', CONFIDENCE_CLASS[tier])}>
                  {CONFIDENCE_LABEL[tier]}
                </div>
                <div className="flex flex-col gap-1">
                  {features.map((f) => (
                    <FeatureRow key={f.id} feature={f} onToggle={() => toggleFeature(f.id)} />
                  ))}
                </div>
              </div>
            )
          })}

          {draft.clarifying_questions.length > 0 && (
            <div className="rounded-lg border border-yellow-500/20 bg-yellow-500/10 px-3 py-2.5">
              <p className="mb-1.5 text-xs text-yellow-500">⚠ AI 有几个疑问</p>
              {draft.clarifying_questions.map((q, i) => (
                <p key={i} className="mb-0.5 text-xs text-muted-foreground">• {q}</p>
              ))}
            </div>
          )}

          <div>
            <p className="mb-1.5 text-xs text-muted-foreground">还有什么要补充的？</p>
            <Textarea
              value={supplement}
              onChange={(e) => setSupplement(e.target.value)}
              placeholder="例如：需要支持多语言、要有黑暗模式..."
              rows={2}
              className="resize-none text-sm"
            />
          </div>
        </div>
      </ScrollArea>

      {/* Confirm button */}
      <div className="border-t border-border/50 px-5 py-3">
        <Button
          onClick={handleConfirm}
          disabled={selectedCount === 0 || isStarting || isCreating}
          className="w-full"
        >
          {isStarting || isCreating
            ? '启动中...'
            : `确认并生成 (${selectedCount} 个功能)`
          }
        </Button>
      </div>
    </div>
  )
}

function FeatureRow({ feature, onToggle }: { feature: DraftFeature; onToggle: () => void }) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className={cn(
      'overflow-hidden rounded border transition-all',
      feature.selected ? 'border-border bg-card' : 'border-border/30 opacity-50'
    )}>
      <div
        className="flex cursor-pointer items-center gap-2.5 px-3 py-2"
        onClick={() => setExpanded(!expanded)}
      >
        <Checkbox
          checked={feature.selected}
          onCheckedChange={onToggle}
          onClick={(e) => e.stopPropagation()}
        />
        <span className="flex-1 text-sm font-medium">{feature.name}</span>
        <span className="text-xs text-muted-foreground">{expanded ? '▲' : '▼'}</span>
      </div>

      {expanded && (
        <div className="flex flex-col gap-0.5 pb-2.5 pl-9 pr-3">
          {feature.acceptance_criteria.map((c, i) => (
            <p key={i} className="text-xs text-muted-foreground">• {c}</p>
          ))}
        </div>
      )}
    </div>
  )
}

function ConstraintBadge({ label }: { label: string }) {
  return (
    <Badge variant="secondary" className="text-[11px]">{label}</Badge>
  )
}
```

- [ ] **Step 2: 验证 typecheck**

```bash
cd apps/web
pnpm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/left-panel/PMReview.tsx
git commit -m "feat(web): migrate PMReview to shadcn Checkbox/Badge/Textarea"
```

---

## Task 12: 迁移 ConversationPanel

**Files:**
- Modify: `apps/web/src/components/left-panel/ConversationPanel.tsx`

- [ ] **Step 1: 替换 ConversationPanel.tsx**

```tsx
import { useWorkspaceStore, selectPhase } from '../../store/workspace-store'
import { RequirementInput } from './RequirementInput'
import { PMReview } from './PMReview'
import { ConversationHistory } from './ConversationHistory'
import { Separator } from '../ui/separator'

export function ConversationPanel() {
  const phase = useWorkspaceStore(selectPhase)

  return (
    <div className="flex h-full flex-col border-r border-border bg-card">
      {/* Header */}
      <div className="flex items-center gap-2 px-5 py-4">
        <span className="text-lg font-bold tracking-tight">🔨 Forge</span>
      </div>
      <Separator />

      {/* Content */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {phase === 'input' && <RequirementInput />}
        {phase === 'pm-review' && <PMReview />}
        {(phase === 'running' || phase === 'done' || phase === 'waiting' || phase === 'error') && (
          <ConversationHistory />
        )}
      </div>
    </div>
  )
}
```

- [ ] **Step 2: 验证 typecheck**

```bash
cd apps/web
pnpm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/left-panel/ConversationPanel.tsx
git commit -m "feat(web): migrate ConversationPanel to Tailwind"
```

---

## Task 13: 迁移 AgentFlowPanel

**Files:**
- Modify: `apps/web/src/components/center-panel/AgentFlowPanel.tsx`

- [ ] **Step 1: 替换 AgentFlowPanel.tsx**

```tsx
import { useState } from 'react'
import {
  useWorkspaceStore,
  selectAgentCards,
  selectOrchestratorState,
  selectPhase,
  selectEvents,
  type AgentCardState,
} from '../../store/workspace-store'
import { Badge } from '../ui/badge'
import { Card, CardContent } from '../ui/card'
import { ScrollArea } from '../ui/scroll-area'
import { Separator } from '../ui/separator'
import { cn } from '../../lib/utils'

const AGENT_META: Record<string, { label: string; icon: string; description: string }> = {
  pm:         { label: 'PM Agent',        icon: '📋', description: '需求分析与放大' },
  architect:  { label: 'Architect',       icon: '🏗',  description: '技术架构规划' },
  schema:     { label: 'Schema Agent',    icon: '🗄',  description: '数据库 Schema' },
  logic:      { label: 'Logic Agent',     icon: '⚙️',  description: '业务逻辑 + 单测' },
  api:        { label: 'API Agent',       icon: '🔌',  description: 'HTTP 接口层' },
  ui:         { label: 'UI Agent',        icon: '🎨',  description: 'UI 组件 + Stories' },
  page:       { label: 'Page Agent',      icon: '📄',  description: '页面组装' },
  test:       { label: 'Test Agent',      icon: '✅',  description: '验证 + E2E 检查' },
}

export function AgentFlowPanel() {
  const phase = useWorkspaceStore(selectPhase)
  const orchState = useWorkspaceStore(selectOrchestratorState)
  const agentCards = useWorkspaceStore(selectAgentCards)
  const events = useWorkspaceStore(selectEvents)
  const [logOpen, setLogOpen] = useState(false)

  const thinkingEvents = events
    .filter((e) => e.type === 'agent_thinking' || e.type === 'agent_tool_use')
    .slice(-50)

  return (
    <div className="flex h-full flex-col bg-background">
      {/* Orchestrator state bar */}
      <OrchestratorBar state={orchState} phase={phase} />

      {/* Agent cards */}
      <div className="flex-1 overflow-y-auto p-5">
        {phase === 'input' || phase === 'pm-review' ? (
          <IdleState />
        ) : (
          <div className="grid grid-cols-[repeat(auto-fill,minmax(260px,1fr))] gap-3">
            {Object.values(agentCards).map((card) => (
              <AgentCard key={card.role} card={card} />
            ))}
          </div>
        )}
      </div>

      {/* Collapsible log drawer */}
      {thinkingEvents.length > 0 && (
        <div className="border-t border-border">
          <button
            onClick={() => setLogOpen(!logOpen)}
            className="flex w-full items-center gap-1.5 bg-card px-5 py-2 text-left text-xs text-muted-foreground hover:text-foreground"
          >
            <span>{logOpen ? '▼' : '▲'}</span>
            AI 思考日志 ({thinkingEvents.length} 条)
          </button>
          {logOpen && (
            <ScrollArea className="max-h-[200px] bg-card px-5 pb-2">
              {thinkingEvents.map((e, i) => (
                <p key={i} className="mb-0.5 font-mono text-[11px] text-muted-foreground/60">
                  [{e.agent}] {e.type === 'agent_thinking' ? e.content : `tool: ${e.tool}`}
                </p>
              ))}
            </ScrollArea>
          )}
        </div>
      )}
    </div>
  )
}

function OrchestratorBar({ state, phase }: { state: string | null; phase: string }) {
  const stateConfig: Record<string, { variant: 'default' | 'secondary' | 'outline'; label: string; className?: string }> = {
    analyzing:  { variant: 'secondary', label: '分析需求' },
    planning:   { variant: 'secondary', label: '规划架构' },
    building:   { variant: 'secondary', label: '生成代码' },
    validating: { variant: 'outline',   label: '验证功能', className: 'border-yellow-500 text-yellow-500' },
    fixing:     { variant: 'outline',   label: '修复问题', className: 'border-yellow-500 text-yellow-500' },
    waiting:    { variant: 'outline',   label: '等待介入', className: 'border-yellow-500 text-yellow-500' },
    done:       { variant: 'outline',   label: '生成完成', className: 'border-green-500 text-green-500' },
  }

  const config = state ? stateConfig[state] : null

  return (
    <div className="flex items-center gap-2.5 border-b border-border px-5 py-3">
      <span className="text-sm font-medium text-muted-foreground">Agent 协作流程</span>
      {config && (
        <Badge variant={config.variant} className={cn('text-[11px]', config.className)}>
          {config.label}
        </Badge>
      )}
    </div>
  )
}

function AgentCard({ card }: { card: AgentCardState }) {
  const meta = AGENT_META[card.role] ?? { label: card.role, icon: '🤖', description: '' }

  const elapsed = card.startedAt && card.finishedAt
    ? ((card.finishedAt - card.startedAt) / 1000).toFixed(1) + 's'
    : card.startedAt
    ? Math.floor((Date.now() - card.startedAt) / 1000) + 's'
    : null

  return (
    <Card className={cn(
      'transition-colors',
      card.status === 'running' && 'border-primary/40',
      card.status === 'error' && 'border-destructive/40',
    )}>
      <CardContent className="p-3.5">
        <div className="mb-2.5 flex items-center gap-2.5">
          <span className="text-xl">{meta.icon}</span>
          <div className="min-w-0 flex-1">
            <div className="text-sm font-semibold">{meta.label}</div>
            <div className="text-[11px] text-muted-foreground">{meta.description}</div>
          </div>
          <div className="flex items-center gap-1">
            {card.status === 'running' && (
              <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />
            )}
            {card.status === 'done' && <span className="text-xs text-green-500">✓</span>}
            {card.status === 'error' && <span className="text-xs text-destructive">✗</span>}
            {elapsed && <span className="text-[10px] text-muted-foreground">{elapsed}</span>}
          </div>
        </div>

        <ProgressDots status={card.status} />

        {card.currentAction && (
          <p className={cn(
            'mt-2 truncate text-[11px]',
            card.status === 'running' ? 'text-primary' :
            card.status === 'done' ? 'text-green-500' :
            card.status === 'error' ? 'text-destructive' :
            'text-muted-foreground'
          )}>
            {card.currentAction}
          </p>
        )}

        {card.filesWritten.length > 0 && (
          <div className="mt-2 flex flex-col gap-0.5">
            {card.filesWritten.slice(-3).map((f) => (
              <p key={f} className="truncate font-mono text-[10px] text-muted-foreground">
                + {f.split('/').pop()}
              </p>
            ))}
            {card.filesWritten.length > 3 && (
              <p className="text-[10px] text-muted-foreground">+{card.filesWritten.length - 3} 更多文件</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}

function ProgressDots({ status }: { status: AgentCardState['status'] }) {
  const filled = { idle: 0, running: 2, done: 5, error: 1 }[status]
  return (
    <div className="flex gap-1">
      {Array.from({ length: 5 }).map((_, i) => (
        <span
          key={i}
          className={cn(
            'h-1.5 w-1.5 rounded-full transition-colors duration-300',
            i < filled ? 'bg-primary' : 'bg-border'
          )}
        />
      ))}
    </div>
  )
}

function IdleState() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 text-muted-foreground">
      <div className="text-5xl opacity-30">🤖</div>
      <p className="text-sm">Agent 团队待命中</p>
      <p className="text-xs">输入需求后，这里会展示每个 Agent 的实时进度</p>
    </div>
  )
}
```

- [ ] **Step 2: 验证 typecheck**

```bash
cd apps/web
pnpm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/center-panel/AgentFlowPanel.tsx
git commit -m "feat(web): migrate AgentFlowPanel to shadcn Card/Badge + Tailwind"
```

---

## Task 14: 迁移 PreviewPanel

**Files:**
- Modify: `apps/web/src/components/right-panel/PreviewPanel.tsx`

- [ ] **Step 1: 替换 PreviewPanel.tsx**

```tsx
import { useState } from 'react'
import {
  useWorkspaceStore,
  selectPreviewUrl,
  selectPhase,
  selectOrchestratorState,
} from '../../store/workspace-store'
import { Button } from '../ui/button'
import { cn } from '../../lib/utils'

export function PreviewPanel() {
  const previewUrl = useWorkspaceStore(selectPreviewUrl)
  const phase = useWorkspaceStore(selectPhase)
  const orchState = useWorkspaceStore(selectOrchestratorState)
  const [iframeKey, setIframeKey] = useState(0)

  return (
    <div className="flex h-full flex-col border-l border-border bg-card">
      {/* Toolbar */}
      <div className="flex items-center gap-2 border-b border-border px-3.5 py-2.5">
        <div className={cn(
          'flex-1 overflow-hidden text-ellipsis whitespace-nowrap rounded border border-border bg-background px-2.5 py-1.5 font-mono text-xs',
          previewUrl ? 'text-foreground' : 'text-muted-foreground'
        )}>
          {previewUrl ?? 'https://waiting...'}
        </div>

        {previewUrl && (
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7 shrink-0"
            title="在新标签页打开"
            onClick={() => window.open(previewUrl, '_blank')}
          >
            ↗
          </Button>
        )}
        {previewUrl && (
          <Button
            variant="outline"
            size="icon"
            className="h-7 w-7 shrink-0"
            title="刷新预览"
            onClick={() => setIframeKey((k) => k + 1)}
          >
            ↻
          </Button>
        )}
      </div>

      {/* Preview content */}
      <div className="relative flex-1 overflow-hidden">
        {previewUrl ? (
          <iframe
            key={iframeKey}
            src={previewUrl}
            className="h-full w-full border-none bg-white"
            title="App Preview"
            sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          />
        ) : (
          <BuildingPlaceholder phase={phase} orchState={orchState} />
        )}
      </div>
    </div>
  )
}

function BuildingPlaceholder({ phase, orchState }: { phase: string; orchState: string | null }) {
  const steps = [
    { state: 'analyzing',  label: '分析需求' },
    { state: 'planning',   label: '规划架构' },
    { state: 'building',   label: '生成代码' },
    { state: 'validating', label: '验证功能' },
  ]

  const stateOrder = ['analyzing', 'planning', 'building', 'validating', 'done']
  const currentIdx = stateOrder.indexOf(orchState ?? '')

  return (
    <div className="flex h-full flex-col items-center justify-center gap-8 p-6">
      <div className="text-5xl opacity-30">
        {phase === 'input' ? '🖥' : phase === 'pm-review' ? '📋' : '⚙️'}
      </div>

      <div className="text-center">
        <p className="mb-1.5 text-sm text-muted-foreground">
          {phase === 'input' && '输入需求后预览将出现在这里'}
          {phase === 'pm-review' && '确认需求后开始生成'}
          {(phase === 'running' || phase === 'fixing') && '应用正在生成中...'}
          {phase === 'waiting' && '等待你的指示'}
          {phase === 'error' && '生成遇到问题'}
        </p>
        {orchState && phase === 'running' && (
          <p className="text-xs text-muted-foreground/60">{orchState}</p>
        )}
      </div>

      {(phase === 'running' || phase === 'done') && (
        <div className="flex w-full max-w-[200px] flex-col gap-2">
          {steps.map((step, i) => {
            const isDone = i < currentIdx
            const isActive = stateOrder[currentIdx] === step.state
            return (
              <div key={step.state} className="flex items-center gap-2.5">
                <div className={cn(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2',
                  isDone ? 'border-green-500 bg-green-500' :
                  isActive ? 'border-primary' :
                  'border-border'
                )}>
                  {isDone && <span className="text-[10px] text-black">✓</span>}
                  {isActive && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-primary" />}
                </div>
                <span className={cn(
                  'text-xs',
                  isDone ? 'text-green-500' :
                  isActive ? 'text-foreground' :
                  'text-muted-foreground'
                )}>
                  {step.label}
                </span>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: 验证 typecheck**

```bash
cd apps/web
pnpm run typecheck
```

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/components/right-panel/PreviewPanel.tsx
git commit -m "feat(web): migrate PreviewPanel to shadcn/Tailwind"
```

---

## Task 15: 全量验证

- [ ] **Step 1: 全量 typecheck**

```bash
cd apps/web
pnpm run typecheck
```

Expected: 0 errors

- [ ] **Step 2: Build**

```bash
cd apps/web
pnpm run build
```

Expected: 构建成功，无警告

- [ ] **Step 3: 检查无残留内联 style**

```bash
cd apps/web/src
grep -r "style={{" pages/ components/ --include="*.tsx"
```

Expected: 无输出（0 匹配）

- [ ] **Step 4: 运行 e2e layer1**

```bash
cd /path/to/forge
pnpm e2e:layer1
```

Expected: 全部通过

- [ ] **Step 5: 最终 commit**

```bash
git add .
git commit -m "chore(web): complete tailwind + shadcn migration, all checks pass"
```
