import { readFileSync } from 'fs'
import { resolve } from 'path'

export class StubRegistry {
  private readonly dir: string

  constructor(dir = 'e2e/fixtures/llm-stubs') {
    this.dir = dir
  }

  get(key: string): string {
    const path = resolve(process.cwd(), this.dir, `${key}.txt`)
    return readFileSync(path, 'utf-8')
  }
}
