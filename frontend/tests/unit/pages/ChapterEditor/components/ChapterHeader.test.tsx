import { render, screen, fireEvent } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { ChapterHeader } from '@/pages/ChapterEditor/components/ChapterHeader';

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
      <ChapterHeader
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
      <ChapterHeader
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
      <ChapterHeader
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
      <ChapterHeader
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
    expect(screen.getByText('40%')).toBeInTheDocument();

    rerender(
      <ChapterHeader
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
        generatingJob={{ id: 'job-seg', engine: 'mixed', status: 'running', progress: 0.1, started_at: Date.now() / 1000, eta_seconds: 9, active_segment_id: 'seg-2', active_segment_progress: 0.1 } as any}
        generatingSegmentIdsCount={1}
        queueLabel="Complete"
        queueTitle="Complete Chapter Audio"
        onQueue={vi.fn()}
        onStopAll={vi.fn()}
      />
    );

    expect(screen.getByText('10%')).toBeInTheDocument();
  });

  it('uses active render-block progress for grouped chapter renders', () => {
    const onSegmentDisplayProgress = vi.fn();

    render(
      <ChapterHeader
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
          active_segment_id: 'seg-1',
          active_segment_progress: 1,
          active_render_batch_progress: 0.25,
          render_group_count: 1,
        } as any}
        generatingSegmentIdsCount={2}
        queueLabel="Complete"
        queueTitle="Complete Chapter Audio"
        onQueue={vi.fn()}
        onStopAll={vi.fn()}
        onSegmentDisplayProgress={onSegmentDisplayProgress}
      />
    );

    expect(screen.getByText('25%')).toBeInTheDocument();
    expect(onSegmentDisplayProgress).toHaveBeenCalledWith(0.25);
  });
});
