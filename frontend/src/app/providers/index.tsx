// App provider boundary for Studio 2.0.
//
// This module will eventually compose query, socket, theme, and notification
// providers without letting feature code wire global providers ad hoc.

import { createApiClient } from '../../api/client';
import { createHydrationCoordinator } from '../../api/hydration';
import { createNotificationsStore } from '../../store/notifications';

const INTENDED_UPSTREAM_CALLERS = ['frontend/src/app/routes/index.tsx'];
const INTENDED_DOWNSTREAM_DEPENDENCIES = [
  'frontend/src/api/client.ts',
  'frontend/src/api/hydration/index.ts',
  'frontend/src/store/notifications.ts',
];
const FORBIDDEN_DIRECT_IMPORTS = [
  'frontend/src/features',
  'frontend/src/components',
];

export const createStudioProviders = () => {
  _ = [
    INTENDED_UPSTREAM_CALLERS,
    INTENDED_DOWNSTREAM_DEPENDENCIES,
    FORBIDDEN_DIRECT_IMPORTS,
    createApiClient,
    createHydrationCoordinator,
    createNotificationsStore,
  ];
  return null;
};

const _ = (_value: unknown) => _value;
