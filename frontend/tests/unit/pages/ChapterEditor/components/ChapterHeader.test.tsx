/* eslint-disable */
import React from 'react';
import { render, screen, fireEvent, act } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { useChapterStatus, ChapterTopBar, ChapterScriptToolbar } from '@/pages/ChapterEditor/components/ChapterHeader';
import type { Job } from '@/types';

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
    <>
      <ChapterTopBar
        title={props.title}
        setTitle={props.setTitle}
        onPrev={props.onPrev}
        onNext={props.onNext}
      />
      <ChapterScriptToolbar
        chapter={props.chapter}
        saving={props.saving}
        hasUnsavedChanges={props.hasUnsavedChanges}
        submitting={props.submitting}
        queueLabel={props.queueLabel}
        queueTitle={props.queueTitle}
        onQueue={props.onQueue}
        onStopAll={props.onStopAll}
        onCopyDebugState={props.onCopyDebugState}
        onSegmentDisplayProgress={props.onSegmentDisplayProgress}
        status={status}
      />
    </>
  );
};

describe('ChapterHeader', () => {
  const mockChapter = {
    id: 'chap-1',
    project_id: 'proj-1',
    title: 'Test Chapter',
    char_count: 100,
    word_count: 20,
    audio_status: 'unprocessed' as const,
  };

  it('renders title and handles changes', () => {
    const setTitle = vi.fn();
    render(
      <TestHeaderWrapper
        chapter={mockChapter as any}
        title="Initial Title"
        setTitle={setTitle}
        saving={false}
        hasUnsavedChanges={false}
        onBack={vi.fn()}
        selectedVoice=""
        onVoiceChange={vi.fn()}
        availableVoices={[]}
        submitting={false}
        queueLocked={false}
        queuePending={false}
        queueLabel="Queue"
        queueTitle="Queue Chapter"
        onQueue={vi.fn()}
        onStopAll={vi.fn()}
        generatingSegmentIdsCount={0}
      />
    );

    expect(screen.getByDisplayValue('Initial Title')).toBeInTheDocument();
    fireEvent.change(screen.getByDisplayValue('Initial Title'), { target: { value: 'New Title' } });
    expect(setTitle).toHaveBeenCalledWith('New Title');
  });

  it('keeps the queue button disabled while the header still shows queue status', () => {
    const { rerender } = render(
      <TestHeaderWrapper
        chapter={mockChapter as any}
        title={mockChapter.title}
        setTitle={vi.fn()}
        saving={false}
        hasUnsavedChanges={false}
        onBack={vi.fn()}
        selectedVoice=""
        onVoiceChange={vi.fn()}
        availableVoices={[]}
        submitting={false}
        queueLocked={false}
        queuePending={false}
        job={{ id: 'job-1', engine: 'mixed', status: 'running', progress: 1 } as any}
        generatingSegmentIdsCount={0}
        queueLabel="Complete"
        queueTitle="Complete Chapter Audio"
        onQueue={vi.fn()}
        onStopAll={vi.fn()}
      />
    );

    expect(screen.getByTitle('Already processing')).toBeDisabled();

    rerender(
      <TestHeaderWrapper
        chapter={mockChapter as any}
        title={mockChapter.title}
        setTitle={vi.fn()}
        saving={false}
        hasUnsavedChanges={false}
        onBack={vi.fn()}
        selectedVoice=""
        onVoiceChange={vi.fn()}
        availableVoices={[]}
        submitting={false}
        queueLocked={false}
        queuePending={false}
        job={{ id: 'job-1', engine: 'mixed', status: 'done', finished_at: Date.now() / 1000, progress: 1 } as any}
        generatingSegmentIdsCount={0}
        queueLabel="Complete"
        queueTitle="Complete Chapter Audio"
        onQueue={vi.fn()}
        onStopAll={vi.fn()}
      />
    );

    expect(screen.getByTitle('Already processing')).toBeDisabled();
  });

  it('shows working header state for active segment generation without a chapter render job', () => {
    const { rerender } = render(
      <TestHeaderWrapper
        chapter={mockChapter as any}
        title={mockChapter.title}
        setTitle={vi.fn()}
        saving={false}
        hasUnsavedChanges={false}
        onBack={vi.fn()}
        selectedVoice=""
        onVoiceChange={vi.fn()}
        availableVoices={[]}
        submitting={false}
        queueLocked={false}
        queuePending={false}
        job={undefined}
        generatingJob={{ id: 'job-seg', engine: 'mixed', status: 'running', progress: 0.4, started_at: Date.now() / 1000, eta_seconds: 9 } as any}
        generatingSegmentIdsCount={2}
        queueLabel="Complete"
        queueTitle="Complete Chapter Audio"
        onQueue={vi.fn()}
        onStopAll={vi.fn()}
      />
    );

    expect(screen.queryByTestId('progress-bar-segments')).toBeNull();
    expect(screen.getByTitle('Already processing')).toBeDisabled();
    expect(screen.queryByTestId('chapter-header-segment-progress-bar')).toBeNull();
    expect(screen.getByText('Processing')).toBeInTheDocument();

    rerender(
      <TestHeaderWrapper
        chapter={mockChapter as any}
        title={mockChapter.title}
        setTitle={vi.fn()}
        saving={false}
        hasUnsavedChanges={false}
        onBack={vi.fn()}
        selectedVoice=""
        onVoiceChange={vi.fn()}
        availableVoices={[]}
        submitting={false}
        queueLocked={false}
        queuePending={false}
        job={undefined}
        generatingJob={{ id: 'job-seg', engine: 'mixed', status: 'running', progress: 0.1, started_at: Date.now() / 1000, eta_seconds: 9, active_segment_id: 'seg-2', active_segment_progress: 0.1, hasSegmentSupport: true } as any}
        generatingSegmentIdsCount={1}
        queueLabel="Complete"
        queueTitle="Complete Chapter Audio"
        onQueue={vi.fn()}
        onStopAll={vi.fn()}
      />
    );

    // Under segment-scoped composite keys, changing the active segment ID cleanly remounts the bar,
    // resetting the progress memory floor so it displays the actual progress of the new active segment (10%).
    expect(screen.getByText('10%')).toBeInTheDocument();
    // Bar is still active (not "Queued" or "Preparing")
    expect(screen.getByTitle('Already processing')).toBeDisabled();
  });

  it('does not use active render-block progress for the segment-only Chapter Header bar', () => {
    const onSegmentDisplayProgress = vi.fn();

    render(
      <TestHeaderWrapper
        chapter={mockChapter as any}
        title={mockChapter.title}
        setTitle={vi.fn()}
        saving={false}
        hasUnsavedChanges={false}
        onBack={vi.fn()}
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
          active_render_batch_progress: 0.25,
          render_group_count: 1,
          hasSegmentSupport: true,
        } as any}
        generatingSegmentIdsCount={2}
        queueLabel="Complete"
        queueTitle="Complete Chapter Audio"
        onQueue={vi.fn()}
        onStopAll={vi.fn()}
        onSegmentDisplayProgress={onSegmentDisplayProgress}
      />
    );

    expect(screen.queryByTestId('chapter-header-segment-progress-bar')).toBeNull();
    expect(onSegmentDisplayProgress).not.toHaveBeenCalled();
  });

  it('exposes a copy debug state button when a handler is provided', () => {
    const onCopyDebugState = vi.fn();

    render(
      <TestHeaderWrapper
        chapter={mockChapter as any}
        title={mockChapter.title}
        setTitle={vi.fn()}
        saving={false}
        hasUnsavedChanges={false}
        onBack={vi.fn()}
        selectedVoice=""
        onVoiceChange={vi.fn()}
        availableVoices={[]}
        submitting={false}
        queueLocked={false}
        queuePending={false}
        queueLabel="Queue"
        queueTitle="Queue Chapter"
        onQueue={vi.fn()}
        onStopAll={vi.fn()}
        onCopyDebugState={onCopyDebugState}
        generatingSegmentIdsCount={0}
      />
    );

    fireEvent.click(screen.getByTitle('Copy debug state'));
    expect(onCopyDebugState).toHaveBeenCalledTimes(1);
  });

  it('computes segmentProgressBarSelection correctly under various states', () => {
    let capturedStatus: any = null;
    const TestComponent = ({ job, generatingJob }: any) => {
      capturedStatus = useChapterStatus(mockChapter as any, job, generatingJob, false, 0, false);
      return null;
    };

    // 1. No live job
    const { rerender } = render(<TestComponent job={undefined} generatingJob={undefined} />);
    expect(capturedStatus.segmentProgressBarSelection).toEqual({
      dataTestId: "chapter-header-segment-progress-bar",
      barMounted: false,
      selectedJobId: null,
      selectedJobStatus: null,
      selectedJobProgress: null,
      selectedActiveSegmentId: null,
      selectedActiveSegmentProgress: null,
      selectedEtaSeconds: null,
      selectedEtaBasis: null,
      selectedStartedAt: null,
      selectedUpdatedAt: null,
      liveSegmentProgressValue: 0,
      liveSegmentProgressIsRenderBlock: false,
      activeRenderBatchId: null,
      activeRenderBatchProgress: null,
      renderGroupCount: null,
      valueSource: 'no_live_job',
      progressSource: 'no_live_job',
      selectedEtaSource: 'none',
      selectedUpdatedAtSource: 'none',
      evidenceWeightFraction: 0,
      isSegmentStartAtZero: false
    });

    // 2. Terminal complete job without segment provenance
    const doneJob = {
      id: 'job-done',
      status: 'done',
      progress: 1,
      finished_at: (Date.now() / 1000) - 120
    };
    rerender(<TestComponent job={doneJob as any} generatingJob={doneJob as any} />);
    expect(capturedStatus.segmentProgressBarSelection.valueSource).toBe('no_live_job');
    expect(capturedStatus.segmentProgressBarSelection.liveSegmentProgressValue).toBe(0);

    // 3. Render block job without active segment progress
    const renderBlockJob = {
      id: 'job-render',
      status: 'running',
      progress: 0.5,
      active_render_batch_id: 'batch-1',
      active_render_batch_progress: 0.6,
      render_group_count: 5,
      hasSegmentSupport: true,
    };
    rerender(<TestComponent job={renderBlockJob as any} generatingJob={renderBlockJob as any} />);
    expect(capturedStatus.segmentProgressBarSelection.valueSource).toBe('no_live_job');
    expect(capturedStatus.segmentProgressBarSelection.activeRenderBatchId).toBeNull();
    expect(capturedStatus.segmentProgressBarSelection.activeRenderBatchProgress).toBeNull();
    expect(capturedStatus.segmentProgressBarSelection.renderGroupCount).toBeNull();

    // 4. Active segment progress
    const activeSegJob = {
      id: 'job-seg',
      status: 'running',
      progress: 0.3,
      active_segment_id: 'seg-123',
      active_segment_progress: 0.45,
      hasSegmentSupport: true,
    };
    rerender(<TestComponent job={activeSegJob as any} generatingJob={activeSegJob as any} />);
    expect(capturedStatus.segmentProgressBarSelection.valueSource).toBe('active_segment_progress');
    expect(capturedStatus.segmentProgressBarSelection.selectedActiveSegmentId).toBe('seg-123');
    expect(capturedStatus.segmentProgressBarSelection.selectedActiveSegmentProgress).toBe(0.45);

    // 5. Job progress is not a segment progress fallback
    const jobProgJob = {
      id: 'job-fallback',
      status: 'running',
      progress: 0.77
    };
    rerender(<TestComponent job={jobProgJob as any} generatingJob={jobProgJob as any} />);
    expect(capturedStatus.segmentProgressBarSelection.valueSource).toBe('no_live_job');
    expect(capturedStatus.segmentProgressBarSelection.selectedJobProgress).toBeNull();

    // 6. Active segment progress should win when both render-group and active-segment fields exist
    const mixedJob = {
      id: 'job-mixed',
      status: 'running',
      progress: 0.2,
      active_segment_id: 'seg-xyz',
      active_segment_progress: 0.85,
      active_render_batch_id: 'batch-2',
      active_render_batch_progress: 0.1,
      render_group_count: 3,
      hasSegmentSupport: true,
    };
    rerender(<TestComponent job={mixedJob as any} generatingJob={mixedJob as any} />);
    expect(capturedStatus.segmentProgressBarSelection.valueSource).toBe('active_segment_progress');
    expect(capturedStatus.segmentProgressBarSelection.progressSource).toBe('active_segment_progress');
    expect(capturedStatus.segmentProgressBarSelection.liveSegmentProgressIsRenderBlock).toBe(false);
    expect(capturedStatus.liveSegmentProgressValue).toBe(0.85);
  });
  it('proves active_segment_progress wins over stale render-batch fields during a segment handoff', () => {
    let capturedStatus: any = null;
    const TestComponent = ({ job, generatingJob }: any) => {
      capturedStatus = useChapterStatus(mockChapter as any, job, generatingJob, false, 0, false);
      return null;
    };

    const mixedJob = {
      id: 'job-mixed-priority',
      status: 'running',
      progress: 0.44,
      active_segment_id: 'seg-2',
      active_segment_progress: 0,
      active_render_batch_id: 'batch-2',
      active_render_batch_progress: 1,
      render_group_count: 2,
      completed_render_groups: 1,
      hasSegmentSupport: true,
    };

    render(<TestComponent job={mixedJob as any} generatingJob={mixedJob as any} />);
    expect(capturedStatus.segmentProgressBarSelection.liveSegmentProgressIsRenderBlock).toBe(false);
    expect(capturedStatus.segmentProgressBarSelection.valueSource).toBe('active_segment_progress');
    expect(capturedStatus.segmentProgressBarSelection.progressSource).toBe('active_segment_progress');
    expect(capturedStatus.liveSegmentProgressValue).toBe(0);
  });

  it('proves that the progress value/grouping stays known-good while etaSeconds/etaBasis/updatedAt come from active_segment_eta_* when active_segment_id is present', () => {
    let capturedStatus: any = null;
    const TestComponent = ({ job, generatingJob }: any) => {
      capturedStatus = useChapterStatus(mockChapter as any, job, generatingJob, false, 0, false);
      return null;
    };

    const job = {
      id: 'job-eta-test',
      status: 'running',
      progress: 0.22,
      active_segment_id: 'seg-123',
      active_segment_progress: 0.45,
      eta_seconds: 125,
      eta_basis: 'remaining_from_update',
      updated_at: 1000,
      active_segment_eta_seconds: 15,
      active_segment_eta_basis: 'segment_remaining',
      active_segment_updated_at: 1050,
      hasSegmentSupport: true,
    };

    render(<TestComponent job={job as any} generatingJob={job as any} />);

    expect(capturedStatus.liveSegmentProgressValue).toBe(0.45);
    expect(capturedStatus.segmentProgressBarSelection.liveSegmentProgressIsRenderBlock).toBe(false);

    expect(capturedStatus.segmentProgressBarSelection.selectedEtaSeconds).toBe(15);
    expect(capturedStatus.segmentProgressBarSelection.selectedEtaBasis).toBe('segment_remaining');
    expect(capturedStatus.segmentProgressBarSelection.selectedEtaSource).toBe('active_segment_eta_seconds');
    expect(capturedStatus.segmentProgressBarSelection.selectedUpdatedAt).toBe(1050);
    expect(capturedStatus.segmentProgressBarSelection.selectedUpdatedAtSource).toBe('active_segment_updated_at');
  });

  it('proves that if active_segment_id is present but segment-local ETA is absent, it does not fall back to chapter ETA', () => {
    let capturedStatus: any = null;
    const TestComponent = ({ job, generatingJob }: any) => {
      capturedStatus = useChapterStatus(mockChapter as any, job, generatingJob, false, 0, false);
      return null;
    };

    const job = {
      id: 'job-eta-test-absent',
      status: 'running',
      progress: 0.22,
      active_segment_id: 'seg-123',
      active_segment_progress: 0.45,
      eta_seconds: 125,
      eta_basis: 'remaining_from_update',
      hasSegmentSupport: true,
    };

    render(<TestComponent job={job as any} generatingJob={job as any} />);

    expect(capturedStatus.segmentProgressBarSelection.selectedEtaSeconds).toBeNull();
    expect(capturedStatus.segmentProgressBarSelection.selectedEtaBasis).toBeNull();
  });

  it('proves evidenceWeightFraction is derived from block chars / max chars and clamped between 0 and 1 (with progress = 1)', () => {
    let capturedStatus: any = null;
    const TestComponent = ({ activeRenderBatchWeight }: { activeRenderBatchWeight?: number | null }) => {
      const activeSegmentJob = React.useMemo(() => ({
        id: 'job-active-segment-confidence',
        status: 'running' as const,
        progress: 1,
        active_segment_id: 'seg-1',
        active_segment_progress: 1,
        hasSegmentSupport: true,
      }), []);
      capturedStatus = useChapterStatus(
        mockChapter as any,
        undefined,
        activeSegmentJob as any,
        false,
        0,
        false,
        null,
        activeRenderBatchWeight
      );
      return null;
    };

    // Case 1: activeRenderBatchWeight is undefined or null (should default to 1)
    const { rerender } = render(<TestComponent activeRenderBatchWeight={null} />);
    expect(capturedStatus.segmentProgressBarSelection.evidenceWeightFraction).toBe(1);

    // Case 2: activeRenderBatchWeight = 400 (400 / 500 = 0.8)
    rerender(<TestComponent activeRenderBatchWeight={400} />);
    expect(capturedStatus.segmentProgressBarSelection.evidenceWeightFraction).toBe(0.8);

    // Case 3: activeRenderBatchWeight = 600 (should clamp to 1)
    rerender(<TestComponent activeRenderBatchWeight={600} />);
    expect(capturedStatus.segmentProgressBarSelection.evidenceWeightFraction).toBe(1.0);

    // Case 4: activeRenderBatchWeight = 0 (should default/clamp to 1)
    rerender(<TestComponent activeRenderBatchWeight={0} />);
    expect(capturedStatus.segmentProgressBarSelection.evidenceWeightFraction).toBe(1.0);
  });

  it('proves evidenceWeightFraction decreases as progress decreases for the same block size', () => {
    let capturedStatus: any = null;
    const TestComponent = ({ progress, activeRenderBatchWeight }: { progress: number, activeRenderBatchWeight: number }) => {
      const mockJob = React.useMemo(() => ({
        id: 'job-confidence-progress-test',
        status: 'running' as const,
        progress: progress,
        active_segment_id: 'seg-1',
        active_segment_progress: progress,
        hasSegmentSupport: true,
      }), [progress]);
      capturedStatus = useChapterStatus(
        mockChapter as any,
        undefined,
        mockJob as any,
        false,
        1,
        false,
        null,
        activeRenderBatchWeight
      );
      return null;
    };

    // Case 1: activeRenderBatchWeight = 400 (coverage = 0.8), progress = 0.5 => weight = 0.8 * 0.5 = 0.4
    const { rerender } = render(<TestComponent progress={0.5} activeRenderBatchWeight={400} />);
    expect(capturedStatus.segmentProgressBarSelection.evidenceWeightFraction).toBeCloseTo(0.4);

    // Case 2: progress = 0.25 => weight = 0.8 * 0.25 = 0.2
    rerender(<TestComponent progress={0.25} activeRenderBatchWeight={400} />);
    expect(capturedStatus.segmentProgressBarSelection.evidenceWeightFraction).toBeCloseTo(0.2);
  });

  it('proves the chapter render bar receives the same confidence value as the segment bar when they share the same active block', () => {
    let capturedStatus: any = null;
    const TestComponent = ({ job, generatingJob, activeRenderBatchWeight }: any) => {
      const memoJob = React.useMemo(() => job, [job]);
      const memoGeneratingJob = React.useMemo(() => generatingJob, [generatingJob]);
      capturedStatus = useChapterStatus(
        mockChapter as any,
        memoJob,
        memoGeneratingJob,
        false,
        0,
        false,
        null,
        activeRenderBatchWeight
      );
      return null;
    };

    const activeJob = {
      id: 'job-shared-test',
      status: 'running' as const,
      progress: 0.5,
      active_segment_id: 'seg-1',
      active_segment_progress: 0.5,
      hasSegmentSupport: true,
    };

    // Render as a segment progress bar (generatingJob is activeJob)
    const { rerender } = render(
      <TestComponent
        job={undefined}
        generatingJob={activeJob as any}
        activeRenderBatchWeight={400}
      />
    );
    const segmentConfidence = capturedStatus.segmentProgressBarSelection.evidenceWeightFraction;
    expect(segmentConfidence).toBeCloseTo(0.4); // 0.8 * 0.5 = 0.4

    // This value belongs only to the active segment contract; chapter progress is not a fallback.
    expect(segmentConfidence).toBe(0.4);
  });

  it('proves evidenceWeightFraction is 1.0 for segment_start at 0.0 progress', () => {
    let capturedStatus: any = null;
    const TestComponent = () => {
      const mockJob = React.useMemo(() => ({
        id: 'job-seg-start',
        status: 'running' as const,
        progress: 0.0,
        active_segment_id: 'seg-1',
        active_segment_progress: 0.0,
        reason_code: 'segment_start',
        hasSegmentSupport: true,
      }), []);
      capturedStatus = useChapterStatus(
        mockChapter as any,
        undefined,
        mockJob as any,
        false,
        1,
        false,
        null,
        400
      );
      return null;
    };

    render(<TestComponent />);
    expect(capturedStatus.segmentProgressBarSelection.evidenceWeightFraction).toBe(1.0);
  });

  it('proves evidenceWeightFraction is 1.0 for START_SYNTHESIS at 0.0 progress', () => {
    let capturedStatus: any = null;
    const TestComponent = () => {
      const mockJob = React.useMemo(() => ({
        id: 'job-synth-start',
        status: 'running' as const,
        progress: 0.0,
        active_segment_id: 'seg-1',
        active_segment_progress: 0.0,
        reason_code: 'START_SYNTHESIS',
        hasSegmentSupport: true,
      }), []);
      capturedStatus = useChapterStatus(
        mockChapter as any,
        undefined,
        mockJob as any,
        false,
        1,
        false,
        null,
        400
      );
      return null;
    };

    render(<TestComponent />);
    expect(capturedStatus.segmentProgressBarSelection.evidenceWeightFraction).toBe(1.0);
  });

  it('promotes segment_start @ 0% to processing state for presentation in ChapterScriptToolbar', () => {
    const mockJob = {
      id: 'job-seg-start-test',
      status: 'preparing' as const,
      progress: 0.0,
      active_segment_id: 'seg-1',
      active_segment_progress: 0.0,
      reason_code: 'segment_start',
      hasSegmentSupport: true,
    };

    render(
      <TestHeaderWrapper
        chapter={mockChapter as any}
        title={mockChapter.title}
        setTitle={vi.fn()}
        saving={false}
        hasUnsavedChanges={false}
        onBack={vi.fn()}
        selectedVoice=""
        onVoiceChange={vi.fn()}
        availableVoices={[]}
        submitting={false}
        queueLocked={false}
        queuePending={false}
        job={undefined}
        generatingJob={mockJob as any}
        generatingSegmentIdsCount={1}
        queueLabel="Complete"
        queueTitle="Complete Chapter Audio"
        onQueue={vi.fn()}
        onStopAll={vi.fn()}
      />
    );

    // The status badge inside the progress bar should show 'Processing' (or 'Processing' text is in document)
    // while the underlying store status is 'preparing'
    expect(screen.getByText('Processing')).toBeInTheDocument();
    expect(screen.queryByText('Preparing')).toBeNull();
  });

  it('keeps non-segment-start preparing status as preparing in ChapterScriptToolbar', () => {
    const mockJob = {
      id: 'job-prep-only-test',
      status: 'preparing' as const,
      progress: 0.0,
      active_segment_id: 'seg-1',
      active_segment_progress: 0.0,
      reason_code: 'some_other_reason',
      hasSegmentSupport: true,
    };

    render(
      <TestHeaderWrapper
        chapter={mockChapter as any}
        title={mockChapter.title}
        setTitle={vi.fn()}
        saving={false}
        hasUnsavedChanges={false}
        onBack={vi.fn()}
        selectedVoice=""
        onVoiceChange={vi.fn()}
        availableVoices={[]}
        submitting={false}
        queueLocked={false}
        queuePending={false}
        job={undefined}
        generatingJob={mockJob as any}
        generatingSegmentIdsCount={1}
        queueLabel="Complete"
        queueTitle="Complete Chapter Audio"
        onQueue={vi.fn()}
        onStopAll={vi.fn()}
      />
    );

    expect(screen.getByText('Preparing')).toBeInTheDocument();
    expect(screen.queryByText('Processing')).toBeNull();
  });

  it('proves the segment bar still uses deriveActiveBatchProgress only when there is no active segment', () => {
    let capturedStatus: any = null;
    const TestComponent = ({ generatingJob }: any) => {
      capturedStatus = useChapterStatus(mockChapter as any, undefined, generatingJob, false, 0, false);
      return null;
    };

    // Case 1: Active segment is present, should bypass deriveActiveBatchProgress
    const jobWithSegment = {
      id: 'job-with-seg',
      status: 'running',
      progress: 0.2,
      active_segment_id: 'seg-1',
      active_segment_progress: 0.35,
      render_group_count: 5,
      hasSegmentSupport: true,
    };
    const { rerender } = render(<TestComponent generatingJob={jobWithSegment as any} />);
    expect(capturedStatus.liveSegmentProgressValue).toBe(0.35);

    // Case 2: No active segment is present, so render batch progress must not feed the Segment Progress bar.
    const jobNoSegment = {
      id: 'job-no-seg',
      status: 'running',
      progress: 0.2,
      render_group_count: 5,
      completed_render_groups: 1,
      total_render_weight: 500,
      completed_render_weight: 100,
      active_render_group_weight: 100,
      hasSegmentSupport: true,
    };
    rerender(<TestComponent generatingJob={jobNoSegment as any} />);
    expect(capturedStatus.segmentProgressBarSelection.valueSource).toBe('no_live_job');
    expect(capturedStatus.segmentProgressBarSelection.barMounted).toBe(false);
  });

  it('regression: proves the segment bar progress remains stable across multiple renders/ticks for the active segment path', () => {
    vi.useFakeTimers();
    let capturedStatus1: any = null;
    let capturedStatus2: any = null;

    const mockJob = {
      id: 'job-stability-test',
      status: 'running',
      progress: 0.2,
      active_segment_id: 'seg-1',
      active_segment_progress: 0.35,
      render_group_count: 5,
      hasSegmentSupport: true,
    };

    // First render
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
        generatingJob={mockJob as any}
        generatingSegmentIdsCount={1}
        queueLabel="Complete"
        queueTitle="Complete Chapter Audio"
        onQueue={vi.fn()}
        onStopAll={vi.fn()}
      />
    );

    const firstVal = screen.getByTestId('chapter-header-segment-progress-bar').textContent;

    // Simulate clock advancing and rerender
    act(() => {
      vi.advanceTimersByTime(1000);
    });

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
        generatingJob={mockJob as any}
        generatingSegmentIdsCount={1}
        queueLabel="Complete"
        queueTitle="Complete Chapter Audio"
        onQueue={vi.fn()}
        onStopAll={vi.fn()}
      />
    );

    const secondVal = screen.getByTestId('chapter-header-segment-progress-bar').textContent;
    expect(firstVal).toBe(secondVal); // The progress value passed to PredictiveProgressBar must remain identical/stable
    vi.useRealTimers();
  });

  it('asserts that the segment progress bar uses pure segment ETA (active_segment_eta_seconds) and excludes chapter overhead', () => {
    let capturedStatus: any = null;
    const TestComponent = ({ generatingJob }: any) => {
      const status = useChapterStatus(mockChapter as any, undefined, generatingJob, false, 0, false);
      React.useEffect(() => {
        capturedStatus = status;
      });
      return null;
    };


    const jobWithPureSegmentEta = {
      id: 'job-pure-segment-eta',
      status: 'running',
      progress: 0.5,
      active_segment_id: 'seg-1',
      active_segment_progress: 0.5,
      eta_seconds: 120, // Chapter-level ETA containing group overheads
      active_segment_eta_seconds: 18, // Pure segment ETA based on segment characters/CPS only
      active_segment_eta_basis: 'segment_remaining',
      hasSegmentSupport: true,
    };

    render(<TestComponent generatingJob={jobWithPureSegmentEta as any} />);

    // The segment progress bar MUST use the active_segment_eta_seconds (18) and NOT the chapter-level eta_seconds (120)
    expect(capturedStatus.segmentProgressBarSelection.selectedEtaSeconds).toBe(18);
    expect(capturedStatus.segmentProgressBarSelection.selectedEtaSeconds).not.toBe(120);
    expect(capturedStatus.segmentProgressBarSelection.selectedEtaBasis).toBe('segment_remaining');
  });

  it('ChapterHeader: uses canonical confidence from the job/event path', () => {
    let capturedStatus: any = null;
    const TestComponent = ({ generatingJob }: any) => {
      capturedStatus = useChapterStatus(mockChapter as any, undefined, generatingJob, false, 0, false);
      return null;
    };

    const jobWithCanonicalConfidence = {
      id: 'job-canonical-conf',
      status: 'running',
      progress: 0.5,
      active_segment_id: 'seg-1',
      active_segment_progress: 0.5,
      confidence: 0.88,
      hasSegmentSupport: true,
    };

    render(<TestComponent generatingJob={jobWithCanonicalConfidence as any} />);

    expect(capturedStatus.segmentProgressBarSelection.evidenceWeightFraction).toBe(0.88);
  });
});
