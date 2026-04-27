import { describe, it, expect, vi, beforeEach } from 'vitest';

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
  mockScriptView
} from './chapterEditorFixtures';

describe('ChapterEditor - Assets & Voices', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
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
    (api.exportChapterAudio as any).mockResolvedValue(new Blob(['audio']));
    Object.defineProperty(window.URL, 'createObjectURL', { value: vi.fn(() => 'blob:mock'), writable: true });
    Object.defineProperty(window.URL, 'revokeObjectURL', { value: vi.fn(), writable: true });
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
    fireEvent.change(voiceSelect, { target: { value: '' } });
    fireEvent.click(screen.getByTitle('Queue Chapter'));

    await waitFor(() => {
      expect(api.addProcessingQueue).toHaveBeenCalledWith(mockProjectId, mockChapterId, 0, 'Profile 1');
    });
  });

  it('persists a chapter voice selection immediately', async () => {
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
    const voiceSelect = screen.getByTitle('Select Voice Profile for this chapter');
    fireEvent.change(voiceSelect, { target: { value: 'Profile 1' } });

    await waitFor(() => {
      expect(api.updateChapter).toHaveBeenCalledWith(mockChapterId, { speaker_profile_name: 'Profile 1' });
    });
  });

  it('loads a saved chapter voice instead of falling back to the project voice', async () => {
    (api.fetchChapters as any).mockResolvedValue([{ ...mockChapter, speaker_profile_name: 'Profile 1' }]);

    render(
      <ChapterEditor
        chapterId={mockChapterId}
        projectId={mockProjectId}
        speakerProfiles={mockSpeakerProfiles as any}
        speakers={mockSpeakers as any}
        selectedVoice="Profile 2"
        onBack={vi.fn()}
      />
    );

    await waitFor(() => screen.findByDisplayValue('Test Chapter'));
    const voiceSelect = screen.getByTitle('Select Voice Profile for this chapter') as HTMLSelectElement;
    expect(voiceSelect.value).toBe('Profile 1');
  });
});
