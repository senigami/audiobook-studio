// Live job overlay store for Studio 2.0.
//
// This store will own progress overlays, queue waiting reasons, and reconnect
// state. Canonical entity data should remain API-owned.

import type { StudioJobEvent } from '../api/contracts/events';

const INTENDED_UPSTREAM_CALLERS = [
  'frontend/src/features/project-view/routes/ProjectViewRoute.tsx',
  'frontend/src/features/chapter-editor/routes/ChapterEditorRoute.tsx',
  'frontend/src/features/queue/routes/QueueRoute.tsx',
];
const INTENDED_DOWNSTREAM_DEPENDENCIES = [
  'frontend/src/api/contracts/events.ts',
];
const FORBIDDEN_DIRECT_IMPORTS = [
  'frontend/src/api/queries',
  'frontend/src/features',
];

export interface LiveJobsStore {
  byId: Record<string, StudioJobEvent>;
  applyEvent: (event: StudioJobEvent) => void;
  seedFromSnapshot: (events: StudioJobEvent[]) => void;
  clear: () => void;
}

export const createLiveJobsStore = (): LiveJobsStore => ({
  byId: {},
  applyEvent: (_event) => {
    consumeContractMarkers([
      INTENDED_UPSTREAM_CALLERS,
      INTENDED_DOWNSTREAM_DEPENDENCIES,
      FORBIDDEN_DIRECT_IMPORTS,
    ]);
    throw new Error('Studio 2.0 live job store is not implemented yet.');
  },
  seedFromSnapshot: (_events) => {
    throw new Error('Studio 2.0 live job store is not implemented yet.');
  },
  clear: () => {
    throw new Error('Studio 2.0 live job store is not implemented yet.');
  },
});

const consumeContractMarkers = (..._values: readonly unknown[]) => undefined;
