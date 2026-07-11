import React from 'react';
import type { Job, SegmentProgress, TtsEngine, SpeakerProfile } from '@/types';
import { ConfirmModal } from '@/components/overlays/ConfirmModal';
import { ChapterTopBar, ChapterScriptToolbar } from '@/pages/ChapterEditor/components/ChapterHeader';
import { EditorTabs } from '@/pages/ChapterEditor/components/EditorTabs';
import { EditTab } from '@/pages/ChapterEditor/components/EditTab';
import { ScriptView } from '@/pages/ChapterEditor/components/ScriptView';
import { ResyncPreviewModal } from '@/pages/ChapterEditor/components/ResyncPreviewModal';
import { CharacterSidebar } from '@/pages/ChapterEditor/components/CharacterSidebar';
import { QueueNotice } from '@/pages/ChapterEditor/components/QueueNotice';
import { ScriptViewFallback } from '@/pages/ChapterEditor/components/ScriptViewFallback';
import { PlaybackControls } from '@/pages/ChapterEditor/components/PlaybackControls';
import { useStudioChapter } from '@/pages/Book/studio/useStudioChapter';

interface ChapterEditorProps {
  chapterId: string;
  projectId: string;
  speakerProfiles: SpeakerProfile[];
  speakers: import('@/types').Speaker[];
  engines?: TtsEngine[];
  job?: Job;
  chapterJobs?: Job[];
  segmentProgress?: Record<string, SegmentProgress>;
  selectedVoice?: string;
  onBack?: () => void;
  onNext?: () => void;
  onPrev?: () => void;
  segmentUpdate?: { chapterId: string; tick: number };
  chapterUpdate?: { chapterId: string; tick: number };
}

