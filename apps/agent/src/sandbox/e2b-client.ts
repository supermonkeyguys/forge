/**
 * E2B sandbox client wrapper.
 *
 * Each project gets an isolated sandbox. The sandbox runs a Next.js app
 * (npm install → next dev) and exposes a public preview URL.
 */

import { Sandbox } from 'e2b'

export interface SandboxFile {
  path: string
  content: string
}

export interface RunResult {
  stdout: string
  stderr: string
  exitCode: number
}

export class ForgeSandbox {
  private constructor(private readonly sandbox: Sandbox) {}

  // ── Lifecycle ───────────────────────────────────────────────────

  static async create(timeoutMs = 10 * 60 * 1000): Promise<ForgeSandbox> {
    const sandbox = await Sandbox.create({ timeoutMs })
    return new ForgeSandbox(sandbox)
  }

  static async connect(sandboxId: string): Promise<ForgeSandbox> {
    const sandbox = await Sandbox.connect(sandboxId)
    return new ForgeSandbox(sandbox)
  }

  get id(): string {
    return this.sandbox.sandboxId
  }

  async kill(): Promise<void> {
    await this.sandbox.kill()
  }

  async keepAlive(timeoutMs: number): Promise<void> {
    await this.sandbox.setTimeout(timeoutMs)
  }

  // ── Files ───────────────────────────────────────────────────────

  async writeFile(path: string, content: string): Promise<void> {
    await this.sandbox.files.write(path, content)
  }

  async writeFiles(files: SandboxFile[]): Promise<void> {
    // E2B recommends sequential writes for large file sets to avoid rate limits
    for (const f of files) {
      await this.sandbox.files.write(f.path, f.content)
    }
  }

  async readFile(path: string): Promise<string> {
    return this.sandbox.files.read(path)
  }

  // ── Commands ────────────────────────────────────────────────────

  async run(
    cmd: string,
    opts: {
      cwd?: string
      timeoutMs?: number
      onStdout?: (line: string) => void
      onStderr?: (line: string) => void
    } = {},
  ): Promise<RunResult> {
    const result = await this.sandbox.commands.run(cmd, {
      cwd: opts.cwd,
      timeoutMs: opts.timeoutMs ?? 5 * 60 * 1000,
      onStdout: opts.onStdout,
      onStderr: opts.onStderr,
    })
    return {
      stdout: result.stdout,
      stderr: result.stderr,
      exitCode: result.exitCode,
    }
  }

  /** Start a long-running process (e.g. next dev) in the background. */
  async startBackground(
    cmd: string,
    opts: {
      cwd?: string
      onStdout?: (line: string) => void
      onStderr?: (line: string) => void
    } = {},
  ): Promise<void> {
    await this.sandbox.commands.run(cmd, {
      background: true,
      cwd: opts.cwd,
      onStdout: opts.onStdout,
      onStderr: opts.onStderr,
    })
  }

  // ── Networking ──────────────────────────────────────────────────

  /** Returns the public HTTPS URL for a port running inside the sandbox. */
  getPreviewUrl(port = 3000): string {
    return `https://${this.sandbox.getHost(port)}`
  }
}
