import type { WorkflowStep, StepResult } from '../contracts/workflow.js'
import { getCapability } from '../capabilities/index.js'
import type { RunContext } from '../capabilities/types.js'

export class WorkerAgent {
  async execute(step: WorkflowStep, ctx: RunContext): Promise<StepResult> {
    const capability = getCapability(step.capability)

    if (!capability) {
      return {
        stepId: step.id,
        status: 'failed',
        output: `未知 capability: ${step.capability}`,
        error:  `Capability "${step.capability}" not registered`,
      }
    }

    ctx.emit({
      type:    'agent_start',
      agent:   step.id,
      content: `[${step.name}] 开始执行（${step.capability}）`,
    })

    try {
      const result = await capability.execute(step.instructions, step.config, ctx)

      ctx.emit({
        type:    'agent_done',
        agent:   step.id,
        content: result.output,
      })

      return {
        stepId: step.id,
        status: result.status,
        output: result.output,
        data:   result.data,
        error:  result.error,
      }
    } catch (err) {
      const error = err instanceof Error ? err.message : String(err)
      ctx.emit({ type: 'agent_error', agent: step.id, content: error })
      return { stepId: step.id, status: 'failed', output: '执行失败', error }
    }
  }
}
