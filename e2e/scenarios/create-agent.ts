import type { Scenario } from '../harness/types'

const TEST_EMAIL = process.env['SCENARIO_EMAIL'] ?? 'scenario-test@forge.dev'
const TEST_PASSWORD = process.env['SCENARIO_PASSWORD'] ?? 'scenario-password-123'

type AgentData = {
  id?: string
  name?: string
  description?: string
  instructions?: string
  tools?: string[]
}

export const createAgentScenario: Scenario = {
  name: '创建员工 Agent',

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
  },

  teardown: async (ctx) => {
    if (ctx.state['agentId']) {
      await ctx.api.delete(`/api/v1/agents/${ctx.state['agentId']}`)
    }
  },

  steps: [
    {
      name: 'POST /api/v1/agents — create agent',
      run: async (ctx) => {
        const res = await ctx.api.post<{ data?: AgentData }>(
          '/api/v1/agents',
          {
            name: 'scenario-test-agent',
            description: 'An agent created by the scenario harness',
            instructions: 'You are a test agent. Answer concisely.',
            tools: ['read_file', 'write_file'],
            writePaths: ['src/'],
          },
        )
        ctx.checkpoint('status 201', res.status === 201, `got ${res.status}`)
        ctx.checkpoint('has id', !!res.data?.data?.id, JSON.stringify(res.data))
        ctx.checkpoint('name matches', res.data?.data?.name === 'scenario-test-agent')
        ctx.checkpoint('tools saved', res.data?.data?.tools?.length === 2)
        ctx.state['agentId'] = res.data?.data?.id ?? ''
      },
    },

    {
      name: 'GET /api/v1/agents/:id — fetch by ID',
      run: async (ctx) => {
        const res = await ctx.api.get<{ data?: AgentData }>(
          `/api/v1/agents/${ctx.state['agentId']}`,
        )
        ctx.checkpoint('status 200', res.status === 200, `got ${res.status}`)
        ctx.checkpoint('id matches', res.data?.data?.id === ctx.state['agentId'])
        ctx.checkpoint('instructions saved', !!res.data?.data?.instructions)
      },
    },

    {
      name: 'GET /api/v1/agents — agent appears in list',
      run: async (ctx) => {
        const res = await ctx.api.get<{ data?: AgentData[] }>('/api/v1/agents')
        ctx.checkpoint('status 200', res.status === 200, `got ${res.status}`)
        const found = (res.data?.data ?? []).some((a) => a.id === ctx.state['agentId'])
        ctx.checkpoint('agent in list', found, `agent ${ctx.state['agentId']} not found`)
      },
    },
  ],
}
