import type { ProcessingQueueItem, Status as LegacyStatus } from '@/types';
import type { LiveOverlayState, OverlayDelta } from '@/store/live-jobs';
import { isMainQueueSegmentItem, isSegmentScopedJob } from '@/utils/jobSelection';

export type HydrationSource = 'bootstrap' | 'terminal' | 'reconnect' | 'refresh';

export interface HydrationSnapshot {
  items: ProcessingQueueItem[];
  hydratedAtSeconds: number;
  source: HydrationSource;
}

const COMPLETION_HOLD_SECONDS = 12;
const TERMINAL_OVERLAY_HOLD_SECONDS = 30;

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
  if (isSegmentScopedJob(item)) return false;

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
const TERMINAL_STATUSES: ProcessingQueueItem['status'][] = ['done', 'failed', 'cancelled'];

function buildOverlayQueueItem(jobId: string, delta: OverlayDelta): ProcessingQueueItem | null {
  if (!delta.status) return null;
  const hasPositiveEta = typeof delta.eta_seconds === 'number' && delta.eta_seconds > 0;
  const positiveEtaSeconds = hasPositiveEta ? Number(delta.eta_seconds) : undefined;
  return {
    id: jobId,
    project_id: delta.project_id ?? null,
    chapter_id: delta.chapter_id ?? null,
    split_part: 0,
    parent_job_id: delta.parent_job_id ?? undefined,
    classification: delta.classification ?? undefined,
    status: delta.status as ProcessingQueueItem['status'],
    created_at: delta.created_at ?? delta.updated_at ?? Date.now() / 1000,
    completed_at: delta.completed_at ?? null,
    chapter_title: undefined,
    project_name: undefined,
    progress: delta.progress,
    eta_seconds: positiveEtaSeconds,
    estimated_end_at: delta.estimated_end_at ?? undefined,
    eta_basis: delta.eta_basis ?? undefined,
    started_at: delta.started_at ?? undefined,
    log: delta.message ?? undefined,
    custom_title: delta.custom_title ?? undefined,
    engine: delta.engine as any,
    segment_ids: delta.segment_ids ?? undefined,
    chapter_audio_status: undefined,
    chapter_audio_file_path: null,
    updated_at: delta.updated_at ?? undefined,
    eta_updated_at: hasPositiveEta ? (delta.eta_updated_at ?? undefined) : undefined,
    confidence: delta.confidence ?? undefined,
    error: delta.error ?? delta.message ?? undefined,
    audio_length_seconds: delta.audio_length_seconds ?? undefined,
    produced_audio_length: delta.produced_audio_length ?? undefined,
    produced_chars: delta.produced_chars ?? undefined,
    produced_segment_count: delta.produced_segment_count ?? undefined,
    render_group_count: undefined,
    completed_render_groups: undefined,
    active_render_group_index: undefined,
    total_render_weight: undefined,
    completed_render_weight: undefined,
    active_render_group_weight: undefined,
    grouped_progress: delta.grouped_progress ?? delta.progress,
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
        if (!item) return null;
        const isChapterScoped = !isMainQueueSegmentItem(item);
        const hasSnapshotSibling = isChapterScoped && items.some(snapItem => snapItem.chapter_id === item.chapter_id);
        const terminalTimestamp = item.completed_at ?? item.updated_at ?? item.created_at ?? 0;
        const isRecentTerminalOverlay = TERMINAL_STATUSES.includes(item.status)
          && terminalTimestamp > 0
          && (nowSeconds - terminalTimestamp) <= TERMINAL_OVERLAY_HOLD_SECONDS;
        if (!ACTIVE_STATUSES.includes(item.status) && !hasSnapshotSibling && !isRecentTerminalOverlay) return null;
        if (isMainQueueSegmentItem(item)) return null;
        return item;
      })
      .filter((item): item is ProcessingQueueItem => !!item);

    const baseItems = [...items, ...extraItems]
      .map(item => {
        const delta = eventsById[item.id];
        if (!delta) return item;
        return {
          ...item,
          classification: delta.classification ?? item.classification,
        };
      })
      .filter(item => !isMainQueueSegmentItem(item));

    const STATUS_RANK: Record<string, number> = {
      running: 5,
      finalizing: 4,
      preparing: 3,
      queued: 2,
      done: 1,
      failed: 0,
      cancelled: 0,
      error: 0,
    };

    const chapterJobsMap: Record<string, ProcessingQueueItem> = {};
    baseItems.forEach(item => {
      if (!item.chapter_id) return;
      const existing = chapterJobsMap[item.chapter_id];
      if (!existing) {
        chapterJobsMap[item.chapter_id] = item;
        return;
      }
      const itemTime = item.created_at ?? item.started_at ?? item.updated_at ?? 0;
      const existingTime = existing.created_at ?? existing.started_at ?? existing.updated_at ?? 0;
      if (itemTime > existingTime) {
        chapterJobsMap[item.chapter_id] = item;
      } else if (itemTime === existingTime) {
        const itemRank = STATUS_RANK[item.status] ?? 0;
        const existingRank = STATUS_RANK[existing.status] ?? 0;
        if (itemRank > existingRank) {
          chapterJobsMap[item.chapter_id] = item;
        }
      }
    });

    const dedupedItems = baseItems.filter(item => {
      if (!item.chapter_id) return true;
      return chapterJobsMap[item.chapter_id].id === item.id;
    });

    return dedupedItems.map(item => {
      const delta = eventsById[item.id];
      if (!delta) {
        // Even without delta, check for finalizing hold from snapshot state
        if (item.status === 'done' && shouldHoldCompletedIndeterminateJob(item, undefined, dedupedItems, 'done', nowSeconds)) {
          return { ...item, status: 'finalizing' as LegacyStatus, progress: 1.0 };
        }
        return item;
      }

      const isSnapshotTerminal = ['done', 'failed', 'cancelled'].includes(item.status);
      const isOverlayActive = ['queued', 'preparing', 'running', 'finalizing'].includes(delta.status || '');

      const hasSnapshotTimestamps = typeof item.updated_at === 'number' || typeof item.started_at === 'number' || typeof item.created_at === 'number';

      let isOverlayNewer = true;

      if (isOverlayActive && isSnapshotTerminal) {
        isOverlayNewer = false;
        if (typeof delta.updated_at === 'number' && typeof item.updated_at === 'number' && delta.updated_at > item.updated_at) {
          isOverlayNewer = true;
        } else if (typeof delta.started_at === 'number' && typeof item.started_at === 'number' && delta.started_at > item.started_at) {
          isOverlayNewer = true;
        } else if (!hasSnapshotTimestamps) {
          isOverlayNewer = true;
        }
      }

      const status = isOverlayNewer ? ((delta.status as LegacyStatus) ?? item.status) : item.status;
      const hasPositiveOverlayEta = typeof delta.eta_seconds === 'number' && delta.eta_seconds > 0;
      const positiveOverlayEtaSeconds = hasPositiveOverlayEta ? Number(delta.eta_seconds) : undefined;
      let progress = (isOverlayActive && isSnapshotTerminal && isOverlayNewer)
        ? (delta.progress ?? 0)
        : (isOverlayActive && isSnapshotTerminal && !isOverlayNewer)
          ? (item.progress ?? 0)
          : Math.max(delta.progress ?? 0, item.progress ?? 0);

      if (status === 'queued' || status === 'preparing') {
        progress = 0;
      }

      // Merge trusted fields from overlay
      const merged: ProcessingQueueItem = {
        ...item,
        classification: delta.classification ?? item.classification,
        parent_job_id: delta.parent_job_id ?? item.parent_job_id,
        status,
        progress,
        eta_seconds: isOverlayNewer ? (delta.eta_seconds !== undefined ? positiveOverlayEtaSeconds : item.eta_seconds) : item.eta_seconds,
        eta_basis: isOverlayNewer ? (delta.eta_basis ?? item.eta_basis) : item.eta_basis,
        estimated_end_at: isOverlayNewer ? (delta.estimated_end_at !== undefined ? (delta.estimated_end_at ?? undefined) : item.estimated_end_at) : item.estimated_end_at,
        eta_updated_at: isOverlayNewer ? (delta.eta_seconds !== undefined ? (hasPositiveOverlayEta ? (delta.eta_updated_at ?? undefined) : undefined) : item.eta_updated_at) : item.eta_updated_at,
        started_at: isOverlayNewer ? (delta.started_at !== undefined ? (delta.started_at ?? undefined) : item.started_at) : item.started_at,
        log: isOverlayNewer ? (delta.message ?? item.log) : item.log,
        error: isOverlayNewer ? (delta.error ?? delta.message ?? item.error) : item.error,
        render_group_count: isOverlayNewer ? (delta.render_group_count !== undefined ? delta.render_group_count ?? undefined : item.render_group_count) : item.render_group_count,
        completed_render_groups: isOverlayNewer ? (delta.completed_render_groups !== undefined ? delta.completed_render_groups ?? undefined : item.completed_render_groups) : item.completed_render_groups,
        active_render_group_index: isOverlayNewer ? (delta.active_render_group_index !== undefined ? delta.active_render_group_index ?? undefined : item.active_render_group_index) : item.active_render_group_index,
        total_render_weight: isOverlayNewer ? (delta.total_render_weight !== undefined ? delta.total_render_weight ?? undefined : item.total_render_weight) : item.total_render_weight,
        completed_render_weight: isOverlayNewer ? (delta.completed_render_weight !== undefined ? delta.completed_render_weight ?? undefined : item.completed_render_weight) : item.completed_render_weight,
        active_render_group_weight: isOverlayNewer ? (delta.active_render_group_weight !== undefined ? delta.active_render_group_weight ?? undefined : item.active_render_group_weight) : item.active_render_group_weight,
        grouped_progress: isOverlayNewer ? (delta.grouped_progress !== undefined ? delta.grouped_progress ?? undefined : item.grouped_progress) : item.grouped_progress,
        active_segment_id: isOverlayNewer ? (delta.active_segment_id !== undefined ? delta.active_segment_id ?? undefined : item.active_segment_id) : item.active_segment_id,
        active_segment_progress: isOverlayNewer ? (delta.active_segment_progress !== undefined ? delta.active_segment_progress ?? undefined : item.active_segment_progress) : item.active_segment_progress,
        confidence: isOverlayNewer ? (delta.confidence !== undefined ? delta.confidence ?? undefined : item.confidence) : item.confidence,
        indeterminate: isOverlayNewer ? (delta.indeterminate !== undefined ? delta.indeterminate : item.indeterminate) : item.indeterminate,
        loadingElapsedSeconds: isOverlayNewer ? (delta.loadingElapsedSeconds !== undefined ? delta.loadingElapsedSeconds : item.loadingElapsedSeconds) : item.loadingElapsedSeconds,
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
    ['queued', 'preparing', 'running', 'finalizing'].includes(item.status) && !isMainQueueSegmentItem(item)
  ).length;
};
