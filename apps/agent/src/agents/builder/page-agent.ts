/**
 * Page Agent — Tier 2
 *
 * Owns: app/<route>/page.tsx  (Next.js App Router pages)
 * Produces: Thin page components that assemble core hooks + ui components
 *
 * Rules (enforced by AGENTS.md):
 *   - Max 100 lines per page file
 *   - No business logic (no if/else on business state)
 *   - Only import from @forge/core (hooks) and @forge/ui (components)
 *   - No direct fetch/axios
 *   - No inline styles for business logic — only layout
 */

import type { PlanTask } from '../../contracts/task-plan.js'
import { BaseBuilderAgent, type TaskInput } from './base-builder.js'
import { getInstructions } from '../../lib/instruction-registry.js'

export class PageAgent extends BaseBuilderAgent {
  readonly role = 'page' as const

  protected systemPrompt(): string {
    return getInstructions('page')
  }

  protected buildTaskPrompt(input: TaskInput): string {
    return `Task: ${input.task.description}

File to write: ${input.task.file}
Action: ${input.task.action}

Project context (IMPORTANT: check "Available Hooks" and "Available UI Components" sections):
${input.projectContext || '(no context yet)'}

${input.existingFileContent ? `Existing page file:
${input.existingFileContent}` : ''}

Write the page assembly component. Keep it under 100 lines.
Only use hooks and components that are listed in project_context.md.
Output ONLY the TSX code.`
  }

  protected contextUpdate(task: PlanTask, code: string): string | null {
    // Pages don't update shared context (they consume it)
    return null
  }
}
