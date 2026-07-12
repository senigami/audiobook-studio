/**
 * W-PAR task 015: the single canonical "is this job actively rendering"
 * status set. Previously duplicated (and out of sync) in two places —
 * `ActivityPage.tsx`'s `ACTIVE_STATUSES` (queued/preparing/running/
 * finalizing) and `QueueItem.tsx`'s inlined `isTrulyActive` check (which
 * also included `'processing'`). This is the set used to gate segment-level
 * UI (peek strip / render monitor) — NOT a replacement for every ad-hoc
 * status check in the codebase, several of which intentionally include
 * `'processing'` for other purposes (progress-bar animation state, etc).
 */
export const ACTIVE_STATUSES = new Set(['queued', 'preparing', 'running', 'finalizing']);
