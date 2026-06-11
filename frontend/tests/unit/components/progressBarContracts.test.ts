import { describe, expect, it, vi } from 'vitest';
import { buildSegmentProgressBarProps } from '@/components/progress/progressBarContracts';

describe('progressBarContracts', () => {
  it('builds the ChapterHeader segment progress contract with no backward corrections', () => {
    const onDisplayProgress = vi.fn();
    const onDebugSnapshot = vi.fn();

    const props = buildSegmentProgressBarProps({
      jobId: 'job-1',
      segmentId: 'seg-2',
      progress: 0.16,
      status: 'running',
      state: 'processing',
      onDisplayProgress,
      onDebugSnapshot,
    });

    expect(props.key).toBe('job-1:seg-2');
    expect(props.persistenceKey).toBe('job-1:seg-2');
    expect(props.progress).toBe(0.16);
    expect(props.predictive).toBe(true);
    expect(props.allowBackwardProgress).toBe(false);
    expect(props.checkpointMode).toBe('segment');
    expect(props.transitionTickCount).toBe(3);
    expect(props.backwardTransitionTickCount).toBe(2);
    expect(props.tickMs).toBe(250);
    expect(props.showEta).toBe(true);
    expect(props.startedAt).toBeUndefined();
    expect(props.etaSeconds).toBeUndefined();
    expect(props.etaBasis).toBeUndefined();
    expect(props.updatedAt).toBeUndefined();
    expect((props as Record<string, unknown>).evidenceWeightFraction).toBeUndefined();
    expect(props.onDisplayProgress).toBe(onDisplayProgress);
    expect(props.onDebugSnapshot).toBe(onDebugSnapshot);
  });

  it('seeds START_SEGMENT at zero with a default 120 second ETA when no explicit ETA is present', () => {
    const props = buildSegmentProgressBarProps({
      jobId: 'job-1',
      segmentId: 'seg-2',
      progress: 0,
      status: 'running',
    });

    expect(props.etaSeconds).toBe(120);
    expect(props.etaBasis).toBe('remaining_from_update');
  });

  it('SEGMENT_PENDING at zero with null ETA does NOT seed the default 120s ETA', () => {
    const props = buildSegmentProgressBarProps({
      jobId: 'job-1',
      segmentId: 'seg-2',
      progress: 0,
      status: 'running',
      reasonCode: 'SEGMENT_PENDING',
      // etaSeconds intentionally absent (null from backend)
    });

    // Must not seed 120s — engine has not confirmed yet
    expect(props.etaSeconds).toBeUndefined();
    expect(props.etaBasis).toBeUndefined();
  });

  it('uses explicit segment ETA fields when provided by the segment event', () => {
    const props = buildSegmentProgressBarProps({
      jobId: 'job-1',
      segmentId: 'seg-2',
      progress: 0,
      status: 'running',
      etaSeconds: 31,
      etaBasis: 'remaining_from_update',
      updatedAt: 1234,
    });

    expect(props.etaSeconds).toBe(31);
    expect(props.etaBasis).toBe('remaining_from_update');
    expect(props.updatedAt).toBe(1234);
  });
});
