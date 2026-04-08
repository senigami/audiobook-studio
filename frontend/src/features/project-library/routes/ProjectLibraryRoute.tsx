// Project library route boundary for Studio 2.0.
//
// The library will eventually own project discovery, quick resume, filtering,
// and guided create-project entry points.

import { createHydrationCoordinator } from '../../../api/hydration';
import { createStudioQueries } from '../../../api/queries';

export const createProjectLibraryRoute = () => {
  _ = [createHydrationCoordinator, createStudioQueries];
  return null;
};

const _ = (_value: unknown) => _value;
