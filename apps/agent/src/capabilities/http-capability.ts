import type { Capability, RunContext, CapabilityResult } from './types.js'
import { llmText, anthropic, MODEL } from '../lib/ai-client.js'

export class HTTPCapability implements Capability {
  readonly type = 'http'

  async execute(
    instructions: string,
    config: Record<string, unknown> | undefined,
    ctx: RunContext,
  ): Promise<CapabilityResult> {
    const { text } = await llmText({
      model: anthropic(MODEL),
      system: 'You extract HTTP request parameters from instructions. Reply with JSON only: {"method":"GET","url":"...","headers":{},"body":null}',
      prompt: `Config: ${JSON.stringify(config)}\nInstructions: ${instructions}`,
    })

    const params = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}') as {
      method: string; url: string; headers?: Record<string, string>; body?: unknown
    }

    ctx.emit({ type: 'agent_thinking', agent: ctx.stepId, content: `${params.method} ${params.url}` })

    try {
      const res = await fetch(params.url, {
        method: params.method,
        headers: { 'Content-Type': 'application/json', ...params.headers },
        body: params.body ? JSON.stringify(params.body) : undefined,
        signal: AbortSignal.timeout(30_000),
      })
      const responseText = await res.text()
      const body = responseText.slice(0, 4000)
      ctx.emit({ type: 'agent_thinking', agent: ctx.stepId, content: `HTTP ${res.status} — ${body.slice(0, 120)}…` })
      return {
        status: res.ok ? 'done' : 'failed',
        output: body,   // actual body passed as previousOutput to downstream steps
        data: { status: res.status, body, url: params.url },
        error: res.ok ? undefined : `HTTP ${res.status}: ${body.slice(0, 200)}`,
      }
    } catch (err) {
      return { status: 'failed', output: 'HTTP 请求失败', error: String(err) }
    }
  }
}
