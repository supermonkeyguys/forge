# Agent Layer Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 拆解 God File `index.ts`、修复接口耦合（`as any` 强转）、分离 `Job` 数据与运行时状态。

**Architecture:** `index.ts` 拆为 4 个职责单一的模块（go-api-client、job-store、job-runner、server）；新增 `BuilderAgent` 接口消除 orchestrator 里的 `as any`；`Job` 数据对象不再持有 Promise resolver 和 Orchestrator 引用，改由 `JobStore` 的独立 runtime map 管理。

**Tech Stack:** TypeScript, Node.js http, existing Orchestrator/Agent classes

---

## File Map

| 操作 | 路径 | 职责 |
|------|------|------|
| 新建 | `src/lib/go-api-client.ts` | `notifyGoAPI` 函数（从 index.ts 迁移） |
| 新建 | `src/job-store.ts` | `Job` 接口 + `JobStore` class + `JobRuntime` map |
| 新建 | `src/job-runner.ts` | `runJob()` — sandbox 创建 + Orchestrator 生命周期 |
| 新建 | `src/server.ts` | HTTP server 创建 + 所有路由处理函数 |
| 修改 | `src/index.ts` | 仅保留 `server.listen()` |
| 修改 | `src/agents/types.ts` | 新增 `BuilderAgent` 接口 |
| 修改 | `src/agents/builder/base-builder.ts` | 实现 `BuilderAgent`，移除 `(ctx as any).__tasks` |
| 修改 | `src/orchestrator/orchestrator.ts` | `builders` map 改用 `BuilderAgent` 类型，移除 `as any` |

---

### Task 1: 提取 `go-api-client.ts`

**Files:**
- Create: `apps/agent/src/lib/go-api-client.ts`
- Modify: `apps/agent/src/index.ts`
- Modify: `apps/agent/src/index.test.ts`（如存在对 notifyGoAPI 的 import）

- [ ] **Step 1: 创建 `src/lib/go-api-client.ts`**

```typescript
export async function notifyGoAPI(
  taskId: string,
  status: string,
  extras?: { previewUrl?: string; errorMsg?: string },
): Promise<void> {
  const apiUrl = process.env['FORGE_API_URL']
  if (!apiUrl) return

  const token = process.env['INTERNAL_TOKEN'] ?? ''
  const body = JSON.stringify({
    status,
    previewUrl: extras?.previewUrl ?? '',
    errorMsg: extras?.errorMsg ?? '',
  })

  try {
    await fetch(`${apiUrl}/internal/tasks/${taskId}/status`, {
      method: 'PATCH',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { 'X-Internal-Token': token } : {}),
      },
      body,
      signal: AbortSignal.timeout(5000),
    })
  } catch (err) {
    console.error(`[notifyGoAPI] failed to update task ${taskId} status to ${status}:`, err)
  }
}
```

- [ ] **Step 2: 更新 `index.ts` 的 import 和 `notifyGoAPI` 定义**

在 `index.ts` 顶部 imports 区域加上：
```typescript
import { notifyGoAPI } from './lib/go-api-client.js'
```
删除 `index.ts` 里 L218-249 的 `notifyGoAPI` 函数体（包括 export）。

- [ ] **Step 3: 检查测试文件 import**

```bash
grep -r "notifyGoAPI" /Users/cookie/project/forge/apps/agent/src --include="*.ts"
```

若 `index.test.ts` 从 `'../index.js'` 导入 `notifyGoAPI`，改为从 `'../lib/go-api-client.js'` 导入。

- [ ] **Step 4: 验证编译**

```bash
cd /Users/cookie/project/forge/apps/agent && npx tsc --noEmit 2>&1 | head -30
```
预期：0 个错误。

- [ ] **Step 5: Commit**

```bash
cd /Users/cookie/project/forge
git add apps/agent/src/lib/go-api-client.ts apps/agent/src/index.ts apps/agent/src/index.test.ts
git commit -m "refactor(agent): extract notifyGoAPI to lib/go-api-client"
```

---

### Task 2: 新增 `BuilderAgent` 接口，消除 `as any`

**Files:**
- Modify: `apps/agent/src/agents/types.ts`
- Modify: `apps/agent/src/agents/builder/base-builder.ts`
- Modify: `apps/agent/src/orchestrator/orchestrator.ts`

- [ ] **Step 1: 在 `agents/types.ts` 新增 `BuilderAgent` 接口**

在文件末尾（`Agent` 接口之后）追加：

