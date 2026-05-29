# Forge Agent Layer — 技术方案文档

> 版本：0.1 | 日期：2026-05-26 | 项目路径：`apps/agent/src/`

---

## 1. 系统概述

Forge Agent 层是一个**多智能体代码生成 Pipeline**，接收用户自然语言需求，经过需求分析 → 架构规划 → 并行代码生成 → 验证修复四个阶段，最终在 E2B 云沙箱中输出可运行的 Next.js 应用预览链接。

### 1.1 核心目标

- 将非结构化用户意图转化为可运行的 Web 应用
- 通过专职 Agent 分工保证代码质量与一致性
- 支持生成失败时自动重试与人工介入的降级路径

### 1.2 技术栈

| 层次 | 技术 |
|------|------|
| LLM 调用 | Vercel AI SDK (`ai` + `@ai-sdk/anthropic`) |
| 结构化输出 | `generateObject` + Zod schema |
| Agentic 工具调用 | `generateText` + `tool()` 循环 |
| 沙箱执行 | E2B SDK (`ForgeSandbox`) |
| 运行时框架 | Node.js HTTP server（无框架） |
| 语言 | TypeScript（ESM） |

---

## 2. 整体架构

```
┌─────────────────────────────────────────────────────┐
│  HTTP Server (index.ts)                              │
│  POST /run  GET /status/:id  POST /resume/:id        │
│  POST /confirm-draft/:id    GET /health              │
└──────────────────┬──────────────────────────────────┘
                   │ Job (in-memory Map)
                   ▼
┌─────────────────────────────────────────────────────┐
│  Orchestrator                                        │
│  ┌─────────────────────────────────────────────┐    │
│  │  State Machine                              │    │
│  │  idle→analyzing→planning→building→          │    │
│  │  validating→done / fixing / waiting         │    │
│  └─────────────────────────────────────────────┘    │
│                                                      │
│  PMAgent ──► ArchitectAgent ──► BuilderAgents(×5)   │
│                                      │               │
│                               TestAgent              │
│                                      │               │
│                               ErrorRouter            │
└──────────────────┬──────────────────────────────────┘
                   │ SandboxInterface
                   ▼
┌─────────────────────────────────────────────────────┐
│  E2B Sandbox (ForgeSandbox)                         │
│  Next.js 模板 + writeFile/readFile/run/startBg      │
└─────────────────────────────────────────────────────┘
```

---

## 3. 状态机

```
idle
 │ START
 ▼
analyzing  ──────────────────────────────────────────┐
 │ SPEC_READY (用户确认草稿后)                         │
 ▼                                                    │
planning                                              │
 │ PLAN_READY                                         │
 ▼                                                    │
building                                              │
 │ BUILD_DONE                                         │
 ▼                                                    │
validating                                            │
 │ VALIDATION_PASSED        │ VALIDATION_FAILED        │
 ▼                          ▼                         │
done                      fixing                      │
                           │ BUILD_DONE               │
                           ▼                          │
                         validating                   │
                           │ retryCount >= maxRetries  │
                           ▼                          │
                         waiting ◄────────────────────┘
                           │ USER_INPUT
                           └──────────────► analyzing
```

**状态说明：**
- `waiting`：重试耗尽或连续3次相同错误，暂停等待用户介入
- `done` / `aborted`：终态，不再转换
- `maxRetries` 默认 3，可通过 `OrchestratorDeps` 注入

---

## 4. Agent 详解

### 4.1 PMAgent（需求分析）

**阶段：** `analyzing`  
**输入：** 用户自然语言 `userInput`  
**输出：** `DraftSpec` → 用户确认后 → `spec.json`  
**LLM 方式：** `generateObject` + `SpecSchema`（Zod 约束）

**流程：**
1. `draft()` 生成包含 features / constraints / clarifying_questions 的草稿
2. 通过 `onDraftReady` 回调暂停，等前端用户确认
3. 用户确认后 `finalize()` 写入 `contracts/spec.json`

