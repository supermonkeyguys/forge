import { describe, it, expect } from 'vitest'
import { ScenarioRunner } from './runner'
import type { Scenario } from './types'

describe('ScenarioRunner', () => {
  it('runs all steps when all pass', async () => {
    const executed: string[] = []
    const scenario: Scenario = {
      name: 'test',
      steps: [
        { name: 'step 1', run: async (ctx) => { executed.push('step 1'); ctx.checkpoint('ok', true) } },
        { name: 'step 2', run: async (ctx) => { executed.push('step 2'); ctx.checkpoint('ok', true) } },
      ],
    }
    const report = await new ScenarioRunner().run(scenario)
    expect(executed).toEqual(['step 1', 'step 2'])
    expect(report.status).toBe('passed')
    expect(report.steps).toHaveLength(2)
    expect(report.steps.every((s) => s.status === 'passed')).toBe(true)
  })

  it('marks report failed when a checkpoint fails', async () => {
    const scenario: Scenario = {
      name: 'test',
      steps: [
        { name: 'step 1', run: async (ctx) => ctx.checkpoint('will fail', false, 'reason') },
      ],
    }
    const report = await new ScenarioRunner().run(scenario)
    expect(report.status).toBe('failed')
    expect(report.steps[0].status).toBe('failed')
    expect(report.steps[0].checkpoints[0].passed).toBe(false)
  })

  it('continues executing steps after checkpoint failure (non-fatal)', async () => {
    const executed: string[] = []
    const scenario: Scenario = {
      name: 'test',
      steps: [
        { name: 'step 1', run: async (ctx) => { executed.push('step 1'); ctx.checkpoint('fail', false) } },
        { name: 'step 2', run: async (ctx) => { executed.push('step 2'); ctx.checkpoint('ok', true) } },
      ],
    }
    const report = await new ScenarioRunner().run(scenario)
    expect(executed).toEqual(['step 1', 'step 2'])
    expect(report.steps[0].status).toBe('failed')
    expect(report.steps[1].status).toBe('passed')
  })

  it('skips remaining steps after unhandled exception (fatal)', async () => {
    const executed: string[] = []
    const scenario: Scenario = {
      name: 'test',
      steps: [
        { name: 'step 1', run: async () => { executed.push('step 1'); throw new Error('crash') } },
        { name: 'step 2', run: async () => { executed.push('step 2') } },
      ],
    }
    const report = await new ScenarioRunner().run(scenario)
    expect(executed).toEqual(['step 1'])
    expect(report.steps[0].status).toBe('failed')
    expect(report.steps[1].status).toBe('skipped')
    expect(report.status).toBe('failed')
  })

  it('records duration for each step', async () => {
    const scenario: Scenario = {
      name: 'test',
      steps: [{ name: 'step 1', run: async (ctx) => ctx.checkpoint('ok', true) }],
    }
    const report = await new ScenarioRunner().run(scenario)
    expect(report.steps[0].duration).toBeGreaterThanOrEqual(0)
    expect(report.duration).toBeGreaterThanOrEqual(0)
  })

  it('calls setup before steps and teardown after steps', async () => {
    const order: string[] = []
    const scenario: Scenario = {
      name: 'test',
      setup: async () => { order.push('setup') },
      teardown: async () => { order.push('teardown') },
      steps: [
        { name: 'step 1', run: async () => { order.push('step 1') } },
      ],
    }
    await new ScenarioRunner().run(scenario)
    expect(order).toEqual(['setup', 'step 1', 'teardown'])
  })

  it('sets failedAt to first failed step and checkpoint', async () => {
    const scenario: Scenario = {
      name: 'test',
      steps: [
        { name: 'create project', run: async (ctx) => ctx.checkpoint('project created', false) },
      ],
    }
    const report = await new ScenarioRunner().run(scenario)
    expect(report.failedAt).toBe('step[0]/checkpoint:project created')
  })
})
