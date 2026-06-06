/**
 * BaseBuilderAgent — shared foundation for all Tier 2 Builder Agents.
 *
 * Upgraded from single-shot generateText to a multi-step agentic tool-use loop.
 *
 * Each agent now:
 *   1. Reads the files it needs (not just project_context.md)
 *   2. Writes or patches files with str_replace (surgical, not full rewrites)
 *   3. Runs tsc --noEmit to verify TypeScript compiles before finishing
 *   4. Self-corrects within the same conversation if tsc fails
 *
 * Tools available to agents:
 *   read_file    — read any file from the sandbox
 *   write_file   — create a new file (first write only)
 *   str_replace  — patch an existing file (targeted edit, not full rewrite)
 *   tsc_check    — run tsc --noEmit and return compiler errors
 *
 * maxSteps=8 keeps cost bounded:
 *   typical path: read(1) → write(1) → tsc(1) = 3 steps
 *   fix path:     read(1) → write(1) → tsc(1) → str_replace(1) → tsc(1) = 5 steps
 */

import { llmText as generateText } from '../../lib/ai-client.js'
import { anthropic, BUILDER_MODEL as MODEL, createTool } from '../../lib/ai-client.js'
import { fetchTopMemories, saveMemory, buildMemoryContext } from '../../lib/agent-memory-client.js'
import {
  fetchPrinciples,
  searchProjectKB,
  submitKBEntry,
  buildTypedKBContext,
} from '../../lib/project-kb-client.js'
import { z } from 'zod'
import type { AgentRunContext, AgentResult, BuilderAgent, BuilderTaskInput, ProgressEvent } from '../types.js'
import type { PlanTask, AgentRole } from '../../contracts/task-plan.js'
import type { SpawnTaskFn, SandboxInterface } from '../../orchestrator/orchestrator.js'

export type { BuilderTaskInput as TaskInput }

// ── Sandbox interface (injected via ctx) ──────────────────────────

interface SandboxIO {
  readFile(path: string): Promise<string>
  writeFile(path: string, content: string): Promise<void>
  run(cmd: string, opts?: { cwd?: string; timeoutMs?: number }): Promise<{ stdout: string; stderr: string; exitCode: number }>
}

const APP_DIR = '/home/user/app'

// ── Write path allow-list ─────────────────────────────────────────

const WRITE_ALLOWED: Record<AgentRole, (path: string) => boolean> = {
  schema: (p) => p.startsWith('prisma/'),
  logic:  (p) => p.startsWith('packages/core/') || p.startsWith('server/domain/'),
  api:    (p) => p.startsWith('app/api/') || p.startsWith('server/infra/'),
  ui:     (p) => p.startsWith('packages/ui/'),
  page:   (p) => p.startsWith('app/') && !p.startsWith('app/api/'),
}

// ── Tool builders ─────────────────────────────────────────────────

