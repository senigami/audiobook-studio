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

describe('ChapterEditor - Source Text & Resync', () => {
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
    fireEvent.click(screen.getByText('Source Text'));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Source Text' }));
    fireEvent.click(screen.getByText('Continue to Edit'));

    vi.useFakeTimers();
    const textarea = screen.getByPlaceholderText(/Start typing your chapter text/i);
    await act(async () => {
      fireEvent.change(textarea, { target: { value: 'Completely different text.' } });
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

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
    fireEvent.click(screen.getByText('Source Text'));
    fireEvent.click(screen.getByRole('button', { name: 'Edit Source Text' }));
    fireEvent.click(screen.getByText('Continue to Edit'));

    const textarea = screen.getByPlaceholderText(/Start typing your chapter text/i);
    fireEvent.change(textarea, { target: { value: 'New Text.' } });

    fireEvent.click(screen.getByText('Commit Changes'));
    await waitFor(() => {
      expect(api.previewSourceTextResync).toHaveBeenCalledWith(mockChapterId, 'New Text.');
    });

    expect(await screen.findByText('Source Text Resync Preview')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Confirm Resync'));

    await waitFor(() => {
      expect(api.updateChapter).toHaveBeenCalledWith(mockChapterId, expect.objectContaining({
        text_content: 'New Text.'
      }));
    });
  });
});
