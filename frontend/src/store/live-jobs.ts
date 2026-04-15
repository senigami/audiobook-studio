import type { StudioJobEvent, StudioJobStatus } from '../api/contracts/events';

export interface OverlayDelta {
  status?: StudioJobStatus;
  progress?: number;
  eta_seconds?: number | null;
  started_at?: number | null;
  updated_at?: number | null;
  active_render_batch_id?: string | null;
  active_render_batch_progress?: number | null;
  reason_code?: string | null;
  message?: string | null;
}

export interface LiveOverlayState {
  eventsById: Record<string, OverlayDelta>;
}

const STATUS_PRIORITY: Record<string, number> = {
  cancelled: 5,
  failed: 5,
  done: 5,
  finalizing: 4,
  running: 3,
  preparing: 2,
  queued: 1,
};

export interface LiveJobsStore {
  getState: () => LiveOverlayState;
  applyEvent: (event: StudioJobEvent) => void;
  pruneOlderThan: (timestamp: number) => void;
  clear: () => void;
}

export const createLiveJobsStore = (): LiveJobsStore => {
  const state: LiveOverlayState = {
    eventsById: {},
  };

  const isRollbackStatus = (status: StudioJobStatus | undefined) => {
    return status === 'queued' || status === 'preparing';
  };

  const applyEvent = (event: StudioJobEvent) => {
    const jobId = event.job_id;
    const existing = state.eventsById[jobId];

    // 1. Stale event rejection
    if (
      existing &&
      typeof existing.updated_at === 'number' &&
      typeof event.updated_at === 'number' &&
      event.updated_at < existing.updated_at
    ) {
      return;
    }

    const nextDelta: OverlayDelta = { ...existing };

    // 2. Status precedence
    const incomingStatus = event.status;
    const existingStatus = existing?.status;
    let effectiveStatus = incomingStatus;

    if (existingStatus) {
      const incomingPri = STATUS_PRIORITY[incomingStatus] ?? 0;
      const existingPri = STATUS_PRIORITY[existingStatus] ?? 0;
      if (incomingPri < existingPri) {
        effectiveStatus = existingStatus;
      } else {
        nextDelta.status = incomingStatus;
      }
    } else {
      nextDelta.status = incomingStatus;
    }

    // 3. Monotonic progress
    const incomingProgress = event.progress;
    const existingProgress = existing?.progress;
    if (typeof incomingProgress === 'number') {
      if (!isRollbackStatus(effectiveStatus)) {
        if (typeof existingProgress !== 'number' || incomingProgress >= existingProgress) {
          nextDelta.progress = incomingProgress;
        }
      } else {
        // In rollback status, we allow progress to move freely (usually resets to 0)
        nextDelta.progress = incomingProgress;
      }
    }

    // 4. ETA stabilization
    const incomingEta = event.eta_seconds;
    const existingEta = existing?.eta_seconds;
    if (typeof incomingEta === 'number') {
      if (
        typeof existingEta !== 'number' ||
        Math.abs(incomingEta - existingEta) >= 1
      ) {
        nextDelta.eta_seconds = incomingEta;
      }
    } else if (incomingEta === null) {
      nextDelta.eta_seconds = null;
    }

    // 5. started_at stabilization
    if (typeof event.started_at === 'number') {
      if (
        typeof existing?.started_at !== 'number' ||
        ['running', 'finalizing', 'done'].includes(effectiveStatus)
      ) {
        nextDelta.started_at = event.started_at;
      }
    } else if (event.started_at === null) {
      nextDelta.started_at = null;
    }

    // 6. Metadata/passthrough
    if (event.updated_at !== undefined) nextDelta.updated_at = event.updated_at;
    if (event.active_render_batch_id !== undefined) nextDelta.active_render_batch_id = event.active_render_batch_id;
    if (event.active_render_batch_progress !== undefined) nextDelta.active_render_batch_progress = event.active_render_batch_progress;
    if (event.reason_code !== undefined) nextDelta.reason_code = event.reason_code;
    if (event.message !== undefined) nextDelta.message = event.message;

    state.eventsById[jobId] = nextDelta;
  };

  const pruneOlderThan = (timestamp: number) => {
    const nextEvents: Record<string, OverlayDelta> = {};
    Object.entries(state.eventsById).forEach(([id, delta]) => {
      if (typeof delta.updated_at === 'number' && delta.updated_at >= timestamp) {
        nextEvents[id] = delta;
      }
    });
    state.eventsById = nextEvents;
  };

  const clear = () => {
    state.eventsById = {};
  };

  return {
    getState: () => state,
    applyEvent,
    pruneOlderThan,
    clear,
  };
};
