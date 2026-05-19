import { describe, expect, it } from 'vitest';
import { deriveActiveBatchProgress, getPredictiveJobProgress, getRawActiveRenderProgress } from '@/utils/chapterRenderProgress';

describe('chapterRenderProgress', () => {
  it('predicts job progress between backend updates using the same ETA inputs as the header bar', () => {
    const job = {
      status: 'running',
      progress: 0.2,
      updated_at: 100,
      eta_seconds: 10,
      eta_basis: 'remaining_from_update',
    } as any;

    const progress = getPredictiveJobProgress(job, 105_000);

    expect(progress).toBeGreaterThan(0.2);
    expect(progress).toBeLessThan(0.995);
  });

  it('derives active batch progress from predictive weighted job progress before falling back to segment progress', () => {
    const job = {
      status: 'running',
      progress: 0.18,
      active_segment_progress: 1,
      updated_at: 100,
      eta_seconds: 10,
      eta_basis: 'remaining_from_update',
      total_render_weight: 8,
      completed_render_weight: 0,
      active_render_group_weight: 8,
    } as any;

    const progress = deriveActiveBatchProgress(job, 8, 101_000);

    expect(progress).toBeGreaterThan(0.2);
    expect(progress).toBeLessThan(1);
  });

  it('ignores orphan active segment progress when no active segment is selected', () => {
    const job = {
      status: 'running',
      progress: 0,
      active_segment_id: null,
      active_segment_progress: 1,
      updated_at: 100,
      eta_seconds: 10,
      eta_basis: 'remaining_from_update',
      total_render_weight: 0,
      completed_render_weight: 0,
      active_render_group_weight: 0,
    } as any;

    expect(deriveActiveBatchProgress(job, 0, 100_000)).toBe(0);
  });

  it('proves equal-length segments produce near-equal chapter progress contribution', () => {
    // Two equal-length segments contributing 100 characters each, total 200
    const totalWeight = 200;

    // First segment at 50% progress
    const activeWeight1 = 100;
    const completedWeight1 = 0;
    const activeProgress1 = 0.5;
    const progressContribution1 = (completedWeight1 + activeWeight1 * activeProgress1) / totalWeight;

    // Second segment at 50% progress
    const activeWeight2 = 100;
    const completedWeight2 = 100;
    const activeProgress2 = 0.5;
    const progressContribution2 = (completedWeight2 + activeWeight2 * activeProgress2) / totalWeight;

    // Total contribution of segment 1 is from 0.0 to 0.5 (delta 0.5)
    // Total contribution of segment 2 is from 0.5 to 1.0 (delta 0.5)
    expect(progressContribution1).toBe(0.25);
    expect(progressContribution2).toBe(0.75);
    expect(progressContribution2 - 0.5).toBeCloseTo(progressContribution1);
  });

  it('uses raw active segment progress for text highlighting even when the visual bar is ahead', () => {
    const job = {
      status: 'running',
      active_segment_id: 'seg-1',
      active_segment_progress: 0.2,
    } as any;

    expect(getRawActiveRenderProgress(job, 1)).toBe(0.2);
  });

  it('uses active segment progress for predictive batch progress when present', () => {
    const job = {
      status: 'running',
      active_segment_id: 'seg-1',
      active_segment_progress: 0.2,
      updated_at: 100,
      eta_seconds: 10,
      eta_basis: 'remaining_from_update',
      total_render_weight: 8,
      completed_render_weight: 0,
      active_render_group_weight: 8,
    } as any;

    const progress = deriveActiveBatchProgress(job, 8, 101_000);

    // Should predict starting from active_segment_progress (0.2), not overall job progress (which is 0)
    // 0.2 + (0.995 - 0.2) * (1 / 10) = 0.2 + 0.795 * 0.1 = 0.2795
    expect(progress).toBeCloseTo(0.2795);
  });
});
