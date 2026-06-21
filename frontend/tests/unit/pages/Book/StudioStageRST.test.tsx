/**
 * Tests for RST-5 and RST-7 — features restored to StudioStage.
 *
 * RST-7: Engine-unavailable banner in Studio
 * RST-5: In-Studio source-text quick edit (canCommitSourceText path)
 *
 * RST-6 (CastPalette voice picker) tests live in
 * tests/unit/pages/Book/studio/CastPaletteRST6.test.tsx
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { StudioStage } from '@/pages/Book/stages/StudioStage';
import { useBookDataContext } from '@/pages/Book/BookDataContext';
import { useStudioChapter } from '@/pages/Book/studio/useStudioChapter';

// ---------------------------------------------------------------------------
// Mocks for StudioStage tests

vi.mock('@/pages/Book/BookDataContext', () => ({
  useBookDataContext: vi.fn(),
}));

vi.mock('@/pages/Book/studio/useStudioChapter', () => ({
  useStudioChapter: vi.fn(),
}));

vi.mock('@/pages/Book/studio/AnalysisStrip', () => ({
  AnalysisStrip: () => <div data-testid="analysis-strip" />,
}));

vi.mock('@/pages/Book/studio/CastPalette', () => ({
  CastPalette: () => <div data-testid="cast-palette" />,
}));

vi.mock('@/pages/Book/studio/StudioHeaderActions', () => ({
  StudioHeaderActions: () => <div data-testid="studio-header-actions" />,
}));

vi.mock('@/pages/Book/studio/RenderControlsStrip', () => ({
  RenderControlsStrip: ({ canCommitSourceText, onCommitSourceText }: any) => (
    <div
      data-testid="render-controls-strip"
      data-can-commit-source-text={String(Boolean(canCommitSourceText))}
    >
      {canCommitSourceText && (
        <button type="button" onClick={onCommitSourceText} data-testid="commit-source-text-btn">
          Commit Changes
        </button>
      )}
    </div>
  ),
}));

vi.mock('@/components/overlays/ConfirmModal', () => ({
  ConfirmModal: () => null,
}));

vi.mock('@/pages/ChapterEditor/components/ResyncPreviewModal', () => ({
  ResyncPreviewModal: () => null,
}));

vi.mock('@/pages/ChapterEditor/components/QueueNotice', () => ({
  QueueNotice: () => null,
}));

vi.mock('@/pages/ChapterEditor/components/ScriptView', () => ({
  ScriptView: () => <div data-testid="script-view" />,
}));

vi.mock('@/components/forms/InlineEdit', () => ({
  InlineEdit: ({ value }: any) => <div data-testid="inline-edit">{value}</div>,
}));

const mockUseBookDataContext = vi.mocked(useBookDataContext);
const mockUseStudioChapter = vi.mocked(useStudioChapter);

function buildChapter(id: string) {
  return {
    id,
    project_id: 'book-1',
    title: id,
    audio_status: 'ready',
    has_wav: false,
    has_mp3: false,
    has_m4a: false,
    char_count: 100,
  };
}

function buildStudioChapterState(chapterId: string, overrides: Record<string, unknown> = {}) {
  return {
    chapter: { id: chapterId, title: chapterId, text_content: 'text', word_count: 2, char_count: 4, sent_count: 1 },
    title: chapterId,
    text: 'text',
    analysis: null,
    analyzing: false,
    segments: [],
    scriptViewData: {
      chapter_id: chapterId,
      base_revision_id: 'rev-1',
      paragraphs: [],
      spans: [],
      render_batches: [],
      audio_groups: [],
    },
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
    hasUnsavedChanges: false,
    exportingFormat: null,
    handleRequestResyncPreview: vi.fn(),
    handleConfirmResync: vi.fn(),
    handleExportAudio: vi.fn(),
    handleCopyDebugState: vi.fn(),
    confirmConfig: null,
    isPreviewingResync: false,
    resyncPreviewData: null,
    isResyncing: false,
    queueNotice: null,
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
    handleCreateTempCharacter: vi.fn(),
    handlePromoteCharacter: vi.fn(),
    renderGroupCount: 0,
    queueButtonLabel: 'Queue',
    queueButtonTitle: 'Queue Chapter',
    status: {},
    pageHandoff: {},
    setLiveBarSegmentProgress: vi.fn(),
    handleProgressBarDebugSnapshot: vi.fn(),
    handleQueue: vi.fn(),
    handleStopAll: vi.fn(),
    saving: false,
    submitting: false,
    firstSpanGroupNumber: vi.fn(),
    localVoice: '',
    handleVoiceChange: vi.fn(),
    chapterDefaultVoiceLabel: 'Use Project Default',
    availableVoices: [],
    ...overrides,
  };
}

function buildContextBase(projectVoiceStatus = { enabled: true, message: '' }) {
  return {
    bookId: 'book-1',
    chapters: [buildChapter('c1')],
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
    projectVoiceStatus,
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
  };
}

function renderStudioStage(contextOverrides: object = {}, studioOverrides: Record<string, unknown> = {}) {
  mockUseBookDataContext.mockReturnValue({ ...buildContextBase(), ...contextOverrides } as never);
  mockUseStudioChapter.mockReturnValue(buildStudioChapterState('c1', studioOverrides) as never);

  render(
    <MemoryRouter initialEntries={['/book/book-1/studio?chapter=c1']}>
      <Routes>
        <Route path="/book/:bookId/studio" element={<StudioStage />} />
      </Routes>
    </MemoryRouter>,
  );
}

// ---------------------------------------------------------------------------
// RST-7: Engine-unavailable banner

describe('RST-7 — StudioStage engine-unavailable banner', () => {
  it('shows the alert when the engine is disabled with a message', () => {
    renderStudioStage({
      projectVoiceStatus: { enabled: false, message: 'XTTS is disabled.' },
    });

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Project Default Voice Engine Unavailable');
    expect(alert).toHaveTextContent('XTTS is disabled.');
  });

  it('hides the alert when the engine is enabled', () => {
    renderStudioStage({
      projectVoiceStatus: { enabled: true, message: '' },
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('hides the alert when disabled but no message is set', () => {
    renderStudioStage({
      projectVoiceStatus: { enabled: false, message: '' },
    });

    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });
});

// ---------------------------------------------------------------------------
// RST-5: canCommitSourceText surfaces in RenderControlsStrip

describe('RST-5 — StudioStage commit-source-text path', () => {
  it('passes canCommitSourceText=true when there are unsaved text changes', () => {
    renderStudioStage({}, { hasUnsavedChanges: true });

    expect(screen.getByTestId('render-controls-strip')).toHaveAttribute(
      'data-can-commit-source-text',
      'true',
    );
  });

  it('passes canCommitSourceText=false when there are no unsaved changes', () => {
    renderStudioStage({}, { hasUnsavedChanges: false });

    expect(screen.getByTestId('render-controls-strip')).toHaveAttribute(
      'data-can-commit-source-text',
      'false',
    );
  });

  it('clicking Commit Changes triggers handleRequestResyncPreview', () => {
    const handleRequestResyncPreview = vi.fn();
    renderStudioStage({}, { hasUnsavedChanges: true, handleRequestResyncPreview });

    fireEvent.click(screen.getByTestId('commit-source-text-btn'));
    expect(handleRequestResyncPreview).toHaveBeenCalledTimes(1);
  });
});