function buildTools(
  sandbox: SandboxIO,
  emit: (e: ProgressEvent) => void,
  role: AgentRole,
  spawnFn?: SpawnTaskFn,
  currentTaskId?: string,
  currentDepth?: number,
  customWriteGuard?: (path: string) => boolean,
  userID?: string,
  projectId?: string,
) {
  return {
    read_file: createTool({
      description: 'Read a file from the sandbox. Use this to inspect existing code before modifying it.',
      parameters: z.object({
        path: z.string().describe('File path relative to /home/user/app, e.g. "packages/core/auth/use-login.ts"'),
      }),
      execute: async ({ path }) => {
        emit({ type: 'agent_tool_use', agent: role, tool: 'read_file', input: { path } })
        try {
          const content = await sandbox.readFile(`${APP_DIR}/${path}`)
          return { ok: true, content }
        } catch {
          return { ok: false, content: '' }
        }
      },
    }),

    write_file: createTool({
      description: 'Write a new file to the sandbox. Use for creating files that do not exist yet. For existing files, prefer str_replace.',
      parameters: z.object({
        path: z.string().describe('File path relative to /home/user/app'),
        content: z.string().describe('Complete file content'),
      }),
      execute: async ({ path, content }) => {
        const guard = customWriteGuard ?? WRITE_ALLOWED[role] ?? (() => false)
        if (!guard(path)) {
          return { ok: false, error: `write blocked: ${role} agent is not allowed to write to "${path}"` }
        }
        emit({ type: 'agent_tool_use', agent: role, tool: 'write_file', input: { path } })
        await sandbox.writeFile(`${APP_DIR}/${path}`, content)
        emit({ type: 'agent_file_write', agent: role, file: path, action: 'create' })
        return { ok: true }
      },
    }),

    str_replace: createTool({
      description: 'Replace an exact string in an existing file. More precise than rewriting the whole file. The old_str must match exactly including whitespace.',
      parameters: z.object({
        path: z.string().describe('File path relative to /home/user/app'),
        old_str: z.string().describe('The exact string to find and replace'),
        new_str: z.string().describe('The replacement string'),
      }),
      execute: async ({ path, old_str, new_str }) => {
        const guard = customWriteGuard ?? WRITE_ALLOWED[role] ?? (() => false)
        if (!guard(path)) {
          return { ok: false, error: `str_replace blocked: ${role} agent is not allowed to modify "${path}"` }
        }
        emit({ type: 'agent_tool_use', agent: role, tool: 'str_replace', input: { path, old_str: old_str.slice(0, 60) + '...' } })
        try {
          const current = await sandbox.readFile(`${APP_DIR}/${path}`)
          if (!current.includes(old_str)) {
            return { ok: false, error: 'old_str not found in file — check whitespace and exact match' }
          }
          const updated = current.replace(old_str, new_str)
          await sandbox.writeFile(`${APP_DIR}/${path}`, updated)
          emit({ type: 'agent_file_write', agent: role, file: path, action: 'modify' })
          return { ok: true }
        } catch (err) {
          return { ok: false, error: err instanceof Error ? err.message : String(err) }
        }
      },
    }),

    tsc_check: createTool({
      description: 'Run TypeScript compiler check (tsc --noEmit) to verify there are no type errors. Always call this after writing or modifying TypeScript files.',
      parameters: z.object({}),
      execute: async () => {
        emit({ type: 'agent_tool_use', agent: role, tool: 'tsc_check', input: {} })
        const result = await sandbox.run('npx tsc --noEmit 2>&1 || true', {
          cwd: APP_DIR,
          timeoutMs: 30_000,
        })
        const output = (result.stdout + result.stderr).trim()
        const passed = !output.includes('error TS')
        return { passed, output: output.slice(0, 2000) }
      },
    }),

    remember: createTool({
      description: 'Save a piece of information to your private memory for use in future tasks.',
      parameters: z.object({
        key:     z.string().describe('Topic label, e.g. "style_preference" or "learned_pattern"'),
        content: z.string().describe('The information to remember'),
      }),
      execute: async ({ key, content }) => {
        emit({ type: 'agent_tool_use', agent: role, tool: 'remember', input: { key } })
        await saveMemory(role, key, content)
        return { ok: true }
      },
    }),

    recall: createTool({
      description: 'Search your private memory for information relevant to the current task.',
      parameters: z.object({
        query: z.string().describe('What you want to recall'),
      }),
      execute: async ({ query }) => {
        emit({ type: 'agent_tool_use', agent: role, tool: 'recall', input: { query } })
        const memories = await fetchTopMemories(role, query, 5)
        return {
          memories: memories.map((m) =>
            m.memoryKey ? `[${m.memoryKey}] ${m.content}` : m.content,
          ),
        }
      },
    }),

    search_kb: createTool({
      description: 'Search the company knowledge base for information relevant to the current task.',
      parameters: z.object({
        query: z.string().describe('What you want to find in the company knowledge base'),
      }),
      execute: async ({ query }) => {
        emit({ type: 'agent_tool_use', agent: role, tool: 'search_kb', input: { query } })
        const entries = await searchProjectKB(projectId ?? '', userID ?? '', query, 'spec', 5)
        return { results: entries.map((e) => ({ title: e.title, content: e.content, type: e.type })) }
      },
    }),

    save_to_kb: createTool({
      description: 'Save important company-level information to the shared knowledge base.',
      parameters: z.object({
        title:   z.string(),
        content: z.string(),
        tags:    z.array(z.string()),
      }),
      execute: async ({ title, content, tags }) => {
        emit({ type: 'agent_tool_use', agent: role, tool: 'save_to_kb', input: { title } })
        await submitKBEntry(
          projectId ?? '',
          userID ?? '',
          { type: 'spec', title, content, tags, sourceAgent: role, sourceTask: currentTaskId ?? '' },
        )
        return { ok: true, note: 'Saved to project KB — pending human verification.' }
      },
    }),

    ...(spawnFn && currentTaskId !== undefined && currentDepth !== undefined
      ? {
          spawn_task: createTool({
            description:
              'Spawn a sub-task to generate a file you need but that does not exist yet. ' +
              'The spawned agent runs immediately and you will be notified when it completes. ' +
              'Use this when you need a util, hook, or component that is not in project_context.md. ' +
              'Depth limit: 1 — spawned tasks cannot spawn further tasks.',
            parameters: z.object({
              role: z.enum(['schema', 'logic', 'api', 'ui', 'page']).describe('Which agent should create the file'),
              file: z.string().describe('File path relative to /home/user/app, e.g. "packages/core/utils/format-date.ts"'),
              description: z.string().describe('What the file should contain — specific enough to act on'),
            }),
            execute: async ({ role: spawnedRole, file, description }) => {
              emit({ type: 'agent_tool_use', agent: role, tool: 'spawn_task', input: { role: spawnedRole, file } })
              try {
                const spawned = spawnFn({
                  role: spawnedRole,
                  file,
                  description,
                  parentTaskId: currentTaskId,
                  currentDepth,
                })
                await spawned.waitForCompletion()
                return { ok: true, taskId: spawned.id, message: `${file} is now available` }
              } catch (err) {
                return { ok: false, error: err instanceof Error ? err.message : String(err) }
              }
            },
          }),
        }
      : {}),
  }
}

