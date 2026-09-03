/**
 * queueEventDispatcher — pure topic-routing for queue socket events.
 *
 * Extracted from useQueueSync.ts so the dispatch logic can be unit-tested
 * without React hooks, WebSocket mocks, or a running store.
 *
 * The dispatcher is intentionally side-effect-free: all mutations are
 * performed by the caller-supplied deps callbacks.
 */

import type { LiveEvent } from '@/api/contracts/liveEvents';
import { adaptEventToJobUpdates } from '@/utils/jobEventAdapters';
import { applyTerminalLifecycleReset } from '@/utils/jobEventUtils';

/** Narrow interface that the dispatcher calls back into. */
export interface QueueEventDispatchDeps {
  /** Trigger a full queue API refresh (e.g. on invalidation). */
  refreshQueue: (source: 'refresh' | 'terminal') => void;

  /** Apply incremental overlay updates to the live-jobs store. */
  applyJobUpdated: (jobId: string, updates: Record<string, any>) => void;

  /** Derive overlay-only field set from a raw-updates map. */
  pickOverlay: (rawUpdates: Record<string, any>) => Record<string, any>;

  /** Returns true if the snapshot has already landed (hydration complete). */
  isHydrated: () => boolean;

  /** Returns the canonical status for a known job, or undefined if unknown. */
  getSnapshotStatus: (jobId: string) => string | undefined;

  /** Returns the current overlay status for a known job, or undefined if unknown. */
  getStoreStatus: (jobId: string) => string | undefined;

  /** Returns true if the job is known in the snapshot. */
  isKnownInSnapshot: (jobId: string) => boolean;

  /** Returns true if the job is known in the live-jobs store. */
  isKnownInStore: (jobId: string) => boolean;

  /** Re-derive and publish merged queue state after overlay changes. */
  updateDerivedState: () => void;
}

export type DispatchResult =
  | { action: 'refresh'; source: 'refresh' | 'terminal' }
  | { action: 'overlay' }
  | { action: 'skipped'; reason: string }
  | { action: 'unhandled' };

/**
 * Route a single studio socket event to the appropriate queue handler.
 *
 * Returns a DispatchResult describing what happened (useful in tests).
 * The actual mutations are performed via `deps` callbacks.
 */
export function dispatchQueueEvent(
  event: LiveEvent,
  payload: Record<string, any>,
  deps: QueueEventDispatchDeps,
): DispatchResult {
  const {
    refreshQueue,
    applyJobUpdated,
    pickOverlay,
    getSnapshotStatus,
    getStoreStatus,
    isKnownInSnapshot,
    isKnownInStore,
    updateDerivedState,
  } = deps;

  // ── Invalidation topics — full refresh ──────────────────────────────────
  if (
    (event.topic === 'queue.items' && event.eventKind === 'queue_item_invalidated') ||
    (event.topic === 'queue.items' && event.eventKind === 'queue_paused') ||
    event.topic === 'chapters.lifecycle'
  ) {
    refreshQueue('refresh');
    return { action: 'refresh', source: 'refresh' };
  }

  // ── Job-id scoped events (overlay or authority) ─────────────────────────
  if (event.jobId) {
    const isQueueAuthority = event.topic === 'queue.items';

    if (!isQueueAuthority) {
      // Non-queue.items topics are overlay-only: skip if the job is unknown.
      const known = isKnownInSnapshot(event.jobId) || isKnownInStore(event.jobId);
      if (!known) {
        if (process.env.NODE_ENV === 'development') {
          console.debug(
            `[queueEventDispatcher] overlay-only topic "${event.topic}" skipped for unknown job "${event.jobId}" — queue.items is row authority`,
          );
        }
        return { action: 'skipped', reason: 'overlay-only, unknown job' };
      }
    }

    const rawUpdates = adaptEventToJobUpdates(event);
    let updates: Record<string, any>;

    if (isQueueAuthority) {
      updates = rawUpdates;
    } else {
      // Overlay-only: strip identity/classification fields.
      updates = pickOverlay(rawUpdates);

      // Preserve the current effective status so applyJobUpdated does not
      // overwrite with the 'queued' default.
      const snapshotStatus = getSnapshotStatus(event.jobId);
      const storeStatus = getStoreStatus(event.jobId);
      const currentStatus = storeStatus ?? snapshotStatus;
      if (currentStatus !== undefined) updates.status = currentStatus;

      // For jobs.lifecycle terminal frames: clear ETA/active-segment overlay
      // fields (rawUpdates.status is read only for the trigger — NOT written).
      if (event.topic === 'jobs.lifecycle') {
        applyTerminalLifecycleReset(updates, rawUpdates.status);
      }
    }

    applyJobUpdated(event.jobId, updates);
    updateDerivedState();

    // Post-apply side effects that require a refetch.
    const reasonCode = payload.reasonCode ?? payload.reason_code;
    if (event.topic === 'jobs.lifecycle' && reasonCode === 'QUEUE_INVALIDATED') {
      refreshQueue('refresh');
      return { action: 'refresh', source: 'refresh' };
    }

    if (
      event.topic === 'jobs.lifecycle' &&
      ['done', 'failed', 'cancelled'].includes(rawUpdates.status)
    ) {
      // Defense-in-depth: terminal lifecycle frame triggers a queue refetch in
      // addition to the overlay update. Legal under row-authority rules (re-read,
      // not mutation from this frame); guarantees eventual consistency.
      refreshQueue('terminal');
      return { action: 'refresh', source: 'terminal' };
    }

    return { action: 'overlay' };
  }

  return { action: 'unhandled' };
}

/** Topics handled by the main queue consumer. */
export const QUEUE_HANDLED_TOPICS = new Set([
  'jobs.lifecycle',
  'queue.items',
  'chapters.lifecycle',
  'chapters.progress',
]);
