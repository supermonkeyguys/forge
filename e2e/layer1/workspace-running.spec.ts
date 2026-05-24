// e2e/layer1/workspace-running.spec.ts
import { test, expect } from '../fixtures/auth'

async function enterRunningPhase(page: import('@playwright/test').Page) {
  await page.route('**/api/v1/projects', async route => {
    if (route.request().method() === 'POST') {
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          data: {
            id: 'mock-proj-run',
            name: '我需要一个任务管理 App',
            userId: 'u1',
            status: 'idle',
            previewUrl: null,
            createdAt: '2026-05-25T00:00:00Z',
            updatedAt: '2026-05-25T00:00:00Z',
          },
        }),
      })
    } else {
      await route.continue()
    }
  })
  await page.goto('/projects/new')
  await page.getByRole('textbox').fill('我需要一个任务管理 App')
  await page.getByRole('button', { name: /生成应用/ }).click()
  await expect(page.getByText(/我理解你想做/)).toBeVisible({ timeout: 5_000 })
  await page.getByRole('button', { name: /确认并生成/ }).click()
  await expect(page.getByText('启动中...')).toBeVisible({ timeout: 5_000 })
}

test.describe('workspace running phase', () => {
  test('shows all 8 agent cards', async ({ authedPage: page }) => {
    await enterRunningPhase(page)
    await expect(page.getByText('PM Agent')).toBeVisible()
    await expect(page.getByText('Architect')).toBeVisible()
    await expect(page.getByText('Schema Agent')).toBeVisible()
    await expect(page.getByText('Logic Agent')).toBeVisible()
    await expect(page.getByText('API Agent')).toBeVisible()
    await expect(page.getByText('UI Agent')).toBeVisible()
    await expect(page.getByText('Page Agent')).toBeVisible()
    await expect(page.getByText('Test Agent')).toBeVisible()
  })

  test('left panel shows state indicator', async ({ authedPage: page }) => {
    await enterRunningPhase(page)
    await expect(page.getByText('启动中...')).toBeVisible()
  })

  test('preview panel shows 应用正在生成中 during running', async ({ authedPage: page }) => {
    await enterRunningPhase(page)
    await expect(page.getByText('应用正在生成中...')).toBeVisible()
  })

  test('progress steps are visible in preview panel', async ({ authedPage: page }) => {
    await enterRunningPhase(page)
    await expect(page.getByText('分析需求')).toBeVisible()
    await expect(page.getByText('规划架构')).toBeVisible()
    await expect(page.getByText('生成代码')).toBeVisible()
    await expect(page.getByText('验证功能')).toBeVisible()
  })
})