```typescript
import type { SpawnTaskFn } from '../orchestrator/orchestrator.js'

/** Builder agents expose executeTask() in addition to the base Agent run(). */
export interface BuilderAgent extends Agent {
  executeTask(
    input: { task: import('../contracts/task-plan.js').PlanTask; projectContext: string; existingFileContent?: string },
    emit: (e: ProgressEvent) => void,
    sandbox?: { writeFile(p: string, c: string): Promise<void>; readFile(p: string): Promise<string>; run(cmd: string, opts?: { cwd?: string; timeoutMs?: number }): Promise<{ stdout: string; stderr: string; exitCode: number }>; startBackground(cmd: string, opts?: { cwd?: string }): Promise<void>; getPreviewUrl(port: number): Promise<string> },
    spawnFn?: SpawnTaskFn,
  ): Promise<string>
}
```

注意：这里的 sandbox 类型复用 `SandboxInterface` 即可，所以改为：

```typescript
import type { SpawnTaskFn, SandboxInterface } from '../orchestrator/orchestrator.js'
import type { PlanTask } from '../contracts/task-plan.js'

export interface BuilderTaskInput {
  task: PlanTask
  projectContext: string
  existingFileContent?: string
}

export interface BuilderAgent extends Agent {
  executeTask(
    input: BuilderTaskInput,
    emit: (e: ProgressEvent) => void,
    sandbox?: SandboxInterface,
    spawnFn?: SpawnTaskFn,
  ): Promise<string>
}
```

- [ ] **Step 2: 更新 `base-builder.ts` 中 `TaskInput` 和 `executeTask` 签名**

`base-builder.ts` 顶部 import 改为：
```typescript
import type { AgentRunContext, AgentResult, BuilderAgent, BuilderTaskInput, ProgressEvent } from '../types.js'
```

将现有 `TaskInput` 接口（L30-34）删除，改用从 `types.ts` 导入的 `BuilderTaskInput`。

将 class 声明改为：
```typescript
export abstract class BaseBuilder implements BuilderAgent {
```

将 `executeTask` 方法签名改为：
```typescript
async executeTask(
  input: BuilderTaskInput,
  emit: (e: ProgressEvent) => void,
  sandbox?: SandboxInterface,
  spawnFn?: SpawnTaskFn,
): Promise<string> {
```

- [ ] **Step 3: 更新 `orchestrator.ts` 中的 `builders` map 类型**

在 orchestrator imports 区域加入：
```typescript
import type { BuilderAgent } from '../agents/types.js'
```

将 `Orchestrator` 类中 `builders` 字段声明（大约 L140-155 附近）从：
```typescript
private builders: Record<string, Agent>
```
改为：
```typescript
private builders: Partial<Record<AgentRole, BuilderAgent>>
```

- [ ] **Step 4: 移除 `generateTaskCode` 中的 `(agent as any)` 强转**

`generateTaskCode` 里（L422 附近）：
```typescript
// 删除这行:
return (agent as any).executeTask(
// 改为:
return agent.executeTask(
```

- [ ] **Step 5: 验证编译**

```bash
cd /Users/cookie/project/forge/apps/agent && npx tsc --noEmit 2>&1 | head -40
```
预期：0 个错误。

- [ ] **Step 6: Commit**

```bash
cd /Users/cookie/project/forge
git add apps/agent/src/agents/types.ts apps/agent/src/agents/builder/base-builder.ts apps/agent/src/orchestrator/orchestrator.ts
git commit -m "refactor(agent): add BuilderAgent interface, remove as-any cast in orchestrator"
```

---

### Task 3: 提取 `job-store.ts`

**Files:**
- Create: `apps/agent/src/job-store.ts`
- Modify: `apps/agent/src/index.ts`（移除 Job 接口和 jobs map）

- [ ] **Step 1: 创建 `src/job-store.ts`**

```typescript
import type { Orchestrator } from './orchestrator/orchestrator.js'
import type { DraftSpec } from './agents/pm-agent.js'
import type { ProgressEvent } from './agents/types.js'
import type { OrchestratorState } from './orchestrator/state-machine.js'

type JobStatus = 'queued' | 'running' | OrchestratorState

export interface Job {
  id: string
  taskId: string | null
  projectId: string
  status: JobStatus
  events: ProgressEvent[]
  draft: DraftSpec | null
  previewUrl: string | null
  reviewUrl: string | null
  reviewHtml: string | null
  error: string | null
  waitingReason: string | null
  createdAt: string
  updatedAt: string
}

/** Runtime state kept separate from the serializable Job data. */
interface JobRuntime {
  draftResolve: ((draft: DraftSpec) => void) | null
  orchestrator: Orchestrator | null
}

export class JobStore {
  private jobs = new Map<string, Job>()
  private runtimes = new Map<string, JobRuntime>()

  add(job: Job): void {
    this.jobs.set(job.id, job)
    this.runtimes.set(job.id, { draftResolve: null, orchestrator: null })
  }

  get(id: string): Job | undefined {
    return this.jobs.get(id)
  }

  values(): IterableIterator<Job> {
    return this.jobs.values()
  }

  size(): number {
    return this.jobs.size
  }

  patch(id: string, update: Partial<Job>): void {
    const job = this.jobs.get(id)
    if (job) Object.assign(job, update)
  }

  setOrchestrator(id: string, orc: Orchestrator | null): void {
    const rt = this.runtimes.get(id)
    if (rt) rt.orchestrator = orc
  }

  getOrchestrator(id: string): Orchestrator | null {
    return this.runtimes.get(id)?.orchestrator ?? null
  }

  setDraftResolve(id: string, resolve: ((draft: DraftSpec) => void) | null): void {
    const rt = this.runtimes.get(id)
    if (rt) rt.draftResolve = resolve
  }

  resolveDraft(id: string, draft: DraftSpec): boolean {
    const rt = this.runtimes.get(id)
    if (!rt?.draftResolve) return false
    rt.draftResolve(draft)
    rt.draftResolve = null
    return true
  }

  hasPendingDraft(id: string): boolean {
    return !!this.runtimes.get(id)?.draftResolve
  }
}

export const jobStore = new JobStore()
```

