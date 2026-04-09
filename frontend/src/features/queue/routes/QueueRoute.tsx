// Queue route boundary for Studio 2.0.
//
// This route will eventually render the resource-aware queue and waiting-state
// explanations. For Phase 1 it is only a structural placeholder.

import { createHydrationCoordinator } from '../../../api/hydration';
import { createLiveJobsStore } from '../../../store/live-jobs';

const INTENDED_UPSTREAM_CALLERS = ['frontend/src/app/routes/index.tsx'];
const INTENDED_DOWNSTREAM_DEPENDENCIES = [
  'frontend/src/api/hydration/index.ts',
  'frontend/src/store/live-jobs.ts',
];
const FORBIDDEN_DIRECT_IMPORTS = [
  'frontend/src/store/editor-session.ts',
  'frontend/src/components/GlobalQueue.tsx',
];

export const createQueueRoute = () => {
  // Intended future flow:
  // - support both full-page queue inspection and companion-surface usage
  // - explain waiting reasons clearly without forcing users out of current work
  consumeContractMarkers([
    INTENDED_UPSTREAM_CALLERS,
    INTENDED_DOWNSTREAM_DEPENDENCIES,
    FORBIDDEN_DIRECT_IMPORTS,
    createHydrationCoordinator,
    createLiveJobsStore,
  ]);
  return null;
};

const consumeContractMarkers = (..._values: readonly unknown[]) => undefined;
