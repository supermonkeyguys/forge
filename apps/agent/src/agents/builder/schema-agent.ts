/**
 * Schema Agent — Tier 2
 *
 * Owns: prisma/schema.prisma
 * Produces: Prisma schema with models, relations, enums
 * Rules:
 *   - Only writes prisma/schema.prisma
 *   - Must define all relations explicitly
 *   - Enum values must be SCREAMING_SNAKE_CASE
 *   - Every model must have id, createdAt, updatedAt
 *   - After writing, updates project_context.md "Data Models" section
 */

import type { PlanTask } from '../../contracts/task-plan.js'
import { BaseBuilderAgent, type TaskInput } from './base-builder.js'
import { getInstructions } from '../../lib/instruction-registry.js'

export class SchemaAgent extends BaseBuilderAgent {
  readonly role = 'schema' as const

  protected systemPrompt(): string {
    return getInstructions('schema')
  }

  protected buildTaskPrompt(input: TaskInput): string {
    return `Task: ${input.task.description}

Current project_context.md:
${input.projectContext || '(empty — this is the first task)'}

${input.existingFileContent ? `Current schema.prisma content:
\`\`\`prisma
${input.existingFileContent}
\`\`\`

Action: ${input.task.action} — add/modify the schema as described.` : 'Action: create — write the complete schema.prisma from scratch.'}

Write the complete prisma/schema.prisma file. Include datasource, generator, and all models.`
  }

  protected contextUpdate(task: PlanTask, code: string): string {
    // Extract model names from the schema
    const models = [...code.matchAll(/^model\s+(\w+)\s*\{/gm)].map((m) => m[1])
    if (models.length === 0) return ''

    const modelList = models.map((m) => `- ${m}`).join('\n')
    return `\n## Data Models (updated by Schema Agent — ${task.id})\n\n${modelList}\n`
  }
}
