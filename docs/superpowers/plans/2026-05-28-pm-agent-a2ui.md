# PM Agent A2UI — Interactive Review HTML Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** PM Agent 在生成 DraftSpec 后，额外输出一个自包含 HTML 文件，用户在浏览器里完成 feature 勾选和澄清问题作答，点击确认后将结构化结果 POST 回 `/confirm-draft/:jobId`。

**Architecture:** PM Agent `draft()` 完成后新增一步 `renderReviewHTML(draft, jobId)`，把 DraftSpec 注入固定 HTML 模板，写入 E2B 沙盒的 `/home/user/review.html`，并通过沙盒的公网 URL（port 3000）暴露给前端。`index.ts` 的 `Job` 结构新增 `reviewUrl` 字段，`GET /status/:jobId` 一并返回。`ClarifyingQuestion` 类型扩展为带候选选项的结构，LLM prompt 同步更新。

**Tech Stack:** TypeScript, Vercel AI SDK (`generateObject`), Zod, E2B sandbox, 原生 HTML + Tailwind CDN（无构建步骤）

---

## File Map

| 文件 | 变更类型 | 职责 |
|------|---------|------|
| `src/agents/pm-agent.ts` | Modify | 扩展 `ClarifyingQuestion` 类型；更新 LLM schema 生成带选项的问题；新增 `renderReviewHTML()` 方法 |
| `src/templates/pm-review.html` | Create | 静态 HTML 模板，`__DRAFT_JSON__` 占位符注入数据 |
| `src/orchestrator/orchestrator.ts` | Modify | `stepAnalyze()` 中调用 `renderReviewHTML`，把 HTML 写入沙盒并存 reviewUrl |
| `src/index.ts` | Modify | `Job` 新增 `reviewUrl` 字段；`GET /status` 返回该字段 |
| `src/agents/pm-agent.test.ts` | Modify | 新增 `ClarifyingQuestion` 结构测试；新增 `renderReviewHTML` 单元测试 |

---

## Task 1: 扩展 `ClarifyingQuestion` 类型 + 更新 LLM Schema

**Files:**
- Modify: `src/agents/pm-agent.ts`
- Modify: `src/agents/pm-agent.test.ts`

### 背景

现在 `DraftSpec.clarifying_questions` 是 `string[]`，只有问题文本，没有选项。需要改成结构化类型让 LLM 同时生成候选答案。

- [ ] **Step 1: 写失败测试**

在 `src/agents/pm-agent.test.ts` 中添加：

```typescript
import { describe, it, expect } from 'vitest'
import type { ClarifyingQuestion, DraftSpec } from './pm-agent.js'

describe('ClarifyingQuestion type', () => {
  it('has required fields', () => {
    const q: ClarifyingQuestion = {
      id: 'Q001',
      question: '用户是否需要团队协作功能？',
      type: 'single',
      options: ['是，多用户共享数据', '否，单用户即可'],
      required: true,
    }
    expect(q.id).toBe('Q001')
    expect(q.options).toHaveLength(2)
    expect(q.type).toBe('single')
  })

  it('text type has no options', () => {
    const q: ClarifyingQuestion = {
      id: 'Q002',
      question: '请描述你的目标用户群体',
      type: 'text',
      required: false,
    }
    expect(q.options).toBeUndefined()
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd apps/agent && npx vitest run src/agents/pm-agent.test.ts
```

Expected: FAIL — `ClarifyingQuestion` not exported

- [ ] **Step 3: 在 `pm-agent.ts` 中添加类型和更新 LLM schema**

在 `DraftSpec` 接口定义前添加：

```typescript
export interface ClarifyingQuestion {
  id: string
  question: string
  type: 'single' | 'multiple' | 'text'
  options?: string[]   // 仅 single/multiple 有值
  required: boolean
}
```

把 `DraftSpec` 中的 `clarifying_questions: string[]` 改为：

```typescript
clarifying_questions: ClarifyingQuestion[]
```

更新 `LLMDraftSchema` 中的 `clarifying_questions` 字段：

