/**
 * QUEUE_OVERLAY_FIELDS — the exhaustive list of fields that non-queue.items topics
 * (chapters.progress, segments.progress, voice.test, jobs.lifecycle) are permitted
 * to update on an *existing* main-queue row.
 *
 * These are live-overlay / telemetry fields only. Row identity, classification,
 * lifecycle status (status), and terminal-retention fields must come from
 * queue.items exclusively.
 *
 * Callers that receive a frame from a non-queue.items topic and want to update a
 * queue row should:
 *   1. Verify the row already exists (snapshot or overlay store) — no-op if absent.
 *   2. Strip the update object to only these keys before applying.
 */
export const QUEUE_OVERLAY_FIELDS = [
  // Progress / ETA
  'progress',
  'eta_seconds',
  'eta_basis',
  'eta_updated_at',
  'estimated_end_at',
  'confidence',
  'updated_at',
  // Render-group / batch telemetry
  'render_group_count',
  'completed_render_groups',
  'active_render_group_index',
  'total_render_weight',
  'completed_render_weight',
  'active_render_group_weight',
  'grouped_progress',
  'active_render_batch_id',
  'active_render_batch_progress',
  // Active segment fields (scoped telemetry)
  'active_segment_id',
  'active_segment_progress',
  'active_segment_eta_seconds',
  'active_segment_eta_basis',
  'active_segment_updated_at',
  // Multi-active segments map (W-PAR 006) — chapter-level per-segment lifecycle
  'active_segments_map',
  // Model-load / indeterminate telemetry
  'indeterminate',
  'loadingElapsedSeconds',
  // Debug / message provenance
  'message',
  'log',
  'reason_code',
  'segmentProgressSocketProvenance',
  'segmentProgressUpdates',
  'source_topic',
] as const;

export type QueueOverlayField = typeof QUEUE_OVERLAY_FIELDS[number];

/**
 * Strip `updates` to only the keys that are permitted as overlays from
 * non-queue.items topics. Returns a new object.
 */
export const pickOverlayFields = (updates: Record<string, any>): Record<string, any> => {
  const result: Record<string, any> = {};
  for (const key of QUEUE_OVERLAY_FIELDS) {
    if (key in updates) {
      result[key] = updates[key];
    }
  }
  return result;
};
