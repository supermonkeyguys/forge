# Agent Service 重构计划：通用工作流执行引擎

## 目标
将 Agent Service 从"生成代码的专用 pipeline"改造为
"可执行任意 WorkflowDefinition 的通用引擎"，同时保留代码生成能力作为内置 Capability。

## 原则
- Orchestrator 状态机核心逻辑**不变**
- PM Agent 对话模式**不变**，只改输出格式
- 现有代码生成流程打包成 `CodeCapability`，不删除
- 新增 Capability 抽象层 + Worker Agent

---

## 涉及文件

**新建：**
- `apps/agent/src/capabilities/types.ts` — Capability 接口定义
- `apps/agent/src/capabilities/browser-capability.ts` — 浏览器操作
- `apps/agent/src/capabilities/http-capability.ts` — HTTP 调用
- `apps/agent/src/capabilities/llm-capability.ts` — 纯 LLM 文本处理
- `apps/agent/src/capabilities/notify-capability.ts` — 通知（webhook/log）
- `apps/agent/src/capabilities/code-capability.ts` — 原代码生成流程打包
- `apps/agent/src/capabilities/index.ts` — 统一导出 + 注册表
- `apps/agent/src/agents/worker-agent.ts` — 通用执行 Agent
- `apps/agent/src/contracts/workflow.ts` — WorkflowDefinition schema

**修改：**
- `apps/agent/src/agents/pm-agent.ts` — 增加输出 WorkflowDefinition 的模式
- `apps/agent/src/orchestrator/orchestrator.ts` — 支持 workflow 模式执行
- `apps/agent/src/job-runner.ts` — 根据 jobType 分发到代码生成或 workflow 执行
- `apps/agent/src/server.ts` — `/run` 接受 `workflowDefinition` 参数

**保留不变：**
- `apps/agent/src/orchestrator/state-machine.ts`
- `apps/agent/src/lib/ai-client.ts`
- `apps/agent/src/lib/go-api-client.ts`
- `apps/agent/src/job-store.ts`
- `apps/agent/src/agents/builder/` (所有 builder agents)
- `apps/agent/src/sandbox/` (all sandboxes)

---

## 任务

### Task 1：WorkflowDefinition 合约

**文件：** `apps/agent/src/contracts/workflow.ts`

```typescript
import { z } from 'zod'

export const WorkflowStepSchema = z.object({
  id:           z.string(),
  name:         z.string(),
  capability:   z.enum(['browser', 'http', 'llm', 'notify', 'code', 'file']),
  instructions: z.string().describe('自然语言描述这步要做什么'),
  depends_on:   z.array(z.string()).default([]),
  config:       z.record(z.unknown()).optional(),
})

export const WorkflowDefinitionSchema = z.object({
  steps: z.array(WorkflowStepSchema).min(1),
})

export type WorkflowStep = z.infer<typeof WorkflowStepSchema>
export type WorkflowDefinition = z.infer<typeof WorkflowDefinitionSchema>

// Result of one step execution
export interface StepResult {
  stepId:   string
  status:   'done' | 'failed'
  output:   string   // human-readable summary
  data?:    Record<string, unknown>  // structured output for next steps
  error?:   string
}
```

**验证：** `./node_modules/.bin/tsc --noEmit` 通过

---

### Task 2：Capability 接口和类型

**文件：** `apps/agent/src/capabilities/types.ts`

```typescript
export interface RunContext {
  projectId:  string
  jobId:      string
  stepId:     string
  emit:       (event: { type: string; agent: string; content: string }) => void
  // 上一步的输出，供当前步骤参考
  previousOutputs: Record<string, string>
}

export interface CapabilityResult {
  status:  'done' | 'failed'
  output:  string   // human-readable summary shown in UI
  data?:   Record<string, unknown>
  error?:  string
}

export interface Capability {
  type: string
  execute(
    instructions: string,
    config: Record<string, unknown> | undefined,
    ctx: RunContext,
  ): Promise<CapabilityResult>
}
```

**验证：** `./node_modules/.bin/tsc --noEmit` 通过

---

### Task 3：BrowserCapability

**文件：** `apps/agent/src/capabilities/browser-capability.ts`

将 `apps/agent/src/browser-agent.ts` 中的核心逻辑封装为 Capability：

