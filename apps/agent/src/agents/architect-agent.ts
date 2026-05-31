/**
 * Architect Agent — Tier 1
 *
 * Responsibilities:
 *   1. Read spec.json
 *   2. Make tech decisions (stored in task_plan.tech_decisions)
 *   3. Produce a file-level task_plan.json (what to create/modify, who owns it, deps)
 *   4. Initialize project_context.md (the shared brain for all Builder Agents)
 *
 * Rules this agent enforces (same rules injected via AGENTS.md):
 *   - API calls / hooks → packages/core/
 *   - UI components     → packages/ui/
 *   - Page assembly     → app/[route]/page.tsx (max 100 lines)
 *   - DB schema         → prisma/schema.prisma
 *   - Business logic    → server/domain/
 *   - HTTP routes       → app/api/
 */

import { llmText as generateText } from '../lib/ai-client.js'
import { anthropic, MODEL } from '../lib/ai-client.js'
import { z } from 'zod'
import type { Spec } from '../contracts/spec.js'
import {
  TaskPlanSchema,
  type TaskPlan,
  type PlanTask,
} from '../contracts/task-plan.js'
import type { Agent, AgentRunContext, AgentResult } from './types.js'

// ── LLM schema ───────────────────────────────────────────────────
// Subset of TaskPlanSchema — status defaults are added after LLM call

const LLMPlanTaskSchema = z.object({
  id: z.string(),
  agent: z.enum(['schema', 'logic', 'api', 'ui', 'page']),
  action: z.enum(['create', 'modify', 'delete']),
  file: z.string(),
  description: z.string(),
  depends_on: z.array(z.string()).default([]),
  feature_ids: z.array(z.string()).default([]),
})

const LLMTaskPlanSchema = z.object({
  tech_decisions: z.record(z.string()),
  tasks: z.array(LLMPlanTaskSchema).min(1),
})

function extractJSON(text: string): string {
  const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) return fenceMatch[1]!.trim()
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start !== -1 && end !== -1) return text.slice(start, end + 1)
  return text.trim()
}

// ── System prompt ────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are the Architect Agent for Forge, an AI application factory.
Your job is to turn a structured spec into a precise, file-level implementation plan.

The generated app uses a FIXED architecture — you MUST follow these placement rules:

FRONTEND (Next.js 14 App Router):
  packages/core/<domain>/use-<name>.ts      → TanStack Query hooks (API calls, mutations)
  packages/core/<domain>/<name>-store.ts    → Zustand stores (client state only)
  packages/core/<domain>/<name>.test.ts     → Unit tests for core logic
  packages/ui/<name>/<name>.tsx             → Pure UI components (no business logic)
  packages/ui/<name>/<name>.stories.tsx     → Storybook stories
  app/<route>/page.tsx                      → Page assembly only (max 100 lines)
  app/api/<route>/route.ts                  → Next.js API route handlers

BACKEND (within the generated Next.js app):
  prisma/schema.prisma                      → Database schema
  server/domain/<name>.ts                   → Business entities + pure functions
  server/domain/<name>.test.ts              → Domain unit tests
  server/infra/<name>-repo.ts              → DB repository implementations
  app/api/<route>/route.ts                  → HTTP thin layer

RULES:
1. Every packages/core/ file MUST have a corresponding .test.ts task
2. Every packages/ui/ component MUST have a .stories.tsx task
3. page.tsx files only need a task if a NEW page is required (not if it already exists)
4. Respect depends_on: schema tasks must complete before logic tasks that query DB
5. Be specific in description — the Builder Agent will use it as its sole instruction
6. Assign feature_ids so the validator knows which spec feature each task implements

