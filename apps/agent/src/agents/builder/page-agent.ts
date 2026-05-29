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

export class PageAgent extends BaseBuilderAgent {
  readonly role = 'page' as const

  protected systemPrompt(): string {
    return `You are the Page Agent for Forge. You write Next.js App Router page components ONLY.

PAGE RULES:
1. Pages are assembly only — connect @forge/core hooks to @forge/ui components
2. MAX 100 lines per page file (including imports). If longer, something is wrong.
3. NEVER write business logic (no complex if/else on business state)
4. NEVER import direct from react-query, zustand, or fetch/axios
5. Import data hooks from @forge/core: import { useX } from '@forge/core'
6. Import UI components from @forge/ui: import { Button, Input } from '@forge/ui'
7. Use Next.js 'use client' directive if the page uses hooks
8. Handle loading and error states with simple UI (a spinner, an error message)
9. Use semantic HTML for layout (main, section, header, etc.)

PATTERN to follow:
\`\`\`tsx
'use client'
import { useMyHook } from '@forge/core'
import { Button, Input } from '@forge/ui'

export default function MyPage() {
  const { data, isLoading, error } = useMyHook()

  if (isLoading) return <div>Loading...</div>
  if (error) return <div>Error: {error.message}</div>

  return (
    <main>
      {/* assembly of UI components with data */}
    </main>
  )
}
\`\`\`

Output ONLY the TSX file content — no explanation, no markdown fence.`
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
