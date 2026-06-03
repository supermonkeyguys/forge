const FORGE_API_URL = process.env['FORGE_API_URL'] ?? ''
const INTERNAL_TOKEN = process.env['INTERNAL_TOKEN'] ?? ''

const ROLE_SECTIONS: Record<string, string[]> = {
  schema: ['App Overview', 'Architecture Decisions'],
  logic:  ['App Overview', 'Data Models', 'API Contracts'],
  api:    ['App Overview', 'Data Models', 'Architecture Decisions'],
  ui:     ['App Overview', 'Available Hooks'],
  page:   ['App Overview', 'Available Hooks', 'Available UI Components', 'API Contracts'],
}

export interface ProjectContextClient {
  upsertSection(projectId: string, heading: string, content: string, agentRole: string, taskId: string): Promise<void>
  getRelevantContext(projectId: string, role: string): Promise<string>
}

export function createProjectContextClient(): ProjectContextClient | null {
  if (!FORGE_API_URL) return null

  const headers = {
    'Content-Type': 'application/json',
    'X-Internal-Token': INTERNAL_TOKEN,
  }

  return {
    async upsertSection(projectId, heading, content, agentRole, taskId) {
      try {
        await fetch(
          `${FORGE_API_URL}/internal/projects/${projectId}/context/${encodeURIComponent(heading)}`,
          {
            method: 'PUT',
            headers,
            body: JSON.stringify({ content, agentRole, taskId }),
            signal: AbortSignal.timeout(5000),
          },
        )
      } catch (err) {
        console.error('[ProjectContextClient.upsertSection] failed:', err)
      }
    },

    async getRelevantContext(projectId, role) {
      try {
        const url = new URL(`${FORGE_API_URL}/internal/projects/${projectId}/context`)
        url.searchParams.set('format', 'markdown')
        const res = await fetch(url.toString(), { headers, signal: AbortSignal.timeout(5000) })
        if (!res.ok) return ''
        const full = await res.text()
        const needed = ROLE_SECTIONS[role]
        if (!needed) return full
        const sections = full.split(/^(?=## )/m)
        return sections
          .filter((s) => !s.startsWith('## ') || needed.some((n) => s.startsWith(`## ${n}`)))
          .join('')
      } catch {
        return ''
      }
    },
  }
}