TASK ID FORMAT: T001, T002, ... (sequential, zero-padded to 3 digits)`

// ── Architect Agent ───────────────────────────────────────────────

export class ArchitectAgent implements Agent {
  role = 'architect' as const

  async run(ctx: AgentRunContext): Promise<AgentResult> {
    ctx.emit({ type: 'agent_start', agent: 'architect', message: 'Planning implementation...' })

    try {
      // Read spec from sandbox
      ctx.emit({ type: 'agent_thinking', agent: 'architect', content: 'Reading spec.json...' })
      const specRaw = await readSpecFromContext(ctx)

      ctx.emit({
        type: 'agent_thinking',
        agent: 'architect',
        content: `Designing task plan for "${specRaw.title}" (${specRaw.features.length} features)...`,
      })

      const plan = await this.plan(specRaw, ctx)

      ctx.emit({
        type: 'agent_done',
        agent: 'architect',
        summary: `Plan ready: ${plan.tasks.length} tasks across ${countAgents(plan.tasks)} agents`,
      })

      return {
        success: true,
        summary: `Task plan: ${plan.tasks.length} tasks`,
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      ctx.emit({ type: 'agent_error', agent: 'architect', error: msg })
      return {
        success: false,
        summary: 'Architect Agent failed',
        errors: [{ type: 'e2e', agent: 'unknown', message: msg }],
      }
    }
  }

  /** Core planning logic — exposed for testing without a full AgentRunContext. */
  async plan(spec: Spec, ctx?: Pick<AgentRunContext, 'emit'>): Promise<TaskPlan> {
    const emit = ctx?.emit ?? (() => {})

    const { text } = await generateText({
      model: anthropic(MODEL),
      system: SYSTEM_PROMPT + '\n\nRespond with ONLY a valid JSON object. No markdown, no explanation.',
      prompt: buildPlanPrompt(spec),
    })

    const object = LLMTaskPlanSchema.parse(JSON.parse(extractJSON(text)))

    // Merge LLM output with schema defaults (status: 'pending')
    const plan: TaskPlan = TaskPlanSchema.parse({
      spec_id: spec.id,
      tech_decisions: object.tech_decisions,
      tasks: object.tasks.map((t) => ({ ...t, status: 'pending' })),
    })

    // Validate dependency references are valid task IDs
    validateDependencies(plan)

    emit({
      type: 'agent_file_write',
      agent: 'architect',
      file: 'contracts/task_plan.json',
      action: 'create',
    })

    const techSummary = Object.entries(plan.tech_decisions)
      .map(([k, v]) => `${k}: ${v}`)
      .join(', ')
    emit({
      type: 'agent_thinking',
      agent: 'architect',
      content: techSummary
        ? `Tech: ${techSummary}`
        : `${plan.tasks.length} task(s) planned`,
    })

    return plan
  }

  /** Build initial project_context.md from a finalized plan. */
  buildInitialContext(spec: Spec, plan: TaskPlan): string {
    const decisions = Object.entries(plan.tech_decisions)
      .map(([k, v]) => `| ${k} | ${v} |`)
      .join('\n')

    const featureList = spec.features
      .map((f) => `- [ ] ${f.id}: ${f.name}`)
      .join('\n')

    const apiTasks = plan.tasks.filter((t) => t.agent === 'api')
    const apiContracts = apiTasks.length > 0
      ? apiTasks.map((t) => `- ${t.file} — ${t.description}`).join('\n')
      : '(to be filled by API Agent)'

    const coreTasks = plan.tasks.filter((t) => t.agent === 'logic')
    const hooksSection = coreTasks.length > 0
      ? coreTasks.map((t) => `- ${t.file} — ${t.description}`).join('\n')
      : '(to be filled by Logic Agent)'

    const uiTasks = plan.tasks.filter((t) => t.agent === 'ui')
    const componentsSection = uiTasks.length > 0
      ? uiTasks.map((t) => `- ${t.file}`).join('\n')
      : '(to be filled by UI Agent)'

    return `# Project Context

> Shared brain for all agents. Read this before starting work. Update your section when done.

## App Overview

- **Name**: ${spec.title}
- **Description**: ${spec.description}
- **Domain**: ${spec.business_domain}
- **Spec ID**: ${spec.id}

---

## Architecture Decisions

| Decision | Choice |
|----------|--------|
${decisions}

---

## Data Models

(to be filled by Schema Agent after prisma/schema.prisma is written)

---

## API Contracts

${apiContracts}

---

## Available Hooks (packages/core/)

${hooksSection}

---

## Available UI Components (packages/ui/)

${componentsSection}

---

## Completed Features

${featureList}

---

## Known Constraints & Gotchas

(filled by any agent when they discover something important)
`
  }
}

// ── Helpers ───────────────────────────────────────────────────────

function buildPlanPrompt(spec: Spec): string {
  const featuresText = spec.features
    .map(
      (f) =>
        `### ${f.id}: ${f.name} [${f.confidence}]\n` +
        f.acceptance_criteria.map((c) => `  - ${c}`).join('\n'),
    )
    .join('\n\n')

  const constraintsText = Object.entries(spec.constraints)
    .filter(([, v]) => v)
    .map(([k]) => `  - ${k}`)
    .join('\n')

  return `Create a file-level implementation plan for this app.

## App: ${spec.title}
${spec.description}

## Features to implement:
${featuresText}

## Technical constraints:
${constraintsText || '  (none beyond the defaults)'}

Respond with ONLY this JSON structure (no markdown, no explanation):
{
  "tech_decisions": {
    "database": "prisma + postgresql",
    "auth": "jwt + bcrypt",
    "styling": "tailwind css"
  },
  "tasks": [
    {
      "id": "T001",
      "agent": "schema",
      "action": "create",
      "file": "prisma/schema.prisma",
      "description": "what this task does",
      "depends_on": [],
      "feature_ids": ["F001"]
    }
  ]
}

Agent values must be one of: "schema", "logic", "api", "ui", "page"
Action values must be one of: "create", "modify", "delete"
Generate tasks covering schema (if DB needed), logic, api, ui, and page agents for each feature.`
}

function validateDependencies(plan: TaskPlan): void {
  const ids = new Set(plan.tasks.map((t) => t.id))
  for (const task of plan.tasks) {
    for (const dep of task.depends_on) {
      if (!ids.has(dep)) {
        throw new Error(
          `Task ${task.id} depends on unknown task ID "${dep}". Valid IDs: ${[...ids].join(', ')}`,
        )
      }
    }
  }
}

function countAgents(tasks: PlanTask[]): number {
  return new Set(tasks.map((t) => t.agent)).size
}

async function readSpecFromContext(ctx: AgentRunContext): Promise<Spec> {
  // In real execution, read from E2B sandbox
  // This indirection makes the agent testable without a sandbox
  throw new Error(
    'readSpecFromContext: must be overridden in integration — inject spec via ctx.orchestrator',
  )
}
