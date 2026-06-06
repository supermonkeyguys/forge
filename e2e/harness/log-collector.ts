import type { ApiLog } from './types'

export class LogCollector {
  private _logs: ApiLog[] = []

  record(entry: ApiLog): void {
    this._logs.push(entry)
  }

  flush(): ApiLog[] {
    const logs = [...this._logs]
    this._logs = []
    return logs
  }
}
