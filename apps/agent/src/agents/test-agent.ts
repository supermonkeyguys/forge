/**
 * Test Agent — Tier 3
 *
 * Responsibilities:
 *   1. Run unit tests (vitest) inside the E2B sandbox
 *   2. Start the Next.js dev server (next dev)
 *   3. Wait for the server to be ready
 *   4. Check each spec acceptance_criteria via HTTP probes or LLM-assisted screenshot analysis
 *   5. Produce validation_report.json
 *
 * This agent never modifies code — read-only except for writing the report.
 *
 * Validation strategy:
 *   - Unit tests:   run `npx vitest run --reporter=json` and parse output
 *   - Server ready: poll GET / until HTTP 200
 *   - E2E checks:   for each acceptance_criterion, use LLM to classify it as
 *                   HTTP_PROBE (check a specific URL/status) or VISUAL (needs screenshot).
 *                   HTTP_PROBE: fetch the URL, check status / response body.
 *                   VISUAL: capture screenshot + ask LLM "does this screenshot satisfy: <criterion>?"
 */

import { llmText as generateText, anthropic, MODEL } from '../lib/ai-client.js'
import { z } from 'zod'
import type { Spec } from '../contracts/spec.js'
import {
  ValidationReportSchema,
  classifyErrorAgent,
  type ValidationReport,
  type E2ECheck,
  type ValidationError,
  type UnitTestResult,
} from '../contracts/validation-report.js'
import type { Agent, AgentRunContext, AgentResult } from './types.js'

// ── Constants ────────────────────────────────────────────────────

const SERVER_READY_TIMEOUT_MS = 90_000
const SERVER_POLL_INTERVAL_MS = 2_000
const VITEST_TIMEOUT_MS = 120_000
const APP_DIR = '/home/user/app'

// ── Vitest JSON output types ──────────────────────────────────────

interface VitestJsonResult {
  numPassedTests: number
  numFailedTests: number
  testResults: Array<{
    testFilePath: string
    status: 'passed' | 'failed'
    testResults: Array<{
      status: 'passed' | 'failed'
      fullName: string
      failureMessages: string[]
    }>
  }>
}

function extractJSON(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) return fenceMatch[1]!.trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end !== -1) return text.slice(start, end + 1)
  return text.trim()
}

// ── Criterion check plan (LLM-classified) ────────────────────────

const CriterionCheckSchema = z.object({
  criterion: z.string(),
  method: z.enum(['http_probe', 'visual', 'skip']),
  url: z.string().nullable().default(null).describe('For http_probe: URL path to fetch (e.g. /api/projects)'),
  expected_status: z.number().nullable().default(null).describe('Expected HTTP status code'),
  expected_body_contains: z.string().nullable().default(null),
  skip_reason: z.string().nullable().default(null),
})

type CriterionCheck = z.infer<typeof CriterionCheckSchema>

// ── Test Agent ────────────────────────────────────────────────────

export class TestAgent implements Agent {
  readonly role = 'test' as const

  async run(ctx: AgentRunContext): Promise<AgentResult> {
    ctx.emit({ type: 'agent_start', agent: 'test', message: 'Starting validation...' })

    const spec = await this.loadSpec(ctx)
    const report = await this.validate(spec, ctx)

    const passed = report.overall === 'passed'
    ctx.emit({
      type: 'agent_done',
      agent: 'test',
      summary: passed
        ? `All checks passed (${report.unit_tests.total_passed} unit tests, ${report.e2e_checks.filter(c => c.status === 'passed').length} E2E checks)`
        : `Validation failed: ${report.errors.length} error(s)`,
    })

    return {
      success: passed,
      summary: `Validation ${report.overall}`,
      errors: passed ? undefined : report.errors,
    }
  }

