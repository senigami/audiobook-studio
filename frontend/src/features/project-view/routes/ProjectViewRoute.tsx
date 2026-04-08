// Project view route boundary for Studio 2.0.
//
// This route will eventually compose project metadata, chapter lists, assembly
// status, and export entry points around canonical project data.

import { createHydrationCoordinator } from '../../../api/hydration';
import { createStudioQueries } from '../../../api/queries';
import { createLiveJobsStore } from '../../../store/live-jobs';

const INTENDED_UPSTREAM_CALLERS = ['frontend/src/app/routes/index.tsx'];
const INTENDED_DOWNSTREAM_DEPENDENCIES = [
  'frontend/src/api/hydration/index.ts',
  'frontend/src/api/queries/index.ts',
  'frontend/src/store/live-jobs.ts',
];
const FORBIDDEN_DIRECT_IMPORTS = [
  'frontend/src/store/editor-session.ts',
  'frontend/src/components/ProjectView.tsx',
];

export const createProjectViewRoute = () => {
  _ = [
    INTENDED_UPSTREAM_CALLERS,
    INTENDED_DOWNSTREAM_DEPENDENCIES,
    FORBIDDEN_DIRECT_IMPORTS,
    createHydrationCoordinator,
    createStudioQueries,
    createLiveJobsStore,
  ];
  return null;
};

const _ = (_value: unknown) => _value;
