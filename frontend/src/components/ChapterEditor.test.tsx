import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock API
vi.mock('../api', () => ({
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
    playSegment: vi.fn(),
    stopPlayback: vi.fn(),
  }),
}));

// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ChapterEditor } from './ChapterEditor';
import { api } from '../api';
import type { Character } from '../types';

describe('ChapterEditor', () => {
  const mockProjectId = 'proj-123';
  const mockChapterId = 'chap-456';
  const mockChapter = {
    id: mockChapterId,
    project_id: mockProjectId,
    title: 'Test Chapter',
    text_content: 'Once upon a time.',
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
    { id: 'seg-1', chapter_id: mockChapterId, text_content: 'Once upon a time.', character_id: null, audio_status: 'unprocessed' }
  ];

  const mockCharacters: Character[] = [
    { id: 'char-1', project_id: mockProjectId, name: 'Char 1', color: '#ff0000', speaker_profile_name: 'Voice 1' } as any
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (api.fetchChapters as any).mockResolvedValue([mockChapter]);
    (api.fetchSegments as any).mockResolvedValue(mockSegments);
    (api.fetchCharacters as any).mockResolvedValue(mockCharacters);
    (api.updateChapter as any).mockResolvedValue({ chapter: mockChapter });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('renders loading state initially', () => {
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

    await waitFor(() => screen.findByDisplayValue('Test Chapter'));

    // Production Tab
    fireEvent.click(screen.getByText('Production'));
    expect(await screen.findByText('NARRATOR')).toBeInTheDocument();

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

});