- [ ] **Step 2: 更新 `index.ts`，删除旧的 `Job` 接口和 `jobs` Map**

删除 `index.ts` 中：
- `type JobStatus = ...`
- `interface Job { ... }`
- `const jobs = new Map<string, Job>()`

顶部 imports 加入：
```typescript
import { jobStore, type Job } from './job-store.js'
```

在 `index.ts` 中所有 `jobs.set(jobId, job)` 改为 `jobStore.add(job)` 等，按下面的映射替换：

| 旧 | 新 |
|----|----|
| `jobs.set(jobId, job)` | `jobStore.add(job)` |
| `jobs.get(jobId)` | `jobStore.get(jobId)` |
| `jobs.size` | `jobStore.size()` |
| `jobs.values()` | `jobStore.values()` |
| `job._draftResolve = resolve` | `jobStore.setDraftResolve(job.id, resolve)` |
| `job._draftResolve(draft)` | `jobStore.resolveDraft(job.id, draft)` |
| `job._draftResolve = null` | `jobStore.setDraftResolve(job.id, null)` |
| `!job.draft \|\| !job._draftResolve` | `!job.draft \|\| !jobStore.hasPendingDraft(job.id)` |
| `job._orchestrator = orc` | `jobStore.setOrchestrator(job.id, orc)` |
| `job._orchestrator.resume(...)` | `jobStore.getOrchestrator(job.id)?.resume(...)` |
| `job._orchestrator = null` | `jobStore.setOrchestrator(job.id, null)` |

同时删除 `Job` 接口中的 `_draftResolve` 和 `_orchestrator` 字段，因为现在由 `JobStore` 管理。

- [ ] **Step 3: 修复 `/jobs/project/:projectId` 路由里的 destructuring**

原来的：
```typescript
const { _draftResolve: _r, _orchestrator: _o, reviewHtml: _h, ...safe } = latest
```
改为（`Job` 已无这两个字段）：
```typescript
const { reviewHtml: _h, ...safe } = latest
```

- [ ] **Step 4: 验证编译**

```bash
cd /Users/cookie/project/forge/apps/agent && npx tsc --noEmit 2>&1 | head -40
```
预期：0 个错误。

- [ ] **Step 5: Commit**

```bash
cd /Users/cookie/project/forge
git add apps/agent/src/job-store.ts apps/agent/src/index.ts
git commit -m "refactor(agent): extract JobStore, separate Job data from runtime state"
```

---

### Task 4: 提取 `job-runner.ts` + `server.ts`，瘦身 `index.ts`

**Files:**
- Create: `apps/agent/src/job-runner.ts`
- Create: `apps/agent/src/server.ts`
- Modify: `apps/agent/src/index.ts`（最终只剩 server.listen）

- [ ] **Step 1: 创建 `src/job-runner.ts`**

把 `index.ts` 里的 `runJob` 函数整体移入新文件，同时带上它依赖的 imports：