// ── Base class ────────────────────────────────────────────────────

export abstract class BaseBuilderAgent implements BuilderAgent {
  abstract readonly role: AgentRole

  protected abstract systemPrompt(): string
  protected abstract buildTaskPrompt(input: TaskInput): string

  /**
   * What to append/overwrite in project_context.md after this task.
   * Return null to skip (e.g. test files).
   * The returned string should start with a section header like "## Available Hooks (updated by ...)"
   * so the orchestrator can overwrite the section rather than appending.
   */
  protected abstract contextUpdate(task: PlanTask, code: string): string | null

  /** Override in subclasses to replace the WRITE_ALLOWED role-based guard. */
  protected writeGuard(): ((path: string) => boolean) | undefined {
    return undefined
  }

  // ── Public API ────────────────────────────────────────────────

  async run(ctx: AgentRunContext): Promise<AgentResult> {
    ctx.emit({ type: 'agent_start', agent: this.role, message: `${this.role} agent starting...` })

    try {
      const tasks = await this.loadMyTasks(ctx)

      if (tasks.length === 0) {
        ctx.emit({ type: 'agent_done', agent: this.role, summary: 'No tasks assigned' })
        return { success: true, summary: 'No tasks assigned' }
      }

      const results = await this.executeTasks(tasks, ctx)
      const failed = results.filter((r) => !r.success)

      if (failed.length > 0) {
        return {
          success: false,
          summary: `${failed.length}/${tasks.length} tasks failed`,
          errors: failed.flatMap((r) => r.errors ?? []),
        }
      }

      ctx.emit({ type: 'agent_done', agent: this.role, summary: `Completed ${tasks.length} task(s)` })
      return { success: true, summary: `Completed ${tasks.length} tasks` }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      ctx.emit({ type: 'agent_error', agent: this.role, error: msg })
      return {
        success: false,
        summary: `${this.role} agent failed`,
        errors: [{ type: 'e2e', agent: this.role, message: msg }],
      }
    }
  }

