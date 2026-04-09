// Notification store boundary for Studio 2.0.
//
// This store will own transient notices and action prompts without becoming a
// second source of truth for canonical entities.

const INTENDED_UPSTREAM_CALLERS = [
  'frontend/src/app/providers/index.tsx',
  'frontend/src/features/settings/voice-modules/routes/VoiceModulesRoute.tsx',
];
const INTENDED_DOWNSTREAM_DEPENDENCIES: string[] = [];
const FORBIDDEN_DIRECT_IMPORTS = [
  'frontend/src/api/queries',
  'frontend/src/features',
];

export interface NotificationsStore {
  enqueue: (message: string) => void;
  clear: () => void;
}

export const createNotificationsStore = (): NotificationsStore => ({
  enqueue: (_message) => {
    consumeContractMarkers([
      INTENDED_UPSTREAM_CALLERS,
      INTENDED_DOWNSTREAM_DEPENDENCIES,
      FORBIDDEN_DIRECT_IMPORTS,
    ]);
    throw new Error('Studio 2.0 notifications store is not implemented yet.');
  },
  clear: () => {
    throw new Error('Studio 2.0 notifications store is not implemented yet.');
  },
});

const consumeContractMarkers = (..._values: readonly unknown[]) => undefined;
