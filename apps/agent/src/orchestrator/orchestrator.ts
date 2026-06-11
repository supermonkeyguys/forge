/**
 * Orchestrator — drives the full generation loop.
 *
 * State machine:
 *   idle → analyzing → planning → building → validating → done
 *                                                ↓ fail
 *                                            fixing → validating
 *                                                ↓ retries exhausted
 *                                            waiting ← user input → analyzing
 *
 * Parallelism:
 *   Builder Agents with no mutual dependencies run in parallel batches.
 *   Each batch completes before the next starts.
 *
 * Error routing:
 *   Test Agent reports → routeErrors() → only failed agents re-run.
 *   Same error 3× without progress → escalate to waiting.
 */

import {
  createContext,
  transition,
  isTerminal,
  type OrchestratorContext,
  type OrchestratorEvent,
  type OrchestratorState,
} from './state-machine.js'
import { routeErrors, isSurgicalFix, type FixInstruction } from './error-router.js'
import { PMAgent, type DraftSpec } from '../agents/pm-agent.js'
import { ArchitectAgent } from '../agents/architect-agent.js'
import { SchemaAgent, LogicAgent, ApiAgent, UIAgent, PageAgent } from '../agents/builder/index.js'
import { CustomBuilderAgent, type CustomAgentConfig } from '../agents/builder/custom-agent.js'
import { TestAgent } from '../agents/test-agent.js'
import { parallelBatches } from '../contracts/task-plan.js'
import type { Spec } from '../contracts/spec.js'
import type { TaskPlan, PlanTask, AgentRole } from '../contracts/task-plan.js'
import type { ValidationReport } from '../contracts/validation-report.js'
import type { ProgressEvent, BuilderAgent } from '../agents/types.js'
import { type ProjectContextClient } from '../lib/project-context-client.js'
import { submitKBEntry } from '../lib/project-kb-client.js'
import { llmText, anthropic, MODEL } from '../lib/ai-client.js'

const FORGE_API_URL_SET = !!(process.env['FORGE_API_URL'])

// ── Types ─────────────────────────────────────────────────────────

export interface CompletedStep {
  agent: string
  summary: string
  toolCalls: { tool: string; input: Record<string, unknown> }[]
  durationMs: number
  status: 'done' | 'failed'
}

export interface OrchestratorDeps {
  /** Called on every state transition — used to persist state + push SSE events. */
  onStateChange: (state: OrchestratorState, ctx: OrchestratorContext) => Promise<void>
  /** Called when a draft spec is ready for user review. */
  onDraftReady: (draft: DraftSpec) => Promise<DraftSpec>
  /** Called on each agent progress event. */
  onEvent: (event: ProgressEvent) => void
  /** Inject sandbox adapter for E2B (or mock in tests). */
  sandbox: SandboxInterface
  maxRetries?: number
  /** Optional per-role overrides. Keys are AgentRole strings; values are custom agent configs fetched from DB. */
  agentOverrides?: Record<string, CustomAgentConfig>
  /** When set, context reads/writes go to the Go API instead of the sandbox file. */
  contextClient?: ProjectContextClient
  /** User who owns this job — passed to KB tools. */
  userID?: string
  /** Called after each logical agent step completes (analyze, plan, task, validate). */
  onTaskComplete?: (step: CompletedStep) => void
  /** When true (mock sandbox), skip E2E checks — unit tests still run. */
  skipE2E?: boolean
}

export interface SandboxInterface {
  writeFile(path: string, content: string): Promise<void>
  readFile(path: string): Promise<string>
  run(cmd: string, opts?: { cwd?: string; timeoutMs?: number }): Promise<{ stdout: string; stderr: string; exitCode: number }>
  startBackground(cmd: string, opts?: { cwd?: string }): Promise<void>
  getPreviewUrl(port: number): string
  keepAlive?(timeoutMs: number): Promise<void>
}

export interface RunResult {
  state: OrchestratorState
  previewUrl: string | null
  reviewUrl: string | null
  spec: Spec | null
  validationReport: ValidationReport | null
}

// ── Spawned Task (in-process A2A Task object) ─────────────────────

export interface SpawnedTask {
  id: string
  parentTaskId: string
  depth: number
  role: AgentRole
  file: string
  /** Resolves when the task completes (or rejects on failure). */
  waitForCompletion(): Promise<void>
}

