/**
 * Loads the Next.js project template files from disk.
 * Returns them as SandboxFile[] ready to be pushed to an E2B sandbox.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { SandboxFile } from './e2b-client.js'

const TEMPLATE_DIR = join(
  fileURLToPath(import.meta.url),
  '../templates/nextjs',
)

const SANDBOX_APP_DIR = '/home/user/app'

function loadDir(dir: string): SandboxFile[] {
  const files: SandboxFile[] = []

  for (const entry of readdirSync(dir)) {
    const fullPath = join(dir, entry)
    const stat = statSync(fullPath)

    if (stat.isDirectory()) {
      files.push(...loadDir(fullPath))
    } else {
      const relativePath = relative(TEMPLATE_DIR, fullPath)
      files.push({
        path: `${SANDBOX_APP_DIR}/${relativePath}`,
        content: readFileSync(fullPath, 'utf8'),
      })
    }
  }

  return files
}

export function loadNextjsTemplate(): SandboxFile[] {
  return loadDir(TEMPLATE_DIR)
}

export { SANDBOX_APP_DIR }
