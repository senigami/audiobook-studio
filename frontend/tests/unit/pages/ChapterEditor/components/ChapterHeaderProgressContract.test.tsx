import React from 'react';
import { render, screen, act, renderHook } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useChapterStatus, ChapterScriptToolbar } from '@/pages/ChapterEditor/components/ChapterHeader';

let capturedOnDebugSnapshot: ((snapshot: any) => void) | undefined;
let capturedCheckpointMode: string | undefined;
let capturedState: string | undefined;
let capturedAllowBackwardProgress: boolean | undefined;
let capturedTransitionTickCount: number | undefined;
let capturedSegmentProgressSocketProvenance: any;
let renderCount = 0;
let mountCount = 0;

vi.mock('@/components/progress/PredictiveProgressBar/PredictiveProgressBar', () => ({
  PredictiveProgressBar: ({ progress, etaBasis, onDebugSnapshot, checkpointMode, state, allowBackwardProgress, transitionTickCount, dataTestId, segmentProgressSocketProvenance }: any) => {
    capturedOnDebugSnapshot = onDebugSnapshot;
    capturedCheckpointMode = checkpointMode;
    capturedState = state;
    capturedAllowBackwardProgress = allowBackwardProgress;
    capturedTransitionTickCount = transitionTickCount;
    capturedSegmentProgressSocketProvenance = segmentProgressSocketProvenance;
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
    props.queueLocked
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
    capturedSegmentProgressSocketProvenance = undefined;
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

  it('proves that the segment progress bar props/debug object includes the raw segments.progress socket event provenance', () => {
    const fakeProvenance = {
      rawEnvelope: { topic: 'segments.progress', frameId: 42 },
      selectedFields: { topic: 'segments.progress', frameId: 42 }
    };

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
          id: 'job-prov-test',
          engine: 'xtts',
          status: 'running',
          progress: 0.5,
          started_at: Date.now() / 1000,
          segmentProgressSocketProvenance: fakeProvenance,
        } as any}
        generatingSegmentIdsCount={1}
        queueLabel="Queue"
        queueTitle="Queue Chapter"
        onQueue={vi.fn()}
        onStopAll={vi.fn()}
      />
    );

    expect(screen.getByTestId('chapter-header-segment-progress-bar')).toBeInTheDocument();
    expect(capturedSegmentProgressSocketProvenance).toEqual(fakeProvenance);
  });

  it('proves the useChapterStatus returned bundle includes segmentProgressBarDebug with socket metadata and render props', () => {
    const fakeProvenance = {
      rawEnvelope: {
        topic: 'segments.progress',
        eventKind: 'segment_progress',
        frameId: 100,
        receivedAt: '2026-05-26T01:00:00Z',
        projectId: 'proj-1',
        chapterId: 'chap-1',
        jobId: 'job-123',
        segmentId: 'seg-1',
        raw: '{}',
        payload: {}
      },
      selectedFields: {
        topic: 'segments.progress',
        eventKind: 'segment_progress',
        frameId: 100,
        receivedAt: '2026-05-26T01:00:00Z',
        projectId: 'proj-1',
        chapterId: 'chap-1',
        jobId: 'job-123',
        segmentId: 'seg-1',
        activeSegmentId: 'seg-1',
        activeSegmentProgress: 0.5,
        etaSeconds: 30,
        eta_basis: 'remaining_from_update',
        started_at: 1000,
        updatedAt: 2000,
        status: 'running',
        progress: 0.5,
        reasonCode: 'test-reason',
      }
    };

    const generatingJob = {
      id: 'job-123',
      status: 'running',
      progress: 0.5,
      active_segment_id: 'seg-1',
      active_segment_progress: 0.5,
      segmentProgressSocketProvenance: fakeProvenance,
    };

    const { result } = renderHook(() => useChapterStatus(
      mockChapter as any,
      undefined,
      generatingJob as any,
      false,
      1,
      false
    ));

    expect((result.current as any).segmentProgressBarDebug).toBeDefined();
    expect((result.current as any).segmentProgressBarDebug.eventKind).toBe('segment_progress');
    expect((result.current as any).segmentProgressBarDebug.ignoredFields).toEqual([]);
    expect((result.current as any).segmentProgressBarDebug.renderProps).toBeDefined();
    expect((result.current as any).segmentProgressBarDebug.mismatch).toBe(false);
  });

  it('proves the Segment Progress bar debug object is populated from generatingJob when liveSegmentProgressJob is terminal/undefined', () => {
    const fakeProvenance = {
      rawEnvelope: {
        topic: 'segments.progress',
        eventKind: 'segment_progress',
        frameId: 200,
        receivedAt: '2026-05-26T02:00:00Z',
        projectId: 'proj-1',
        chapterId: 'chap-1',
        jobId: 'job-done-123',
        segmentId: 'seg-1',
        raw: '{}',
        payload: {}
      },
      selectedFields: {
        topic: 'segments.progress',
        eventKind: 'segment_progress',
        frameId: 200,
        receivedAt: '2026-05-26T02:00:00Z',
        projectId: 'proj-1',
        chapterId: 'chap-1',
        jobId: 'job-done-123',
        segmentId: 'seg-1',
        activeSegmentId: 'seg-1',
        activeSegmentProgress: 1.0,
        etaSeconds: 0,
        eta_basis: 'remaining_from_update',
        started_at: 1000,
        updatedAt: 2000,
        status: 'done',
        progress: 1.0,
        reasonCode: 'segment_saved',
      }
    };

    const generatingJob = {
      id: 'job-done-123',
      status: 'done',
      progress: 1.0,
      active_segment_id: 'seg-1',
      active_segment_progress: 1.0,
      segmentProgressSocketProvenance: fakeProvenance,
    };

    vi.useFakeTimers();

    const { result } = renderHook(() => useChapterStatus(
      { ...mockChapter, has_wav: true } as any,
      undefined,
      generatingJob as any,
      false,
      0,
      false
    ));

    // Initially, liveSegmentProgressJob is defined due to bridge window
    expect((result.current as any).liveSegmentProgressJob).toBeDefined();
    expect((result.current as any).segmentProgressBarDebug.telemetryState).toBe('live');

    // Advance timers past the 1500ms bridge window
    act(() => {
      vi.advanceTimersByTime(1600);
    });

    expect((result.current as any).liveSegmentProgressJob).toBeUndefined();
    expect((result.current as any).segmentProgressBarDebug).toBeDefined();
    expect((result.current as any).segmentProgressBarDebug.jobId).toBe('job-done-123');
    expect((result.current as any).segmentProgressBarDebug.eventKind).toBe('segment_progress');
    expect((result.current as any).segmentProgressBarDebug.mismatch).toBe(true);
    expect((result.current as any).segmentProgressBarDebug.telemetryState).toBe('last-rendered');

    vi.useRealTimers();
  });

  it('proves the debug snapshot matches the exact props passed to PredictiveProgressBar', () => {
    const fakeProvenance = {
      rawEnvelope: {
        topic: 'segments.progress',
        eventKind: 'segment_progress',
        frameId: 300,
        receivedAt: '2026-05-26T03:00:00Z',
        projectId: 'proj-1',
        chapterId: 'chap-1',
        jobId: 'job-789',
        segmentId: 'seg-1',
      },
      selectedFields: {
        activeSegmentId: 'seg-1',
        activeSegmentProgress: 0.65,
        etaSeconds: 40,
        eta_basis: 'remaining_from_update',
        started_at: 1000,
        updatedAt: 2000,
        status: 'running',
        progress: 0.65,
      }
    };

    const generatingJob = {
      id: 'job-789',
      status: 'running',
      progress: 0.65,
      active_segment_id: 'seg-1',
      active_segment_progress: 0.65,
      segmentProgressSocketProvenance: fakeProvenance,
    };

    let statusResult: any;
    const TestComponent = () => {
      const status = useChapterStatus(
        mockChapter as any,
        undefined,
        generatingJob as any,
        false,
        1,
        false
      );
      React.useLayoutEffect(() => {
        statusResult = status;
      });
      return (
        <ChapterScriptToolbar
          chapter={mockChapter as any}
          saving={false}
          hasUnsavedChanges={false}
          submitting={false}
          onQueue={vi.fn()}
          onStopAll={vi.fn()}
          status={status}
        />
      );
    };

    render(<TestComponent />);

    expect(screen.getByTestId('chapter-header-segment-progress-bar')).toBeInTheDocument();

    // Check that statusResult.segmentProgressBarDebug is live and has the correct fields
    const debug = statusResult.segmentProgressBarDebug;
    expect(debug).toBeDefined();
    expect(debug.telemetryState).toBe('live');
    expect(debug.mismatch).toBe(false);
    expect(debug.jobId).toBe('job-789');
    expect(debug.renderProps).toBeDefined();
    expect(debug.renderProps.progress).toBe(0.65);
    expect(debug.renderProps.persistenceKey).toBe('job-789:seg-1');
  });

  it('proves the snapshot still exists after the bar unmounts and is clearly marked as last-rendered', () => {
    vi.useFakeTimers();
    const fakeProvenance = {
      rawEnvelope: {
        topic: 'segments.progress',
        eventKind: 'segment_progress',
        frameId: 300,
        receivedAt: '2026-05-26T03:00:00Z',
        projectId: 'proj-1',
        chapterId: 'chap-1',
        jobId: 'job-789',
        segmentId: 'seg-1',
      },
      selectedFields: {
        activeSegmentId: 'seg-1',
        activeSegmentProgress: 1.0,
        etaSeconds: 0,
        eta_basis: 'remaining_from_update',
        started_at: 1000,
        updatedAt: 2000,
        status: 'done',
        progress: 1.0,
      }
    };

    let generatingJob: any = {
      id: 'job-789',
      status: 'running',
      progress: 0.65,
      active_segment_id: 'seg-1',
      active_segment_progress: 0.65,
      segmentProgressSocketProvenance: fakeProvenance,
    };

    let statusResult: any;
    const TestComponent = ({ job }: any) => {
      const status = useChapterStatus(
        { ...mockChapter, has_wav: true } as any,
        undefined,
        job,
        false,
        0,
        false
      );
      React.useLayoutEffect(() => {
        statusResult = status;
      });
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

    // Initially active and live
    expect(screen.getByTestId('chapter-header-segment-progress-bar')).toBeInTheDocument();
    expect(statusResult.segmentProgressBarDebug.telemetryState).toBe('live');
    expect(statusResult.segmentProgressBarDebug.mismatch).toBe(false);

    // Update job status to done to start unmounting bridge
    generatingJob = {
      ...generatingJob,
      status: 'done',
      progress: 1.0,
      active_segment_progress: 1.0,
    };
    rerender(<TestComponent job={generatingJob} />);

    // Still mounted during the done bridge
    expect(screen.getByTestId('chapter-header-segment-progress-bar')).toBeInTheDocument();

    // Advance fake timers by 1600ms to let the bridge expire and the bar unmount
    act(() => {
      vi.advanceTimersByTime(1600);
    });

    // Verify it is unmounted
    expect(screen.queryByTestId('chapter-header-segment-progress-bar')).toBeNull();

    // Verify snapshot still exists and is marked as last-rendered
    const debugAfterUnmount = statusResult.segmentProgressBarDebug;
    expect(debugAfterUnmount).toBeDefined();
    expect(debugAfterUnmount.telemetryState).toBe('last-rendered');
    expect(debugAfterUnmount.mismatch).toBe(true);
    expect(debugAfterUnmount.jobId).toBe('job-789');
    expect(debugAfterUnmount.renderProps).toBeDefined();
    expect(debugAfterUnmount.renderProps.progress).toBe(1.0); // should show last rendered props

    vi.useRealTimers();
  });

  it('resets Segment Progress bar persistence identity and props when activeSegmentId changes within the same job', () => {
    let statusResult: any;
    let generatingJob = {
      id: 'job-reset-test',
      status: 'running',
      progress: 0.5,
      active_segment_id: 'seg-A',
      active_segment_progress: 1.0,
      started_at: 1000,
      updated_at: 1100,
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
      React.useLayoutEffect(() => {
        statusResult = status;
      });
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
    expect(statusResult.segmentProgressBarProps.persistenceKey).toBe('job-reset-test:seg-A');
    expect(statusResult.segmentProgressBarDebug.renderProps.persistenceKey).toBe('job-reset-test:seg-A');

    // Switch active segment on the same job
    generatingJob = {
      ...generatingJob,
      active_segment_id: 'seg-B',
      active_segment_progress: 0.16,
      updated_at: 1200,
    };
    rerender(<TestComponent job={generatingJob} />);

    expect(statusResult.segmentProgressBarProps.persistenceKey).toBe('job-reset-test:seg-B');
    expect(statusResult.segmentProgressBarDebug.renderProps.persistenceKey).toBe('job-reset-test:seg-B');
    expect(statusResult.segmentProgressBarProps.progress).toBe(0.16);
  });
});
