import { describe, it, expect, vi, beforeEach } from 'vitest';

const stripMotionProps = (props: Record<string, unknown>) => {
  const {
    initial,
    animate,
    exit,
    transition,
    whileHover,
    whileTap,
    whileDrag,
    layout,
    layoutId,
    drag,
    dragConstraints,
    dragElastic,
    ...domProps
  } = props;
  void initial;
  void animate;
  void exit;
  void transition;
  void whileHover;
  void whileTap;
  void whileDrag;
  void layout;
  void layoutId;
  void drag;
  void dragConstraints;
  void dragElastic;
  return domProps;
};

// Mock API
vi.mock('../api', () => ({
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
vi.mock('../hooks/useChapterAnalysis', () => ({
  useChapterAnalysis: () => ({
    analysis: null,
    setAnalysis: vi.fn(),
    analyzing: false,
    loadingVoiceChunks: false,
    ensureVoiceChunks: vi.fn(),
    runAnalysis: vi.fn(),
  }),
}));

vi.mock('../hooks/useChapterPlayback', () => ({
  useChapterPlayback: () => ({
    playingSegmentId: null,
    playingSegmentIds: new Set(),
    playSegment: vi.fn(),
    stopPlayback: vi.fn(),
  }),
}));

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...stripMotionProps(props)}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ChapterEditor } from './ChapterEditor';
import { ChapterHeader } from './chapter/ChapterHeader';
import { api } from '../api';
import type { Character } from '../types';

describe('ChapterEditor', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  const mockProjectId = 'proj-123';
  const mockChapterId = 'chap-456';
  const mockChapter = {
    id: mockChapterId,
    project_id: mockProjectId,
    title: 'Test Chapter',
    text_content: 'Once upon a time.',
    speaker_profile_name: null,
    char_count: 50,
    word_count: 10,
    audio_status: 'unprocessed' as const,
  };

  const mockSpeakers = [
    { id: 'speaker-1', name: 'Voice 1' }
  ];

  const mockSpeakerProfiles = [
    { name: 'Profile 1', speaker_id: 'speaker-1', variant_name: 'Standard' },
    { name: 'Profile 2', speaker_id: 'speaker-1', variant_name: 'Warm' }
  ];

  const mockSegments = [
    { id: 'seg-1', chapter_id: mockChapterId, segment_order: 0, text_content: 'Once upon a time.', character_id: null, audio_status: 'unprocessed' }
  ];

  const mockProductionBlocks = [
    {
      id: 'block-1',
      order_index: 0,
      text: 'Once upon a time.',
      character_id: null,
      speaker_profile_name: null,
      status: 'draft',
      source_segment_ids: ['seg-1']
    }
  ];

  const mockRenderBatches = [
    {
      id: 'batch-1',
      block_ids: ['block-1'],
      status: 'queued',
      estimated_work_weight: 1
    }
  ];

  const mockCharacters: Character[] = [
    { id: 'char-1', project_id: mockProjectId, name: 'Char 1', color: '#ff0000', speaker_profile_name: 'Voice 1' } as any
  ];

  const mockScriptView = {
    chapter_id: mockChapterId,
    base_revision_id: 'rev-1',
    paragraphs: [
      { id: 'para-1', span_ids: ['seg-1'] }
    ],
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
      { id: 'batch-1', span_ids: ['seg-1'], status: 'draft', estimated_work_weight: 1 }
    ]
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    (api.fetchChapters as any).mockResolvedValue([mockChapter]);
    (api.fetchSegments as any).mockResolvedValue(mockSegments);
    (api.fetchCharacters as any).mockResolvedValue(mockCharacters);
    (api.fetchProductionBlocks as any).mockResolvedValue({
      chapter_id: mockChapterId,
      base_revision_id: 'rev-1',
      blocks: mockProductionBlocks,
      render_batches: mockRenderBatches
    });
    (api.fetchScriptView as any).mockResolvedValue(mockScriptView);
    (api.updateChapter as any).mockResolvedValue({ chapter: mockChapter });
    (api.updateProductionBlocks as any).mockResolvedValue({
      chapter_id: mockChapterId,
      base_revision_id: 'rev-2',
      blocks: mockProductionBlocks,
      render_batches: mockRenderBatches
    });
    (api.exportChapterAudio as any).mockResolvedValue(new Blob(['audio']));
    Object.defineProperty(window.URL, 'createObjectURL', {
      value: vi.fn(() => 'blob:mock'),
      writable: true,
      configurable: true,
    });
    Object.defineProperty(window.URL, 'revokeObjectURL', {
      value: vi.fn(),
      writable: true,
      configurable: true,
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    consoleErrorSpy.mockRestore();
  });

  it('renders loading state initially', () => {
    (api.fetchChapters as any).mockReturnValue(new Promise(() => {}));
    (api.fetchSegments as any).mockReturnValue(new Promise(() => {}));
    (api.fetchCharacters as any).mockReturnValue(new Promise(() => {}));

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
  });

  it('loads and renders chapter data', async () => {
    render(
      <ChapterEditor 
        chapterId={mockChapterId} 
        projectId={mockProjectId} 
        speakerProfiles={mockSpeakerProfiles as any} 
        speakers={mockSpeakers as any} 
        onBack={vi.fn()} 
      />
    );

    await waitFor(() => {
      expect(screen.queryByText('Loading editor...')).not.toBeInTheDocument();
    });

    expect(api.fetchChapters).toHaveBeenCalledWith(mockProjectId);
    expect(screen.getByDisplayValue('Test Chapter')).toBeInTheDocument();
  });

  it('switches between tabs', async () => {
    render(
      <ChapterEditor 
        chapterId={mockChapterId} 
        projectId={mockProjectId} 
        speakerProfiles={mockSpeakerProfiles as any} 
        speakers={mockSpeakers as any} 
        onBack={vi.fn()} 
      />
    );

    await waitFor(() => {
      expect(screen.queryByText('Loading editor...')).not.toBeInTheDocument();
    });

    // Source Text Tab (read-only until explicitly edited)
    fireEvent.click(screen.getByText('Source Text'));
    expect(await screen.findByText('Once upon a time.')).toBeInTheDocument();
    expect(screen.queryByText(/Caution: Modifying the source text here will force a complete resynchronization/i)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Source Text' }));
    expect(await screen.findByText(/Caution: Modifying the source text here will force a complete resynchronization/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText('Continue to Edit'));
    expect(await screen.findByPlaceholderText(/Start typing your chapter text here/i)).toBeInTheDocument();
    expect(await screen.findByDisplayValue('Once upon a time.')).toBeInTheDocument();

    // Production Tab
    fireEvent.click(screen.getByText('Production'));
    expect(await screen.findByText('Production Blocks')).toBeInTheDocument();
    expect(screen.getByText('Block 1')).toBeInTheDocument();

    // Performance Tab
    fireEvent.click(screen.getByText('Performance'));
    expect(await screen.findByText('Performance View')).toBeInTheDocument();

    // Preview Tab
    fireEvent.click(screen.getByText('Preview Safe Output'));
    expect(await screen.findByText('Preview Safe Output')).toBeInTheDocument();
  });

  it('saves chapter changes on title/text edit', async () => {
    render(
      <ChapterEditor 
        chapterId={mockChapterId} 
        projectId={mockProjectId} 
        speakerProfiles={mockSpeakerProfiles as any} 
        speakers={mockSpeakers as any} 
        onBack={vi.fn()} 
      />
    );

    // use real timers for initial load to avoid hanging `waitFor`
    await screen.findByDisplayValue('Test Chapter');
    
    vi.useFakeTimers();

    const titleInput = screen.getByDisplayValue('Test Chapter');
    
    await act(async () => {
      fireEvent.change(titleInput, { target: { value: 'Updated Title' } });
    });

    // Advance timers for debounce
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    // Check expectation
    expect(api.updateChapter).toHaveBeenCalledWith(mockChapterId, expect.objectContaining({
      title: 'Updated Title'
    }));
  });

  it('saves edited production blocks', async () => {
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

    fireEvent.click(screen.getByText('Production'));
    const blockEditor = await screen.findByLabelText('Production block 1 text');
    fireEvent.change(blockEditor, { target: { value: 'Updated block text.' } });
    fireEvent.click(screen.getByRole('button', { name: /save blocks/i }));

    await waitFor(() => {
      expect(api.updateProductionBlocks).toHaveBeenCalledWith(
        mockChapterId,
        expect.objectContaining({
          base_revision_id: 'rev-1',
          blocks: expect.arrayContaining([
            expect.objectContaining({
              id: 'block-1',
              text: 'Updated block text.'
            })
          ])
        })
      );
    });
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
    
    // Confirming
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
    expect(screen.getByTitle('Rebuild Chapter')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Yes, Rebuild It'));
    await waitFor(() => {
      expect(api.addProcessingQueue).toHaveBeenCalled();
    });
  });

  it('warns before requeueing when rendered output exists but some segments are no longer done', async () => {
    const renderedChapter = {
      ...mockChapter,
      audio_status: 'done' as const,
      audio_file_path: 'chap-456.wav',
      has_wav: true,
    };
    const mixedSegments = [
      {
        ...mockSegments[0],
        audio_status: 'done' as const,
        audio_file_path: 'seg-1.wav',
        audio_generated_at: Date.now() / 1000,
      },
      {
        id: 'seg-2',
        chapter_id: mockChapterId,
        text_content: 'A changed sentence.',
        character_id: null,
        audio_status: 'unprocessed' as const,
        audio_file_path: null,
      },
    ];

    (api.fetchChapters as any).mockResolvedValue([renderedChapter]);
    (api.fetchSegments as any).mockResolvedValue(mixedSegments);

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
  });

  it('shows complete instead of rebuild when segments exist but no chapter render exists yet', async () => {
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
        audio_status: 'unprocessed' as const,
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
        onBack={vi.fn()}
      />
    );

    await waitFor(() => screen.findByDisplayValue('Test Chapter'));

    expect(screen.getByTitle('Complete Chapter Audio')).toBeInTheDocument();
    expect(screen.getByText('Complete')).toBeInTheDocument();
    expect(screen.queryByTitle('Rebuild Chapter')).not.toBeInTheDocument();
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
    expect(screen.queryByText('Rendering')).not.toBeInTheDocument();
    expect(screen.queryByText('Finalizing')).not.toBeInTheDocument();
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
        job={undefined}
        generatingJob={{ id: 'job-seg', engine: 'mixed', status: 'running', progress: 0.4, started_at: Date.now() / 1000, eta_seconds: 9 } as any}
        generatingSegmentIdsCount={2}
        queueLabel="Complete"
        queueTitle="Complete Chapter Audio"
        onQueue={vi.fn()}
        onStopAll={vi.fn()}
      />
    );

    expect(screen.getByText('Processing')).toBeInTheDocument();
    expect(screen.getByTitle('Already processing')).toBeDisabled();
    expect(screen.getByText('40%')).toBeInTheDocument();
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
      expect(api.generateSegments).toHaveBeenCalledWith(['seg-1'], undefined);
    });
  });

  it('shows a blocking message when segment generation is rejected', async () => {
    (api.generateSegments as any).mockRejectedValue(new Error('Enable Voxtral in Settings and add a Mistral API key to use cloud voices.'));

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
    expect(screen.getByText(/Enable Voxtral in Settings/i)).toBeInTheDocument();
  });

  it('shows a blocking message when chapter queueing is rejected', async () => {
    (api.addProcessingQueue as any).mockRejectedValue(new Error('Enable Voxtral in Settings and add a Mistral API key to use cloud voices.'));

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

    fireEvent.click(screen.getByTitle('Queue Chapter'));

    expect(await screen.findByText('Queue Blocked')).toBeInTheDocument();
    expect(screen.getByText(/Enable Voxtral in Settings/i)).toBeInTheDocument();
  });

  it('treats a blank chapter voice as a fallback to the project voice', async () => {
    (api.addProcessingQueue as any).mockResolvedValue({ status: 'ok' });

    render(
      <ChapterEditor
        chapterId={mockChapterId}
        projectId={mockProjectId}
        speakerProfiles={mockSpeakerProfiles as any}
        speakers={mockSpeakers as any}
        selectedVoice="Profile 1"
        onBack={vi.fn()}
      />
    );

    await waitFor(() => screen.findByDisplayValue('Test Chapter'));

    const voiceSelect = screen.getByTitle('Select Voice Profile for this chapter');
    expect(screen.getByDisplayValue('Use Project Default (Voice 1 - Standard)')).toBeInTheDocument();

    fireEvent.change(voiceSelect, { target: { value: 'Profile 1' } });
    fireEvent.change(voiceSelect, { target: { value: '' } });

    fireEvent.click(screen.getByTitle('Queue Chapter'));

    await waitFor(() => {
      expect(api.addProcessingQueue).toHaveBeenCalledWith(
        mockProjectId,
        mockChapterId,
        0,
        'Profile 1'
      );
    });
  });

  it('persists a chapter voice selection immediately', async () => {
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

    const voiceSelect = screen.getByTitle('Select Voice Profile for this chapter');
    fireEvent.change(voiceSelect, { target: { value: 'Profile 1' } });

    await waitFor(() => {
      expect(api.updateChapter).toHaveBeenCalledWith(mockChapterId, { speaker_profile_name: 'Profile 1' });
    });
  });

  it('exports WAV and MP3 audio directly from the chapter editor', async () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

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

    fireEvent.click(screen.getByTitle('Export WAV'));
    await waitFor(() => {
      expect(api.exportChapterAudio).toHaveBeenCalledWith(mockChapterId, 'wav');
    });

    fireEvent.click(screen.getByTitle('Export MP3'));
    await waitFor(() => {
      expect(api.exportChapterAudio).toHaveBeenCalledWith(mockChapterId, 'mp3');
    });

    expect(clickSpy).toHaveBeenCalled();
  });

  it('loads a saved chapter voice instead of falling back to the project voice', async () => {
    (api.fetchChapters as any).mockResolvedValue([
      { ...mockChapter, speaker_profile_name: 'Profile 1' }
    ]);

    render(
      <ChapterEditor
        chapterId={mockChapterId}
        projectId={mockProjectId}
        speakerProfiles={mockSpeakerProfiles as any}
        speakers={mockSpeakers as any}
        selectedVoice="Profile 1"
        onBack={vi.fn()}
      />
    );

    await waitFor(() => screen.findByDisplayValue('Test Chapter'));

    const voiceSelect = screen.getByTitle('Select Voice Profile for this chapter') as HTMLSelectElement;
    expect(voiceSelect.value).toBe('Profile 1');
  });

  it('manages production block save conflicts and allows reloading', async () => {
    (api.updateProductionBlocks as any).mockRejectedValueOnce({ status: 409, message: 'Version mismatch' });
    (api.fetchProductionBlocks as any).mockResolvedValue({
      blocks: mockProductionBlocks,
      base_revision_id: 'new-rev',
      render_batches: []
    });

    render(
      <ChapterEditor
        chapterId={mockChapterId}
        projectId={mockProjectId}
        speakerProfiles={mockSpeakerProfiles as any}
        speakers={mockSpeakers as any}
        onBack={vi.fn()}
      />
    );

    await waitFor(() => screen.findByText('Production'));
    fireEvent.click(screen.getByText('Production'));
    
    await waitFor(() => screen.findByText('Save Blocks'));
    
    // Make it dirty
    fireEvent.change(screen.getByLabelText('Production block 1 text'), {
      target: { value: 'Dirty edit' }
    });
    
    // Click save
    fireEvent.click(screen.getByText('Save Blocks'));
    
    // Should see conflict message
    await waitFor(() => screen.findByText(/Save Conflict:/i));
    expect(screen.getByText(/Version mismatch/i)).toBeInTheDocument();
    
    // Click reload
    fireEvent.click(screen.getAllByRole('button', { name: /reload latest/i })[1]);
    
    await waitFor(() => {
      expect(api.fetchProductionBlocks).toHaveBeenCalledWith(mockChapterId);
    });
    
    // Conflict message should be gone
    expect(screen.queryByText(/Save Conflict:/i)).not.toBeInTheDocument();
  });

  it('handles script span assignment and optimistic update', async () => {
    (api.saveScriptAssignments as any).mockResolvedValue({
      ...mockScriptView,
      spans: [
        { ...mockScriptView.spans[0], character_id: 'char-1' }
      ]
    });

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

    // 1. Select character in sidebar
    fireEvent.click(screen.getByText('Char 1'));

    // 2. Click the span in script view
    const span = screen.getByText('Once upon a time.').closest('.script-span');
    fireEvent.click(span!);

    // 3. Verify API call
    expect(api.saveScriptAssignments).toHaveBeenCalledWith(
      mockChapterId,
      expect.objectContaining({
        base_revision_id: 'rev-1',
        assignments: [
          expect.objectContaining({
            span_ids: ['seg-1'],
            character_id: 'char-1'
          })
        ]
      })
    );

    // 4. Verify optimistic UI check
    // Use getAllByText because there's a tab named Script and a view mode toggle named Script
    fireEvent.click(screen.getAllByText('Script')[0]);
    expect(await screen.queryByText('Narrator')).not.toBeInTheDocument();
  });

  it('handles script assignment revision conflicts', async () => {
    const conflictErr = new Error('Revision mismatch');
    (conflictErr as any).status = 409;
    (api.saveScriptAssignments as any).mockRejectedValue(conflictErr);

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

    fireEvent.click(screen.getByText('Char 1'));
    const span = screen.getByText('Once upon a time.').closest('.script-span');
    fireEvent.click(span!);

    expect(await screen.findByText('Assignment Conflict')).toBeInTheDocument();
    expect(screen.getByText(/This chapter was modified by another process/i)).toBeInTheDocument();
    
    // Clicking reload should call loadChapter which calls fetchScriptView
    const reloadBtn = screen.getByText('Reload Now');
    fireEvent.click(reloadBtn);
    
    await waitFor(() => {
      expect(api.fetchScriptView).toHaveBeenCalledTimes(2);
    });
  });

  it('disables auto-save for text in edit tab', async () => {
    (api.updateChapter as any).mockResolvedValue({ chapter: mockChapter });
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

    // Go to edit tab
    fireEvent.click(screen.getByText('Source Text'));
    expect(screen.getByText('Once upon a time.')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Edit Source Text' }));
    fireEvent.click(screen.getByText('Continue to Edit'));

    vi.useFakeTimers();

    const textarea = screen.getByPlaceholderText(/Start typing your chapter text/i);
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Completely different text.' } });
    });

    // Advance timers
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    // Should NOT have called updateChapter with new text
    expect(api.updateChapter).not.toHaveBeenCalledWith(mockChapterId, expect.objectContaining({
      text_content: 'Completely different text.'
    }));
  });

  it('handles source text resync preview and commit', async () => {
    const previewData = {
      total_segments_before: 1,
      total_segments_after: 2,
      preserved_assignments_count: 0,
      lost_assignments_count: 5,
      affected_character_names: ['Impacted Character A'],
      is_destructive: true
    };
    (api.previewSourceTextResync as any).mockResolvedValue(previewData);
    (api.updateChapter as any).mockResolvedValue({ chapter: { ...mockChapter, text_content: 'New Text.' } });

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

    // Go to edit tab
    fireEvent.click(screen.getByText('Source Text'));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Source Text' }));
    fireEvent.click(screen.getByText('Continue to Edit'));

    const textarea = screen.getByPlaceholderText(/Start typing your chapter text/i);
    fireEvent.change(textarea, { target: { value: 'New Text.' } });

    // Should see Commit Changes button
    const commitBtn = screen.getByText('Commit Changes');
    fireEvent.click(commitBtn);

    // Should call preview
    await waitFor(() => {
      expect(api.previewSourceTextResync).toHaveBeenCalledWith(mockChapterId, 'New Text.');
    });

    // Should see preview modal
    expect(await screen.findByText('Source Text Resync Preview')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument(); // lost_assignments_count
    expect(screen.getByText('Impacted Character A')).toBeInTheDocument();

    // Confirm resync
    fireEvent.click(screen.getByText('Confirm Resync'));

    await waitFor(() => {
      expect(api.updateChapter).toHaveBeenCalledWith(mockChapterId, expect.objectContaining({
        text_content: 'New Text.'
      }));
    });
  });
});
