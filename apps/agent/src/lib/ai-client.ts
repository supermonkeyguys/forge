import { createOpenAI } from '@ai-sdk/openai'
import { generateText, tool, zodSchema, type ToolParameters } from 'ai'
import { readFileSync } from 'fs'
import { resolve } from 'path'
import type { ZodType } from 'zod'

/**
 * Wraps ai.tool() to fix Zod v3 + ai v6 incompatibility.
 * ai v6 uses tool.inputSchema but tool() only sets tool.parameters for Zod v3.
 * This wrapper copies zodSchema(parameters) → inputSchema so the SDK sends correct schemas.
 */
export function createTool<P extends ZodType<any>>(config: {
  description: string
  parameters: P
  execute: (params: P['_output']) => Promise<unknown>
}) {
  const t = tool(config as Parameters<typeof tool>[0])
  if (!t.inputSchema && config.parameters) {
    (t as Record<string, unknown>)['inputSchema'] = zodSchema(config.parameters)
  }
  return t
}

const provider = createOpenAI({
  apiKey: process.env['OPENAI_API_KEY'] ?? '',
  baseURL: process.env['OPENAI_BASE_URL'] ?? undefined,
  compatibility: 'compatible', // use /v1/chat/completions, not /v1/responses
})

/** Model for PM/Architect agents (generateText, no tools) */
export const MODEL = process.env['OPENAI_MODEL'] ?? 'gpt-4o'

/** Model for Builder/Test agents (generateText with tool calls) */
export const BUILDER_MODEL = process.env['OPENAI_BUILDER_MODEL'] ?? 'gpt-4o'

// Use .chat() to force /v1/chat/completions — provider() defaults to /v1/responses in v3
// Pass strictJsonSchema:false so tool parameter schemas are sent as-is (DeepSeek rejects strict mode)
export const anthropic = (model: string) => provider.chat(model, { strictJsonSchema: false })

/** generateText with higher retry count to handle relay node flapping.
 *  When FORGE_USE_STUB=true, returns a fixture instead of calling the LLM. */
export async function llmText(opts: Parameters<typeof generateText>[0]) {
  if (process.env['FORGE_USE_STUB'] === 'true') {
    const fixturePath = resolve(process.cwd(), 'e2e/fixtures/llm-stubs/default.txt')
    const text = readFileSync(fixturePath, 'utf-8')
    return { text, usage: { promptTokens: 0, completionTokens: 0 }, finishReason: 'stop' as const }
  }
  return generateText({ maxRetries: 5, ...opts })
}
