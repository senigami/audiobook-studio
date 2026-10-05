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
  // Serve the app's real static assets (logo.png, etc.) so the demo can use the
  // actual brand logo; copied into docs/demo on build. Without this, the demo's
  // publicDir defaults to src/demo/public and logo.png 404s.
  publicDir: path.resolve(__dirname, 'public'),
  // Relative base: the compiled demo works served from ANY path — GitHub Pages
  // (/audiobook-studio/demo/), the local audiobook server (/demo), or opened
  // directly — without rebuilding. Safe because the demo uses hash routing,
  // so the document path never shifts and relative asset URLs always resolve.
  base: './',
  build: {
    outDir: path.resolve(__dirname, '../docs/demo'),
    emptyOutDir: true,
  },
})
