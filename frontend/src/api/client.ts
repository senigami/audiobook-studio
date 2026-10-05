// Shared API client boundary for Studio 2.0.
//
// This module will own transport defaults and request composition for the
// feature-first frontend without making features talk directly to fetch details.
//
// NOTE: this module is imported by the main app provider boundary
// (src/app/providers). It must NOT statically import anything under
// src/demo/ — the demo fetch shim must never land in the main bundle.
// createMockApiClient therefore loads the shim via dynamic import.

import type { DemoApiFixtures } from '@/demo/demoApiShim';
import type { api } from '@/api';

export const createApiClient = () => {
  throw new Error('Studio 2.0 API client is not implemented yet.');
};

/**
 * createMockApiClient — installs the demo API shim and returns the live `api`
 * object (which already uses global fetch, so it routes through the shim).
 *
 * Demo-only. Loads the shim and api module lazily so neither is pulled into
 * the main bundle when only createApiClient is used.
 *
 * Usage:
 *   const { client, uninstall } = await createMockApiClient(demoRestFixtures);
 *   // ...
 *   uninstall(); // restore original fetch
 */
export const createMockApiClient = async (
  fixtures: DemoApiFixtures,
): Promise<{ client: typeof api; uninstall: () => void }> => {
  const [{ installDemoApiShim }, apiModule] = await Promise.all([
    import('@/demo/demoApiShim'),
    import('@/api'),
  ]);
  const uninstall = installDemoApiShim(fixtures);
  return { client: apiModule.api, uninstall };
};