```typescript
import type { Capability, RunContext, CapabilityResult } from './types.js'

export class BrowserCapability implements Capability {
  readonly type = 'browser'

  async execute(
    instructions: string,
    config: Record<string, unknown> | undefined,
    ctx: RunContext,
  ): Promise<CapabilityResult> {
    // config 期望格式：{ startUrl: string }
    const startUrl = (config?.['startUrl'] as string) ?? 'about:blank'
    ctx.emit({ type: 'agent_thinking', agent: ctx.stepId, content: `打开浏览器：${startUrl}` })

    // 调用 browser-agent.ts 中的 runBrowserAgent 逻辑
    // 返回执行摘要
    try {
      const summary = await runBrowserTask(instructions, startUrl, ctx.emit)
      return { status: 'done', output: summary }
    } catch (err) {
      return { status: 'failed', output: '浏览器操作失败', error: String(err) }
    }
  }
}

// 从 browser-agent.ts 提取的核心函数（内联或 import）
async function runBrowserTask(
  goal: string,
  startUrl: string,
  emit: RunContext['emit'],
): Promise<string> {
  // 直接复用 browser-agent.ts 的 runBrowserAgent 逻辑
  // 返回最终 summary 字符串
  // 完整实现见 browser-agent.ts，此处调用即可
  const { chromium } = await import('playwright')
  // ... 完整复制 browser-agent.ts 的 runBrowserAgent 函数体
  // 并在每个 step 时调用 emit({ type:'agent_thinking', agent: stepId, content: result })
  return 'browser task completed'
}
```

注意：完整实现从 `apps/agent/src/browser-agent.ts` 的 `runBrowserAgent` 函数复制过来，
并将 `console.log` 替换为 `ctx.emit(...)` 调用。

**验证：** `./node_modules/.bin/tsc --noEmit` 通过

---

### Task 4：HTTPCapability

**文件：** `apps/agent/src/capabilities/http-capability.ts`

```typescript
import type { Capability, RunContext, CapabilityResult } from './types.js'

export class HTTPCapability implements Capability {
  readonly type = 'http'

  async execute(
    instructions: string,
    config: Record<string, unknown> | undefined,
    ctx: RunContext,
  ): Promise<CapabilityResult> {
    // LLM 解析 instructions，决定 method/url/headers/body
    const { llmText, anthropic, MODEL } = await import('../lib/ai-client.js')
    const { text } = await llmText({
      model: anthropic(MODEL),
      system: 'You extract HTTP request parameters from instructions. Reply with JSON only: {"method":"GET","url":"...","headers":{},"body":null}',
      prompt: `Config: ${JSON.stringify(config)}\nInstructions: ${instructions}`,
    })

    const params = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}') as {
      method: string; url: string; headers?: Record<string,string>; body?: unknown
    }

    ctx.emit({ type: 'agent_thinking', agent: ctx.stepId, content: `${params.method} ${params.url}` })

    try {
      const res = await fetch(params.url, {
        method: params.method,
        headers: { 'Content-Type': 'application/json', ...params.headers },
        body: params.body ? JSON.stringify(params.body) : undefined,
        signal: AbortSignal.timeout(30_000),
      })
      const responseText = await res.text()
      return {
        status: res.ok ? 'done' : 'failed',
        output: `HTTP ${res.status} ${params.url}`,
        data: { status: res.status, body: responseText.slice(0, 2000) },
        error: res.ok ? undefined : `HTTP ${res.status}`,
      }
    } catch (err) {
      return { status: 'failed', output: 'HTTP 请求失败', error: String(err) }
    }
  }
}
```

**验证：** `./node_modules/.bin/tsc --noEmit` 通过

---

### Task 5：LLMCapability

**文件：** `apps/agent/src/capabilities/llm-capability.ts`

用于纯文本分析、提取、生成类步骤（不操作浏览器，不调用 HTTP）：

```typescript
import type { Capability, RunContext, CapabilityResult } from './types.js'
import { llmText, anthropic, MODEL } from '../lib/ai-client.js'

export class LLMCapability implements Capability {
  readonly type = 'llm'

  async execute(
    instructions: string,
    _config: Record<string, unknown> | undefined,
    ctx: RunContext,
  ): Promise<CapabilityResult> {
    ctx.emit({ type: 'agent_thinking', agent: ctx.stepId, content: '分析中...' })

    const previousContext = Object.entries(ctx.previousOutputs)
      .map(([id, out]) => `Step ${id} output:\n${out}`)
      .join('\n\n')

    const { text } = await llmText({
      model: anthropic(MODEL),
      system: '你是一名专业的数字助理，严格按照指令执行任务，输出简洁清晰的结果。',
      prompt: previousContext
        ? `Previous steps context:\n${previousContext}\n\nTask: ${instructions}`
        : instructions,
    })

    ctx.emit({ type: 'agent_thinking', agent: ctx.stepId, content: text.slice(0, 200) })

    return {
      status: 'done',
      output: text,
      data: { result: text },
    }
  }
}
```

