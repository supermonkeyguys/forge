import { chromium, type Page } from 'playwright'
import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'
import type { Capability, RunContext, CapabilityResult } from './types.js'

interface PageElement {
  id:          number
  tag:         string
  inputType:   string
  text:        string
  placeholder: string
  label:       string
  options:     string[]
  x:           number
  y:           number
}

type AgentAction =
  | { type: 'click';    id: number; reason: string }
  | { type: 'fill';     id: number; text: string; reason: string }
  | { type: 'select';   id: number; value: string; reason: string }
  | { type: 'navigate'; url: string; reason: string }
  | { type: 'scroll';   direction: 'up' | 'down'; reason: string }
  | { type: 'done';     summary: string }
  | { type: 'error';    message: string }

function getBrowserModel() {
  const providerConfig = {
    apiKey:        process.env['OPENAI_API_KEY'] ?? '',
    baseURL:       process.env['OPENAI_BASE_URL'] ?? undefined,
    compatibility: 'compatible' as const,
  }
  const provider = createOpenAI(providerConfig as Parameters<typeof createOpenAI>[0])
  return provider.chat(process.env['OPENAI_MODEL'] ?? 'deepseek-chat')
}

async function extractElements(page: Page): Promise<PageElement[]> {
  return page.evaluate(() => {
    const sel = 'a, button, input, select, textarea, [role="button"], [role="link"], [role="checkbox"], [role="radio"]'
    return Array.from(document.querySelectorAll(sel))
      .map((el, i) => {
        const rect = el.getBoundingClientRect()
        const input = el as HTMLInputElement
        return {
          id:          i,
          tag:         el.tagName.toLowerCase(),
          inputType:   input.type ?? '',
          text:        (el.textContent ?? '').trim().slice(0, 80),
          placeholder: input.placeholder ?? '',
          label:       (
            el.getAttribute('aria-label') ??
            el.getAttribute('name') ??
            el.getAttribute('id') ??
            el.getAttribute('for') ?? ''
          ),
          options: el.tagName.toLowerCase() === 'select'
            ? Array.from((el as HTMLSelectElement).options).map(o => o.value).filter(Boolean)
            : [],
          x:       Math.round(rect.x + rect.width / 2),
          y:       Math.round(rect.y + rect.height / 2),
          visible: rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight,
        }
      })
      .filter(e => e.visible)
      .slice(0, 40)
  }) as Promise<PageElement[]>
}

function formatElements(elements: PageElement[]): string {
  return elements.map(e => {
    const parts = [`[${e.id}]`, `<${e.tag}${e.inputType ? ` type="${e.inputType}"` : ''}>`]
    if (e.label)              parts.push(`name/id="${e.label}"`)
    if (e.placeholder)        parts.push(`placeholder="${e.placeholder}"`)
    if (e.options.length > 0) parts.push(`options=[${e.options.join('|')}]`)
    else if (e.text)          parts.push(`text="${e.text}"`)
    parts.push(`@ (${e.x},${e.y})`)
    return parts.join(' ')
  }).join('\n')
}

async function decideNextAction(
  page: Page,
  goal: string,
  history: string[],
  model: ReturnType<ReturnType<typeof createOpenAI>['chat']>,
): Promise<AgentAction> {
  const elements = await extractElements(page)
  const elementsText = formatElements(elements)
  const currentUrl = page.url()
  const pageTitle = await page.title()
  const historyText = history.length > 0
    ? `\nDone so far:\n${history.map((s, i) => `  ${i + 1}. ${s}`).join('\n')}`
    : ''

  const prompt = `You are controlling a browser to achieve a goal.

Goal: ${goal}
Current page: "${pageTitle}" — ${currentUrl}${historyText}

Interactive elements on screen:
${elementsText}

Choose the single best next action. Reply with ONLY valid JSON:

For clicking: {"action":"click","id":<id>,"reason":"<why>"}
For filling:  {"action":"fill","id":<id>,"text":"<value>","reason":"<why>"}
For select:   {"action":"select","id":<id>,"value":"<option value>","reason":"<why>"}
For navigate: {"action":"navigate","url":"<url>","reason":"<why>"}
For scroll:   {"action":"scroll","direction":"down","reason":"<why>"}
When done:    {"action":"done","summary":"<what was accomplished>"}`

  const { text } = await generateText({ model, prompt })
  const jsonMatch = text.match(/\{[\s\S]*?\}/)
  if (!jsonMatch) return { type: 'error', message: `No JSON in response: ${text.slice(0, 200)}` }

  try {
    const parsed = JSON.parse(jsonMatch[0]) as Record<string, unknown>
    const action = parsed['action'] as string
    if (action === 'done')     return { type: 'done',     summary: parsed['summary'] as string ?? 'Completed' }
    if (action === 'navigate') return { type: 'navigate', url: parsed['url'] as string, reason: parsed['reason'] as string ?? '' }
    if (action === 'scroll')   return { type: 'scroll',   direction: (parsed['direction'] as 'up' | 'down') ?? 'down', reason: parsed['reason'] as string ?? '' }
    if (action === 'click')    return { type: 'click',    id: Number(parsed['id']), reason: parsed['reason'] as string ?? '' }
    if (action === 'fill')     return { type: 'fill',     id: Number(parsed['id']), text: parsed['text'] as string ?? '', reason: parsed['reason'] as string ?? '' }
    if (action === 'select')   return { type: 'select',   id: Number(parsed['id']), value: parsed['value'] as string ?? '', reason: parsed['reason'] as string ?? '' }
    return { type: 'error', message: `Unknown action: ${action}` }
  } catch (e) {
    return { type: 'error', message: `Parse error: ${e}` }
  }
}

