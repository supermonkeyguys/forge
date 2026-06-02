# Agent Platform Design

> 日期：2026-06-02  
> 状态：已审批  
> 范围：Layer 1（Agent CRUD UI + 后端）+ Layer 2（Pipeline 执行基础设施）

---

## 目标

在 Forge 中构建 Agent 管理平台，允许用户创建自定义 Agent（带自定义 instructions、工具权限、写入路径），并让这些 Agent 参与代码生成 pipeline 的执行，替换对应的默认 Builder Agent。

Layer 3（分组管理）和工作区 UI 内的 Agent 选择器不在本期范围内。

---

## 页面设计

路由：`/agents`，三列布局：

```
[ 角色列表 160px ] [ 属性卡 220px ] [ Tab 面板 flex-1 ]
```

### 角色列表（左侧）

- **System** 分组：8 个内置 Agent（PM / Architect / Logic / Schema / API / UI / Page / Test），静态定义，无需 API
- **My Agents** 分组：用户创建的自定义 Agent，从 `GET /api/v1/agents` 拉取
- 顶部有 `+` 按钮创建新 Agent，点击后右侧面板切换到空白创建表单

### 属性卡（中间）

| 字段 | System Agent | Custom Agent |
|---|---|---|
| 头像 | 固定色 icon | 固定色 icon（按名称哈希取色） |
| 名称 | 英文角色名 | 用户设置的名称 |
| 类型 badge | `system` | `custom` |
| Tier | 1 / 2 / 3 | — |
| 工具数 | 静态 | 来自 DB |
| 写入路径数 | 静态 | 来自 DB |
| 模型 | `claude-sonnet` | `claude-sonnet` |
| 来源 | `内置` | 创建时间 |
| 操作按钮 | `Fork Agent` | `删除 Agent` |

Fork Agent：以系统 Agent 的 instructions / 工具 / 写入路径为模板，打开创建表单预填。

### Tab 面板（右侧）

四个 Tab，对所有 Agent 统一：

| Tab | 内容 | System | Custom |
|---|---|---|---|
| 指令 | system prompt 全文，代码编辑器 | 只读 | 可编辑保存 |
| 工具 | 5 个工具的 checkbox 列表 | 只读（全勾选） | 可勾选 |
| 写入路径 | glob 格式，每行一条，textarea | 只读 | 可编辑保存 |
| 配置 | 名称、描述 | 只读 | 可编辑保存 |

保存按钮始终在 Tab 右下角；System Agent 的保存按钮 disabled，hover 提示 "Fork 后可编辑"。

---

## 数据模型

### DB Migration（`apps/api/migrations/004_agents.sql`）

```sql
CREATE TABLE agents (
  id          TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id     TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name        TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  instructions TEXT NOT NULL DEFAULT '',
  tools       TEXT[] NOT NULL DEFAULT '{}',
  write_paths TEXT[] NOT NULL DEFAULT '{}',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX agents_user_id_idx ON agents(user_id);
```

### Go Domain（`apps/api/domain/agent.go`）

```go
type Agent struct {
    ID           string
    UserID       string
    Name         string
    Description  string
    Instructions string
    Tools        []string
    WritePaths   []string
    CreatedAt    time.Time
    UpdatedAt    time.Time
}

type AgentRepository interface {
    Create(ctx context.Context, a Agent) (Agent, error)
    GetByID(ctx context.Context, id string) (Agent, error)
    ListByUserID(ctx context.Context, userID string) ([]Agent, error)
    Update(ctx context.Context, a Agent) (Agent, error)
    Delete(ctx context.Context, id, userID string) error
}
```

---

## Go API Endpoints

全部挂在 `/api/v1/agents`，需要 JWT 认证。