  /**
   * Core validation — exposed for unit testing.
   * `sandbox` is injected for testability (interface-based, not E2B-specific).
   */
  async validate(spec: Spec, ctx: AgentRunContext | SandboxAdapter): Promise<ValidationReport> {
    const sandbox = 'emit' in ctx ? this.sandboxFromCtx(ctx) : ctx

    const emit = 'emit' in ctx ? ctx.emit : () => {}

    // Step 1: Run unit tests
    emit({ type: 'agent_thinking', agent: 'test', content: 'Running unit tests...' })
    const unitResults = await this.runUnitTests(sandbox)

    // Step 2: Start dev server + wait for ready
    emit({ type: 'agent_thinking', agent: 'test', content: 'Starting dev server...' })
    const baseUrl = await this.startAndWaitForServer(sandbox)

    // Step 3: Plan E2E checks (LLM classifies each criterion)
    emit({ type: 'agent_thinking', agent: 'test', content: 'Planning E2E checks...' })
    const checkPlans = await this.planE2EChecks(spec)

    // Step 4: Execute E2E checks
    emit({ type: 'agent_thinking', agent: 'test', content: `Running ${checkPlans.length} E2E checks...` })
    const e2eChecks = await this.executeE2EChecks(checkPlans, baseUrl, sandbox)

    // Step 5: Compile report
    const errors = this.compileErrors(unitResults, e2eChecks)
    const report = this.buildReport(spec, unitResults, e2eChecks, errors)

    return report
  }

  // ── Unit test runner ──────────────────────────────────────────

  async runUnitTests(sandbox: SandboxAdapter): Promise<UnitTestResult[]> {
    const result = await sandbox.run(
      'npx vitest run --reporter=json --reporter=verbose 2>&1 || true',
      { cwd: APP_DIR, timeoutMs: VITEST_TIMEOUT_MS },
    )

    return parseVitestOutput(result.stdout + result.stderr)
  }

  // ── Dev server ────────────────────────────────────────────────

  async startAndWaitForServer(sandbox: SandboxAdapter): Promise<string> {
    // Kill any process holding port 3000 from a previous validation cycle
    await sandbox.run('fuser -k 3000/tcp || true', { cwd: APP_DIR, timeoutMs: 5_000 })

    // Start next dev in background
    await sandbox.startBackground('npm run dev', { cwd: APP_DIR })

    const previewUrl = sandbox.getPreviewUrl(3000)
    const deadline = Date.now() + SERVER_READY_TIMEOUT_MS

    while (Date.now() < deadline) {
      try {
        const res = await fetch(previewUrl, {
          signal: AbortSignal.timeout(3_000),
        })
        if (res.ok || res.status === 404) return previewUrl
      } catch {
        // not ready yet
      }
      await sleep(SERVER_POLL_INTERVAL_MS)
    }

    throw new Error(`Dev server did not start within ${SERVER_READY_TIMEOUT_MS}ms`)
  }

  // ── E2E check planning ────────────────────────────────────────

  async planE2EChecks(spec: Spec): Promise<CriterionCheck[]> {
    const allCriteria = spec.features.flatMap((f) =>
      f.acceptance_criteria.map((c) => ({ featureId: f.id, criterion: c })),
    )

    if (allCriteria.length === 0) return []

    const { text } = await generateText({
      model: anthropic(MODEL),
      system: 'Respond with ONLY a valid JSON object with a "checks" array. No markdown, no explanation.',
      prompt: buildCheckPlanPrompt(allCriteria),
    })

    const raw = JSON.parse(extractJSON(text)) as { checks: unknown[] }
    // Inject criterion from input if LLM omitted it (common failure mode)
    const withCriteria = (raw.checks ?? []).map((check, i) => ({
      criterion: allCriteria[i]?.criterion ?? '',
      ...(check as object),
    }))
    const object = z.object({ checks: z.array(CriterionCheckSchema) }).parse({ checks: withCriteria })
    return object.checks
  }

  // ── E2E check execution ───────────────────────────────────────

  async executeE2EChecks(
    plans: CriterionCheck[],
    baseUrl: string,
    sandbox: SandboxAdapter,
  ): Promise<E2ECheck[]> {
    const results: E2ECheck[] = []

    for (const plan of plans) {
      if (plan.method === 'skip') {
        results.push({
          feature_id: '',
          criterion: plan.criterion,
          status: 'skipped',
          detail: plan.skip_reason,
        })
        continue
      }

      if (plan.method === 'http_probe') {
        results.push(await this.httpProbe(plan, baseUrl))
        continue
      }

      if (plan.method === 'visual') {
        results.push(await this.visualCheck(plan, baseUrl, sandbox))
        continue
      }
    }

    return results
  }