```typescript
clarifying_questions: z.array(
  z.object({
    id: z.string(),
    question: z.string(),
    type: z.enum(['single', 'multiple', 'text']),
    options: z.array(z.string()).optional(),
    required: z.boolean(),
  })
).optional().default([]),
```

更新 `draft()` 方法中构造 `DraftSpec` 的部分（`clarifying_questions` 字段直接透传，不需要额外转换）：

```typescript
const draft: DraftSpec = {
  // ... 其他字段不变 ...
  clarifying_questions: object.clarifying_questions as ClarifyingQuestion[],
  // ...
}
```

更新 `SYSTEM_PROMPT` 中关于 clarifying_questions 的说明段落，替换为：

```
4. For clarifying_questions: only ask genuine architectural blockers.
   For each question, also generate 2-4 concrete options the user can pick.
   Use type="single" for mutually exclusive choices, type="multiple" for
   "check all that apply", type="text" only when free input is truly needed.
   Mark required=true only if the answer changes core architecture.
   Example:
   {
     id: "Q001",
     question: "Do users need to collaborate in real-time?",
     type: "single",
     options: ["Yes, multiple users edit simultaneously", "No, single-user only"],
     required: true
   }
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd apps/agent && npx vitest run src/agents/pm-agent.test.ts
```

Expected: PASS

- [ ] **Step 5: TypeScript 检查**

```bash
cd apps/agent && npx tsc --noEmit
```

Expected: 0 errors（注意 `finalize()` 中有 `clarifying_questions` 相关代码需要同步更新，见下）

- [ ] **Step 6: 修复 `finalize()` 方法中的类型引用**

`finalize()` 目前把 `clarifying_questions` 当 `string[]` 处理，需要更新为新类型。找到 `finalize()` 中的这段：

```typescript
clarifying_questions: userSupplementInput
  ? [`User supplement: ${userSupplementInput}`]
  : undefined,
```

替换为：

```typescript
clarifying_questions: userSupplementInput
  ? [{ id: 'Q_SUPPLEMENT', question: `User supplement: ${userSupplementInput}`, type: 'text' as const, required: false }]
  : undefined,
```

注意：`spec.json` 的 `Spec` 类型中 `clarifying_questions` 是 `string[]`（在 `contracts/spec.ts` 的 Zod schema），需要把 question 文本展开：

```typescript
clarifying_questions: userSupplementInput
  ? [`User supplement: ${userSupplementInput}`]
  : undefined,
```

这里保持不变（`Spec` 合约不动），`DraftSpec` 和 `Spec` 的 `clarifying_questions` 类型不同是有意为之：前者给前端展示，后者给后续 agent 用。

- [ ] **Step 7: 再次运行 tsc 确认 0 错误**

```bash
cd apps/agent && npx tsc --noEmit
```

- [ ] **Step 8: Commit**

```bash
git add apps/agent/src/agents/pm-agent.ts apps/agent/src/agents/pm-agent.test.ts
git commit -m "feat(pm-agent): extend ClarifyingQuestion with type and options"
```

---

## Task 2: 创建 HTML 模板文件

**Files:**
- Create: `apps/agent/src/templates/pm-review.html`

### 背景

这是一个自包含 HTML，通过 Tailwind CDN 渲染，不需要构建。数据通过 `__DRAFT_JSON__` 占位符注入（JSON.stringify 后替换），内嵌 JS 负责渲染和提交。

- [ ] **Step 1: 创建模板目录和文件**

```bash
mkdir -p apps/agent/src/templates
```

创建 `apps/agent/src/templates/pm-review.html`：

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>需求确认 — Forge</title>
  <script src="https://cdn.tailwindcss.com"></script>
</head>
<body class="bg-gray-50 min-h-screen font-sans">

