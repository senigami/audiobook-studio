import type { StudioJobEvent, StudioJobStatus } from '../api/contracts/events';

export interface OverlayDelta {
  status?: StudioJobStatus;
  progress?: number;
  eta_seconds?: number | null;
  started_at?: number | null;
  updated_at?: number | null;
  estimated_end_at?: number | null;
  eta_basis?: 'remaining_from_update' | 'total_from_start' | null;
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
      if (isRollbackStatus(incomingStatus)) {
        // Orchestrator explicit retries
        effectiveStatus = incomingStatus;
        nextDelta.status = incomingStatus;
      } else {
        const incomingPri = STATUS_PRIORITY[incomingStatus] ?? 0;
        const existingPri = STATUS_PRIORITY[existingStatus] ?? 0;
        
        // Anti-Regression: If we are in 'finalizing' but get a newer 'running' signal, 
        // we trust the newer signal. Legacy-backed streams can emit finalizing heuristically.
        const isCorrection = existingStatus === 'finalizing' && incomingStatus === 'running';
        
        if (incomingPri < existingPri && !isCorrection) {
          effectiveStatus = existingStatus;
        } else {
          nextDelta.status = incomingStatus;
        }
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

    // 6. Metadata/Basis
    if (typeof event.updated_at === 'number') nextDelta.updated_at = event.updated_at;
    if (typeof event.estimated_end_at === 'number') nextDelta.estimated_end_at = event.estimated_end_at;
    
    // Explicitly default eta_basis to 'remaining_from_update' for StudioJobEvents
    // as per Backend Progress Service documentation, unless specified otherwise.
    nextDelta.eta_basis = event.eta_basis ?? 'remaining_from_update';

    if (event.message) nextDelta.message = event.message;
    if (event.reason_code) nextDelta.reason_code = event.reason_code;
    if (event.active_render_batch_id) nextDelta.active_render_batch_id = event.active_render_batch_id;
    if (typeof event.active_render_batch_progress === 'number') {
      nextDelta.active_render_batch_progress = event.active_render_batch_progress;
    }

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
