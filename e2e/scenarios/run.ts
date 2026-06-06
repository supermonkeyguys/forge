import { ScenarioRunner } from '../harness/runner'
import { ReportWriter } from '../harness/report-writer'
import type { Scenario } from '../harness/types'
import { createProjectScenario } from './create-project'

const SCENARIOS: Record<string, Scenario> = {
  'create-project': createProjectScenario,
}

const name = process.argv[2]

if (!name || !SCENARIOS[name]) {
  const available = Object.keys(SCENARIOS).join(', ')
  console.error(`Usage: tsx e2e/scenarios/run.ts <scenario-name>`)
  console.error(`Available: ${available}`)
  process.exit(1)
}

const runner = new ScenarioRunner()
const report = await runner.run(SCENARIOS[name])

const writer = new ReportWriter('e2e/reports')
const path = writer.write(report)

console.log(`\nReport: ${path}`)
console.log(`Status: ${report.status.toUpperCase()}`)

process.exit(report.status === 'passed' ? 0 : 1)
