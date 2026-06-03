# Knowledge System V2 Design

> 日期：2026-06-03  
> 状态：已审批  
> 版本：V2（对 workspace_kb 进行重大重构）

---

## 核心原则

- **项目 = 知识工作区**：KB 跟着项目走，不同项目知识隔离
- **Agent 是知识生产者，人类是把关者**：Agent 可提议知识（pending），人工确认（verified）后生效
- **类型决定注入策略**：Principles 全量注入，其余语义检索
- **摘要优先**：URL/文件内容由 Agent 提炼摘要存入，不存原文

---

## 数据模型重构

### 废弃 + 合并

将现有的两张表合并：
- `workspace_kb`（用户级，废弃）
- `project_context_sections`（项目级，架构上下文）

合并为新表 `project_kb`，统一管理所有项目知识。

### 新表：`project_kb`

```sql
CREATE TABLE IF NOT EXISTS project_kb (
  id           TEXT        PRIMARY KEY DEFAULT gen_random_uuid()::text,
  project_id   TEXT,                                      -- NULL = is_global
  user_id      TEXT        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  is_global    BOOLEAN     NOT NULL DEFAULT false,        -- true = 跨项目通用

  -- 分类
  type         TEXT        NOT NULL DEFAULT 'spec',       -- principle | spec | test_asset | past_output

  -- 内容
  title        TEXT        NOT NULL,
  content      TEXT        NOT NULL,
  tags         TEXT[]      NOT NULL DEFAULT '{}',

  -- 来源追踪
  input_type   TEXT        NOT NULL DEFAULT 'text',       -- text | url | file
  source_ref   TEXT        NOT NULL DEFAULT '',           -- 原始 URL 或文件名
  source_agent TEXT        NOT NULL DEFAULT '',           -- 生成该条目的 Agent
  source_task  TEXT        NOT NULL DEFAULT '',           -- 关联的 Task ID

  -- 状态
  status       TEXT        NOT NULL DEFAULT 'pending',    -- processing | pending | verified | deprecated
  confidence   FLOAT       NOT NULL DEFAULT 0.8,

  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS project_kb_project_id_idx ON project_kb(project_id);
CREATE INDEX IF NOT EXISTS project_kb_user_id_idx    ON project_kb(user_id);
CREATE INDEX IF NOT EXISTS project_kb_type_idx       ON project_kb(type);
CREATE INDEX IF NOT EXISTS project_kb_status_idx     ON project_kb(status);
CREATE INDEX IF NOT EXISTS project_kb_tags_idx       ON project_kb USING GIN(tags);
```

---

## 知识类型与注入策略

| type | 含义 | 注入策略 | 谁能写入 |
|---|---|---|---|
| `principle` | 原则性规范，全局生效 | 每个任务全量注入（已 verified 的） | Human + Agent(pending) |
| `spec` | 设计方案、架构决策 | 按 task description 语义检索，Top 3 | Human + Agent(pending) |
| `test_asset` | 测试用例、已知 bug、边界场景 | 仅注入 Test Agent，语义检索 Top 5 | Human + Agent(pending) |
| `past_output` | 过往解决方案、可复用模式 | 按 task 相似度检索，Top 2 | Agent(pending)，人工确认 |

**注入上限**：system prompt 中 KB 内容总计不超过 2000 tokens。优先级：principles > spec > past_output > test_asset（Test Agent 例外）。

---

## 知识录入流程

### 文本直接录入
```
用户填写 title + content
→ status: verified（人类录入直接生效）
→ input_type: text
```

### URL 录入
```
用户填写 URL
→ 创建 KB 条目（status: processing, input_type: url, source_ref: url）
→ 触发 KBIngestJob（Agent Service）
→ Agent fetch URL → 提炼摘要 → 更新 content
→ status: pending（等人工确认摘要准确性）
→ 人工 verify → status: verified
```

### 文件录入
```
用户上传 PDF / TXT / MD
→ 文件存储（本地 or S3），返回 file_ref
→ 创建 KB 条目（status: processing, input_type: file, source_ref: file_ref）
→ 触发 KBIngestJob（Agent Service）
→ Agent 读取文件内容 → 提炼摘要 → 更新 content
→ status: pending（等人工确认）
```

### Agent 自动提炼（任务完成后）
```
Task completed
→ Agent 自我反思：
    "本次任务产生了哪些值得记住的知识？"
→ 批量提交 KB 条目（status: pending）
→ 人工在 /knowledge 页面一键确认或拒绝
```

---

## Go API 端点

### 用户端（JWT 认证）

```
GET    /api/v1/projects/:projectId/kb             → 列出（按 type/status 过滤）
POST   /api/v1/projects/:projectId/kb             → 创建（text，直接 verified）
PUT    /api/v1/projects/:projectId/kb/:id          → 更新内容
PUT    /api/v1/projects/:projectId/kb/:id/verify   → 确认 pending 条目
PUT    /api/v1/projects/:projectId/kb/:id/deprecate → 废弃条目
DELETE /api/v1/projects/:projectId/kb/:id          → 删除

POST   /api/v1/projects/:projectId/kb/ingest       → 提交 URL/文件（触发异步 Job）

GET    /api/v1/kb/global                           → 全局原则列表
POST   /api/v1/kb/global                           → 创建全局原则
```

