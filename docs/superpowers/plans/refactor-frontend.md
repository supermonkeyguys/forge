# 前端重构计划：数字员工平台 UI

## 目标
在现有前端基础上新增 Workflow 管理界面，将 Workspace 执行监控泛化为
支持任意 WorkflowDefinition 的动态步骤展示，保持现有页面向前兼容。

## 原则
- `/projects` 页面**保留不变**（继续支持代码生成）
- `/workspace/:id` **改为动态**（AgentFlowPanel 不再硬编码 8 个 card）
- 新增 `/workflows` 页面（流程管理）
- `packages/core` 新增 workflow/capability hooks，不删现有 hooks

---

## 涉及文件

**新建：**
- `packages/core/workflow/use-workflows.ts`
- `packages/core/workflow/use-capabilities.ts`
- `packages/core/workflow/index.ts`
- `apps/web/src/pages/workflows/index.tsx` — 流程列表页
- `apps/web/src/pages/workflows/components/WorkflowCard.tsx`
- `apps/web/src/pages/workflows/components/CreateWorkflowModal.tsx`
- `apps/web/src/pages/capabilities/index.tsx` — 能力管理页
- `apps/web/src/pages/capabilities/components/CapabilityCard.tsx`

**修改：**
- `packages/core/types/index.ts` — 新增 Workflow、WorkflowStep、Capability 类型
- `packages/core/index.ts` — 导出新 hooks
- `packages/core/task/workspace-store.ts` — steps 支持动态 WorkflowStep 定义
- `apps/web/src/pages/workspace/components/AgentFlowPanel.tsx` — 动态渲染 step cards
- `apps/web/src/routes.tsx` — 新增 /workflows、/capabilities 路由
- `apps/web/src/components/layout/AppShell.tsx` 或导航栏 — 新增导航项

**保留不变：**
- `/pages/projects/` (代码生成入口)
- `/pages/agents/` (Agent 员工管理)
- `/pages/knowledge/` (知识库)
- `/pages/settings/`
- `/pages/login/`
- `ConversationHistory.tsx`, `ConversationPanel.tsx`（完全复用）
- `PreviewPanel.tsx`

---

## 任务

### Task 1：新增共享类型

**文件：** `packages/core/types/index.ts`（在现有类型末尾追加）

```typescript
// ── Workflow types ─────────────────────────────────────────────────

export type CapabilityType = 'browser' | 'http' | 'llm' | 'notify' | 'code' | 'file'

export interface WorkflowStep {
  id:           string
  name:         string
  capability:   CapabilityType
  instructions: string
  depends_on:   string[]
  config?:      Record<string, unknown>
}

export interface WorkflowDefinition {
  steps: WorkflowStep[]
}

export interface WorkflowTrigger {
  type:    'manual' | 'webhook' | 'schedule'
  config?: Record<string, unknown>
}

export type WorkflowStatus = 'draft' | 'active'

export interface Workflow {
  id:          string
  userId:      string
  name:        string
  description: string
  definition:  WorkflowDefinition
  trigger:     WorkflowTrigger
  status:      WorkflowStatus
  createdAt:   string
  updatedAt:   string
}

// ── Capability types ───────────────────────────────────────────────

export interface Capability {
  id:           string
  userId:       string
  name:         string
  type:         CapabilityType
  description:  string
  configSchema: Record<string, unknown>
  config:       Record<string, unknown>
  createdAt:    string
  updatedAt:    string
}
```

**验证：** `./node_modules/.bin/tsc --noEmit` 通过（在 forge 根目录或 packages/core）

---

### Task 2：useWorkflows hook

