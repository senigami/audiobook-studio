import React, { useState, useEffect, useMemo } from 'react';
import { ConfirmModal } from '@/components/overlays/ConfirmModal';
import { api } from '@/api';
import type { Job, SegmentProgress, TtsEngine, SpeakerProfile } from '@/types';

// Extracted Components
import { ChapterHeader } from '@/pages/ChapterEditor/components/ChapterHeader';
import { EditorTabs } from '@/pages/ChapterEditor/components/EditorTabs';
import { EditTab } from '@/pages/ChapterEditor/components/EditTab';
import { PerformanceTab } from '@/pages/ChapterEditor/components/PerformanceTab';
import { PreviewTab } from '@/pages/ChapterEditor/components/PreviewTab';
import { ProductionTab } from '@/pages/ChapterEditor/components/ProductionTab';
import { ScriptView } from '@/pages/ChapterEditor/components/ScriptView';
import { ResyncPreviewModal, type ResyncPreviewData } from '@/pages/ChapterEditor/components/ResyncPreviewModal';
import { CharacterSidebar } from '@/pages/ChapterEditor/components/CharacterSidebar';
import { QueueNotice } from '@/pages/ChapterEditor/components/QueueNotice';
import { ScriptViewFallback } from '@/pages/ChapterEditor/components/ScriptViewFallback';

// Extracted Hooks
import { useChapterPlayback } from '@/hooks/useChapterPlayback';
import { useChapterEditor } from '@/hooks/useChapterEditor';
import { buildVoiceOptions, getDefaultVoiceProfileName, getVoiceOptionLabel } from '@/utils/voiceProfiles';
import { buildChunkGroups } from '@/utils/chunkGroups';

