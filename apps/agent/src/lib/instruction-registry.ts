import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const INSTRUCTIONS_DIR = join(__dirname, '../templates/instructions')

const KNOWN_ROLES = ['pm', 'architect', 'logic', 'api', 'ui', 'schema', 'page', 'test'] as const
type InstructionRole = typeof KNOWN_ROLES[number]

const cache = new Map<string, string>()

function load(role: InstructionRole): string {
  const path = join(INSTRUCTIONS_DIR, `${role}.md`)
  let content: string
  try {
    content = readFileSync(path, 'utf-8').trim()
  } catch {
    throw new Error(`instruction-registry: file not found for role "${role}" at ${path}`)
  }
  if (!content) throw new Error(`instruction-registry: empty instructions for role "${role}"`)
  return content
}

export function getInstructions(role: InstructionRole): string {
  if (!KNOWN_ROLES.includes(role)) {
    throw new Error(`instruction-registry: unknown role "${role}". Known: ${KNOWN_ROLES.join(', ')}`)
  }
  if (!cache.has(role)) {
    cache.set(role, load(role))
  }
  return cache.get(role)!
}

export function preloadAll(): void {
  for (const role of KNOWN_ROLES) {
    getInstructions(role)
  }
}
