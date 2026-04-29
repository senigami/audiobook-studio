import React, { useState, useEffect, useMemo } from 'react';
import { ConfirmModal } from './ConfirmModal';
import { api } from '../api';
import type { Job, SegmentProgress, TtsEngine, SpeakerProfile } from '../types';

// Extracted Components
import { ChapterHeader } from './chapter/ChapterHeader';
import { EditorTabs } from './chapter/EditorTabs';
import { EditTab } from './chapter/EditTab';
import { PerformanceTab } from './chapter/PerformanceTab';
import { PreviewTab } from './chapter/PreviewTab';
import { ProductionTab } from './chapter/ProductionTab';
import { ScriptView } from './chapter/ScriptView';
import { ResyncPreviewModal, type ResyncPreviewData } from './chapter/ResyncPreviewModal';
import { CharacterSidebar } from './chapter/CharacterSidebar';
import { QueueNotice } from './chapter/QueueNotice';
import { ScriptViewFallback } from './chapter/ScriptViewFallback';

// Extracted Hooks
import { useChapterPlayback } from '../hooks/useChapterPlayback';
import { useChapterEditor } from '../hooks/useChapterEditor';
import { buildVoiceOptions, getDefaultVoiceProfileName, getVoiceOptionLabel } from '../utils/voiceProfiles';
import { buildChunkGroups } from '../utils/chunkGroups';
import { 
  resolveVoiceEngineStatus, 
  downloadBlob, 
  formatExportFilename 
} from '../utils/chapterEditorHelpers';

