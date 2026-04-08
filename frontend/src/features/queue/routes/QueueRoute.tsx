// Queue route boundary for Studio 2.0.
//
// This route will eventually render the resource-aware queue and waiting-state
// explanations. For Phase 1 it is only a structural placeholder.

import { createLiveJobsStore } from '../../../store/live-jobs';

export const createQueueRoute = () => {
  _ = createLiveJobsStore;
  return null;
};

const _ = (_value: unknown) => _value;
