// App provider boundary for Studio 2.0.
//
// This module will eventually compose query, socket, theme, and notification
// providers without letting feature code wire global providers ad hoc.

import { createApiClient } from '../../api/client';
import { createHydrationCoordinator } from '../../api/hydration';
import { createNotificationsStore } from '../../store/notifications';

export const createStudioProviders = () => {
  _ = [createApiClient, createHydrationCoordinator, createNotificationsStore];
  return null;
};

const _ = (_value: unknown) => _value;