```typescript
import { Orchestrator } from './orchestrator/orchestrator.js'
import type { OrchestratorState, OrchestratorContext } from './orchestrator/state-machine.js'
import { ForgeSandbox } from './sandbox/e2b-client.js'
import { loadNextjsTemplate } from './sandbox/template-loader.js'
import type { ProgressEvent } from './agents/types.js'
import type { DraftSpec } from './agents/pm-agent.js'
import { notifyGoAPI } from './lib/go-api-client.js'
import { jobStore, type Job } from './job-store.js'

export async function runJob(job: Job, userInput: string): Promise<void> {
  jobStore.patch(job.id, { status: 'running', updatedAt: new Date().toISOString() })

  const sandbox = await ForgeSandbox.create()
  const templateFiles = loadNextjsTemplate()
  await sandbox.writeFiles(templateFiles)

  const sandboxAdapter = {
    writeFile: async (path: string, content: string) => {
      if (path === '/home/user/review.html') {
        jobStore.patch(job.id, { reviewHtml: content })
      }
      return sandbox.writeFile(path, content)
    },
    readFile: (path: string) => sandbox.readFile(path),
    run: (cmd: string, opts?: { cwd?: string; timeoutMs?: number }) => sandbox.run(cmd, opts),
    startBackground: (cmd: string, opts?: { cwd?: string }) => sandbox.startBackground(cmd, opts),
    getPreviewUrl: (port: number) => sandbox.getPreviewUrl(port),
  }

  const orc = new Orchestrator(job.projectId, userInput, {
    sandbox: sandboxAdapter,

    onStateChange: async (state: OrchestratorState, ctx: OrchestratorContext) => {
      jobStore.patch(job.id, {
        status: state,
        ...(ctx.reviewUrl ? { reviewUrl: ctx.reviewUrl } : {}),
        ...(state === 'waiting' && ctx.pendingUserInput ? { waitingReason: ctx.pendingUserInput } : {}),
        updatedAt: new Date().toISOString(),
      })
      const current = jobStore.get(job.id)!
      if (current.taskId) {
        const extras =
          state === 'done'
            ? { previewUrl: current.previewUrl ?? undefined }
            : state === 'aborted'
              ? { errorMsg: current.error ?? undefined }
              : undefined
        notifyGoAPI(current.taskId, state, extras).catch((err: unknown) => {
          console.error('[onStateChange] notifyGoAPI failed:', err)
        })
      }
    },

    onDraftReady: (draft: DraftSpec): Promise<DraftSpec> => {
      jobStore.patch(job.id, { draft, updatedAt: new Date().toISOString() })
      return new Promise<DraftSpec>((resolve) => {
        jobStore.setDraftResolve(job.id, resolve)
      })
    },

    onEvent: (event: ProgressEvent) => {
      const current = jobStore.get(job.id)!
      current.events.push(event)
      jobStore.patch(job.id, { updatedAt: new Date().toISOString() })
    },
  })

  jobStore.setOrchestrator(job.id, orc)

  const result = await orc.run()

  jobStore.patch(job.id, {
    previewUrl: result.previewUrl,
    status: result.state,
    updatedAt: new Date().toISOString(),
  })
  jobStore.setOrchestrator(job.id, null)

  if (result.state === 'done') {
    await sandbox.keepAlive(30 * 60 * 1000)
  } else {
    await sandbox.kill()
  }
}
```

- [ ] **Step 2: 创建 `src/server.ts`**

把 `index.ts` 里所有 handler 函数（`readBody`, `send`, `sendError`, `statusCodeToName`, `handleRun`, `handleStatus`, `handleResume`, `handleConfirmDraft`）和 `createServer` 调用整体移入 `server.ts`，`server.ts` export `server`：

```typescript
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { randomUUID } from 'node:crypto'
import type { OrchestratorState } from './orchestrator/state-machine.js'
import type { DraftSpec } from './agents/pm-agent.js'
import { jobStore, type Job } from './job-store.js'
import { runJob } from './job-runner.js'

// ... 所有 helper 函数 ...
// ... 所有 handle* 函数 ...
// ... createServer 调用 ...

export { server }
```

- [ ] **Step 3: 将 `index.ts` 瘦身到只剩 server.listen**

最终的 `index.ts`：

```typescript
// Load .env in development (Node.js 21+ built-in, no dotenv needed)
if (process.env['NODE_ENV'] !== 'production') {
  const { loadEnvFile } = await import('node:process')
  try { (loadEnvFile as (path?: string) => void)() } catch { /* no .env file */ }
}

import { server } from './server.js'

const PORT = process.env.PORT ?? '3001'
server.listen(PORT, () => {
  console.log(`forge agent service listening on :${PORT}`)
})
```

注意：`.env` 加载逻辑必须保持在顶层（index.ts），因为 server.ts 里的 env var 读取依赖它先执行。

- [ ] **Step 4: 验证编译**

```bash
cd /Users/cookie/project/forge/apps/agent && npx tsc --noEmit 2>&1 | head -40
```
预期：0 个错误。

- [ ] **Step 5: 运行现有测试**

```bash
cd /Users/cookie/project/forge/apps/agent && npm test 2>&1 | tail -30
```
预期：所有已有测试通过。

- [ ] **Step 6: Commit**

```bash
cd /Users/cookie/project/forge
git add apps/agent/src/job-runner.ts apps/agent/src/server.ts apps/agent/src/index.ts
git commit -m "refactor(agent): split index.ts into job-runner, server, thin index"
```
