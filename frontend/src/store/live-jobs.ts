import type { StudioJobEvent, StudioJobStatus } from '@/api/contracts/events';
import { isSegmentScopedJob } from '@/utils/jobSelection';


export interface OverlayDelta {
  project_id?: string | null;
  chapter_id?: string | null;
  engine?: string | null;
  custom_title?: string | null;
  chapter_file?: string | null;
  parent_job_id?: string | null;
  segment_ids?: string[] | null;
  classification?: 'job' | 'chapter' | 'segment' | null;
  created_at?: number | null;
  completed_at?: number | null;
  finished_at?: number | null;
  status?: StudioJobStatus;
  progress?: number;
  eta_seconds?: number | null;
  started_at?: number | null;
  updated_at?: number | null;
  estimated_end_at?: number | null;
  eta_updated_at?: number | null;
  confidence?: number | null;
  eta_basis?: 'remaining_from_update' | 'total_from_start' | null;
  active_render_batch_id?: string | null;
  active_render_batch_progress?: number | null;
  active_segment_id?: string | null;
  active_segment_progress?: number | null;
  render_group_count?: number | null;
  completed_render_groups?: number | null;
  active_render_group_index?: number | null;
  total_render_weight?: number | null;
  completed_render_weight?: number | null;
  active_render_group_weight?: number | null;
  grouped_progress?: number | null;
  reason_code?: string | null;
  message?: string | null;
  error?: string | null;
  audio_length_seconds?: number | null;
  produced_audio_length?: number | null;
  produced_chars?: number | null;
  produced_segment_count?: number | null;
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

    const isTerminal = ['done', 'failed', 'cancelled'].includes(effectiveStatus);

    // 4. ETA stabilization
    const incomingEta = event.eta_seconds;
    const existingEta = existing?.eta_seconds;
    const incomingEtaUpdatedAt = event.eta_updated_at ?? event.etaUpdatedAt;
    let shouldAdvanceUpdatedAt = true;

    if (isTerminal) {
      nextDelta.eta_seconds = null;
      nextDelta.eta_updated_at = null;
      nextDelta.estimated_end_at = null;
      nextDelta.eta_basis = null;
    } else if (typeof incomingEta === 'number') {
      if (
        typeof existingEta !== 'number' ||
        Math.abs(incomingEta - existingEta) >= 1
      ) {
        nextDelta.eta_seconds = incomingEta;
        nextDelta.eta_updated_at = incomingEtaUpdatedAt ?? event.updated_at ?? Date.now() / 1000;
      } else {
        shouldAdvanceUpdatedAt = false;
      }
    } else if (incomingEta === null) {
      const isRollback = isRollbackStatus(incomingStatus);
      if (isRollback || typeof existingEta !== 'number') {
        nextDelta.eta_seconds = null;
        nextDelta.eta_updated_at = null;
      } else {
        shouldAdvanceUpdatedAt = false;
      }
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
      if (typeof existing?.started_at !== 'number') {
        nextDelta.started_at = null;
      }
    }

    if (typeof event.parent_job_id === 'string') {
      nextDelta.parent_job_id = event.parent_job_id;
    } else if (event.parent_job_id === null) {
      nextDelta.parent_job_id = null;
    }
    if (typeof event.engine === 'string') {
      nextDelta.engine = event.engine;
    } else if (event.engine === null) {
      nextDelta.engine = null;
    }
    if (typeof event.custom_title === 'string') {
      nextDelta.custom_title = event.custom_title;
    } else if (event.custom_title === null) {
      nextDelta.custom_title = null;
    }
    if (typeof event.completed_at === 'number') {
      nextDelta.completed_at = event.completed_at;
    } else if (event.completed_at === null) {
      nextDelta.completed_at = null;
    }
    if (typeof event.finished_at === 'number') {
      nextDelta.finished_at = event.finished_at;
    } else if (event.finished_at === null) {
      nextDelta.finished_at = null;
    }

    if (typeof event.classification === 'string') {
      nextDelta.classification = event.classification;
    } else if (event.scope === 'segment') {
      nextDelta.classification = 'segment';
    } else if (event.scope === 'chapter') {
      nextDelta.classification = 'chapter';
    }

