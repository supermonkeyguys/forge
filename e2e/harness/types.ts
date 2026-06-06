// e2e/harness/types.ts

export interface ApiLog {
  method: string
  url: string
  status: number
  body: unknown
  timestamp: number
}

export interface Checkpoint {
  name: string
  passed: boolean
  details?: string
}

export interface StepReport {
  name: string
  status: 'passed' | 'failed' | 'skipped'
  duration: number
  checkpoints: Checkpoint[]
  logs: ApiLog[]
}

export interface Report {
  scenarioName: string
  status: 'passed' | 'failed'
  duration: number
  failedAt?: string
  steps: StepReport[]
}

export interface ApiResponse<T = unknown> {
  status: number
  data: T
}

export interface ScenarioContextApi {
  post<T = unknown>(url: string, body: unknown): Promise<ApiResponse<T>>
  get<T = unknown>(url: string): Promise<ApiResponse<T>>
  postForm<T = unknown>(url: string, fields: Record<string, string>): Promise<ApiResponse<T>>
  delete<T = unknown>(url: string): Promise<ApiResponse<T>>
}

export interface IScenarioContext {
  api: ScenarioContextApi
  state: Record<string, unknown>
  checkpoint(name: string, passed: boolean, details?: string): void
  flushCheckpoints(): Checkpoint[]
  flushLogs(): ApiLog[]
  pollUntil<T>(
    fn: () => Promise<ApiResponse<T>>,
    condition: (res: ApiResponse<T>) => boolean,
    opts?: { timeout?: number; interval?: number },
  ): Promise<ApiResponse<T>>
  getPage(): Promise<import('@playwright/test').Page>
}

export interface ScenarioStep {
  name: string
  run: (ctx: IScenarioContext) => Promise<void>
}

export interface Scenario {
  name: string
  setup?: (ctx: IScenarioContext) => Promise<void>
  teardown?: (ctx: IScenarioContext) => Promise<void>
  steps: ScenarioStep[]
}
