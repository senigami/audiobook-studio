import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { StudioStage } from '@/pages/Book/stages/StudioStage';
import { useBookDataContext } from '@/pages/Book/BookDataContext';
import { useStudioChapter } from '@/pages/Book/studio/useStudioChapter';

vi.mock('@/pages/Book/BookDataContext', () => ({
  useBookDataContext: vi.fn(),
}));

vi.mock('@/pages/Book/studio/useStudioChapter', () => ({
  useStudioChapter: vi.fn(),
}));

vi.mock('@/pages/Book/studio/AnalysisStrip', () => ({
  AnalysisStrip: ({ bookId, chapterId, analysis, analyzing }: any) => (
    <div
      data-testid="analysis-strip"
      data-book-id={bookId}
      data-chapter-id={chapterId}
      data-has-analysis={String(Boolean(analysis))}
      data-analyzing={String(Boolean(analyzing))}
    />
  ),
}));

vi.mock('@/pages/Book/studio/CastPalette', () => ({
  CastPalette: ({ selectedCharacterId, setSelectedCharacterId, setSelectedProfileName }: any) => (
    <button
      type="button"
      data-testid="cast-palette"
      onClick={() => {
        setSelectedCharacterId('char-1');
        setSelectedProfileName('Profile 1');
      }}
    >
      {selectedCharacterId || 'none'}
    </button>
  ),
}));

vi.mock('@/pages/Book/studio/StudioHeaderActions', () => ({
  StudioHeaderActions: ({
    hasUnsavedChanges,
    onCommitChanges,
    onPrev,
    onNext,
    onExportAudio,
    exportingFormat,
    onCopyDebugState,
  }: any) => (
    <div
      data-testid="studio-header-actions"
      data-unsaved={String(Boolean(hasUnsavedChanges))}
      data-exporting-format={exportingFormat || ''}
    >
      <button type="button" onClick={() => onPrev?.()}>Prev</button>
      <button type="button" onClick={() => onNext?.()}>Next</button>
      <button type="button" onClick={() => onCommitChanges?.()}>Commit</button>
      <button type="button" onClick={() => onExportAudio?.('wav')}>Export WAV</button>
      <button type="button" onClick={() => onExportAudio?.('mp3')}>Export MP3</button>
      <button type="button" onClick={() => onCopyDebugState?.()}>Debug</button>
    </div>
  ),
}));

vi.mock('@/pages/Book/studio/RenderControlsStrip', () => ({
  RenderControlsStrip: ({ queueLabel, queueTitle }: any) => (
    <div
      data-testid="render-controls-strip"
      data-queue-label={queueLabel || ''}
      data-queue-title={queueTitle || ''}
    />
  ),
}));

vi.mock('@/components/overlays/ConfirmModal', () => ({
  ConfirmModal: ({ isOpen, title, message, onConfirm, onCancel }: any) => (
    <div data-testid="confirm-modal" data-open={String(Boolean(isOpen))}>
      <div data-testid="confirm-title">{title}</div>
      <div data-testid="confirm-message">{message}</div>
      <button type="button" onClick={onConfirm}>confirm</button>
      <button type="button" onClick={onCancel}>cancel</button>
    </div>
  ),
}));

vi.mock('@/pages/ChapterEditor/components/ResyncPreviewModal', () => ({
  ResyncPreviewModal: ({ isOpen, data, loading, onConfirm, onCancel }: any) => (
    <div
      data-testid="resync-preview-modal"
      data-open={String(Boolean(isOpen))}
      data-loading={String(Boolean(loading))}
      data-has-data={String(Boolean(data))}
    >
      <button type="button" onClick={onConfirm}>preview-confirm</button>
      <button type="button" onClick={onCancel}>preview-cancel</button>
    </div>
  ),
}));

vi.mock('@/pages/ChapterEditor/components/QueueNotice', () => ({
  QueueNotice: ({ message }: any) => <div data-testid="queue-notice">{message}</div>,
}));

