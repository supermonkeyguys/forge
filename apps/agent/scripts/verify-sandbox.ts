/**
 * E2B Sandbox verification script.
 *
 * Tests the full lifecycle:
 *   1. Create sandbox
 *   2. Push Next.js template files
 *   3. npm install
 *   4. next dev (background)
 *   5. Wait for server ready
 *   6. Fetch preview URL → verify HTTP 200
 *   7. Cleanup
 *
 * Run:
 *   E2B_API_KEY=xxx npx tsx scripts/verify-sandbox.ts
 */

import { ForgeSandbox, type RunResult } from '../src/sandbox/e2b-client.js'
import { loadNextjsTemplate, SANDBOX_APP_DIR } from '../src/sandbox/template-loader.js'

const PREVIEW_PORT = 3000
const READY_SIGNAL = 'Ready in'           // Next.js dev server outputs this
const MAX_WAIT_MS  = 90_000               // max time to wait for server ready
const POLL_MS      = 2_000

// ── Helpers ──────────────────────────────────────────────────────

function log(step: string, msg: string) {
  console.log(`\n[${step}] ${msg}`)
}

function pass(msg: string) {
  console.log(`  ✓ ${msg}`)
}

function fail(msg: string): never {
  console.error(`  ✗ ${msg}`)
  process.exit(1)
}

async function waitForReady(
  sandbox: ForgeSandbox,
  port: number,
  maxMs: number,
): Promise<string> {
  const previewUrl = sandbox.getPreviewUrl(port)
  const deadline = Date.now() + maxMs

  while (Date.now() < deadline) {
    try {
      const res = await fetch(previewUrl, { signal: AbortSignal.timeout(3_000) })
      if (res.ok || res.status === 404) {
        // 404 is fine — Next.js is up even if the page returns 404
        return previewUrl
      }
    } catch {
      // not ready yet, keep polling
    }
    await new Promise((r) => setTimeout(r, POLL_MS))
  }

  throw new Error(`Server did not become ready within ${maxMs}ms`)
}

// ── Main ─────────────────────────────────────────────────────────

async function main() {
  console.log('═══════════════════════════════════════')
  console.log('  Forge — E2B Sandbox Verification')
  console.log('═══════════════════════════════════════')

  // Step 1: Create sandbox
  log('1/6', 'Creating E2B sandbox...')
  const sandbox = await ForgeSandbox.create(15 * 60 * 1000)
  pass(`Sandbox created: ${sandbox.id}`)

  try {
    // Step 2: Push template files
    log('2/6', 'Pushing Next.js template files...')
    const files = loadNextjsTemplate()
    await sandbox.writeFiles(files)
    pass(`Pushed ${files.length} files to ${SANDBOX_APP_DIR}`)

    // Verify a key file landed correctly
    const pkg = await sandbox.readFile(`${SANDBOX_APP_DIR}/package.json`)
    const parsed = JSON.parse(pkg) as { name: string }
    if (parsed.name !== 'forge-generated-app') {
      fail(`package.json name mismatch: ${parsed.name}`)
    }
    pass('package.json verified on sandbox')

    // Step 3: npm install
    log('3/6', 'Running npm install...')
    const installStart = Date.now()
    let installResult: RunResult

    installResult = await sandbox.run('npm install --prefer-offline', {
      cwd: SANDBOX_APP_DIR,
      timeoutMs: 3 * 60 * 1000,
      onStdout: (l) => process.stdout.write('.'),
      onStderr: (l) => {
        // npm warns are noisy; only surface errors
        if (l.toLowerCase().includes('error')) process.stderr.write(`\n  npm: ${l}`)
      },
    })
    console.log() // newline after dots

    if (installResult.exitCode !== 0) {
      console.error(installResult.stderr)
      fail(`npm install failed with exit code ${installResult.exitCode}`)
    }
    pass(`npm install completed in ${((Date.now() - installStart) / 1000).toFixed(1)}s`)

    // Step 4: start next dev in background
    log('4/6', 'Starting next dev...')
    const devLogs: string[] = []

    await sandbox.startBackground(`npm run dev`, {
      cwd: SANDBOX_APP_DIR,
      onStdout: (l) => {
        devLogs.push(l)
        if (l.includes(READY_SIGNAL)) {
          process.stdout.write(`\n  next.js: ${l}`)
        }
      },
      onStderr: (l) => devLogs.push(`[err] ${l}`),
    })
    pass('next dev process started')

    // Step 5: wait for HTTP server ready
    log('5/6', `Waiting for server on port ${PREVIEW_PORT}...`)
    const waitStart = Date.now()
    const previewUrl = await waitForReady(sandbox, PREVIEW_PORT, MAX_WAIT_MS)
    pass(`Server ready in ${((Date.now() - waitStart) / 1000).toFixed(1)}s`)

    // Step 6: verify preview URL returns HTTP 200
    log('6/6', `Verifying preview URL: ${previewUrl}`)
    const res = await fetch(previewUrl)
    if (!res.ok) {
      fail(`Preview URL returned HTTP ${res.status}`)
    }
    const html = await res.text()
    if (!html.includes('Forge')) {
      fail(`Preview HTML does not contain expected content`)
    }
    pass(`Preview URL returns HTTP ${res.status}`)
    pass(`HTML contains expected content`)

    // ── Summary ──────────────────────────────────────────────────
    console.log('\n═══════════════════════════════════════')
    console.log('  ✓ ALL CHECKS PASSED')
    console.log('═══════════════════════════════════════')
    console.log(`  Sandbox ID:  ${sandbox.id}`)
    console.log(`  Preview URL: ${previewUrl}`)
    console.log('═══════════════════════════════════════\n')

  } finally {
    log('cleanup', 'Killing sandbox...')
    await sandbox.kill()
    pass('Sandbox killed')
  }
}

main().catch((err) => {
  console.error('\n[FATAL]', err)
  process.exit(1)
})
