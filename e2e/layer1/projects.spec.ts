// e2e/layer1/projects.spec.ts
import { test, expect } from '../fixtures/auth'

test.describe('projects page — empty state', () => {
  test.beforeEach(async ({ authedPage: page }) => {
    await page.route('**/api/v1/projects', async route => {
      if (route.request().method() === 'GET') {
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({ data: [], total: 0, page: 1, limit: 20 }),
        })
      } else {
        await route.continue()
      }
    })
    await page.goto('/projects')
  })

  test('shows empty state when no projects', async ({ authedPage: page }) => {
    await expect(page.getByText('还没有项目')).toBeVisible()
    await expect(page.getByText('用自然语言描述你的 App，Agent 团队来生成它')).toBeVisible()
    await expect(page.getByRole('button', { name: '创建第一个项目' })).toBeVisible()
  })

  test('empty state CTA navigates to /projects/new', async ({ authedPage: page }) => {
    await page.getByRole('button', { name: '创建第一个项目' }).click()
    await expect(page).toHaveURL(/\/projects\/new/)
  })

  test('header shows 我的项目 title and + 新建项目 button', async ({ authedPage: page }) => {
    await expect(page.getByRole('heading', { name: '我的项目' })).toBeVisible()
    await expect(page.getByRole('button', { name: '+ 新建项目' })).toBeVisible()
  })

  test('+ 新建项目 button navigates to /projects/new', async ({ authedPage: page }) => {
    await page.getByRole('button', { name: '+ 新建项目' }).click()
    await expect(page).toHaveURL(/\/projects\/new/)
  })
})

test.describe('projects page — with projects', () => {
  test('shows project cards with correct status badges', async ({ authedPage: page }) => {
    await page.route('**/api/v1/projects', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [
            { id: 'p1', name: '报销系统', userId: 'u1', status: 'done', previewUrl: 'https://preview.e2b.dev/p1', createdAt: '2026-05-25T00:00:00Z', updatedAt: '2026-05-25T00:00:00Z' },
            { id: 'p2', name: '任务管理', userId: 'u1', status: 'building', previewUrl: '', createdAt: '2026-05-25T00:00:00Z', updatedAt: '2026-05-25T00:00:00Z' },
            { id: 'p3', name: '电商后台', userId: 'u1', status: 'failed', previewUrl: '', createdAt: '2026-05-25T00:00:00Z', updatedAt: '2026-05-25T00:00:00Z' },
          ],
          total: 3, page: 1, limit: 20,
        }),
      })
    })
    await page.goto('/projects')
    await expect(page.getByText('报销系统')).toBeVisible()
    await expect(page.getByText('任务管理')).toBeVisible()
    await expect(page.getByText('电商后台')).toBeVisible()
    await expect(page.getByText('完成')).toBeVisible()
    await expect(page.getByText('生成中')).toBeVisible()
    await expect(page.getByText('失败')).toBeVisible()
    await expect(page.getByText('3 个项目')).toBeVisible()
  })

  test('done project shows 预览 and 打开 buttons', async ({ authedPage: page }) => {
    await page.route('**/api/v1/projects', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{ id: 'p1', name: '报销系统', userId: 'u1', status: 'done', previewUrl: 'https://preview.e2b.dev/p1', createdAt: '2026-05-25T00:00:00Z', updatedAt: '2026-05-25T00:00:00Z' }],
          total: 1, page: 1, limit: 20,
        }),
      })
    })
    await page.goto('/projects')
    await expect(page.getByRole('button', { name: '预览' })).toBeVisible()
    await expect(page.getByRole('button', { name: '打开' })).toBeVisible()
  })

  test('building project shows 查看进度 button', async ({ authedPage: page }) => {
    await page.route('**/api/v1/projects', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{ id: 'p2', name: '任务管理', userId: 'u1', status: 'building', previewUrl: '', createdAt: '2026-05-25T00:00:00Z', updatedAt: '2026-05-25T00:00:00Z' }],
          total: 1, page: 1, limit: 20,
        }),
      })
    })
    await page.goto('/projects')
    await expect(page.getByRole('button', { name: '查看进度' })).toBeVisible()
  })

  test('failed project shows 重试 and 删除 buttons', async ({ authedPage: page }) => {
    await page.route('**/api/v1/projects', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{ id: 'p3', name: '电商后台', userId: 'u1', status: 'failed', previewUrl: '', createdAt: '2026-05-25T00:00:00Z', updatedAt: '2026-05-25T00:00:00Z' }],
          total: 1, page: 1, limit: 20,
        }),
      })
    })
    await page.goto('/projects')
    await expect(page.getByRole('button', { name: '重试' })).toBeVisible()
    await expect(page.getByRole('button', { name: '删除' })).toBeVisible()
  })

  test('clicking 打开 on a done project navigates to /projects/:id', async ({ authedPage: page }) => {
    await page.route('**/api/v1/projects', async route => {
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          data: [{ id: 'proj-123', name: '报销系统', userId: 'u1', status: 'done', previewUrl: 'https://preview.e2b.dev/p1', createdAt: '2026-05-25T00:00:00Z', updatedAt: '2026-05-25T00:00:00Z' }],
          total: 1, page: 1, limit: 20,
        }),
      })
    })
    await page.goto('/projects')
    await page.getByRole('button', { name: '打开' }).click()
    await expect(page).toHaveURL(/\/projects\/proj-123/)
  })
})
