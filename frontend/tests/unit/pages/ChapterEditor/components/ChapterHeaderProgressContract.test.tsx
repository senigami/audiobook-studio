/* eslint-disable */
import React from 'react';
import { render, screen, act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useChapterStatus, ChapterScriptToolbar } from '@/pages/ChapterEditor/components/ChapterHeader';
import type { SegmentHandoffState } from '@/hooks/useSegmentHandoffQueue';

let capturedOnDebugSnapshot: ((snapshot: any) => void) | undefined;
let capturedOnDisplayProgress: ((progress: number) => void) | undefined;
let capturedCheckpointMode: string | undefined;
let capturedState: string | undefined;
let capturedAllowBackwardProgress: boolean | undefined;
let capturedTransitionTickCount: number | undefined;
let capturedPersistenceKey: string | undefined;
let capturedProgress: number | undefined;
let capturedEvidenceWeightFraction: number | undefined;
let capturedPredictive: boolean | undefined;
let capturedEtaSeconds: number | undefined;
let capturedUpdatedAt: number | undefined;
let capturedShowEta: boolean | undefined;
let renderCount = 0;
let mountCount = 0;

vi.mock('@/components/progress/PredictiveProgressBar/PredictiveProgressBar', () => ({
  PredictiveProgressBar: ({ progress, etaBasis, etaSeconds, updatedAt, showEta, onDebugSnapshot, onDisplayProgress, checkpointMode, state, allowBackwardProgress, transitionTickCount, dataTestId, persistenceKey, evidenceWeightFraction, predictive }: any) => {
    capturedOnDebugSnapshot = onDebugSnapshot;
    capturedOnDisplayProgress = onDisplayProgress;
    capturedCheckpointMode = checkpointMode;
    capturedState = state;
    capturedAllowBackwardProgress = allowBackwardProgress;
    capturedTransitionTickCount = transitionTickCount;
    capturedPersistenceKey = persistenceKey;
    capturedProgress = progress;
    capturedEvidenceWeightFraction = evidenceWeightFraction;
    capturedPredictive = predictive;
    capturedEtaSeconds = etaSeconds;
    capturedUpdatedAt = updatedAt;
    capturedShowEta = showEta;
    renderCount++;
    React.useEffect(() => {
      mountCount++;
    }, []);
    return (
      <div
        data-testid={dataTestId || "chapter-header-progress-bar"}
        data-eta-basis={etaBasis ?? ''}
        data-eta-seconds={etaSeconds ?? ''}
        data-updated-at={updatedAt ?? ''}
        data-show-eta={String(!!showEta)}
        data-checkpoint-mode={checkpointMode ?? ''}
        data-state={state ?? ''}
        data-allow-backward={String(!!allowBackwardProgress)}
        data-transition-ticks={String(transitionTickCount)}
      >
        {`${Math.round(progress * 100)}%`}
      </div>
    );
  },
}));

const TestHeaderWrapper = (props: any) => {
  const status = useChapterStatus(
    props.chapter,
    props.job,
    props.generatingJob,
    props.queuePending,
    props.generatingSegmentIdsCount,
    props.queueLocked,
    props.activeRenderBatchId,
    props.activeRenderBatchWeight
  );

  return (
    <ChapterScriptToolbar
      chapter={props.chapter}
      saving={props.saving}
      hasUnsavedChanges={props.hasUnsavedChanges}
      submitting={props.submitting}
      queueLabel={props.queueLabel}
      queueTitle={props.queueTitle}
      onQueue={props.onQueue}
      onStopAll={props.onStopAll}
      onSegmentDisplayProgress={props.onSegmentDisplayProgress}
      onProgressBarDebugSnapshot={props.onProgressBarDebugSnapshot}
      status={status}
    />
  );
};

