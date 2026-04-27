import type { Job } from '../types';

export const SEGMENT_PROGRESS_LINGER_MS = 600;
export const MIN_VISIBLE_SEGMENT_PROGRESS = 0.015;
export const MIN_ACTIVE_GROUP_DURATION_SECONDS = 4;

export function queueFromGroupStart(uniqueSegmentIds: string[], segmentId: string): string[] {
  const idx = uniqueSegmentIds.indexOf(segmentId);
  return idx !== -1 ? uniqueSegmentIds.slice(idx) : [segmentId];
}

export function getPredictiveJobProgress(job?: Job): number {
  if (!job || (job.status !== 'running' && job.status !== 'finalizing')) {
    return 0;
  }

  const baseProgress = Math.max(0, Math.min(1, job.progress ?? 0));
  if (!job.started_at || !job.eta_seconds) {
    return baseProgress;
  }

  const elapsed = (Date.now() / 1000) - job.started_at;
  const timeProgress = Math.min(0.99, Math.max(0, elapsed / job.eta_seconds));
  return Math.max(baseProgress, timeProgress);
}

export function getWeightedActiveGroupProgress(job?: Job): number | null {
  if (!job || (job.status !== 'running' && job.status !== 'finalizing')) {
    return null;
  }

  const totalRenderWeight = job.total_render_weight ?? 0;
  const activeRenderGroupWeight = job.active_render_group_weight ?? 0;
  const completedRenderWeight = job.completed_render_weight ?? 0;

  if (!job.started_at || !job.eta_seconds || totalRenderWeight <= 0 || activeRenderGroupWeight <= 0) {
    return null;
  }

  const elapsedSeconds = Math.max(0, (Date.now() / 1000) - job.started_at);
  const observedOverallProgress = Math.max(
    0.01,
    Math.min(
      0.995,
      job.grouped_progress
      ?? job.progress
      ?? (totalRenderWeight > 0 ? (completedRenderWeight / totalRenderWeight) : 0)
    )
  );
  
  const impliedTotalSeconds = elapsedSeconds / observedOverallProgress;
  const expectedTotalSeconds = Math.max(job.eta_seconds, impliedTotalSeconds, 1);
  const expectedSecondsBeforeGroup = expectedTotalSeconds * (completedRenderWeight / totalRenderWeight);
  const remainingRenderWeight = Math.max(1, totalRenderWeight - completedRenderWeight);
  const expectedRemainingChapterSeconds = Math.max(1, expectedTotalSeconds - expectedSecondsBeforeGroup);
  const expectedActiveGroupSeconds = Math.max(
    MIN_ACTIVE_GROUP_DURATION_SECONDS,
    expectedRemainingChapterSeconds * (activeRenderGroupWeight / remainingRenderWeight)
  );

  if (expectedActiveGroupSeconds <= 0) {
    return null;
  }

  const elapsedWithinGroup = Math.max(0, elapsedSeconds - expectedSecondsBeforeGroup);
  return Math.max(0, Math.min(1, elapsedWithinGroup / expectedActiveGroupSeconds));
}

export function isVoxtralJob(job?: Job): boolean {
  return job?.engine === 'voxtral';
}