**关键字段：**
```typescript
interface DraftSpec {
  title, description, business_domain,
  features: DraftFeature[],       // confidence: high/medium/low
  constraints: { auth, database, file_upload, email, payments },
  clarifying_questions?: string[]
}
```

### 4.2 ArchitectAgent（架构规划）

**阶段：** `planning`  
**输入：** `spec.json`  
**输出：** `task_plan.json` + `project_context.md`（初始版）  
**LLM 方式：** `generateObject` + `TaskPlanSchema`

**核心产物 TaskPlan：**
```typescript
interface PlanTask {
  id: string
  agent: AgentRole          // schema | logic | api | ui | page
  file: string              // 要创建/修改的文件路径
  action: 'create' | 'modify'
  description: string
  depends_on: string[]      // 依赖的 task id
}
```

**并行批次算法：** `parallelBatches()` 基于拓扑排序，将无依赖关系的任务分到同一批次并行执行。

`buildInitialContext()` 生成 `project_context.md` 的初始骨架，包含以下章节：
- `## App Overview`
- `## Architecture Decisions`
- `## Data Models`（schema agent 填充）
- `## API Contracts`（api agent 填充）
- `## Available Hooks`（logic agent 填充）
- `## Available UI Components`（ui agent 填充）

### 4.3 Builder Agents（代码生成）

**阶段：** `building` / `fixing`  
**继承关系：** 5 个专职 Agent 均继承 `BaseBuilder`

```
BaseBuilder
├── SchemaAgent  → Prisma schema、DB 迁移文件
├── LogicAgent   → React hooks、业务逻辑
├── ApiAgent     → Next.js API routes
├── UIAgent      → 通用 UI 组件
└── PageAgent    → 页面文件（最终组装）
```

**执行机制 — Agentic Tool-Use Loop：**
```
Orchestrator.generateTaskCode(task)
  └─ agent.executeTask(TaskInput, emit, sandbox)
       └─ generateText(model, tools: { write_file, read_file }, maxSteps)
            ├─ LLM 调用 write_file → sandbox.writeFile()
            ├─ LLM 调用 read_file  → sandbox.readFile()
            └─ 循环直到 LLM 停止工具调用
```

LLM **直接调用工具写文件**，而非在文本中返回代码再由外部写入——这是 agentic 模式的核心优势，对多文件任务更可靠。

**两阶段提交（防竞态）：**
```
Phase 1: generateTaskCode  → 并行（LLM 调用互不干扰）
Phase 2: commitTask        → 串行（project_context.md 写入顺序化）
```

**上下文裁剪（防膨胀）：**  
`readRelevantContext(role)` 按 Agent 角色只注入所需章节：

| Agent | 所需 context 章节 |
|-------|-----------------|
| schema | App Overview + Architecture Decisions |
| logic  | App Overview + Data Models + API Contracts |
| api    | App Overview + Data Models + Architecture Decisions |
| ui     | App Overview + Available Hooks |
| page   | App Overview + Available Hooks + UI Components + API Contracts |

### 4.4 TestAgent（验证）

**阶段：** `validating`  
**输入：** `spec.json` + sandbox  
**输出：** `validation_report.json`

**双重验证策略：**

| 层次 | 方式 | 说明 |
|------|------|------|
| Unit Tests | 真实运行 Vitest | 解析 JSON 结果，提取失败用例 |
| E2E Checks | LLM 视觉评估 | 启动 dev server，截图后 `assessScreenshot()` 对每条 acceptance criteria 打分 |

**E2E 流程：**
1. `planE2EChecks(spec)` → LLM 将 acceptance criteria 转化为 HTTP probe 或 visual check 计划
2. `startAndWaitForServer(sandbox)` → 轮询等待 dev server 就绪
3. `executeE2EChecks()` → 对每个 check：HTTP probe 直接验证，visual check 截图 + LLM 判断
4. `buildReport()` → 汇总 `overall: 'passed' | 'failed'` + 错误列表

### 4.5 ErrorRouter（错误路由）

**触发时机：** `validating` 失败后进入 `fixing` 阶段

