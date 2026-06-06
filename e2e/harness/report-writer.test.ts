import { describe, it, expect, beforeEach, afterEach } from 'vitest'
import { readFileSync, mkdirSync, rmSync } from 'fs'
import { ReportWriter } from './report-writer'
import type { Report } from './types'

const TEST_DIR = 'e2e/reports/test-tmp'

beforeEach(() => mkdirSync(TEST_DIR, { recursive: true }))
afterEach(() => rmSync(TEST_DIR, { recursive: true, force: true }))

function makeReport(overrides: Partial<Report> = {}): Report {
  return {
    scenarioName: '创建项目',
    status: 'passed',
    duration: 1200,
    steps: [
      {
        name: 'POST /api/v1/projects',
        status: 'passed',
        duration: 300,
        checkpoints: [{ name: 'project created', passed: true }],
        logs: [{ method: 'POST', url: '/api/v1/projects', status: 201, body: { data: { id: 'p1' } }, timestamp: 0 }],
      },
    ],
    ...overrides,
  }
}

describe('ReportWriter', () => {
  it('writes a markdown file and returns the path', () => {
    const writer = new ReportWriter(TEST_DIR)
    const path = writer.write(makeReport())
    expect(path).toMatch(/\.md$/)
    expect(readFileSync(path, 'utf-8')).toContain('# Scenario: 创建项目')
  })

  it('includes Status: PASSED for passing report', () => {
    const writer = new ReportWriter(TEST_DIR)
    const path = writer.write(makeReport({ status: 'passed' }))
    expect(readFileSync(path, 'utf-8')).toContain('Status: PASSED')
  })

  it('includes Status: FAILED and failed_at for failing report', () => {
    const writer = new ReportWriter(TEST_DIR)
    const report = makeReport({
      status: 'failed',
      failedAt: 'step[0]/checkpoint:project created',
      steps: [
        {
          name: 'POST /api/v1/projects',
          status: 'failed',
          duration: 300,
          checkpoints: [{ name: 'project created', passed: false, details: 'expected 201, got 500' }],
          logs: [],
        },
      ],
    })
    const content = readFileSync(writer.write(report), 'utf-8')
    expect(content).toContain('Status: FAILED')
    expect(content).toContain('Failed at: step[0]/checkpoint:project created')
    expect(content).toContain('❌ project created')
    expect(content).toContain('expected 201, got 500')
  })

  it('marks skipped steps with ⏭', () => {
    const writer = new ReportWriter(TEST_DIR)
    const report = makeReport({
      status: 'failed',
      steps: [
        {
          name: 'step 1',
          status: 'failed',
          duration: 100,
          checkpoints: [{ name: 'ok', passed: false }],
          logs: [],
        },
        {
          name: 'step 2',
          status: 'skipped',
          duration: 0,
          checkpoints: [],
          logs: [],
        },
      ],
    })
    const content = readFileSync(writer.write(report), 'utf-8')
    expect(content).toContain('⏭ skipped')
  })

  it('includes API log entries for each step', () => {
    const writer = new ReportWriter(TEST_DIR)
    const path = writer.write(makeReport())
    expect(readFileSync(path, 'utf-8')).toContain('POST /api/v1/projects → 201')
  })

  it('includes Diagnosis section when status is failed', () => {
    const writer = new ReportWriter(TEST_DIR)
    const report = makeReport({
      status: 'failed',
      steps: [
        {
          name: 'agent job',
          status: 'failed',
          duration: 30000,
          checkpoints: [{ name: 'job completed', passed: false, details: 'timeout 30s' }],
          logs: [],
        },
      ],
    })
    expect(readFileSync(writer.write(report), 'utf-8')).toContain('## Diagnosis')
  })
})