**验证：** `./node_modules/.bin/tsc --noEmit` 通过

---

### Task 6：NotifyCapability

**文件：** `apps/agent/src/capabilities/notify-capability.ts`

支持 webhook 通知和日志记录（邮件/钉钉等后续扩展）：

```typescript
import type { Capability, RunContext, CapabilityResult } from './types.js'

export class NotifyCapability implements Capability {
  readonly type = 'notify'

  async execute(
    instructions: string,
    config: Record<string, unknown> | undefined,
    ctx: RunContext,
  ): Promise<CapabilityResult> {
    const webhookUrl = config?.['webhookUrl'] as string | undefined
    const message = `[Forge Run ${ctx.jobId}] Step ${ctx.stepId}: ${instructions}`

    ctx.emit({ type: 'agent_thinking', agent: ctx.stepId, content: `发送通知：${message}` })

    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: message, stepId: ctx.stepId, jobId: ctx.jobId }),
          signal: AbortSignal.timeout(10_000),
        })
      } catch (err) {
        return { status: 'failed', output: 'Webhook 发送失败', error: String(err) }
      }
    }

    // 总是发一条 go-api 内部通知（利用现有机制）
    console.log(`[notify] ${message}`)

    return { status: 'done', output: `通知已发送：${message}` }
  }
}
```

**验证：** `./node_modules/.bin/tsc --noEmit` 通过

---

### Task 7：CodeCapability（打包现有代码生成流程）

**文件：** `apps/agent/src/capabilities/code-capability.ts`

将现有代码生成 pipeline 包装为一个 Capability：

```typescript
import type { Capability, RunContext, CapabilityResult } from './types.js'

export class CodeCapability implements Capability {
  readonly type = 'code'

  async execute(
    instructions: string,
    config: Record<string, unknown> | undefined,
    ctx: RunContext,
  ): Promise<CapabilityResult> {
    // 这里触发现有的 Orchestrator 代码生成流程
    // config 期望：{ sandboxType: 'mock'|'local'|'e2b' }
    // 目前作为占位实现，后续可深度集成
    ctx.emit({ type: 'agent_thinking', agent: ctx.stepId, content: '启动代码生成流程...' })
    ctx.emit({ type: 'agent_thinking', agent: ctx.stepId, content: `需求：${instructions}` })

    // TODO: 调用现有 job-runner.ts 的 runJob 逻辑
    // 当前返回占位结果
    return {
      status: 'done',
      output: `代码生成任务已启动（需求：${instructions.slice(0, 100)}）`,
    }
  }
}
```

**验证：** `./node_modules/.bin/tsc --noEmit` 通过

---

### Task 8：Capability 注册表

**文件：** `apps/agent/src/capabilities/index.ts`

```typescript
import { BrowserCapability }  from './browser-capability.js'
import { HTTPCapability }     from './http-capability.js'
import { LLMCapability }      from './llm-capability.js'
import { NotifyCapability }   from './notify-capability.js'
import { CodeCapability }     from './code-capability.js'
import type { Capability }    from './types.js'

export type { Capability, RunContext, CapabilityResult } from './types.js'
export { BrowserCapability, HTTPCapability, LLMCapability, NotifyCapability, CodeCapability }

const REGISTRY: Record<string, Capability> = {
  browser: new BrowserCapability(),
  http:    new HTTPCapability(),
  llm:     new LLMCapability(),
  notify:  new NotifyCapability(),
  code:    new CodeCapability(),
}

export function getCapability(type: string): Capability | null {
  return REGISTRY[type] ?? null
}
```

**验证：** `./node_modules/.bin/tsc --noEmit` 通过

---

### Task 9：Worker Agent

**文件：** `apps/agent/src/agents/worker-agent.ts`

Worker Agent 是通用执行者，接收一个 WorkflowStep 并调用对应 Capability：

