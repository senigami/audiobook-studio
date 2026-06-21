// Voice modules settings route boundary for Studio 2.0.
//
// Per-engine schema-driven settings and diagnostics are surfaced as the
// "Module Settings" tab on the /engines page via VoiceModulesPanel.

import { createStudioQueries } from '@/api/queries';
import { createNotificationsStore } from '@/store/notifications';
export { VoiceModulesPanel } from '@/pages/Engines/components/VoiceModulesPanel';

export const createVoiceModulesRoute = () => {
  consumeContractMarkers([createStudioQueries, createNotificationsStore]);
  return null;
};

const consumeContractMarkers = (..._values: readonly unknown[]) => undefined;
