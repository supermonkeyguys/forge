/**
 * MockSandbox — in-memory sandbox for testing without E2B.
 * File writes go to a Map; run() always returns success.
 * Set E2B_API_KEY=mock in .env to activate.
 */

import type { SandboxInterface } from '../orchestrator/orchestrator.js'

export class MockSandbox implements SandboxInterface {
  private fs = new Map<string, string>()

  async writeFile(path: string, content: string): Promise<void> {
    this.fs.set(path, content)
    console.log(`[mock-sandbox] writeFile ${path} (${content.length} bytes)`)
  }

  async readFile(path: string): Promise<string> {
    return this.fs.get(path) ?? ''
  }

  async run(cmd: string, _opts?: { cwd?: string; timeoutMs?: number }) {
    console.log(`[mock-sandbox] run: ${cmd.slice(0, 80)}`)
    return { stdout: '', stderr: '', exitCode: 0 }
  }

  async startBackground(cmd: string, _opts?: { cwd?: string }) {
    console.log(`[mock-sandbox] startBackground: ${cmd.slice(0, 80)}`)
  }

  getPreviewUrl(_port: number): string {
    return ''
  }

  async keepAlive(_timeoutMs: number): Promise<void> {}
}
