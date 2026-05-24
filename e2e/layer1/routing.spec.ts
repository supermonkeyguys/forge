// e2e/layer1/routing.spec.ts
// Tests: route redirects and auth guard behavior

import { test, expect } from '@playwright/test'

test.describe('routing', () => {
  test('/ redirects to /login when unauthenticated', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL(/\/login/)
  })

  test('unauthenticated access to /projects redirects to /login', async ({ page }) => {
    await page.goto('/projects')
    await expect(page).toHaveURL(/\/login/)
  })

  test('unauthenticated access to /projects/new redirects to /login', async ({ page }) => {
    await page.goto('/projects/new')
    await expect(page).toHaveURL(/\/login/)
  })

  test('/login page renders brand name, login form and dev button', async ({ page }) => {
    await page.goto('/login')
    await expect(page.getByRole('heading', { name: 'Forge' })).toBeVisible()
    await expect(page.getByPlaceholder('邮箱')).toBeVisible()
    await expect(page.getByPlaceholder('密码')).toBeVisible()
    await expect(page.getByRole('button', { name: '登录', exact: true })).toBeVisible()
    await expect(page.getByRole('button', { name: /快速登录（开发模式）/ })).toBeVisible()
  })
})
