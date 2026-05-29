/**
 * Phase 0 — Infrastructure Verification
 *
 * Runs all checks in order. Checks requiring API keys are skipped if the key
 * is not set (marked SKIP instead of FAIL).
 *
 * Run:
 *   cd apps/agent
 *   ANTHROPIC_API_KEY=xxx E2B_API_KEY=xxx npx tsx scripts/verify-infra.ts
 *
 * To run only local checks (no API keys needed):
 *   npx tsx scripts/verify-infra.ts
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(fileURLToPath(import.meta.url), '../../')
const results: { name: string; status: 'PASS' | 'FAIL' | 'SKIP'; detail?: string }[] = []

function pass(name: string, detail?: string) {
  results.push({ name, status: 'PASS', detail })
  console.log(`  ✓ ${name}${detail ? ` — ${detail}` : ''}`)
}

function fail(name: string, detail: string) {
  results.push({ name, status: 'FAIL', detail })
  console.error(`  ✗ ${name} — ${detail}`)
}

function skip(name: string, reason: string) {
  results.push({ name, status: 'SKIP', detail: reason })
  console.log(`  ⊘ ${name} — ${reason}`)
}

function section(title: string) {
  console.log(`\n── ${title} ${'─'.repeat(40 - title.length)}`)
}

// ── A: Template file integrity (local, no API key) ────────────────

async function checkTemplates() {
  section('A. Next.js Template Files')

  const templateDir = join(ROOT, 'src/sandbox/templates/nextjs')
  const required = [
    'package.json',
    'tsconfig.json',
    'next.config.js',
    'src/app/page.tsx',
    'src/app/layout.tsx',
  ]

  for (const file of required) {
    const fullPath = join(templateDir, file)
    if (existsSync(fullPath)) {
      pass(`template/${file}`)
    } else {
      fail(`template/${file}`, 'file missing')
    }
  }

  // Verify package.json has the expected name
  try {
    const { default: pkg } = await import(join(templateDir, 'package.json'), { assert: { type: 'json' } })
    if (pkg.name === 'forge-generated-app') {
      pass('package.json name', pkg.name)
    } else {
      fail('package.json name', `expected "forge-generated-app", got "${pkg.name}"`)
    }
    // Must have next dev script
    if (pkg.scripts?.dev?.includes('next dev')) {
      pass('package.json dev script', pkg.scripts.dev)
    } else {
      fail('package.json dev script', `missing "next dev", got: ${pkg.scripts?.dev}`)
    }
  } catch (err) {
    fail('package.json parse', String(err))
  }
}

// ── B: Vercel AI SDK + Anthropic tool-use ────────────────────────

async function checkAISDK() {
  section('B. Vercel AI SDK — Tool Use')

  if (!process.env.ANTHROPIC_API_KEY) {
    skip('AI SDK tool-use', 'ANTHROPIC_API_KEY not set')
    return
  }

  try {
    const { generateText, tool } = await import('ai')
    const { anthropic } = await import('@ai-sdk/anthropic')
    const { z } = await import('zod')

    let toolCallCount = 0

    const result = await generateText({
      model: anthropic('claude-haiku-4-5-20251001'),  // use Haiku for cost
      system: 'You are a test assistant. When asked to add numbers, use the add tool.',
      prompt: 'Add 3 and 7, then tell me the result.',
      tools: {
        add: tool({
          description: 'Add two numbers',
          parameters: z.object({ a: z.number(), b: z.number() }),
          execute: async ({ a, b }) => {
            toolCallCount++
            return { result: a + b }
          },
        }),
      },
      maxSteps: 3,
    })

    if (toolCallCount === 0) {
      fail('tool called', 'LLM did not call the tool')
      return
    }
    pass('tool called', `${toolCallCount} call(s)`)

    if (result.steps.length >= 2) {
      pass('multi-step', `${result.steps.length} steps completed`)
    } else {
      fail('multi-step', `only ${result.steps.length} step(s), expected >= 2`)
    }

    if (result.text.includes('10')) {
      pass('final answer', result.text.slice(0, 60))
    } else {
      fail('final answer', `expected "10" in response, got: "${result.text.slice(0, 60)}"`)
    }
  } catch (err) {
    fail('AI SDK tool-use', String(err))
  }
}

// ── C: E2B sandbox basic lifecycle ───────────────────────────────

async function checkE2BSandbox() {
  section('C. E2B Sandbox — Basic Lifecycle')

  if (!process.env.E2B_API_KEY) {
    skip('E2B sandbox', 'E2B_API_KEY not set')
    return
  }

  let sandbox: any = null
  try {
    const { ForgeSandbox } = await import('../src/sandbox/e2b-client.js')

    // Create
    const start = Date.now()
    sandbox = await ForgeSandbox.create(5 * 60 * 1000)
    pass('sandbox created', `${sandbox.id} in ${Date.now() - start}ms`)

    // Write file
    await sandbox.writeFile('/home/user/test.txt', 'forge-test-content')
    pass('writeFile')

    // Read file back
    const content = await sandbox.readFile('/home/user/test.txt')
    if (content.trim() === 'forge-test-content') {
      pass('readFile', 'content matches')
    } else {
      fail('readFile', `content mismatch: "${content}"`)
    }

    // Run command
    const result = await sandbox.run('echo hello-forge', { timeoutMs: 10_000 })
    if (result.stdout.trim() === 'hello-forge') {
      pass('run command', `exit ${result.exitCode}`)
    } else {
      fail('run command', `stdout: "${result.stdout.trim()}"`)
    }

    // getPreviewUrl format
    const url = sandbox.getPreviewUrl(3000)
    if (url.startsWith('https://')) {
      pass('getPreviewUrl', url.slice(0, 40) + '...')
    } else {
      fail('getPreviewUrl', `unexpected format: ${url}`)
    }

  } catch (err) {
    fail('E2B sandbox', String(err))
  } finally {
    if (sandbox) {
      await sandbox.kill().catch(() => {})
      pass('sandbox killed')
    }
  }
}

// ── D: E2B + Next.js template (full stack) ───────────────────────

async function checkE2BNextjs() {
  section('D. E2B + Next.js Template — Full Boot')

  if (!process.env.E2B_API_KEY) {
    skip('Next.js boot', 'E2B_API_KEY not set')
    return
  }
  if (!process.env.VERIFY_FULL) {
    skip('Next.js boot', 'set VERIFY_FULL=1 to run (takes ~2min, costs E2B credits)')
    return
  }

  let sandbox: any = null
  try {
    const { ForgeSandbox } = await import('../src/sandbox/e2b-client.js')
    const { loadNextjsTemplate, SANDBOX_APP_DIR } = await import('../src/sandbox/template-loader.js')

    sandbox = await ForgeSandbox.create(10 * 60 * 1000)
    pass('sandbox created', sandbox.id)

    // Push template
    const files = loadNextjsTemplate()
    await sandbox.writeFiles(files)
    pass('template pushed', `${files.length} files`)

    // npm install
    const installResult = await sandbox.run('npm install --prefer-offline', {
      cwd: SANDBOX_APP_DIR,
      timeoutMs: 3 * 60 * 1000,
    })
    if (installResult.exitCode !== 0) {
      fail('npm install', `exit ${installResult.exitCode}\n${installResult.stderr.slice(0, 300)}`)
      return
    }
    pass('npm install', 'exit 0')

    // Start dev server
    await sandbox.startBackground('npm run dev', { cwd: SANDBOX_APP_DIR })
    pass('next dev started')

    // Poll for ready
    const previewUrl = sandbox.getPreviewUrl(3000)
    const deadline = Date.now() + 90_000
    let ready = false

    while (Date.now() < deadline) {
      try {
        const res = await fetch(previewUrl, { signal: AbortSignal.timeout(3_000) })
        if (res.ok || res.status === 404) { ready = true; break }
      } catch { /* keep polling */ }
      await new Promise(r => setTimeout(r, 2_000))
    }

    if (ready) {
      pass('server ready', previewUrl)
    } else {
      fail('server ready', 'timed out after 90s')
    }

  } catch (err) {
    fail('Next.js boot', String(err))
  } finally {
    if (sandbox) {
      await sandbox.kill().catch(() => {})
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────

async function main() {
  console.log('╔══════════════════════════════════════════╗')
  console.log('║   Forge — Phase 0 Infrastructure Check  ║')
  console.log('╚══════════════════════════════════════════╝')
  console.log(`\nNode: ${process.version}`)
  console.log(`ANTHROPIC_API_KEY: ${process.env.ANTHROPIC_API_KEY ? '✓ set' : '✗ not set'}`)
  console.log(`E2B_API_KEY:       ${process.env.E2B_API_KEY ? '✓ set' : '✗ not set'}`)
  console.log(`VERIFY_FULL:       ${process.env.VERIFY_FULL ? '✓ set' : '✗ not set (D skipped)'}`)

  await checkTemplates()
  await checkAISDK()
  await checkE2BSandbox()
  await checkE2BNextjs()

  // ── Summary ──────────────────────────────────────────────────
  console.log('\n╔══════════════════════════════════════════╗')
  console.log('║   Results                                ║')
  console.log('╠══════════════════════════════════════════╣')

  const passed = results.filter(r => r.status === 'PASS').length
  const failed = results.filter(r => r.status === 'FAIL').length
  const skipped = results.filter(r => r.status === 'SKIP').length

  console.log(`║  PASS: ${String(passed).padEnd(3)} FAIL: ${String(failed).padEnd(3)} SKIP: ${String(skipped).padEnd(3)}              ║`)
  console.log('╚══════════════════════════════════════════╝')

  if (failed > 0) {
    console.log('\nFailed checks:')
    results.filter(r => r.status === 'FAIL').forEach(r => {
      console.error(`  ✗ ${r.name}: ${r.detail}`)
    })
    process.exit(1)
  } else {
    console.log('\n✓ Phase 0 complete — all required checks passed')
    if (skipped > 0) {
      console.log(`  (${skipped} check(s) skipped — set API keys to run them)`)
    }
  }
}

main().catch(err => {
  console.error('\n[FATAL]', err)
  process.exit(1)
})
