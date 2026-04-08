// Event contract definitions for Studio 2.0.
//
// These types will normalize WebSocket and progress events so the frontend can
// merge live overlays with canonical entity data safely.

export type StudioJobStatus =
  | 'queued'
  | 'preparing'
  | 'waiting_for_resources'
  | 'running'
  | 'finalizing'
  | 'completed'
  | 'failed'
  | 'cancelled';

export interface StudioJobEvent {
  jobId: string;
  status: StudioJobStatus;
  progress?: number;
  etaSeconds?: number;
  message?: string;
}

export const isStudioJobEvent = (value: unknown): value is StudioJobEvent => {
  if (!value || typeof value !== 'object') return false;
  return 'jobId' in value && 'status' in value;
};