**文件：** `packages/core/workflow/use-workflows.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client.ts'
import { useAuthStore, selectToken } from '../auth/auth-store.ts'
import type { Workflow, WorkflowDefinition, WorkflowTrigger } from '../types/index.ts'

export function useWorkflows() {
  const token = useAuthStore(selectToken)
  return useQuery<Workflow[]>({
    queryKey: ['workflows'],
    queryFn:  async () => {
      const res = await api.get<Workflow[]>('/api/v1/workflows', token ?? undefined)
      return res.data ?? []
    },
    enabled: !!token,
  })
}

export function useCreateWorkflow() {
  const token = useAuthStore(selectToken)
  const qc    = useQueryClient()
  return useMutation({
    mutationFn: async (input: {
      name: string
      description?: string
      definition: WorkflowDefinition
      trigger?: WorkflowTrigger
    }) => {
      const res = await api.post<Workflow>('/api/v1/workflows', {
        ...input,
        trigger: input.trigger ?? { type: 'manual' },
      }, token ?? undefined)
      return res.data!
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows'] }),
  })
}

export function useDeleteWorkflow() {
  const token = useAuthStore(selectToken)
  const qc    = useQueryClient()
  return useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api/v1/workflows/${id}`, token ?? undefined)
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['workflows'] }),
  })
}
```

注意：`api.delete` 如果不存在，在 `packages/core/api/client.ts` 补充：
```typescript
delete: async (path: string, token?: string) =>
  apiFetch<void>(path, { method: 'DELETE' }, token),
```

**验证：** `./node_modules/.bin/tsc --noEmit` 通过

---

### Task 3：useCapabilities hook

**文件：** `packages/core/workflow/use-capabilities.ts`

```typescript
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '../api/client.ts'
import { useAuthStore, selectToken } from '../auth/auth-store.ts'
import type { Capability } from '../types/index.ts'

export function useCapabilities() {
  const token = useAuthStore(selectToken)
  return useQuery<Capability[]>({
    queryKey: ['capabilities'],
    queryFn:  async () => {
      const res = await api.get<Capability[]>('/api/v1/capabilities', token ?? undefined)
      return res.data ?? []
    },
    enabled: !!token,
  })
}

export function useCreateCapability() {
  const token = useAuthStore(selectToken)
  const qc    = useQueryClient()
  return useMutation({
    mutationFn: async (input: Omit<Capability, 'id' | 'userId' | 'createdAt' | 'updatedAt'>) => {
      const res = await api.post<Capability>('/api/v1/capabilities', input, token ?? undefined)
      return res.data!
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['capabilities'] }),
  })
}
```

**验证：** `./node_modules/.bin/tsc --noEmit` 通过

---

### Task 4：导出新 hooks

**文件：** `packages/core/workflow/index.ts`

```typescript
export { useWorkflows, useCreateWorkflow, useDeleteWorkflow } from './use-workflows.ts'
export { useCapabilities, useCreateCapability } from './use-capabilities.ts'
```

**文件：** `packages/core/index.ts`（末尾追加）

```typescript
export * from './workflow/index.ts'
```

**验证：** `./node_modules/.bin/tsc --noEmit` 通过

---

### Task 5：AgentFlowPanel 动态化

**文件：** `apps/web/src/pages/workspace/components/AgentFlowPanel.tsx`

**核心改动：** 将硬编码的 8 个 agent card 改为从 workflowSteps 动态渲染。

现有逻辑中 `initialCards()` 返回固定 8 个 card，改为：

```tsx
// 在 workspace-store.ts 中新增 workflowSteps 字段（WorkflowStep[] | null）
// AgentFlowPanel 读取：

const workflowSteps = useWorkspaceStore(s => s.workflowSteps)
const agentCards    = useWorkspaceStore(selectAgentCards)

// 渲染逻辑：
const steps = workflowSteps ?? DEFAULT_STEPS  // fallback 到旧的 8 个

function renderCard(stepId: string, stepName: string, card: AgentCardState) {
  // 和现有 AgentCard 渲染完全一样，只是 label 改为 stepName
}

