/**
 * LocalSandbox — runs generated code directly on the host machine.
 *
 * Activation: set E2B_API_KEY=local in .env
 *
 * Files are written to ~/.forge/sandboxes/<jobId>/
 * The Next.js dev server starts on a deterministic port (3100–3999).
 * E2E checks work for real because there is an actual running server.
 */

import { mkdir, writeFile as fsWriteFile, readFile as fsReadFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { homedir } from 'node:os'
import { spawn, exec } from 'node:child_process'
import { promisify } from 'node:util'
import type { SandboxInterface } from '../orchestrator/orchestrator.js'

const execAsync = promisify(exec)

const SANDBOX_APP = '/home/user/app'
const SANDBOX_USER = '/home/user'

function simpleHash(str: string): number {
  let h = 0
  for (let i = 0; i < str.length; i++) {
    h = (Math.imul(31, h) + str.charCodeAt(i)) | 0
  }
  return h
}

export class LocalSandbox implements SandboxInterface {
  readonly baseDir: string
  readonly port: number
  private bgProcs: ReturnType<typeof spawn>[] = []

  constructor(jobId: string) {
    this.baseDir = join(homedir(), '.forge', 'sandboxes', jobId)
    this.port = 3100 + (Math.abs(simpleHash(jobId)) % 900)
  }

  private local(path: string): string {
    if (path.startsWith(SANDBOX_APP)) return join(this.baseDir, path.slice(SANDBOX_APP.length))
    if (path.startsWith(SANDBOX_USER)) return join(this.baseDir, path.slice(SANDBOX_USER.length))
    if (path.startsWith('/')) return join(this.baseDir, path.slice(1))
    return join(this.baseDir, path)
  }

  async writeFile(path: string, content: string): Promise<void> {
    const dest = this.local(path)
    await mkdir(dirname(dest), { recursive: true })
    await fsWriteFile(dest, content, 'utf8')
    console.log(`[local-sandbox] write ${path} (${content.length}b)`)
  }

  async readFile(path: string): Promise<string> {
    try {
      return await fsReadFile(this.local(path), 'utf8')
    } catch {
      return ''
    }
  }

  async run(cmd: string, opts?: { cwd?: string; timeoutMs?: number }) {
    const cwd = opts?.cwd ? this.local(opts.cwd) : this.baseDir
    await mkdir(cwd, { recursive: true })
    console.log(`[local-sandbox] run: ${cmd.slice(0, 100)}`)
    try {
      const { stdout, stderr } = await execAsync(cmd, {
        cwd,
        timeout: opts?.timeoutMs ?? 120_000,
      })
      return { stdout, stderr, exitCode: 0 }
    } catch (e: any) {
      return { stdout: e.stdout ?? '', stderr: e.stderr ?? String(e), exitCode: e.code ?? 1 }
    }
  }

  async startBackground(cmd: string, opts?: { cwd?: string }): Promise<void> {
    const cwd = opts?.cwd ? this.local(opts.cwd) : this.baseDir
    await mkdir(cwd, { recursive: true })

    // Install dependencies the first time
    if (!existsSync(join(cwd, 'node_modules'))) {
      console.log(`[local-sandbox] npm install in ${cwd} …`)
      await this.run('npm install --legacy-peer-deps', { cwd: opts?.cwd, timeoutMs: 300_000 })
    }

    // PORT env var overrides any -p flag in the npm script
    const portedCmd = `PORT=${this.port} ${cmd}`

    console.log(`[local-sandbox] startBackground: ${portedCmd} (port ${this.port})`)
    const proc = spawn('sh', ['-c', portedCmd], {
      cwd,
      detached: false,
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    proc.stdout?.on('data', (d: Buffer) =>
      process.stdout.write(`[sandbox:${this.port}] ${d}`),
    )
    proc.stderr?.on('data', (d: Buffer) =>
      process.stderr.write(`[sandbox:${this.port}] ${d}`),
    )
    this.bgProcs.push(proc)
  }

  getPreviewUrl(_port: number): string {
    return `http://localhost:${this.port}`
  }

  async kill(): Promise<void> {
    for (const p of this.bgProcs) {
      try { p.kill('SIGTERM') } catch {}
    }
    this.bgProcs = []
  }

  async keepAlive(_ms: number): Promise<void> {
    // Local processes keep running until kill() — no-op
  }
}
