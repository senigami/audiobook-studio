import { describe, expect, it, vi } from 'vitest';
import { buildSegmentProgressBarProps } from '@/components/progress/progressBarContracts';

describe('progressBarContracts', () => {
  it('builds the ChapterHeader segment progress contract without ETA prediction fields', () => {
    const onDisplayProgress = vi.fn();
    const onDebugSnapshot = vi.fn();

    const props = buildSegmentProgressBarProps({
      jobId: 'job-1',
      segmentId: 'seg-2',
      progress: 0.16,
      status: 'running',
      state: 'processing',
      evidenceWeightFraction: 0.16,
      onDisplayProgress,
      onDebugSnapshot,
    });

    expect(props.key).toBe('job-1:seg-2');
    expect(props.persistenceKey).toBe('job-1:seg-2');
    expect(props.progress).toBe(0.16);
    expect(props.predictive).toBe(false);
    expect(props.allowBackwardProgress).toBe(true);
    expect(props.checkpointMode).toBe('segment');
    expect(props.transitionTickCount).toBe(3);
    expect(props.backwardTransitionTickCount).toBe(2);
    expect(props.tickMs).toBe(250);
    expect(props.showEta).toBe(false);
    expect(props.startedAt).toBeUndefined();
    expect(props.etaSeconds).toBeUndefined();
    expect(props.etaBasis).toBeUndefined();
    expect(props.updatedAt).toBeUndefined();
    expect(props.evidenceWeightFraction).toBe(1);
    expect(props.onDisplayProgress).toBe(onDisplayProgress);
    expect(props.onDebugSnapshot).toBe(onDebugSnapshot);
  });
});
