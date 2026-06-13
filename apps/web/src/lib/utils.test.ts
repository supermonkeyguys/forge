import { describe, it, expect } from 'vitest'
import { cn, hexToHsl } from './utils'

describe('cn utility', () => {
  it('merges class names correctly', () => {
    expect(cn('class1', 'class2')).toBe('class1 class2')
  })

  it('handles conditional classes', () => {
    expect(cn('base', false && 'hidden', true && 'visible')).toBe('base visible')
  })

  it('handles undefined and null', () => {
    expect(cn('base', undefined, null, 'end')).toBe('base end')
  })

  it('merges tailwind classes with precedence', () => {
    expect(cn('p-4', 'p-6')).toBe('p-6')
    expect(cn('text-red-500', 'text-blue-500')).toBe('text-blue-500')
  })
})

describe('hexToHsl utility', () => {
  it('converts pure red to HSL', () => {
    const result = hexToHsl('#ff0000')
    expect(result).toBe('0 100% 50%')
  })

  it('converts pure green to HSL', () => {
    const result = hexToHsl('#00ff00')
    expect(result).toBe('120 100% 50%')
  })

  it('converts pure blue to HSL', () => {
    const result = hexToHsl('#0000ff')
    expect(result).toBe('240 100% 50%')
  })

  it('handles white color', () => {
    const result = hexToHsl('#ffffff')
    expect(result).toBe('0 0% 100%')
  })

  it('handles black color', () => {
    const result = hexToHsl('#000000')
    expect(result).toBe('0 0% 0%')
  })
})
