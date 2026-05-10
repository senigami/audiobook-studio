import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock API
vi.mock('../../api', () => ({
  api: {
    fetchChapters: vi.fn(),
    fetchSegments: vi.fn(),
    fetchCharacters: vi.fn(),
    fetchProductionBlocks: vi.fn(),
    updateChapter: vi.fn(),
    generateSegments: vi.fn(),
    updateSegmentsBulk: vi.fn(),
    addProcessingQueue: vi.fn(),
    cancelChapterGeneration: vi.fn(),
    updateCharacter: vi.fn(),
    bakeChapter: vi.fn(),
    updateProductionBlocks: vi.fn(),
    exportChapterAudio: vi.fn(),
    fetchScriptView: vi.fn(),
    saveScriptAssignments: vi.fn(),
    compactScriptView: vi.fn(),
    previewSourceTextResync: vi.fn(),
  },
}));

// Mock hooks
vi.mock('../../hooks/useChapterAnalysis', () => ({
  useChapterAnalysis: () => ({
    analysis: null,
    setAnalysis: vi.fn(),
    analyzing: false,
    loadingVoiceChunks: false,
    ensureVoiceChunks: vi.fn(),
    runAnalysis: vi.fn(),
  }),
}));

vi.mock('../../hooks/useChapterPlayback', () => ({
  useChapterPlayback: () => ({
    playingSegmentId: null,
    playingSegmentIds: new Set(),
    playSegment: vi.fn(),
    stopPlayback: vi.fn(),
  }),
}));

import { stripMotionProps } from './chapterEditorFixtures';
// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...stripMotionProps(props)}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ChapterEditor } from '../ChapterEditor';
import { api } from '../../api';
import { 
  mockChapterId, 
  mockProjectId, 
  mockChapter, 
  mockSpeakerProfiles, 
  mockSpeakers,
  mockSegments,
  mockProductionBlocks,
  mockRenderBatches,
  mockScriptView
} from './chapterEditorFixtures';

