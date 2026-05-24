import { defineConfig } from 'vitest/config'
import { resolve } from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    alias: {
      '@forge/core': resolve(__dirname, '../../packages/core'),
      '@forge/ui': resolve(__dirname, '../../packages/ui'),
    },
  },
})
