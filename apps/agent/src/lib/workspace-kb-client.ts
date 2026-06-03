const FORGE_API_URL = process.env['FORGE_API_URL'] ?? ''
const INTERNAL_TOKEN = process.env['INTERNAL_TOKEN'] ?? ''

export interface KBSearchResult {
  title: string
  content: string
  verified: boolean
  tags: string[]
}

export function buildKBContext(entries: Pick<KBSearchResult, 'title' | 'content'>[]): string {
  if (entries.length === 0) return ''
  return `\n\n## Company Knowledge\n${entries.map((e) => `### ${e.title}\n${e.content}`).join('\n\n')}`
}

export async function searchKB(
  userID: string,
  query: string,
  limit = 3,
): Promise<KBSearchResult[]> {
  if (!FORGE_API_URL || !userID) return []
  try {
    const url = `${FORGE_API_URL}/internal/kb?userid=${encodeURIComponent(userID)}&q=${encodeURIComponent(query)}&limit=${limit}`
    const res = await fetch(url, {
      headers: { 'X-Internal-Token': INTERNAL_TOKEN },
      signal: AbortSignal.timeout(3000),
    })
    if (!res.ok) return []
    const json = await res.json() as { data: KBSearchResult[] }
    return json.data ?? []
  } catch {
    return []
  }
}

export async function saveToKB(
  userID: string,
  title: string,
  content: string,
  tags: string[],
  sourceAgent: string,
  sourceTask: string,
): Promise<void> {
  if (!FORGE_API_URL || !userID) return
  try {
    await fetch(`${FORGE_API_URL}/internal/kb`, {
      method: 'POST',
      headers: {
        'X-Internal-Token': INTERNAL_TOKEN,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ userId: userID, title, content, tags, sourceAgent, sourceTask }),
      signal: AbortSignal.timeout(3000),
    })
  } catch (err) {
    console.error('[saveToKB] failed:', err)
  }
}
