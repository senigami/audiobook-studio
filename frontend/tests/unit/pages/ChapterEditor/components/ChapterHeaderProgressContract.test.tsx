import React from 'react';
import { render, screen, act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useChapterStatus, ChapterScriptToolbar } from '@/pages/ChapterEditor/components/ChapterHeader';

let capturedOnDebugSnapshot: ((snapshot: any) => void) | undefined;
let capturedCheckpointMode: string | undefined;
let capturedState: string | undefined;
let capturedAllowBackwardProgress: boolean | undefined;
let capturedTransitionTickCount: number | undefined;
let capturedPersistenceKey: string | undefined;
let capturedProgress: number | undefined;
let capturedEvidenceWeightFraction: number | undefined;
let renderCount = 0;
let mountCount = 0;

vi.mock('@/components/progress/PredictiveProgressBar/PredictiveProgressBar', () => ({
  PredictiveProgressBar: ({ progress, etaBasis, onDebugSnapshot, checkpointMode, state, allowBackwardProgress, transitionTickCount, dataTestId, persistenceKey, evidenceWeightFraction }: any) => {
    capturedOnDebugSnapshot = onDebugSnapshot;
    capturedCheckpointMode = checkpointMode;
    capturedState = state;
    capturedAllowBackwardProgress = allowBackwardProgress;
    capturedTransitionTickCount = transitionTickCount;
    capturedPersistenceKey = persistenceKey;
    capturedProgress = progress;
    capturedEvidenceWeightFraction = evidenceWeightFraction;
    renderCount++;
    React.useEffect(() => {
      mountCount++;
    }, []);
    return (
      <div
        data-testid={dataTestId || "chapter-header-progress-bar"}
        data-eta-basis={etaBasis ?? ''}
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
    capturedCheckpointMode = undefined;
    capturedState = undefined;
    capturedAllowBackwardProgress = undefined;
    capturedTransitionTickCount = undefined;
    capturedPersistenceKey = undefined;
    capturedProgress = undefined;
    capturedEvidenceWeightFraction = undefined;
    renderCount = 0;
    mountCount = 0;
  });

  it('falls back to remaining_from_update when eta_basis is absent', () => {
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

    expect(screen.getByTestId('chapter-header-segment-progress-bar')).toHaveAttribute('data-eta-basis', 'remaining_from_update');
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

  it('passes checkpointMode=segment when the live job has segment_ids (matches QueueItem contract)', () => {
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

    expect(screen.getByTestId('chapter-header-segment-progress-bar'))
      .toHaveAttribute('data-checkpoint-mode', 'segment');
  });

  it('passes checkpointMode=queue when the live job is a grouped chapter render job', () => {
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

    expect(screen.getByTestId('chapter-header-segment-progress-bar'))
      .toHaveAttribute('data-checkpoint-mode', 'queue');
  });

  it('keeps grouped running jobs in processing state until an active render block exists', () => {
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

    expect(screen.getByTestId('chapter-header-segment-progress-bar')).toHaveAttribute('data-state', 'processing');
    expect(capturedState).toBe('processing');
  });

  it('allows active segment progress corrections to move backward', () => {
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

  it('uses segment-scoped composite React key so active_segment_id changes cause clean remounts', () => {
    const baseJob = {
      id: 'job-key-test',
      engine: 'xtts',
      status: 'running' as const,
      progress: 0.4,
      started_at: Date.now() / 1000,
      active_segment_id: 'seg-1',
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
        generatingJob={{ ...baseJob, active_segment_id: 'seg-2', progress: 0.1 } as any}
        generatingSegmentIdsCount={1}
        queueLabel="Queue"
        queueTitle="Queue Chapter"
        onQueue={vi.fn()}
        onStopAll={vi.fn()}
      />
    );

    expect(mountCount).toBe(2);
  });

  it('bridges completed jobs (status=done) for a brief window before unmounting them', () => {
    vi.useFakeTimers();
    const baseJob = {
      id: 'job-bridge-test',
      engine: 'xtts',
      status: 'running' as const,
      progress: 0.8,
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
        generatingJob={{ ...baseJob, status: 'done', progress: 1.0 } as any}
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

    // Advance fake timers by 1600ms (more than 1500ms bridge)
    act(() => {
      vi.advanceTimersByTime(1600);
    });

    // Now it should be unmounted!
    expect(screen.queryByTestId('chapter-header-segment-progress-bar')).toBeNull();

    vi.useRealTimers();
  });

  it('renders with data-testid="chapter-header-segment-progress-bar"', () => {
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
          id: 'job-testid-test',
          engine: 'xtts',
          status: 'running',
          progress: 0.5,
          started_at: Date.now() / 1000,
          hasSegmentSupport: true,
        } as any}
        generatingSegmentIdsCount={1}
        queueLabel="Queue"
        queueTitle="Queue Chapter"
        onQueue={vi.fn()}
        onStopAll={vi.fn()}
      />
    );

    expect(screen.getByTestId('chapter-header-segment-progress-bar')).toBeInTheDocument();
  });

  it('resets Segment Progress bar persistence identity and props when activeSegmentId changes within the same job', () => {
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

    // Switch active segment on the same job
    generatingJob = {
      ...generatingJob,
      active_segment_id: 'seg-B',
      active_segment_progress: 0.16,
      updated_at: 1200,
    };
    rerender(<TestComponent job={generatingJob} />);

    expect(capturedPersistenceKey).toBe('job-reset-test:seg-B');
    expect(capturedProgress).toBe(0.16);
  });

  it('proves the Segment Progress bar receives the computed confidence value and keeps checkpointMode=segment and transitionTickCount=3', () => {
    render(
      <TestHeaderWrapper
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
    expect(capturedEvidenceWeightFraction).toBeCloseTo(0.16);
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
});