vi.mock('@/pages/ChapterEditor/components/ScriptView', () => ({
  ScriptView: ({ viewMode, showSafeText, showNumbers, activeCharacterId }: any) => (
    <div
      data-testid="script-view"
      data-view-mode={viewMode}
      data-safe-text={String(showSafeText)}
      data-show-numbers={String(showNumbers)}
      data-active-character-id={activeCharacterId || ''}
    />
  ),
}));

const mockUseBookDataContext = vi.mocked(useBookDataContext);
const mockUseStudioChapter = vi.mocked(useStudioChapter);
let latestStudioChapterState: any = null;

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{`${location.pathname}${location.search}`}</div>;
}

function buildChapter(id: string, audio_status = 'ready') {
  return {
    id,
    project_id: 'book-1',
    title: id,
    audio_status,
    has_wav: false,
    has_mp3: false,
    has_m4a: false,
    char_count: 100,
  };
}

function mockStudioChapter(chapterId: string, overrides: Record<string, unknown> = {}) {
  latestStudioChapterState = {
    chapter: { id: chapterId, title: chapterId, text_content: 'text', word_count: 2, char_count: 4, sent_count: 1 } as never,
    title: chapterId,
    text: 'text',
    analysis: null,
    analyzing: false,
    segments: [],
    scriptViewData: {
      chapter_id: chapterId,
      base_revision_id: 'rev-1',
      paragraphs: [{ id: 'para-1', span_ids: ['span-1'] }],
      spans: [{ id: 'span-1', order_index: 0, text: 'Hello', sanitized_text: 'Hello' }],
      render_batches: [],
      audio_groups: [],
    } as never,
    scriptViewLoading: false,
    characters: [],
    handleGenerate: vi.fn(),
    handleScriptAssign: vi.fn(),
    handleScriptAssignRange: vi.fn(),
    effectiveSelectedVoice: 'voice-1',
    effectivePendingSegmentIds: new Set(),
    chapterRenderRenderingSegmentIds: new Set(),
    chapterRenderQueuedSegmentIds: new Set(),
    chapterRenderRenderingBatchProgressById: {},
    playingSegmentId: null,
    playingSegmentIds: new Set(),
    playbackQueue: [],
    playSegment: vi.fn(),
    handleSave: vi.fn().mockResolvedValue(true),
    hasUnsavedChanges: true,
    exportingFormat: null,
    handleRequestResyncPreview: vi.fn(),
    handleConfirmResync: vi.fn(),
    handleExportAudio: vi.fn(),
    handleCopyDebugState: vi.fn(),
    confirmConfig: { title: 'Confirm', message: 'Message', onConfirm: vi.fn(), confirmText: 'Go' },
    isPreviewingResync: true,
    resyncPreviewData: {
      total_segments_before: 2,
      total_segments_after: 2,
      preserved_assignments_count: 2,
      lost_assignments_count: 0,
      affected_character_names: [],
      is_destructive: false,
    },
    isResyncing: false,
    queueNotice: 'Queued',
    setIsPreviewingResync: vi.fn(),
    setConfirmConfig: vi.fn(),
    loadChapter: vi.fn(),
    selectedCharacterId: null,
    setSelectedCharacterId: vi.fn(),
    selectedProfileName: null,
    setSelectedProfileName: vi.fn(),
    expandedCharacterId: null,
    setExpandedCharacterId: vi.fn(),
    handleUpdateCharacterColor: vi.fn(),
    handleVoiceChange: vi.fn(),
    availableVoices: [],
    chapterDefaultVoiceLabel: 'Use Project Default',
    localVoice: '',
    ...overrides,
  };
  mockUseStudioChapter.mockReturnValue(latestStudioChapterState as never);
}