### Internal（Agent Service 专用）

```
GET  /internal/projects/:id/kb?type=&q=&limit=     → 检索 KB（语义搜索）
POST /internal/projects/:id/kb                     → Agent 提交知识（status: pending）
GET  /internal/kb/global?type=principle             → 获取全局原则（所有 verified principles）
```

---

## Agent Service 变更

### 新增 KBIngestJob

在 `job-store.ts` 中，现有 `Job` 接口扩展新字段：

```ts
interface Job {
  // ...existing fields...
  jobType?: 'build' | 'kb_ingest'   // 默认 'build'（代码生成），新增 'kb_ingest'
  kbEntryId?: string                 // kb_ingest 专用：待处理的 KB 条目 ID
  kbSourceRef?: string               // kb_ingest 专用：URL 或文件路径
  kbInputType?: 'url' | 'file'       // kb_ingest 专用
}
```

在 `job-runner.ts` 中，根据 `job.jobType` 分支：
```ts
if (job.jobType === 'kb_ingest') {
  await runKBIngestJob(job)
} else {
  await runBuildJob(job, userInput)  // 现有逻辑
}
```

Agent 处理流程：
```ts
// 1. fetch URL / read file
// 2. generateText with system: "Extract key information as a concise summary..."
// 3. PATCH /internal/kb/:id { content: summary, status: 'pending' }
```

### 注入逻辑重构（base-builder.ts）

```ts
async function buildKBContextForTask(
  projectId: string,
  userID: string,
  role: AgentRole,
  taskDescription: string,
): Promise<string> {
  // 1. 全量注入 verified principles
  const principles = await fetchKB(projectId, { type: 'principle', status: 'verified' })
  
  // 2. 语义检索 specs（Top 3）
  const specs = await searchKB(projectId, taskDescription, { type: 'spec', limit: 3 })
  
  // 3. 如果是 test agent，额外检索 test_assets（Top 5）
  const testAssets = role === 'test'
    ? await searchKB(projectId, taskDescription, { type: 'test_asset', limit: 5 })
    : []
  
  // 4. 语义检索 past_outputs（Top 2）
  const pastOutputs = await searchKB(projectId, taskDescription, { type: 'past_output', limit: 2 })
  
  return formatKBContext({ principles, specs, testAssets, pastOutputs })
}
```

### 任务完成后自动提炼

在 `Orchestrator.commitTask()` 完成后，触发知识提炼：

```ts
// After commitTask succeeds
if (this.deps.contextClient && task.status === 'done') {
  await this.extractKnowledge(task, code)
}

private async extractKnowledge(task: PlanTask, code: string): Promise<void> {
  const { text } = await generateText({
    system: `You extract reusable knowledge from completed work. 
             For each key insight, output JSON: { type, title, content, confidence }
             Types: principle | spec | test_asset | past_output
             Only extract if genuinely reusable. Output [] if nothing notable.`,
    prompt: `Task: ${task.description}\nOutput: ${code.slice(0, 1000)}`,
  })
  // parse and POST each entry to /internal/projects/:id/kb
}
```

---

## 前端变更

### 路由变更

`/knowledge`（顶层路由，从 Settings 独立出来）

AppShell 新增 NavItem：`Icons.BookOpen`，路径 `/knowledge`。

移除 Settings 里的 KBSection。

### `/knowledge` 页面结构

```
左侧：
  项目选择器（当前项目 + 全局）
  类型过滤器（All / Principle / Spec / Test Asset / Past Output）
  状态过滤器（All / Pending / Verified / Deprecated）

右侧：
  条目列表
  → 待确认区（Agent 提交的，pending）
  → 已验证区

右侧操作：
  + 添加文本
  + 导入 URL
  + 上传文件（PDF/TXT/MD）
```

### 文件上传

使用 `<input type="file" accept=".pdf,.txt,.md">` + `FormData` POST。

Go API 接收文件，存储到本地 `uploads/` 目录（MVP 阶段），返回 file_ref。

---

## 迁移策略

1. 创建新表 `project_kb`
2. 将现有 `workspace_kb` 数据迁移：`is_global=true, type='spec', status='verified'`
3. 将现有 `project_context_sections` 数据迁移：`type='spec', status='verified', source_agent='architect'`
4. 保留旧表 30 天后删除

---

## 不在本期范围

- 向量嵌入（用 ILIKE 全文搜索作为 MVP）
- S3/OSS 文件存储（本地存储 MVP）
- 跨项目知识共享（标记 is_global 已覆盖基础需求）
- 知识图谱/关联关系
- 知识版本历史
