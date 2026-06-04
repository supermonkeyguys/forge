const FORGE_API_URL = process.env['FORGE_API_URL'] ?? ''
const INTERNAL_TOKEN = process.env['INTERNAL_TOKEN'] ?? ''
const HEADERS = { 'Content-Type': 'application/json', 'X-Internal-Token': INTERNAL_TOKEN }

export interface KBEntry {
  id: string
  type: string
  title: string
  content: string
  tags: string[]
  status: string
  confidence: number
}

/** Fetch all verified principles — always injected into every task. */
export async function fetchPrinciples(projectId: string, userID: string): Promise<KBEntry[]> {
  if (!FORGE_API_URL || !projectId || !userID) return []
  try {
    const url = `${FORGE_API_URL}/internal/projects/${encodeURIComponent(projectId)}/kb?type=principle&userid=${encodeURIComponent(userID)}&limit=20`
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(3000) })
    if (!res.ok) return []
    const json = await res.json() as { data: KBEntry[] }
    return json.data ?? []
  } catch { return [] }
}

/** Semantic search for KB entries of a specific type. */
export async function searchProjectKB(
  projectId: string,
  userID: string,
  query: string,
  type: string,
  limit = 3,
): Promise<KBEntry[]> {
  if (!FORGE_API_URL || !projectId || !userID) return []
  try {
    const url = `${FORGE_API_URL}/internal/projects/${encodeURIComponent(projectId)}/kb?type=${type}&userid=${encodeURIComponent(userID)}&q=${encodeURIComponent(query)}&limit=${limit}`
    const res = await fetch(url, { headers: HEADERS, signal: AbortSignal.timeout(3000) })
    if (!res.ok) return []
    const json = await res.json() as { data: KBEntry[] }
    return json.data ?? []
  } catch { return [] }
}

/** Agent submits a pending KB entry (needs human verification). */
export async function submitKBEntry(
  projectId: string,
  userID: string,
  entry: { type: string; title: string; content: string; tags?: string[]; sourceAgent: string; sourceTask: string; confidence?: number },
): Promise<void> {
  if (!FORGE_API_URL || !projectId || !userID) return
  try {
    await fetch(`${FORGE_API_URL}/internal/projects/${encodeURIComponent(projectId)}/kb`, {
      method: 'POST',
      headers: HEADERS,
      body: JSON.stringify({ ...entry, userId: userID, tags: entry.tags ?? [] }),
      signal: AbortSignal.timeout(5000),
    })
  } catch (err) { console.error('[submitKBEntry] failed:', err) }
}

/** Build typed KB context string for system prompt injection. */
export function buildTypedKBContext(params: {
  principles: KBEntry[]
  specs: KBEntry[]
  testAssets?: KBEntry[]
  pastOutputs: KBEntry[]
}): string {
  const parts: string[] = []
  if (params.principles.length > 0) {
    parts.push('## Project Principles\n' +
      params.principles.map((e) => `- **${e.title}**: ${e.content}`).join('\n'))
  }
  if (params.specs.length > 0) {
    parts.push('## Relevant Design Specs\n' +
      params.specs.map((e) => `### ${e.title}\n${e.content}`).join('\n\n'))
  }
  if (params.testAssets && params.testAssets.length > 0) {
    parts.push('## Test Assets\n' +
      params.testAssets.map((e) => `- ${e.title}: ${e.content}`).join('\n'))
  }
  if (params.pastOutputs.length > 0) {
    parts.push('## Past Solutions\n' +
      params.pastOutputs.map((e) => `### ${e.title}\n${e.content}`).join('\n\n'))
  }
  return parts.length > 0 ? '\n\n' + parts.join('\n\n') : ''
}
