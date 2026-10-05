import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(viteConfig, defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup/vitest.setup.ts',
    // Run test files one at a time. This suite has order-dependent tests that
    // pass alone and fail when run alongside others, and the failures move
    // between runs, so a parallel run reports a different set each time.
    // Serialising makes local and CI identical, which is the only way a green
    // local run means anything. The isolation defects themselves are tracked
    // separately: this stops them producing noise, it does not fix them.
    fileParallelism: false,
    include: ['tests/unit/**/*.test.{ts,tsx}'],
    exclude: [
      'node_modules/**',
      '**/node_modules/**',
      'tests/e2e/**',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 80,
        branches: 60
      }
    }
  },
}))
