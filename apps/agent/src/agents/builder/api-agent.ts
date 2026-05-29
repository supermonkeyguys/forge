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

export class ApiAgent extends BaseBuilderAgent {
  readonly role = 'api' as const

  protected systemPrompt(): string {
    return `You are the API Agent for Forge. You write Next.js App Router API route handlers ONLY.

ROUTE HANDLER RULES:
1. File must export named async functions: GET, POST, PUT, PATCH, DELETE
2. Use NextRequest and NextResponse from 'next/server'
3. Validate request body with zod BEFORE calling any logic
4. Call server-side domain/infra functions (NOT the packages/core client hooks)
5. Map errors to HTTP responses using this pattern:
   catch (err) {
     if (err instanceof ZodError) return NextResponse.json({ error: err.flatten() }, { status: 400 })
     if (err.message === 'NOT_FOUND') return NextResponse.json({ error: 'not found' }, { status: 404 })
     return NextResponse.json({ error: 'internal error' }, { status: 500 })
   }
6. Success responses: NextResponse.json({ data: result }) for single, { data: [...], total: N } for lists
7. NO business if/else logic — route handlers only do: validate → call → respond
8. Import DB client from server/infra/, NOT from packages/core/

AUTHENTICATION:
- Protected routes: import { getServerSession } from 'next-auth' and check session
- Return 401 if session missing on protected routes

Output ONLY the TypeScript file content — no explanation, no markdown fence.`
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