<div class="max-w-3xl mx-auto py-10 px-4">

  <!-- Header -->
  <div class="mb-8">
    <div class="text-xs font-semibold text-indigo-600 uppercase tracking-widest mb-1">
      Forge · 需求放大
    </div>
    <h1 id="app-title" class="text-3xl font-bold text-gray-900"></h1>
    <p id="app-desc" class="mt-2 text-gray-500 text-sm leading-relaxed"></p>
    <div class="mt-3 flex gap-2 flex-wrap">
      <span id="domain-badge"
        class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-indigo-100 text-indigo-800">
      </span>
    </div>
  </div>

  <!-- Constraints -->
  <div id="constraints-section" class="mb-8 p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
    <h2 class="text-sm font-semibold text-gray-700 mb-3">基础能力需求</h2>
    <div id="constraints-grid" class="grid grid-cols-2 gap-2 sm:grid-cols-3"></div>
  </div>

  <!-- Features -->
  <div class="mb-8">
    <h2 class="text-lg font-semibold text-gray-800 mb-1">功能清单</h2>
    <p class="text-xs text-gray-400 mb-4">高置信度功能已自动勾选，你可以调整</p>
    <div id="features-list" class="space-y-3"></div>
  </div>

  <!-- Clarifying Questions -->
  <div id="questions-section" class="mb-10 hidden">
    <h2 class="text-lg font-semibold text-gray-800 mb-1">需要澄清的问题</h2>
    <p class="text-xs text-gray-400 mb-4">这些问题会影响技术架构，请确认</p>
    <div id="questions-list" class="space-y-5"></div>
  </div>

  <!-- Submit -->
  <button id="confirm-btn"
    class="w-full py-3 px-6 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-xl
           transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed">
    确认需求，开始构建
  </button>
  <p id="status-msg" class="mt-3 text-center text-sm text-gray-400 hidden"></p>

</div>

<script>
// ── 数据注入 ──────────────────────────────────────────────────────
const DRAFT = __DRAFT_JSON__
const JOB_ID = '__JOB_ID__'
const CONFIRM_URL = '__CONFIRM_URL__'

// ── 置信度样式 ────────────────────────────────────────────────────
const CONFIDENCE_STYLE = {
  high:   { bg: 'bg-green-50 border-green-200',  badge: 'bg-green-100 text-green-700',  label: '高' },
  medium: { bg: 'bg-yellow-50 border-yellow-200', badge: 'bg-yellow-100 text-yellow-700', label: '中' },
  low:    { bg: 'bg-gray-50 border-gray-200',    badge: 'bg-gray-100 text-gray-500',   label: '低' },
}

// ── 渲染 ──────────────────────────────────────────────────────────
function render() {
  document.getElementById('app-title').textContent = DRAFT.title
  document.getElementById('app-desc').textContent = DRAFT.description
  document.getElementById('domain-badge').textContent = DRAFT.business_domain

  renderConstraints()
  renderFeatures()
  renderQuestions()
}

function renderConstraints() {
  const labels = {
    auth: '用户认证', database: '数据持久化', file_upload: '文件上传',
    email: '邮件发送', payments: '支付功能',
  }
  const grid = document.getElementById('constraints-grid')
  grid.innerHTML = Object.entries(DRAFT.constraints).map(([k, v]) => `
    <div class="flex items-center gap-2 text-sm ${v ? 'text-gray-800' : 'text-gray-300'}">
      <span>${v ? '✓' : '✗'}</span>
      <span>${labels[k] || k}</span>
    </div>
  `).join('')
}

function renderFeatures() {
  const list = document.getElementById('features-list')
  list.innerHTML = DRAFT.features.map((f, i) => {
    const style = CONFIDENCE_STYLE[f.confidence] || CONFIDENCE_STYLE.low
    return `
    <div class="p-4 bg-white rounded-xl border ${style.bg} shadow-sm">
      <div class="flex items-start gap-3">
        <input type="checkbox" id="feat-${i}" data-index="${i}"
          class="mt-1 h-4 w-4 rounded text-indigo-600 border-gray-300 cursor-pointer"
          ${f.selected ? 'checked' : ''} />
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2 flex-wrap">
            <label for="feat-${i}" class="font-medium text-gray-900 cursor-pointer">${f.name}</label>
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${style.badge}">
              置信度：${style.label}
            </span>
          </div>
          <ul class="mt-2 space-y-1">
            ${f.acceptance_criteria.map(c => `
              <li class="text-xs text-gray-500 flex gap-1.5">
                <span class="text-gray-300 flex-shrink-0">→</span>
                <span>${c}</span>
              </li>
            `).join('')}
          </ul>
          ${f.out_of_scope && f.out_of_scope.length > 0 ? `
          <div class="mt-2 text-xs text-gray-400">
            <span class="font-medium">不含：</span>${f.out_of_scope.join('、')}
          </div>` : ''}
        </div>
      </div>
    </div>`
  }).join('')
}

