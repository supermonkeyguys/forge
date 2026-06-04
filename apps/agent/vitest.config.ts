import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    testTimeout: 30000,   // full orchestrator pipeline can take up to 10s in mock mode
    hookTimeout: 10000,
  },
})
