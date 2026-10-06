import { defineConfig } from 'vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react-swc'
import path from 'path'
import fs from 'node:fs'

// The public demo ships only the images the tour uses (demo-public-allowlist.json),
// not all of frontend/public. A missing file fails the build.
const demoPublicFiles: string[] = JSON.parse(
  fs.readFileSync(path.resolve(__dirname, 'demo-public-allowlist.json'), 'utf8'),
)
const demoPublicAllowlist = (): Plugin => ({
  name: 'demo-public-allowlist',
  apply: 'build',
  generateBundle() {
    for (const rel of demoPublicFiles) {
      this.emitFile({
        type: 'asset',
        fileName: rel,
        source: fs.readFileSync(path.resolve(__dirname, 'public', rel)),
      })
    }
  },
})

// Demo build, outputs to docs/demo/ for GitHub Pages.
// Served under https://senigami.github.io/audiobook-studio/demo/
//
// Default mode is tour-only (the public demo): the other stages, the scenes and the
// styleguide are aliased out of the bundle. `--mode full` keeps the internal showcase.
export default defineConfig(({ command, mode }) => {
  const tourOnly = mode !== 'full'
  return {
    plugins: [react(), ...(command === 'build' && tourOnly ? [demoPublicAllowlist()] : [])],
    define: {
      'import.meta.env.VITE_DEMO_TOUR_ONLY': JSON.stringify(tourOnly ? 'true' : 'false'),
    },
    resolve: {
      // Order matters: the specific seam alias must come before the '@' prefix alias.
      alias: [
        ...(tourOnly
          ? [{ find: '@/demo/demoExtras', replacement: path.resolve(__dirname, 'src/demo/demoExtras.tour.ts') }]
          : []),
        { find: '@', replacement: path.resolve(__dirname, './src') },
      ],
    },
    root: path.resolve(__dirname, 'src/demo'),
    // Dev and the full showcase build still use all of frontend/public. The tour-only build copies only the allowlist (plugin above).
    publicDir: command === 'build' && tourOnly ? false : path.resolve(__dirname, 'public'),
    // Relative base: the compiled demo works served from ANY path, GitHub Pages
    // (/audiobook-studio/demo/), the local audiobook server (/demo), or opened
    // directly, without rebuilding. Safe because the demo uses hash routing,
    // so the document path never shifts and relative asset URLs always resolve.
    base: './',
    build: {
      outDir: path.resolve(__dirname, '../docs/demo'),
      emptyOutDir: true,
    },
  }
})