    // 6. Metadata/Basis
    if (shouldAdvanceUpdatedAt && typeof event.updated_at === 'number') nextDelta.updated_at = event.updated_at;
    if (isTerminal) {
      nextDelta.estimated_end_at = null;
      nextDelta.eta_basis = null;
      nextDelta.confidence = null;
    } else {
      if (typeof event.estimated_end_at === 'number') nextDelta.estimated_end_at = event.estimated_end_at;
      if (typeof event.confidence === 'number') {
        nextDelta.confidence = event.confidence;
      } else if (existing?.confidence !== undefined) {
        nextDelta.confidence = existing.confidence;
      }
      // Explicitly default eta_basis to 'remaining_from_update' for StudioJobEvents
      // as per Backend Progress Service documentation, unless specified otherwise.
      nextDelta.eta_basis = event.eta_basis ?? 'remaining_from_update';
    }

    if (event.message) nextDelta.message = event.message;
    if (event.message) nextDelta.error = event.message;
    if (event.reason_code) nextDelta.reason_code = event.reason_code;
    if (event.active_render_batch_id !== undefined) {
      nextDelta.active_render_batch_id = event.active_render_batch_id;
    }
    if (event.active_render_batch_progress !== undefined) {
      nextDelta.active_render_batch_progress = event.active_render_batch_progress;
    }
    if (event.scope === 'segment') {
      if (event.active_segment_id !== undefined) {
        nextDelta.active_segment_id = event.active_segment_id;
      }
      if (event.active_segment_progress !== undefined) {
        nextDelta.active_segment_progress = event.active_segment_progress;
      }
    }
    if (event.render_group_count !== undefined) {
      nextDelta.render_group_count = event.render_group_count;
    }
    if (event.completed_render_groups !== undefined) {
      nextDelta.completed_render_groups = event.completed_render_groups;
    }
    if (event.active_render_group_index !== undefined) {
      nextDelta.active_render_group_index = event.active_render_group_index;
    }
    if (event.total_render_weight !== undefined) {
      nextDelta.total_render_weight = event.total_render_weight;
    }
    if (event.completed_render_weight !== undefined) {
      nextDelta.completed_render_weight = event.completed_render_weight;
    }
    if (event.active_render_group_weight !== undefined) {
      nextDelta.active_render_group_weight = event.active_render_group_weight;
    }
    if (event.grouped_progress !== undefined) {
      nextDelta.grouped_progress = event.grouped_progress;
    }
    if (event.audio_length_seconds !== undefined) {
      nextDelta.audio_length_seconds = event.audio_length_seconds;
    }
    if (event.produced_audio_length !== undefined) {
      nextDelta.produced_audio_length = event.produced_audio_length;
    }
    if (event.produced_chars !== undefined) {
      nextDelta.produced_chars = event.produced_chars;
    }
    if (event.produced_segment_count !== undefined) {
      nextDelta.produced_segment_count = event.produced_segment_count;
    }

    state.eventsById[jobId] = nextDelta;

