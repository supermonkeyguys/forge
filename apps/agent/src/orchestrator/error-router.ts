/**
 * Error Router — determines which Builder Agent(s) should re-run
 * based on the validation_report errors.
 *
 * Rules:
 *   - Unit test failure in packages/core/ → logic agent re-runs that file's task
 *   - Unit test failure in server/domain/  → logic agent
 *   - E2E failure mentioning an API route  → api agent
 *   - E2E failure mentioning a UI element  → ui agent, then page agent
 *   - Build/runtime error in prisma/       → schema agent
 *   - Unknown errors                       → re-run all builder agents (safe fallback)
 *
 * Returns an ordered list of (agent, task_ids[]) pairs to re-execute.
 */

import type { ValidationError } from '../contracts/validation-report.js'
import type { TaskPlan, AgentRole, PlanTask } from '../contracts/task-plan.js'

export interface FixInstruction {
  agent: AgentRole
  taskIds: string[]          // specific tasks to re-run (empty = re-run all for this agent)
  errorContext: string       // error summary injected into the re-run prompt
}

export function routeErrors(
  errors: ValidationError[],
  plan: TaskPlan,
): FixInstruction[] {
  if (errors.length === 0) return []

  const byAgent = new Map<AgentRole, { taskIds: Set<string>; messages: string[] }>()

  for (const err of errors) {
    const agent = resolveAgent(err, plan)
    if (!byAgent.has(agent)) {
      byAgent.set(agent, { taskIds: new Set(), messages: [] })
    }
    const entry = byAgent.get(agent)!
    entry.messages.push(err.message + (err.suggestion ? ` — hint: ${err.suggestion}` : ''))

    // Find tasks in plan that own this file
    if (err.file) {
      const owningTasks = plan.tasks.filter(
        (t) => t.agent === agent && isRelatedFile(t.file, err.file!),
      )
      owningTasks.forEach((t) => entry.taskIds.add(t.id))
    }
  }

  // Convert to ordered instructions — schema first, then logic/api, then ui/page
  const agentOrder: AgentRole[] = ['schema', 'logic', 'api', 'ui', 'page']
  const instructions: FixInstruction[] = []

  for (const agent of agentOrder) {
    const entry = byAgent.get(agent)
    if (!entry) continue
    instructions.push({
      agent,
      taskIds: [...entry.taskIds],
      errorContext: entry.messages.join('\n'),
    })
  }

  return instructions
}

/** How many unique agents need to re-run. */
export function affectedAgentCount(instructions: FixInstruction[]): number {
  return new Set(instructions.map((i) => i.agent)).size
}

/** True if all errors point to the same agent (surgical fix possible). */
export function isSurgicalFix(instructions: FixInstruction[]): boolean {
  return affectedAgentCount(instructions) === 1 && instructions[0]!.taskIds.length > 0
}

// ── Private helpers ───────────────────────────────────────────────

function resolveAgent(err: ValidationError, plan: TaskPlan): AgentRole {
  // Error already carries an agent classification
  if (err.agent !== 'unknown') return err.agent as AgentRole

  // Try to infer from error message keywords
  const msg = (err.message + ' ' + (err.suggestion ?? '')).toLowerCase()
  if (msg.includes('prisma') || msg.includes('schema') || msg.includes('migration')) return 'schema'
  if (msg.includes('/api/') || msg.includes('route.ts') || msg.includes('api route')) return 'api'
  if (msg.includes('packages/ui') || msg.includes('component') || msg.includes('stories')) return 'ui'
  if (msg.includes('page.tsx') || msg.includes('layout')) return 'page'

  // Fall back to logic (most common source of business logic failures)
  return 'logic'
}

function isRelatedFile(taskFile: string, errorFile: string): boolean {
  // Direct match
  if (taskFile === errorFile) return true
  // Test file → source file (auth.test.ts matches use-login.ts in same dir)
  const dir = errorFile.split('/').slice(0, -1).join('/')
  return taskFile.startsWith(dir)
}