export const ChapterEditor: React.FC<ChapterEditorProps> = ({
  chapterId,
  projectId,
  speakerProfiles,
  speakers,
  engines = [],
  job: propJob,
  chapterJobs = [],
  segmentProgress: _segmentProgress = {},
  selectedVoice: externalVoice,
  onNext,
  onPrev,
  segmentUpdate,
  chapterUpdate,
}) => {
  const studio = useStudioChapter({
    chapterId,
    projectId,
    speakerProfiles,
    speakers,
    engines,
    job: propJob,
    chapterJobs,
    selectedVoice: externalVoice,
    segmentUpdate,
    chapterUpdate,
  });

  const {
    chapter,
    title,
    setTitle,
    text,
    setText,
    loading,
    saving,
    submitting,
    localVoice,
    segments,
    characters,
    scriptViewData,
    scriptViewLoading,
    analysis,
    setAnalysis,
    analyzing,
    loadChapter,
    handleSave,
    handleVoiceChange,
    handleScriptAssign,
    handleScriptAssignRange,
    handleUpdateCharacterColor,
    handleGenerate,
    editorTab,
    setEditorTab,
    sourceTextMode,
    setSourceTextMode,
    selectedCharacterId,
    setSelectedCharacterId,
    selectedProfileName,
    setSelectedProfileName,
    expandedCharacterId,
    setExpandedCharacterId,
    exportingFormat,
    queueNotice,
    confirmConfig,
    setConfirmConfig,
    isPreviewingResync,
    setIsPreviewingResync,
    resyncPreviewData,
    isResyncing,
    setLiveBarSegmentProgress,
    renderGroupCount,
    firstSpanGroupNumber,
    effectiveSelectedVoice,
    chapterDefaultVoiceLabel,
    availableVoices,
    chapterRenderPendingSegmentIds,
    chapterRenderDoneSegmentIds,
    pageHandoff,
    chapterRenderRenderingSegmentIds,
    chapterRenderQueuedSegmentIds,
    chapterRenderPreparingSegmentIds,
    chapterRenderRenderingBatchProgressById,
    playingSegmentId,
    playingSegmentIds,
    playSegment,
    stopPlayback,
    togglePause,
    seekTo,
    isPlaying,
    isPaused,
    currentTime,
    duration,
    startSkim,
    stopSkim,
    playbackQueue,
    activePlaybackLabel,
    playbackBlockStartIds,
    currentPlaybackBlockIndex,
    handleRequestResyncPreview,
    handleConfirmResync,
    handleExportAudio,
    queueVoiceStatus,
    queueButtonLabel,
    queueButtonTitle,
    status,
    hasUnsavedChanges,
    handleCopyDebugState,
    handleProgressBarDebugSnapshot,
    handleQueue,
    handleStopAll,
  } = studio;

  if (loading) return <div style={{ padding: '2rem' }}>Loading editor...</div>;
  if (!chapter) return <div style={{ padding: '2rem' }}>Chapter not found.</div>;

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg)', position: 'relative', zIndex: 100 }}>
      <ChapterTopBar
        title={title}
        setTitle={setTitle}
        onPrev={onPrev ? async () => { await handleSave(title, text); onPrev(); } : undefined}
        onNext={onNext ? async () => { await handleSave(title, text); onNext(); } : undefined}
        onSaveWav={() => void handleExportAudio('wav')}
        onSaveMp3={() => void handleExportAudio('mp3')}
        exportingFormat={exportingFormat}
      />

      {!queueVoiceStatus.enabled && queueVoiceStatus.message && (
        <div style={{
          margin: '1rem 1.5rem 0 1.5rem',
          padding: '1rem',
          background: 'var(--error-tint-bg)',
          border: '1px solid var(--error-tint-border)',
          borderRadius: '8px',
          color: 'var(--text-primary)',
          fontSize: '0.875rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.75rem',
          boxShadow: 'var(--shadow-sm)',
        }}>
          <span style={{ fontSize: '1.25rem' }}>⚠️</span>
          <div style={{ flex: 1 }}>
            <strong style={{ display: 'block', marginBottom: '0.25rem', color: 'var(--error)' }}>Voice Engine Unavailable</strong>
            <span>{queueVoiceStatus.message}</span>
          </div>
        </div>
      )}

      <div className="chapter-editor-layout" style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '1.5rem', overflow: 'hidden', minHeight: 0 }}>
          <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
            <EditorTabs
              editorTab={editorTab}
              setEditorTab={(tab) => {
                setEditorTab(tab);
                setSourceTextMode('view');
              }}
              onRequestEditSourceText={() => {
                setConfirmConfig({
                  title: 'Edit Source Text',
                  message: 'Caution: Modifying the source text here will force a complete resynchronization of ALL segments, which may clobber granular assignments and render status if text is shifted. Are you sure you want to proceed?',
                  onConfirm: () => {
                    setConfirmConfig(null);
                    setSourceTextMode('edit');
                  },
                  confirmText: 'Continue to Edit',
                  isDestructive: true,
                });
              }}
              sourceTextMode={sourceTextMode}
            >
              <ChapterScriptToolbar
                chapter={chapter}
                saving={saving}
                hasUnsavedChanges={hasUnsavedChanges}
                submitting={submitting}
                onCopyDebugState={handleCopyDebugState}
                queueLabel={queueButtonLabel}
                queueTitle={queueButtonTitle}
                onQueue={handleQueue}
                onStopAll={handleStopAll}
                onCommitSourceText={handleRequestResyncPreview}
                canCommitSourceText={editorTab === 'edit' && sourceTextMode === 'edit' && (text !== chapter?.text_content)}
                onSegmentDisplayProgress={setLiveBarSegmentProgress}
                onProgressBarDebugSnapshot={handleProgressBarDebugSnapshot}
                status={status}
                handoffState={pageHandoff}
              />
            </EditorTabs>

            {editorTab === 'script' && scriptViewData && (
              <ScriptView
                data={scriptViewData}
                characters={characters}
                engines={engines}
                speakerProfiles={speakerProfiles}
                onGenerateBatch={(sids) => handleGenerate(sids, effectiveSelectedVoice, (msg) => setConfirmConfig({ title: 'Generation Blocked', message: msg, onConfirm: () => {}, confirmText: 'OK' }))}
                pendingSpanIds={chapterRenderPendingSegmentIds}
                renderingSpanIds={chapterRenderRenderingSegmentIds}
                queuedSpanIds={chapterRenderQueuedSegmentIds}
                preparingSpanIds={chapterRenderPreparingSegmentIds}
                liveDoneSpanIds={chapterRenderDoneSegmentIds}
                renderingBatchProgressById={chapterRenderRenderingBatchProgressById}
                playingSpanId={playingSegmentId}
                playingSpanIds={playingSegmentIds}
                onPlaySpan={(sid) => playSegment(sid, playbackQueue)}
                onAssign={(sids) => handleScriptAssign(sids, selectedCharacterId, selectedProfileName, () => setConfirmConfig({
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
                onAssignToCharacter={(sids, cid, pname) => handleScriptAssign(sids, cid, pname, () => setConfirmConfig({
                  title: 'Assignment Conflict',
                  message: 'This chapter was modified by another process. Please reload to see the latest changes.',
                  onConfirm: () => { setConfirmConfig(null); loadChapter('conflict-reload'); },
                  confirmText: 'Reload Now',
                }))}
                activeCharacterId={selectedCharacterId}
                speakers={speakers}
                groupNumberForSpan={firstSpanGroupNumber}
              />
            )}
            {editorTab === 'script' && !scriptViewData && (
              <ScriptViewFallback loading={scriptViewLoading} textContent={chapter?.text_content || text} />
            )}
            {editorTab === 'edit' && (
              <EditTab
                text={text}
                setText={setText}
                analysis={analysis}
                setAnalysis={setAnalysis}
                analyzing={analyzing}
                chapter={chapter}
                segmentsCount={renderGroupCount ?? segments.length}
                hasUnsavedChanges={hasUnsavedChanges}
                sourceTextMode={sourceTextMode}
              />
            )}
          </div>
        </div>

        <div className="chapter-editor-sidebar-wrapper">
          <CharacterSidebar
            characters={characters}
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
            segmentsCount={renderGroupCount ?? segments.length}
            wordCount={chapter.word_count || 0}
            selectedVoice={localVoice}
            onVoiceChange={(v) => handleVoiceChange(v, (msg) => setConfirmConfig({ title: 'Voice Update Failed', message: msg, onConfirm: () => {}, confirmText: 'OK' }))}
            availableVoices={availableVoices}
            defaultVoiceLabel={chapterDefaultVoiceLabel}
            submitting={submitting}
          />
        </div>
      </div>

      <div style={{ padding: '0 1.5rem 1.5rem 1.5rem', flexShrink: 0 }}>
        <PlaybackControls
          isPlaying={isPlaying}
          isPaused={isPaused}
          currentTime={currentTime}
          duration={duration}
          onSeek={seekTo}
          activeLabel={activePlaybackLabel}
          onPlay={() => {
            if (isPaused && playingSegmentId) togglePause();
            else if (playbackBlockStartIds.length > 0) playSegment(playingSegmentId || playbackBlockStartIds[0], playbackQueue);
          }}
          onPause={togglePause}
          onStop={stopPlayback}
          onPrev={currentPlaybackBlockIndex > 0 ? () => playSegment(playbackBlockStartIds[currentPlaybackBlockIndex - 1], playbackQueue) : undefined}
          onNext={currentPlaybackBlockIndex >= 0 && currentPlaybackBlockIndex < playbackBlockStartIds.length - 1 ? () => playSegment(playbackBlockStartIds[currentPlaybackBlockIndex + 1], playbackQueue) : undefined}
          onSkimStart={startSkim}
          onSkimStop={stopSkim}
          hasPrev={currentPlaybackBlockIndex > 0}
          hasNext={currentPlaybackBlockIndex >= 0 && currentPlaybackBlockIndex < playbackBlockStartIds.length - 1}
        />
      </div>

      <ConfirmModal
        isOpen={!!confirmConfig}
        title={confirmConfig?.title || ''}
        message={confirmConfig?.message || ''}
        onConfirm={() => { confirmConfig?.onConfirm(); setConfirmConfig(null); }}
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
    </div>
  );
};