  private async httpProbe(plan: CriterionCheck, baseUrl: string): Promise<E2ECheck> {
    const url = `${baseUrl}${plan.url ?? '/'}`

    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) })
      const expectedStatus = plan.expected_status ?? 200
      const passed = res.status === expectedStatus

      let bodyPassed = true
      if (plan.expected_body_contains && passed) {
        const body = await res.text()
        bodyPassed = body.includes(plan.expected_body_contains)
      }

      return {
        feature_id: '',
        criterion: plan.criterion,
        status: passed && bodyPassed ? 'passed' : 'failed',
        detail: `HTTP ${res.status} ${url}`,
        error: passed && bodyPassed ? undefined : `Expected ${expectedStatus}, got ${res.status}`,
      }
    } catch (err) {
      return {
        feature_id: '',
        criterion: plan.criterion,
        status: 'failed',
        detail: url,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  private async visualCheck(
    plan: CriterionCheck,
    baseUrl: string,
    sandbox: SandboxAdapter,
  ): Promise<E2ECheck> {
    const url = `${baseUrl}${plan.url ?? '/'}`
    const screenshotPath = `/tmp/screenshot-${Date.now()}.png`

    try {
      // Take screenshot using Playwright inside the sandbox
      const result = await sandbox.run(
        `npx playwright screenshot --browser chromium "${url}" "${screenshotPath}"`,
        { cwd: APP_DIR, timeoutMs: 30_000 },
      )

      if (result.exitCode !== 0) {
        // Playwright not available or failed — fall back to HTTP probe
        return this.httpProbe({ ...plan, method: 'http_probe' }, baseUrl)
      }

      // Read screenshot and ask LLM if the criterion is satisfied
      const screenshotData = await sandbox.readFile(screenshotPath).catch(() => null)
      if (!screenshotData) {
        return { feature_id: '', criterion: plan.criterion, status: 'skipped', detail: 'screenshot unavailable' }
      }

      const verdict = await this.assessScreenshot(plan.criterion, screenshotData)
      return {
        feature_id: '',
        criterion: plan.criterion,
        status: verdict.passed ? 'passed' : 'failed',
        detail: screenshotPath,
        error: verdict.passed ? undefined : verdict.reason,
      }
    } catch (err) {
      return {
        feature_id: '',
        criterion: plan.criterion,
        status: 'failed',
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  private async assessScreenshot(
    criterion: string,
    screenshotBase64: string,
  ): Promise<{ passed: boolean; reason: string }> {
    const { text } = await generateText({
      model: anthropic('claude-haiku-4-5-20251001'),
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              image: screenshotBase64,
            },
            {
              type: 'text',
              text: `Does this screenshot satisfy the following criterion?\n\n"${criterion}"\n\nReply with JSON: {"passed": true/false, "reason": "brief explanation"}`,
            },
          ],
        },
      ],
    })

    try {
      const json = JSON.parse(text.match(/\{[\s\S]*\}/)?.[0] ?? '{}')
      return { passed: Boolean(json.passed), reason: String(json.reason ?? '') }
    } catch {
      return { passed: false, reason: 'could not parse LLM assessment' }
    }
  }

  // ── Report compilation ────────────────────────────────────────

  private compileErrors(
    unitResults: UnitTestResult[],
    e2eChecks: E2ECheck[],
  ): ValidationError[] {
    const errors: ValidationError[] = []

    for (const r of unitResults) {
      if (r.failed > 0) {
        errors.push({
          type: 'unit_test',
          agent: classifyErrorAgent(r.file),
          file: r.file,
          message: `${r.failed} unit test(s) failed in ${r.file}`,
          suggestion: r.errors[0],
        })
      }
    }

    for (const check of e2eChecks) {
      if (check.status === 'failed') {
        errors.push({
          type: 'e2e',
          agent: 'unknown',
          message: `E2E check failed: "${check.criterion}"`,
          suggestion: check.error,
        })
      }
    }

    return errors
  }

  private buildReport(
    spec: Spec,
    unitResults: UnitTestResult[],
    e2eChecks: E2ECheck[],
    errors: ValidationError[],
  ): ValidationReport {
    const totalPassed = unitResults.reduce((s, r) => s + r.passed, 0)
    const totalFailed = unitResults.reduce((s, r) => s + r.failed, 0)
    const e2eFailed = e2eChecks.filter((c) => c.status === 'failed').length

    return ValidationReportSchema.parse({
      spec_id: spec.id,
      timestamp: new Date().toISOString(),
      overall: totalFailed === 0 && e2eFailed === 0 ? 'passed' : 'failed',
      unit_tests: {
        total_passed: totalPassed,
        total_failed: totalFailed,
        files: unitResults,
      },
      e2e_checks: e2eChecks,
      errors,
    })
  }

  private sandboxFromCtx(_ctx: AgentRunContext): SandboxAdapter {
    throw new Error('sandboxFromCtx: inject sandbox via ctx.__sandbox in integration')
  }

  private async loadSpec(_ctx: AgentRunContext): Promise<Spec> {
    throw new Error('loadSpec: inject spec via ctx.__spec in integration')
  }
}

