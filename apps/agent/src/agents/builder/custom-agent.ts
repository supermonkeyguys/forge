import type { PlanTask, AgentRole } from '../../contracts/task-plan.js'
import { BaseBuilderAgent, type TaskInput } from './base-builder.js'

export interface CustomAgentConfig {
  instructions: string
  tools: string[]
  writePaths: string[]
}

export class CustomBuilderAgent extends BaseBuilderAgent {
  readonly role: AgentRole

  constructor(role: AgentRole, private config: CustomAgentConfig) {
    super()
    this.role = role
  }

  protected systemPrompt(): string {
    return this.config.instructions
  }

  protected buildTaskPrompt(input: TaskInput): string {
    return [
      `Task: ${input.task.description}`,
      `File: ${input.task.file}`,
      `Action: ${input.task.action}`,
      input.projectContext ? `\nContext:\n${input.projectContext}` : '',
    ].filter(Boolean).join('\n')
  }

  protected contextUpdate(_task: PlanTask, _code: string): null {
    return null
  }

  protected writeGuard(): (path: string) => boolean {
    const prefixes = this.config.writePaths
    return (path: string) =>
      prefixes.length === 0 || prefixes.some(prefix => path.startsWith(prefix))
  }
}
