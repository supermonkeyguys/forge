// e2e/layer1/workspace-pm-review.spec.ts
import { test, expect } from '../fixtures/auth'

async function submitRequirement(page: import('@playwright/test').Page) {
  await page.goto('/projects/new')
  await page.getByRole('textbox').fill('我需要一个报销申请系统')
  await page.getByRole('button', { name: /生成应用/ }).click()
  await expect(page.getByText(/我理解你想做/)).toBeVisible({ timeout: 5_000 })
}

test.describe('workspace pm-review phase', () => {
  test('shows AI-amplified feature list after submit', async ({ authedPage: page }) => {
    await submitRequirement(page)
    await expect(page.getByText(/我理解你想做/)).toBeVisible()
    await expect(page.getByText('必需')).toBeVisible()
    await expect(page.getByText('常见')).toBeVisible()
  })

  test('shows confirm button with selected count', async ({ authedPage: page }) => {
    await submitRequirement(page)
    await expect(page.getByRole('button', { name: /确认并生成/ })).toBeVisible()
  })

  test('back button returns to input phase', async ({ authedPage: page }) => {
    await submitRequirement(page)
    await page.getByRole('button', { name: '← 返回' }).click()
    await expect(page.getByRole('button', { name: /生成应用/ })).toBeVisible()
  })

  test('confirms and transitions to running phase', async ({ authedPage: page }) => {
    await page.route('**/api/v1/projects', async route => {
      if (route.request().method() === 'POST') {
        await route.fulfill({
          status: 201,
          contentType: 'application/json',
          body: JSON.stringify({
            data: {
              id: 'mock-proj-001',
              name: '我需要一个报销申请系统',
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
    await submitRequirement(page)
    await page.getByRole('button', { name: /确认并生成/ }).click()
    await expect(page.getByText('启动中...')).toBeVisible({ timeout: 5_000 })
  })

  test('preview panel shows 确认需求后开始生成 during pm-review', async ({ authedPage: page }) => {
    await submitRequirement(page)
    await expect(page.getByText('确认需求后开始生成')).toBeVisible()
  })
})