// ── SandboxAdapter interface ──────────────────────────────────────
// Abstraction over E2B so the agent is testable with a fake sandbox.

export interface SandboxAdapter {
  run(cmd: string, opts?: { cwd?: string; timeoutMs?: number }): Promise<{ stdout: string; stderr: string; exitCode: number }>
  startBackground(cmd: string, opts?: { cwd?: string }): Promise<void>
  readFile(path: string): Promise<string>
  getPreviewUrl(port: number): string
}

// ── Prompt builders ───────────────────────────────────────────────

function buildCheckPlanPrompt(
  criteria: Array<{ featureId: string; criterion: string }>,
): string {
  const list = criteria.map((c, i) => `${i + 1}. [${c.featureId}] ${c.criterion}`).join('\n')

  return `You are a test planner. For each acceptance criterion, decide the best verification method:

- http_probe: the criterion can be verified by fetching a URL and checking status/body
- visual: the criterion requires seeing a rendered UI (form, button, text on screen)
- skip: the criterion cannot be automatically tested (e.g. email sending, third-party integrations)

Acceptance criteria:
${list}

Respond with a JSON object where each entry in "checks" has EXACTLY these fields:
- criterion: copy the criterion text verbatim from the input list above
- method: http_probe | visual | skip
- url: the URL path to test (e.g. "/", "/api/projects", "/login") — null for visual/skip
- expected_status: HTTP status code for http_probe (default 200) — null for visual/skip
- expected_body_contains: optional string the body should contain — null if not needed
- skip_reason: why it cannot be tested (for skip only) — null otherwise

Be pragmatic — prefer http_probe for API endpoints, visual for UI elements.`
}

// ── Vitest output parser ──────────────────────────────────────────

export function parseVitestOutput(output: string): UnitTestResult[] {
  // Try JSON reporter format first
  const jsonMatch = output.match(/\{[\s\S]*"numPassedTests"[\s\S]*\}/)
  if (jsonMatch) {
    try {
      const json = JSON.parse(jsonMatch[0]) as VitestJsonResult
      return json.testResults.map((r) => ({
        file: r.testFilePath,
        passed: r.testResults.filter((t) => t.status === 'passed').length,
        failed: r.testResults.filter((t) => t.status === 'failed').length,
        errors: r.testResults
          .filter((t) => t.status === 'failed')
          .flatMap((t) => t.failureMessages),
      }))
    } catch {
      // fall through to text parser
    }
  }

  // Text reporter fallback — parse lines like "✓ packages/core/auth/auth.test.ts (3 tests)"
  const results: UnitTestResult[] = []
  const passLine = /[✓✔]\s+(.+\.test\.[jt]sx?)\s+\((\d+)\s+tests?\)/
  const failLine = /[✗✘×]\s+(.+\.test\.[jt]sx?)/

  for (const line of output.split('\n')) {
    const pm = line.match(passLine)
    if (pm) {
      results.push({ file: pm[1]!, passed: parseInt(pm[2]!, 10), failed: 0, errors: [] })
      continue
    }
    const fm = line.match(failLine)
    if (fm) {
      results.push({ file: fm[1]!, passed: 0, failed: 1, errors: [line.trim()] })
    }
  }

  return results
}

// ── Utilities ────────────────────────────────────────────────────

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}
