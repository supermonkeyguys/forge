import type { Scenario } from '../harness/types'

const TEST_EMAIL = process.env['SCENARIO_EMAIL'] ?? 'scenario-test@forge.dev'
const TEST_PASSWORD = process.env['SCENARIO_PASSWORD'] ?? 'scenario-password-123'
const TEST_URL = process.env['SCENARIO_KB_URL'] ?? 'https://example.com'

type KBEntry = { id: string; status: string; content: string; title: string }
type KBList = { data?: KBEntry[] }
type ProjectData = { data?: { id?: string } }

export const kbIngestScenario: Scenario = {
  name: 'URL 导入知识库',

  setup: async (ctx) => {
    const reg = await ctx.api.post<{ data?: { token?: string } }>(
      '/api/v1/auth/register',
      { email: TEST_EMAIL, password: TEST_PASSWORD, name: 'Scenario Test User' },
    )
    if (reg.status === 201 && reg.data?.data?.token) {
      ctx.state['_token'] = reg.data.data.token
    } else {
      const login = await ctx.api.post<{ data?: { token?: string } }>(
        '/api/v1/auth/login',
        { email: TEST_EMAIL, password: TEST_PASSWORD },
      )
      ctx.state['_token'] = login.data?.data?.token ?? ''
    }

    const project = await ctx.api.post<ProjectData>(
      '/api/v1/projects',
      { name: `kb-test-${Date.now()}` },
    )
    ctx.state['projectId'] = project.data?.data?.id ?? ''
  },

  teardown: async (ctx) => {
    if (ctx.state['projectId']) {
      await ctx.api.delete(`/api/v1/projects/${ctx.state['projectId']}`)
    }
  },

  steps: [
    {
      name: 'POST /kb/ingest — submit URL',
      run: async (ctx) => {
        const res = await ctx.api.postForm<{ data?: KBEntry }>(
          `/api/v1/projects/${ctx.state['projectId']}/kb/ingest`,
          { inputType: 'url', sourceRef: TEST_URL, title: 'Scenario KB Test' },
        )
        ctx.checkpoint('accepted 202', res.status === 202, `got ${res.status}`)
        ctx.checkpoint('has entry id', !!res.data?.data?.id, JSON.stringify(res.data))
        ctx.state['entryId'] = res.data?.data?.id ?? ''
      },
    },

    {
      name: 'poll until ingestion complete',
      run: async (ctx) => {
        const final = await ctx.pollUntil<KBList>(
          () => ctx.api.get(`/api/v1/projects/${ctx.state['projectId']}/kb`),
          (r) => {
            const entry = (r.data?.data ?? []).find((e) => e.id === ctx.state['entryId'])
            return !!entry && entry.status !== 'processing'
          },
          { timeout: 90_000, interval: 2_000 },
        )
        const entry = (final.data?.data ?? []).find((e) => e.id === ctx.state['entryId'])
        ctx.checkpoint('status is pending', entry?.status === 'pending', `status: ${entry?.status}`)
        ctx.checkpoint(
          'content generated',
          !!entry?.content && entry.content !== '(processing…)',
          `content: ${entry?.content?.slice(0, 60)}`,
        )
      },
    },
  ],
}
