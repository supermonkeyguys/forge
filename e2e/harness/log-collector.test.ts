import { describe, it, expect } from 'vitest'
import { LogCollector } from './log-collector'

describe('LogCollector', () => {
  it('records an API call entry', () => {
    const c = new LogCollector()
    c.record({ method: 'POST', url: '/api/v1/projects', status: 201, body: { data: { id: 'p1' } }, timestamp: 0 })
    expect(c.flush()).toHaveLength(1)
  })

  it('flush returns all recorded entries', () => {
    const c = new LogCollector()
    c.record({ method: 'GET', url: '/api/v1/projects', status: 200, body: {}, timestamp: 0 })
    c.record({ method: 'POST', url: '/api/v1/tasks', status: 201, body: {}, timestamp: 1 })
    const logs = c.flush()
    expect(logs).toHaveLength(2)
    expect(logs[0].method).toBe('GET')
    expect(logs[1].method).toBe('POST')
  })

  it('flush clears the buffer', () => {
    const c = new LogCollector()
    c.record({ method: 'GET', url: '/api/v1/projects', status: 200, body: {}, timestamp: 0 })
    c.flush()
    expect(c.flush()).toHaveLength(0)
  })

  it('independent flush calls do not share state', () => {
    const c = new LogCollector()
    c.record({ method: 'GET', url: '/a', status: 200, body: {}, timestamp: 0 })
    const first = c.flush()
    c.record({ method: 'POST', url: '/b', status: 201, body: {}, timestamp: 1 })
    const second = c.flush()
    expect(first).toHaveLength(1)
    expect(second).toHaveLength(1)
    expect(first[0].url).toBe('/a')
    expect(second[0].url).toBe('/b')
  })
})
