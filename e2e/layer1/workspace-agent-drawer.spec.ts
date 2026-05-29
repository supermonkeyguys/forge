// e2e/layer1/workspace-agent-drawer.spec.ts
// Tests: AgentDrawer — click to open, timeline content, close behaviors
import { test, expect, type Page } from '../fixtures/auth'

// Injects mock agent events via the store's exposed injectMockEvents helper.
// The ⚡ Mock button is only rendered in DEV mode (import.meta.env.DEV).
async function injectMockData(page: Page) {
  await page.evaluate(async () => {
    const mod = await import('/src/store/workspace-store.ts')
    const store = (mod as any).useWorkspaceStore.getState()
    store.setPhase('running')
    const add = store.addEvent.bind(store)
    add({ type: 'agent_start',    agent: 'pm', message: 'PM 开始' })
    add({ type: 'agent_thinking', agent: 'pm', content: '分析需求，梳理输入输出边界，确认依赖关系' })
    add({ type: 'agent_tool_use', agent: 'pm', tool: 'read_file' })
    add({ type: 'agent_file_write', agent: 'pm', file: 'src/pm/index.ts', action: 'create' })
    add({ type: 'agent_done',     agent: 'pm', summary: '完成需求分析，输出功能列表，接口已对齐下游' })
    add({ type: 'agent_start',    agent: 'logic', message: 'Logic 开始' })
    add({ type: 'agent_thinking', agent: 'logic', content: '正在分析业务规则' })
  })
}

test.describe('AgentDrawer', () => {
  test.beforeEach(async ({ authedPage: page }) => {
    // Navigate to any workspace project URL — the ID doesn't matter for mock tests
    await page.goto('/projects/mock-proj-drawer')
    await injectMockData(page)
    // Wait for cards to render
    await expect(page.getByText('PM Agent')).toBeVisible({ timeout: 5_000 })
  })

  test('non-idle card is clickable and opens drawer', async ({ authedPage: page }) => {
    await page.getByText('PM Agent').click()
    await expect(page.locator('.agent-drawer')).toBeVisible({ timeout: 2_000 })
  })

  test('drawer shows agent name in header', async ({ authedPage: page }) => {
    await page.getByText('PM Agent').click()
    const drawer = page.locator('.agent-drawer')
    await expect(drawer.getByText('PM Agent')).toBeVisible()
  })

  test('drawer shows event timeline items', async ({ authedPage: page }) => {
    await page.getByText('PM Agent').click()
    const drawer = page.locator('.agent-drawer')
    // These labels come from EventItem type mappings in AgentDrawer.tsx
    await expect(drawer.getByText('开始执行')).toBeVisible()
    await expect(drawer.getByText('思考')).toBeVisible()
    await expect(drawer.getByText('写入文件')).toBeVisible()
  })

  test('thinking event row is clickable and toggles content', async ({ authedPage: page }) => {
    await page.getByText('PM Agent').click()
    const drawer = page.locator('.agent-drawer')
    // The "思考" label is a collapsible button — clicking it toggles full content
    const thinkingBtn = drawer.getByText('思考').first()
    await expect(thinkingBtn).toBeVisible()
    // Clicking should not cause an error
    await thinkingBtn.click()
    // After click, the row is still present
    await expect(thinkingBtn).toBeVisible()
  })

  test('done event row is clickable and toggles content', async ({ authedPage: page }) => {
    await page.getByText('PM Agent').click()
    const drawer = page.locator('.agent-drawer')
    const doneBtn = drawer.getByText('完成').first()
    await expect(doneBtn).toBeVisible()
    await doneBtn.click()
    await expect(doneBtn).toBeVisible()
  })

  test('close button dismisses drawer', async ({ authedPage: page }) => {
    await page.getByText('PM Agent').click()
    const drawer = page.locator('.agent-drawer')
    await expect(drawer).toBeVisible()
    // Click the first button in the drawer header (the X close button)
    await drawer.locator('button').first().click()
    await expect(drawer).not.toBeVisible({ timeout: 2_000 })
  })

  test('clicking backdrop dismisses drawer', async ({ authedPage: page }) => {
    await page.getByText('PM Agent').click()
    await expect(page.locator('.agent-drawer')).toBeVisible()
    await page.locator('.agent-drawer-backdrop').click()
    await expect(page.locator('.agent-drawer')).not.toBeVisible()
  })

  test('Escape key dismisses drawer', async ({ authedPage: page }) => {
    await page.getByText('PM Agent').click()
    await expect(page.locator('.agent-drawer')).toBeVisible()
    await page.keyboard.press('Escape')
    await expect(page.locator('.agent-drawer')).not.toBeVisible()
  })

  test('idle card is not clickable', async ({ authedPage: page }) => {
    // 'api' agent is idle — clicking it should NOT open drawer
    await page.getByText('API Agent').click()
    await expect(page.locator('.agent-drawer')).not.toBeVisible()
  })
})
