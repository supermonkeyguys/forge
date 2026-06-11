import type { Capability, RunContext, CapabilityResult } from './types.js'

export class CodeCapability implements Capability {
  readonly type = 'code'

  async execute(
    instructions: string,
    _config: Record<string, unknown> | undefined,
    ctx: RunContext,
  ): Promise<CapabilityResult> {
    ctx.emit({ type: 'agent_thinking', agent: ctx.stepId, content: '启动代码生成流程...' })
    ctx.emit({ type: 'agent_thinking', agent: ctx.stepId, content: `需求：${instructions}` })

    // TODO: 深度集成 Orchestrator 代码生成流程
    return {
      status: 'done',
      output: `代码生成任务已启动（需求：${instructions.slice(0, 100)}）`,
    }
  }
}