/** Callback injected into Builder agents so they can spawn sub-tasks. */
export type SpawnTaskFn = (params: {
  role: AgentRole
  file: string
  description: string
  parentTaskId: string
  currentDepth: number
}) => SpawnedTask

// ── Helpers ───────────────────────────────────────────────────────

/**
 * Upsert a section in project_context.md.
 * If a ## heading with the same title already exists, replace it.
 * Otherwise append. This prevents duplicate sections across fix loops.
 */
function upsertContextSection(doc: string, section: string): string {
  // Extract the heading from the incoming section (first ## line)
  const headingMatch = section.match(/^(## [^\n]+)/m)
  if (!headingMatch) return doc + section

  const heading = headingMatch[1]!

  // Find the existing section in the doc
  const sectionStart = doc.indexOf(heading)
  if (sectionStart === -1) {
    // Section doesn't exist yet — append
    return doc + '\n' + section
  }

  // Find where the next ## section begins (or end of doc)
  const nextSection = doc.indexOf('\n## ', sectionStart + heading.length)
  const sectionEnd = nextSection === -1 ? doc.length : nextSection

  return doc.slice(0, sectionStart) + section.trimEnd() + '\n' + doc.slice(sectionEnd)
}

/** Strip line numbers and memory addresses so error messages hash stably. */
function normalizeErrorMessage(msg: string): string {
  return msg
    .replace(/:\d+:\d+/g, '')          // file.ts:42:8 → file.ts
    .replace(/\b0x[0-9a-f]+\b/gi, '')  // memory addresses
    .replace(/\s+/g, ' ')
    .trim()
}

// ── Orchestrator ──────────────────────────────────────────────────

export class Orchestrator {
  private ctx: OrchestratorContext
  private deps: OrchestratorDeps

  // Agents (lazy-initialised)
  private readonly pm = new PMAgent()
  private readonly architect = new ArchitectAgent()
  private readonly test = new TestAgent()
  private readonly builders: Partial<Record<AgentRole, BuilderAgent>> = {
    schema: new SchemaAgent(),
    logic:  new LogicAgent(),
    api:    new ApiAgent(),
    ui:     new UIAgent(),
    page:   new PageAgent(),
  }

  // In-memory state
  private spec: Spec | null = null
  private plan: TaskPlan | null = null
  private lastReport: ValidationReport | null = null
  private lastErrors: string = ''
  private stalledCount = 0

  // Dynamic spawn registry — maps taskId → { resolve, reject }
  private spawnRegistry = new Map<string, { resolve: () => void; reject: (e: Error) => void }>()
  private spawnCounter = 0

  constructor(projectId: string, userInput: string, deps: OrchestratorDeps) {
    this.ctx = createContext(projectId, userInput, deps.maxRetries ?? 3)
    this.deps = deps
    if (deps.agentOverrides) {
      for (const [role, config] of Object.entries(deps.agentOverrides)) {
        this.builders[role as AgentRole] = new CustomBuilderAgent(role as AgentRole, config)
      }
    }
  }

  // ── Public API ────────────────────────────────────────────────

  async run(): Promise<RunResult> {
    await this.dispatch({ type: 'START' })

    while (!isTerminal(this.ctx.state) && this.ctx.state !== 'waiting') {
      await this.step()
    }

    return {
      state: this.ctx.state,
      previewUrl: this.ctx.previewUrl,
      reviewUrl: this.ctx.reviewUrl,
      spec: this.spec,
      validationReport: this.lastReport,
    }
  }

  /** Inject user input while in WAITING state and resume. */
  async resume(userInput: string): Promise<RunResult> {
    if (this.ctx.state !== 'waiting') {
      throw new Error(`Cannot resume: current state is "${this.ctx.state}", not "waiting"`)
    }
    this.ctx.pendingUserInput = null

    // If the user just wants to skip validation and mark done, honour that directly.
    const isDoneIntent = /\b(skip|done|complete|finish|ignore|mark.{0,10}done)\b/i.test(userInput)
      || /跳过|标记.*完成|完成|忽略/.test(userInput)
    if (isDoneIntent) {
      this.ctx.state = 'done'
      await this.deps.onStateChange('done', this.ctx)
      this.emit({ type: 'state_change', state: 'done' as any })
      return { state: 'done', previewUrl: this.ctx.reviewUrl ?? undefined }
    }

    // Otherwise merge the guidance and re-run from analysis
    this.ctx.userInput = this.ctx.userInput + '\n\nUser supplement: ' + userInput
    await this.dispatch({ type: 'USER_INPUT', input: userInput })
    return this.run()
  }

  getState(): OrchestratorState { return this.ctx.state }
  getContext(): OrchestratorContext { return { ...this.ctx } }

  private buildStep(
    agent: string,
    events: ProgressEvent[],
    durationMs: number,
    status: 'done' | 'failed',
    summaryOverride?: string,
  ): CompletedStep {
    const toolCalls = events
      .filter((e): e is Extract<ProgressEvent, { type: 'agent_tool_use' }> =>
        e.type === 'agent_tool_use',
      )
      .map((e) => ({
        tool: e.tool,
        input: (typeof e.input === 'object' && e.input !== null
          ? e.input
          : {}) as Record<string, unknown>,
      }))

    const fileWrite = events.find(
      (e): e is Extract<ProgressEvent, { type: 'agent_file_write' }> =>
        e.type === 'agent_file_write',
    )
    const n = toolCalls.length
    const summary =
      summaryOverride ??
      (fileWrite
        ? `${fileWrite.file} done (${n} tool call${n !== 1 ? 's' : ''})`
        : (events.find((e) => e.type === 'agent_start') as { message?: string } | undefined)
            ?.message ?? agent)

    return { agent, summary, toolCalls, durationMs, status }
  }

  /**
   * Dynamically spawn a sub-task from within a Builder agent's tool-use loop.
   * Depth is capped at 1 — spawned tasks cannot spawn further tasks.
   * Executes immediately; caller awaits waitForCompletion() to suspend until done.
   */
  spawnTask(params: {
    role: AgentRole
    file: string
    description: string
    parentTaskId: string
    currentDepth: number
  }): SpawnedTask {
    if (params.currentDepth >= 1) {
      throw new Error(`spawn_task depth limit reached — spawned tasks cannot spawn further tasks`)
    }

    this.spawnCounter++
    const taskId = `DT${String(this.spawnCounter).padStart(3, '0')}`

    const task: PlanTask = {
      id: taskId,
      agent: params.role,
      action: 'create',
      file: params.file,
      description: params.description,
      depends_on: [],
      status: 'pending',
      parentTaskId: params.parentTaskId,
      depth: params.currentDepth + 1,
    }

    this.emit({
      type: 'agent_spawn',
      agent: params.role,
      spawnedRole: params.role,
      file: params.file,
      taskId,
      parentTaskId: params.parentTaskId,
    })

    // Run the task asynchronously, resolve/reject the promise when done
    let resolve!: () => void
    let reject!: (e: Error) => void
    const promise = new Promise<void>((res, rej) => { resolve = res; reject = rej })
    this.spawnRegistry.set(taskId, { resolve, reject })

    this.generateTaskCode(task)
      .then((code) => this.commitTask(task, code))
      .then(() => {
        this.spawnRegistry.get(taskId)?.resolve()
        this.spawnRegistry.delete(taskId)
      })
      .catch((err: unknown) => {
        const e = err instanceof Error ? err : new Error(String(err))
        this.spawnRegistry.get(taskId)?.reject(e)
        this.spawnRegistry.delete(taskId)
      })

    return {
      id: taskId,
      parentTaskId: params.parentTaskId,
      depth: params.currentDepth + 1,
      role: params.role,
      file: params.file,
      waitForCompletion: () => promise,
    }
  }

  // ── Step dispatcher ───────────────────────────────────────────

  private async step(): Promise<void> {
    switch (this.ctx.state) {
      case 'analyzing':  return this.stepAnalyze()
      case 'planning':   return this.stepPlan()
      case 'building':   return this.stepBuild()
      case 'validating': return this.stepValidate()
      case 'fixing':     return this.stepFix()
    }
  }

  // ── Phase: analyzing ─────────────────────────────────────────

  private async stepAnalyze(): Promise<void> {
    const pmStart = Date.now()
    const draft = await this.pm.draft(this.ctx.userInput, this.deps.onEvent)
    const pmDuration = Date.now() - pmStart

    // Post-LLM: surface what the PM actually found
    this.emit({
      type: 'agent_thinking',
      agent: 'pm',
      content: `"${draft.title}" — ${draft.features.length} feature(s) in ${draft.business_domain}`,
    })

    // Generate A2UI review HTML and write to sandbox
    const confirmUrl = `${process.env.AGENT_BASE_URL ?? 'http://localhost:3001'}/confirm-draft/${this.ctx.projectId}`
    const reviewHtml = this.pm.renderReviewHTML(draft, this.ctx.projectId, confirmUrl)
    await this.writeSandboxFile('/home/user/review.html', reviewHtml)
    const agentBase = process.env.AGENT_BASE_URL ?? 'http://localhost:3001'
    this.ctx.reviewUrl = `${agentBase}/review/${this.ctx.projectId}`
    await this.deps.onStateChange(this.ctx.state, this.ctx)

    // Pause here — let the user review and confirm the draft
    const confirmedDraft = await this.deps.onDraftReady(draft)
    this.spec = this.pm.finalize(confirmedDraft)

    this.deps.onTaskComplete?.({
      agent: 'pm',
      summary: `"${this.spec.title}" — ${this.spec.features.length} feature(s) in ${this.spec.business_domain}`,
      toolCalls: [],
      durationMs: pmDuration,
      status: 'done',
    })

    await this.writeSandboxFile('contracts/spec.json', JSON.stringify(this.spec, null, 2))
    await this.dispatch({ type: 'SPEC_READY' })
  }

  // ── Phase: planning ───────────────────────────────────────────

  private async stepPlan(): Promise<void> {
    this.emit({
      type: 'agent_start',
      agent: 'architect',
      message: `Planning "${this.spec!.title}"...`,
    })

    const archStart = Date.now()
    this.plan = await this.architect.plan(this.spec!, this.deps)
    const archDuration = Date.now() - archStart

    // Post-LLM: surface task breakdown
    const roles = [...new Set(this.plan.tasks.map((t) => t.agent))]
    this.emit({
      type: 'agent_thinking',
      agent: 'architect',
      content: `${this.plan.tasks.length} task(s) → ${roles.join(', ')}`,
    })

    const context = this.architect.buildInitialContext(this.spec!, this.plan)

    if (this.deps.contextClient) {
      // Write initial context sections to DB
      const sections = context.split(/^(?=## )/m).filter((s) => s.startsWith('## '))
      for (const section of sections) {
        const headingMatch = section.match(/^## ([^\n]+)/)
        if (!headingMatch) continue
        const heading = headingMatch[1]!
        const content = section.replace(/^## [^\n]+\n/, '').trim()
        await this.deps.contextClient.upsertSection(this.ctx.projectId, heading, content, 'architect', 'init')
      }
      await this.writeSandboxFile('contracts/task_plan.json', JSON.stringify(this.plan, null, 2))
    } else {
      await Promise.all([
        this.writeSandboxFile('contracts/task_plan.json', JSON.stringify(this.plan, null, 2)),
        this.writeSandboxFile('contracts/project_context.md', context),
      ])
    }

    this.deps.onTaskComplete?.({
      agent: 'architect',
      summary: `${this.plan.tasks.length} task(s) → ${roles.join(', ')}`,
      toolCalls: [],
      durationMs: archDuration,
      status: 'done',
    })

    await this.dispatch({ type: 'PLAN_READY' })
  }

  // ── Phase: building ───────────────────────────────────────────

  private async stepBuild(): Promise<void> {
    const batches = parallelBatches(this.plan!.tasks)
    await this.executeBatches(batches)
    await this.dispatch({ type: 'BUILD_DONE' })
  }

  // ── Phase: validating ─────────────────────────────────────────

  private async stepValidate(): Promise<void> {
    this.emit({ type: 'agent_start', agent: 'test', message: 'Running validation...' })

    const testStart = Date.now()
    this.lastReport = await this.test.validate(this.spec!, this.deps.sandbox, { skipE2E: this.deps.skipE2E })
    const testDuration = Date.now() - testStart

    await this.writeSandboxFile(
      'contracts/validation_report.json',
      JSON.stringify(this.lastReport, null, 2),
    )

    this.deps.onTaskComplete?.({
      agent: 'test',
      summary: `validation ${this.lastReport.overall}`,
      toolCalls: [],
      durationMs: testDuration,
      status: this.lastReport.overall === 'passed' ? 'done' : 'failed',
    })

    if (this.lastReport.overall === 'passed') {
      const url = this.deps.sandbox.getPreviewUrl(3000)
      if (url) this.ctx.previewUrl = url
      await this.dispatch({ type: 'VALIDATION_PASSED' })
    } else {
      await this.dispatch({ type: 'VALIDATION_FAILED' })
    }
  }

  // ── Phase: fixing ─────────────────────────────────────────────

  private async stepFix(): Promise<void> {
    const errors = this.lastReport?.errors ?? []
    const instructions = routeErrors(errors, this.plan!)

    // Stall detection: normalise messages before hashing so that line-number
    // churn (e.g. "file.ts:42" → "file.ts:38") doesn't reset the stall counter.
    const errorSig = errors.map((e) => normalizeErrorMessage(e.message)).sort().join('|')
    if (errorSig === this.lastErrors) {
      this.stalledCount++
    } else {
      this.stalledCount = 0
      this.lastErrors = errorSig
    }

    if (this.stalledCount >= 2) {
      // Identical error 3 times in a row — force waiting state
      this.ctx.retryCount = this.ctx.maxRetries
    }

    this.ctx.retryCount++
    this.emit({
      type: 'agent_thinking',
      agent: 'orchestrator',
      content: `Fix round ${this.ctx.retryCount}/${this.ctx.maxRetries}: ${instructions.length} agent(s) need to re-run`,
    })

    if (isSurgicalFix(instructions)) {
      // Only re-run the specific failing tasks
      await this.executeFixInstructions(instructions)
    } else {
      // Broad failure — re-run all builder agents
      const batches = parallelBatches(this.plan!.tasks)
      await this.executeBatches(batches)
    }

    await this.dispatch({ type: 'BUILD_DONE' })
  }

  // ── Execution helpers ─────────────────────────────────────────

  private async executeBatches(batches: PlanTask[][]): Promise<void> {
    for (const batch of batches) {
      for (const task of batch) {
        task.status = 'in_progress'
        this.emit({ type: 'task_status', taskId: task.id, status: 'in_progress' })
      }

      const results = await Promise.all(batch.map((task) => this.generateTaskCode(task)))

      try {
        for (let i = 0; i < batch.length; i++) {
          const task = batch[i]!
          const result = results[i]!
          try {
            await this.commitTask(task, result.code)
            task.status = 'done'
            this.emit({ type: 'task_status', taskId: task.id, status: 'done' })
            // Non-blocking knowledge extraction
            void this.extractKnowledge(task, result.code)
            this.deps.onTaskComplete?.(
              this.buildStep(task.agent, result.events, result.durationMs, 'done'),
            )
          } catch (err) {
            task.status = 'failed'
            this.emit({ type: 'task_status', taskId: task.id, status: 'failed' })
            this.deps.onTaskComplete?.(
              this.buildStep(task.agent, result.events, result.durationMs, 'failed'),
            )
            throw err
          }
        }
      } finally {
        await this.writeSandboxFile(
          'contracts/task_plan.json',
          JSON.stringify(this.plan, null, 2),
        )
      }
    }
  }

  private async executeFixInstructions(instructions: FixInstruction[]): Promise<void> {
    for (const instruction of instructions) {
      const tasks = instruction.taskIds.length > 0
        ? this.plan!.tasks.filter((t) => instruction.taskIds.includes(t.id))
        : this.plan!.tasks.filter((t) => t.agent === instruction.agent)

      for (const task of tasks) {
        task.status = 'in_progress'
        this.emit({ type: 'task_status', taskId: task.id, status: 'in_progress' })
      }

      const results = await Promise.all(
        tasks.map((task) => this.generateTaskCode(task, instruction.errorContext)),
      )

      try {
        for (let i = 0; i < tasks.length; i++) {
          const task = tasks[i]!
          const result = results[i]!
          try {
            await this.commitTask(task, result.code)
            task.status = 'done'
            this.emit({ type: 'task_status', taskId: task.id, status: 'done' })
            // Non-blocking knowledge extraction
            void this.extractKnowledge(task, result.code)
            this.deps.onTaskComplete?.(
              this.buildStep(task.agent, result.events, result.durationMs, 'done'),
            )
          } catch (err) {
            task.status = 'failed'
            this.emit({ type: 'task_status', taskId: task.id, status: 'failed' })
            this.deps.onTaskComplete?.(
              this.buildStep(task.agent, result.events, result.durationMs, 'failed'),
            )
            throw err
          }
        }
      } finally {
        await this.writeSandboxFile(
          'contracts/task_plan.json',
          JSON.stringify(this.plan, null, 2),
        )
      }
    }
  }

  /** Extract reusable knowledge from completed tasks and submit to KB. */
  private async extractKnowledge(task: PlanTask, code: string): Promise<void> {
    if (!FORGE_API_URL_SET || !this.deps.userID || !this.ctx.projectId) return
    try {
      const { text } = await llmText({
        model: anthropic(MODEL),
        system: `You extract reusable knowledge from completed engineering tasks.
For each insight worth remembering, output a JSON array (max 3 items):
[{ "type": "spec|principle|past_output", "title": "short title", "content": "concise explanation", "confidence": 0.7 }]
Types: principle (universal rule), spec (project-specific decision), past_output (reusable pattern).
Output [] if nothing is genuinely reusable. Be selective — quality over quantity.`,
        prompt: `Completed task: ${task.description}\nFile: ${task.file}\nAgent: ${task.agent}\nOutput snippet:\n${code.slice(0, 400)}`,
      })
      let entries: Array<{ type: string; title: string; content: string; confidence: number }> = []
      try {
        const trimmed = text.trim()
        const jsonStart = trimmed.indexOf('[')
        const jsonEnd = trimmed.lastIndexOf(']')
        if (jsonStart !== -1 && jsonEnd !== -1) {
          entries = JSON.parse(trimmed.slice(jsonStart, jsonEnd + 1))
        }
      } catch { return }

      for (const entry of entries.slice(0, 3)) {
        if (!entry.title?.trim() || !entry.content?.trim()) continue
        await submitKBEntry(this.ctx.projectId, this.deps.userID, {
          type: entry.type ?? 'spec',
          title: entry.title,
          content: entry.content,
          sourceAgent: task.agent,
          sourceTask: task.id,
          confidence: typeof entry.confidence === 'number' ? entry.confidence : 0.7,
        })
      }
    } catch (err) {
      console.error('[extractKnowledge] failed:', err)
    }
  }

  /** Phase 1: generate code for a task (LLM call, safe to run in parallel). */
  private async generateTaskCode(task: PlanTask, errorContext?: string): Promise<{ code: string; events: ProgressEvent[]; durationMs: number }> {
    const agent = this.builders[task.agent]
    if (!agent) return { code: '', events: [], durationMs: 0 }

    const context = await this.readRelevantContext(task.agent)
    const existingContent = task.action === 'modify'
      ? await this.readSandboxFile(task.file).catch(() => undefined)
      : undefined

    const taskWithContext = errorContext
      ? { ...task, description: task.description + `\n\nFix context:\n${errorContext}` }
      : task

    const spawnFn: SpawnTaskFn = (params) => this.spawnTask(params)

    const taskEvents: ProgressEvent[] = []
    const taskEmit = (e: ProgressEvent) => {
      taskEvents.push(e)
      this.deps.onEvent(e)
    }
    const startedAt = Date.now()
    const code = await agent.executeTask(
      { task: taskWithContext, projectContext: context, existingFileContent: existingContent, userID: this.deps.userID, projectId: this.ctx.projectId },
      taskEmit,
      this.deps.sandbox,
      spawnFn,
    )
    return { code, events: taskEvents, durationMs: Date.now() - startedAt }
  }

  /** Phase 2: update shared context (must run sequentially, file writes done by agent tools). */
  private async commitTask(task: PlanTask, _code: string): Promise<void> {
    const agent = this.builders[task.agent]
    if (!agent) return

    const update = (agent as any).contextUpdate(task, _code)
    if (!update) return

    if (this.deps.contextClient) {
      const headingMatch = update.match(/^## ([^\n]+)/m)
      const heading = headingMatch?.[1] ?? task.agent
      const content = update.replace(/^## [^\n]+\n/, '').trim()
      await this.deps.contextClient.upsertSection(this.ctx.projectId, heading, content, task.agent, task.id)
    } else {
      const current = await this.readSandboxFile('contracts/project_context.md')
      await this.writeSandboxFile(
        'contracts/project_context.md',
        upsertContextSection(current, update),
      )
    }
  }

  // ── State machine dispatch ────────────────────────────────────

  private async dispatch(event: OrchestratorEvent): Promise<void> {
    // Refresh sandbox timeout at every phase transition to prevent mid-run expiry
    if (this.deps.sandbox.keepAlive) {
      await this.deps.sandbox.keepAlive(15 * 60 * 1000).catch(() => {})
    }

    const next = transition(this.ctx, event)

    if (next === 'waiting') {
      if (this.lastReport) {
        const unitFails = this.lastReport.errors.filter((e) => e.type === 'unit_test').length
        const e2eFails = this.lastReport.errors.filter((e) => e.type === 'e2e').length
        const parts: string[] = []
        if (unitFails > 0) parts.push(`${unitFails} unit test failure${unitFails > 1 ? 's' : ''}`)
        if (e2eFails > 0) parts.push(`${e2eFails} E2E check failure${e2eFails > 1 ? 's' : ''}`)
        const summary = parts.length > 0 ? parts.join(', ') : `${this.lastReport.errors.length} errors`
        // Show first 3 representative errors so the human has context without being overwhelmed
        const samples = this.lastReport.errors.slice(0, 3).map((e) => `• ${e.message}`).join('\n')
        const more = this.lastReport.errors.length > 3
          ? `\n…and ${this.lastReport.errors.length - 3} more.`
          : ''
        this.ctx.pendingUserInput =
          `Validation failed after ${this.ctx.retryCount} retries (${summary}).\n\n` +
          `${samples}${more}\n\n` +
          `How would you like to proceed? (e.g. "skip E2E checks", "focus on auth only", "mark as done")`
      } else {
        this.ctx.pendingUserInput = 'Could not complete generation. Please provide guidance.'
      }
    }

    this.ctx.state = next
    await this.deps.onStateChange(next, this.ctx)
    this.emit({ type: 'state_change', state: next as any })
  }

  // ── Context retrieval ─────────────────────────────────────────

  /**
   * Return only the sections of project_context.md relevant to this agent role.
   * Prevents unbounded context growth from poisoning unrelated agents.
   *
   * Section map (what each agent needs to do its job):
   *   schema  — App Overview + Architecture Decisions
   *   logic   — App Overview + Data Models + API Contracts
   *   api     — App Overview + Data Models + Architecture Decisions
   *   ui      — App Overview + Available Hooks
   *   page    — App Overview + Available Hooks + Available UI Components + API Contracts
   */
  private async readRelevantContext(role: AgentRole): Promise<string> {
    if (this.deps.contextClient) {
      return this.deps.contextClient.getRelevantContext(this.ctx.projectId, role)
    }
    // Fallback: sandbox file (used in tests when FORGE_API_URL not set)
    const full = await this.readSandboxFile('contracts/project_context.md')
    if (!full) return ''

    const NEEDED: Record<AgentRole, string[]> = {
      schema: ['App Overview', 'Architecture Decisions'],
      logic:  ['App Overview', 'Data Models', 'API Contracts'],
      api:    ['App Overview', 'Data Models', 'Architecture Decisions'],
      ui:     ['App Overview', 'Available Hooks'],
      page:   ['App Overview', 'Available Hooks', 'Available UI Components', 'API Contracts'],
    }

    const needed = NEEDED[role]
    if (!needed) return full

    const sections = full.split(/^(?=## )/m)
    return sections
      .filter((s) => !s.startsWith('## ') || needed.some((n) => s.startsWith(`## ${n}`)))
      .join('')
  }

  // ── Sandbox I/O helpers ───────────────────────────────────────

  private async writeSandboxFile(path: string, content: string): Promise<void> {
    await this.deps.sandbox.writeFile(path, content)
    this.emit({ type: 'agent_file_write', agent: 'orchestrator', file: path, action: 'create' })
  }

  private async readSandboxFile(path: string): Promise<string> {
    return this.deps.sandbox.readFile(path).catch(() => '')
  }

  private emit(event: ProgressEvent): void {
    this.deps.onEvent(event)
  }
}
