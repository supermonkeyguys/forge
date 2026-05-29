import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./vitest.setup.ts'],
    alias: {
      '@forge/core': resolve(__dirname, '../../packages/core'),
      '@forge/ui': resolve(__dirname, '../../packages/ui'),
    },
  },
})