describe('StudioStage', () => {
  it('mounts the selected chapter, defaults to book view, and flips the view pills', async () => {
    mockUseBookDataContext.mockReturnValue({
      bookId: 'book-1',
      chapters: [buildChapter('c1'), buildChapter('c2'), buildChapter('c3')],
      jobs: {
        active: {
          id: 'job-c2',
          engine: 'xtts',
          chapter_file: 'chapter-c2.txt',
          status: 'running',
          created_at: 200,
          safe_mode: false,
          make_mp3: false,
          progress: 0.5,
          warning_count: 0,
          project_id: 'book-1',
          chapter_id: 'c2',
          classification: 'chapter',
        } as never,
      },
      segmentProgress: {},
      project: null,
      characters: [],
      availableAudiobooks: [],
      loading: false,
      selectedVoice: 'voice-1',
      setSelectedVoice: vi.fn(),
      speakerProfiles: [],
      speakers: [],
      engines: [],
      mergedVoices: [],
      effectiveProjectVoice: 'voice-1',
      projectVoiceStatus: { enabled: true, message: '' },
      projectDefaultVoiceLabel: 'Default Speaker',
      totalRuntime: 0,
      totalPredicted: null,
      hasUnrendered: true,
      actions: {
        submitting: false,
        handleCreateChapter: vi.fn(),
        handleUpdateProject: vi.fn(),
        handleDeleteChapter: vi.fn(),
        handleReorderChapters: vi.fn(),
        handleQueueChapter: vi.fn(),
        handleResetChapterAudio: vi.fn(),
        handleQueueAllUnprocessed: vi.fn(),
        handleAssembleProject: vi.fn(),
        handleDeleteAudiobook: vi.fn(),
        handleSaveBackup: vi.fn(),
        handleDeleteBackup: vi.fn(),
        handleUpdateBackupMetadata: vi.fn(),
        handleUpdateAudiobookMetadata: vi.fn(),
        handleProjectVoiceChange: vi.fn(),
      },
      segmentUpdate: undefined,
    chapterUpdate: undefined,
    reload: vi.fn(),
    segments: [],
    selectedCharacterId: null,
    setSelectedCharacterId: vi.fn(),
    selectedProfileName: null,
    setSelectedProfileName: vi.fn(),
    expandedCharacterId: null,
    setExpandedCharacterId: vi.fn(),
    handleUpdateCharacterColor: vi.fn(),
    handleVoiceChange: vi.fn(),
    availableVoices: [],
    chapterDefaultVoiceLabel: 'Use Project Default',
    localVoice: '',
    } as never);
    mockStudioChapter('c2', {
      selectedCharacterId: 'char-1',
      selectedProfileName: 'Profile 1',
      analysis: { char_count: 101 },
      analyzing: true,
    });

    const previousTheme = document.documentElement.getAttribute('data-theme');
    document.documentElement.setAttribute('data-theme', 'dark');
    try {
      render(
        <MemoryRouter initialEntries={['/book/book-1/studio?chapter=c2']}>
          <Routes>
            <Route path="/book/:bookId/studio" element={<StudioStage />} />
          </Routes>
          <LocationProbe />
        </MemoryRouter>,
      );

      await waitFor(() => {
        expect(mockUseStudioChapter).toHaveBeenCalledWith(expect.objectContaining({ chapterId: 'c2' }));
      });

      expect(screen.getByTestId('studio-header-actions')).toHaveAttribute('data-unsaved', 'true');
      expect(screen.getByTestId('studio-header-actions')).toHaveAttribute('data-exporting-format', '');
      expect(screen.getByTestId('script-view')).toHaveAttribute('data-view-mode', 'book');
      expect(screen.getByTestId('script-view')).toHaveAttribute('data-safe-text', 'false');
      expect(screen.getByTestId('script-view')).toHaveAttribute('data-show-numbers', 'false');
      expect(screen.getByTestId('script-view')).toHaveAttribute('data-active-character-id', 'char-1');
      expect(screen.getByTestId('analysis-strip')).toHaveAttribute('data-book-id', 'book-1');
      expect(screen.getByTestId('analysis-strip')).toHaveAttribute('data-chapter-id', 'c2');
      expect(screen.getByTestId('analysis-strip')).toHaveAttribute('data-has-analysis', 'true');
      expect(screen.getByTestId('analysis-strip')).toHaveAttribute('data-analyzing', 'true');
      expect(screen.getByTestId('render-controls-strip')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: /script view/i }));
      expect(screen.getByTestId('script-view')).toHaveAttribute('data-view-mode', 'script');

      fireEvent.click(screen.getByRole('button', { name: /safe text/i }));
      expect(screen.getByTestId('script-view')).toHaveAttribute('data-safe-text', 'true');

      fireEvent.click(screen.getByRole('button', { name: /^#$/i }));
      expect(screen.getByTestId('script-view')).toHaveAttribute('data-show-numbers', 'true');

      fireEvent.click(screen.getByRole('button', { name: 'Commit' }));
      expect(latestStudioChapterState.handleRequestResyncPreview).toHaveBeenCalledTimes(1);
      expect(screen.getByTestId('confirm-modal')).toHaveAttribute('data-open', 'true');
      expect(screen.getByTestId('resync-preview-modal')).toHaveAttribute('data-open', 'true');
      expect(screen.getByTestId('queue-notice')).toHaveTextContent('Queued');

      fireEvent.click(screen.getByRole('button', { name: 'Prev' }));
      expect(latestStudioChapterState.handleSave).toHaveBeenCalledWith('c2', 'text');
      await waitFor(() => {
        expect(screen.getByTestId('location')).toHaveTextContent('/book/book-1/studio?chapter=c1');
      });
      expect(mockUseStudioChapter).toHaveBeenLastCalledWith(expect.objectContaining({ chapterId: 'c1' }));
    } finally {
      if (previousTheme == null) {
        document.documentElement.removeAttribute('data-theme');
      } else {
        document.documentElement.setAttribute('data-theme', previousTheme);
      }
    }
  });

  it('defaults to the first chapter when the query is empty', async () => {
    mockUseBookDataContext.mockReturnValue({
      bookId: 'book-1',
      chapters: [buildChapter('c1'), buildChapter('c2')],
      jobs: {},
      segmentProgress: {},
      project: null,
      characters: [],
      availableAudiobooks: [],
      loading: false,
      selectedVoice: 'voice-1',
      setSelectedVoice: vi.fn(),
      speakerProfiles: [],
      speakers: [],
      engines: [],
      mergedVoices: [],
      effectiveProjectVoice: 'voice-1',
      projectVoiceStatus: { enabled: true, message: '' },
      projectDefaultVoiceLabel: 'Default Speaker',
      totalRuntime: 0,
      totalPredicted: null,
      hasUnrendered: true,
      actions: {
        submitting: false,
        handleCreateChapter: vi.fn(),
        handleUpdateProject: vi.fn(),
        handleDeleteChapter: vi.fn(),
        handleReorderChapters: vi.fn(),
        handleQueueChapter: vi.fn(),
        handleResetChapterAudio: vi.fn(),
        handleQueueAllUnprocessed: vi.fn(),
        handleAssembleProject: vi.fn(),
        handleDeleteAudiobook: vi.fn(),
        handleSaveBackup: vi.fn(),
        handleDeleteBackup: vi.fn(),
        handleUpdateBackupMetadata: vi.fn(),
        handleUpdateAudiobookMetadata: vi.fn(),
        handleProjectVoiceChange: vi.fn(),
      },
      segmentUpdate: undefined,
      chapterUpdate: undefined,
      reload: vi.fn(),
      segments: [],
      selectedCharacterId: null,
      setSelectedCharacterId: vi.fn(),
      selectedProfileName: null,
      setSelectedProfileName: vi.fn(),
      expandedCharacterId: null,
      setExpandedCharacterId: vi.fn(),
      handleUpdateCharacterColor: vi.fn(),
      handleVoiceChange: vi.fn(),
      availableVoices: [],
      chapterDefaultVoiceLabel: 'Use Project Default',
      localVoice: '',
    } as never);
    mockStudioChapter('c1');

    render(
      <MemoryRouter initialEntries={['/book/book-1/studio']}>
        <Routes>
          <Route path="/book/:bookId/studio" element={<StudioStage />} />
        </Routes>
        <LocationProbe />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(mockUseStudioChapter).toHaveBeenCalledWith(expect.objectContaining({ chapterId: 'c1' }));
    });

    await waitFor(() => {
      expect(screen.getByTestId('location')).toHaveTextContent('/book/book-1/studio?chapter=c1');
    });
  });
});