async function executeAction(
  page: Page,
  action: AgentAction,
  elements: PageElement[],
): Promise<string> {
  switch (action.type) {
    case 'click': {
      const el = elements.find(e => e.id === action.id)
      if (!el) return `element [${action.id}] not found`
      await page.mouse.click(el.x, el.y)
      await page.waitForTimeout(800)
      return `clicked [${action.id}] "${el.text || el.label}"`
    }
    case 'fill': {
      const el = elements.find(e => e.id === action.id)
      if (!el) return `element [${action.id}] not found`
      await page.mouse.click(el.x, el.y)
      await page.waitForTimeout(200)
      await page.keyboard.press('Meta+a')
      await page.keyboard.type(action.text, { delay: 30 })
      await page.waitForTimeout(400)
      return `filled [${action.id}] "${el.placeholder || el.label}" = "${action.text}"`
    }
    case 'select': {
      const el = elements.find(e => e.id === action.id)
      if (!el) return `element [${action.id}] not found`
      await page.mouse.click(el.x, el.y)
      await page.waitForTimeout(200)
      await page.selectOption(`select[name="${el.label}"], select#${el.label}, select`, action.value)
      await page.waitForTimeout(400)
      return `selected "${action.value}" in [${action.id}] "${el.label}"`
    }
    case 'navigate':
      await page.goto(action.url)
      await page.waitForLoadState('domcontentloaded')
      return `navigated to ${action.url}`
    case 'scroll':
      await page.evaluate(dir => window.scrollBy(0, dir === 'down' ? 400 : -400), action.direction)
      await page.waitForTimeout(400)
      return `scrolled ${action.direction}`
    default:
      return ''
  }
}

export async function runBrowserTask(
  goal: string,
  startUrl: string,
  emit: RunContext['emit'],
  stepId: string,
): Promise<string> {
  const model = getBrowserModel()
  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const page = await context.newPage()

  try {
    await page.goto(startUrl)
    await page.waitForLoadState('domcontentloaded')

    const history: string[] = []
    const MAX_STEPS = 20

    for (let step = 0; step < MAX_STEPS; step++) {
      emit({ type: 'agent_thinking', agent: stepId, content: `Step ${step + 1}: [${page.url()}]` })

      const elements = await extractElements(page)
      const action = await decideNextAction(page, goal, history, model)

      if (action.type === 'error') {
        emit({ type: 'agent_thinking', agent: stepId, content: `Error: ${action.message}` })
        break
      }

      if (action.type === 'done') {
        emit({ type: 'agent_thinking', agent: stepId, content: `Done: ${action.summary}` })
        return action.summary
      }

      const result = await executeAction(page, action, elements)
      history.push(result)
      emit({ type: 'agent_thinking', agent: stepId, content: result })

      await page.waitForTimeout(600)
    }

    return `Browser task completed (${history.length} steps)`
  } finally {
    await browser.close()
  }
}

export class BrowserCapability implements Capability {
  readonly type = 'browser'

  async execute(
    instructions: string,
    config: Record<string, unknown> | undefined,
    ctx: RunContext,
  ): Promise<CapabilityResult> {
    const startUrl = (config?.['startUrl'] as string) ?? 'about:blank'
    ctx.emit({ type: 'agent_thinking', agent: ctx.stepId, content: `打开浏览器：${startUrl}` })

    try {
      const summary = await runBrowserTask(instructions, startUrl, ctx.emit, ctx.stepId)
      return { status: 'done', output: summary }
    } catch (err) {
      return { status: 'failed', output: '浏览器操作失败', error: String(err) }
    }
  }
}
