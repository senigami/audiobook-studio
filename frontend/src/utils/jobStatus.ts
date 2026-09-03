/**
 * The job-status sets the UI branches on. Two sets, deliberately different,
 * because they answer different questions (#236).
 *
 * `'processing'` is deliberately retained in the live-ETA set. It is absent
 * from the backend `Status` literal (`app/db/models.py`) and from the frontend
 * `Status` union, yet 25 tests across 5 files construct jobs with it, so
 * whether it can actually occur is unresolved (#236). Removing it changes
 * behaviour rather than deleting dead code, so it stays until that is settled.
 */

/**
 * "Should this job show segment-level UI?" (peek strip, render monitor.)
 * Includes `queued`: a job waiting to start still has a strip worth showing.
 */
export const ACTIVE_STATUSES = new Set(['queued', 'preparing', 'running', 'finalizing']);

/**
 * "Is a live ETA meaningful for this job right now?"
 * Excludes `queued`, because work that has not started has no live ETA to
 * report. That single difference from ACTIVE_STATUSES is the intended one.
 */
export const HAS_LIVE_ETA_STATUSES = new Set(['preparing', 'running', 'processing', 'finalizing']);