```typescript
import type { WorkflowStep, StepResult } from '../contracts/workflow.js'
import { getCapability } from '../capabilities/index.js'
import type { RunContext } from '../capabilities/types.js'

export class WorkerAgent {
  async execute(step: WorkflowStep, ctx: RunContext): Promise<StepResult> {
    const capability = getCapability(step.capability)

    if (!capability) {
      return {
        stepId: step.id,
        status: 'failed',
        output: `未知 capability: ${step.capability}`,
        error: `Capability "${step.capability}" not registered`,
      }
    }

    ctx.emit({
      type: 'agent_start',
      agent: step.id,
      content: `[${step.name}] 开始执行（${step.capability}）`,
    })

    try {
      const result = await capability.execute(step.instructions, step.config, ctx)

      ctx.emit({
        type: 'agent_done',
        agent: step.id,
        content: result.output,
      })

      return {
        stepId:  step.id,
        status:  result.status,
        output:  result.output,
        data:    result.data,
        error:   result.error,
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      ctx.emit({ type: 'agent_error', agent: step.id, content: error })
      return { stepId: step.id, status: 'failed', output: '执行失败', error }
    }
  }
}
```

**验证：** `./node_modules/.bin/tsc --noEmit` 通过

---

### Task 10：PM Agent 新增 Workflow 生成模式

**文件：** `apps/agent/src/agents/pm-agent.ts`（追加，不修改现有函数）

在现有 PM Agent 末尾新增导出函数 `generateWorkflowDefinition`：

```typescript
// 追加到 pm-agent.ts 末尾

import type { WorkflowDefinition } from '../contracts/workflow.js'

/**
 * 从用户描述生成 WorkflowDefinition（工作流模式，非代码生成模式）
 */
export async function generateWorkflowDefinition(
  userInput: string,
  clarifications: string[],
): Promise<WorkflowDefinition> {
  const { llmText, anthropic, MODEL } = await import('../lib/ai-client.js')
  const context = clarifications.length > 0
    ? `User clarifications:\n${clarifications.join('\n')}\n\n`
    : ''

  const { text } = await llmText({
    model: anthropic(MODEL),
    system: `You generate workflow definitions as JSON. 
Available capabilities: browser, http, llm, notify, code, file.
Always respond with valid JSON only, no markdown.`,
    prompt: `${context}User request: ${userInput}

Generate a WorkflowDefinition JSON:
{
  "steps": [
    {
      "id": "step_1",
      "name": "步骤名称",
      "capability": "llm|browser|http|notify|code|file",
      "instructions": "详细的自然语言执行指令",
      "depends_on": [],
      "config": {}
    }
  ]
}

Rules:
- Use "browser" for any UI interaction (web forms, navigation, clicking)
- Use "http" for API calls with known endpoints
- Use "llm" for analysis, extraction, summarization  
- Use "notify" for sending results/notifications
- Use "code" only if the goal is to build a software application
- Instructions must be specific enough for an AI to execute without ambiguity`,
  })

  const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{"steps":[]}')
  const { WorkflowDefinitionSchema } = await import('../contracts/workflow.js')
  return WorkflowDefinitionSchema.parse(json)
}
```

**验证：** `./node_modules/.bin/tsc --noEmit` 通过

---

### Task 11：Job Runner 支持 workflow 模式

**文件：** `apps/agent/src/job-runner.ts`（追加新函数）

新增 `runWorkflowJob` 函数，不修改现有 `runJob`：

