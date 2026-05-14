import type { StudioJobEvent, StudioJobStatus } from '@/api/contracts/events';

export interface OverlayDelta {
  project_id?: string | null;
  chapter_id?: string | null;
  engine?: string | null;
  custom_title?: string | null;
  chapter_file?: string | null;
  segment_ids?: string[] | null;
  created_at?: number | null;
  completed_at?: number | null;
  status?: StudioJobStatus;
  progress?: number;
  eta_seconds?: number | null;
  started_at?: number | null;
  updated_at?: number | null;
  estimated_end_at?: number | null;
  eta_basis?: 'remaining_from_update' | 'total_from_start' | null;
  active_render_batch_id?: string | null;
  active_render_batch_progress?: number | null;
  active_segment_id?: string | null;
  active_segment_progress?: number | null;
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
  applyJobUpdated: (jobId: string, updates: any) => void;
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

  const applyJobUpdated = (jobId: string, updates: any) => {
    // Normalize job_updated into a StudioJobEvent-like shape for applyEvent
    // This allows useQueueSync to benefit from the same merging logic
    const jobUpdated = updates || {};
    const existing = state.eventsById[jobId];
    state.eventsById[jobId] = {
      ...existing,
      project_id: jobUpdated.project_id ?? existing?.project_id,
      chapter_id: jobUpdated.chapter_id ?? existing?.chapter_id,
      engine: jobUpdated.engine ?? existing?.engine,
      custom_title: jobUpdated.custom_title ?? existing?.custom_title,
      chapter_file: jobUpdated.chapter_file ?? existing?.chapter_file,
      segment_ids: jobUpdated.segment_ids ?? existing?.segment_ids,
      created_at: jobUpdated.created_at ?? existing?.created_at,
      completed_at: jobUpdated.completed_at ?? existing?.completed_at,
      status: jobUpdated.status ?? existing?.status,
      progress: typeof jobUpdated.progress === 'number' ? jobUpdated.progress : existing?.progress,
      eta_seconds: typeof jobUpdated.eta_seconds === 'number' ? jobUpdated.eta_seconds : existing?.eta_seconds,
      started_at: typeof jobUpdated.started_at === 'number' ? jobUpdated.started_at : existing?.started_at,
      updated_at: typeof jobUpdated.updated_at === 'number' ? jobUpdated.updated_at : existing?.updated_at,
      estimated_end_at: typeof jobUpdated.estimated_end_at === 'number' ? jobUpdated.estimated_end_at : existing?.estimated_end_at,
      eta_basis: jobUpdated.eta_basis ?? existing?.eta_basis,
      active_render_batch_id: jobUpdated.active_render_batch_id ?? existing?.active_render_batch_id,
      active_render_batch_progress: typeof jobUpdated.active_render_batch_progress === 'number'
        ? jobUpdated.active_render_batch_progress
        : existing?.active_render_batch_progress,
      active_segment_id: jobUpdated.active_segment_id ?? existing?.active_segment_id,
      active_segment_progress: typeof jobUpdated.active_segment_progress === 'number'
        ? jobUpdated.active_segment_progress
        : existing?.active_segment_progress,
      reason_code: jobUpdated.reason_code ?? existing?.reason_code,
      message: jobUpdated.message ?? jobUpdated.log ?? existing?.message,
    };
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
    applyJobUpdated,
    pruneOlderThan,
    clear,
  };
};
