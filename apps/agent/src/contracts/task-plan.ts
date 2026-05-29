/**
 * Zod schema for task_plan.json — the Architect Agent's output.
 *
 * A task plan is a file-level change plan: which files to create/modify/delete,
 * which agent is responsible, and task dependency ordering.
 */

import { z } from 'zod'

export const AgentRoleSchema = z.enum([
  'schema',  // database schema (prisma)
  'logic',   // business logic + unit tests (packages/core + server/domain)
  'api',     // HTTP route layer (app/api)
  'ui',      // pure UI components (packages/ui)
  'page',    // page assembly (app/**/page.tsx)
])

export const TaskActionSchema = z.enum(['create', 'modify', 'delete'])

export const TaskStatusSchema = z.enum(['pending', 'in_progress', 'done', 'failed'])

export const PlanTaskSchema = z.object({
  id: z.string().describe('Unique task ID, e.g. T001'),
  agent: AgentRoleSchema,
  action: TaskActionSchema,
  file: z.string().describe('Relative file path from project root'),
  description: z.string().describe('What this task should produce — specific enough to act on'),
  depends_on: z
    .array(z.string())
    .default([])
    .describe('Task IDs that must complete before this one starts'),
  status: TaskStatusSchema.default('pending'),
  feature_ids: z
    .array(z.string())
    .optional()
    .describe('Which spec features this task implements'),
  parentTaskId: z
    .string()
    .optional()
    .describe('ID of the task that spawned this one via spawn_task tool'),
  depth: z
    .number()
    .int()
    .min(0)
    .default(0)
    .describe('Spawn depth — 0 for Architect-planned tasks, 1 for dynamically spawned tasks'),
})

export const TaskPlanSchema = z.object({
  spec_id: z.string(),
  tech_decisions: z
    .record(z.string())
    .describe('Key architectural decisions: why this stack, why this pattern'),
  tasks: z.array(PlanTaskSchema).min(1),
})

export type TaskPlan = z.infer<typeof TaskPlanSchema>
export type PlanTask = z.infer<typeof PlanTaskSchema>
export type AgentRole = z.infer<typeof AgentRoleSchema>
export type TaskAction = z.infer<typeof TaskActionSchema>
export type TaskStatus = z.infer<typeof TaskStatusSchema>

// ── Helpers ──────────────────────────────────────────────────────

/** Return tasks in topological order (respecting depends_on). */
export function topoSort(tasks: PlanTask[]): PlanTask[] {
  const byId = new Map(tasks.map((t) => [t.id, t]))
  const visited = new Set<string>()
  const result: PlanTask[] = []

  function visit(id: string) {
    if (visited.has(id)) return
    visited.add(id)
    const task = byId.get(id)
    if (!task) return
    for (const dep of task.depends_on) visit(dep)
    result.push(task)
  }

  for (const task of tasks) visit(task.id)
  return result
}

/** Group tasks by which ones can run in parallel (same dependency depth). */
export function parallelBatches(tasks: PlanTask[]): PlanTask[][] {
  const sorted = topoSort(tasks)
  const depthOf = new Map<string, number>()

  for (const task of sorted) {
    const maxDep = task.depends_on.reduce(
      (max, depId) => Math.max(max, (depthOf.get(depId) ?? 0) + 1),
      0,
    )
    depthOf.set(task.id, maxDep)
  }

  const batches: PlanTask[][] = []
  for (const task of sorted) {
    const depth = depthOf.get(task.id) ?? 0
    if (!batches[depth]) batches[depth] = []
    batches[depth]!.push(task)
  }

  return batches.filter(Boolean)
}
