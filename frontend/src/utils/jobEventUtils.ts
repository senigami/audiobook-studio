/**
 * Shared helpers for job event processing used by useJobs and useQueueSync.
 */

/** Statuses that warrant clearing in-progress runtime fields. */
export const TERMINAL_LIFECYCLE_STATUSES = [
  'queued',
  'preparing',
  'finalizing',
  'done',
  'failed',
  'cancelled',
] as const;

export type TerminalLifecycleStatus = (typeof TERMINAL_LIFECYCLE_STATUSES)[number];

/**
 * Nulls out ETA and active-segment/render-batch fields on a mutable updates
 * object when the incoming status is a terminal-ish lifecycle status.
 *
 * This is the canonical implementation shared by useJobs (jobs.lifecycle branch)
 * and useQueueSync (jobs.lifecycle branch inside applyEvent). Both callers
 * evaluate their own STATUS_PRIORITY / gating logic before calling this helper;
 * the helper is responsible only for the field-nulling itself.
 *
 * @param updates  Mutable updates object that will be sent to the job store.
 * @param status   The incoming status string (may be undefined/empty).
 */
export const applyTerminalLifecycleReset = (
  updates: Record<string, any>,
  status: string | undefined | null
): void => {
  if (!status || !(TERMINAL_LIFECYCLE_STATUSES as readonly string[]).includes(status)) {
    return;
  }
  updates.eta_seconds = null;
  updates.eta_basis = null;
  updates.estimated_end_at = null;
  updates.active_segment_id = null;
  updates.active_segment_progress = 0;
  updates.active_segment_eta_seconds = null;
  updates.active_segment_eta_basis = null;
  updates.active_segment_updated_at = null;
  updates.active_render_batch_id = null;
  updates.active_render_batch_progress = null;
};
