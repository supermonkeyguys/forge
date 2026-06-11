import type { Capability, RunContext, CapabilityResult } from './types.js'
import { llmText, anthropic, MODEL } from '../lib/ai-client.js'

export class LLMCapability implements Capability {
  readonly type = 'llm'

  async execute(
    instructions: string,
    _config: Record<string, unknown> | undefined,
    ctx: RunContext,
  ): Promise<CapabilityResult> {
    ctx.emit({ type: 'agent_thinking', agent: ctx.stepId, content: '分析中...' })

    const previousContext = Object.entries(ctx.previousOutputs)
      .map(([id, out]) => `Step ${id} output:\n${out}`)
      .join('\n\n')

    const { text } = await llmText({
      model: anthropic(MODEL),
      system: '你是一名专业的数字助理，严格按照指令执行任务，输出简洁清晰的结果。',
      prompt: previousContext
        ? `Previous steps context:\n${previousContext}\n\nTask: ${instructions}`
        : instructions,
    })

    ctx.emit({ type: 'agent_thinking', agent: ctx.stepId, content: text.slice(0, 200) })

    return {
      status: 'done',
      output: text,
      data: { result: text },
    }
  }
}
