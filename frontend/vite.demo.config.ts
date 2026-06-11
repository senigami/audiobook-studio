import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'

// Demo build — outputs to docs/demo/ for GitHub Pages.
// Served under https://senigami.github.io/audiobook-studio/demo/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  root: path.resolve(__dirname, 'src/demo'),
  base: '/audiobook-studio/demo/',
  build: {
    outDir: path.resolve(__dirname, '../docs/demo'),
    emptyOutDir: true,
  },
})
