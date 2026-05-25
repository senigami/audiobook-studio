import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock API
vi.mock('@/api', () => ({
  api: {
    fetchChapters: vi.fn(),
    fetchSegments: vi.fn(),
    fetchCharacters: vi.fn(),
    updateChapter: vi.fn(),
    generateSegments: vi.fn(),
    updateSegmentsBulk: vi.fn(),
    addProcessingQueue: vi.fn(),
    cancelChapterGeneration: vi.fn(),
    updateCharacter: vi.fn(),
    bakeChapter: vi.fn(),
    exportChapterAudio: vi.fn(),
    fetchScriptView: vi.fn(),
    saveScriptAssignments: vi.fn(),
    compactScriptView: vi.fn(),
    previewSourceTextResync: vi.fn(),
  },
}));

// Mock hooks
vi.mock('@/hooks/useChapterAnalysis', () => ({
  useChapterAnalysis: () => ({
    analysis: null,
    setAnalysis: vi.fn(),
    analyzing: false,
    loadingVoiceChunks: false,
    ensureVoiceChunks: vi.fn(),
    runAnalysis: vi.fn(),
  }),
}));

vi.mock('@/hooks/useChapterPlayback', () => ({
  useChapterPlayback: () => ({
    playingSegmentId: null,
    playingSegmentIds: new Set(),
    playSegment: vi.fn(),
    stopPlayback: vi.fn(),
    togglePause: vi.fn(),
    isPlaying: false,
    isPaused: false,
  }),
}));

import { stripMotionProps } from '@tests/helpers/chapterEditorFixtures';
// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...stripMotionProps(props)}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ChapterEditor } from '@/pages/ChapterEditor/ChapterEditorPage';
import { api } from '@/api';
import { useJobs } from '@/hooks/useJobs';
import {
  publishStudioSocketMessage,
  resetStudioSocketBusForTests,
  setStudioSocketConnected,
} from '@/store/studioSocketBus';
import { 
  mockChapterId, 
  mockProjectId, 
  mockChapter, 
  mockSegments,
  mockScriptView
} from '@tests/helpers/chapterEditorFixtures';

