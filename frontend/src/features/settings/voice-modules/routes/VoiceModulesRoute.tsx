// Voice modules settings route boundary for Studio 2.0.
//
// This route will eventually manage installed modules, engine health, schema-
// guided settings, and module-level diagnostics.

import { createStudioQueries } from '../../../../api/queries';
import { createNotificationsStore } from '../../../../store/notifications';

export const createVoiceModulesRoute = () => {
  consumeContractMarkers([createStudioQueries, createNotificationsStore]);
  return null;
};

const consumeContractMarkers = (..._values: readonly unknown[]) => undefined;
