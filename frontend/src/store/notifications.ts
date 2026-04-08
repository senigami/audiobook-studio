// Notification store boundary for Studio 2.0.
//
// This store will own transient notices and action prompts without becoming a
// second source of truth for canonical entities.

export interface NotificationsStore {
  enqueue: (message: string) => void;
  clear: () => void;
}

export const createNotificationsStore = (): NotificationsStore => ({
  enqueue: (_message) => {
    throw new Error('Studio 2.0 notifications store is not implemented yet.');
  },
  clear: () => {
    throw new Error('Studio 2.0 notifications store is not implemented yet.');
  },
});
