/**
 * The job-status sets the UI branches on. Two sets, deliberately different,
 * because they answer different questions (#236).
 *
 * Both sets use the backend `Status` literal (`app/db/models.py`) and nothing
 * else. `'processing'` is not a job status (chapter/segment audio status only).
 * `waiting_for_resources` is a job that is paused behind a resource gate: it
 * counts as active for segment UI but has no live ETA.
 */

/**
 * "Should this job show segment-level UI?" (peek strip, render monitor.)
 * Includes `queued`: a job waiting to start still has a strip worth showing.
 */
export const ACTIVE_STATUSES = new Set(['queued', 'waiting_for_resources', 'preparing', 'running', 'finalizing']);

/**
 * "Is a live ETA meaningful for this job right now?"
 * Excludes `queued` and `waiting_for_resources`, because work that has not started has no live ETA to
 * report. That single difference from ACTIVE_STATUSES is the intended one.
 */
export const HAS_LIVE_ETA_STATUSES = new Set(['preparing', 'running', 'finalizing']);
