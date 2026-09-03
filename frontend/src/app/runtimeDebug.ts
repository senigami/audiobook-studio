import { createElement, lazy } from 'react';
import type { ReactNode } from 'react';

const ProgressBarTestPage = lazy(() => import('@/pages/DevProgressBar/DevProgressBarPage').then(m => ({ default: m.ProgressBarTestPage })));
const LiveOutputPage = lazy(() => import('@/pages/LiveOutput/LiveOutputPage').then(m => ({ default: m.LiveOutputPage })));

export interface DevRouteConfig {
  path: string;
  element: ReactNode;
}

/**
 * Dev-only routes (progress-test harness + live socket-event stream). Gated
 * behind `import.meta.env.DEV` so they are unreachable in a production build
 * — callers spread the result into <Routes> as extra <Route> entries.
 */
export function getDevRoutes(): DevRouteConfig[] {
  if (!import.meta.env.DEV) {
    return [];
  }

  return [
    { path: '/progress-test', element: createElement(ProgressBarTestPage) },
    { path: '/event-stream', element: createElement(LiveOutputPage) },
  ];
}