describe('ChapterEditor - Core Orchestration', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    resetStudioSocketBusForTests();
    setStudioSocketConnected(true);
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (api.fetchChapters as any).mockResolvedValue([mockChapter]);
    (api.fetchSegments as any).mockResolvedValue(mockSegments);
    (api.fetchCharacters as any).mockResolvedValue([]);
    (api.fetchScriptView as any).mockResolvedValue(mockScriptView);
  });

  afterEach(() => {
    vi.useRealTimers();
    consoleErrorSpy.mockRestore();
  });

  it('renders loading state then editor', async () => {
    render(
      <ChapterEditor 
        chapterId={mockChapterId} 
        projectId={mockProjectId} 
        speakerProfiles={[]} 
        speakers={[]} 
        onBack={vi.fn()} 
      />
    );
    expect(screen.getByText('Loading editor...')).toBeInTheDocument();
    
    await waitFor(() => {
      expect(screen.queryByText('Loading editor...')).not.toBeInTheDocument();
    });
    
    expect(screen.getByDisplayValue('Test Chapter')).toBeInTheDocument();
  });

  it('switches between tabs correctly', async () => {
    render(
      <ChapterEditor 
        chapterId={mockChapterId} 
        projectId={mockProjectId} 
        speakerProfiles={[]} 
        speakers={[]} 
        onBack={vi.fn()} 
      />
    );

    await waitFor(() => screen.findByDisplayValue('Test Chapter'));
    
    fireEvent.click(screen.getByText('Source Text'));
    expect(await screen.findByText('Analysis')).toBeInTheDocument();

    expect(screen.queryByText('Production')).not.toBeInTheDocument();
  });

  it('handles title changes and auto-save', async () => {
    (api.updateChapter as any).mockResolvedValue({ chapter: { ...mockChapter, title: 'Updated Title' } });
    
    render(
      <ChapterEditor 
        chapterId={mockChapterId} 
        projectId={mockProjectId} 
        speakerProfiles={[]} 
        speakers={[]} 
        onBack={vi.fn()} 
      />
    );

    await waitFor(() => screen.findByDisplayValue('Test Chapter'));
    
    vi.useFakeTimers();
    const titleInput = screen.getByDisplayValue('Test Chapter');
    
    await act(async () => {
      fireEvent.change(titleInput, { target: { value: 'Updated Title' } });
    });

    // Fast-forward timers for auto-save
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(api.updateChapter).toHaveBeenCalledWith(mockChapterId, expect.objectContaining({
      title: 'Updated Title'
    }));
  });

  it('handles tab switching reseting text mode', async () => {
    render(
      <ChapterEditor
        chapterId={mockChapterId}
        projectId={mockProjectId}
        speakerProfiles={[]}
        speakers={[]}
        onBack={vi.fn()}
      />
    );

    await waitFor(() => screen.findByDisplayValue('Test Chapter'));
    fireEvent.click(screen.getByText('Source Text'));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Source Text' }));
    fireEvent.click(screen.getByText('Continue to Edit'));

    expect(screen.getByPlaceholderText(/Start typing your chapter text/i)).toBeInTheDocument();

    fireEvent.click(screen.getByText('Script'));
    fireEvent.click(screen.getByText('Source Text'));

    expect(screen.queryByPlaceholderText(/Start typing your chapter text/i)).not.toBeInTheDocument();
  });

  it('switches active highlighting and progress to the second segment/render batch when active_segment_id updates', async () => {
    const { Job } = await import('@/types');
    const twoSegmentScriptView = {
      chapter_id: mockChapterId,
      base_revision_id: 'rev-1',
      paragraphs: [
        { id: 'para-1', span_ids: ['seg-1', 'seg-2'] }
      ],
      spans: [
        {
          id: 'seg-1',
          order_index: 0,
          text: 'Sentence one.',
          sanitized_text: 'Sentence one.',
          character_id: null,
          speaker_profile_name: null,
          status: 'draft',
          audio_file_path: null,
          audio_generated_at: null,
          char_count: 13,
          sanitized_char_count: 13
        },
        {
          id: 'seg-2',
          order_index: 1,
          text: 'Sentence two.',
          sanitized_text: 'Sentence two.',
          character_id: null,
          speaker_profile_name: null,
          status: 'draft',
          audio_file_path: null,
          audio_generated_at: null,
          char_count: 13,
          sanitized_char_count: 13
        }
      ],
      render_batches: [
        { id: 'batch-1', span_ids: ['seg-1'], status: 'draft', estimated_work_weight: 1 },
        { id: 'batch-2', span_ids: ['seg-2'], status: 'draft', estimated_work_weight: 1 }
      ]
    };

    (api.fetchScriptView as any).mockResolvedValue(twoSegmentScriptView);

    const firstJob: any = {
      id: 'job-123',
      project_id: mockProjectId,
      chapter_id: mockChapterId,
      status: 'running',
      progress: 0.1,
      active_segment_id: 'seg-1',
      active_segment_progress: 0.45,
      classification: 'chapter'
    };

    const { rerender } = render(
      <ChapterEditor
        chapterId={mockChapterId}
        projectId={mockProjectId}
        speakerProfiles={[]}
        speakers={[]}
        job={firstJob}
        chapterJobs={[firstJob]}
      />
    );

    await waitFor(() => screen.findByDisplayValue('Test Chapter'));

    // Assert that batch-1 is rendering and Sentence one has render styling
    const span1 = screen.getByTestId('script-span-seg-1');
    const span2 = screen.getByTestId('script-span-seg-2');
    expect(span1).toHaveClass('is-book-rendering');
    expect(span2).not.toHaveClass('is-book-rendering');

    // Now update job to seg-2 and rerender
    const secondJob: any = {
      ...firstJob,
      active_segment_id: 'seg-2',
      active_segment_progress: 0.75
    };

    rerender(
      <ChapterEditor
        chapterId={mockChapterId}
        projectId={mockProjectId}
        speakerProfiles={[]}
        speakers={[]}
        job={secondJob}
        chapterJobs={[secondJob]}
      />
    );

    // Re-query spans to get the current mounted elements
    const updatedSpan1 = screen.getByTestId('script-span-seg-1');
    const updatedSpan2 = screen.getByTestId('script-span-seg-2');

    // Assert highlighting switched to batch-2 / seg-2
    expect(updatedSpan1).not.toHaveClass('is-book-rendering');
    expect(updatedSpan2).toHaveClass('is-book-rendering');
  });

  it('highlights the corresponding segment/batch span when segments.progress websocket event is received', async () => {
    const customScriptView = {
      chapter_id: mockChapterId,
      base_revision_id: 'rev-1',
      paragraphs: [
        { id: 'para-1', span_ids: ['seg-1', 'seg-2'] }
      ],
      spans: [
        {
          id: 'seg-1',
          order_index: 0,
          text: 'Sentence one.',
          sanitized_text: 'Sentence one.',
          character_id: null,
          speaker_profile_name: null,
          status: 'draft',
          audio_file_path: null,
          audio_generated_at: null,
          char_count: 13,
          sanitized_char_count: 13
        },
        {
          id: 'seg-2',
          order_index: 1,
          text: 'Sentence two.',
          sanitized_text: 'Sentence two.',
          character_id: null,
          speaker_profile_name: null,
          status: 'draft',
          audio_file_path: null,
          audio_generated_at: null,
          char_count: 13,
          sanitized_char_count: 13
        }
      ],
      render_batches: [
        { id: 'batch-1', span_ids: ['seg-1'], status: 'draft', estimated_work_weight: 1 },
        { id: 'batch-2', span_ids: ['seg-2'], status: 'draft', estimated_work_weight: 1 }
      ],
      audio_groups: [
        { id: 'g-1', span_ids: ['seg-1'], status: 'draft', audio_file_path: null, asset_url: null, order_index: 0, estimated_work_weight: 1 },
        { id: 'g-2', span_ids: ['seg-2'], status: 'draft', audio_file_path: null, asset_url: null, order_index: 1, estimated_work_weight: 1 }
      ]
    };
    (api.fetchScriptView as any).mockResolvedValue(customScriptView);

    const Wrapper = () => {
      const { jobs } = useJobs();
      const job = jobs['job-123'];
      return (
        <ChapterEditor
          chapterId={mockChapterId}
          projectId={mockProjectId}
          speakerProfiles={[]}
          speakers={[]}
          job={job}
          chapterJobs={job ? [job] : []}
        />
      );
    };

    render(<Wrapper />);

    act(() => {
      publishStudioSocketMessage({
        type: 'jobs_snapshot',
        jobs: [{
          id: 'job-123',
          project_id: mockProjectId,
          chapter_id: mockChapterId,
          status: 'done',
          progress: 1.0,
          segment_ids: ['seg-1', 'seg-2'],
          updated_at: 100,
        } as any]
      });
    });

    await waitFor(() => screen.findByDisplayValue('Test Chapter'));

    // Initially seg-2 is not rendering (job is done)
    const initialSpan2 = screen.getByTestId('script-span-seg-2');
    expect(initialSpan2.getAttribute('data-render-status')).not.toBe('rendering');

    act(() => {
      publishStudioSocketMessage({
        type: 'studio_event',
        version: 1,
        topic: 'segments.progress',
        eventKind: 'segment_progress',
        source: 'backend',
        emittedAt: 150,
        ids: { jobId: 'job-123', chapterId: mockChapterId, segmentId: 'seg-2' },
        payload: {
          status: 'running',
          progress: 0.5,
          activeSegmentProgress: 0.5,
        }
      });
    });

    await waitFor(() => {
      const span2 = screen.getByTestId('script-span-seg-2');
      expect(span2.getAttribute('data-render-status')).toBe('rendering');
    });

    const span1 = screen.getByTestId('script-span-seg-1');
    expect(span1.getAttribute('data-render-status')).not.toBe('rendering');
  });

  it('uses canonical segment progress activeSegmentProgress 0.83 for renderingBatchProgressById, not chapter progress or visual progress', async () => {
    const customScriptView = {
      chapter_id: mockChapterId,
      base_revision_id: 'rev-1',
      paragraphs: [
        { id: 'para-1', span_ids: ['seg-1', 'seg-2'] }
      ],
      spans: [
        {
          id: 'seg-1',
          order_index: 0,
          text: 'Sentence one.',
          sanitized_text: 'Sentence one.',
          character_id: null,
          speaker_profile_name: null,
          status: 'draft',
          audio_file_path: null,
          audio_generated_at: null,
          char_count: 13,
          sanitized_char_count: 13
        },
        {
          id: 'seg-2',
          order_index: 1,
          text: 'Sentence two.',
          sanitized_text: 'Sentence two.',
          character_id: null,
          speaker_profile_name: null,
          status: 'draft',
          audio_file_path: null,
          audio_generated_at: null,
          char_count: 13,
          sanitized_char_count: 13
        }
      ],
      render_batches: [
        { id: 'batch-1', span_ids: ['seg-1'], status: 'draft', estimated_work_weight: 1 },
        { id: 'batch-2', span_ids: ['seg-2'], status: 'draft', estimated_work_weight: 1 }
      ],
      audio_groups: [
        { id: 'g-1', span_ids: ['seg-1'], status: 'draft', audio_file_path: null, asset_url: null, order_index: 0, estimated_work_weight: 1 },
        { id: 'g-2', span_ids: ['seg-2'], status: 'draft', audio_file_path: null, asset_url: null, order_index: 1, estimated_work_weight: 1 }
      ]
    };
    (api.fetchScriptView as any).mockResolvedValue(customScriptView);

    const Wrapper = ({ segmentProgress = {} }) => {
      const { jobs } = useJobs();
      const job = jobs['job-123'];
      return (
        <ChapterEditor
          chapterId={mockChapterId}
          projectId={mockProjectId}
          speakerProfiles={[]}
          speakers={[]}
          job={job}
          chapterJobs={job ? [job] : []}
          segmentProgress={segmentProgress}
        />
      );
    };

    const { rerender } = render(<Wrapper segmentProgress={{}} />);

    act(() => {
      publishStudioSocketMessage({
        type: 'jobs_snapshot',
        jobs: [{
          id: 'job-123',
          project_id: mockProjectId,
          chapter_id: mockChapterId,
          status: 'running',
          progress: 0.35,
          active_segment_id: 'seg-2',
          active_segment_progress: 0.1,
          segment_ids: ['seg-1', 'seg-2'],
          updated_at: 100,
        } as any]
      });
    });

    await waitFor(() => screen.findByDisplayValue('Test Chapter'));

    // Passing segment progress 0.83 for seg-2 should override job active_segment_progress 0.1
    rerender(<Wrapper segmentProgress={{
      'seg-2': {
        job_id: 'job-123',
        chapter_id: mockChapterId,
        segment_id: 'seg-2',
        progress: 0.83
      }
    }} />);

    await waitFor(() => {
      const span2 = screen.getByTestId('script-span-seg-2');
      const litLetters = span2.querySelectorAll('.script-progress-letter.is-lit');
      expect(litLetters.length).toBe(10); // Math.floor(13 * 0.83) = 10
    });
  });

  it('includes targeted rendering diagnostics in copy debug state output', async () => {
    const customScriptView = {
      chapter_id: mockChapterId,
      base_revision_id: 'rev-1',
      paragraphs: [{ id: 'para-1', span_ids: ['seg-1'] }],
      spans: [{
        id: 'seg-1',
        order_index: 0,
        text: 'Sentence one.',
        sanitized_text: 'Sentence one.',
        character_id: null,
        speaker_profile_name: null,
        status: 'draft',
        audio_file_path: null,
        audio_generated_at: null,
        char_count: 13,
        sanitized_char_count: 13
      }],
      render_batches: [{ id: 'batch-1', span_ids: ['seg-1'], status: 'draft', estimated_work_weight: 1 }],
      audio_groups: []
    };
    (api.fetchScriptView as any).mockResolvedValue(customScriptView);

    const writeTextMock = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: writeTextMock },
      configurable: true,
      writable: true
    });

    const activeJob: any = {
      id: 'job-123',
      project_id: mockProjectId,
      chapter_id: mockChapterId,
      status: 'running',
      progress: 0.35,
      active_segment_id: 'seg-1',
      active_segment_progress: 0.77,
      classification: 'chapter'
    };

    render(
      <ChapterEditor
        chapterId={mockChapterId}
        projectId={mockProjectId}
        speakerProfiles={[]}
        speakers={[]}
        job={activeJob}
        chapterJobs={[activeJob]}
        segmentProgress={{
          'seg-1': {
            job_id: 'job-123',
            chapter_id: mockChapterId,
            segment_id: 'seg-1',
            progress: 0.83
          },
          'seg-unrelated': {
            job_id: 'job-123',
            chapter_id: mockChapterId,
            segment_id: 'seg-unrelated',
            progress: 0.5
          }
        }}
      />
    );

    await waitFor(() => screen.findByDisplayValue('Test Chapter'));

    // Trigger copy debug state
    const debugButton = screen.getByTitle('Copy debug state');
    fireEvent.click(debugButton);

    await waitFor(() => {
      expect(writeTextMock).toHaveBeenCalled();
    });

    const debugState = JSON.parse(writeTextMock.mock.calls[0][0]);
    expect(debugState.frontend.render).toMatchObject({
      chapterRenderActiveSegmentId: 'seg-1',
      activeRenderBatchId: 'batch-1',
      activeRenderBatchSpanIds: ['seg-1'],
      canonicalActiveSegmentProgress: 0.83,
      jobActiveSegmentProgress: 0.77,
      liveBarSegmentProgress: 0.77,
      renderingSourceUsed: 'segmentProgress_map'
    });

    // Check relevant segmentProgress entries contains only: active segment id, active batch span ids, and current rendering segment ids
    expect(debugState.frontend.render.segmentProgress).toHaveLength(1);
    expect(debugState.frontend.render.segmentProgress[0]).toMatchObject({
      segment_id: 'seg-1',
      progress: 0.83
    });
  });
});
