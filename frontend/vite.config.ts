/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8123',
        changeOrigin: true,
      },
      '/ws': {
        target: 'ws://127.0.0.1:8123',
        ws: true,
        changeOrigin: true,
      },
      '/out': {
        target: 'http://127.0.0.1:8123',
        changeOrigin: true,
      },
      '/projects': {
        target: 'http://127.0.0.1:8123',
        changeOrigin: true,
      },
      '/queue/clear': {
        target: 'http://127.0.0.1:8123',
        changeOrigin: true,
      },
      '/queue/pause': {
        target: 'http://127.0.0.1:8123',
        changeOrigin: true,
      },
      '/queue/resume': {
        target: 'http://127.0.0.1:8123',
        changeOrigin: true,
      },
      '/queue/start_xtts': {
        target: 'http://127.0.0.1:8123',
        changeOrigin: true,
      },
      '/queue/backfill': {
        target: 'http://127.0.0.1:8123',
        changeOrigin: true,
      },
      '/upload': {
        target: 'http://127.0.0.1:8123',
        changeOrigin: true,
      },
      '/settings': {
        target: 'http://127.0.0.1:8123',
        changeOrigin: true,
        bypass: (req) => {
          if (req.method === 'GET' && req.headers.accept?.includes('text/html')) {
            return req.url;
          }
        }
      },
      '/split': {
        target: 'http://127.0.0.1:8123',
        changeOrigin: true,
      },
      '/create_audiobook': {
        target: 'http://127.0.0.1:8123',
        changeOrigin: true,
      },
      '/cancel': {
        target: 'http://127.0.0.1:8123',
        changeOrigin: true,
      },
      '/analyze_long': {
        target: 'http://127.0.0.1:8123',
        changeOrigin: true,
      },
      '/report': {
        target: 'http://127.0.0.1:8123',
        changeOrigin: true,
      }
    }
  },
  test: {
    environment: 'jsdom',
    globals: true,
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      thresholds: {
        lines: 55,
        functions: 35,
        branches: 60,
        statements: 55
      },
      exclude: [
        'node_modules/**',
        'src/test/**',
        '**/*.d.ts',
        '**/*.test.{ts,tsx}',
        'vite.config.ts'
      ]
    }
  }
})
