# Scenario Harness Design
Date: 2026-06-06  
Status: Approved

## Overview

A standalone business scenario verification harness for Forge. Runs real end-to-end business flows (create project, KB ingest, create agent) against real services, produces structured Markdown reports that code agents can read to self-diagnose and fix failures.

Runs in both local dev and CI. LLM calls are stubbed in CI via env flag; local dev hits real LLM.

---

## Goals

- Verify complete business flows, not just isolated unit behavior
- Produce structured, agent-readable failure reports with diagnosis hints
- Run unattended in CI (exit code 0/1, no manual setup beyond env vars)
- LLM stub mechanism decoupled from scenario definitions

---

## Directory Structure

```
e2e/
  harness/                  ← runner core (new)
    runner.ts               ← ScenarioRunner class
    context.ts              ← ScenarioContext — tools shared across steps
    log-collector.ts        ← records API calls and state transitions
    report-writer.ts        ← writes Markdown to e2e/reports/
    stub-registry.ts        ← LLM stub registry, env-switched
    types.ts                ← Scenario, Step, Checkpoint, Report interfaces
  scenarios/                ← business scenario definitions (new)
    create-project.ts       ← v1: first scenario
  reports/                  ← generated output, gitignored
  fixtures/
    llm-stubs/              ← LLM fixture responses for CI
      kb-ingest-summary.txt
      project-pm-plan.json
      project-arch-spec.json
  layer1/                   ← existing, untouched
  layer2/                   ← existing, untouched
```

`harness/` is the general mechanism. `scenarios/` is business knowledge. The two are fully decoupled: the runner has no knowledge of which scenarios exist; scenarios have no knowledge of runner internals.

---

## Scenario Definition Interface

A scenario is a declarative object. Steps are async functions. `ctx` is the shared toolbox.

```typescript
// e2e/harness/types.ts

export interface Scenario {
  name: string
  setup?: (ctx: ScenarioContext) => Promise<void>
  teardown?: (ctx: ScenarioContext) => Promise<void>
  steps: ScenarioStep[]
}

export interface ScenarioStep {
  name: string
  run: (ctx: ScenarioContext) => Promise<void>
}
```

Example scenario:

```typescript
// e2e/scenarios/create-project.ts
export const createProjectScenario: Scenario = {
  name: '创建项目走流程',

  setup:    async (ctx) => { /* create test user, clean DB state */ },
  teardown: async (ctx) => { /* delete test data */ },

  steps: [
    {
      name: 'POST /api/v1/projects',
      run: async (ctx) => {
        const res = await ctx.api.post('/api/v1/projects', { name: 'test-project' })
        ctx.checkpoint('project created', res.status === 201)
        ctx.checkpoint('has project id', !!res.data?.id)
        ctx.state.projectId = res.data.id
      },
    },
    {
      name: 'agent job 完成',
      run: async (ctx) => {
        await ctx.api.post(`/api/v1/projects/${ctx.state.projectId}/run`, {
          input: 'build a todo app',
        })
        const final = await ctx.pollUntil(
          () => ctx.api.get(`/api/v1/projects/${ctx.state.projectId}`),
          (r) => ['done', 'failed'].includes(r.data.status),
          { timeout: 60_000, interval: 2_000 },
        )
        ctx.checkpoint('job completed', final.data.status === 'done')
        ctx.checkpoint('has preview url', !!final.data.previewUrl)
      },
    },
    {
      name: 'UI: 项目出现在列表',
      run: async (ctx) => {
        const page = await ctx.getPage()
        await page.goto('/projects')
        ctx.checkpoint('visible in list',
          await page.getByText('test-project').isVisible(),
        )
      },
    },
  ],
}
```

### Key Design Decisions

- **`ctx.state`** is the only cross-step communication channel — explicit, no globals
- **`ctx.getPage()`** lazy-loads Playwright — pure API steps don't start a browser
- **Checkpoint failure does not throw** — runner records and continues; all steps are attempted unless a prior step threw an unhandled exception
- **`ctx.api`** auto-records every request/response — no manual logging needed in steps

---

## Runner Core

