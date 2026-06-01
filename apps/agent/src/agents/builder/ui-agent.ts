/**
 * UI Agent — Tier 2
 *
 * Owns: packages/ui/<name>/<name>.tsx  and  *.stories.tsx
 * Produces: Pure React UI components + Storybook stories
 *
 * Rules (enforced by AGENTS.md):
 *   - ZERO @forge/core imports
 *   - ZERO zustand imports
 *   - ZERO network requests inside components
 *   - Props are pure data + callbacks only (no store slices)
 *   - Every component gets a companion .stories.tsx
 *   - Styling with inline styles or CSS classes (no CSS-in-JS libraries)
 */

import type { PlanTask } from '../../contracts/task-plan.js'
import { BaseBuilderAgent, type TaskInput } from './base-builder.js'
import { getInstructions } from '../../lib/instruction-registry.js'

export class UIAgent extends BaseBuilderAgent {
  readonly role = 'ui' as const

  protected systemPrompt(): string {
    return getInstructions('ui')
  }

  protected buildTaskPrompt(input: TaskInput): string {
    const isStory = input.task.file.endsWith('.stories.tsx')

    return `Task: ${input.task.description}

File to write: ${input.task.file}
Action: ${input.task.action}

Project context (check available components):
${input.projectContext || '(no context yet)'}

${input.existingFileContent ? `Existing file:
${input.existingFileContent}` : ''}

${isStory
  ? 'Write the complete Storybook stories file. Include Default story plus states (Loading, Empty, Error, etc.).'
  : 'Write the complete React component. Export a TypeScript interface for Props. Handle all UI states.'
}

Output ONLY the TSX code.`
  }

  protected contextUpdate(task: PlanTask, code: string): string | null {
    // Story files don't update context
    if (task.file.endsWith('.stories.tsx')) return null

    // Extract exported component name
    const match = code.match(/export function (\w+)/) ?? code.match(/export const (\w+)/)
    const componentName = match?.[1] ?? task.file.split('/').pop()?.replace('.tsx', '')

    return `\n### ${task.id}: ${task.file}\nComponent: \`<${componentName} />\`\n${task.description}\n`
  }
}
