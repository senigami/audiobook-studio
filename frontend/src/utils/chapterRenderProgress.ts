import type { Job } from '../types';

const clamp01 = (value: number) => Math.max(0, Math.min(value, 1));

const isLiveStatus = (status: string | undefined) =>
  status === 'queued' || status === 'preparing' || status === 'running' || status === 'finalizing';

const resolveEndAtMs = (job: Job, nowMs: number) => {
  if (typeof job.estimated_end_at === 'number' && job.estimated_end_at > 0) {
    return job.estimated_end_at * 1000;
  }

  if (typeof job.eta_seconds !== 'number' || job.eta_seconds < 0) {
    return null;
  }

  if (job.eta_basis === 'remaining_from_update') {
    const anchorSeconds = job.updated_at ?? (nowMs / 1000);
    return (anchorSeconds + job.eta_seconds) * 1000;
  }

  if (typeof job.started_at === 'number' && job.started_at > 0) {
    return (job.started_at + job.eta_seconds) * 1000;
  }

  return nowMs + (job.eta_seconds * 1000);
};

const predictScalarProgress = (job: Job, progress: number, nowMs: number) => {
  const baseProgress = clamp01(progress);
  if (!isLiveStatus(job.status) || job.status === 'queued' || job.status === 'preparing') {
    return baseProgress;
  }

  const endAtMs = resolveEndAtMs(job, nowMs);
  if (endAtMs === null) return baseProgress;

  const anchorMs = (job.updated_at ?? (nowMs / 1000)) * 1000;
  const durationMs = endAtMs - anchorMs;
  if (durationMs <= 0) return Math.max(baseProgress, 0.995);

  const elapsedFraction = clamp01((nowMs - anchorMs) / durationMs);
  return baseProgress + ((0.995 - baseProgress) * elapsedFraction);
};

export const getPredictiveJobProgress = (job: Job, nowMs: number) => {
  const sourceProgress = typeof job.grouped_progress === 'number'
    ? job.grouped_progress
    : job.progress;
  return predictScalarProgress(job, sourceProgress, nowMs);
};

export const deriveActiveBatchProgress = (job: Job, fallbackBatchWeight: number, nowMs: number) => {
  if (typeof job.active_render_batch_progress === 'number') {
    return predictScalarProgress(job, job.active_render_batch_progress, nowMs);
  }

  const jobTotalWeight = typeof job.total_render_weight === 'number'
    ? job.total_render_weight
    : 0;
  const jobCompletedWeight = typeof job.completed_render_weight === 'number'
    ? job.completed_render_weight
    : 0;
  const jobActiveWeight = typeof job.active_render_group_weight === 'number' && job.active_render_group_weight > 0
    ? job.active_render_group_weight
    : fallbackBatchWeight;

  if (jobTotalWeight > 0 && jobActiveWeight > 0) {
    const visualJobProgress = getPredictiveJobProgress(job, nowMs);
    const renderProgressLimit = visualJobProgress > 0.9 ? 1 : 0.9;
    const weightedProgress = clamp01(visualJobProgress / renderProgressLimit);
    const activeFilledWeight = (weightedProgress * jobTotalWeight) - jobCompletedWeight;
    return clamp01(activeFilledWeight / jobActiveWeight);
  }

  if (typeof job.active_segment_progress === 'number') {
    return predictScalarProgress(job, job.active_segment_progress, nowMs);
  }

  return getPredictiveJobProgress(job, nowMs);
};
