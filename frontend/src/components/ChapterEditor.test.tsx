import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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

import { stripMotionProps } from './chapter/chapterEditorFixtures';
// Mock framer-motion
vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...stripMotionProps(props)}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import { ChapterEditor } from './ChapterEditor';
import { api } from '../api';
import { 
  mockChapterId, 
  mockProjectId, 
  mockChapter, 
  mockSegments,
  mockProductionBlocks,
  mockRenderBatches,
  mockScriptView
} from './chapter/chapterEditorFixtures';

describe('ChapterEditor - Core Orchestration', () => {
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
    
    fireEvent.click(screen.getByText('Performance'));
    expect(await screen.findByText('Performance View')).toBeInTheDocument();
    
    fireEvent.click(screen.getByText('Production'));
    expect(await screen.findByText('Production Blocks')).toBeInTheDocument();
    
    fireEvent.click(screen.getByText('Preview Safe Output'));
    expect(await screen.findByText('Preview Safe Output')).toBeInTheDocument();
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
});
