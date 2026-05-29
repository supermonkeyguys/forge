import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { hexToHsl } from '../lib/utils'

const THEME_PRESETS = [
  { label: '橙色', hex: '#f97316' },
  { label: '蓝色', hex: '#3b82f6' },
  { label: '绿色', hex: '#10b981' },
  { label: '紫色', hex: '#8b5cf6' },
] as const

export type ThemeColor = (typeof THEME_PRESETS)[number]['hex']

interface SettingsState {
  themeColor: string
  setThemeColor: (hex: string) => void
}

function applyThemeColor(hex: string) {
  const hsl = hexToHsl(hex)
  document.documentElement.style.setProperty('--primary', hsl)
  document.documentElement.style.setProperty('--accent', hsl)
  document.documentElement.style.setProperty('--ring', hsl)
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      themeColor: '#f97316',
      setThemeColor: (hex: string) => {
        applyThemeColor(hex)
        set({ themeColor: hex })
      },
    }),
    {
      name: 'forge-settings',
      partialize: (s) => ({ themeColor: s.themeColor }),
    },
  ),
)

export { THEME_PRESETS, applyThemeColor }