```typescript
// e2e/harness/runner.ts
export class ScenarioRunner {
  async run(scenario: Scenario): Promise<Report> {
    const ctx = new ScenarioContext()
    const report = new Report(scenario.name)

    await scenario.setup?.(ctx)

    for (const step of scenario.steps) {
      if (report.hasFatalFailure()) {
        report.addSkipped(step.name)
        continue
      }
      const start = Date.now()
      try {
        await step.run(ctx)
      } catch (err) {
        ctx.checkpoint(`step threw`, false, String(err))
      }
      report.addStep(
        step.name,
        ctx.flushCheckpoints(),
        ctx.flushLogs(),
        Date.now() - start,
      )
    }

    await scenario.teardown?.(ctx)
    return report
  }
}
```

A "fatal failure" is an unhandled exception in a step. Checkpoint failures are non-fatal — subsequent steps still run so the report captures the full picture.

---

## Report Format

Each scenario run writes one Markdown file to `e2e/reports/YYYY-MM-DD-{scenario-slug}.md`.

```markdown
# Scenario: 创建项目走流程
Date: 2026-06-06T10:30:00Z
Status: FAILED
Duration: 32.4s
Failed at: step[2] / checkpoint: job completed

## Step 1: POST /api/v1/projects ✅ 0.3s
  api:
    POST /api/v1/projects → 201
    body: { "data": { "id": "proj-abc", "status": "idle" } }
  checkpoints:
    ✅ project created
    ✅ has project id

## Step 2: agent job 完成 ❌ 31.1s
  api:
    POST /api/v1/projects/proj-abc/run → 202
    GET /api/v1/projects/proj-abc → status=building ×15 (30s)
  checkpoints:
    ❌ job completed
       expected: status=done | failed
       actual:   status=building (timeout 30s)
    ⏭ has preview url — skipped

## Step 3: UI: 项目出现在列表 ⏭ skipped

## Diagnosis
- step[2] timeout: project stuck at "building", job never completed
- agent service may not be processing the job
- relevant files:
    apps/agent/src/job-runner.ts
    apps/agent/src/orchestrator/orchestrator.ts
```

### Report Design Decisions

- **`⏭ skipped`** is explicit — an agent reading the report knows it was blocked, not passing
- **Diagnosis section** is auto-generated by the runner based on failure type (timeout → job runner hint, 4xx → handler hint, etc.)
- **api section** captures raw request/response — agent can diagnose without re-running the test
- Exit code `0` = all checkpoints passed; `1` = any checkpoint failed

---

## LLM Stub Mechanism

The agent service already uses `MockSandbox` for sandbox stubbing. The same pattern applies to LLM calls.

```typescript
// apps/agent/src/lib/ai-client.ts (small addition to existing file)
export function getAIClient() {
  if (process.env['FORGE_USE_STUB'] === 'true') {
    return stubClient
  }
  return anthropic(MODEL)
}
```

Stubs are fixture files under `e2e/fixtures/llm-stubs/`, one file per stub key:

```typescript
// e2e/harness/stub-registry.ts
export class StubRegistry {
  get(key: string): string {
    return readFileSync(`e2e/fixtures/llm-stubs/${key}.txt`, 'utf-8')
  }
}
```

`FORGE_USE_STUB` is unset locally (hits real LLM) and `true` in CI. Scenario definitions never reference the stub registry directly — it is wired at the service level.

---

## Running

```bash
# local (real LLM)
pnpm --filter @forge/e2e scenario create-project

# CI (stub mode)
FORGE_USE_STUB=true pnpm --filter @forge/e2e scenario create-project

# Makefile target
scenario:
	FORGE_USE_STUB=true pnpm --filter @forge/e2e scenario $(name)
```

---

## V1 Scope

First delivery covers only the framework + `create-project` scenario, enough to prove the runner/log/report pipeline end-to-end.

| Item | V1 | Later |
|------|----|----|
| ScenarioRunner + ScenarioContext | ✅ | |
| LogCollector (API calls) | ✅ | |
| ReportWriter (Markdown) | ✅ | |
| LLM stub registry | ✅ | |
| `create-project` scenario | ✅ | |
| `kb-ingest` scenario | | ✅ |
| `create-agent` scenario | | ✅ |
| Service-internal log tapping (trace ID) | | ✅ |

---

## Out of Scope

- Modifying Go API or agent service internal log format (v1 relies on observable HTTP state only)
- Report diffing across runs
- Automatic PR comments with report content
