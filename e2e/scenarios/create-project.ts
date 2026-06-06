import type { Scenario } from '../harness/types'

const TEST_EMAIL = process.env['SCENARIO_EMAIL'] ?? 'scenario-test@forge.dev'
const TEST_PASSWORD = process.env['SCENARIO_PASSWORD'] ?? 'scenario-password-123'
const WEB_BASE = process.env['WEB_BASE_URL'] ?? 'http://localhost:5173'

export const createProjectScenario: Scenario = {
  name: '创建项目走流程',

  setup: async (ctx) => {
    // Register test user (409 if already exists → fall back to login)
    const reg = await ctx.api.post<{ data?: { token?: string } }>(
      '/api/v1/auth/register',
      { email: TEST_EMAIL, password: TEST_PASSWORD, name: 'Scenario Test User' },
    )
    if (reg.status === 201 && reg.data?.data?.token) {
      ctx.state['_token'] = reg.data.data.token
      return
    }
    // Fall back to login if already registered
    const login = await ctx.api.post<{ data?: { token?: string } }>(
      '/api/v1/auth/login',
      { email: TEST_EMAIL, password: TEST_PASSWORD },
    )
    ctx.state['_token'] = login.data?.data?.token ?? ''
  },

  teardown: async (_ctx) => {
    // No delete-user endpoint — test user is stable across runs
  },

  steps: [
    {
      name: 'POST /api/v1/projects — create project',
      run: async (ctx) => {
        const res = await ctx.api.post<{ data?: { id?: string; status?: string } }>(
          '/api/v1/projects',
          { name: 'scenario-test-project' },
        )
        ctx.checkpoint('status 201', res.status === 201, `got ${res.status}`)
        ctx.checkpoint('has project id', !!res.data?.data?.id, `data: ${JSON.stringify(res.data)}`)
        if (res.data?.data?.id) {
          ctx.state['projectId'] = res.data.data.id
        }
      },
    },

    {
      name: 'GET /api/v1/projects — project appears in list',
      run: async (ctx) => {
        const res = await ctx.api.get<{ data?: Array<{ id: string; name: string }> }>(
          '/api/v1/projects',
        )
        ctx.checkpoint('status 200', res.status === 200, `got ${res.status}`)
        const found = (res.data?.data ?? []).some(
          (p) => p.id === ctx.state['projectId'],
        )
        ctx.checkpoint('project in list', found, `project ${ctx.state['projectId']} not found in list`)
      },
    },

    {
      name: 'UI: /projects page loads after dev login',
      run: async (ctx) => {
        const page = await ctx.getPage()
        // App stores auth in Zustand memory (not localStorage), so use the dev
        // login button — the same flow as layer1/layer2 fixtures.
        // This step verifies the UI layer is reachable; the created project is
        // already verified via API in steps 1 and 2.
        await page.goto(`${WEB_BASE}/login`)
        await page.getByRole('button', { name: '快速登录（开发模式）' }).click()
        await page.waitForURL('**/projects', { timeout: 10_000 })
        await page.waitForLoadState('networkidle')
        const heading = await page.getByRole('heading', { name: '我的项目' })
          .waitFor({ timeout: 5_000 })
          .then(() => true)
          .catch(() => false)
        ctx.checkpoint('projects page loaded', heading, '/projects heading not visible after dev login')
      },
    },
  ],
}