| Method | Path | 说明 |
|---|---|---|
| `GET` | `/api/v1/agents` | 列出当前用户所有自定义 Agent |
| `POST` | `/api/v1/agents` | 创建 Agent |
| `GET` | `/api/v1/agents/:id` | 获取单个 Agent |
| `PUT` | `/api/v1/agents/:id` | 全量更新（需鉴权：userID 必须匹配） |
| `DELETE` | `/api/v1/agents/:id` | 删除（需鉴权：userID 必须匹配） |

**POST/PUT 请求体**：

```json
{
  "name": "Docs Writer",
  "description": "写 JSDoc 和 README",
  "instructions": "You are a documentation writer...",
  "tools": ["read_file", "write_file", "tsc_check"],
  "write_paths": ["docs/**", "**/*.md"]
}
```

`tools` 只允许 `read_file | write_file | str_replace | tsc_check | spawn_task` 中的子集，后端校验。

---

## Internal API（Agent Service → Go API）

Agent Service 在执行自定义 Agent 时需要拉取配置，走 internal token 路由：

```
GET /internal/agents/:id
```

返回 Agent 的 instructions / tools / write_paths。在 `apps/api/api/handler/internal.go` 扩展。

---

## Frontend（`packages/core` + `apps/web`）

### `packages/core/agent/`（新建）

```
use-agents.ts         — useAgents()、useCreateAgent()、useUpdateAgent()、useDeleteAgent()
agent-store.ts        — 选中的 agentId（client state）
index.ts              — 导出
```

`useAgents()` → `GET /api/v1/agents`  
`useCreateAgent()` → `POST /api/v1/agents`（invalidates on settled）  
`useUpdateAgent()` → `PUT /api/v1/agents/:id`  
`useDeleteAgent()` → `DELETE /api/v1/agents/:id`  

### `apps/web/src/pages/agents/`（新建）

```
index.tsx              — AgentsPage，三列骨架
components/
  AgentList.tsx         — 左侧列表（系统 + 用户 Agent）
  AgentCard.tsx         — 中间属性卡
  AgentTabPanel.tsx     — 右侧 Tab 面板骨架
  tabs/
    InstructionsTab.tsx — 指令 Tab（textarea + save）
    ToolsTab.tsx        — 工具 Tab（checkbox list）
    WritePathsTab.tsx   — 写入路径 Tab（textarea + save）
    ConfigTab.tsx       — 配置 Tab（name / description）
```

### `apps/web/src/lib/agent-registry.ts`（新建）

系统 Agent 的静态定义：

```ts
export type AgentTool = 'read_file' | 'write_file' | 'str_replace' | 'tsc_check' | 'spawn_task'

export const ALL_TOOLS: AgentTool[] = ['read_file', 'write_file', 'str_replace', 'tsc_check', 'spawn_task']

export interface SystemAgentDef {
  role: string
  label: string
  tier: 1 | 2 | 3
  color: string
  tools: AgentTool[]
  writePaths: string[]
  instructionsFile: string   // 对应 templates/instructions/*.md 文件名
}

export const SYSTEM_AGENTS: SystemAgentDef[] = [
  { role: 'pm',        label: 'PM',        tier: 1, color: '#6366f1', tools: [],            writePaths: [],                                     instructionsFile: 'pm.md' },
  { role: 'architect', label: 'Architect', tier: 1, color: '#10b981', tools: [],            writePaths: [],                                     instructionsFile: 'architect.md' },
  { role: 'logic',     label: 'Logic',     tier: 2, color: '#3b82f6', tools: ALL_TOOLS,     writePaths: ['packages/core/**', 'server/domain/**'], instructionsFile: 'logic.md' },
  { role: 'schema',    label: 'Schema',    tier: 2, color: '#f59e0b', tools: ALL_TOOLS,     writePaths: ['prisma/**'],                           instructionsFile: 'schema.md' },
  { role: 'api',       label: 'API',       tier: 2, color: '#06b6d4', tools: ALL_TOOLS,     writePaths: ['app/api/**', 'server/infra/**'],       instructionsFile: 'api.md' },
  { role: 'ui',        label: 'UI',        tier: 2, color: '#ec4899', tools: ALL_TOOLS,     writePaths: ['packages/ui/**'],                     instructionsFile: 'ui.md' },
  { role: 'page',      label: 'Page',      tier: 2, color: '#8b5cf6', tools: ALL_TOOLS,     writePaths: ['app/**'],                             instructionsFile: 'page.md' },
  { role: 'test',      label: 'Test',      tier: 3, color: '#ef4444', tools: [],            writePaths: [],                                     instructionsFile: 'test.md' },
]
```

