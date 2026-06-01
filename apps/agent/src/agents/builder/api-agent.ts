/**
 * API Agent — Tier 2
 *
 * Owns: app/api/**\/route.ts  (Next.js App Router route handlers)
 * Produces: HTTP route handlers (thin layer only)
 *
 * Rules (enforced by AGENTS.md):
 *   - Route handlers are thin: parse → call domain/infra → respond
 *   - No business logic in route handlers (no if/else on business state)
 *   - All domain errors mapped to HTTP codes via a central errorToResponse()
 *   - Input validation with zod before calling any business logic
 *   - Must update API Contracts section in project_context.md
 */

import type { PlanTask } from '../../contracts/task-plan.js'
import { BaseBuilderAgent, type TaskInput } from './base-builder.js'
import { getInstructions } from '../../lib/instruction-registry.js'

export class ApiAgent extends BaseBuilderAgent {
  readonly role = 'api' as const

  protected systemPrompt(): string {
    return getInstructions('api')
  }

  protected buildTaskPrompt(input: TaskInput): string {
    return `Task: ${input.task.description}

File to write: ${input.task.file}
Action: ${input.task.action}

Project context (check Data Models and existing API contracts):
${input.projectContext || '(no context yet)'}

${input.existingFileContent ? `Existing route file:
${input.existingFileContent}` : ''}

Write the complete Next.js route handler. Follow all rules from the system prompt.
Output ONLY the TypeScript code.`
  }

  protected contextUpdate(task: PlanTask, code: string): string {
    // Extract HTTP methods exported from the route
    const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'].filter((m) =>
      code.includes(`export async function ${m}`) || code.includes(`export const ${m}`),
    )

    const methodList = methods.map((m) => `  - ${m} ${task.file.replace('app/api', '/api').replace('/route.ts', '')}`).join('\n')

    return `\n### ${task.id}: ${task.file}\n${task.description}\nHTTP methods:\n${methodList}\n`
  }
}
