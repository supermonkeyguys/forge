// e2e/layer2/agent-flow.spec.ts
//
// SSE URL confirmed from apps/api/api/router.go + apps/web/src/hooks/useAgentEvents.ts:
//   GET /api/v1/projects/:projectID/stream?token=<jwt>
//
// Playwright's route.fulfill() with a static body does NOT trigger EventSource
// message events — the browser EventSource requires a true streaming connection.
// Instead we replace EventSource with a mock before page load (addInitScript),
// then fire events from the test via window._fireSSE().

import { test, expect } from '../fixtures/auth'

const PROJECT_ID = 'test-proj-sse'

/** Install the EventSource mock. Must be called before page.goto(). */
async function installSSEMock(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const w = window as any
    w._sseListeners = {}

    class MockEventSource {
      readyState = 1 // OPEN
      constructor(public url: string) {
        w._sseInstances = w._sseInstances || []
        w._sseInstances.push(this)
        w._lastSSEInstance = this
      }
      addEventListener(type: string, handler: (e: MessageEvent) => void) {
        w._sseListeners[type] = w._sseListeners[type] || []
        w._sseListeners[type].push(handler)
      }
      removeEventListener(type: string, handler: (e: MessageEvent) => void) {
        w._sseListeners[type] = (w._sseListeners[type] || []).filter((h: any) => h !== handler)
      }
      close() { this.readyState = 2 }
      set onerror(_: any) {}
    }

    w.EventSource = MockEventSource

    /** Fire a named SSE event with a JSON-stringified data payload. */
    w._fireSSE = (type: string, data: string) => {
      const event = new MessageEvent(type, { data })
      ;(w._sseListeners[type] || []).forEach((l: any) => l(event))
    }
  })
}

/** Fire agent_event SSE messages then the done event, from within the page. */
async function fireSSEEvents(
  page: import('@playwright/test').Page,
  events: object[],
  { withDone = false }: { withDone?: boolean } = {},
) {
  for (const e of events) {
    await page.evaluate((data) => {
      (window as any)._fireSSE('agent_event', JSON.stringify(data))
    }, e)
  }
  if (withDone) {
    await page.evaluate(() => {
      (window as any)._fireSSE('done', JSON.stringify({ previewUrl: 'https://test.e2b.dev/preview' }))
    })
  }
}

/**
 * Set up SSE mock, navigate to the project page (triggers startGeneration),
 * wait for agent cards to render, then fire the provided events.
 */
async function enterRunningWithSSE(
  page: import('@playwright/test').Page,
  events: object[],
) {
  await installSSEMock(page)
  await page.goto(`/projects/${PROJECT_ID}`)
  // Wait for the center panel agent cards to be rendered
  await page.waitForSelector('text=PM Agent', { timeout: 8_000 })
  await fireSSEEvents(page, events)
}

test.describe('agent flow via SSE', () => {
  test('agent card shows message on agent_start event', async ({ authedPage: page }) => {
    await enterRunningWithSSE(page, [
      { type: 'agent_start', agent: 'pm', message: 'Analyzing requirements...' },
    ])
    // AgentCard renders currentAction in a <p> element
    await expect(page.getByText('Analyzing requirements...')).toBeVisible({ timeout: 5_000 })
  })

  test('agent card shows content on agent_thinking event', async ({ authedPage: page }) => {
    await enterRunningWithSSE(page, [
      { type: 'agent_start', agent: 'architect', message: 'Starting...' },
      { type: 'agent_thinking', agent: 'architect', content: 'Designing the schema...' },
    ])
    // agent_thinking updates currentAction to event.content
    await expect(page.getByText('Designing the schema...')).toBeVisible({ timeout: 5_000 })
  })

  test('agent card shows filename on agent_file_write event', async ({ authedPage: page }) => {
    await enterRunningWithSSE(page, [
      { type: 'agent_start', agent: 'schema', message: 'Starting...' },
      { type: 'agent_file_write', agent: 'schema', file: 'infra/sqlc/queries/project.sql', action: 'create' },
    ])
    // filesWritten renders as "+ {filename}" in a <p> inside the card
    // Use exact match on the "+ project.sql" rendered text
    await expect(page.getByText('+ project.sql', { exact: true })).toBeVisible({ timeout: 5_000 })
  })

  test('agent card shows done checkmark on agent_done event', async ({ authedPage: page }) => {
    await enterRunningWithSSE(page, [
      { type: 'agent_start', agent: 'pm', message: 'Starting...' },
      { type: 'agent_done', agent: 'pm', summary: 'Requirements analyzed' },
    ])
    // AgentCard renders ✓ span (color: var(--green)) when status === 'done'
    // Scope to the PM Agent card to avoid matching other ✓ marks on the page
    const pmCard = page.locator('div').filter({ hasText: /^📋PM Agent需求分析与放大/ })
    await expect(pmCard.getByText('✓')).toBeVisible({ timeout: 5_000 })
  })

  test('agent card shows error text on agent_error event', async ({ authedPage: page }) => {
    await enterRunningWithSSE(page, [
      { type: 'agent_start', agent: 'logic', message: 'Starting...' },
      { type: 'agent_error', agent: 'logic', error: 'Compilation failed' },
    ])
    // currentAction is set to event.error and rendered in the AgentCard <p> (exact text)
    // Also appears in ConversationHistory as "logic: Compilation failed" — use exact match
    await expect(page.getByText('Compilation failed', { exact: true })).toBeVisible({ timeout: 5_000 })
  })

  test('orchestrator bar shows 生成代码 on state_change building', async ({ authedPage: page }) => {
    await installSSEMock(page)
    await page.goto(`/projects/${PROJECT_ID}`)
    await page.waitForSelector('text=PM Agent', { timeout: 8_000 })
    await fireSSEEvents(page, [{ type: 'state_change', state: 'building' }])
    // OrchestratorBar renders a badge with stateConfig['building'].label = '生成代码'
    // There is also '生成代码' in BuildingPlaceholder steps, so assert the badge specifically:
    // The badge is a <span> inside the OrchestratorBar (styled with background + border-radius)
    await expect(page.locator('span').filter({ hasText: '生成代码' }).first()).toBeVisible({ timeout: 5_000 })
  })

  test('AI thinking log appears and is expandable', async ({ authedPage: page }) => {
    await enterRunningWithSSE(page, [
      { type: 'agent_thinking', agent: 'architect', content: 'Thinking about architecture...' },
    ])
    // Log drawer button shows "AI 思考日志 (N 条)" when thinkingEvents.length > 0
    await expect(page.getByText(/AI 思考日志/)).toBeVisible({ timeout: 5_000 })
    await page.getByText(/AI 思考日志/).click()
    // After expanding, the log drawer renders "[architect] Thinking about architecture..."
    // Use a regex to match the log entry that prefixes with the agent name
    await expect(page.getByText(/\[architect\] Thinking about architecture\.\.\./)).toBeVisible()
  })
})
