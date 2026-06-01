/**
 * Logic Agent — Tier 2
 *
 * Owns: packages/core/<domain>/*.ts  and  server/domain/*.ts
 * Produces: TanStack Query hooks, Zustand stores, domain business functions, unit tests
 *
 * Rules (enforced by AGENTS.md):
 *   - ZERO react-dom imports
 *   - ZERO @forge/ui imports
 *   - ZERO direct fetch — all API calls go through packages/core/api/client.ts
 *   - Zustand selectors must return primitives (not objects)
 *   - Every hook must have a companion .test.ts file
 *   - Test files use Vitest, node environment (no DOM)
 */

import type { PlanTask } from '../../contracts/task-plan.js'
import { BaseBuilderAgent, type TaskInput } from './base-builder.js'
import { getInstructions } from '../../lib/instruction-registry.js'

export class LogicAgent extends BaseBuilderAgent {
  readonly role = 'logic' as const

  protected systemPrompt(): string {
    return getInstructions('logic')
  }

  protected buildTaskPrompt(input: TaskInput): string {
    const isTest = input.task.file.endsWith('.test.ts')
    const isStore = input.task.file.includes('-store.ts')

    return `Task: ${input.task.description}

File to write: ${input.task.file}
Action: ${input.task.action}

Project context (read the API contracts and available hooks):
${input.projectContext || '(no context yet)'}

${input.existingFileContent ? `Existing file content:
${input.existingFileContent}` : ''}

${isTest
  ? 'Write the complete test file. Cover loading, success, and error states. Mock external dependencies.'
  : isStore
  ? 'Write the complete Zustand store. Export stable selector functions (not inline selectors).'
  : 'Write the complete hook or domain function. Follow all import rules from the system prompt.'
}

Output ONLY the TypeScript code.`
  }

  protected contextUpdate(task: PlanTask, _code: string): string | null {
    // Test files don't update context
    if (task.file.endsWith('.test.ts')) return null

    return `\n### ${task.id}: ${task.file}\n${task.description}\n`
  }
}
