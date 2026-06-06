import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import type { Report, StepReport, Checkpoint, ApiLog } from './types'

function formatDate(): string {
  return new Date().toISOString().slice(0, 10)
}

function formatDuration(ms: number): string {
  return ms >= 1000 ? `${(ms / 1000).toFixed(1)}s` : `${ms}ms`
}

function renderCheckpoints(checkpoints: Checkpoint[]): string {
  if (checkpoints.length === 0) return ''
  const lines = checkpoints.map((c) => {
    if (c.passed) return `    ✅ ${c.name}`
    const detail = c.details ? `\n       ${c.details}` : ''
    return `    ❌ ${c.name}${detail}`
  })
  return `  checkpoints:\n${lines.join('\n')}`
}

function renderLogs(logs: ApiLog[]): string {
  if (logs.length === 0) return ''
  const lines = logs.map((l) => `    ${l.method} ${l.url} → ${l.status}`)
  return `  api:\n${lines.join('\n')}`
}

function renderStep(step: StepReport, idx: number): string {
  if (step.status === 'skipped') {
    return `## Step ${idx + 1}: ${step.name} ⏭ skipped`
  }
  const icon = step.status === 'passed' ? '✅' : '❌'
  const parts = [
    `## Step ${idx + 1}: ${step.name} ${icon} ${formatDuration(step.duration)}`,
    renderLogs(step.logs),
    renderCheckpoints(step.checkpoints),
  ].filter(Boolean)
  return parts.join('\n')
}

function renderDiagnosis(report: Report): string {
  const failed = report.steps.find((s) => s.status === 'failed')
  if (!failed) return ''
  const timeoutCp = failed.checkpoints.find(
    (c) => !c.passed && c.details?.includes('timeout'),
  )
  const lines = ['## Diagnosis']
  if (timeoutCp) {
    lines.push(`- step timeout in "${failed.name}": ${timeoutCp.details ?? ''}`)
    lines.push('- possible cause: agent service not processing job or LLM stub not configured')
    lines.push('- relevant files:')
    lines.push('    apps/agent/src/job-runner.ts')
    lines.push('    apps/agent/src/orchestrator/orchestrator.ts')
  } else {
    const failedCp = failed.checkpoints.find((c) => !c.passed)
    lines.push(`- checkpoint "${failedCp?.name ?? 'unknown'}" failed in step "${failed.name}"`)
    if (failedCp?.details) lines.push(`- details: ${failedCp.details}`)
  }
  return lines.join('\n')
}

export class ReportWriter {
  constructor(private readonly dir: string) {}

  write(report: Report): string {
    mkdirSync(this.dir, { recursive: true })
    const slug = report.scenarioName.replace(/\s+/g, '-').replace(/[^\w-]/g, '') || Date.now().toString()
    const filename = `${formatDate()}-${slug}.md`
    const path = join(this.dir, filename)

    const lines: string[] = [
      `# Scenario: ${report.scenarioName}`,
      `Date: ${new Date().toISOString()}`,
      `Status: ${report.status.toUpperCase()}`,
      `Duration: ${formatDuration(report.duration)}`,
    ]
    if (report.failedAt) lines.push(`Failed at: ${report.failedAt}`)
    lines.push('')

    for (let i = 0; i < report.steps.length; i++) {
      lines.push(renderStep(report.steps[i], i))
      lines.push('')
    }

    const diagnosis = renderDiagnosis(report)
    if (diagnosis) lines.push(diagnosis)

    writeFileSync(path, lines.join('\n'))
    return path
  }
}
