import type { ProcessingQueueItem, Status as LegacyStatus } from '@/types';
import type { LiveOverlayState, OverlayDelta } from '@/store/live-jobs';
import { isSegmentScopedJob } from '@/utils/jobSelection';

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

const FINALIZING_HOLD_ENGINES = ['mixed'];

function shouldHoldCompletedIndeterminateJob(
  item: ProcessingQueueItem,
  delta: OverlayDelta | undefined,
  queue: ProcessingQueueItem[],
  effectiveStatus: string,
  nowSeconds: number
): boolean {
  const engine = delta?.status === undefined ? item.engine : (item.engine); 
  if (!FINALIZING_HOLD_ENGINES.includes(engine || '')) return false;

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

const ACTIVE_STATUSES: ProcessingQueueItem['status'][] = ['queued', 'preparing', 'running', 'finalizing'];

function buildOverlayQueueItem(jobId: string, delta: OverlayDelta): ProcessingQueueItem | null {
  if (!delta.project_id || !delta.chapter_id || !delta.status) return null;
  return {
    id: jobId,
    project_id: delta.project_id,
    chapter_id: delta.chapter_id,
    split_part: 0,
    status: delta.status as ProcessingQueueItem['status'],
    created_at: delta.created_at ?? delta.updated_at ?? Date.now() / 1000,
    completed_at: delta.completed_at ?? null,
    chapter_title: undefined,
    project_name: undefined,
    progress: delta.progress,
    eta_seconds: delta.eta_seconds ?? undefined,
    estimated_end_at: delta.estimated_end_at ?? undefined,
    eta_basis: delta.eta_basis ?? undefined,
    started_at: delta.started_at ?? undefined,
    log: delta.message ?? undefined,
    custom_title: delta.custom_title ?? undefined,
    engine: delta.engine as any,
    segment_ids: delta.segment_ids ?? undefined,
    grouped_progress: delta.progress,
    chapter_audio_status: undefined,
    chapter_audio_file_path: null,
    updated_at: delta.updated_at ?? undefined,
    error: delta.error ?? delta.message ?? undefined,
    render_group_count: undefined,
    completed_render_groups: undefined,
    active_render_group_index: undefined,
    total_render_weight: undefined,
    completed_render_weight: undefined,
    active_render_group_weight: undefined,
    active_segment_id: delta.active_segment_id ?? undefined,
    active_segment_progress: delta.active_segment_progress ?? undefined,
  };
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
    const mergedIds = new Set(items.map(item => item.id));
    const extraItems = Object.entries(eventsById)
      .map(([jobId, delta]) => {
        if (mergedIds.has(jobId)) return null;
        const item = buildOverlayQueueItem(jobId, delta);
        if (!item || !ACTIVE_STATUSES.includes(item.status)) return null;
        return item;
      })
      .filter((item): item is ProcessingQueueItem => !!item);

    const baseItems = [...items, ...extraItems];

    return baseItems.map(item => {
      const delta = eventsById[item.id];
      if (!delta) {
        // Even without delta, check for finalizing hold from snapshot state
        if (item.status === 'done' && shouldHoldCompletedIndeterminateJob(item, undefined, items, 'done', nowSeconds)) {
          return { ...item, status: 'finalizing' as LegacyStatus, progress: 1.0 };
        }
        return item;
      }

      // Merge trusted fields from overlay
      const merged: ProcessingQueueItem = {
        ...item,
        status: (delta.status as LegacyStatus) ?? item.status,
        progress: Math.max(delta.progress ?? 0, item.progress ?? 0),
        eta_seconds: delta.eta_seconds !== undefined ? (delta.eta_seconds ?? undefined) : item.eta_seconds,
        eta_basis: delta.eta_basis ?? item.eta_basis,
        estimated_end_at: delta.estimated_end_at !== undefined ? (delta.estimated_end_at ?? undefined) : item.estimated_end_at,
        started_at: delta.started_at !== undefined ? (delta.started_at ?? undefined) : item.started_at,
        log: delta.message ?? item.log,
        error: delta.error ?? delta.message ?? item.error,
        // active_render_batch_id etc are not in ProcessingQueueItem but we could add them if needed
      };

      // Apply Finalizing Hold heuristic
      if (merged.status === 'done' && shouldHoldCompletedIndeterminateJob(item, delta, items, 'done', nowSeconds)) {
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