// DEFAULT_STEPS 是现有 8 个步骤的静态定义（向前兼容代码生成流程）
const DEFAULT_STEPS = [
  { id: 'pm',        name: 'PM Agent',       subtitle: '需求分析与放大' },
  { id: 'architect', name: 'Architect',      subtitle: '技术架构规划' },
  { id: 'schema',    name: 'Schema Agent',   subtitle: '数据库 Schema' },
  { id: 'logic',     name: 'Logic Agent',    subtitle: '业务逻辑 + 单测' },
  { id: 'api',       name: 'API Agent',      subtitle: 'HTTP 接口层' },
  { id: 'ui',        name: 'UI Agent',       subtitle: 'UI 组件 + Stories' },
  { id: 'page',      name: 'Page Agent',     subtitle: '页面组装' },
  { id: 'test',      name: 'Test Agent',     subtitle: '验证 + E2E 检查' },
]
```

**文件：** `packages/core/task/workspace-store.ts`（新增字段）

```typescript
// 在 WorkspaceState 接口中新增：
workflowSteps: WorkflowStep[] | null

// 在 initialState 中：
workflowSteps: null,

// 新增 action：
setWorkflowSteps: (steps: WorkflowStep[] | null) => void

// 实现：
setWorkflowSteps: (steps) => set({ workflowSteps: steps }),

// startGeneration 中重置：
workflowSteps: null,
```

**验证：** 进入现有 `/workspace/:id`，8 个 card 正常显示（fallback 到 DEFAULT_STEPS）

---

### Task 6：Workflows 列表页

**文件：** `apps/web/src/pages/workflows/index.tsx`

```tsx
import { useWorkflows, useDeleteWorkflow } from '@forge/core'
import { WorkflowCard } from './components/WorkflowCard'
import { CreateWorkflowModal } from './components/CreateWorkflowModal'
import { Button } from '../../components/ui/button'
import { useState } from 'react'

export function WorkflowsPage() {
  const { data: workflows, isLoading } = useWorkflows()
  const [showCreate, setShowCreate] = useState(false)

  return (
    <div className="flex flex-col gap-6 p-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">工作流</h1>
          <p className="text-sm text-muted-foreground mt-1">
            创建自动化流程，让 AI 替你完成重复性工作
          </p>
        </div>
        <Button onClick={() => setShowCreate(true)}>+ 新建工作流</Button>
      </div>

      {isLoading && <p className="text-muted-foreground">加载中...</p>}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {workflows?.map(wf => (
          <WorkflowCard key={wf.id} workflow={wf} />
        ))}
        {workflows?.length === 0 && (
          <div className="col-span-3 flex flex-col items-center gap-3 py-16 text-center">
            <p className="text-muted-foreground">还没有工作流</p>
            <Button variant="outline" onClick={() => setShowCreate(true)}>
              描述你的需求，AI 帮你生成流程
            </Button>
          </div>
        )}
      </div>

      {showCreate && <CreateWorkflowModal onClose={() => setShowCreate(false)} />}
    </div>
  )
}
```

---

### Task 7：WorkflowCard 组件

**文件：** `apps/web/src/pages/workflows/components/WorkflowCard.tsx`

```tsx
import type { Workflow } from '@forge/core'
import { useDeleteWorkflow } from '@forge/core'
import { Button } from '../../../components/ui/button'
import { useNavigate } from 'react-router-dom'

const CAPABILITY_ICONS: Record<string, string> = {
  browser: '🌐',
  http:    '🔌',
  llm:     '🧠',
  notify:  '🔔',
  code:    '💻',
  file:    '📄',
}