import { 
  resolveVoiceEngineStatus, 
  downloadBlob, 
  formatExportFilename 
} from '@/utils/chapterEditorHelpers';

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
  // Tracks the live interpolated display value from the header's PredictiveProgressBar
  // so letter animation stays frame-accurate with the visual bar.
  const [liveBarSegmentProgress, setLiveBarSegmentProgress] = useState(0);

  
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

  const job = propJob || generatingSegmentJob;
  const isChapterProcessing = useMemo(() => {
    return !!job && ['queued', 'preparing', 'running', 'finalizing'].includes(job.status)
      || chapter?.audio_status === 'processing'
      || chapterJobs.some(chapterJob => ['queued', 'preparing', 'running', 'finalizing'].includes(chapterJob.status));
  }, [job, chapter?.audio_status, chapterJobs]);


  const chapterRenderActiveSegmentId = job?.active_segment_id || generatingSegmentJob?.active_segment_id || null;

  // When the active segment changes the header bar remounts with key={...segmentId...} and
  // resets to 0. Mirror that reset here so letters don't show stale progress.
  useEffect(() => {
    setLiveBarSegmentProgress(0);
  }, [chapterRenderActiveSegmentId]);

  const chapterRenderActiveBatchSegmentIds = useMemo(() => {
    if (!chapterRenderActiveSegmentId) return new Set<string>();

    const activeBatch = scriptViewData?.render_batches?.find(batch =>
      batch.span_ids.includes(chapterRenderActiveSegmentId)
    );

    if (!activeBatch) {
      return new Set([chapterRenderActiveSegmentId]);
    }

    return new Set(activeBatch.span_ids);
  }, [chapterRenderActiveSegmentId, scriptViewData?.render_batches]);

  const chapterRenderPendingSegmentIds = useMemo(() => {
    const ids = new Set<string>(effectivePendingSegmentIds);

    if (!isChapterProcessing) return ids;

    if (ids.size === 0) {
      for (const segment of segments) {
        if (segment.audio_status === 'done' || segment.audio_file_path) continue;
        ids.add(segment.id);
      }
    }

    return ids;
  }, [effectivePendingSegmentIds, isChapterProcessing, segments]);

  const chapterRenderRenderingSegmentIds = useMemo(() => {
    const ids = new Set<string>();
    if (!isChapterProcessing) return ids;
    
    // 1. Add optimistic highlights for segments being queued, 
    // but only if they aren't already being handled by an active job's batch rendering
    if (generatingSegmentIds.size > 0) {
      for (const id of generatingSegmentIds) {
        // If this segment is part of an active job, we let the job-based 
        // batch highlighting logic below handle it to ensure finished spans 
        // in the job correctly lose their highlight.
        if (!liveSegmentJobIds.has(id)) {
          ids.add(id);
        }
      }
    }

    if (!chapterRenderActiveSegmentId) return ids;

    // 2. Add highlights for the currently rendering batch
    for (const id of chapterRenderActiveBatchSegmentIds) {
      ids.add(id);
    }

    return ids;
  }, [isChapterProcessing, generatingSegmentIds, liveSegmentJobIds, chapterRenderActiveSegmentId, chapterRenderActiveBatchSegmentIds]);

  const chapterRenderQueuedSegmentIds = useMemo(() => {
    if (!job || !['queued', 'preparing', 'running'].includes(job.status)) return new Set<string>();

    const allIds = job.segment_ids || [];
    if (allIds.length > 0) {
      const activeIdx = allIds.indexOf(chapterRenderActiveSegmentId || '');
      const result = new Set(activeIdx === -1 ? allIds : allIds.slice(activeIdx + 1));

      for (const id of chapterRenderRenderingSegmentIds) {
        result.delete(id);
      }

      return result;
    }

    const renderBatchesForQueue = scriptViewData?.render_batches ?? [];
    const renderBatchSpanIds = renderBatchesForQueue.flatMap(batch => batch.span_ids);
    if (renderBatchSpanIds.length === 0) return new Set<string>();

    if (!chapterRenderActiveSegmentId) {
      return new Set(renderBatchSpanIds.filter(id => !chapterRenderRenderingSegmentIds.has(id)));
    }

    const activeBatchIndex = renderBatchesForQueue.findIndex(batch =>
      batch.span_ids.includes(chapterRenderActiveSegmentId)
    );

    const queuedBatchSpanIds = activeBatchIndex >= 0
      ? renderBatchesForQueue
          .slice(activeBatchIndex + 1)
          .flatMap(batch => batch.span_ids)
      : renderBatchSpanIds;

    return new Set(queuedBatchSpanIds.filter(id => !chapterRenderRenderingSegmentIds.has(id)));
  }, [job, chapterRenderActiveSegmentId, chapterRenderRenderingSegmentIds, scriptViewData?.render_batches]);

  const chapterRenderRenderingBatchProgressById = useMemo(() => {
    const progressById: Record<string, number> = {};
    const activeJob = generatingSegmentJob && ['queued', 'preparing', 'running', 'finalizing'].includes(generatingSegmentJob.status)
      ? generatingSegmentJob
      : (job && ['queued', 'preparing', 'running', 'finalizing'].includes(job.status) ? job : null);
    const activeSpanId = activeJob?.active_segment_id;
    if (!activeSpanId || chapterRenderRenderingSegmentIds.size === 0) return progressById;

    const activeBatch = scriptViewData?.render_batches?.find(batch =>
      batch.span_ids.includes(activeSpanId)
    );
    if (!activeBatch) return progressById;

    progressById[activeBatch.id] = Math.max(0, Math.min(liveBarSegmentProgress, 1));
    return progressById;
  }, [liveBarSegmentProgress, chapterRenderRenderingSegmentIds, generatingSegmentJob, job, scriptViewData?.render_batches, scriptViewData?.spans]);


  const { playingSegmentId, playingSegmentIds, playSegment, stopPlayback } = useChapterPlayback(
    projectId, segments, chunkGroups, chapterRenderPendingSegmentIds, 
    (sids) => handleGenerate(sids, effectiveSelectedVoice, (msg) => setConfirmConfig({ title: 'Generation Blocked', message: msg, onConfirm: () => {}, confirmText: 'OK' })),
    scriptViewData?.audio_groups || []
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
  const headerQueuePending = submitting || (!job && chapter?.audio_status === 'processing');

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
        selectedVoice={localVoice} 
        onVoiceChange={(v) => handleVoiceChange(v, (msg) => setConfirmConfig({ title: 'Voice Update Failed', message: msg, onConfirm: () => {}, confirmText: 'OK' }))} 
        availableVoices={availableVoices} defaultVoiceLabel={chapterDefaultVoiceLabel}
        submitting={submitting} queueLocked={submitting || !anyEnginesEnabled} queuePending={headerQueuePending} job={job} generatingJob={generatingSegmentJob} generatingSegmentIdsCount={chapterRenderRenderingSegmentIds.size || chapterRenderPendingSegmentIds.size}
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
        onSegmentDisplayProgress={setLiveBarSegmentProgress}
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
                    renderingSpanIds={chapterRenderRenderingSegmentIds}
                    queuedSpanIds={chapterRenderQueuedSegmentIds}
                    renderingBatchProgressById={chapterRenderRenderingBatchProgressById}
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
                    engines={engines}
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
                    pendingSegmentIds={chapterRenderPendingSegmentIds}
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