describe('ChapterHeader progress contract', () => {
  const mockChapter = {
    id: 'chap-1',
    project_id: 'proj-1',
    title: 'Test Chapter',
    char_count: 100,
    word_count: 20,
    audio_status: 'unprocessed' as const,
  };

  beforeEach(() => {
    capturedOnDebugSnapshot = undefined;
    capturedOnDisplayProgress = undefined;
    capturedCheckpointMode = undefined;
    capturedState = undefined;
    capturedAllowBackwardProgress = undefined;
    capturedTransitionTickCount = undefined;
    capturedPersistenceKey = undefined;
    capturedProgress = undefined;
    capturedEvidenceWeightFraction = undefined;
    capturedPredictive = undefined;
    capturedEtaSeconds = undefined;
    capturedUpdatedAt = undefined;
    capturedShowEta = undefined;
    renderCount = 0;
    mountCount = 0;
  });

  it('does not render Segment Progress from chapter progress when no active segment frame exists', () => {
    render(
      <TestHeaderWrapper
        chapter={mockChapter as any}
        title={mockChapter.title}
        setTitle={vi.fn()}
        saving={false}
        hasUnsavedChanges={false}
        selectedVoice=""
        onVoiceChange={vi.fn()}
        availableVoices={[]}
        submitting={false}
        queueLocked={false}
        queuePending={false}
        generatingJob={{
          id: 'job-render-block',
          engine: 'mixed',
          status: 'running',
          progress: 0.22,
          started_at: Date.now() / 1000,
          eta_seconds: 125,
          render_group_count: 1,
          hasSegmentSupport: true,
        } as any}
        generatingSegmentIdsCount={2}
        queueLabel="Complete"
        queueTitle="Complete Chapter Audio"
        onQueue={vi.fn()}
        onStopAll={vi.fn()}
      />
    );

    expect(screen.queryByTestId('chapter-header-segment-progress-bar')).toBeNull();
    expect(capturedProgress).toBeUndefined();
  });

  it('renders Segment Progress only from the active segment contract and disables predictive interpolation', () => {
    render(
      <TestHeaderWrapper
        chapter={mockChapter as any}
        title={mockChapter.title}
        setTitle={vi.fn()}
        saving={false}
        hasUnsavedChanges={false}
        selectedVoice=""
        onVoiceChange={vi.fn()}
        availableVoices={[]}
        submitting={false}
        queueLocked={false}
        queuePending={false}
        generatingJob={{
          id: 'job-active-segment-only',
          engine: 'mixed',
          status: 'running',
          progress: 0.82,
          started_at: Date.now() / 1000,
          eta_seconds: 125,
          active_segment_id: 'seg-2',
          active_segment_progress: 0.16,
          active_segment_eta_seconds: 18,
          active_segment_eta_basis: 'segment_remaining',
          active_segment_updated_at: 1234,
          render_group_count: 2,
          active_render_batch_progress: 0.9,
          hasSegmentSupport: true,
        } as any}
        generatingSegmentIdsCount={1}
        queueLabel="Complete"
        queueTitle="Complete Chapter Audio"
        onQueue={vi.fn()}
        onStopAll={vi.fn()}
      />
    );

    expect(screen.getByTestId('chapter-header-segment-progress-bar')).toHaveTextContent('16%');
    expect(screen.getByTestId('chapter-header-segment-progress-bar')).toHaveAttribute('data-eta-basis', 'segment_remaining');
    expect(screen.getByTestId('chapter-header-segment-progress-bar')).toHaveAttribute('data-eta-seconds', '18');
    expect(screen.getByTestId('chapter-header-segment-progress-bar')).toHaveAttribute('data-updated-at', '1234');
    expect(screen.getByTestId('chapter-header-segment-progress-bar')).toHaveAttribute('data-show-eta', 'true');
    expect(capturedProgress).toBe(0.16);
    expect(capturedPredictive).toBe(true);
    expect(capturedAllowBackwardProgress).toBe(false);
    expect(capturedEtaSeconds).toBe(18);
    expect(capturedUpdatedAt).toBe(1234);
    expect(capturedShowEta).toBe(true);
    expect(capturedCheckpointMode).toBe('segment');
  });

  it('uses preserved segments.progress provenance when later frames clear active_segment_id with progress zero', () => {
    render(
      <TestHeaderWrapper
        chapter={mockChapter as any}
        title={mockChapter.title}
        setTitle={vi.fn()}
        saving={false}
        hasUnsavedChanges={false}
        selectedVoice=""
        onVoiceChange={vi.fn()}
        availableVoices={[]}
        submitting={false}
        queueLocked={false}
        queuePending={false}
        generatingJob={{
          id: 'job-provenance-terminal',
          engine: 'mixed',
          status: 'running',
          progress: 0.44,
          active_segment_id: null,
          active_segment_progress: 0,
          active_segment_eta_seconds: 99,
          hasSegmentSupport: true,
          segmentProgressSocketProvenance: {
            consumedTopic: 'segments.progress',
            selectedFields: {
              activeSegmentId: 'seg-last',
              activeSegmentProgress: 1,
              etaSeconds: 0,
              eta_basis: 'segment_remaining',
              updatedAt: 4567,
              reasonCode: 'SEGMENT_SAVED',
            },
          },
        } as any}
        generatingSegmentIdsCount={1}
        queueLabel="Complete"
        queueTitle="Complete Chapter Audio"
        onQueue={vi.fn()}
        onStopAll={vi.fn()}
      />
    );

    expect(screen.getByTestId('chapter-header-segment-progress-bar')).toHaveTextContent('100%');
    expect(capturedPersistenceKey).toBe('job-provenance-terminal:seg-last');
    expect(capturedProgress).toBe(1);
  });

  it('forwards onProgressBarDebugSnapshot to PredictiveProgressBar.onDebugSnapshot so snapshots reach ChapterEditorPage', () => {
    const onProgressBarDebugSnapshot = vi.fn();

    render(
      <TestHeaderWrapper
        chapter={mockChapter as any}
        title={mockChapter.title}
        setTitle={vi.fn()}
        saving={false}
        hasUnsavedChanges={false}
        submitting={false}
        queueLocked={false}
        queuePending={false}
        generatingJob={{
          id: 'job-snap-test',
          engine: 'xtts',
          status: 'running',
          progress: 0.5,
          active_segment_id: 'seg-snap-test',
          active_segment_progress: 0.5,
          started_at: Date.now() / 1000,
          hasSegmentSupport: true,
        } as any}
        generatingSegmentIdsCount={1}
        queueLabel="Queue"
        queueTitle="Queue Chapter"
        onQueue={vi.fn()}
        onStopAll={vi.fn()}
        onProgressBarDebugSnapshot={onProgressBarDebugSnapshot}
      />
    );

    expect(screen.getByTestId('chapter-header-segment-progress-bar')).toBeInTheDocument();
    expect(capturedOnDebugSnapshot).toBeDefined();

    const fakeSnapshot = { progress: 0.5, displayProgress: 0.5, status: 'running' };
    act(() => {
      capturedOnDebugSnapshot!(fakeSnapshot);
    });

    expect(onProgressBarDebugSnapshot).toHaveBeenCalledTimes(1);
    expect(onProgressBarDebugSnapshot).toHaveBeenCalledWith(fakeSnapshot);
  });

  it('snapshot collected via onProgressBarDebugSnapshot contains expected shape so the parent ref can store it', () => {
    const collected: any[] = [];

    render(
      <TestHeaderWrapper
        chapter={mockChapter as any}
        title={mockChapter.title}
        setTitle={vi.fn()}
        saving={false}
        hasUnsavedChanges={false}
        submitting={false}
        queueLocked={false}
        queuePending={false}
        generatingJob={{
          id: 'job-snap-bundle',
          engine: 'xtts',
          status: 'running',
          progress: 0.3,
          active_segment_id: 'seg-snap-bundle',
          active_segment_progress: 0.3,
          started_at: Date.now() / 1000,
          hasSegmentSupport: true,
        } as any}
        generatingSegmentIdsCount={1}
        queueLabel="Queue"
        queueTitle="Queue Chapter"
        onQueue={vi.fn()}
        onStopAll={vi.fn()}
        onProgressBarDebugSnapshot={(snap: any) => collected.push(snap)}
      />
    );

    act(() => {
      capturedOnDebugSnapshot?.({
        progress: 0.3,
        displayProgress: 0.3,
        status: 'running',
        memoryKey: 'job-snap-bundle:none:undefined',
      });
    });

    expect(collected).toHaveLength(1);
    expect(collected[0]).toMatchObject({ progress: 0.3, status: 'running' });
  });

  it('does not mount Segment Progress for selected segment queue identity until the active segment frame arrives', () => {
    render(
      <TestHeaderWrapper
        chapter={mockChapter as any}
        title={mockChapter.title}
        setTitle={vi.fn()}
        saving={false}
        hasUnsavedChanges={false}
        submitting={false}
        queueLocked={false}
        queuePending={false}
        generatingJob={{
          id: 'job-checkpoint',
          engine: 'xtts',
          status: 'running',
          progress: 0.4,
          started_at: Date.now() / 1000,
          segment_ids: ['seg-1', 'seg-2'],
          hasSegmentSupport: true,
        } as any}
        generatingSegmentIdsCount={2}
        queueLabel="Queue"
        queueTitle="Queue Chapter"
        onQueue={vi.fn()}
        onStopAll={vi.fn()}
      />
    );

    expect(screen.queryByTestId('chapter-header-segment-progress-bar')).toBeNull();
  });

  it('does not mount Segment Progress for grouped chapter render jobs without an active segment frame', () => {
    render(
      <TestHeaderWrapper
        chapter={mockChapter as any}
        title={mockChapter.title}
        setTitle={vi.fn()}
        saving={false}
        hasUnsavedChanges={false}
        submitting={false}
        queueLocked={false}
        queuePending={false}
        generatingJob={{
          id: 'job-checkpoint-grouped',
          engine: 'mixed',
          status: 'running',
          progress: 0.4,
          started_at: Date.now() / 1000,
          render_group_count: 5,
          hasSegmentSupport: true,
        } as any}
        generatingSegmentIdsCount={0}
        queueLabel="Queue"
        queueTitle="Queue Chapter"
        onQueue={vi.fn()}
        onStopAll={vi.fn()}
      />
    );

    expect(screen.queryByTestId('chapter-header-segment-progress-bar')).toBeNull();
  });

  it('keeps grouped running jobs out of the Segment Progress bar until an active segment frame exists', () => {
    render(
      <TestHeaderWrapper
        chapter={mockChapter as any}
        title={mockChapter.title}
        setTitle={vi.fn()}
        saving={false}
        hasUnsavedChanges={false}
        submitting={false}
        queueLocked={false}
        queuePending={false}
        generatingJob={{
          id: 'job-grouped-pre-render',
          engine: 'mixed',
          status: 'running',
          progress: 0.12,
          started_at: Date.now() / 1000,
          render_group_count: 3,
          completed_render_groups: 0,
          hasSegmentSupport: true,
        } as any}
        generatingSegmentIdsCount={0}
        queueLabel="Queue"
        queueTitle="Queue Chapter"
        onQueue={vi.fn()}
        onStopAll={vi.fn()}
      />
    );

    expect(screen.queryByTestId('chapter-header-segment-progress-bar')).toBeNull();
    expect(capturedState).toBeUndefined();
  });

  it('clamps active segment progress corrections instead of allowing backward movement', () => {
    render(
      <TestHeaderWrapper
        chapter={mockChapter as any}
        title={mockChapter.title}
        setTitle={vi.fn()}
        saving={false}
        hasUnsavedChanges={false}
        submitting={false}
        queueLocked={false}
        queuePending={false}
        generatingJob={{
          id: 'job-active-segment',
          engine: 'mixed',
          status: 'running',
          progress: 0.44,
          started_at: Date.now() / 1000,
          render_group_count: 2,
          active_segment_id: 'seg-1',
          active_segment_progress: 0.2,
          hasSegmentSupport: true,
        } as any}
        generatingSegmentIdsCount={1}
        queueLabel="Queue"
        queueTitle="Queue Chapter"
        onQueue={vi.fn()}
        onStopAll={vi.fn()}
      />
    );

    expect(screen.getByTestId('chapter-header-segment-progress-bar')).toHaveAttribute('data-allow-backward', 'false');
    expect(capturedAllowBackwardProgress).toBe(false);
    expect(capturedPredictive).toBe(true);
  });

  it('uses segment checkpointMode and transitionTickCount=3 for grouped jobs when active_segment_id is present', () => {
    render(
      <TestHeaderWrapper
        chapter={mockChapter as any}
        title={mockChapter.title}
        setTitle={vi.fn()}
        saving={false}
        hasUnsavedChanges={false}
        submitting={false}
        queueLocked={false}
        queuePending={false}
        generatingJob={{
          id: 'job-grouped-active-segment',
          engine: 'mixed',
          status: 'running',
          progress: 0.44,
          started_at: Date.now() / 1000,
          render_group_count: 2,
          active_segment_id: 'seg-1',
          active_segment_progress: 0.2,
          hasSegmentSupport: true,
        } as any}
        generatingSegmentIdsCount={1}
        queueLabel="Queue"
        queueTitle="Queue Chapter"
        onQueue={vi.fn()}
        onStopAll={vi.fn()}
      />
    );

    expect(screen.getByTestId('chapter-header-segment-progress-bar')).toHaveAttribute('data-checkpoint-mode', 'segment');
    expect(capturedCheckpointMode).toBe('segment');
    expect(screen.getByTestId('chapter-header-segment-progress-bar')).toHaveAttribute('data-transition-ticks', '3');
    expect(capturedTransitionTickCount).toBe(3);
  });

  it('uses segment-scoped composite React key so active_segment_id changes cause clean remounts after visual completion', () => {
    vi.useFakeTimers();
    const baseJob = {
      id: 'job-key-test',
      engine: 'xtts',
      status: 'running' as const,
      progress: 0.4,
      started_at: Date.now() / 1000,
      active_segment_id: 'seg-1',
      active_segment_progress: 0.4,
      hasSegmentSupport: true,
    };

    const { rerender } = render(
      <TestHeaderWrapper
        chapter={mockChapter as any}
        title={mockChapter.title}
        setTitle={vi.fn()}
        saving={false}
        hasUnsavedChanges={false}
        submitting={false}
        queueLocked={false}
        queuePending={false}
        generatingJob={baseJob as any}
        generatingSegmentIdsCount={1}
        queueLabel="Queue"
        queueTitle="Queue Chapter"
        onQueue={vi.fn()}
        onStopAll={vi.fn()}
      />
    );

    expect(screen.getAllByTestId('chapter-header-segment-progress-bar')).toHaveLength(1);
    expect(mountCount).toBe(1);

    // New active segment arrives while old bar hasn't visually completed yet.
    rerender(
      <TestHeaderWrapper
        chapter={mockChapter as any}
        title={mockChapter.title}
        setTitle={vi.fn()}
        saving={false}
        hasUnsavedChanges={false}
        submitting={false}
        queueLocked={false}
        queuePending={false}
        generatingJob={{ ...baseJob, active_segment_id: 'seg-2', active_segment_progress: 0.1, progress: 0.1 } as any}
        generatingSegmentIdsCount={1}
        queueLabel="Queue"
        queueTitle="Queue Chapter"
        onQueue={vi.fn()}
        onStopAll={vi.fn()}
      />
    );

    // Bar should NOT remount yet — waiting for visual completion.
    expect(mountCount).toBe(1);
    expect(screen.getAllByTestId('chapter-header-segment-progress-bar')).toHaveLength(1);

    // Simulate the visual bar reaching 1.0 via onDisplayProgress callback.
    act(() => {
      capturedOnDisplayProgress?.(1.0);
    });
    // Advance through the 500ms hold, then the 16ms catch-up tick.
    act(() => {
      vi.advanceTimersByTime(500);
    });
    act(() => {
      vi.advanceTimersByTime(16); // flush the pendingLatest catch-up timer
    });

    // Now the bar should have remounted (key changed to seg-2).
    expect(mountCount).toBe(2);

    vi.useRealTimers();
  });

  it('bridges completed jobs (status=done) for a brief window before unmounting them', () => {
    vi.useFakeTimers();
    const baseJob = {
      id: 'job-bridge-test',
      engine: 'xtts',
      status: 'running' as const,
      progress: 0.8,
      active_segment_id: 'seg-bridge',
      active_segment_progress: 0.8,
      started_at: Date.now() / 1000,
      hasSegmentSupport: true,
    };

    const { rerender } = render(
      <TestHeaderWrapper
        chapter={mockChapter as any}
        title={mockChapter.title}
        setTitle={vi.fn()}
        saving={false}
        hasUnsavedChanges={false}
        submitting={false}
        queueLocked={false}
        queuePending={false}
        generatingJob={baseJob as any}
        generatingSegmentIdsCount={1}
        queueLabel="Queue"
        queueTitle="Queue Chapter"
        onQueue={vi.fn()}
        onStopAll={vi.fn()}
      />
    );

    expect(screen.getByTestId('chapter-header-segment-progress-bar')).toBeInTheDocument();
    expect(screen.getByTestId('chapter-header-segment-progress-bar')).toHaveTextContent('80%');

    // Transition job to done
    rerender(
      <TestHeaderWrapper
        chapter={mockChapter as any}
        title={mockChapter.title}
        setTitle={vi.fn()}
        saving={false}
        hasUnsavedChanges={false}
        submitting={false}
        queueLocked={false}
        queuePending={false}
        generatingJob={{ ...baseJob, status: 'done', progress: 1.0, active_segment_progress: 1.0 } as any}
        generatingSegmentIdsCount={0}
        queueLabel="Queue"
        queueTitle="Queue Chapter"
        onQueue={vi.fn()}
        onStopAll={vi.fn()}
      />
    );

    // The progress bar should STILL be mounted because of the done bridge!
    expect(screen.getByTestId('chapter-header-segment-progress-bar')).toBeInTheDocument();
    expect(screen.getByTestId('chapter-header-segment-progress-bar')).toHaveTextContent('100%');

    // Advance through the done-bridge window (1500ms).
    // After the bridge, liveSegmentProgressJob becomes undefined and the internal
    // handoff queue enters sentinel_completing (H4): it keeps the bar mounted while
    // the visual bar finishes and the handoff sentinel flush occurs.
    act(() => {
      vi.advanceTimersByTime(1600);
    });

    // Bar is still mounted — handoff is mid-sentinel-completing (waiting for visual 100%).
    expect(screen.getByTestId('chapter-header-segment-progress-bar')).toBeInTheDocument();

    // Advance through the 3s safety timer (no notifyDisplayProgress to drive visual completion).
    act(() => {
      vi.advanceTimersByTime(3000);
    });

    // Advance through the 500ms completion hold.
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Now the handoff has flushed to sentinel (displayedSegmentId='none') and
    // hasPending=false — the bar should be unmounted.
    expect(screen.queryByTestId('chapter-header-segment-progress-bar')).toBeNull();

    vi.useRealTimers();
  });

  it('resets Segment Progress bar persistence identity and props when activeSegmentId changes within the same job (after visual completion)', () => {
    vi.useFakeTimers();
    let generatingJob = {
      id: 'job-reset-test',
      status: 'running',
      progress: 0.5,
      active_segment_id: 'seg-A',
      active_segment_progress: 1.0,
      started_at: 1000,
      updated_at: 1100,
      hasSegmentSupport: true,
    };

    const TestComponent: React.FC<{ job: any }> = ({ job }) => {
      const status = useChapterStatus(
        { ...mockChapter, has_wav: true } as any,
        undefined,
        job,
        false,
        0,
        false
      );
      return (
        <ChapterScriptToolbar
          chapter={{ ...mockChapter, has_wav: true } as any}
          saving={false}
          hasUnsavedChanges={false}
          submitting={false}
          onQueue={vi.fn()}
          onStopAll={vi.fn()}
          status={status}
        />
      );
    };

    const { rerender } = render(<TestComponent job={generatingJob} />);
    expect(capturedPersistenceKey).toBe('job-reset-test:seg-A');
    expect(capturedProgress).toBe(1.0);

    // Switch active segment on the same job — bar should stay on seg-A until visual completion.
    generatingJob = {
      ...generatingJob,
      active_segment_id: 'seg-B',
      active_segment_progress: 0.16,
      updated_at: 1200,
    };
    rerender(<TestComponent job={generatingJob} />);

    // Still showing seg-A (awaiting visual completion).
    expect(capturedPersistenceKey).toBe('job-reset-test:seg-A');

    // Simulate visual bar reaching 1.0.
    act(() => {
      capturedOnDisplayProgress?.(1.0);
    });
    // Advance through the 500ms hold, then the 16ms catch-up tick.
    act(() => {
      vi.advanceTimersByTime(500);
    });
    act(() => {
      vi.advanceTimersByTime(16); // flush pendingLatest catch-up
    });

    // Now seg-B should be displayed.
    expect(capturedPersistenceKey).toBe('job-reset-test:seg-B');
    expect(capturedProgress).toBe(0.16);

    vi.useRealTimers();
  });

  it('keeps Segment Progress visual targets exact while preserving computed confidence in selection debug state', () => {
    let capturedStatus: any = null;
    const TestComponent = (props: any) => {
      capturedStatus = useChapterStatus(
        props.chapter,
        props.job,
        props.generatingJob,
        props.queuePending,
        props.generatingSegmentIdsCount,
        props.queueLocked,
        props.activeRenderBatchId,
        props.activeRenderBatchWeight
      );
      return <ChapterScriptToolbar {...props} status={capturedStatus} />;
    };

    render(
      <TestComponent
        chapter={mockChapter as any}
        title={mockChapter.title}
        saving={false}
        hasUnsavedChanges={false}
        submitting={false}
        queueLocked={false}
        queuePending={false}
        generatingJob={{
          id: 'job-confidence-test',
          engine: 'mixed',
          status: 'running',
          progress: 0.44,
          started_at: Date.now() / 1000,
          render_group_count: 2,
          active_segment_id: 'seg-1',
          active_segment_progress: 0.2,
          hasSegmentSupport: true,
        } as any}
        generatingSegmentIdsCount={1}
        activeRenderBatchId="batch-1"
        activeRenderBatchWeight={400}
        queueLabel="Queue"
        queueTitle="Queue Chapter"
        onQueue={vi.fn()}
        onStopAll={vi.fn()}
      />
    );

    expect(screen.getByTestId('chapter-header-segment-progress-bar')).toBeInTheDocument();
    expect(capturedCheckpointMode).toBe('segment');
    expect(capturedTransitionTickCount).toBe(3);
    expect(capturedStatus.segmentProgressBarSelection.evidenceWeightFraction).toBeCloseTo(0.16);
    // Per doc 15 the bar no longer receives an evidenceWeightFraction prop; confidence is internal.
    expect(capturedEvidenceWeightFraction).toBeUndefined();
  });

  it('proves that when active_segment_id is present, liveSegmentProgressValue equals active_segment_progress exactly even when render_group_count > 0', () => {
    let capturedStatus: any = null;
    const TestComponent = ({ generatingJob }: any) => {
      capturedStatus = useChapterStatus(mockChapter as any, undefined, generatingJob, false, 0, false);
      return null;
    };

    const generatingJob = {
      id: 'job-active-seg-pred-test',
      status: 'running',
      progress: 0.44,
      render_group_count: 2,
      active_segment_id: 'seg-1',
      active_segment_progress: 0.15,
      eta_seconds: 60,
      updated_at: (Date.now() - 10000) / 1000,
      hasSegmentSupport: true,
    };

    render(<TestComponent generatingJob={generatingJob as any} />);

    expect(capturedStatus.liveSegmentProgressValue).toBe(0.15);
  });

  it('proves 0.0 active_segment_progress remains 0.0 in ChapterHeader when capability is enabled', () => {
    let capturedStatus: any = null;
    const TestComponent = ({ generatingJob }: any) => {
      capturedStatus = useChapterStatus(mockChapter as any, undefined, generatingJob, false, 0, false);
      return null;
    };

    const generatingJob = {
      id: 'job-zero-progress-test',
      status: 'running',
      progress: 0.44,
      render_group_count: 2,
      active_segment_id: 'seg-1',
      active_segment_progress: 0.0,
      eta_seconds: 60,
      updated_at: (Date.now() - 10000) / 1000,
      hasSegmentSupport: true,
    };

    render(<TestComponent generatingJob={generatingJob as any} />);

    expect(capturedStatus.segmentProgressBarSelection.selectedActiveSegmentProgress).toBe(0.0);
    expect(capturedStatus.liveSegmentProgressValue).toBe(0.0);
  });

  it('proves existing legacy jobs are handled safely when the capability flag is absent or false', () => {
    let capturedStatus: any = null;
    const TestComponent = ({ generatingJob }: any) => {
      capturedStatus = useChapterStatus(mockChapter as any, undefined, generatingJob, false, 0, false);
      return null;
    };

    // When hasSegmentSupport is false
    const jobWithFalse = {
      id: 'job-false-capability',
      status: 'running',
      progress: 0.44,
      render_group_count: 2,
      active_segment_id: 'seg-1',
      active_segment_progress: 0.5,
      eta_seconds: 60,
      hasSegmentSupport: false,
    };

    render(<TestComponent generatingJob={jobWithFalse as any} />);
    expect(capturedStatus.segmentProgressBarSelection.selectedActiveSegmentProgress).toBeNull();
    expect(capturedStatus.segmentProgressBarSelection.selectedActiveSegmentId).toBeNull();

    // When hasSegmentSupport is absent (undefined) but is segment-scoped (e.g. classification is segment)
    const jobWithAbsent = {
      id: 'job-absent-capability',
      status: 'running',
      progress: 0.44,
      render_group_count: 2,
      active_segment_id: 'seg-1',
      active_segment_progress: 0.5,
      eta_seconds: 60,
      classification: 'segment',
    };

    render(<TestComponent generatingJob={jobWithAbsent as any} />);
    expect(capturedStatus.segmentProgressBarSelection.selectedActiveSegmentProgress).toBe(0.5);
    expect(capturedStatus.segmentProgressBarSelection.selectedActiveSegmentId).toBe('seg-1');
  });

  // -----------------------------------------------------------------------
  // Test A (R1 revert-check): bar stays mounted via handoff when liveSegmentProgressJob is undefined
  // Pre-change: mount guard was `status.liveSegmentProgressJob &&` → bar absent when job is undefined
  // Post-change: guard also checks hasPending/displayedSegmentId → bar present during handoff
  // -----------------------------------------------------------------------
  it('(H4) keeps bar mounted when liveSegmentProgressJob is undefined but handoffState has a real displayedSegmentId and hasPending', () => {
    // Build a stub SegmentHandoffState that looks mid-handoff:
    // displayedSegmentId is a real segment, hasPending true, liveJob is undefined.
    const handoffStub: SegmentHandoffState = {
      displayedSegmentId: 'seg-handoff-live',
      displayedProgress: 0.75,
      displayedEtaSeconds: 5,
      displayedEtaBasis: 'segment_remaining',
      displayedUpdatedAt: 9999,
      displayedJobId: 'job-handoff-live',
      hasPending: true,
      onVisualComplete: vi.fn(),
      notifyDisplayProgress: vi.fn(),
    };

    // status with liveSegmentProgressJob === undefined (job went terminal, heldLiveJob expired)
    const status = useChapterStatus_noHook();

    function useChapterStatus_noHook() {
      // Render a tiny component so we can call the hook legitimately.
      let captured: ReturnType<typeof useChapterStatus> | null = null;
      const Capture = () => {
        captured = useChapterStatus(
          mockChapter as any,
          undefined, // job
          undefined, // generatingJob — no live job
          false,
          0,
          false
        );
        return null;
      };
      render(<Capture />);
      return captured!;
    }

    render(
      <ChapterScriptToolbar
        chapter={mockChapter as any}
        saving={false}
        hasUnsavedChanges={false}
        submitting={false}
        onQueue={vi.fn()}
        onStopAll={vi.fn()}
        status={status}
        handoffState={handoffStub}
      />
    );

    // The progress bar must be in the document — mounted via handoff even though no live job.
    expect(screen.getByTestId('chapter-header-segment-progress-bar')).toBeInTheDocument();
  });

  // -----------------------------------------------------------------------
  // R1 revert-check: segment ETA (3s) must be used on first mount, not the 120s seed
  // Pre-fix: handoff.displayedEtaSeconds === null is treated as authoritative (null !== undefined),
  //          so the bar mounts with etaSeconds=null → seeded to 120s by buildSegmentProgressBarProps.
  //          The ETA confidence model then blends 120s → 3s, producing ~26s displayed ETA.
  // Post-fix: null handoff eta falls through to segmentProgressBarSelection.selectedEtaSeconds (3s).
  // -----------------------------------------------------------------------
  it('(ETA-LEAK) segment bar receives segment etaSeconds=3 on first mount, not the 120s seed, when handoffState.displayedEtaSeconds is null during sentinel transition', () => {
    // Simulate the one-render window between:
    //   1. liveSegmentProgressJob becoming truthy (active_segment_id arrived)
    //   2. handoff sentinel_reset effect firing (displayedEtaSeconds still null)
    // The page-lifted handoffState with displayedEtaSeconds=null mimics this window.
    const handoffStubWithNullEta: SegmentHandoffState = {
      displayedSegmentId: 'none',    // effect hasn't fired yet
      displayedProgress: 0,
      displayedEtaSeconds: null,     // ← the leaking null
      displayedEtaBasis: null,
      displayedUpdatedAt: null,
      displayedJobId: '',
      hasPending: false,
      onVisualComplete: vi.fn(),
      notifyDisplayProgress: vi.fn(),
    };

    const now = Date.now();
    vi.useFakeTimers();
    vi.setSystemTime(now);

    render(
      <ChapterScriptToolbar
        chapter={mockChapter as any}
        saving={false}
        hasUnsavedChanges={false}
        submitting={false}
        onQueue={vi.fn()}
        onStopAll={vi.fn()}
        status={{
          queueStatus: null,
          heldQueueStatus: null,
          effectiveQueueLocked: false,
          isQueued: false,
          liveSegmentProgressJob: {
            id: 'job-eta-leak',
            status: 'running',
            progress: 0,
            active_segment_id: 'seg-eta',
            active_segment_progress: 0,
            active_segment_eta_seconds: 3,
            active_segment_eta_basis: 'remaining_from_update',
            active_segment_updated_at: now / 1000,
            eta_seconds: 26,
            hasSegmentSupport: true,
          } as any,
          liveSegmentProgressValue: 0,
          hasChapterAudio: false,
          generatingSegmentIdsCount: 1,
          liveSegmentProgressIsRenderBlock: false,
          segmentProgressBarSelection: {
            dataTestId: 'chapter-header-segment-progress-bar',
            barMounted: true,
            selectedJobId: 'job-eta-leak',
            selectedJobStatus: 'running',
            selectedJobProgress: 0,
            selectedActiveSegmentId: 'seg-eta',
            selectedActiveSegmentProgress: 0,
            selectedEtaSeconds: 3,           // ← correct segment eta
            selectedEtaBasis: 'remaining_from_update' as any,
            selectedStartedAt: null,
            selectedUpdatedAt: now / 1000,
            liveSegmentProgressValue: 0,
            liveSegmentProgressIsRenderBlock: false,
            activeRenderBatchId: 'seg-eta',
            activeRenderBatchProgress: 0,
            renderGroupCount: null,
            valueSource: 'active_segment_progress',
            progressSource: 'active_segment_progress',
            selectedEtaSource: 'active_segment_eta_seconds',
            selectedUpdatedAtSource: 'active_segment_updated_at',
            evidenceWeightFraction: 1.0,
            isSegmentStartAtZero: true,
          },
        }}
        handoffState={handoffStubWithNullEta}
      />
    );

    vi.useRealTimers();

    // EXPECTED (post-fix): the bar receives the segment-scoped eta=3, not the 120s seed.
    // PRE-FIX: capturedEtaSeconds === 120 because null falls through as authoritative.
    expect(capturedEtaSeconds).toBe(3);
    // Also: the bar must not show the chapter-level eta (26) or the 120s fallback.
    expect(capturedEtaSeconds).not.toBe(120);
    expect(capturedEtaSeconds).not.toBe(26);
  });

  // -----------------------------------------------------------------------
  // R1 revert-check: SEGMENT_PENDING frame must NOT seed the synthetic 120s ETA.
  // Pre-fix: reasonCode was dropped at ChapterHeader ~:561 (not passed to
  //   buildSegmentProgressBarProps), so isSegmentPending=false → 120s seeded.
  // Post-fix: reasonCode: selectedSegmentReasonCode wired through → 120s NOT seeded.
  // -----------------------------------------------------------------------
  it('(REASON-CODE-WIRE) SEGMENT_PENDING frame does not seed the 120s ETA lane', () => {
    render(
      <TestHeaderWrapper
        chapter={mockChapter as any}
        saving={false}
        hasUnsavedChanges={false}
        submitting={false}
        queueLocked={false}
        queuePending={false}
        generatingJob={{
          id: 'job-pending-wire',
          engine: 'xtts',
          status: 'running',
          progress: 0,
          // SEGMENT_PENDING: active segment id present but engine not confirmed
          active_segment_id: 'seg-pending',
          active_segment_progress: 0,
          active_segment_eta_seconds: null,
          active_segment_eta_basis: null,
          active_segment_updated_at: null,
          reason_code: 'SEGMENT_PENDING',
          hasSegmentSupport: true,
        } as any}
        generatingSegmentIdsCount={1}
        queueLabel="Queue"
        queueTitle="Queue Chapter"
        onQueue={vi.fn()}
        onStopAll={vi.fn()}
      />
    );

    // The bar must be mounted (active_segment_id present).
    expect(screen.getByTestId('chapter-header-segment-progress-bar')).toBeInTheDocument();
    // SEGMENT_PENDING: reasonCode must reach buildSegmentProgressBarProps → no 120s seed.
    // R1: pre-fix this was capturedEtaSeconds === 120 because reasonCode was dropped.
    expect(capturedEtaSeconds).toBeUndefined();
    expect(capturedEtaSeconds).not.toBe(120);
  });
});