function renderQuestions() {
  const qs = DRAFT.clarifying_questions || []
  if (qs.length === 0) return
  document.getElementById('questions-section').classList.remove('hidden')
  const list = document.getElementById('questions-list')
  list.innerHTML = qs.map((q, qi) => {
    if (q.type === 'text') {
      return `
      <div class="p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
        <label class="block text-sm font-medium text-gray-800 mb-2">
          ${q.required ? '<span class="text-red-500 mr-1">*</span>' : ''}${q.question}
        </label>
        <textarea data-qid="${q.id}" rows="2"
          class="w-full text-sm border border-gray-200 rounded-lg px-3 py-2 resize-none
                 focus:outline-none focus:ring-2 focus:ring-indigo-300"
          placeholder="请输入..."></textarea>
      </div>`
    }
    const isMultiple = q.type === 'multiple'
    return `
    <div class="p-4 bg-white rounded-xl border border-gray-200 shadow-sm">
      <p class="text-sm font-medium text-gray-800 mb-3">
        ${q.required ? '<span class="text-red-500 mr-1">*</span>' : ''}${q.question}
      </p>
      <div class="space-y-2">
        ${(q.options || []).map((opt, oi) => `
          <label class="flex items-start gap-3 cursor-pointer group">
            <input type="${isMultiple ? 'checkbox' : 'radio'}"
              name="q-${qi}" value="${opt}"
              data-qid="${q.id}"
              class="mt-0.5 h-4 w-4 text-indigo-600 border-gray-300 cursor-pointer" />
            <span class="text-sm text-gray-700 group-hover:text-gray-900">${opt}</span>
          </label>
        `).join('')}
      </div>
    </div>`
  }).join('')
}

// ── 收集结果 ──────────────────────────────────────────────────────
function collectResult() {
  // Features
  const features = DRAFT.features.map((f, i) => ({
    ...f,
    selected: document.getElementById('feat-' + i)?.checked ?? f.selected,
  }))

  // Questions
  const answers = {}
  const qs = DRAFT.clarifying_questions || []
  qs.forEach(q => {
    if (q.type === 'text') {
      const el = document.querySelector(`textarea[data-qid="${q.id}"]`)
      answers[q.id] = el ? el.value.trim() : ''
    } else if (q.type === 'multiple') {
      const checked = [...document.querySelectorAll(`input[data-qid="${q.id}"]:checked`)]
      answers[q.id] = checked.map(el => el.value)
    } else {
      const checked = document.querySelector(`input[data-qid="${q.id}"]:checked`)
      answers[q.id] = checked ? checked.value : ''
    }
  })

  return { ...DRAFT, features, clarifying_answers: answers }
}

// ── 提交 ──────────────────────────────────────────────────────────
document.getElementById('confirm-btn').addEventListener('click', async () => {
  const btn = document.getElementById('confirm-btn')
  const msg = document.getElementById('status-msg')
  btn.disabled = true
  btn.textContent = '提交中...'
  msg.classList.remove('hidden')
  msg.textContent = '正在提交需求确认...'

  try {
    const draft = collectResult()
    const resp = await fetch(CONFIRM_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ draft }),
    })
    if (!resp.ok) throw new Error(`HTTP ${resp.status}`)
    msg.textContent = '✓ 已确认！正在启动构建...'
    btn.textContent = '已确认，构建中...'
    btn.classList.replace('bg-indigo-600', 'bg-green-600')
  } catch (err) {
    msg.textContent = '提交失败，请重试'
    btn.disabled = false
    btn.textContent = '确认需求，开始构建'
  }
})