interface ChapterEditorProps {
  chapterId: string;
  projectId: string;
  speakerProfiles: SpeakerProfile[];
  speakers: import('../types').Speaker[];
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
  job, 
  chapterJobs = [],
  segmentProgress = {},
  selectedVoice: externalVoice, 
  onNext, 
  onPrev, 
  segmentUpdate,
  chapterUpdate
}) => {
  const {
    chapter,
    title, setTitle,
    text, setText,
    loading,
    saving,
    submitting,
    localVoice,
    segments,
    characters,
    productionBlocks,
    renderBatches,
    productionBaseRevisionId,
    scriptViewData,
    scriptViewLoading,
    generatingSegmentIds,
    analysis, setAnalysis,
    analyzing, loadingVoiceChunks,
    ensureVoiceChunks, 
    loadChapter,
    reloadLatestBlocks,
    generatingSegmentJob,
    liveSegmentJobIds,
    handleSave,
    handleVoiceChange,
    hasRenderedOutput,
    saveProductionBlocks,
    saveConflictError,
    handleScriptAssign,
    handleScriptAssignRange,
    handleParagraphBulkAssign,
    handleParagraphBulkReset,
    handleUpdateCharacterColor,
    handleGenerate,
    executeQueue
  } = useChapterEditor(chapterId, projectId, speakerProfiles, speakers, engines, chapterJobs, segmentUpdate, chapterUpdate);

  const [editorTab, setEditorTab] = useState<'script' | 'edit' | 'preview' | 'production' | 'performance'>('script');
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [selectedProfileName, setSelectedProfileName] = useState<string | null>(null);
  const [expandedCharacterId, setExpandedCharacterId] = useState<string | null>(null);
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);
  const [activeBlockId, setActiveBlockId] = useState<string | null>(null);
  const [exportingFormat, setExportingFormat] = useState<'wav' | 'mp3' | null>(null);
  const [queueNotice, setQueueNotice] = useState<string | null>(null);
  const [isPreviewingResync, setIsPreviewingResync] = useState(false);
  const [resyncPreviewData, setResyncPreviewData] = useState<ResyncPreviewData | null>(null);
  const [isResyncing, setIsResyncing] = useState(false);
  const [sourceTextMode, setSourceTextMode] = useState<'view' | 'edit'>('view');
  
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    isDestructive?: boolean;
    confirmText?: string;
  } | null>(null);

  const effectiveSelectedVoice = localVoice || externalVoice || '';
  const chapterDefaultVoiceLabel = useMemo(() => {
    const fallbackVoiceValue = externalVoice || getDefaultVoiceProfileName(speakerProfiles || []) || '';
    const fallbackVoiceLabel = getVoiceOptionLabel(fallbackVoiceValue, speakerProfiles || [], speakers || [], engines, characters);
    return fallbackVoiceLabel ? `Use Project Default (${fallbackVoiceLabel})` : 'Use Project Default';
  }, [externalVoice, speakerProfiles, speakers, engines, characters]);

  const selectedVoiceLabel = useMemo(() => {
    const selected = localVoice || externalVoice;
    if (!selected) return '';
    return getVoiceOptionLabel(selected, speakerProfiles || [], speakers || [], engines, characters) || selected;
  }, [localVoice, externalVoice, speakerProfiles, speakers, engines, characters]);

  const availableVoices = useMemo(() => {
    return buildVoiceOptions(speakerProfiles || [], speakers || [], engines, characters);
  }, [speakers, speakerProfiles, engines, characters]);

  const chunkGroups = useMemo(() => {
    return buildChunkGroups(segments, characters, effectiveSelectedVoice, speakerProfiles);
  }, [segments, characters, effectiveSelectedVoice, speakerProfiles]);

  const queuedSegmentJobIds = useMemo(() => {
    const ids = new Set<string>();
    for (const chapterJob of chapterJobs) {
      if (!['queued', 'preparing'].includes(chapterJob.status)) continue;
      for (const segmentId of chapterJob.segment_ids || []) {
        ids.add(segmentId);
      }
    }
    return ids;
  }, [chapterJobs]);

  const effectivePendingSegmentIds = useMemo(() => {
    const ids = new Set<string>(generatingSegmentIds);
    for (const segmentId of liveSegmentJobIds) ids.add(segmentId);
    return ids;
  }, [generatingSegmentIds, liveSegmentJobIds]);

  const { playingSegmentId, playingSegmentIds, playSegment, stopPlayback } = useChapterPlayback(
    projectId, segments, chunkGroups, effectivePendingSegmentIds, 
    (sids) => handleGenerate(sids, effectiveSelectedVoice, (msg) => setConfirmConfig({ title: 'Generation Blocked', message: msg, onConfirm: () => {}, confirmText: 'OK' }))
  );

  useEffect(() => {
    if (loading) return;
    if (editorTab === 'edit') {
      if (title !== chapter?.title) {
        const timer = setTimeout(() => handleSave(title, chapter?.text_content), 1500);
        return () => clearTimeout(timer);
      }
      return;
    }
    const timer = setTimeout(() => handleSave(title, text), 1500);
    return () => clearTimeout(timer);
  }, [title, text, editorTab, loading, chapter, handleSave]);

  const handleRequestResyncPreview = async () => {
    if (!text || text === chapter?.text_content) return;
    setIsPreviewingResync(true);
    setResyncPreviewData(null);
    try {
      const result = await api.previewSourceTextResync(chapterId, text);
      setResyncPreviewData(result);
    } catch (e) {
      console.error("Preview failed", e);
      setIsPreviewingResync(false);
    }
  };

  const handleConfirmResync = async () => {
    setIsResyncing(true);
    try {
      const success = await handleSave(title, text);
      if (success) setIsPreviewingResync(false);
    } finally {
      setIsResyncing(false);
    }
  };

  const handleExportAudio = async (format: 'wav' | 'mp3') => {
    setExportingFormat(format);
    try {
      const blob = await api.exportChapterAudio(chapterId, format);
      const filename = formatExportFilename(chapter?.title || '', chapterId);
      downloadBlob(blob, `${filename}.${format}`);
    } catch (e) {
      console.error(e);
      setConfirmConfig({
        title: 'Export Failed',
        message: e instanceof Error ? e.message : `Could not save ${format.toUpperCase()} audio.`,
        onConfirm: () => {},
        confirmText: 'OK'
      });
    } finally {
      setExportingFormat(null);
    }
  };

  const hasRenderedSegments = segments.some(s => s.audio_status === 'done' || !!s.audio_file_path);
  const hasPartialSegmentProgress = hasRenderedSegments && !hasRenderedOutput;
  const shouldWarnBeforeRequeue = hasRenderedOutput;
  const anyEnginesEnabled = useMemo(() => {
    if (!engines || engines.length === 0) return true;
    return engines.some(e => e.enabled && e.status === 'ready');
  }, [engines]);

  const queueVoiceStatus = resolveVoiceEngineStatus(effectiveSelectedVoice || getDefaultVoiceProfileName(speakerProfiles || []), engines, speakerProfiles);
  const queueButtonLabel = !anyEnginesEnabled ? 'Disabled' : !queueVoiceStatus.enabled ? 'Unavailable' : (shouldWarnBeforeRequeue ? 'Rebuild' : hasPartialSegmentProgress ? 'Complete' : 'Queue');
  const queueButtonTitle = !anyEnginesEnabled ? 'All TTS engines are disabled in Settings' : (queueVoiceStatus.enabled ? (shouldWarnBeforeRequeue ? 'Rebuild Chapter' : hasPartialSegmentProgress ? 'Complete Chapter Audio' : 'Queue Chapter') : queueVoiceStatus.message || 'Selected voice is unavailable');

  useEffect(() => {
    if (!queueNotice) return;
    const timer = setTimeout(() => setQueueNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [queueNotice]);

  if (loading) return <div style={{ padding: '2rem' }}>Loading editor...</div>;
  if (!chapter) return <div style={{ padding: '2rem' }}>Chapter not found.</div>;

  const hasUnsavedChanges = (title || "").trim() !== (chapter.title || "").trim() || 
                           (text || "").replace(/\r\n/g, '\n') !== (chapter.text_content || "").replace(/\r\n/g, '\n');

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg)', position: 'relative', zIndex: 100 }}>
      <ChapterHeader 
        chapter={chapter} title={title} setTitle={setTitle} saving={saving} hasUnsavedChanges={hasUnsavedChanges}
        onPrev={onPrev ? async () => { await handleSave(); onPrev(); } : undefined}
        onNext={onNext ? async () => { await handleSave(); onNext(); } : undefined}
        selectedVoice={localVoice} selectedVoiceLabel={selectedVoiceLabel} 
        onVoiceChange={(v) => handleVoiceChange(v, (msg) => setConfirmConfig({ title: 'Voice Update Failed', message: msg, onConfirm: () => {}, confirmText: 'OK' }))} 
        availableVoices={availableVoices} defaultVoiceLabel={chapterDefaultVoiceLabel}
        submitting={submitting} queueLocked={submitting || !anyEnginesEnabled} queuePending={false} job={job} generatingJob={generatingSegmentJob} generatingSegmentIdsCount={effectivePendingSegmentIds.size}
        queueLabel={queueButtonLabel}
        queueTitle={queueButtonTitle}
        onSaveWav={() => void handleExportAudio('wav')}
        onSaveMp3={() => void handleExportAudio('mp3')}
        exportingFormat={exportingFormat}
        onQueue={() => {
            const onBlocked = (msg: string) => setConfirmConfig({ title: 'Queue Blocked', message: msg, onConfirm: () => {}, confirmText: 'OK' });
            const onSuccess = (msg: string) => setQueueNotice(msg);
            
            if (shouldWarnBeforeRequeue) {
                setConfirmConfig({
                    title: 'Requeue Completed Chapter',
                    message: 'All audio for this chapter is already complete. Rebuilding will delete the existing final render and regenerate from the current segments. Continue?',
                    onConfirm: async () => { setConfirmConfig(null); await executeQueue(effectiveSelectedVoice, onBlocked, onSuccess); },
                    confirmText: 'Yes, Rebuild It',
                    isDestructive: true
                });
            } else if (chapter?.char_count && chapter.char_count > 50000) {
                setConfirmConfig({
                    title: 'Large Chapter Warning',
                    message: `Chapter is long (${chapter.char_count.toLocaleString()} chars). Queue anyway?`,
                    onConfirm: async () => { setConfirmConfig(null); await executeQueue(effectiveSelectedVoice, onBlocked, onSuccess); },
                    confirmText: 'Yes, Queue It',
                    isDestructive: false
                });
            } else executeQueue(effectiveSelectedVoice, onBlocked, onSuccess);
        }}
        onStopAll={async () => {
            try { await api.cancelChapterGeneration(chapterId); loadChapter('cancel'); }
            catch (e) { console.error("Cancel failed", e); }
        }}
        onCommitSourceText={handleRequestResyncPreview}
        canCommitSourceText={editorTab === 'edit' && sourceTextMode === 'edit' && (text !== chapter?.text_content)}
      />

      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '1.5rem', overflow: 'hidden', minHeight: 0 }}>
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <EditorTabs 
                  editorTab={editorTab} setEditorTab={(tab) => {
                    setEditorTab(tab);
                    setSourceTextMode('view');
                  }} onSave={handleSave} 
                  onEnsureVoiceChunks={() => ensureVoiceChunks(handleSave)}
                  onRequestEditSourceText={() => {
                    setConfirmConfig({
                      title: 'Edit Source Text',
                      message: 'Caution: Modifying the source text here will force a complete resynchronization of ALL segments, which may clobber granular assignments and render status if text is shifted. Are you sure you want to proceed?',
                      onConfirm: () => {
                        setConfirmConfig(null);
                        setSourceTextMode('edit');
                      },
                      confirmText: 'Continue to Edit',
                      isDestructive: true
                    });
                  }}
                  analysis={analysis} loadingVoiceChunks={loadingVoiceChunks}
                  sourceTextMode={sourceTextMode}
                />
                
                {editorTab === 'script' && scriptViewData && (
                  <ScriptView
                    data={scriptViewData}
                    characters={characters}
                    engines={engines}
                    speakerProfiles={speakerProfiles}
                    onGenerateBatch={(sids) => handleGenerate(sids, effectiveSelectedVoice, (msg) => setConfirmConfig({ title: 'Generation Blocked', message: msg, onConfirm: () => {}, confirmText: 'OK' }))}
                    pendingSpanIds={effectivePendingSegmentIds}
                    playingSpanId={playingSegmentId}
                    playingSpanIds={playingSegmentIds}
                    onPlaySpan={(sid) => playSegment(sid, segments.map(s => s.id))}
                    onAssign={(sids) => handleScriptAssign(sids, selectedCharacterId, selectedProfileName, () => setConfirmConfig({
                      title: 'Assignment Conflict',
                      message: 'This chapter was modified by another process. Please reload to see the latest changes.',
                      onConfirm: () => { setConfirmConfig(null); loadChapter('conflict-reload'); },
                      confirmText: 'Reload Now'
                    }))}
                    onAssignRange={(range) => handleScriptAssignRange(range, selectedCharacterId, selectedProfileName, () => setConfirmConfig({
                      title: 'Assignment Conflict',
                      message: 'This chapter was modified by another process. Please reload to see the latest changes.',
                      onConfirm: () => { setConfirmConfig(null); loadChapter('conflict-reload'); },
                      confirmText: 'Reload Now'
                    }))}
                    onAssignToCharacter={(sids, cid, pname) => handleScriptAssign(sids, cid, pname, () => setConfirmConfig({
                      title: 'Assignment Conflict',
                      message: 'This chapter was modified by another process. Please reload to see the latest changes.',
                      onConfirm: () => { setConfirmConfig(null); loadChapter('conflict-reload'); },
                      confirmText: 'Reload Now'
                    }))}
                    activeCharacterId={selectedCharacterId}
                    speakers={speakers}
                  />
                )}
                {editorTab === 'script' && !scriptViewData && (
                  <ScriptViewFallback loading={scriptViewLoading} textContent={chapter?.text_content || text} />
                )}
                {editorTab === 'edit' && (
                  <EditTab 
                    text={text} setText={setText} analysis={analysis} setAnalysis={setAnalysis} 
                    analyzing={analyzing} chapter={chapter} segmentsCount={segments.length} 
                    hasUnsavedChanges={hasUnsavedChanges}
                    sourceTextMode={sourceTextMode}
                  />
                )}
                {editorTab === 'performance' && (
                  <PerformanceTab 
                    chunkGroups={chunkGroups} characters={characters} playingSegmentId={playingSegmentId} 
                    playbackQueue={segments.map(s => s.id)} generatingSegmentIds={generatingSegmentIds} queuedSegmentIds={queuedSegmentJobIds}
                    allSegmentIds={segments.map(s => s.id)} segments={segments}
                    onPlay={playSegment} onStop={stopPlayback} onGenerate={(sids) => handleGenerate(sids, effectiveSelectedVoice, (msg) => setConfirmConfig({ title: 'Generation Blocked', message: msg, onConfirm: () => {}, confirmText: 'OK' }))}
                    generatingJob={generatingSegmentJob}
                    segmentProgress={segmentProgress}
                  />
                )}
                {editorTab === 'preview' && <PreviewTab analysis={analysis} analyzing={analyzing} />}
                {editorTab === 'production' && (
                  <ProductionTab 
                    chapterId={chapterId}
                    blocks={productionBlocks}
                    renderBatches={renderBatches}
                    baseRevisionId={productionBaseRevisionId}
                    characters={characters}
                    speakerProfiles={speakerProfiles}
                    selectedCharacterId={selectedCharacterId}
                    selectedProfileName={selectedProfileName}
                    hoveredBlockId={hoveredBlockId}
                    setHoveredBlockId={setHoveredBlockId}
                    activeBlockId={activeBlockId}
                    setActiveBlockId={setActiveBlockId}
                    onBulkAssign={(sids) => handleParagraphBulkAssign(sids, selectedCharacterId, selectedProfileName)}
                    onBulkReset={handleParagraphBulkReset}
                    onSaveBlocks={saveProductionBlocks}
                    onGenerateBatch={(sids) => handleGenerate(sids, effectiveSelectedVoice, (msg) => setConfirmConfig({ title: 'Generation Blocked', message: msg, onConfirm: () => {}, confirmText: 'OK' }))}
                    saveConflictError={saveConflictError}
                    onReloadBlocks={reloadLatestBlocks}
                    pendingSegmentIds={effectivePendingSegmentIds}
                    queuedSegmentIds={queuedSegmentJobIds}
                    segments={segments}
                    segmentsCount={segments.length}
                  />
                )}
            </div>
        </div>

        <CharacterSidebar 
            characters={characters} speakers={speakers} speakerProfiles={speakerProfiles} engines={engines}
            selectedCharacterId={selectedCharacterId} setSelectedCharacterId={setSelectedCharacterId}
            selectedProfileName={selectedProfileName} setSelectedProfileName={setSelectedProfileName}
            expandedCharacterId={expandedCharacterId} setExpandedCharacterId={setExpandedCharacterId}
            onUpdateCharacterColor={handleUpdateCharacterColor}
            segmentsCount={segments.length} wordCount={chapter.word_count || 0}
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
