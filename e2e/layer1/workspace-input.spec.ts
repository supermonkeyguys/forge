// e2e/layer1/workspace-input.spec.ts
import { test, expect } from '../fixtures/auth'

test.describe('workspace input phase', () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.goto('/projects/new')
  })

  test('shows three-column layout', async ({ authedPage: page }) => {
    await expect(page.getByText('🔨 Forge')).toBeVisible()
    await expect(page.getByText('Agent 协作流程')).toBeVisible()
    await expect(page.getByText('输入需求后预览将出现在这里')).toBeVisible()
  })

  test('shows requirement textarea and submit button', async ({ authedPage: page }) => {
    await expect(page.getByRole('textbox')).toBeVisible()
    await expect(page.getByRole('button', { name: /生成应用/ })).toBeVisible()
  })

  test('submit button is disabled when textarea is empty', async ({ authedPage: page }) => {
    await expect(page.getByRole('button', { name: /生成应用/ })).toBeDisabled()
  })

  test('submit button enables after typing', async ({ authedPage: page }) => {
    await page.getByRole('textbox').fill('我需要一个报销申请系统')
    await expect(page.getByRole('button', { name: /生成应用/ })).toBeEnabled()
  })

  test('example buttons fill the textarea', async ({ authedPage: page }) => {
    await page.getByRole('button', { name: '→ 做一个任务管理 App' }).click()
    await expect(page.getByRole('textbox')).toHaveValue('做一个任务管理 App')
  })

  test('center panel shows idle state before generation', async ({ authedPage: page }) => {
    await expect(page.getByText('Agent 团队待命中')).toBeVisible()
  })
})
