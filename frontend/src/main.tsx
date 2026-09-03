import '@fontsource-variable/inter';
import '@fontsource-variable/geist';
import '@fontsource/geist-mono/400.css';
import '@fontsource/geist-mono/500.css';
import '@fontsource/source-serif-4/400.css';
import '@fontsource/source-serif-4/700.css';
import '@fontsource-variable/lexend';
import '@fontsource/atkinson-hyperlegible/400.css';
import '@fontsource/atkinson-hyperlegible/700.css';
import '@fontsource/space-grotesk/400.css';
import '@fontsource/space-grotesk/600.css';
import '@fontsource/space-grotesk/700.css';
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import '@/theme/index.css'
import App from '@/app/App.tsx'
import { applyTheme, loadThemePref } from '@/utils/theme'

// Apply persisted theme before first render to avoid flash-of-wrong-theme.
applyTheme(loadThemePref());

// React to OS-level preference changes when preference is 'system'.
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
  const pref = loadThemePref();
  if (pref === 'system') applyTheme('system');
});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </StrictMode>,
)
