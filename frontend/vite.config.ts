/// <reference types="vitest" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'

const backendTarget = process.env.VITE_BACKEND_URL || 'http://127.0.0.1:8123'
const backendWsTarget = process.env.VITE_BACKEND_WS_URL || backendTarget.replace(/^http/, 'ws')
const frontendPort = Number(process.env.VITE_FRONTEND_PORT || 5173)

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
      '@tests': path.resolve(__dirname, './tests'),
    },
  },
  server: {
    host: '127.0.0.1',
    port: frontendPort,
    proxy: {
      '/api': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/ws': {
        target: backendWsTarget,
        ws: true,
        changeOrigin: true,
      },
      '/out': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/projects': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/queue/clear': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/queue/pause': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/queue/resume': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/queue/start_xtts': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/queue/backfill': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/upload': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/settings': {
        target: backendTarget,
        changeOrigin: true,
        bypass: (req) => {
          if (req.method === 'GET' && req.headers.accept?.includes('text/html')) {
            return req.url;
          }
        }
      },
      '/split': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/create_audiobook': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/cancel': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/analyze_long': {
        target: backendTarget,
        changeOrigin: true,
      },
      '/report': {
        target: backendTarget,
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
        'tests/e2e/**',
        '**/*.d.ts',
        'vite.config.ts'
      ]
    }
  }
})
