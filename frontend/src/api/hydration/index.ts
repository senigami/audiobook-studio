import type { ProcessingQueueItem, Status as LegacyStatus } from '../../types';
import type { LiveOverlayState, OverlayDelta } from '../../store/live-jobs';
import { isSegmentScopedJob } from '../../utils/jobSelection';

export type HydrationSource = 'bootstrap' | 'reconnect' | 'refresh';

export interface HydrationSnapshot {
  items: ProcessingQueueItem[];
  hydratedAtSeconds: number;
  source: HydrationSource;
}

const COMPLETION_HOLD_SECONDS = 12;

function hasChapterAudioReady(item: ProcessingQueueItem): boolean {
  return item.chapter_audio_status === 'done' || !!item.chapter_audio_file_path;
}

function shouldHoldCompletedCloudItem(
  item: ProcessingQueueItem,
  delta: OverlayDelta | undefined,
  queue: ProcessingQueueItem[],
  effectiveStatus: string,
  nowSeconds: number
): boolean {
  const engine = delta?.status === undefined ? item.engine : (item.engine); // We keep canonical engine
  if (!['voxtral', 'mixed'].includes(engine || '')) return false;

  // We check if it's segment scoped using canonical data (segment_ids, custom_title)
  // Overlay doesn't usually change these.
  if (isSegmentScopedJob({
    segment_ids: item.segment_ids,
    custom_title: item.custom_title,
  })) return false;

  if (effectiveStatus !== 'done' || !item.chapter_id) return false;
  if (hasChapterAudioReady(item)) return false;

  const completedAt = item.completed_at;
  const recentlyCompleted = !!completedAt && (nowSeconds - completedAt) <= COMPLETION_HOLD_SECONDS;

  // We also check overlay age. If we saw a 'done' event just now, we hold it.
  // But if the overlay itself is older than the window, we let it through.
  const recentlyUpdated = !!delta?.updated_at && (nowSeconds - delta.updated_at) <= COMPLETION_HOLD_SECONDS;

  if (!recentlyCompleted && !recentlyUpdated) return false;

  const hasActiveSibling = queue.some(other =>
    other.id !== item.id &&
    other.chapter_id === item.chapter_id &&
    ['queued', 'preparing', 'running', 'finalizing'].includes(other.status)
  );
  return !hasActiveSibling;
}

export interface HydrationCoordinator {
  createSnapshot: (items: ProcessingQueueItem[], source?: HydrationSource) => HydrationSnapshot;
  mergeQueueWithOverlays: (snapshot: HydrationSnapshot, overlays: LiveOverlayState, nowOverride?: number) => ProcessingQueueItem[];
}

export const createHydrationCoordinator = (): HydrationCoordinator => ({
  createSnapshot: (items, source = 'bootstrap') => ({
    items,
    hydratedAtSeconds: Date.now() / 1000,
    source,
  }),

  mergeQueueWithOverlays: (snapshot, overlays, nowOverride) => {
    const nowSeconds = (nowOverride ?? Date.now()) / 1000;
    const { items } = snapshot;
    const { eventsById } = overlays;

    return items.map(item => {
      const delta = eventsById[item.id];
      if (!delta) {
        // Even without delta, check for finalizing hold from snapshot state
        if (item.status === 'done' && shouldHoldCompletedCloudItem(item, undefined, items, 'done', nowSeconds)) {
          return { ...item, status: 'finalizing' as LegacyStatus, progress: 1.0 };
        }
        return item;
      }

      // Merge trusted fields from overlay
      const merged: ProcessingQueueItem = {
        ...item,
        status: (delta.status as LegacyStatus) ?? item.status,
        progress: delta.progress ?? item.progress,
        eta_seconds: delta.eta_seconds !== undefined ? (delta.eta_seconds ?? undefined) : item.eta_seconds,
        eta_basis: delta.eta_basis ?? item.eta_basis,
        estimated_end_at: delta.estimated_end_at !== undefined ? (delta.estimated_end_at ?? undefined) : item.estimated_end_at,
        started_at: delta.started_at !== undefined ? (delta.started_at ?? undefined) : item.started_at,
        log: delta.message ?? item.log,
        // active_render_batch_id etc are not in ProcessingQueueItem but we could add them if needed
      };

      // Apply Finalizing Hold heuristic
      if (merged.status === 'done' && shouldHoldCompletedCloudItem(item, delta, items, 'done', nowSeconds)) {
        merged.status = 'finalizing' as LegacyStatus;
        merged.progress = 1.0;
      }

      // Preserve stabilizing logic from old useGlobalQueue (anti-regression)
      // Actually, many of those rules (monotonic progress, priority) are now in LiveJobsStore.
      // One remaining rule: finalizing status always forces 100% progress.
      if (merged.status === 'finalizing') {
        merged.progress = 1.0;
      }

      return merged;
    });
  },
});

export const selectActiveQueueCount = (queue: ProcessingQueueItem[]): number => {
  return queue.filter(item => 
    ['queued', 'preparing', 'running', 'finalizing'].includes(item.status)
  ).length;
};
