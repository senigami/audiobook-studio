import { useEffect, useMemo, useState } from 'react';
import { TempCharacterModal } from '@/pages/Book/studio/TempCharacterModal';
import { useSearchParams } from 'react-router-dom';
import { AlignLeft, AlertTriangle, BookOpen, Eye, Hash } from 'lucide-react';
import { ConfirmModal } from '@/components/overlays/ConfirmModal';
import { InlineEdit } from '@/components/forms/InlineEdit';
import { useBookDataContext } from '@/pages/Book/BookDataContext';
import { selectChapterEditorJobs } from '@/pages/Book/lib/chapterJobs';
import { AnalysisStrip } from '@/pages/Book/studio/AnalysisStrip';
import { CastPalette } from '@/pages/Book/studio/CastPalette';
import { StudioHeaderActions } from '@/pages/Book/studio/StudioHeaderActions';
import { RenderControlsStrip } from '@/pages/Book/studio/RenderControlsStrip';
import { useStudioChapter } from '@/pages/Book/studio/useStudioChapter';
import { QueueNotice } from '@/pages/ChapterEditor/components/QueueNotice';
import { ResyncPreviewModal } from '@/pages/ChapterEditor/components/ResyncPreviewModal';
import { ScriptView } from '@/pages/ChapterEditor/components/ScriptView';
import { ScriptViewFallback } from '@/pages/ChapterEditor/components/ScriptViewFallback';

