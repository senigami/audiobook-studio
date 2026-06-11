import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import React, { useEffect } from 'react';

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
    fetchChapterRenderGroups: vi.fn(),
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

vi.mock('@/components/progress/PredictiveProgressBar/PredictiveProgressBar', () => {
  return {
    PredictiveProgressBar: (props: any) => {
      return (
        <div
          data-testid="mock-predictive-progress-bar"
          data-progress={props.progress}
          data-persistencekey={props.persistenceKey}
          data-evidenceweightfraction={props.evidenceWeightFraction}
          ref={(node) => {
            if (node && props.onDisplayProgress) {
              props.onDisplayProgress(props.progress);
            }
          }}
        />
      );
    }
  };
});

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
    (api.fetchChapterRenderGroups as any).mockResolvedValue({ count: 0, groups: [] });
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
    vi.useFakeTimers({ shouldAdvanceTime: true });
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

    // During the handoff hold: seg-1 stays highlighted (outgoing bar animating to 100%).
    // This is Bug-2 correct behavior — the script text fill must complete before the
    // highlight moves to seg-2.
    const holdSpan1 = screen.getByTestId('script-span-seg-1');
    const holdSpan2 = screen.getByTestId('script-span-seg-2');
    expect(holdSpan1).toHaveClass('is-book-rendering');
    expect(holdSpan2).not.toHaveClass('is-book-rendering');

    // Advance past the 3s safety timer + 500ms hold (the progress bar mock never calls
    // onDisplayProgress(1.0) in this test environment, so the safety fallback fires the flush).
    await act(async () => {
      vi.advanceTimersByTime(3600);
    });

    // After the safety timer: seg-2 is now active
    const updatedSpan1 = screen.getByTestId('script-span-seg-1');
    const updatedSpan2 = screen.getByTestId('script-span-seg-2');
    expect(updatedSpan1).not.toHaveClass('is-book-rendering');
    expect(updatedSpan2).toHaveClass('is-book-rendering');

    vi.useRealTimers();
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

    const { rerender } = render(<Wrapper />);

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

    await waitFor(() => {
      const span2 = screen.getByTestId('script-span-seg-2');
      const litLetters = span2.querySelectorAll('.script-progress-letter.is-lit');
      expect(litLetters.length).toBe(1); // Math.floor(13 * 0.1) = 1
    });

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
          active_segment_progress: 0.83,
          segment_ids: ['seg-1', 'seg-2'],
          updated_at: 101,
        } as any]
      });
    });

    await waitFor(() => {
      const span2 = screen.getByTestId('script-span-seg-2');
      const litLetters = span2.querySelectorAll('.script-progress-letter.is-lit');
      expect(litLetters.length).toBe(10); // Math.floor(13 * 0.83) = 10
    });
  });


  it('proves the copied debug payload includes frontend.segmentProgressUpdates filtered to the current chapter/job with the required fields', async () => {
    let writtenText = '';
    const originalClipboard = { ...navigator.clipboard };
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn().mockImplementation(async (text) => {
          writtenText = text;
          return Promise.resolve();
        }),
      },
      writable: true,
      configurable: true,
    });

    const mockUpdates = [
      {
        sequence: 5,
        receivedAt: '2026-05-26T12:00:00Z',
        emittedAt: 1234560,
        topic: 'segments.progress',
        eventKind: 'segment_progress',
        jobId: 'job-123',
        chapterId: mockChapterId,
        segmentId: 'seg-1',
        activeSegmentId: 'seg-1',
        activeSegmentProgress: 0.5,
        progress: 0.5,
        etaSeconds: 10,
        etaBasis: 'remaining_from_update',
        status: 'running',
        reasonCode: 'segment_progress_tick',
        updatedAt: 1234567,
        renderedJobId: 'job-123',
      },
      {
        sequence: 6,
        receivedAt: '2026-05-26T12:01:00Z',
        emittedAt: 1234561,
        topic: 'segments.progress',
        eventKind: 'segment_progress',
        jobId: 'job-other',
        chapterId: 'chap-other',
        segmentId: 'seg-2',
        activeSegmentId: 'seg-2',
        activeSegmentProgress: 0.2,
        progress: 0.2,
        etaSeconds: 15,
        etaBasis: 'remaining_from_update',
        status: 'running',
        reasonCode: 'segment_progress_tick',
        updatedAt: 1234568,
        renderedJobId: 'job-other',
      }
    ];

    const activeJob: any = {
      id: 'job-123',
      project_id: mockProjectId,
      chapter_id: mockChapterId,
      status: 'running',
      progress: 0.5,
      segmentProgressUpdates: mockUpdates,
    };

    render(
      <ChapterEditor
        chapterId={mockChapterId}
        projectId={mockProjectId}
        speakerProfiles={[]}
        speakers={[]}
        job={activeJob}
        chapterJobs={[activeJob]}
      />
    );

    await waitFor(() => screen.findByDisplayValue('Test Chapter'));

    const debugBtn = screen.getByTitle('Copy debug state');
    fireEvent.click(debugBtn);

    await waitFor(() => {
      expect(navigator.clipboard.writeText).toHaveBeenCalled();
    });

    const payload = JSON.parse(writtenText);
    expect(payload.frontend.segmentProgressUpdates).toBeDefined();
    expect(Array.isArray(payload.frontend.segmentProgressUpdates)).toBe(true);
    expect(payload.frontend.segmentProgressUpdates.length).toBe(1);
    expect(payload.frontend.segmentProgressUpdates[0]).toMatchObject({
      sequence: 5,
      jobId: 'job-123',
      chapterId: mockChapterId,
      isCurrentChapter: true,
      isCurrentJob: true,
    });

    Object.defineProperty(navigator, 'clipboard', {
      value: originalClipboard,
      writable: true,
      configurable: true,
    });
  });

  it('proves the rendered progress bar receives the correct confidence value based on active batch weight and progress', async () => {
    const customScriptView = {
      chapter_id: mockChapterId,
      base_revision_id: 'rev-1',
      paragraphs: [{ id: 'para-1', span_ids: ['seg-1'] }],
      spans: [
        {
          id: 'seg-1',
          order_index: 0,
          text: 'Once upon a time.',
          sanitized_text: 'Once upon a time.',
          character_id: null,
          speaker_profile_name: null,
          status: 'draft',
          audio_file_path: null,
          audio_generated_at: null,
          char_count: 17,
          sanitized_char_count: 17
        }
      ],
      render_batches: [
        { id: 'batch-1', span_ids: ['seg-1'], status: 'draft', estimated_work_weight: 400 }
      ],
    };
    (api.fetchScriptView as any).mockResolvedValue(customScriptView);

    const activeJob: any = {
      id: 'job-123',
      project_id: mockProjectId,
      chapter_id: mockChapterId,
      status: 'running',
      progress: 0.5,
      active_segment_id: 'seg-1',
      active_segment_progress: 0.5,
      segment_ids: ['seg-1'],
    };

    render(
      <ChapterEditor
        chapterId={mockChapterId}
        projectId={mockProjectId}
        speakerProfiles={[]}
        speakers={[]}
        job={activeJob}
        chapterJobs={[activeJob]}
      />
    );

    await waitFor(() => screen.findByDisplayValue('Test Chapter'));

    // Segment visual progress must not be confidence-scaled; it should render the plugin's exact target.
    // Per doc 15 the bar no longer receives a confidence/evidenceWeightFraction prop at all.
    const progressBar = await screen.findByTestId('mock-predictive-progress-bar');
    expect(progressBar).not.toHaveAttribute('data-evidenceweightfraction');
    expect(progressBar).toHaveAttribute('data-progress', '0.5');
  });
});
