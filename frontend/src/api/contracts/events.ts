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

export type StudioEtaConfidence = 'estimating' | 'stable' | 'recomputing';
export type StudioEtaBasis = 'remaining_from_update' | 'total_from_start';

export interface StudioJobEvent {
  type: 'studio_job_event';
  job_id: string;
  parent_job_id?: string | null;
  scope: StudioJobEventScope;
  status: StudioJobStatus;
  progress?: number | null;
  eta_seconds?: number | null;
  estimated_end_at?: number | null;
  eta_basis?: StudioEtaBasis;
  eta_confidence?: StudioEtaConfidence;
  message?: string | null;
  reason_code?: string | null;
  updated_at?: number | null;
  started_at?: number | null;
  active_render_batch_id?: string | null;
  active_render_batch_progress?: number | null;
}

export const isStudioJobEvent = (value: unknown): value is StudioJobEvent => {
  if (!value || typeof value !== 'object') return false;
  const event = value as Partial<StudioJobEvent>;
  return event.type === 'studio_job_event' && typeof event.job_id === 'string' && typeof event.status === 'string';
};