**分类逻辑：**
```
errors → routeErrors(errors, plan) → FixInstruction[]
                                          │
                    isSurgicalFix? ───────┤
                    (只影响1个 Agent)      │
                         ├─ yes ──► 只重跑对应 Agent 的 tasks
                         └─ no  ──► 全量重建所有 batches
```

**卡死检测：**  
对错误消息做归一化（去除行号、内存地址），相同错误签名连续出现 ≥ 3 次则强制 `retryCount = maxRetries`，触发 `waiting` 状态。

---

## 5. 沙箱层

**实现：** `ForgeSandbox`（封装 E2B SDK）

| 方法 | 用途 |
|------|------|
| `create()` | 创建新沙箱实例 |
| `writeFile(path, content)` | Agent 工具调用写文件 |
| `readFile(path)` | Agent 工具调用读文件 |
| `run(cmd, opts)` | 执行命令（Vitest、npm install 等） |
| `startBackground(cmd)` | 后台启动 dev server |
| `getPreviewUrl(port)` | 获取公网预览 URL |
| `keepAlive(ms)` | 每次状态转换刷新超时，防止中途过期 |
| `kill()` | 失败时销毁沙箱 |

**初始化模板：** `loadNextjsTemplate()` 加载 `sandbox/templates/nextjs/` 的文件到沙箱，包含 `next.config.js`、`package.json`、`tsconfig.json`、`src/app/layout.tsx`、`src/app/page.tsx`。

**注入方式：** 通过 `SandboxInterface` 注入 Orchestrator，便于单测 mock。

---

## 6. HTTP API

**服务入口：** `apps/agent/src/index.ts`（原生 Node.js HTTP，无框架）  
**端口：** `process.env.PORT ?? 3001`  
**存储：** in-memory `Map<string, Job>`（Phase 1 升级路径：BullMQ）

| 路由 | 方法 | 说明 |
|------|------|------|
| `/run` | POST | 创建 job，立即返回 `{ jobId, status: 'queued' }`，异步执行 |
| `/status/:jobId` | GET | 返回 job 完整状态 + events 数组 |
| `/confirm-draft/:jobId` | POST | 确认 PM 草稿，解锁 analyzing → planning |
| `/resume/:jobId` | POST | 向 waiting job 注入用户补充，恢复执行 |
| `/health` | GET | 存活探针，返回 job 计数 |

**Job 结构（精简）：**
```typescript
interface Job {
  id, projectId, status: JobStatus
  events: ProgressEvent[]
  draft: DraftSpec | null        // PM 草稿待确认时非 null
  previewUrl: string | null
  error: string | null
  _draftResolve: Function | null // Promise resolver，用于暂停/恢复
  _orchestrator: Orchestrator | null
}
```

---

## 7. Contracts（跨 Agent 数据契约）

所有跨 Agent 传递的数据均以 Zod schema 约束，写入沙箱后作为文件共享：

| 文件 | 产生者 | 消费者 |
|------|--------|--------|
| `contracts/spec.json` | PMAgent | ArchitectAgent, TestAgent |
| `contracts/task_plan.json` | ArchitectAgent | Orchestrator (batching) |
| `contracts/project_context.md` | ArchitectAgent (初始) + 各 Builder (upsert) | 各 Builder (读取相关章节) |
| `contracts/validation_report.json` | TestAgent | Orchestrator (fixing 决策) |

---

## 8. 当前已知限制

1. **Job 存储无持久化**：服务重启所有 job 丢失，Phase 1 待换 BullMQ
2. **单机单进程**：无法水平扩展，并发 job 共享同一内存
3. **沙箱超时风险**：长时间 building 阶段可能触发 E2B 超时，`keepAlive` 在每次状态转换调用，但 step 内部无保障
4. **E2E 视觉评估主观性**：`assessScreenshot` 依赖 LLM 判断，结果不稳定
5. **Builder 系统提示不可见**：各子类的 system prompt 分散在子类文件中，无集中管理
6. **错误路由粒度**：surgical fix 以 Agent 为粒度，同一 Agent 的多个 task 全部重跑，浪费
