// Live job overlay store for Studio 2.0.
//
// This store will own progress overlays, queue waiting reasons, and reconnect
// state. Canonical entity data should remain API-owned.

import type { StudioJobEvent } from '../api/contracts/events';

export interface LiveJobsStore {
  byId: Record<string, StudioJobEvent>;
  applyEvent: (event: StudioJobEvent) => void;
  clear: () => void;
}

export const createLiveJobsStore = (): LiveJobsStore => ({
  byId: {},
  applyEvent: (_event) => {
    throw new Error('Studio 2.0 live job store is not implemented yet.');
  },
  clear: () => {
    throw new Error('Studio 2.0 live job store is not implemented yet.');
  },
});
