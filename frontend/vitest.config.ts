import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(viteConfig, defineConfig({
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: './tests/setup/vitest.setup.ts',
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
