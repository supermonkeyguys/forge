// e2e/layer1/login.spec.ts
// Tests: login flows — dev mode skip login and real form

import { test, expect } from '@playwright/test'

test.describe('login — dev mode', () => {
  test('dev login button calls register+login API and redirects to /projects', async ({ page }) => {
    await page.goto('/login')

    const registerRequest = page.waitForRequest(req =>
      req.url().includes('/api/v1/auth/register') && req.method() === 'POST'
    )
    const loginRequest = page.waitForRequest(req =>
      req.url().includes('/api/v1/auth/login') && req.method() === 'POST'
    )

    await page.getByRole('button', { name: /快速登录（开发模式）/ }).click()

    await registerRequest
    await loginRequest

    await page.waitForURL('**/projects', { timeout: 10_000 })
    await expect(page).toHaveURL(/\/projects$/)
  })

  test('dev login button shows loading state while in flight', async ({ page }) => {
    await page.goto('/login')

    await page.route('**/api/v1/auth/login', async route => {
      await new Promise(r => setTimeout(r, 300))
      await route.continue()
    })

    await page.getByRole('button', { name: /快速登录（开发模式）/ }).click()
    await expect(page.getByRole('button', { name: '登录中...' })).toBeVisible()
    await page.waitForURL('**/projects', { timeout: 10_000 })
  })
})

test.describe('login — real form', () => {
  test('email and password inputs are enabled and editable', async ({ page }) => {
    await page.goto('/login')
    const emailInput = page.getByPlaceholder('邮箱')
    const passwordInput = page.getByPlaceholder('密码')
    await expect(emailInput).toBeEnabled()
    await expect(passwordInput).toBeEnabled()
    await emailInput.fill('test@example.com')
    await expect(emailInput).toHaveValue('test@example.com')
  })

  test('shows error on wrong credentials', async ({ page }) => {
    await page.goto('/login')
    await page.getByPlaceholder('邮箱').fill('wrong@example.com')
    await page.getByPlaceholder('密码').fill('wrongpassword')
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await expect(page.getByText('邮箱或密码错误')).toBeVisible({ timeout: 5_000 })
  })

  test('shows validation error when fields are empty', async ({ page }) => {
    await page.goto('/login')
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await expect(page.getByText('请输入邮箱和密码')).toBeVisible()
  })

  test('real login works with dev credentials', async ({ page }) => {
    // Ensure dev account exists first
    await page.request.post('http://localhost:8080/api/v1/auth/register', {
      data: { email: 'dev@forge.local', password: 'devpassword123', name: 'Dev User' },
    }).catch(() => {}) // ignore 409 if already exists

    await page.goto('/login')
    await page.getByPlaceholder('邮箱').fill('dev@forge.local')
    await page.getByPlaceholder('密码').fill('devpassword123')
    await page.getByRole('button', { name: '登录', exact: true }).click()
    await page.waitForURL('**/projects', { timeout: 10_000 })
    await expect(page).toHaveURL(/\/projects$/)
  })
})