export function WorkflowCard({ workflow }: { workflow: Workflow }) {
  const { mutate: del } = useDeleteWorkflow()
  const navigate = useNavigate()
  const stepCount = workflow.definition.steps.length
  const capabilities = [...new Set(workflow.definition.steps.map(s => s.capability))]

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border/40 bg-card/60 p-5 hover:border-border transition-colors">
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-medium text-sm">{workflow.name}</h3>
          {workflow.description && (
            <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">
              {workflow.description}
            </p>
          )}
        </div>
        <span className={`text-[10px] px-2 py-0.5 rounded-full border ${
          workflow.status === 'active'
            ? 'bg-green-500/10 text-green-400 border-green-500/20'
            : 'bg-border/40 text-muted-foreground border-border/30'
        }`}>
          {workflow.status === 'active' ? '启用' : '草稿'}
        </span>
      </div>

      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span>{stepCount} 个步骤</span>
        <span>·</span>
        <span>{capabilities.map(c => CAPABILITY_ICONS[c] ?? '⚡').join(' ')}</span>
      </div>

      <div className="flex gap-2 mt-1">
        <Button
          size="sm" variant="outline" className="flex-1 h-7 text-xs"
          onClick={() => navigate(`/workflows/${workflow.id}`)}
        >
          查看
        </Button>
        <Button
          size="sm" className="flex-1 h-7 text-xs"
          onClick={() => navigate(`/workflows/${workflow.id}/run`)}
        >
          ▶ 运行
        </Button>
        <Button
          size="sm" variant="ghost" className="h-7 w-7 p-0 text-destructive hover:text-destructive"
          onClick={() => del(workflow.id)}
        >
          ✕
        </Button>
      </div>
    </div>
  )
}
```

---

### Task 8：CreateWorkflowModal

**文件：** `apps/web/src/pages/workflows/components/CreateWorkflowModal.tsx`

对话式创建流程（PM Agent 模式）：

```tsx
import { useState } from 'react'
import { useCreateWorkflow } from '@forge/core'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'

interface Props { onClose: () => void }

