import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // 强制 node 环境 — core 层不能依赖 DOM
    // 如果某个测试文件需要 DOM，说明代码写错层了
    environment: 'node',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 80,
        functions: 80,
        branches: 70,
      },
    },
  },
})
