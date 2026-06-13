import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test/setup.ts'],
    alias: {
      '@': resolve(__dirname, './src'),
      '@forge/core': resolve(__dirname, '../../packages/core'),
      '@forge/ui': resolve(__dirname, '../../packages/ui'),
    },
  },
})
