// e2e/layer2/preview-panel.spec.ts
//
// Uses the EventSource mock pattern (addInitScript + window._fireSSE) because
// Playwright's route.fulfill() with a static body does not trigger EventSource
// message events in the browser.

import { test, expect } from '../fixtures/auth'

const PROJECT_ID = 'test-proj-preview'
const PREVIEW_URL = 'https://test.e2b.dev/preview-app'

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

async function mockSSEWithDone(page: import('@playwright/test').Page) {
  await installSSEMock(page)
  await page.goto(`/projects/${PROJECT_ID}`)
  // Wait for agent cards to be ready (startGeneration + render)
  await page.waitForSelector('text=PM Agent', { timeout: 8_000 })
  // Fire state_change then done — setPreviewUrl triggers phase → 'done'
  await page.evaluate((previewUrl) => {
    const w = window as any
    w._fireSSE('agent_event', JSON.stringify({ type: 'state_change', state: 'building' }))
    w._fireSSE('done', JSON.stringify({ previewUrl }))
  }, PREVIEW_URL)
}

test.describe('preview panel', () => {
  test('shows placeholder when no previewUrl', async ({ authedPage: page }) => {
    await page.goto('/projects/new')
    // BuildingPlaceholder for phase === 'input' shows this text
    await expect(page.getByText('输入需求后预览将出现在这里')).toBeVisible()
  })

  test('iframe appears when SSE done event fires with previewUrl', async ({ authedPage: page }) => {
    await mockSSEWithDone(page)
    // setPreviewUrl triggers phase → 'done' and previewUrl set, iframe renders
    const iframe = page.locator('iframe[title="App Preview"]')
    await expect(iframe).toBeVisible({ timeout: 10_000 })
    await expect(iframe).toHaveAttribute('src', PREVIEW_URL)
  })

  test('URL bar shows previewUrl after done', async ({ authedPage: page }) => {
    await mockSSEWithDone(page)
    await page.locator('iframe[title="App Preview"]').waitFor({ timeout: 10_000 })
    // The URL bar div renders previewUrl text directly
    await expect(page.getByText(PREVIEW_URL)).toBeVisible()
  })

  test('refresh button appears and reloads iframe', async ({ authedPage: page }) => {
    await mockSSEWithDone(page)
    await page.locator('iframe[title="App Preview"]').waitFor({ timeout: 10_000 })
    // Refresh button has title="刷新预览"
    const refreshBtn = page.getByTitle('刷新预览')
    await expect(refreshBtn).toBeVisible()
    await refreshBtn.click()
    // After click, iframeKey increments; iframe still visible
    await expect(page.locator('iframe[title="App Preview"]')).toBeVisible()
  })

  test('open in new tab button appears after done', async ({ authedPage: page }) => {
    await mockSSEWithDone(page)
    await page.locator('iframe[title="App Preview"]').waitFor({ timeout: 10_000 })
    // Button has title="在新标签页打开"
    await expect(page.getByTitle('在新标签页打开')).toBeVisible()
  })
})