export function CreateWorkflowModal({ onClose }: Props) {
  const [step, setStep] = useState<'describe' | 'generating' | 'confirm'>('describe')
  const [input, setInput] = useState('')
  const [generatedDef, setGeneratedDef] = useState<any>(null)
  const { mutate: create, isPending } = useCreateWorkflow()

  const handleGenerate = async () => {
    setStep('generating')
    // 调用 agent service 的 generateWorkflowDefinition
    // 目前先用占位：
    const def = {
      steps: [
        { id: 's1', name: '分析输入', capability: 'llm',
          instructions: input, depends_on: [] }
      ]
    }
    setGeneratedDef(def)
    setStep('confirm')
  }

  const handleConfirm = () => {
    create({
      name: input.slice(0, 40),
      description: input,
      definition: generatedDef,
    }, { onSuccess: onClose })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-full max-w-lg rounded-2xl border border-border bg-background p-6 shadow-xl">
        <h2 className="text-base font-semibold mb-4">新建工作流</h2>

        {step === 'describe' && (
          <>
            <p className="text-sm text-muted-foreground mb-3">
              描述你想自动化的工作流程，AI 会帮你生成执行步骤
            </p>
            <Input
              placeholder="例如：每天从邮件提取发票信息，核对金额后发送通知"
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && input.trim() && handleGenerate()}
              className="mb-4"
              autoFocus
            />
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={onClose}>取消</Button>
              <Button onClick={handleGenerate} disabled={!input.trim()}>
                生成流程
              </Button>
            </div>
          </>
        )}

        {step === 'generating' && (
          <div className="flex items-center gap-3 py-8 justify-center">
            <div className="h-5 w-5 animate-spin rounded-full border-2 border-primary/30 border-t-primary" />
            <span className="text-sm text-muted-foreground">AI 正在生成工作流...</span>
          </div>
        )}

        {step === 'confirm' && generatedDef && (
          <>
            <p className="text-sm text-muted-foreground mb-3">生成的流程步骤：</p>
            <div className="flex flex-col gap-2 mb-4 max-h-64 overflow-y-auto">
              {generatedDef.steps.map((s: any, i: number) => (
                <div key={s.id} className="flex items-start gap-3 rounded-lg border border-border/40 p-3">
                  <span className="text-xs text-muted-foreground mt-0.5">{i + 1}</span>
                  <div>
                    <p className="text-sm font-medium">{s.name}</p>
                    <p className="text-xs text-muted-foreground">{s.capability} · {s.instructions.slice(0, 80)}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="flex gap-2 justify-end">
              <Button variant="ghost" onClick={() => setStep('describe')}>重新生成</Button>
              <Button onClick={handleConfirm} disabled={isPending}>
                {isPending ? '保存中...' : '确认创建'}
              </Button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
```

---

### Task 9：Capabilities 页面（简版）

**文件：** `apps/web/src/pages/capabilities/index.tsx`

```tsx
import { useCapabilities } from '@forge/core'

export function CapabilitiesPage() {
  const { data: capabilities, isLoading } = useCapabilities()

  const BUILT_IN = [
    { type: 'browser', name: '浏览器操作', desc: '自动打开网页、填写表单、点击按钮', icon: '🌐' },
    { type: 'http',    name: 'HTTP 调用',  desc: '调用任意 REST API 接口',          icon: '🔌' },
    { type: 'llm',     name: 'AI 分析',    desc: '文本提取、分析、生成',             icon: '🧠' },
    { type: 'notify',  name: '发送通知',   desc: 'Webhook / 邮件 / 钉钉通知',       icon: '🔔' },
    { type: 'file',    name: '文件处理',   desc: '读取 Excel、PDF、CSV',            icon: '📄' },
    { type: 'code',    name: '代码生成',   desc: '生成完整的 Web 应用',             icon: '💻' },
  ]

  return (
    <div className="flex flex-col gap-6 p-8">
      <div>
        <h1 className="text-xl font-semibold">能力</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Agent 可以调用的工具和集成
        </p>
      </div>

      <div>
        <h2 className="text-sm font-medium text-muted-foreground mb-3">内置能力</h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {BUILT_IN.map(cap => (
            <div key={cap.type} className="flex gap-3 rounded-xl border border-border/40 bg-card/60 p-4">
              <span className="text-2xl">{cap.icon}</span>
              <div>
                <p className="text-sm font-medium">{cap.name}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{cap.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>

      {isLoading
        ? <p className="text-sm text-muted-foreground">加载中...</p>
        : (capabilities && capabilities.length > 0) && (
          <div>
            <h2 className="text-sm font-medium text-muted-foreground mb-3">自定义能力</h2>
            {/* 同 WorkflowCard 风格渲染 */}
          </div>
        )
      }
    </div>
  )
}
```

---

### Task 10：注册路由和导航

**文件：** `apps/web/src/routes.tsx`（在认证路由内新增）

```tsx
import { WorkflowsPage }    from './pages/workflows'
import { CapabilitiesPage } from './pages/capabilities'

// 在 ProtectedRoute 内新增：
<Route path="workflows"    element={<WorkflowsPage />} />
<Route path="capabilities" element={<CapabilitiesPage />} />
```

**导航栏**（找到现有 sidebar/nav 组件，添加两个导航项）：

```tsx
{ path: '/workflows',    label: '工作流', icon: <Icons.Workflow /> }
{ path: '/capabilities', label: '能力',   icon: <Icons.Zap /> }
```

在 `Icons` 组件中新增（如果没有对应图标，用已有的替代）：
- Workflow → 用 `GitBranch` 或 `Layers`
- Capabilities → 用 `Zap` 或 `Plug`

---

## 验收标准

```bash
# 1. TypeScript 编译通过
./node_modules/.bin/tsc --project apps/web/tsconfig.json --noEmit

# 2. 现有路由不变
# 访问 http://localhost:5173/projects — 正常显示
# 访问 http://localhost:5173/workspace/:id — 正常显示（8个card）

# 3. 新路由可访问
# 访问 http://localhost:5173/workflows — 显示空列表 + "新建工作流" 按钮
# 访问 http://localhost:5173/capabilities — 显示6个内置能力 card

# 4. 创建流程
# 点击"新建工作流" → 输入描述 → AI 生成步骤（占位） → 确认 → 出现在列表

# 5. AgentFlowPanel 向前兼容
# 进入现有代码生成项目的 workspace，8个 card 正常显示
```

---

## 并行执行说明

本计划可以在 Go API 重构计划并行执行。唯一依赖：

- Task 1（类型定义）必须先完成，Task 2-10 依赖它
- Task 2/3（hooks）依赖 Go API 的 `/api/v1/workflows` 和 `/api/v1/capabilities` 接口
  - 如果 Go API 还没好，用 mock data：`return [MOCK_WORKFLOW]` 先让 UI 跑起来
- Task 5（AgentFlowPanel 动态化）可独立完成，不依赖 Go API
