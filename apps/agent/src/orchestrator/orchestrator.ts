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
import { TestAgent } from '../agents/test-agent.js'
import { parallelBatches } from '../contracts/task-plan.js'
import type { Spec } from '../contracts/spec.js'
import type { TaskPlan, PlanTask, AgentRole } from '../contracts/task-plan.js'
import type { ValidationReport } from '../contracts/validation-report.js'
import type { ProgressEvent } from '../agents/types.js'

// ── Types ─────────────────────────────────────────────────────────

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
  private readonly builders: Record<AgentRole, { executeTask: Function }> = {
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

  constructor(projectId: string, userInput: string, deps: OrchestratorDeps) {
    this.ctx = createContext(projectId, userInput, deps.maxRetries ?? 3)
    this.deps = deps
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
    // Merge user supplement into the original input
    this.ctx.userInput = this.ctx.userInput + '\n\nUser supplement: ' + userInput
    this.ctx.pendingUserInput = null
    await this.dispatch({ type: 'USER_INPUT', input: userInput })
    return this.run()
  }

  getState(): OrchestratorState { return this.ctx.state }
  getContext(): OrchestratorContext { return { ...this.ctx } }

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
    this.emit({ type: 'agent_start', agent: 'pm', message: 'Analyzing requirements...' })

    const draft = await this.pm.draft(this.ctx.userInput, this.deps.onEvent)

    // Generate A2UI review HTML and write to sandbox
    const confirmUrl = `${process.env.AGENT_BASE_URL ?? 'http://localhost:3001'}/confirm-draft/${this.ctx.projectId}`
    const reviewHtml = this.pm.renderReviewHTML(draft, this.ctx.projectId, confirmUrl)
    await this.writeSandboxFile('/home/user/review.html', reviewHtml)
    this.ctx.reviewUrl = this.deps.sandbox.getPreviewUrl(3000) + '/review.html'
    await this.deps.onStateChange(this.ctx.state, this.ctx)

    // Pause here — let the user review and confirm the draft
    const confirmedDraft = await this.deps.onDraftReady(draft)
    this.spec = this.pm.finalize(confirmedDraft)

    await this.writeSandboxFile('contracts/spec.json', JSON.stringify(this.spec, null, 2))
    await this.dispatch({ type: 'SPEC_READY' })
  }

  // ── Phase: planning ───────────────────────────────────────────

  private async stepPlan(): Promise<void> {
    this.emit({ type: 'agent_start', agent: 'architect', message: 'Planning implementation...' })

    this.plan = await this.architect.plan(this.spec!, this.deps)
    const context = this.architect.buildInitialContext(this.spec!, this.plan)

    await Promise.all([
      this.writeSandboxFile('contracts/task_plan.json', JSON.stringify(this.plan, null, 2)),
      this.writeSandboxFile('contracts/project_context.md', context),
    ])

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

    this.lastReport = await this.test.validate(this.spec!, this.deps.sandbox)
    await this.writeSandboxFile(
      'contracts/validation_report.json',
      JSON.stringify(this.lastReport, null, 2),
    )

    if (this.lastReport.overall === 'passed') {
      this.ctx.previewUrl = this.deps.sandbox.getPreviewUrl(3000)
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
      // Generate code for all tasks in the batch in parallel (LLM calls are independent)
      const codes = await Promise.all(batch.map((task) => this.generateTaskCode(task)))
      // Write files + update context sequentially to avoid race conditions on project_context.md
      for (let i = 0; i < batch.length; i++) {
        await this.commitTask(batch[i]!, codes[i]!)
      }
    }
  }

  private async executeFixInstructions(instructions: FixInstruction[]): Promise<void> {
    for (const instruction of instructions) {
      const tasks = instruction.taskIds.length > 0
        ? this.plan!.tasks.filter((t) => instruction.taskIds.includes(t.id))
        : this.plan!.tasks.filter((t) => t.agent === instruction.agent)

      // Generate in parallel, commit sequentially (same pattern as executeBatches)
      const codes = await Promise.all(tasks.map((task) => this.generateTaskCode(task, instruction.errorContext)))
      for (let i = 0; i < tasks.length; i++) {
        await this.commitTask(tasks[i]!, codes[i]!)
      }
    }
  }

  /** Phase 1: generate code for a task (LLM call, safe to run in parallel). */
  private async generateTaskCode(task: PlanTask, errorContext?: string): Promise<string> {
    const agent = this.builders[task.agent]
    if (!agent) return ''

    const context = await this.readRelevantContext(task.agent)
    const existingContent = task.action === 'modify'
      ? await this.readSandboxFile(task.file).catch(() => undefined)
      : undefined

    const taskWithContext = errorContext
      ? { ...task, description: task.description + `\n\nFix context:\n${errorContext}` }
      : task

    return (agent as any).executeTask(
      { task: taskWithContext, projectContext: context, existingFileContent: existingContent },
      this.deps.onEvent,
      this.deps.sandbox,   // pass sandbox so agent can use tools
    )
  }

  /** Phase 2: update shared context (must run sequentially, file writes done by agent tools). */
  private async commitTask(task: PlanTask, _code: string): Promise<void> {
    const agent = this.builders[task.agent]
    if (!agent) return

    const update = (agent as any).contextUpdate(task, _code)
    if (update) {
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
      this.ctx.pendingUserInput = this.lastReport
        ? `Validation failed after ${this.ctx.retryCount} retries.\n\n` +
          this.lastReport.errors.map((e) => `- ${e.message}`).join('\n')
        : 'Could not complete generation.'
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

    // Split on ## headings, keep only needed sections + the preamble before first heading
    const sections = full.split(/^(?=## )/m)
    const filtered = sections.filter((section) => {
      if (!section.startsWith('## ')) return true // preamble
      return needed.some((name) => section.startsWith(`## ${name}`))
    })

    return filtered.join('')
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
