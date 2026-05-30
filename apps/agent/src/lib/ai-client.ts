import { createOpenAI } from '@ai-sdk/openai'

const provider = createOpenAI({
  apiKey: process.env['OPENAI_API_KEY'] ?? '',
  baseURL: process.env['OPENAI_BASE_URL'] ?? undefined,
})

export const MODEL = process.env['OPENAI_MODEL'] ?? 'gpt-4o'

export const anthropic = provider