describe('ChapterEditor - Queueing & Generation', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (api.fetchChapters as any).mockResolvedValue([mockChapter]);
    (api.fetchSegments as any).mockResolvedValue(mockSegments);
    (api.fetchCharacters as any).mockResolvedValue([]);
    (api.fetchProductionBlocks as any).mockResolvedValue({
      chapter_id: mockChapterId,
      base_revision_id: 'rev-1',
      blocks: mockProductionBlocks,
      render_batches: mockRenderBatches
    });
    (api.fetchScriptView as any).mockResolvedValue(mockScriptView);
  });

  afterEach(() => {
    vi.useRealTimers();
    consoleErrorSpy.mockRestore();
  });

  it('handles "Add to Queue"', async () => {
    (api.addProcessingQueue as any).mockResolvedValue({ status: 'ok' });

    render(
      <ChapterEditor 
        chapterId={mockChapterId} 
        projectId={mockProjectId} 
        speakerProfiles={mockSpeakerProfiles as any} 
        speakers={mockSpeakers as any} 
        onBack={vi.fn()} 
      />
    );

    await waitFor(() => screen.findByDisplayValue('Test Chapter'));

    const queueBtn = screen.getByTitle('Queue Chapter');
    fireEvent.click(queueBtn);
    
    expect(await screen.findByText(/Keep this page open to watch progress/i)).toBeInTheDocument();
    await waitFor(() => {
      expect(api.addProcessingQueue).toHaveBeenCalled();
    });
  });

  it('resyncs after a short delay so fast jobs do not get stuck in queued state', async () => {
    (api.addProcessingQueue as any).mockResolvedValue({ status: 'ok' });

    render(
      <ChapterEditor
        chapterId={mockChapterId}
        projectId={mockProjectId}
        speakerProfiles={mockSpeakerProfiles as any}
        speakers={mockSpeakers as any}
        onBack={vi.fn()}
      />
    );

    await waitFor(() => screen.findByDisplayValue('Test Chapter'));
    vi.useFakeTimers();

    await act(async () => {
      fireEvent.click(screen.getByTitle('Queue Chapter'));
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(screen.getByText(/Keep this page open to watch progress/i)).toBeInTheDocument();

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });

    expect(api.fetchChapters).toHaveBeenCalledTimes(3);
    expect(api.addProcessingQueue).toHaveBeenCalledTimes(1);
  });

  it('warns before queuing large chapters', async () => {
    const largeChapter = { ...mockChapter, char_count: 60000 };
    (api.fetchChapters as any).mockResolvedValue([largeChapter]);

    render(
      <ChapterEditor 
        chapterId={mockChapterId} 
        projectId={mockProjectId} 
        speakerProfiles={mockSpeakerProfiles as any} 
        speakers={mockSpeakers as any} 
        onBack={vi.fn()} 
      />
    );

    await waitFor(() => screen.findByDisplayValue('Test Chapter'));

    const queueBtn = screen.getByTitle('Queue Chapter');
    fireEvent.click(queueBtn);

    expect(await screen.findByText('Large Chapter Warning')).toBeInTheDocument();
    
    fireEvent.click(screen.getByText('Yes, Queue It'));
    await waitFor(() => {
      expect(api.addProcessingQueue).toHaveBeenCalled();
    });
  });

  it('warns before requeueing a fully rendered chapter', async () => {
    const renderedChapter = {
      ...mockChapter,
      audio_status: 'done' as const,
      audio_file_path: 'chap-456.wav',
      has_wav: true,
      total_segments_count: 1,
      done_segments_count: 1
    };
    const renderedSegments = [{
      ...mockSegments[0],
      audio_status: 'done' as const,
      audio_file_path: 'seg-1.wav',
      audio_generated_at: Date.now() / 1000
    }];

    (api.fetchChapters as any).mockResolvedValue([renderedChapter]);
    (api.fetchSegments as any).mockResolvedValue(renderedSegments);

    render(
      <ChapterEditor 
        chapterId={mockChapterId} 
        projectId={mockProjectId} 
        speakerProfiles={mockSpeakerProfiles as any} 
        speakers={mockSpeakers as any} 
        onBack={vi.fn()} 
      />
    );

    await waitFor(() => screen.findByDisplayValue('Test Chapter'));

    const queueBtn = screen.getByTitle('Rebuild Chapter');
    fireEvent.click(queueBtn);

    expect(await screen.findByText('Requeue Completed Chapter')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Yes, Rebuild It'));
    await waitFor(() => {
      expect(api.addProcessingQueue).toHaveBeenCalled();
    });
  });

  it('shows processing for segment generation without entering chapter render states', async () => {
    const partialChapter = {
      ...mockChapter,
      audio_status: 'unprocessed' as const,
      audio_file_path: null,
      has_wav: false,
      has_mp3: false,
    };
    const partialSegments = [
      {
        ...mockSegments[0],
        audio_status: 'done' as const,
        audio_file_path: 'seg-1.wav',
        audio_generated_at: Date.now() / 1000,
      },
      {
        id: 'seg-2',
        chapter_id: mockChapterId,
        text_content: 'Another sentence.',
        character_id: null,
        audio_status: 'processing' as const,
        audio_file_path: null,
      },
    ];

    (api.fetchChapters as any).mockResolvedValue([partialChapter]);
    (api.fetchSegments as any).mockResolvedValue(partialSegments);

    render(
      <ChapterEditor
        chapterId={mockChapterId}
        projectId={mockProjectId}
        speakerProfiles={mockSpeakerProfiles as any}
        speakers={mockSpeakers as any}
        chapterJobs={[
          {
            id: 'job-seg-1',
            engine: 'mixed',
            chapter_file: 'chapter.txt',
            status: 'running',
            created_at: Date.now() / 1000,
            chapter_id: mockChapterId,
            safe_mode: false,
            make_mp3: false,
            progress: 0.5,
            segment_ids: ['seg-2'],
            active_segment_id: 'seg-2',
          } as any,
        ]}
        onBack={vi.fn()}
      />
    );

    await waitFor(() => screen.findByDisplayValue('Test Chapter'));

    expect(screen.getByTitle('Already processing')).toBeDisabled();
    expect(screen.getByText('Processing')).toBeInTheDocument();
  });

  it('highlights the whole active render batch in book mode', async () => {
    const renderingChapter = {
      ...mockChapter,
      audio_status: 'processing' as const,
      audio_file_path: null,
      has_wav: false,
      has_mp3: false,
    };
    const renderingSegments = [
      { id: 'seg-1', chapter_id: mockChapterId, segment_order: 0, text_content: 'One.', character_id: null, audio_status: 'unprocessed' as const, audio_file_path: null },
      { id: 'seg-2', chapter_id: mockChapterId, segment_order: 1, text_content: 'Two.', character_id: null, audio_status: 'unprocessed' as const, audio_file_path: null },
      { id: 'seg-3', chapter_id: mockChapterId, segment_order: 2, text_content: 'Three.', character_id: null, audio_status: 'unprocessed' as const, audio_file_path: null },
    ];
    const renderingScriptView = {
      chapter_id: mockChapterId,
      base_revision_id: 'rev-1',
      paragraphs: [
        { id: 'para-1', span_ids: ['seg-1'] },
        { id: 'para-2', span_ids: ['seg-2'] },
        { id: 'para-3', span_ids: ['seg-3'] },
      ],
      spans: renderingSegments.map(segment => ({
        id: segment.id,
        order_index: segment.segment_order,
        text: segment.text_content,
        sanitized_text: segment.text_content,
        character_id: null,
        speaker_profile_name: null,
        status: segment.audio_status,
        audio_file_path: null,
        audio_generated_at: null,
        char_count: segment.text_content.length,
        sanitized_char_count: segment.text_content.length,
      })),
      render_batches: [
        { id: 'batch-1', span_ids: ['seg-1', 'seg-2'], status: 'draft', estimated_work_weight: 1 },
        { id: 'batch-2', span_ids: ['seg-3'], status: 'draft', estimated_work_weight: 1 },
      ],
      audio_groups: [],
    };

    (api.fetchChapters as any).mockResolvedValue([renderingChapter]);
    (api.fetchSegments as any).mockResolvedValue(renderingSegments);
    (api.fetchScriptView as any).mockResolvedValue(renderingScriptView);

    render(
      <ChapterEditor
        chapterId={mockChapterId}
        projectId={mockProjectId}
        speakerProfiles={mockSpeakerProfiles as any}
        speakers={mockSpeakers as any}
        chapterJobs={[
          {
            id: 'job-chapter-2',
            engine: 'xtts',
            chapter_file: 'chapter.wav',
            status: 'running',
            created_at: Date.now() / 1000,
            chapter_id: mockChapterId,
            safe_mode: false,
            make_mp3: false,
            progress: 0.4,
            active_segment_id: 'seg-1',
          } as any,
        ]}
        onBack={vi.fn()}
      />
    );

    await waitFor(() => screen.findByDisplayValue('Test Chapter'));

    expect(document.querySelectorAll('.script-span.is-book-rendering').length).toBe(2);
    expect(screen.getByTestId('script-span-seg-1')).toHaveClass('is-book-rendering');
    expect(screen.getByTestId('script-span-seg-2')).toHaveClass('is-book-rendering');
    expect(screen.getByTestId('script-span-seg-3')).not.toHaveClass('is-book-rendering');
  });

  it('keeps rebuild rendering cues active even when the chapter is already marked done', async () => {
    const renderedChapter = {
      ...mockChapter,
      audio_status: 'done' as const,
      audio_file_path: 'chapter.wav',
      has_wav: true,
      has_mp3: false,
    };
    const renderedSegments = [
      { id: 'seg-1', chapter_id: mockChapterId, segment_order: 0, text_content: 'One.', character_id: null, audio_status: 'done' as const, audio_file_path: 'seg-1.wav' },
      { id: 'seg-2', chapter_id: mockChapterId, segment_order: 1, text_content: 'Two.', character_id: null, audio_status: 'done' as const, audio_file_path: 'seg-2.wav' },
      { id: 'seg-3', chapter_id: mockChapterId, segment_order: 2, text_content: 'Three.', character_id: null, audio_status: 'done' as const, audio_file_path: 'seg-3.wav' },
    ];
    const renderingScriptView = {
      chapter_id: mockChapterId,
      base_revision_id: 'rev-1',
      paragraphs: [
        { id: 'para-1', span_ids: ['seg-1'] },
        { id: 'para-2', span_ids: ['seg-2'] },
        { id: 'para-3', span_ids: ['seg-3'] },
      ],
      spans: renderedSegments.map(segment => ({
        id: segment.id,
        order_index: segment.segment_order,
        text: segment.text_content,
        sanitized_text: segment.text_content,
        character_id: null,
        speaker_profile_name: null,
        status: segment.audio_status,
        audio_file_path: segment.audio_file_path,
        audio_generated_at: Date.now() / 1000,
        char_count: segment.text_content.length,
        sanitized_char_count: segment.text_content.length,
      })),
      render_batches: [
        { id: 'batch-1', span_ids: ['seg-1', 'seg-2'], status: 'done', estimated_work_weight: 1 },
        { id: 'batch-2', span_ids: ['seg-3'], status: 'done', estimated_work_weight: 1 },
      ],
      audio_groups: [
        { id: 'group-1', span_ids: ['seg-1', 'seg-2'], status: 'rendered', audio_file_path: 'chapter-part-1.wav', asset_url: null, order_index: 0, estimated_work_weight: 1 },
        { id: 'group-2', span_ids: ['seg-3'], status: 'rendered', audio_file_path: 'chapter-part-2.wav', asset_url: null, order_index: 1, estimated_work_weight: 1 },
      ],
    };

    (api.fetchChapters as any).mockResolvedValue([renderedChapter]);
    (api.fetchSegments as any).mockResolvedValue(renderedSegments);
    (api.fetchScriptView as any).mockResolvedValue(renderingScriptView);

    render(
      <ChapterEditor
        chapterId={mockChapterId}
        projectId={mockProjectId}
        speakerProfiles={mockSpeakerProfiles as any}
        speakers={mockSpeakers as any}
        chapterJobs={[
          {
            id: 'job-chapter-rebuild',
            engine: 'xtts',
            chapter_file: 'chapter.wav',
            status: 'running',
            created_at: Date.now() / 1000,
            chapter_id: mockChapterId,
            safe_mode: false,
            make_mp3: false,
            progress: 0.4,
            active_segment_id: 'seg-1',
            active_segment_progress: 0.35,
            render_group_count: 2,
            completed_render_groups: 0,
            active_render_group_index: 0,
            total_render_weight: 3,
            completed_render_weight: 0,
            active_render_group_weight: 2,
            grouped_progress: 0.2,
            active_render_batch_id: 'batch-1',
            active_render_batch_progress: 0.35,
          } as any,
        ]}
        onBack={vi.fn()}
      />
    );

    await waitFor(() => screen.findByDisplayValue('Test Chapter'));

    expect(screen.getByTestId('script-span-seg-1')).toHaveClass('is-book-rendering');
    expect(screen.getByTestId('script-span-seg-2')).toHaveClass('is-book-rendering');
    expect(screen.getByTestId('script-span-seg-3')).not.toHaveClass('is-book-rendering');
  });

  it('does not keep finished segment jobs highlighted after the chapter completes', async () => {
    const renderedChapter = {
      ...mockChapter,
      audio_status: 'done' as const,
      audio_file_path: 'chapter.wav',
      has_wav: true,
      has_mp3: false,
    };
    const renderedSegments = [
      { id: 'seg-1', chapter_id: mockChapterId, segment_order: 0, text_content: 'One.', character_id: null, audio_status: 'done' as const, audio_file_path: 'seg-1.wav' },
      { id: 'seg-2', chapter_id: mockChapterId, segment_order: 1, text_content: 'Two.', character_id: null, audio_status: 'done' as const, audio_file_path: 'seg-2.wav' },
      { id: 'seg-3', chapter_id: mockChapterId, segment_order: 2, text_content: 'Three.', character_id: null, audio_status: 'done' as const, audio_file_path: 'seg-3.wav' },
    ];
    const renderingScriptView = {
      chapter_id: mockChapterId,
      base_revision_id: 'rev-1',
      paragraphs: [
        { id: 'para-1', span_ids: ['seg-1'] },
        { id: 'para-2', span_ids: ['seg-2'] },
        { id: 'para-3', span_ids: ['seg-3'] },
      ],
      spans: renderedSegments.map(segment => ({
        id: segment.id,
        order_index: segment.segment_order,
        text: segment.text_content,
        sanitized_text: segment.text_content,
        character_id: null,
        speaker_profile_name: null,
        status: segment.audio_status,
        audio_file_path: segment.audio_file_path,
        audio_generated_at: Date.now() / 1000,
        char_count: segment.text_content.length,
        sanitized_char_count: segment.text_content.length,
      })),
      render_batches: [
        { id: 'batch-1', span_ids: ['seg-1', 'seg-2'], status: 'done', estimated_work_weight: 1 },
        { id: 'batch-2', span_ids: ['seg-3'], status: 'done', estimated_work_weight: 1 },
      ],
      audio_groups: [
        { id: 'group-1', span_ids: ['seg-1', 'seg-2'], status: 'rendered', audio_file_path: 'chapter-part-1.wav', asset_url: null, order_index: 0, estimated_work_weight: 1 },
        { id: 'group-2', span_ids: ['seg-3'], status: 'rendered', audio_file_path: 'chapter-part-2.wav', asset_url: null, order_index: 1, estimated_work_weight: 1 },
      ],
    };

    (api.fetchChapters as any).mockResolvedValue([renderedChapter]);
    (api.fetchSegments as any).mockResolvedValue(renderedSegments);
    (api.fetchScriptView as any).mockResolvedValue(renderingScriptView);

    render(
      <ChapterEditor
        chapterId={mockChapterId}
        projectId={mockProjectId}
        speakerProfiles={mockSpeakerProfiles as any}
        speakers={mockSpeakers as any}
        chapterJobs={[
          {
            id: 'job-chapter-complete',
            engine: 'xtts',
            chapter_file: 'chapter.wav',
            status: 'done',
            created_at: Date.now() / 1000,
            finished_at: Date.now() / 1000,
            chapter_id: mockChapterId,
            safe_mode: false,
            make_mp3: false,
            progress: 1,
            segment_ids: ['seg-1', 'seg-2', 'seg-3'],
            active_segment_id: 'seg-3',
            active_segment_progress: 1,
          } as any,
        ]}
        onBack={vi.fn()}
      />
    );

    await waitFor(() => screen.findByDisplayValue('Test Chapter'));

    expect(document.querySelectorAll('.script-span.is-book-pending').length).toBe(0);
    expect(document.querySelectorAll('.script-span.is-book-queued').length).toBe(0);
    expect(document.querySelectorAll('.script-span.is-book-rendering').length).toBe(0);
  });

  it('moves the segment progress cue to the active sentence within the batch', async () => {
    const renderingChapter = {
      ...mockChapter,
      audio_status: 'processing' as const,
      audio_file_path: null,
      has_wav: false,
      has_mp3: false,
    };
    const renderingSegments = [
      { id: 'seg-1', chapter_id: mockChapterId, segment_order: 0, text_content: 'One.', character_id: null, audio_status: 'unprocessed' as const, audio_file_path: null },
      { id: 'seg-2', chapter_id: mockChapterId, segment_order: 1, text_content: 'Two.', character_id: null, audio_status: 'unprocessed' as const, audio_file_path: null },
    ];
    const renderingScriptView = {
      chapter_id: mockChapterId,
      base_revision_id: 'rev-1',
      paragraphs: [
        { id: 'para-1', span_ids: ['seg-1', 'seg-2'] },
      ],
      spans: renderingSegments.map(segment => ({
        id: segment.id,
        order_index: segment.segment_order,
        text: segment.text_content,
        sanitized_text: segment.text_content,
        character_id: null,
        speaker_profile_name: null,
        status: segment.audio_status,
        audio_file_path: null,
        audio_generated_at: null,
        char_count: segment.text_content.length,
        sanitized_char_count: segment.text_content.length,
      })),
      render_batches: [
        { id: 'batch-1', span_ids: ['seg-1', 'seg-2'], status: 'draft', estimated_work_weight: 1 },
      ],
      audio_groups: [],
    };

    (api.fetchChapters as any).mockResolvedValue([renderingChapter]);
    (api.fetchSegments as any).mockResolvedValue(renderingSegments);
    (api.fetchScriptView as any).mockResolvedValue(renderingScriptView);

    render(
      <ChapterEditor
        chapterId={mockChapterId}
        projectId={mockProjectId}
        speakerProfiles={mockSpeakerProfiles as any}
        speakers={mockSpeakers as any}
        chapterJobs={[
          {
            id: 'job-chapter-3',
            engine: 'xtts',
            chapter_file: 'chapter.wav',
            status: 'running',
            created_at: Date.now() / 1000,
            chapter_id: mockChapterId,
            safe_mode: false,
            make_mp3: false,
            progress: 0.18,
            active_segment_id: 'seg-1',
            active_segment_progress: 1,
            total_render_weight: 8,
            completed_render_weight: 0,
            active_render_group_weight: 8,
          } as any,
        ]}
        onBack={vi.fn()}
      />
    );

    await waitFor(() => screen.findByDisplayValue('Test Chapter'));

    const firstSpan = screen.getByTestId('script-span-seg-1');
    const secondSpan = screen.getByTestId('script-span-seg-2');
    const firstLetters = firstSpan.querySelectorAll('.script-progress-letter');

    expect(screen.getByTestId('script-render-group-batch-1')).toHaveClass('is-rendering');
    expect(firstSpan.querySelectorAll('.script-progress-letter.is-lit').length).toBeGreaterThan(0);
    expect(firstSpan.querySelectorAll('.script-progress-letter.is-lit').length).toBeLessThan(firstLetters.length);
    expect(firstSpan.querySelectorAll('.script-progress-letter.is-cursor')).toHaveLength(1);
    expect(secondSpan.querySelectorAll('.script-progress-letter.is-lit')).toHaveLength(0);
    expect(secondSpan.querySelectorAll('.script-progress-letter.is-cursor')).toHaveLength(0);
  });

  it('keeps chapter-level renders queued during preparing until an active segment arrives', async () => {
    const renderingChapter = {
      ...mockChapter,
      audio_status: 'queued' as const,
      audio_file_path: null,
      has_wav: false,
      has_mp3: false,
    };
    const renderingSegments = [
      { id: 'seg-1', chapter_id: mockChapterId, segment_order: 0, text_content: 'One.', character_id: null, audio_status: 'unprocessed' as const, audio_file_path: null },
      { id: 'seg-2', chapter_id: mockChapterId, segment_order: 1, text_content: 'Two.', character_id: null, audio_status: 'unprocessed' as const, audio_file_path: null },
      { id: 'seg-3', chapter_id: mockChapterId, segment_order: 2, text_content: 'Three.', character_id: null, audio_status: 'unprocessed' as const, audio_file_path: null },
    ];
    const renderingScriptView = {
      chapter_id: mockChapterId,
      base_revision_id: 'rev-1',
      paragraphs: [
        { id: 'para-1', span_ids: ['seg-1'] },
        { id: 'para-2', span_ids: ['seg-2'] },
        { id: 'para-3', span_ids: ['seg-3'] },
      ],
      spans: renderingSegments.map(segment => ({
        id: segment.id,
        order_index: segment.segment_order,
        text: segment.text_content,
        sanitized_text: segment.text_content,
        character_id: null,
        speaker_profile_name: null,
        status: segment.audio_status,
        audio_file_path: null,
        audio_generated_at: null,
        char_count: segment.text_content.length,
        sanitized_char_count: segment.text_content.length,
      })),
      render_batches: [
        { id: 'batch-1', span_ids: ['seg-1', 'seg-2', 'seg-3'], status: 'draft', estimated_work_weight: 1 },
      ],
      audio_groups: [],
    };

    (api.fetchChapters as any).mockResolvedValue([renderingChapter]);
    (api.fetchSegments as any).mockResolvedValue(renderingSegments);
    (api.fetchScriptView as any).mockResolvedValue(renderingScriptView);

    render(
      <ChapterEditor
        chapterId={mockChapterId}
        projectId={mockProjectId}
        speakerProfiles={mockSpeakerProfiles as any}
        speakers={mockSpeakers as any}
        chapterJobs={[
          {
            id: 'job-chapter-1',
            engine: 'xtts',
            chapter_file: 'chapter.wav',
            status: 'running',
            created_at: Date.now() / 1000,
          chapter_id: mockChapterId,
          safe_mode: false,
          make_mp3: false,
          progress: 0.4,
          active_segment_id: null,
        } as any,
      ]}
      onBack={vi.fn()}
    />
    );

    await waitFor(() => screen.findByDisplayValue('Test Chapter'));

    const renderingSpanText = document.querySelector('.script-span.is-book-rendering');
    const queuedSpanTexts = document.querySelectorAll('.script-span.is-book-queued');
    expect(renderingSpanText).toBeNull();
    expect(queuedSpanTexts.length).toBeGreaterThan(0);
  });

  it('ignores duplicate generate clicks while the same segments are already pending', async () => {
    (api.generateSegments as any).mockResolvedValue(undefined);

    render(
      <ChapterEditor
        chapterId={mockChapterId}
        projectId={mockProjectId}
        speakerProfiles={mockSpeakerProfiles as any}
        speakers={mockSpeakers as any}
        onBack={vi.fn()}
      />
    );

    await waitFor(() => screen.findByDisplayValue('Test Chapter'));

    fireEvent.click(screen.getByText('Performance'));
    await screen.findByText('Performance View');

    const generateBtn = screen.getByRole('button', { name: 'Generate' });
    fireEvent.click(generateBtn);
    fireEvent.click(generateBtn);

    await waitFor(() => {
      expect(api.generateSegments).toHaveBeenCalledTimes(1);
    });
  });

  it('shows a blocking message when generation is rejected', async () => {
    (api.generateSegments as any).mockRejectedValue(new Error('Enable Voxtral in Settings'));

    render(
      <ChapterEditor
        chapterId={mockChapterId}
        projectId={mockProjectId}
        speakerProfiles={mockSpeakerProfiles as any}
        speakers={mockSpeakers as any}
        onBack={vi.fn()}
      />
    );

    await waitFor(() => screen.findByDisplayValue('Test Chapter'));

    fireEvent.click(screen.getByText('Performance'));
    await screen.findByText('Performance View');

    fireEvent.click(screen.getByRole('button', { name: 'Generate' }));

    expect(await screen.findByText('Generation Blocked')).toBeInTheDocument();
  });
});