系统 Agent 的 instructions 全文通过 Agent Service 的静态路由懒加载：

```
GET /instructions/:role   →  返回 text/plain，读取 templates/instructions/<role>.md
```

在 `apps/agent/src/server.ts` 增加此路由，无需鉴权（内容非敏感）。前端在用户切换到"指令" Tab 时触发 `fetch`，结果缓存在 React state。

### AppShell 导航

在 `apps/web/src/components/layout/AppShell.tsx` 增加一个 NavItem：
- 路径：`/agents`
- 图标：`Icons.Bot`（Lucide `bot` icon）
- 位置：在 `/projects` 和 `/settings` 之间

### 路由注册（`apps/web/src/routes.tsx`）

```tsx
const AgentsPage = lazy(() => import('./pages/agents').then(m => ({ default: m.AgentsPage })))
// 在 ProtectedRoute + AppShell 内：
<Route path="/agents" element={<AgentsPage />} />
```

---

## Layer 2：Pipeline 执行基础设施

### Agent Service 变更

**`apps/agent/src/agents/builder/custom-agent.ts`（新建）**

```ts
export class CustomBuilderAgent extends BaseBuilderAgent {
  readonly role: AgentRole
  private config: { instructions: string; tools: AgentTool[]; writePaths: string[] }

  constructor(role: AgentRole, config: typeof this.config) { ... }

  protected systemPrompt(): string { return this.config.instructions }

  // Generic task prompt — works for any custom agent role
  protected buildTaskPrompt(input: TaskInput): string {
    return `Task: ${input.task.description}\nFile: ${input.task.file}\nAction: ${input.task.action}\n\n${input.projectContext ?? ''}`
  }

  // Custom agents don't update shared project_context.md sections
  protected contextUpdate(_task: PlanTask, _code: string): null { return null }
}
```

`write_paths` 存储为路径前缀（如 `packages/core/`、`docs/`），校验方式与 `WRITE_ALLOWED` 一致：`path.startsWith(prefix)`。不引入 glob 依赖。

**`apps/agent/src/server.ts` POST /run 扩展**

请求体增加可选字段：
```ts
agentOverrides?: Record<string, string>  // role → agent DB id
```

**`apps/agent/src/job-runner.ts` 扩展**

```ts
if (agentOverrides) {
  const resolved = await resolveAgentOverrides(agentOverrides) // 拉 Go API /internal/agents/:id
  orc = new Orchestrator(projectId, userInput, { ...deps, agentOverrides: resolved })
}
```

**`apps/agent/src/orchestrator/orchestrator.ts` 扩展**

`OrchestratorDeps` 增加 `agentOverrides?: Record<string, CustomAgentConfig>`。构造时将对应 role 的 builder 替换为 `CustomBuilderAgent`。

### Go API 内部路由扩展（`apps/api/api/handler/internal.go`）

```
GET /internal/agents/:id → 返回 { instructions, tools, write_paths }
```

需要 `InternalToken` 鉴权，复用现有 `middleware.RequireInternalToken`。

---

## 不在本期范围

- 工作区 UI 内的 Agent 选择器（用户在发起任务时选择 override 哪个 Agent）
- Agent 分组管理
- 系统 Agent instructions 的可编辑覆盖（Fork 后的自定义 Agent 已覆盖此需求）
- Custom Agent 的 `spawn_task` 工具的权限子树管理
