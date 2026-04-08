// Project view route boundary for Studio 2.0.
//
// This route will eventually compose project metadata, chapter lists, assembly
// status, and export entry points around canonical project data.

import { createHydrationCoordinator } from '../../../api/hydration';
import { createStudioQueries } from '../../../api/queries';
import { createLiveJobsStore } from '../../../store/live-jobs';

export const createProjectViewRoute = () => {
  _ = [createHydrationCoordinator, createStudioQueries, createLiveJobsStore];
  return null;
};

const _ = (_value: unknown) => _value;
