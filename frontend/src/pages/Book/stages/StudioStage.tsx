import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlignLeft, BookOpen, Eye, Hash } from 'lucide-react';
import { useBookDataContext } from '@/pages/Book/BookDataContext';
import { selectChapterEditorJobs } from '@/pages/Book/lib/chapterJobs';
import { CastPalette } from '@/pages/Book/studio/CastPalette';
import { useStudioChapter } from '@/pages/Book/studio/useStudioChapter';
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
  } = useBookDataContext();
  const [searchParams, setSearchParams] = useSearchParams();
  const [viewMode, setViewMode] = useState<'book' | 'script'>('book');
  const [showSafeText, setShowSafeText] = useState(false);
  const [showNumbers, setShowNumbers] = useState(false);

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
    scriptViewData,
    scriptViewLoading,
    segments,
    characters,
    handleGenerate,
    handleScriptAssign,
    handleScriptAssignRange,
    effectiveSelectedVoice,
    effectivePendingSegmentIds,
    chapterRenderRenderingSegmentIds,
    chapterRenderQueuedSegmentIds,
    chapterRenderRenderingBatchProgressById,
    playingSegmentId,
    playingSegmentIds,
    playbackQueue,
    playSegment,
    setConfirmConfig,
    loadChapter,
    selectedCharacterId,
    setSelectedCharacterId,
    selectedProfileName,
    setSelectedProfileName,
    expandedCharacterId,
    setExpandedCharacterId,
    handleUpdateCharacterColor,
    handleVoiceChange,
    availableVoices,
    chapterDefaultVoiceLabel,
    localVoice,
  } = studio;

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
      <div className="studio-stage__toolbar" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
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
      </div>

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
              boxShadow: '0 8px 24px rgba(15, 23, 42, 0.08)',
              fontSize: '0.7rem',
              fontWeight: 700,
              color: 'var(--text-primary)',
            }}>
              🖌 painting: {characters.find((char) => char.id === selectedCharacterId)?.name || 'Character'} — click sentences to assign
            </div>
          )}

          {scriptViewData ? (
            <ScriptView
              data={scriptViewData}
              characters={characters}
              engines={engines}
              speakerProfiles={speakerProfiles}
              speakers={speakers}
              onGenerateBatch={(spanIds) => void handleGenerate(spanIds, effectiveSelectedVoice, () => {})}
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
          selectedVoice={localVoice}
          onVoiceChange={(nextVoice) => handleVoiceChange(nextVoice, (msg) => setConfirmConfig({
            title: 'Voice Update Failed',
            message: msg,
            onConfirm: () => {},
            confirmText: 'OK',
          }))}
          availableVoices={availableVoices}
          defaultVoiceLabel={chapterDefaultVoiceLabel}
        />
      </div>
    </section>
  );
}
