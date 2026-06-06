import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ScenarioContext } from './context'

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
    status: 201,
    json: async () => ({ data: { id: 'p1' } }),
  }))
})

describe('ScenarioContext — checkpoints', () => {
  it('records a passing checkpoint', () => {
    const ctx = new ScenarioContext()
    ctx.checkpoint('project created', true)
    expect(ctx.flushCheckpoints()).toEqual([
      { name: 'project created', passed: true, details: undefined },
    ])
  })

  it('records a failing checkpoint with details', () => {
    const ctx = new ScenarioContext()
    ctx.checkpoint('job completed', false, 'expected: done, actual: building')
    const [c] = ctx.flushCheckpoints()
    expect(c.passed).toBe(false)
    expect(c.details).toBe('expected: done, actual: building')
  })

  it('flushCheckpoints clears the buffer', () => {
    const ctx = new ScenarioContext()
    ctx.checkpoint('test', true)
    ctx.flushCheckpoints()
    expect(ctx.flushCheckpoints()).toHaveLength(0)
  })

  it('state persists across flush calls', () => {
    const ctx = new ScenarioContext()
    ctx.state.projectId = 'proj-1'
    ctx.flushCheckpoints()
    expect(ctx.state.projectId).toBe('proj-1')
  })
})

describe('ScenarioContext — API client', () => {
  it('api.post records a log entry with correct method and url', async () => {
    const ctx = new ScenarioContext()
    await ctx.api.post('/api/v1/projects', { name: 'test' })
    const logs = ctx.flushLogs()
    expect(logs).toHaveLength(1)
    expect(logs[0]).toMatchObject({ method: 'POST', url: '/api/v1/projects', status: 201 })
  })

  it('api.get records a log entry', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
      status: 200,
      json: async () => ({ data: [] }),
    }))
    const ctx = new ScenarioContext()
    await ctx.api.get('/api/v1/projects')
    const logs = ctx.flushLogs()
    expect(logs[0]).toMatchObject({ method: 'GET', status: 200 })
  })

  it('flushLogs clears the buffer', async () => {
    const ctx = new ScenarioContext()
    await ctx.api.post('/api/v1/projects', { name: 'test' })
    ctx.flushLogs()
    expect(ctx.flushLogs()).toHaveLength(0)
  })
})

describe('ScenarioContext — pollUntil', () => {
  it('resolves immediately when condition is met on first call', async () => {
    const ctx = new ScenarioContext()
    const fn = vi.fn().mockResolvedValue({ status: 200, data: { status: 'done' } })
    const result = await ctx.pollUntil(fn, (r) => r.data.status === 'done', { interval: 0 })
    expect(result.data.status).toBe('done')
    expect(fn).toHaveBeenCalledTimes(1)
  })

  it('retries until condition is met', async () => {
    const ctx = new ScenarioContext()
    let calls = 0
    const fn = vi.fn().mockImplementation(async () => {
      calls++
      return { status: 200, data: { status: calls < 3 ? 'building' : 'done' } }
    })
    const result = await ctx.pollUntil(fn, (r) => r.data.status === 'done', {
      timeout: 5_000,
      interval: 1,
    })
    expect(result.data.status).toBe('done')
    expect(fn).toHaveBeenCalledTimes(3)
  })
})