export function StudioStage() {
  const {
    bookId,
    chapters,
    jobs,
    speakerProfiles,
    speakers,
    engines,
    segmentProgress,
    selectedVoice,
    segmentUpdate,
    chapterUpdate,
    projectVoiceStatus,
  } = useBookDataContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState<'book' | 'script'>('book');
  const [showSafeText, setShowSafeText] = useState(false);
  const [showNumbers, setShowNumbers] = useState(false);
  const [tempModalOpen, setTempModalOpen] = useState(false);

  const resolvedChapterId = searchParams.get('chapter') || chapters[0]?.id || null;
  const selectedChapter = useMemo(
    () => chapters.find((chapter) => chapter.id === resolvedChapterId) || null,
    [chapters, resolvedChapterId],
  );

  useEffect(() => {
    if (searchParams.get('chapter') || !chapters[0]?.id) {
      return;
    }

    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set('chapter', chapters[0].id);
    setSearchParams(nextSearchParams, { replace: true });
  }, [chapters, searchParams, setSearchParams]);

  const activeChapterId = resolvedChapterId || chapters[0]?.id || null;
  const { job, chapterJobs } = selectChapterEditorJobs({
    jobs,
    projectId: bookId,
    chapterId: activeChapterId,
    chapterAudioStatus: selectedChapter?.audio_status,
    chapterHasRenderedOutput: Boolean(selectedChapter?.has_wav || selectedChapter?.has_mp3 || selectedChapter?.has_m4a),
  });

  const studio = useStudioChapter({
    chapterId: activeChapterId || '',
    projectId: bookId,
    speakerProfiles,
    speakers,
    engines,
    job,
    chapterJobs,
    segmentProgress,
    selectedVoice,
    segmentUpdate,
    chapterUpdate,
  });

  const {
    chapter,
    title,
    setTitle,
    text,
    analysis,
    analyzing,
    scriptViewData,
    scriptViewLoading,
    segments,
    characters,
    handleGenerateWithFallback,
    firstSpanGroupNumber,
    handleScriptAssign,
    handleScriptAssignRange,
    effectivePendingSegmentIds,
    chapterRenderRenderingSegmentIds,
    chapterRenderQueuedSegmentIds,
    chapterRenderRenderingBatchProgressById,
    playingSegmentId,
    playingSegmentIds,
    playbackQueue,
    playSegment,
    handleSave,
    saving,
    submitting,
    hasUnsavedChanges,
    exportingFormat,
    queueButtonLabel,
    queueButtonTitle,
    handleRequestResyncPreview,
    handleConfirmResync,
    handleExportAudio,
    handleCopyDebugState,
    handleQueue,
    handleStopAll,
    status,
    setLiveBarSegmentProgress,
    handleProgressBarDebugSnapshot,
    confirmConfig,
    isPreviewingResync,
    resyncPreviewData,
    isResyncing,
    queueNotice,
    pageHandoff,
    setIsPreviewingResync,
    setConfirmConfig,
    loadChapter,
    selectedCharacterId,
    setSelectedCharacterId,
    selectedProfileName,
    setSelectedProfileName,
    expandedCharacterId,
    setExpandedCharacterId,
    handleUpdateCharacterColor,
    handleCreateTempCharacter,
    handlePromoteCharacter,
    handleDeleteCharacter,
    renderGroupCount,
    handleVoiceChange,
    chapterDefaultVoiceLabel,
    chapterDefaultVoiceName,
    availableVoices,
  } = studio;

  const activeChapterIndex = useMemo(
    () => chapters.findIndex((chapter) => chapter.id === activeChapterId),
    [activeChapterId, chapters],
  );
  const previousChapterId = activeChapterIndex > 0 ? chapters[activeChapterIndex - 1]?.id ?? null : null;
  const nextChapterId = activeChapterIndex >= 0 && activeChapterIndex < chapters.length - 1
    ? chapters[activeChapterIndex + 1]?.id ?? null
    : null;

  const navigateToChapter = async (nextId: string | null) => {
    if (!nextId) return;
    const saved = await handleSave(title, text);
    if (!saved) return;
    const nextSearchParams = new URLSearchParams(searchParams);
    nextSearchParams.set('chapter', nextId);
    setSearchParams(nextSearchParams, { replace: true });
  };

  if (!activeChapterId) {
    return (
      <section className="book-stage-placeholder" data-testid="stage-studio" aria-labelledby="book-stage-studio">
        <h1 id="book-stage-studio">Studio</h1>
        <p>Loading chapter...</p>
      </section>
    );
  }

  return (
    <section className="book-stage-studio" data-testid="stage-studio" aria-label="Studio">
      {!projectVoiceStatus.enabled && projectVoiceStatus.message && (
        <div className="studio-stage__engine-warning" role="alert">
          <AlertTriangle size={18} aria-hidden="true" />
          <div>
            <strong>Project Default Voice Engine Unavailable</strong>
            <span>{projectVoiceStatus.message}</span>
          </div>
        </div>
      )}

      <div className="studio-stage__toolbar" style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem', marginBottom: '0.75rem', flexWrap: 'wrap' }}>
        <div className="studio-stage__title">
          <InlineEdit
            value={title}
            onSave={(newTitle) => setTitle(newTitle)}
          />
        </div>

        <div className="script-view-toggle-group">
          <button
            type="button"
            className={`script-view-toggle-btn ${viewMode === 'book' ? 'active' : ''}`}
            onClick={() => setViewMode('book')}
          >
            <BookOpen size={16} style={{ display: 'inline', marginRight: '6px' }} />
            Book view
          </button>
          <button
            type="button"
            className={`script-view-toggle-btn ${viewMode === 'script' ? 'active' : ''}`}
            onClick={() => setViewMode('script')}
          >
            <AlignLeft size={16} style={{ display: 'inline', marginRight: '6px' }} />
            Script view
          </button>
        </div>

        <div className="script-view-toggle-actions">
          <button
            type="button"
            className={`script-view-pill-toggle ${showSafeText ? 'is-active' : ''}`}
            onClick={() => setShowSafeText((value) => !value)}
            aria-pressed={showSafeText}
            title="Toggle safe text"
          >
            <Eye size={16} />
            <span>Safe text</span>
          </button>
          <button
            type="button"
            className={`script-view-pill-toggle ${showNumbers ? 'is-active' : ''}`}
            onClick={() => setShowNumbers((value) => !value)}
            aria-pressed={showNumbers}
            title="Toggle segment numbers"
          >
            <Hash size={16} />
            <span>#</span>
          </button>
        </div>

        <StudioHeaderActions
          hasUnsavedChanges={hasUnsavedChanges}
          onCommitChanges={handleRequestResyncPreview}
          onPrev={previousChapterId ? () => void navigateToChapter(previousChapterId) : undefined}
          onNext={nextChapterId ? () => void navigateToChapter(nextChapterId) : undefined}
          onExportAudio={(format) => void handleExportAudio(format)}
          exportingFormat={exportingFormat}
          onCopyDebugState={handleCopyDebugState}
        />
      </div>

      <AnalysisStrip
        bookId={bookId}
        chapterId={activeChapterId}
        chapter={chapter}
        analysis={analysis}
        analyzing={analyzing}
        segmentsCount={renderGroupCount ?? segments.length}
      />

      <div style={{ display: 'flex', gap: '1rem', alignItems: 'stretch', minHeight: 0 }}>
        <div style={{ flex: 1, minWidth: 0, position: 'relative' }}>
          {selectedCharacterId && selectedCharacterId !== 'CLEAR_ASSIGNMENT' && (
            <div style={{
              position: 'absolute',
              top: -12,
              right: 16,
              zIndex: 5,
              padding: '0.45rem 0.75rem',
              borderRadius: 999,
              border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
              background: 'var(--surface)',
              boxShadow: 'var(--shadow-lg)',
              fontSize: '0.7rem',
              fontWeight: 700,
              color: 'var(--text-primary)',
            }}>
              🖌 painting: {characters.find((char) => char.id === selectedCharacterId)?.name || 'Character'} — click sentences to assign
            </div>
          )}
          {selectedCharacterId === 'CLEAR_ASSIGNMENT' && (
            <div style={{
              position: 'absolute',
              top: -12,
              right: 16,
              zIndex: 5,
              padding: '0.45rem 0.75rem',
              borderRadius: 999,
              border: '1px solid color-mix(in srgb, var(--accent) 35%, transparent)',
              background: 'var(--surface)',
              boxShadow: 'var(--shadow-lg)',
              fontSize: '0.7rem',
              fontWeight: 700,
              color: 'var(--text-primary)',
            }}>
              🖌 clearing — click sentences to revert to narrator
            </div>
          )}

          {scriptViewData ? (
            <ScriptView
              data={scriptViewData}
              characters={characters}
              engines={engines}
              speakerProfiles={speakerProfiles}
              speakers={speakers}
              onGenerateBatch={(spanIds) => void handleGenerateWithFallback(spanIds)}
              groupNumberForSpan={firstSpanGroupNumber}
              pendingSpanIds={effectivePendingSegmentIds}
              renderingSpanIds={chapterRenderRenderingSegmentIds}
              queuedSpanIds={chapterRenderQueuedSegmentIds}
              renderingBatchProgressById={chapterRenderRenderingBatchProgressById}
              playingSpanId={playingSegmentId}
              playingSpanIds={playingSegmentIds}
              onPlaySpan={(spanId) => playSegment(spanId, playbackQueue)}
              onAssign={(spanIds) => handleScriptAssign(spanIds, selectedCharacterId, selectedProfileName, () => setConfirmConfig({
                title: 'Assignment Conflict',
                message: 'This chapter was modified by another process. Please reload to see the latest changes.',
                onConfirm: () => { setConfirmConfig(null); loadChapter('conflict-reload'); },
                confirmText: 'Reload Now',
              }))}
              onAssignRange={(range) => handleScriptAssignRange(range, selectedCharacterId, selectedProfileName, () => setConfirmConfig({
                title: 'Assignment Conflict',
                message: 'This chapter was modified by another process. Please reload to see the latest changes.',
                onConfirm: () => { setConfirmConfig(null); loadChapter('conflict-reload'); },
                confirmText: 'Reload Now',
              }))}
              onAssignToCharacter={(spanIds, characterId, profileName) => handleScriptAssign(spanIds, characterId, profileName, () => setConfirmConfig({
                title: 'Assignment Conflict',
                message: 'This chapter was modified by another process. Please reload to see the latest changes.',
                onConfirm: () => { setConfirmConfig(null); loadChapter('conflict-reload'); },
                confirmText: 'Reload Now',
              }))}
              activeCharacterId={selectedCharacterId}
              viewMode={viewMode}
              onViewModeChange={setViewMode}
              showSafeText={showSafeText}
              onShowSafeTextChange={setShowSafeText}
              showNumbers={showNumbers}
              onShowNumbersChange={setShowNumbers}
              hideToolbarControls
            />
          ) : (
            <ScriptViewFallback loading={scriptViewLoading} textContent={chapter?.text_content || ''} />
          )}
        </div>

        <CastPalette
          characters={characters}
          segments={segments}
          speakers={speakers}
          speakerProfiles={speakerProfiles}
          engines={engines}
          selectedCharacterId={selectedCharacterId}
          setSelectedCharacterId={setSelectedCharacterId}
          selectedProfileName={selectedProfileName}
          setSelectedProfileName={setSelectedProfileName}
          expandedCharacterId={expandedCharacterId}
          setExpandedCharacterId={setExpandedCharacterId}
          onUpdateCharacterColor={handleUpdateCharacterColor}
          currentChapterId={activeChapterId}
          onCreateTempCharacter={() => setTempModalOpen(true)}
          onPromoteCharacter={(characterId) => setConfirmConfig({ title: 'Promote to book cast', message: 'Promote this temp character to the book-wide cast? It will be available in every chapter. This cannot be undone (there is no demote).', confirmText: 'Promote', onConfirm: () => { setConfirmConfig(null); void handlePromoteCharacter(characterId); } })}
          onDeleteCharacter={(characterId) => setConfirmConfig({ title: 'Delete character', message: 'Delete this temp character? Any lines assigned to it will revert to the narrator. This cannot be undone.', confirmText: 'Delete', isDestructive: true, onConfirm: () => { setConfirmConfig(null); void handleDeleteCharacter(characterId); } })}
          localVoice={studio.localVoice}
          handleVoiceChange={handleVoiceChange}
          availableVoices={availableVoices}
          chapterDefaultVoiceLabel={chapterDefaultVoiceLabel}
          chapterDefaultVoiceName={chapterDefaultVoiceName}
        />
      </div>

      <div style={{ marginTop: '0.75rem' }}>
        <RenderControlsStrip
          chapter={chapter as any}
          saving={saving}
          hasUnsavedChanges={hasUnsavedChanges}
          submitting={submitting}
          queueLabel={queueButtonLabel}
          queueTitle={queueButtonTitle}
          onQueue={handleQueue}
          onStopAll={handleStopAll}
          onCopyDebugState={handleCopyDebugState}
          onCommitSourceText={handleRequestResyncPreview}
          canCommitSourceText={hasUnsavedChanges}
          onSegmentDisplayProgress={setLiveBarSegmentProgress}
          onProgressBarDebugSnapshot={handleProgressBarDebugSnapshot}
          status={status}
          handoffState={pageHandoff}
        />
      </div>

      <TempCharacterModal
        isOpen={tempModalOpen}
        onClose={() => setTempModalOpen(false)}
        availableVoices={availableVoices}
        onCreate={(name, voice) => { setTempModalOpen(false); void handleCreateTempCharacter(name, voice); }}
      />

      <ConfirmModal
        isOpen={Boolean(confirmConfig)}
        title={confirmConfig?.title || ''}
        message={confirmConfig?.message || ''}
        onConfirm={() => {
          void confirmConfig?.onConfirm();
          setConfirmConfig(null);
        }}
        onCancel={() => setConfirmConfig(null)}
        isDestructive={confirmConfig?.isDestructive}
        confirmText={confirmConfig?.confirmText}
      />

      <ResyncPreviewModal
        isOpen={isPreviewingResync}
        data={resyncPreviewData}
        loading={isResyncing || (isPreviewingResync && !resyncPreviewData)}
        onConfirm={handleConfirmResync}
        onCancel={() => setIsPreviewingResync(false)}
      />

      {queueNotice && <QueueNotice message={queueNotice} />}
    </section>
  );
}