render()
</script>

</body>
</html>
```

- [ ] **Step 2: Verify HTML 结构正常**

在浏览器直接打开文件（本地），确认页面有标题区域、功能清单区域、按钮渲染正常（数据还是占位符，不影响结构检查）。

- [ ] **Step 3: Commit**

```bash
git add apps/agent/src/templates/pm-review.html
git commit -m "feat(pm-agent): add pm-review.html template for A2UI"
```

---

## Task 3: PM Agent 新增 `renderReviewHTML()` 方法

**Files:**
- Modify: `apps/agent/src/agents/pm-agent.ts`
- Modify: `apps/agent/src/agents/pm-agent.test.ts`

### 背景

`renderReviewHTML(draft, jobId, confirmUrl)` 读取模板文件，替换三个占位符，返回 HTML 字符串。不依赖沙盒，纯字符串操作，方便单元测试。

- [ ] **Step 1: 写失败测试**

在 `pm-agent.test.ts` 中添加：

```typescript
import { PMAgent } from './pm-agent.js'

describe('renderReviewHTML', () => {
  const agent = new PMAgent()

  const mockDraft: DraftSpec = {
    title: 'Task Manager',
    description: 'A simple task management app',
    business_domain: 'project-management',
    features: [
      {
        id: 'F001',
        name: 'Create Task',
        confidence: 'high',
        acceptance_criteria: ['User can create a task with title'],
        out_of_scope: [],
        selected: true,
      },
    ],
    constraints: {
      auth: true, database: true, file_upload: false, email: false, payments: false,
    },
    clarifying_questions: [
      {
        id: 'Q001',
        question: 'Do users need team collaboration?',
        type: 'single',
        options: ['Yes', 'No'],
        required: true,
      },
    ],
  }

  it('injects DRAFT_JSON into template', () => {
    const html = agent.renderReviewHTML(mockDraft, 'job-123', 'http://localhost:3001/confirm-draft/job-123')
    expect(html).toContain('"title":"Task Manager"')
    expect(html).toContain('job-123')
    expect(html).not.toContain('__DRAFT_JSON__')
    expect(html).not.toContain('__JOB_ID__')
    expect(html).not.toContain('__CONFIRM_URL__')
  })

  it('returns valid HTML string', () => {
    const html = agent.renderReviewHTML(mockDraft, 'job-abc', 'http://x/confirm-draft/job-abc')
    expect(html).toContain('<!DOCTYPE html>')
    expect(html).toContain('</html>')
  })
})
```

- [ ] **Step 2: 运行测试确认失败**

```bash
cd apps/agent && npx vitest run src/agents/pm-agent.test.ts
```

Expected: FAIL — `renderReviewHTML` not a function

- [ ] **Step 3: 实现 `renderReviewHTML()`**

在 `pm-agent.ts` 顶部添加 import：

```typescript
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { join, dirname } from 'node:path'
```

在 `PMAgent` 类中添加方法（放在 `finalize()` 之后）：

```typescript
/**
 * Render the A2UI review HTML by injecting DraftSpec into the template.
 * Returns the complete HTML string — caller writes it to sandbox or disk.
 */
renderReviewHTML(draft: DraftSpec, jobId: string, confirmUrl: string): string {
  const __dirname = dirname(fileURLToPath(import.meta.url))
  const templatePath = join(__dirname, '../templates/pm-review.html')
  let html = readFileSync(templatePath, 'utf-8')

  html = html.replace('__DRAFT_JSON__', JSON.stringify(draft))
  html = html.replace('__JOB_ID__', jobId)
  html = html.replace('__CONFIRM_URL__', confirmUrl)

  return html
}
```

- [ ] **Step 4: 运行测试确认通过**

```bash
cd apps/agent && npx vitest run src/agents/pm-agent.test.ts
```

Expected: PASS (all tests)

- [ ] **Step 5: tsc 检查**

```bash
cd apps/agent && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 6: Commit**

