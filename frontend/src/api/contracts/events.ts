// Event contract definitions for Studio 2.0.
//
// These types normalize websocket progress events so the frontend can merge
// live overlays with canonical entity data safely.

export type StudioJobStatus =
  | 'queued'
  | 'preparing'
  | 'running'
  | 'finalizing'
  | 'done'
  | 'failed'
  | 'cancelled';

export type StudioJobEventScope =
  | 'job'
  | 'queue'
  | 'chapter'
  | 'segment'
  | 'export'
  | 'voice_test'
  | 'voice_build';
export type StudioJobClassification = 'job' | 'chapter' | 'segment';

export type StudioEtaConfidence = 'estimating' | 'stable' | 'recomputing';
export type StudioEtaBasis = 'remaining_from_update' | 'total_from_start';
export type TtsLogLineMarker = 'START_SYNTHESIS' | 'START_SEGMENT' | 'PROGRESS' | 'SEGMENT_SAVED' | 'raw';

export interface StudioJobEvent {
  type: 'studio_job_event';
  source?: string | null;
  classification?: StudioJobClassification | null;
  job_id: string;
  parent_job_id?: string | null;
  scope: StudioJobEventScope;
  status: StudioJobStatus;
  progress?: number | null;
  eta_seconds?: number | null;
  estimated_end_at?: number | null;
  eta_basis?: StudioEtaBasis;
  eta_confidence?: StudioEtaConfidence;
  eta_updated_at?: number | null;
  etaUpdatedAt?: number | null;
  confidence?: number | null;
  message?: string | null;
  reason_code?: string | null;
  updated_at?: number | null;
  started_at?: number | null;
  active_render_batch_id?: string | null;
  active_render_batch_progress?: number | null;
  active_segment_id?: string | null;
  active_segment_progress?: number | null;
  active_segments_map?: Record<string, {
    phase: 'preparing' | 'rendering' | 'done';
    progress: number;
    eta_seconds: number | null;
    reason_code?: string;
    indeterminate?: boolean;
  }> | null;
  render_group_count?: number | null;
  completed_render_groups?: number | null;
  active_render_group_index?: number | null;
  total_render_weight?: number | null;
  completed_render_weight?: number | null;
  active_render_group_weight?: number | null;
  grouped_progress?: number | null;
  engine?: string | null;
  custom_title?: string | null;
  completed_at?: number | null;
  finished_at?: number | null;
  audio_length_seconds?: number | null;
  produced_audio_length?: number | null;
  produced_chars?: number | null;
  produced_segment_count?: number | null;
  indeterminate?: boolean | null;
  loadingElapsedSeconds?: number | null;
}

export const isStudioJobEvent = (value: unknown): value is StudioJobEvent => {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<StudioJobEvent>;
  return event.type === 'studio_job_event' && typeof event.job_id === 'string' && typeof event.status === 'string';
};

export interface TtsLogLineEvent {
  type: 'tts_log_line';
  source?: string | null;
  job_id: string;
  project_id?: string | null;
  chapter_id?: string | null;
  line: string;
  marker: TtsLogLineMarker;
  sequence: number;
  received_at: number;
}

export const isTtsLogLineEvent = (value: unknown): value is TtsLogLineEvent => {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<TtsLogLineEvent>;
  return event.type === 'tts_log_line' && typeof event.job_id === 'string' && typeof event.line === 'string';
};

export interface JobsSnapshotRequest {
  type: 'jobs_snapshot_request';
}

export interface JobsSnapshot {
  type: 'jobs_snapshot';
  jobs: any[];
}
