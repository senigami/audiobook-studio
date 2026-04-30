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

import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
  mockScriptView,
  mockCharacters
} from './chapterEditorFixtures';

describe('ChapterEditor - Production & Script Integration', () => {
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

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
    (api.updateProductionBlocks as any).mockResolvedValue({
      chapter_id: mockChapterId,
      base_revision_id: 'rev-2',
      blocks: mockProductionBlocks,
      render_batches: mockRenderBatches
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    consoleErrorSpy.mockRestore();
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
    fireEvent.click(await screen.findByRole('button', { name: /save blocks/i }));

    await waitFor(() => {
      expect(api.updateProductionBlocks).toHaveBeenCalledWith(
        mockChapterId,
        expect.objectContaining({
          blocks: expect.arrayContaining([
            expect.objectContaining({ text: 'Updated block text.' })
          ])
        })
      );
    });
  });

  it('manages production block save conflicts and allows reloading', async () => {
    // Suppress unhandled rejection for this test as the component re-throws after handling
    const handler = (e: PromiseRejectionEvent) => {
      if (e.reason && e.reason.status === 409) {
        e.preventDefault();
      }
    };
    window.addEventListener('unhandledrejection', handler);

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
    
    fireEvent.change(screen.getByLabelText('Production block 1 text'), {
      target: { value: 'Dirty edit' }
    });

    fireEvent.click(await screen.findByRole('button', { name: /save blocks/i }));
    
    await waitFor(() => screen.findByText(/Save Conflict:/i));
    
    // Find all reload buttons and click the last one (the one in the conflict alert)
    const reloadButtons = screen.getAllByRole('button', { name: /reload latest/i });
    fireEvent.click(reloadButtons[reloadButtons.length - 1]);
    
    await waitFor(() => {
      expect(api.fetchProductionBlocks).toHaveBeenCalledWith(mockChapterId);
    });

    window.removeEventListener('unhandledrejection', handler);
  });

  it('handles script span assignment and optimistic update', async () => {
    (api.saveScriptAssignments as any).mockResolvedValue({
      ...mockScriptView,
      spans: [{ ...mockScriptView.spans[0], character_id: 'char-1' }]
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
    fireEvent.click(screen.getByText(/Char 1/));
    const span = screen.getByText('Once upon a time.').closest('.script-span');
    fireEvent.click(span!);

    expect(api.saveScriptAssignments).toHaveBeenCalledWith(
      mockChapterId,
      expect.objectContaining({
        assignments: [expect.objectContaining({ character_id: 'char-1' })]
      })
    );
  });

  it('handles script assignment revision conflicts', async () => {
    const handler = (e: PromiseRejectionEvent) => {
      if (e.reason && e.reason.status === 409) {
        e.preventDefault();
      }
    };
    window.addEventListener('unhandledrejection', handler);

    (api.saveScriptAssignments as any).mockRejectedValueOnce({ status: 409, message: 'Revision mismatch' });

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
    fireEvent.click(screen.getByText(/Char 1/));
    const span = screen.getByText('Once upon a time.').closest('.script-span');
    
    fireEvent.click(span!);

    expect(await screen.findByText('Assignment Conflict')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Reload Now'));
    
    await waitFor(() => {
      expect(api.fetchScriptView).toHaveBeenCalledTimes(2);
    });

    window.removeEventListener('unhandledrejection', handler);
  });
});
