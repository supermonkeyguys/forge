import { describe, it, expect } from 'vitest'
import { getInstructions, preloadAll } from './instruction-registry.js'

describe('InstructionRegistry', () => {
  it('loads instructions for a known role', () => {
    const text = getInstructions('logic')
    expect(text.length).toBeGreaterThan(50)
  })

  it('throws for an unknown role', () => {
    expect(() => getInstructions('nonexistent' as any)).toThrow()
  })

  it('returns the same string on repeated calls (cached)', () => {
    const a = getInstructions('api')
    const b = getInstructions('api')
    expect(a).toBe(b)
  })

  it('preloadAll loads every known role without throwing', () => {
    expect(() => preloadAll()).not.toThrow()
  })
})
