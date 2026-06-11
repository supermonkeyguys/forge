/**
 * Browser Agent — DOM-based (no vision required)
 *
 * Instead of screenshots, extracts the page's interactive elements
 * (inputs, buttons, links) and asks a text LLM what to do next.
 * More reliable than coordinate-clicking and works with any text model.
 *
 * Run:
 *   node --env-file=.env --import tsx/esm src/browser-agent.ts
 *
 * Customize:
 *   AGENT_GOAL="..." AGENT_START_URL="https://..." node --env-file=.env --import tsx/esm src/browser-agent.ts
 */

import { chromium, type Page } from 'playwright'
import { createOpenAI } from '@ai-sdk/openai'
import { generateText } from 'ai'

const provider = createOpenAI({
  apiKey:      process.env['OPENAI_API_KEY'] ?? '',
  baseURL:     process.env['OPENAI_BASE_URL'] ?? 'https://api.openai.com/v1',
  compatibility: 'compatible',
})
const model = provider.chat(process.env['OPENAI_MODEL'] ?? 'deepseek-chat')

// ── Types ─────────────────────────────────────────────────────────

interface PageElement {
  id:          number
  tag:         string
  inputType:   string
  text:        string
  placeholder: string
  label:       string
  options:     string[]   // for <select> elements
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

// ── Extract interactive elements from DOM ──────────────────────────

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
          x: Math.round(rect.x + rect.width / 2),
          y: Math.round(rect.y + rect.height / 2),
          visible: rect.width > 0 && rect.height > 0 && rect.top < window.innerHeight,
        }
      })
      .filter(e => e.visible)
      .slice(0, 40)  // cap at 40 elements to stay within token limits
  }) as Promise<PageElement[]>
}

function formatElements(elements: PageElement[]): string {
  return elements.map(e => {
    const parts = [
      `[${e.id}]`,
      `<${e.tag}${e.inputType ? ` type="${e.inputType}"` : ''}>`,
    ]
    if (e.label)              parts.push(`name/id="${e.label}"`)
    if (e.placeholder)        parts.push(`placeholder="${e.placeholder}"`)
    if (e.options.length > 0) parts.push(`options=[${e.options.join('|')}]`)
    else if (e.text)          parts.push(`text="${e.text}"`)
    parts.push(`@ (${e.x},${e.y})`)
    return parts.join(' ')
  }).join('\n')
}

// ── Ask LLM what to do next ────────────────────────────────────────

async function decideNextAction(
  page: Page,
  goal: string,
  history: string[],
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

For clicking a button or link:
{"action":"click","id":<element id>,"reason":"<why>"}

For filling an input field:
{"action":"fill","id":<element id>,"text":"<value to type>","reason":"<why>"}

For selecting an option from a <select> dropdown (MUST use this, not click):
{"action":"select","id":<element id>,"value":"<option value>","reason":"<why>"}

For navigating to a URL (when no suitable elements exist):
{"action":"navigate","url":"<full url>","reason":"<why>"}

For scrolling to see more:
{"action":"scroll","direction":"down","reason":"<why>"}

When the goal is fully achieved:
{"action":"done","summary":"<what was accomplished>"}

Rules:
- Use exact element IDs from the list above
- For forms, fill each field then click submit
- If goal is already achieved, use "done" immediately`

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
    return { type: 'error', message: `Parse error: ${e} — raw: ${text.slice(0, 200)}` }
  }
}

// ── Execute action ─────────────────────────────────────────────────

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
      return `clicked [${action.id}] "${el.text || el.label}" — ${action.reason}`
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

// ── Main agent loop ────────────────────────────────────────────────

async function runBrowserAgent(goal: string, startUrl: string) {
  console.log('\n🤖 Browser Agent (DOM-based)')
  console.log(`   Goal : ${goal}`)
  console.log(`   Start: ${startUrl}\n`)

  const browser = await chromium.launch({ headless: false, slowMo: 100 })
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } })
  const page = await context.newPage()

  await page.goto(startUrl)
  await page.waitForLoadState('domcontentloaded')

  const history: string[] = []
  const MAX_STEPS = 20

  for (let step = 0; step < MAX_STEPS; step++) {
    console.log(`\nStep ${step + 1}/${MAX_STEPS}  [${page.url()}]`)

    const elements = await extractElements(page)
    const action = await decideNextAction(page, goal, history)

    if (action.type === 'error') {
      console.log(`❌ ${action.message}`)
      break
    }

    if (action.type === 'done') {
      console.log(`\n✅ ${action.summary}`)
      await page.waitForTimeout(2000)
      break
    }

    const result = await executeAction(page, action, elements)
    history.push(result)
    console.log(`   ✓ ${result}`)

    await page.waitForTimeout(600)
  }

  console.log('\nBrowser staying open for 10s...')
  await page.waitForTimeout(10_000)
  await browser.close()
}

// ── Entry point ────────────────────────────────────────────────────

const GOAL = process.env['AGENT_GOAL']
  ?? 'Fill in the form: custname="张三", custtel="13800138000", then click Submit order'

const START_URL = process.env['AGENT_START_URL']
  ?? 'https://httpbin.org/forms/post'

runBrowserAgent(GOAL, START_URL).catch(err => {
  console.error('Agent crashed:', err)
  process.exit(1)
})
