import { describe, it, expect, beforeEach } from 'vitest'
import { useSettingsStore } from './settings-store'
import { hexToHsl } from '../lib/utils'

describe('settings-store', () => {
  beforeEach(() => {
    useSettingsStore.setState({ themeColor: '#f97316' })
    document.documentElement.style.removeProperty('--primary')
    document.documentElement.style.removeProperty('--accent')
    document.documentElement.style.removeProperty('--ring')
    localStorage.clear()
  })

  it('setThemeColor updates store and CSS variables', () => {
    const { setThemeColor } = useSettingsStore.getState()
    setThemeColor('#3b82f6')

    expect(useSettingsStore.getState().themeColor).toBe('#3b82f6')

    const expected = hexToHsl('#3b82f6')
    expect(document.documentElement.style.getPropertyValue('--primary')).toBe(expected)
    expect(document.documentElement.style.getPropertyValue('--accent')).toBe(expected)
    expect(document.documentElement.style.getPropertyValue('--ring')).toBe(expected)
  })

  it('persists themeColor to localStorage', () => {
    const { setThemeColor } = useSettingsStore.getState()
    setThemeColor('#10b981')
    expect(localStorage.getItem('forge-settings')).toContain('#10b981')
  })
})
