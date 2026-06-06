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

async function main() {
  let report
  try {
    report = await new ScenarioRunner().run(SCENARIOS[name])
  } catch (err) {
    console.error(`\nScenario aborted: ${err}`)
    process.exit(1)
  }

  const path = new ReportWriter('e2e/reports').write(report)
  console.log(`\nReport: ${path}`)
  console.log(`Status: ${report.status.toUpperCase()}`)
  process.exit(report.status === 'passed' ? 0 : 1)
}

main()
