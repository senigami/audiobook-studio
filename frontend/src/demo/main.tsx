/**
 * Demo entry point — installs the REST shim then renders DemoApp.
 *
 * Global CSS mirrors frontend/src/main.tsx: theme tokens + base + components.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
// Self-hosted fonts — mirrors frontend/src/main.tsx so the demo renders the same
// typefaces (the reader-preferences picker in the Director's Console needs these).
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
import '@/theme/index.css';
import { installDemoApiShim } from './demoApiShim';
import { demoRestFixtures } from './fixtures/restFixtures';
import { DemoApp } from './DemoApp';

installDemoApiShim(demoRestFixtures);

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <DemoApp />
  </StrictMode>,
);
