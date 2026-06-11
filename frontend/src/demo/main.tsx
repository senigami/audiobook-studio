/**
 * Demo entry point — installs the REST shim then renders DemoApp.
 *
 * Global CSS mirrors frontend/src/main.tsx: theme tokens + base + components.
 */

import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
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
