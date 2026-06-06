import type { IScenarioContext, ApiResponse, Checkpoint, ApiLog } from './types'
import { LogCollector } from './log-collector'

const API_BASE = process.env['FORGE_API_URL'] ?? 'http://localhost:8080'

export class ScenarioContext implements IScenarioContext {
  private _checkpoints: Checkpoint[] = []
  private _collector = new LogCollector()
  state: Record<string, unknown> = {}
  private _page: import('@playwright/test').Page | null = null

  api = {
    post: async <T = unknown>(url: string, body: unknown): Promise<ApiResponse<T>> => {
      const token = this.state['_token'] as string | undefined
      const res = await fetch(`${API_BASE}${url}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(body),
      })
      const data = await res.json().catch(() => null) as T
      this._collector.record({ method: 'POST', url, status: res.status, body: data, timestamp: Date.now() })
      return { status: res.status, data }
    },

    get: async <T = unknown>(url: string): Promise<ApiResponse<T>> => {
      const token = this.state['_token'] as string | undefined
      const res = await fetch(`${API_BASE}${url}`, {
        headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}) },
      })
      const data = await res.json().catch(() => null) as T
      this._collector.record({ method: 'GET', url, status: res.status, body: data, timestamp: Date.now() })
      return { status: res.status, data }
    },
  }

  checkpoint(name: string, passed: boolean, details?: string): void {
    this._checkpoints.push({ name, passed, details })
  }

  flushCheckpoints(): Checkpoint[] {
    const c = [...this._checkpoints]
    this._checkpoints = []
    return c
  }

  flushLogs(): ApiLog[] {
    return this._collector.flush()
  }

  async pollUntil<T>(
    fn: () => Promise<ApiResponse<T>>,
    condition: (res: ApiResponse<T>) => boolean,
    opts: { timeout?: number; interval?: number } = {},
  ): Promise<ApiResponse<T>> {
    const { timeout = 30_000, interval = 1_000 } = opts
    const deadline = Date.now() + timeout
    let last: ApiResponse<T> | undefined
    while (Date.now() < deadline) {
      last = await fn()
      if (condition(last)) return last
      await new Promise((r) => setTimeout(r, interval))
    }
    return last ?? fn()
  }

  async getPage(): Promise<import('@playwright/test').Page> {
    if (!this._page) {
      const { chromium } = await import('playwright')
      const browser = await chromium.launch()
      this._page = await browser.newPage()
    }
    return this._page
  }
}
