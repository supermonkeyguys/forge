import type { Capability, RunContext, CapabilityResult } from './types.js'

export class NotifyCapability implements Capability {
  readonly type = 'notify'

  async execute(
    instructions: string,
    config: Record<string, unknown> | undefined,
    ctx: RunContext,
  ): Promise<CapabilityResult> {
    const webhookUrl = config?.['webhookUrl'] as string | undefined
    const message = `[Forge Run ${ctx.jobId}] Step ${ctx.stepId}: ${instructions}`

    ctx.emit({ type: 'agent_thinking', agent: ctx.stepId, content: `发送通知：${message}` })

    if (webhookUrl) {
      try {
        await fetch(webhookUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ text: message, stepId: ctx.stepId, jobId: ctx.jobId }),
          signal: AbortSignal.timeout(10_000),
        })
      } catch (err) {
        return { status: 'failed', output: 'Webhook 发送失败', error: String(err) }
      }
    }

    console.log(`[notify] ${message}`)
    return { status: 'done', output: `通知已发送：${message}` }
  }
}
