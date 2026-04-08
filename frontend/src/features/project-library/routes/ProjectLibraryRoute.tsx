// Project library route boundary for Studio 2.0.
//
// The library will eventually own project discovery, quick resume, filtering,
// and guided create-project entry points.

import { createHydrationCoordinator } from '../../../api/hydration';
import { createStudioQueries } from '../../../api/queries';

const INTENDED_UPSTREAM_CALLERS = ['frontend/src/app/routes/index.tsx'];
const INTENDED_DOWNSTREAM_DEPENDENCIES = [
  'frontend/src/api/hydration/index.ts',
  'frontend/src/api/queries/index.ts',
  'frontend/src/app/navigation/model.ts',
];
const FORBIDDEN_DIRECT_IMPORTS = [
  'frontend/src/store/live-jobs.ts',
  'frontend/src/components/ProjectLibrary.tsx',
];

export const createProjectLibraryRoute = () => {
  // Intended future flow:
  // - present recent work and quick-resume entry points
  // - open projects into the project overview hub
  // - support guided project creation from the library surface
  _ = [
    INTENDED_UPSTREAM_CALLERS,
    INTENDED_DOWNSTREAM_DEPENDENCIES,
    FORBIDDEN_DIRECT_IMPORTS,
    createHydrationCoordinator,
    createStudioQueries,
  ];
  return null;
};

const _ = (_value: unknown) => _value;
