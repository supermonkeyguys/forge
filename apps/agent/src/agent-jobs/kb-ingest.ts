import { generateText } from 'ai'
import { anthropic, MODEL } from '../lib/ai-client.js'

const FORGE_API_URL = process.env['FORGE_API_URL'] ?? ''
const INTERNAL_TOKEN = process.env['INTERNAL_TOKEN'] ?? ''
const HEADERS = { 'Content-Type': 'application/json', 'X-Internal-Token': INTERNAL_TOKEN }

export async function runKBIngestJob(
  kbEntryId: string,
  inputType: 'url' | 'file',
  sourceRef: string,
): Promise<void> {
  let rawContent = ''

  if (inputType === 'url') {
    try {
      const res = await fetch(sourceRef, { signal: AbortSignal.timeout(10000) })
      // Strip HTML tags
      const html = await res.text()
      rawContent = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 8000)
    } catch (err) {
      await updateKBEntry(kbEntryId, `Failed to fetch URL: ${err}`, 'pending')
      return
    }
  } else if (inputType === 'file') {
    const { readFileSync } = await import('fs')
    try {
      rawContent = readFileSync(sourceRef, 'utf-8').slice(0, 8000)
    } catch (err) {
      await updateKBEntry(kbEntryId, `Failed to read file: ${err}`, 'pending')
      return
    }
  }

  if (!rawContent.trim()) {
    await updateKBEntry(kbEntryId, '(empty content)', 'pending')
    return
  }

  const { text: summary } = await generateText({
    model: anthropic(MODEL),
    system: `You extract structured knowledge from content.
Output a concise summary (max 400 words) that:
- Captures key principles, rules, or decisions
- Is written as actionable knowledge, not a description of the source
- Uses bullet points for distinct items
Do NOT mention the source URL or filename. Output only the knowledge.`,
    prompt: rawContent,
  })

  await updateKBEntry(kbEntryId, summary.trim(), 'pending')
}

async function updateKBEntry(id: string, content: string, status: string): Promise<void> {
  if (!FORGE_API_URL) return
  try {
    await fetch(`${FORGE_API_URL}/internal/kb/${id}/content`, {
      method: 'PATCH',
      headers: HEADERS,
      body: JSON.stringify({ content, status }),
      signal: AbortSignal.timeout(5000),
    })
  } catch (err) { console.error('[updateKBEntry] failed:', err) }
}
