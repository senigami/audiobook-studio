import React from 'react';
import { render, screen, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useChapterStatus, ChapterScriptToolbar } from '@/pages/ChapterEditor/components/ChapterHeader';

let capturedOnDebugSnapshot: ((snapshot: any) => void) | undefined;
let capturedCheckpointMode: string | undefined;
let renderCount = 0;
let mountCount = 0;

vi.mock('@/components/progress/PredictiveProgressBar/PredictiveProgressBar', () => ({
  PredictiveProgressBar: ({ progress, etaBasis, onDebugSnapshot, checkpointMode }: any) => {
    capturedOnDebugSnapshot = onDebugSnapshot;
    capturedCheckpointMode = checkpointMode;
    renderCount++;
    React.useEffect(() => {
      mountCount++;
    }, []);
    return (
      <div
        data-testid="chapter-header-progress-bar"
        data-eta-basis={etaBasis ?? ''}
        data-checkpoint-mode={checkpointMode ?? ''}
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

    expect(screen.getByTestId('chapter-header-progress-bar')).toHaveAttribute('data-eta-basis', 'remaining_from_update');
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

    expect(screen.getByTestId('chapter-header-progress-bar')).toBeInTheDocument();
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

    expect(screen.getByTestId('chapter-header-progress-bar'))
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

    expect(screen.getByTestId('chapter-header-progress-bar'))
      .toHaveAttribute('data-checkpoint-mode', 'queue');
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

    expect(screen.getAllByTestId('chapter-header-progress-bar')).toHaveLength(1);
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

    expect(screen.getByTestId('chapter-header-progress-bar')).toBeInTheDocument();
    expect(screen.getByTestId('chapter-header-progress-bar')).toHaveTextContent('80%');

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
    expect(screen.getByTestId('chapter-header-progress-bar')).toBeInTheDocument();
    expect(screen.getByTestId('chapter-header-progress-bar')).toHaveTextContent('100%');

    // Advance fake timers by 1600ms (more than 1500ms bridge)
    act(() => {
      vi.advanceTimersByTime(1600);
    });

    // Now it should be unmounted!
    expect(screen.queryByTestId('chapter-header-progress-bar')).toBeNull();

    vi.useRealTimers();
  });
});
