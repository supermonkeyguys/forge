const FORGE_API_URL = process.env['FORGE_API_URL'] ?? ''
const INTERNAL_TOKEN = process.env['INTERNAL_TOKEN'] ?? ''

export interface MemoryEntry {
  id: string
  memoryKey: string
  content: string
  weight: number
}

export function buildMemoryContext(memories: Pick<MemoryEntry, 'memoryKey' | 'content'>[]): string {
  if (memories.length === 0) return ''
  const lines = memories.map((m) =>
    m.memoryKey ? `[${m.memoryKey}] ${m.content}` : m.content,
  )
  return `\n\n## Your relevant memories\n${lines.map((l) => `- ${l}`).join('\n')}`
}

export async function fetchTopMemories(
  agentKey: string,
  query: string,
  limit = 3,
): Promise<MemoryEntry[]> {
  if (!FORGE_API_URL) return []
  try {
    const url = `${FORGE_API_URL}/internal/agents/${encodeURIComponent(agentKey)}/memories?q=${encodeURIComponent(query)}&limit=${limit}`
    const res = await fetch(url, {
      headers: { 'X-Internal-Token': INTERNAL_TOKEN },
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return []
    const json = await res.json() as { data: MemoryEntry[] }
    return json.data ?? []
  } catch {
    return []
  }
}

export async function saveMemory(
  agentKey: string,
  memoryKey: string,
  content: string,
  userId = '',
): Promise<void> {
  if (!FORGE_API_URL || !userId) return
  try {
    await fetch(`${FORGE_API_URL}/internal/agents/${encodeURIComponent(agentKey)}/memories`, {
      method: 'POST',
      headers: {
        'X-Internal-Token': INTERNAL_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ memoryKey, content, userId }),
      signal: AbortSignal.timeout(3000),
    })
  } catch (err) {
    console.error('[saveMemory] failed:', err)
  }
}