```bash
git add apps/agent/src/agents/pm-agent.ts apps/agent/src/agents/pm-agent.test.ts
git commit -m "feat(pm-agent): add renderReviewHTML() for A2UI output"
```

---

## Task 4: Orchestrator 集成 — 生成 HTML 并写入沙盒

**Files:**
- Modify: `apps/agent/src/orchestrator/orchestrator.ts`

### 背景

在 `stepAnalyze()` 中，PM Agent `draft()` 返回后、调用 `onDraftReady` 之前，先把 HTML 写入沙盒 `/home/user/review.html`，同时把 previewUrl（port 3000）存入 context，供 `index.ts` 读取并返回给前端。

- [ ] **Step 1: 在 `OrchestratorContext` 里加 `reviewUrl` 字段**

打开 `src/orchestrator/state-machine.ts`，在 `OrchestratorContext` interface 中添加：

```typescript
reviewUrl: string | null    // set after PM Agent generates review HTML
```

在 `createContext()` 工厂函数中添加初始值：

```typescript
reviewUrl: null,
```

- [ ] **Step 2: 更新 `stepAnalyze()` — 写入 HTML 到沙盒**

在 `orchestrator.ts` 的 `stepAnalyze()` 方法中，找到：

```typescript
// Pause here — let the user review and confirm the draft
const confirmedDraft = await this.deps.onDraftReady(draft)
```

在这行**之前**插入：

```typescript
// Generate A2UI review HTML and write to sandbox
const confirmUrl = `${process.env.AGENT_BASE_URL ?? 'http://localhost:3001'}/confirm-draft/${this.ctx.projectId}`
const reviewHtml = this.pm.renderReviewHTML(draft, this.ctx.projectId, confirmUrl)
await this.writeSandboxFile('/home/user/review.html', reviewHtml)
this.ctx.reviewUrl = this.deps.sandbox.getPreviewUrl(3000) + '/review.html'
await this.deps.onStateChange(this.ctx.state, this.ctx)
```

注意：E2B sandbox 的 `getPreviewUrl(3000)` 返回 `https://<sandbox-id>-3000.e2b.dev`，Next.js dev server 在 3000 端口。静态 HTML 通过 Next.js 的 `public/` 目录服务，或直接通过沙盒文件服务器访问（需确认 E2B 支持方式）。

**备注：** 如果 E2B 不直接服务静态文件，可改为将 HTML 内容通过 `GET /review/:jobId` 路由在 Agent Service 本身返回（Task 5 中实现）。

- [ ] **Step 3: 更新 `RunResult` 包含 `reviewUrl`**

在 `orchestrator.ts` 中找到 `RunResult` interface，添加：

```typescript
reviewUrl: string | null
```

在 `run()` 方法的 return 语句中添加：

```typescript
return {
  state: this.ctx.state,
  previewUrl: this.ctx.previewUrl,
  reviewUrl: this.ctx.reviewUrl,    // 新增
  spec: this.spec,
  validationReport: this.lastReport,
}
```

- [ ] **Step 4: tsc 检查**

