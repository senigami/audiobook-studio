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
  'frontend/src/app/navigation/project-subnav.ts',
  'frontend/src/app/navigation/breadcrumbs.ts',
];
const FORBIDDEN_DIRECT_IMPORTS = [
  'frontend/src/store/editor-session.ts',
  'frontend/src/components/ProjectView.tsx',
];

export const createProjectViewRoute = () => {
  // Intended future flow:
  // - act as the project operations hub
  // - keep project-local navigation visible while switching surfaces
  // - expose chapter readiness, queue state, export readiness, and recovery entry points
  consumeContractMarkers([
    INTENDED_UPSTREAM_CALLERS,
    INTENDED_DOWNSTREAM_DEPENDENCIES,
    FORBIDDEN_DIRECT_IMPORTS,
    createHydrationCoordinator,
    createStudioQueries,
    createLiveJobsStore,
  ]);
  return null;
};

const consumeContractMarkers = (..._values: readonly unknown[]) => undefined;
