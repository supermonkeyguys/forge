import { ScenarioContext } from './context'
import type { Scenario, Report, StepReport } from './types'

export class ScenarioRunner {
  async run(scenario: Scenario): Promise<Report> {
    const start = Date.now()
    const ctx = new ScenarioContext()
    const stepReports: StepReport[] = []
    let hasFatal = false
    let failedAt: string | undefined

    await scenario.setup?.(ctx)

    for (let i = 0; i < scenario.steps.length; i++) {
      const step = scenario.steps[i]

      if (hasFatal) {
        stepReports.push({ name: step.name, status: 'skipped', duration: 0, checkpoints: [], logs: [] })
        continue
      }

      const stepStart = Date.now()
      try {
        await step.run(ctx)
      } catch (err) {
        ctx.checkpoint(`step threw: ${err instanceof Error ? err.message : String(err)}`, false)
        hasFatal = true
      }

      const checkpoints = ctx.flushCheckpoints()
      const logs = ctx.flushLogs()
      const duration = Date.now() - stepStart
      const anyFailed = checkpoints.some((c) => !c.passed)
      const status = hasFatal || anyFailed ? 'failed' : 'passed'

      if (status === 'failed' && !failedAt) {
        const failedCp = checkpoints.find((c) => !c.passed)
        failedAt = failedCp
          ? `step[${i}]/checkpoint:${failedCp.name}`
          : `step[${i}]/exception`
      }

      stepReports.push({ name: step.name, status, duration, checkpoints, logs })
    }

    try {
      await scenario.teardown?.(ctx)
    } catch {
      // teardown errors don't suppress the report
    }

    const overallStatus = stepReports.some((s) => s.status === 'failed') ? 'failed' : 'passed'
    return {
      scenarioName: scenario.name,
      status: overallStatus,
      duration: Date.now() - start,
      failedAt,
      steps: stepReports,
    }
  }
}
