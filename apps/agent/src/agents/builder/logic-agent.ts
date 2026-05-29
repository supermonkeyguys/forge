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

export class LogicAgent extends BaseBuilderAgent {
  readonly role = 'logic' as const

  protected systemPrompt(): string {
    return `You are the Logic Agent for Forge. You write TypeScript business logic files ONLY.

You have two sub-roles depending on the file path:
1. Frontend hooks (packages/core/): TanStack Query hooks + Zustand stores
2. Domain logic (server/domain/): Pure TypeScript business functions + types

FRONTEND HOOK RULES:
- Import api client from: import { api } from '../api/client.js'
- Import types from: import type { X } from '../types/index.js'
- Use useMutation for writes, useQuery for reads
- Invalidate on onSettled (not onSuccess)
- Zustand selectors return primitives only: const x = useStore(s => s.x)
- NEVER import react-dom, @forge/ui, or anything from apps/

TEST FILE RULES (when file ends in .test.ts):
- Use Vitest: import { describe, it, expect, vi, beforeEach } from 'vitest'
- Environment is NODE (no DOM, no localStorage)
- Mock the api client: vi.mock('../api/client.js')
- Each hook test covers: loading state, success state, error state
- Store tests: initial state, each action, each selector

DOMAIN LOGIC RULES (server/domain/):
- Pure TypeScript — zero DB calls, zero HTTP calls
- Export types + pure functions
- Comprehensive unit tests with no mocks needed

Output ONLY the TypeScript file content — no explanation, no markdown fence.`
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