  /**
   * Execute a single task via agentic tool-use loop.
   * Exposed for direct use by Orchestrator (bypasses run() task-loading).
   */
  async executeTask(
    input: BuilderTaskInput,
    emit: (e: ProgressEvent) => void,
    sandbox?: SandboxInterface,
    spawnFn?: SpawnTaskFn,
  ): Promise<string> {
    const filename = input.task.file.split('/').pop() ?? input.task.file
    const action = input.task.action === 'create' ? 'Creating' : 'Modifying'
    emit({
      type: 'agent_thinking',
      agent: this.role,
      content: `${action} ${filename} — ${input.task.description.slice(0, 60)}`,
    })

    if (!sandbox) {
      return this.generateFallback(input, emit)
    }

    // Auto-inject relevant memories
    const topMemories = await fetchTopMemories(this.role, input.task.description, 3)
    const memoryContext = buildMemoryContext(topMemories)
    const projectId = input.projectId ?? ''
    const userID = input.userID ?? ''
    const [principles, specs, pastOutputs, testAssets] = await Promise.all([
      fetchPrinciples(projectId, userID),
      searchProjectKB(projectId, userID, input.task.description, 'spec', 3),
      searchProjectKB(projectId, userID, input.task.description, 'past_output', 2),
      this.role === 'test'
        ? searchProjectKB(projectId, userID, input.task.description, 'test_asset', 5)
        : Promise.resolve([] as import('../../lib/project-kb-client.js').KBEntry[]),
    ])
    const kbContext = buildTypedKBContext({ principles, specs, pastOutputs, testAssets })
    const systemWithMemory = this.systemPrompt() + memoryContext + kbContext

    const tools = buildTools(
      sandbox,
      emit,
      this.role,
      spawnFn,
      input.task.id,
      input.task.depth ?? 0,
      this.writeGuard(),
      input.userID,
      input.projectId,
    )

    const { text, steps } = await generateText({
      model: anthropic(MODEL),
      system: systemWithMemory,
      prompt: this.buildTaskPrompt(input),
      tools,
      maxSteps: 12,  // bumped from 8 — spawn_task adds up to 2 extra steps per spawn
    })

    emit({
      type: 'agent_thinking',
      agent: this.role,
      content: `${filename} done (${steps.length} tool call${steps.length !== 1 ? 's' : ''})`,
    })

    return text ?? ''
  }

  // ── Private helpers ───────────────────────────────────────────

  private async generateFallback(input: TaskInput, emit: (e: ProgressEvent) => void): Promise<string> {
    const { text } = await generateText({
      model: anthropic(MODEL),
      system: this.systemPrompt(),
      prompt: this.buildTaskPrompt(input),
    })
    emit({ type: 'agent_file_write', agent: this.role, file: input.task.file, action: input.task.action === 'create' ? 'create' : 'modify' })
    return extractCode(text)
  }

  private async loadMyTasks(ctx: AgentRunContext): Promise<PlanTask[]> {
    return (ctx as any).__tasks ?? []
  }

  private async executeTasks(tasks: PlanTask[], ctx: AgentRunContext): Promise<AgentResult[]> {
    const results: AgentResult[] = []
    const sandbox: SandboxIO | undefined = (ctx as any).__sandbox

    for (const task of tasks) {
      try {
        const context = await this.readContext(ctx)
        const existingContent = task.action === 'modify'
          ? await this.readExistingFile(task.file, ctx).catch(() => undefined)
          : undefined

        await this.executeTask({ task, projectContext: context, existingFileContent: existingContent }, ctx.emit, sandbox)

        const update = this.contextUpdate(task, '')
        if (update) await this.appendContext(update, ctx)

        results.push({ success: true, summary: `${task.id} done: ${task.file}` })
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err)
        ctx.emit({ type: 'agent_error', agent: this.role, error: `${task.id} failed: ${msg}` })
        results.push({
          success: false,
          summary: `${task.id} failed`,
          errors: [{ type: 'e2e', agent: this.role, message: msg, file: task.file }],
        })
      }
    }

    return results
  }

  private async readContext(ctx: AgentRunContext): Promise<string> {
    return (ctx as any).__context ?? ''
  }

  private async readExistingFile(file: string, ctx: AgentRunContext): Promise<string> {
    return (ctx as any).__files?.[file] ?? ''
  }

  private async appendContext(update: string, ctx: AgentRunContext): Promise<void> {
    if ((ctx as any).__appendContext) {
      await (ctx as any).__appendContext(update)
    }
  }
}

// ── Code extraction (fallback only) ──────────────────────────────

export function extractCode(text: string): string {
  const fenced = text.match(/```(?:typescript|tsx?|javascript|jsx?|prisma|sql)?\n([\s\S]*?)```/)
  if (fenced?.[1]) return fenced[1].trim()

  const lines = text.split('\n')
  const codeStart = lines.findIndex(
    (l) => l.startsWith('import ') || l.startsWith('export ') || l.startsWith('//') || l.startsWith('/*'),
  )
  if (codeStart > 0) return lines.slice(codeStart).join('\n').trim()

  return text.trim()
}
