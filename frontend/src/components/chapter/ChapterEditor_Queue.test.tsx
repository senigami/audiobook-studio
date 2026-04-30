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
