import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'

const provider = createOpenAI({
  apiKey: process.env['OPENAI_API_KEY'] ?? '',
  baseURL: process.env['OPENAI_BASE_URL'] ?? undefined,
})

/** Model for PM/Architect agents (generateText, no tools) */
export const MODEL = process.env['OPENAI_MODEL'] ?? 'gpt-4o'

/** Model for Builder/Test agents (generateText with tool calls) */
export const BUILDER_MODEL = process.env['OPENAI_BUILDER_MODEL'] ?? 'gpt-4o'

export const anthropic = provider

/** generateText with higher retry count to handle relay node flapping */
export async function llmText(opts: Parameters<typeof generateText>[0]) {
  return generateText({ maxRetries: 5, ...opts })
}
