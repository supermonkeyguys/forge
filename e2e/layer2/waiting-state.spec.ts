// e2e/layer2/waiting-state.spec.ts
//
// Uses the EventSource mock pattern (addInitScript + window._fireSSE) because
// Playwright's route.fulfill() with a static body does not trigger EventSource
// message events in the browser.

import { test, expect } from '../fixtures/auth'

const PROJECT_ID = 'test-proj-waiting'

async function installSSEMock(page: import('@playwright/test').Page) {
  await page.addInitScript(() => {
    const w = window as any
    w._sseListeners = {}
    class MockEventSource {
      readyState = 1
      constructor(public url: string) {}
      addEventListener(type: string, handler: any) {
        w._sseListeners[type] = w._sseListeners[type] || []
        w._sseListeners[type].push(handler)
      }
      removeEventListener(type: string, handler: any) {
        w._sseListeners[type] = (w._sseListeners[type] || []).filter((h: any) => h !== handler)
      }
      close() { this.readyState = 2 }
      set onerror(_: any) {}
    }
    w.EventSource = MockEventSource
    w._fireSSE = (type: string, data: string) => {
      const event = new MessageEvent(type, { data })
      ;(w._sseListeners[type] || []).forEach((l: any) => l(event))
    }
  })
}

async function mockSSEWithWaiting(page: import('@playwright/test').Page) {
  await installSSEMock(page)
  await page.goto(`/projects/${PROJECT_ID}`)
  // Wait for agent cards to be ready (startGeneration + render)
  await page.waitForSelector('text=PM Agent', { timeout: 8_000 })
  // Fire state_change then waiting — setWaiting() triggers phase → 'waiting'
  await page.evaluate(() => {
    const w = window as any
    w._fireSSE('agent_event', JSON.stringify({ type: 'state_change', state: 'building' }))
    w._fireSSE('agent_event', JSON.stringify({ type: 'waiting', reason: '需要你确认数据库字段设计' }))
  })
}

test.describe('waiting state', () => {
  test('shows waiting reason message', async ({ authedPage: page }) => {
    await mockSSEWithWaiting(page)
    // ConversationHistory renders "AI 卡住了，需要你的帮助" when phase === 'waiting'
    await expect(page.getByText('AI 卡住了，需要你的帮助')).toBeVisible({ timeout: 10_000 })
    await expect(page.getByText('需要你确认数据库字段设计')).toBeVisible()
  })

  test('iteration input box appears in waiting phase', async ({ authedPage: page }) => {
    await mockSSEWithWaiting(page)
    await page.getByText('AI 卡住了，需要你的帮助').waitFor({ timeout: 10_000 })
    // ConversationHistory shows input with placeholder "告诉 AI 怎么解决..." in waiting phase
    await expect(page.getByPlaceholder('告诉 AI 怎么解决...')).toBeVisible()
    await expect(page.getByRole('button', { name: '发送' })).toBeVisible()
  })

  test('iteration input can be typed into', async ({ authedPage: page }) => {
    await mockSSEWithWaiting(page)
    await page.getByText('AI 卡住了，需要你的帮助').waitFor({ timeout: 10_000 })
    const input = page.getByPlaceholder('告诉 AI 怎么解决...')
    await input.fill('保持原来的字段设计，继续')
    await expect(input).toHaveValue('保持原来的字段设计，继续')
  })

  test('send button disabled when input is empty', async ({ authedPage: page }) => {
    await mockSSEWithWaiting(page)
    await page.getByText('AI 卡住了，需要你的帮助').waitFor({ timeout: 10_000 })
    // Button has disabled attribute when iterationInput.trim() is falsy
    await expect(page.getByRole('button', { name: '发送' })).toBeDisabled()
  })
})
