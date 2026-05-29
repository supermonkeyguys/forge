// e2e/fixtures/auth.ts
// Provides an authenticated page fixture.
// Performs the dev login flow through the UI (skip login button),
// resulting in a real JWT from the Go API stored in the Zustand in-memory store.

import { test as base, type Page } from '@playwright/test'

export type AuthFixtures = {
  authedPage: Page
}

async function performDevLogin(page: Page) {
  await page.goto('/login')
  await page.getByRole('button', { name: '快速登录（开发模式）' }).click()
  // Wait until redirected to /projects
  await page.waitForURL('**/projects', { timeout: 10_000 })
}

export const test = base.extend<AuthFixtures>({
  authedPage: async ({ page }, use) => {
    await performDevLogin(page)
    await use(page)
  },
})

export { expect } from '@playwright/test'