```bash
cd apps/agent && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 5: Commit**

```bash
git add apps/agent/src/orchestrator/orchestrator.ts apps/agent/src/orchestrator/state-machine.ts
git commit -m "feat(orchestrator): write A2UI review HTML to sandbox in stepAnalyze"
```

---

## Task 5: index.ts — 新增 `reviewUrl` 字段 + `GET /review/:jobId` 路由

**Files:**
- Modify: `apps/agent/src/index.ts`

### 背景

`Job` 结构增加 `reviewUrl`，`GET /status` 返回该字段，前端轮询 status 时即可拿到 review 页面链接。同时新增 `GET /review/:jobId` 路由直接返回 HTML 内容（避免 E2B 静态文件服务不稳定的问题），将 HTML 存储在 Job 对象中。

- [ ] **Step 1: 更新 `Job` interface**

找到 `index.ts` 中的 `Job` interface，添加两个字段：

```typescript
reviewUrl: string | null
reviewHtml: string | null    // raw HTML, served via GET /review/:jobId
```

- [ ] **Step 2: 初始化新字段**

在 `handleRun` 中创建 `job` 对象时添加：

```typescript
reviewUrl: null,
reviewHtml: null,
```

- [ ] **Step 3: 在 `runJob()` 中保存 reviewHtml**

`onDraftReady` 回调触发前，HTML 已经由 Orchestrator 写入沙盒。我们需要把 HTML 也保存在 Job 里供 `/review/:jobId` 路由返回。

在 `runJob()` 中，`const orc = new Orchestrator(...)` 的 deps 里更新 `onDraftReady`：

```typescript
onDraftReady: (draft: DraftSpec): Promise<DraftSpec> => {
  job.draft = draft
  // Store reviewUrl from orchestrator context
  job.reviewUrl = orc ? orc.getContext().reviewUrl : null
  job.updatedAt = new Date().toISOString()
  return new Promise<DraftSpec>((resolve) => {
    job._draftResolve = resolve
  })
},
```

注意 `orc` 此时还未赋值（先定义后赋值），改用 `onStateChange` 同步 reviewUrl：

在 `onStateChange` callback 中添加：

```typescript
onStateChange: async (state: OrchestratorState, ctx: OrchestratorContext) => {
  job.status = state
  if (ctx.reviewUrl) job.reviewUrl = ctx.reviewUrl    // 新增
  job.updatedAt = new Date().toISOString()
},
```

- [ ] **Step 4: 新增 `GET /review/:jobId` 路由**

在 HTTP router 的 `sendError(res, 404, 'not found')` 之前插入：

```typescript
// GET /review/:jobId — serve the A2UI review HTML
const reviewMatch = url.match(/^\/review\/([^/]+)$/)
if (method === 'GET' && reviewMatch) {
  const job = jobs.get(reviewMatch[1]!)
  if (!job) return sendError(res, 404, `job ${reviewMatch[1]} not found`)
  if (!job.reviewHtml) return sendError(res, 404, 'review HTML not ready yet')
  res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
  res.end(job.reviewHtml)
  return
}
```

同时在 `runJob()` 的 `onDraftReady` 之前，通过 Orchestrator 拦截 HTML 写入。最简单的方式：在 `sandboxAdapter.writeFile` 中检测路径并缓存：

```typescript
const sandboxAdapter = {
  writeFile: async (path: string, content: string) => {
    if (path === '/home/user/review.html') {
      job.reviewHtml = content          // cache for GET /review/:jobId
    }
    return sandbox.writeFile(path, content)
  },
  // ...其他字段不变
}
```

- [ ] **Step 5: 更新 `handleStatus` 的 safe-copy 保留 reviewUrl**

`handleStatus` 里用了 spread 去掉私有字段：

```typescript
const { _draftResolve: _r, _orchestrator: _o, reviewHtml: _h, ...safe } = job
```

加上 `reviewHtml: _h` 去掉原始 HTML（太大），但保留 `reviewUrl`。

- [ ] **Step 6: tsc 检查**

```bash
cd apps/agent && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 7: Commit**

```bash
git add apps/agent/src/index.ts
git commit -m "feat(index): expose reviewUrl in status + GET /review/:jobId route"
```

---

## Task 6: 端到端冒烟测试

**Files:**
- Modify: `apps/agent/src/orchestrator/orchestrator.test.ts`（如已存在）或新建

### 背景

用 mock sandbox 验证完整流程：PM Agent draft → HTML 写入 sandbox → reviewUrl 设置。不需要真实 E2B 或真实 LLM（vitest mock）。

- [ ] **Step 1: 写测试**

在 `orchestrator.test.ts` 中添加：