    if (nextDelta.chapter_id && !isSegmentScopedJob({
      segment_ids: nextDelta.segment_ids ?? undefined,
      custom_title: nextDelta.custom_title,
      classification: nextDelta.classification,
      parent_job_id: nextDelta.parent_job_id,
    })) {
      pruneOlderOverlaysForChapter(jobId, nextDelta.chapter_id, nextDelta.updated_at ?? nextDelta.created_at ?? Date.now() / 1000);
    }
  };

  const pruneOlderOverlaysForChapter = (jobId: string, chapterId: string, timestamp: number) => {
    Object.keys(state.eventsById).forEach(otherJobId => {
      if (otherJobId === jobId) return;
      const other = state.eventsById[otherJobId];
      if (other.chapter_id === chapterId) {
        const isOtherSegment = isSegmentScopedJob({
          segment_ids: other.segment_ids ?? undefined,
          custom_title: other.custom_title,
          classification: other.classification,
          parent_job_id: other.parent_job_id,
        });
        if (!isOtherSegment) {
          const otherTime = other.updated_at ?? other.created_at ?? 0;
          if (otherTime <= timestamp) {
            delete state.eventsById[otherJobId];
          }
        }
      }
    });
  };

  const applyJobUpdated = (jobId: string, updates: any) => {
    // Normalize job_updated into a StudioJobEvent-like shape for applyEvent
    // This allows useQueueSync to benefit from the same merging logic
    const jobUpdated = updates || {};
    const existing = state.eventsById[jobId];
    const status = jobUpdated.status ?? existing?.status ?? 'queued';
    const hasMeaningfulActiveSegmentProgress =
      typeof jobUpdated.active_segment_progress === 'number' &&
      jobUpdated.active_segment_progress > 0 &&
      jobUpdated.active_segment_progress <= 1;
    const scope = jobUpdated.classification ||
                  (((typeof jobUpdated.active_segment_id === 'string' && jobUpdated.active_segment_id.length > 0) ||
                    hasMeaningfulActiveSegmentProgress) ? 'segment' : 'job');
    const event: StudioJobEvent = {
      type: 'studio_job_event',
      job_id: jobId,
      scope: scope as any,
      classification: jobUpdated.classification ?? null,
      parent_job_id: jobUpdated.parent_job_id ?? null,
      status: status,
      progress: typeof jobUpdated.progress === 'number' ? jobUpdated.progress : undefined,
      eta_seconds: typeof jobUpdated.eta_seconds === 'number' ? jobUpdated.eta_seconds : undefined,
      started_at: typeof jobUpdated.started_at === 'number' ? jobUpdated.started_at : undefined,
      updated_at: typeof jobUpdated.updated_at === 'number' ? jobUpdated.updated_at : undefined,
      estimated_end_at: typeof jobUpdated.estimated_end_at === 'number' ? jobUpdated.estimated_end_at : undefined,
      eta_basis: jobUpdated.eta_basis,
      active_render_batch_id: jobUpdated.active_render_batch_id,
      active_render_batch_progress: jobUpdated.active_render_batch_progress,
      active_segment_id: jobUpdated.active_segment_id,
      active_segment_progress: jobUpdated.active_segment_progress,
      render_group_count: jobUpdated.render_group_count,
      completed_render_groups: jobUpdated.completed_render_groups,
      active_render_group_index: jobUpdated.active_render_group_index,
      total_render_weight: jobUpdated.total_render_weight,
      completed_render_weight: jobUpdated.completed_render_weight,
      active_render_group_weight: jobUpdated.active_render_group_weight,
      grouped_progress: jobUpdated.grouped_progress,
      message: jobUpdated.message || jobUpdated.log || jobUpdated.error || undefined,
      reason_code: jobUpdated.reason_code,
      eta_updated_at: typeof jobUpdated.eta_updated_at === 'number' ? jobUpdated.eta_updated_at : (typeof jobUpdated.etaUpdatedAt === 'number' ? jobUpdated.etaUpdatedAt : undefined),
      etaUpdatedAt: typeof jobUpdated.etaUpdatedAt === 'number' ? jobUpdated.etaUpdatedAt : (typeof jobUpdated.eta_updated_at === 'number' ? jobUpdated.eta_updated_at : undefined),
      confidence: typeof jobUpdated.confidence === 'number' ? jobUpdated.confidence : undefined,
    };

    applyEvent(event);

    const savedDelta = state.eventsById[jobId];
    if (savedDelta) {
      if (jobUpdated.project_id !== undefined) savedDelta.project_id = jobUpdated.project_id;
      if (jobUpdated.chapter_id !== undefined) savedDelta.chapter_id = jobUpdated.chapter_id;
      if (jobUpdated.engine !== undefined) savedDelta.engine = jobUpdated.engine;
      if (jobUpdated.custom_title !== undefined) savedDelta.custom_title = jobUpdated.custom_title;
      if (jobUpdated.chapter_file !== undefined) savedDelta.chapter_file = jobUpdated.chapter_file;
      if (jobUpdated.segment_ids !== undefined) savedDelta.segment_ids = jobUpdated.segment_ids;
      if (jobUpdated.created_at !== undefined) savedDelta.created_at = jobUpdated.created_at;
      if (jobUpdated.completed_at !== undefined) savedDelta.completed_at = jobUpdated.completed_at;
      if (jobUpdated.finished_at !== undefined) savedDelta.finished_at = jobUpdated.finished_at;
      if (jobUpdated.audio_length_seconds !== undefined) savedDelta.audio_length_seconds = jobUpdated.audio_length_seconds;
      if (jobUpdated.produced_audio_length !== undefined) savedDelta.produced_audio_length = jobUpdated.produced_audio_length;
      if (jobUpdated.produced_chars !== undefined) savedDelta.produced_chars = jobUpdated.produced_chars;
      if (jobUpdated.produced_segment_count !== undefined) savedDelta.produced_segment_count = jobUpdated.produced_segment_count;
    }
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
