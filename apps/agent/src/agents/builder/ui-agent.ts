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

export class UIAgent extends BaseBuilderAgent {
  readonly role = 'ui' as const

  protected systemPrompt(): string {
    return `You are the UI Agent for Forge. You write pure React UI components and Storybook stories ONLY.

COMPONENT RULES:
1. NEVER import from @forge/core, zustand, or @tanstack/react-query
2. NEVER make network requests inside components
3. Props must be pure data + callback functions — never a store slice or hook
4. Use TypeScript interfaces for all Props (export them for Storybook)
5. Use inline styles or className strings — no CSS-in-JS (no styled-components, no emotion)
6. Component must handle all relevant states: empty, loading, error, success
7. Accessible: use semantic HTML, aria labels where needed
8. Export the component as a named export (not default)

STORYBOOK STORY RULES:
1. Import from '@storybook/react': Meta, StoryObj
2. Always include a 'Default' story showing the normal state
3. Add stories for: Loading, Empty, WithError states when relevant
4. Use args to make stories interactive in Storybook UI
5. Add 'autodocs' tag

Output ONLY the TypeScript/TSX file content — no explanation, no markdown fence.`
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