```typescript
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { Orchestrator } from './orchestrator.js'
import type { SandboxInterface } from './orchestrator.js'

// Mock AI SDK
vi.mock('ai', () => ({
  generateObject: vi.fn().mockResolvedValue({
    object: {
      title: 'Test App',
      description: 'A test app',
      business_domain: 'test',
      features: [{ id: 'F001', name: 'Feature 1', confidence: 'high', acceptance_criteria: ['AC1'], out_of_scope: [] }],
      constraints: { auth: false, database: false, file_upload: false, email: false, payments: false },
      clarifying_questions: [],
    },
  }),
  generateText: vi.fn().mockResolvedValue({ text: '', steps: [] }),
}))

vi.mock('@ai-sdk/anthropic', () => ({
  anthropic: vi.fn(() => 'mock-model'),
}))

describe('Orchestrator A2UI integration', () => {
  let writtenFiles: Record<string, string> = {}
  let sandbox: SandboxInterface

  beforeEach(() => {
    writtenFiles = {}
    sandbox = {
      writeFile: vi.fn(async (path, content) => { writtenFiles[path] = content }),
      readFile: vi.fn(async (path) => writtenFiles[path] ?? ''),
      run: vi.fn(async () => ({ stdout: '', stderr: '', exitCode: 0 })),
      startBackground: vi.fn(async () => {}),
      getPreviewUrl: vi.fn((port) => `https://mock-sandbox-${port}.e2b.dev`),
      keepAlive: vi.fn(async () => {}),
    }
  })

  it('writes review.html to sandbox after PM Agent draft', async () => {
    let capturedReviewUrl: string | null = null
    const orc = new Orchestrator('proj-1', 'Build a todo app', {
      sandbox,
      maxRetries: 1,
      onStateChange: async (_state, ctx) => {
        if (ctx.reviewUrl) capturedReviewUrl = ctx.reviewUrl
      },
      onDraftReady: async (draft) => draft,  // auto-confirm
      onEvent: vi.fn(),
    })

    // Run only up to analyzing phase by limiting steps
    // We test that review.html was written
    await orc.run().catch(() => {})  // may fail at later phases — that's OK

    expect(writtenFiles['/home/user/review.html']).toBeDefined()
    expect(writtenFiles['/home/user/review.html']).toContain('<!DOCTYPE html>')
    expect(writtenFiles['/home/user/review.html']).toContain('Test App')
    expect(capturedReviewUrl).toContain('review.html')
  })
})
```

- [ ] **Step 2: 运行测试**

```bash
cd apps/agent && npx vitest run src/orchestrator/orchestrator.test.ts
```

Expected: PASS（或合理失败仅在 building 阶段因 mock 不完整）

- [ ] **Step 3: 完整 tsc 检查**

```bash
cd apps/agent && npx tsc --noEmit
```

Expected: 0 errors

- [ ] **Step 4: 运行所有测试**

```bash
cd apps/agent && npx vitest run
```

Expected: 无新增失败

- [ ] **Step 5: Final commit**

```bash
git add apps/agent/src/orchestrator/orchestrator.test.ts
git commit -m "test(orchestrator): add A2UI integration smoke test"
```

---

## Self-Review

### Spec Coverage 检查

| 需求 | 对应 Task |
|------|---------|
| ClarifyingQuestion 带选项 | Task 1 |
| HTML 模板（feature 勾选、澄清问题选择题） | Task 2 |
| PM Agent 生成 HTML | Task 3 |
| HTML 写入沙盒 / reviewUrl 存入 context | Task 4 |
| GET /status 返回 reviewUrl | Task 5 |
| GET /review/:jobId 直接服务 HTML | Task 5 |
| 端到端冒烟测试 | Task 6 |

### Placeholder 扫描

无 TBD / TODO / "similar to above" — 所有代码步骤均有完整实现。

### Type 一致性

- `ClarifyingQuestion` 在 Task 1 定义，Task 2 模板用 JS（无类型约束），Task 3 测试引用，Task 4 透传，一致。
- `reviewUrl` 在 Task 4 加入 `OrchestratorContext`，Task 4/5 读写，一致。
- `reviewHtml` 在 Task 5 加入 `Job`，`handleStatus` 中用 `reviewHtml: _h` 隐藏，一致。
- `sandboxAdapter.writeFile` 拦截路径 `/home/user/review.html` 与 Task 4 写入路径一致。
