import { describe, expect, it, vi } from 'vitest';
import { buildSegmentProgressBarProps } from '@/components/progress/progressBarContracts';
import { getBusyStatusText } from '@/components/progress/PredictiveProgressBar/predictiveProgressBarHelpers';

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

  it('does NOT fabricate an ETA at zero progress when no explicit ETA is present', () => {
    // Previously this seeded a default 120s ETA so the bar would not sit dead. But the
    // real engine ETA arrives the next frame, and the 120s→real collapse over the lane
    // migration spiked the displayed value to ~12% instead of easing from zero. We now
    // hold at 0 (no countdown) until the engine reports a real ETA, then coast from 0.
    const props = buildSegmentProgressBarProps({
      jobId: 'job-1',
      segmentId: 'seg-2',
      progress: 0,
      status: 'running',
    });

    expect(props.etaSeconds).toBeUndefined();
    expect(props.etaBasis).toBeUndefined();
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

  // Guard: the no-reasonCode path must NOT fabricate an ETA at zero progress — the bar
  // holds at 0 until the engine reports a real ETA (no 120s seed → no collapse spike).
  it('[guard] buildSegmentProgressBarProps without reasonCode does not fabricate an ETA at zero progress', () => {
    const props = buildSegmentProgressBarProps({
      jobId: 'job-guard',
      segmentId: 'seg-guard',
      progress: 0,
      status: 'running',
    });

    expect(props.etaSeconds).toBeUndefined();
  });

  // R1 revert-check: label must change from "Working..." to the preparing label.
  // Pre-fix: getBusyStatusText(undefined, true) === 'Working...'
  // Post-fix: getBusyStatusText(undefined, true) === 'Preparing…'
  // The label stays generic ("Preparing…") rather than asserting "Loading voice
  // model…": getBusyStatusText fires for ANY indeterminate-preparing bar (queue
  // pickup, assembly/export prep, model-load window), and only the model-load
  // window is actually loading a voice model. Claiming a model load on every
  // preparing bar would be false on non-synthesis jobs.
  it('(PREPARING-LABEL) getBusyStatusText returns preparing label when indeterminate=true', () => {
    // R1: this assertion fails on pre-fix code where the result is 'Working...'
    expect(getBusyStatusText(undefined, true)).toBe('Preparing…');
  });

  it('getBusyStatusText returns Finalizing... for finalizing state regardless of indeterminate', () => {
    expect(getBusyStatusText('finalizing', false)).toBe('Finalizing...');
    expect(getBusyStatusText('finalizing', true)).toBe('Finalizing...');
  });

  it('getBusyStatusText returns null when not indeterminate and not finalizing', () => {
    expect(getBusyStatusText('running', false)).toBeNull();
    expect(getBusyStatusText(undefined, false)).toBeNull();
  });

  // Gap 1: busyLabel override for the model-load window.
  // R1 revert-check: pre-change buildSegmentProgressBarProps returns no busyLabel property at all
  // (or busyLabel===undefined) for LOADING_MODEL; post-change it returns busyLabel==='Preparing… / Loading voice model…'.
  it('(BUSY-LABEL) buildSegmentProgressBarProps with LOADING_MODEL reasonCode returns busyLabel with model-specific text', () => {
    const props = buildSegmentProgressBarProps({
      jobId: 'job-ml',
      segmentId: 'seg-ml',
      progress: 0,
      status: 'running',
      reasonCode: 'LOADING_MODEL',
    });
    // R1: this fails pre-change because busyLabel is undefined
    expect((props as Record<string, unknown>).busyLabel).toBe('Preparing… / Loading voice model…');
  });

  it('(BUSY-LABEL) buildSegmentProgressBarProps with SEGMENT_PENDING reasonCode returns busyLabel with model-specific text', () => {
    const props = buildSegmentProgressBarProps({
      jobId: 'job-sp',
      segmentId: 'seg-sp',
      progress: 0,
      status: 'running',
      reasonCode: 'SEGMENT_PENDING',
    });
    // R1: this fails pre-change because busyLabel is undefined
    expect((props as Record<string, unknown>).busyLabel).toBe('Preparing… / Loading voice model…');
  });

  it('(BUSY-LABEL) buildSegmentProgressBarProps without a load reasonCode returns busyLabel === undefined', () => {
    const props = buildSegmentProgressBarProps({
      jobId: 'job-run',
      segmentId: 'seg-run',
      progress: 0.4,
      status: 'running',
      reasonCode: 'SEGMENT_PROGRESS',
    });
    // Non-load reason codes must NOT set busyLabel — falls back to generic 'Preparing…'
    expect((props as Record<string, unknown>).busyLabel).toBeUndefined();
  });

  it('(BUSY-LABEL) buildSegmentProgressBarProps without any reasonCode returns busyLabel === undefined', () => {
    const props = buildSegmentProgressBarProps({
      jobId: 'job-norc',
      segmentId: 'seg-norc',
      progress: 0.4,
      status: 'running',
    });
    expect((props as Record<string, unknown>).busyLabel).toBeUndefined();
  });
});
