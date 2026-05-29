/**
 * Zod schema for validation_report.json — the Test Agent's output.
 *
 * The report has three sections:
 *   1. unit_tests  — vitest results (per-file pass/fail counts)
 *   2. e2e_checks  — per acceptance_criteria check (Playwright or HTTP probe)
 *   3. errors      — structured error list for Orchestrator routing
 */

import { z } from 'zod'

export const UnitTestResultSchema = z.object({
  file: z.string(),
  passed: z.number().int().min(0),
  failed: z.number().int().min(0),
  errors: z.array(z.string()).default([]),
})

export const E2ECheckSchema = z.object({
  feature_id: z.string(),
  criterion: z.string().describe('The exact acceptance_criteria string from spec.json'),
  status: z.enum(['passed', 'failed', 'skipped']),
  detail: z.string().optional().describe('Screenshot path, HTTP response, or failure detail'),
  error: z.string().optional(),
})

export const ValidationErrorSchema = z.object({
  type: z.enum(['unit_test', 'e2e', 'build', 'runtime']),
  // Which builder agent should fix this
  agent: z.enum(['schema', 'logic', 'api', 'ui', 'page', 'unknown']),
  file: z.string().optional(),
  message: z.string(),
  suggestion: z.string().optional(),
})

export const ValidationReportSchema = z.object({
  spec_id: z.string(),
  timestamp: z.string(),
  overall: z.enum(['passed', 'failed']),
  unit_tests: z.object({
    total_passed: z.number().int().min(0),
    total_failed: z.number().int().min(0),
    files: z.array(UnitTestResultSchema),
  }),
  e2e_checks: z.array(E2ECheckSchema),
  errors: z.array(ValidationErrorSchema),
})

export type ValidationReport = z.infer<typeof ValidationReportSchema>
export type E2ECheck = z.infer<typeof E2ECheckSchema>
export type ValidationError = z.infer<typeof ValidationErrorSchema>
export type UnitTestResult = z.infer<typeof UnitTestResultSchema>

// ── Helpers ──────────────────────────────────────────────────────

export function isPassed(report: ValidationReport): boolean {
  return report.overall === 'passed'
}

export function failedE2EChecks(report: ValidationReport): E2ECheck[] {
  return report.e2e_checks.filter((c) => c.status === 'failed')
}

/** Classify which builder agent should fix a given error based on file path. */
export function classifyErrorAgent(
  filePath: string | undefined,
): ValidationError['agent'] {
  if (!filePath) return 'unknown'
  if (filePath.includes('prisma/')) return 'schema'
  if (filePath.includes('packages/core/') || filePath.includes('server/domain/')) return 'logic'
  if (filePath.includes('app/api/')) return 'api'
  if (filePath.includes('packages/ui/')) return 'ui'
  if (filePath.match(/app\/[^/]+\/page\.tsx/)) return 'page'
  return 'unknown'
}