```typescript
// 追加到 job-runner.ts

import { WorkerAgent } from './agents/worker-agent.js'
import type { WorkflowDefinition, WorkflowStep } from './contracts/workflow.js'
import type { RunContext } from './capabilities/types.js'

export async function runWorkflowJob(
  job: Job,
  workflowDefinition: WorkflowDefinition,
): Promise<void> {
  jobStore.patch(job.id, { status: 'running', updatedAt: new Date().toISOString() })

  const worker = new WorkerAgent()
  const previousOutputs: Record<string, string> = {}

  // 拓扑排序执行步骤（简化：按 depends_on 顺序串行执行）
  const steps = topoSortSteps(workflowDefinition.steps)

  for (const step of steps) {
    const ctx: RunContext = {
      projectId: job.projectId,
      jobId:     job.id,
      stepId:    step.id,
      emit:      (event) => jobStore.pushEvent(job.id, event as any),
      previousOutputs,
    }

    const result = await worker.execute(step, ctx)
    previousOutputs[step.id] = result.output

    if (result.status === 'failed') {
      jobStore.patch(job.id, {
        status:    'aborted',
        error:     result.error ?? result.output,
        updatedAt: new Date().toISOString(),
      })
      if (job.taskId) {
        await notifyGoAPI(job.taskId, 'aborted', { errorMsg: result.error })
      }
      return
    }
  }

  jobStore.patch(job.id, { status: 'done', updatedAt: new Date().toISOString() })
  if (job.taskId) {
    await notifyGoAPI(job.taskId, 'done', {})
  }
}

function topoSortSteps(steps: WorkflowStep[]): WorkflowStep[] {
  const byId = new Map(steps.map(s => [s.id, s]))
  const visited = new Set<string>()
  const result: WorkflowStep[] = []
  function visit(id: string) {
    if (visited.has(id)) return
    visited.add(id)
    const step = byId.get(id)
    if (!step) return
    for (const dep of step.depends_on) visit(dep)
    result.push(step)
  }
  for (const step of steps) visit(step.id)
  return result
}
```

---

### Task 12：Server 支持 workflow 执行端点

**文件：** `apps/agent/src/server.ts`（新增路由）

在现有 `/run` 路由后新增 `/run-workflow`：

```typescript
// POST /run-workflow
// Body: { taskId?, projectId, workflowDefinition: WorkflowDefinition }
if (method === 'POST' && url === '/run-workflow') {
  return void handleRunWorkflow(req, res)
}

async function handleRunWorkflow(req, res) {
  const body = await readBody(req) as Record<string, unknown>
  const { taskId, projectId, workflowDefinition } = body

  if (typeof projectId !== 'string' || !projectId.trim())
    return sendError(res, 400, 'projectId is required')
  if (!workflowDefinition || typeof workflowDefinition !== 'object')
    return sendError(res, 400, 'workflowDefinition is required')

  const { WorkflowDefinitionSchema } = await import('./contracts/workflow.js')
  const parsed = WorkflowDefinitionSchema.safeParse(workflowDefinition)
  if (!parsed.success)
    return sendError(res, 400, parsed.error.message)

  const jobId = randomUUID()
  const now = new Date().toISOString()
  const job: Job = {
    id: jobId,
    taskId: typeof taskId === 'string' ? taskId : null,
    projectId,
    status: 'queued',
    events: [], draft: null, previewUrl: null,
    reviewUrl: null, reviewHtml: null, error: null, waitingReason: null,
    createdAt: now, updatedAt: now,
  }
  jobStore.add(job)

  const { runWorkflowJob } = await import('./job-runner.js')
  runWorkflowJob(job, parsed.data).catch(err => {
    jobStore.patch(jobId, {
      status: 'aborted',
      error: err instanceof Error ? err.message : String(err),
      updatedAt: new Date().toISOString(),
    })
  })

  send(res, 202, { data: { jobId, status: 'queued' } })
}
```

**验证：**
```bash
./node_modules/.bin/tsc --noEmit
curl -X POST http://localhost:3001/run-workflow \
  -H "Content-Type: application/json" \
  -d '{
    "projectId": "test-123",
    "workflowDefinition": {
      "steps": [{
        "id": "step_1",
        "name": "分析需求",
        "capability": "llm",
        "instructions": "分析：用户想做什么？输出：一句话总结",
        "depends_on": []
      }]
    }
  }'
# 期望：202 with jobId
```

---

## 验收标准

```bash
# 1. 编译通过
./node_modules/.bin/tsc --noEmit

# 2. 旧的 /run 接口不变
curl -X POST http://localhost:3001/run \
  -d '{"projectId":"x","userInput":"build a todo app"}'

# 3. 新的 /run-workflow 可用
curl -X POST http://localhost:3001/run-workflow \
  -d '{"projectId":"x","workflowDefinition":{"steps":[{"id":"s1","name":"test","capability":"llm","instructions":"say hello","depends_on":[]}]}}'
# 期望：202，并且 GET /status/:jobId 最终变为 done

# 4. generateWorkflowDefinition 可导入
node --env-file=.env --import tsx/esm -e "
  import { generateWorkflowDefinition } from './src/agents/pm-agent.js'
  const def = await generateWorkflowDefinition('每天自动从邮件提取发票信息', [])
  console.log(JSON.stringify(def, null, 2))
"
```
