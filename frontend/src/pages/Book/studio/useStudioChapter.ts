import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api } from '@/api';
import { useChapterEditor } from '@/hooks/useChapterEditor';
import { useChapterPlayback } from '@/hooks/useChapterPlayback';
import { useRenderGroups } from '@/hooks/useRenderGroups';
import { useDeferredWhileHeld } from '@/hooks/useDeferredWhileHeld';
import { useChapterStatus } from '@/pages/ChapterEditor/components/ChapterHeader';
import { buildChunkGroups } from '@/utils/chunkGroups';
import { buildVoiceOptions, getDefaultVoiceProfileName, getVoiceOptionLabel } from '@/utils/voiceProfiles';
import { getRawActiveRenderProgress } from '@/utils/chapterRenderProgress';
import { resolveVoiceEngineStatus, downloadBlob, formatExportFilename } from '@/utils/chapterEditorHelpers';
import { useSegmentHandoffQueue, getHandoffTransitions, recordExternalHandoffEvent } from '@/hooks/useSegmentHandoffQueue';
import type { Job, SegmentProgress, SpeakerProfile, TtsEngine } from '@/types';
import type { ResyncPreviewData } from '@/pages/ChapterEditor/components/ResyncPreviewModal';
import type { ChapterEditorTab } from '@/pages/ChapterEditor/components/EditorTabs';

export interface StudioConfirmConfig {
  title: string;
  message: string;
  onConfirm: () => void | Promise<void>;
  isDestructive?: boolean;
  confirmText?: string;
}

export interface UseStudioChapterProps {
  chapterId: string;
  projectId: string;
  speakerProfiles: SpeakerProfile[];
  speakers: import('@/types').Speaker[];
  engines?: TtsEngine[];
  job?: Job;
  chapterJobs?: Job[];
  segmentProgress?: Record<string, SegmentProgress>;
  selectedVoice?: string;
  segmentUpdate?: { chapterId: string; tick: number };
  chapterUpdate?: { chapterId: string; tick: number };
}

export function useStudioChapter({
  chapterId,
  projectId,
  speakerProfiles,
  speakers,
  engines = [],
  job: propJob,
  chapterJobs = [],
  segmentProgress,
  selectedVoice: externalVoice,
  segmentUpdate,
  chapterUpdate,
}: UseStudioChapterProps) {
  const [editorTab, setEditorTab] = useState<ChapterEditorTab>('script');
  const [sourceTextMode, setSourceTextMode] = useState<'view' | 'edit'>('view');
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [selectedProfileName, setSelectedProfileName] = useState<string | null>(null);
  const [expandedCharacterId, setExpandedCharacterId] = useState<string | null>(null);
  const [exportingFormat, setExportingFormat] = useState<'wav' | 'mp3' | null>(null);
  const [queueNotice, setQueueNotice] = useState<string | null>(null);
  const [confirmConfig, setConfirmConfig] = useState<StudioConfirmConfig | null>(null);
  const [isPreviewingResync, setIsPreviewingResync] = useState(false);
  const [resyncPreviewData, setResyncPreviewData] = useState<ResyncPreviewData | null>(null);
  const [isResyncing, setIsResyncing] = useState(false);
  const [liveBarSegmentProgress, setLiveBarSegmentProgress] = useState(0);
  const lastProgressBarSnapshotRef = useRef<any>(null);
  const progressBarSnapshotHistoryRef = useRef<any[]>([]);

  // Terminal-burst refetches land while the chapter completion animation is still
  // in flight. Keep the page and header refreshes deferred until the visual hold
  // flushes so ScriptView does not thrash mid-animation.
  const [handoffHeld, setHandoffHeld] = useState(false);
  const [displayHeld, setDisplayHeld] = useState(false);
  const deferredSegmentUpdate = useDeferredWhileHeld(segmentUpdate, handoffHeld);
  const deferredChapterUpdate = useDeferredWhileHeld(chapterUpdate, displayHeld);

  const chapterEditor = useChapterEditor(
    chapterId,
    projectId,
    speakerProfiles,
    speakers,
    engines,
    chapterJobs,
    deferredSegmentUpdate,
    deferredChapterUpdate,
  );

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
    generatingSegmentIds,
    analysis,
    setAnalysis,
    analyzing,
    loadChapter,
    generatingSegmentJob,
    liveSegmentJobIds,
    handleSave,
    handleVoiceChange,
    hasRenderedOutput,
    handleScriptAssign,
    handleScriptAssignRange,
    handleUpdateCharacterColor,
    handleGenerate,
    executeQueue,
  } = chapterEditor;

  const renderGroupsRefreshKey = (deferredSegmentUpdate?.tick ?? 0) + (deferredChapterUpdate?.tick ?? 0);
  const { count: renderGroupCount, firstSpanGroupNumber } = useRenderGroups(projectId, chapterId, renderGroupsRefreshKey);

  const effectiveSelectedVoice = localVoice || externalVoice || '';
  const chapterDefaultVoiceName = useMemo(() => {
    const fallbackVoiceValue = externalVoice || getDefaultVoiceProfileName(speakerProfiles || [], engines) || '';
    return getVoiceOptionLabel(fallbackVoiceValue, speakerProfiles || [], speakers || [], engines, characters) ?? '';
  }, [externalVoice, speakerProfiles, speakers, engines, characters]);
  const chapterDefaultVoiceLabel = chapterDefaultVoiceName
    ? `Use Project Default (${chapterDefaultVoiceName})`
    : 'Use Project Default';

  const availableVoices = useMemo(
    () => buildVoiceOptions(speakerProfiles || [], speakers || [], engines, characters),
    [speakers, speakerProfiles, engines, characters],
  );

  const chunkGroups = useMemo(
    () => buildChunkGroups(segments, characters, effectiveSelectedVoice, speakerProfiles),
    [segments, characters, effectiveSelectedVoice, speakerProfiles],
  );

  const effectivePendingSegmentIds = useMemo(() => {
    const ids = new Set<string>(generatingSegmentIds);
    for (const segmentId of liveSegmentJobIds) ids.add(segmentId);
    return ids;
  }, [generatingSegmentIds, liveSegmentJobIds]);

  const job = generatingSegmentJob || propJob;
  const isChapterProcessing = useMemo(() => (
    (!!job && ['queued', 'preparing', 'running', 'finalizing'].includes(job.status))
    || chapter?.audio_status === 'processing'
    || chapterJobs.some((chapterJob) => ['queued', 'preparing', 'running', 'finalizing'].includes(chapterJob.status))
  ), [job, chapter?.audio_status, chapterJobs]);

  // W-PAR 006: chapter-level map of concurrently-active segments (C2 contract,
  // consumed verbatim). Absent ⇒ fall back to the singular active_segment_id
  // path below unchanged (INV-1 — byte-identical at cap=1).
  const backendActiveSegmentsMap = job?.active_segments_map ?? generatingSegmentJob?.active_segments_map;
  // Escaped defect fix (2026-07-05): a fallback derived from the per-segment
  // segments.progress stream (already flowing via useJobs.ts's segmentProgress
  // state — real progress/eta, previously accepted as a prop and silently
  // ignored). Used ONLY when the backend hasn't supplied its OWN map AT ALL
  // (undefined) — an explicit {} from the backend is a real "nothing
  // rendering right now" signal and must win over any local fallback.
  const fallbackActiveSegmentsMap = useMemo(() => {
    if (backendActiveSegmentsMap !== undefined || !segmentProgress || !isChapterProcessing) return undefined;
    const entries: Record<string, { phase: string; progress: number; eta_seconds: number | null }> = {};
    for (const sp of Object.values(segmentProgress)) {
      if (sp.chapter_id !== chapterId) continue;
      if ((sp.progress ?? 0) >= 1 || sp.status === 'done' || sp.status === 'failed' || sp.status === 'cancelled') continue;
      entries[sp.segment_id] = {
        phase: 'rendering',
        progress: sp.progress ?? 0,
        eta_seconds: sp.eta_seconds ?? null,
      };
    }
    return Object.keys(entries).length ? entries : undefined;
  }, [backendActiveSegmentsMap, segmentProgress, isChapterProcessing, chapterId]);
  const chapterRenderActiveSegmentsMap = backendActiveSegmentsMap ?? fallbackActiveSegmentsMap;

  const rawActiveSegmentId = job?.active_segment_id || generatingSegmentJob?.active_segment_id || null;
  const rawActiveSegmentProgress = rawActiveSegmentId && typeof job?.active_segment_progress === 'number'
    ? Math.max(0, Math.min(1, job.active_segment_progress))
    : 0;

  const pageHandoff = useSegmentHandoffQueue({
    jobId: job?.id ?? '',
    segmentId: rawActiveSegmentId ?? 'none',
    progress: rawActiveSegmentProgress,
    status: job?.status,
    etaSeconds: rawActiveSegmentId && typeof job?.active_segment_eta_seconds === 'number'
      ? job.active_segment_eta_seconds : null,
    updatedAt: rawActiveSegmentId && typeof job?.active_segment_updated_at === 'number'
      ? job.active_segment_updated_at : null,
  });

  useEffect(() => {
    setHandoffHeld(pageHandoff.hasPending);
  }, [pageHandoff.hasPending]);

  useEffect(() => {
    setDisplayHeld(pageHandoff.hasPending || pageHandoff.displayedSegmentId !== 'none');
  }, [pageHandoff.hasPending, pageHandoff.displayedSegmentId]);

  useEffect(() => {
    if (job?.status) {
      recordExternalHandoffEvent('job_status', { status: job.status, jobId: job.id });
    }
  }, [job?.status, job?.id]);

  useEffect(() => {
    if (handoffHeld && segmentUpdate !== undefined) {
      recordExternalHandoffEvent('tick_deferred', { kind: 'segment', tick: segmentUpdate.tick });
    }
  }, [handoffHeld, segmentUpdate?.tick, segmentUpdate]);

  useEffect(() => {
    if (displayHeld && chapterUpdate !== undefined) {
      recordExternalHandoffEvent('tick_deferred', { kind: 'chapter', tick: chapterUpdate.tick });
    }
  }, [displayHeld, chapterUpdate?.tick, chapterUpdate]);

  useEffect(() => {
    if (!handoffHeld && deferredSegmentUpdate !== segmentUpdate && segmentUpdate !== undefined) {
      recordExternalHandoffEvent('tick_released', { kind: 'segment', tick: deferredSegmentUpdate?.tick });
    }
  }, [handoffHeld, deferredSegmentUpdate, segmentUpdate]);

  useEffect(() => {
    if (!displayHeld && deferredChapterUpdate !== chapterUpdate && chapterUpdate !== undefined) {
      recordExternalHandoffEvent('tick_released', { kind: 'chapter', tick: deferredChapterUpdate?.tick });
    }
  }, [displayHeld, deferredChapterUpdate, chapterUpdate]);

  const chapterRenderActiveSegmentId = pageHandoff.hasPending || pageHandoff.displayedSegmentId !== 'none'
    ? (pageHandoff.displayedSegmentId !== 'none' ? pageHandoff.displayedSegmentId : rawActiveSegmentId)
    : rawActiveSegmentId;

  useEffect(() => {
    setLiveBarSegmentProgress(0);
  }, [chapterRenderActiveSegmentId]);

  const chapterRenderActiveBatchSegmentIds = useMemo(() => {
    if (!chapterRenderActiveSegmentId) return new Set<string>();
    const activeBatch = scriptViewData?.render_batches?.find((batch) =>
      batch.span_ids.includes(chapterRenderActiveSegmentId),
    );
    if (!activeBatch) return new Set([chapterRenderActiveSegmentId]);
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

  const isActiveJobPreparing =
    (job as any)?.reason_code === 'SEGMENT_PENDING' ||
    (job as any)?.reason_code === 'LOADING_MODEL' ||
    (job as any)?.indeterminate === true;

  // W-PAR 006: map entries carry the batch *leader* segment id; the visual
  // contract (matching the legacy single-ID path) highlights every span in
  // that leader's render batch. Expanding here keeps cap=1 visuals identical
  // to the pre-map path (INV-1).
  const expandToBatchSpanIds = useCallback((segId: string, into: Set<string>) => {
    const batch = scriptViewData?.render_batches?.find((candidate) =>
      candidate.span_ids.includes(segId),
    );
    if (!batch) {
      into.add(segId);
      return;
    }
    for (const id of batch.span_ids) into.add(id);
  }, [scriptViewData?.render_batches]);

  const chapterRenderPreparingSegmentIds = useMemo(() => {
    // W-PAR 006: with a map present, each entry's own `phase` decides preparing
    // vs rendering — never keyed off START_SEGMENT/presence alone.
    if (chapterRenderActiveSegmentsMap) {
      const ids = new Set<string>();
      for (const [segId, entry] of Object.entries(chapterRenderActiveSegmentsMap)) {
        if (entry.phase === 'preparing') expandToBatchSpanIds(segId, ids);
      }
      return ids;
    }
    if (!isActiveJobPreparing || !chapterRenderActiveSegmentId) return new Set<string>();
    const ids = new Set<string>([chapterRenderActiveSegmentId]);
    for (const id of chapterRenderActiveBatchSegmentIds) {
      ids.add(id);
    }
    return ids;
  }, [isActiveJobPreparing, chapterRenderActiveSegmentId, chapterRenderActiveBatchSegmentIds, chapterRenderActiveSegmentsMap, expandToBatchSpanIds]);

  const chapterRenderRenderingSegmentIds = useMemo(() => {
    const ids = new Set<string>();
    if (!isChapterProcessing && !pageHandoff.hasPending) return ids;
    if (generatingSegmentIds.size > 0) {
      for (const id of generatingSegmentIds) {
        if (!liveSegmentJobIds.has(id)) ids.add(id);
      }
    }
    // W-PAR 006: when active_segments_map is present, its keys are the source of
    // truth for which segments are simultaneously active (N-way, not single-ID).
    // Only `rendering`-phase entries belong here: preparing entries surface via
    // chapterRenderPreparingSegmentIds, and `done` entries (e.g. the SEGMENT_SAVED
    // frame at cap=1) are finished — including them would leave a completed span
    // stuck in the visual "rendering" state (never key rendering off presence
    // alone; phase decides).
    if (chapterRenderActiveSegmentsMap) {
      for (const [segId, entry] of Object.entries(chapterRenderActiveSegmentsMap)) {
        if (entry.phase !== 'rendering') continue;
        expandToBatchSpanIds(segId, ids);
      }
      for (const id of chapterRenderPreparingSegmentIds) ids.delete(id);
      return ids;
    }
    if (!chapterRenderActiveSegmentId) return ids;
    for (const id of chapterRenderActiveBatchSegmentIds) {
      if (!chapterRenderPreparingSegmentIds.has(id)) ids.add(id);
    }
    return ids;
  }, [isChapterProcessing, pageHandoff.hasPending, generatingSegmentIds, liveSegmentJobIds, chapterRenderActiveSegmentId, chapterRenderActiveBatchSegmentIds, chapterRenderPreparingSegmentIds, chapterRenderActiveSegmentsMap, expandToBatchSpanIds]);

  const chapterRenderQueuedSegmentIds = useMemo(() => {
    if (!job || !['queued', 'preparing', 'running'].includes(job.status)) return new Set<string>();
    const allIds = job.segment_ids || [];
    if (allIds.length > 0) {
      const activeIdx = allIds.indexOf(chapterRenderActiveSegmentId || '');
      const result = new Set(activeIdx === -1 ? allIds : allIds.slice(activeIdx + 1));
      for (const id of chapterRenderRenderingSegmentIds) result.delete(id);
      return result;
    }
    const renderBatchesForQueue = scriptViewData?.render_batches ?? [];
    const renderBatchSpanIds = renderBatchesForQueue.flatMap((batch) => batch.span_ids);
    if (renderBatchSpanIds.length === 0) return new Set<string>();
    if (!chapterRenderActiveSegmentId) {
      return new Set(renderBatchSpanIds.filter((id) => !chapterRenderRenderingSegmentIds.has(id)));
    }
    const activeBatchIndex = renderBatchesForQueue.findIndex((batch) =>
      batch.span_ids.includes(chapterRenderActiveSegmentId),
    );
    const queuedBatchSpanIds = activeBatchIndex >= 0
      ? renderBatchesForQueue.slice(activeBatchIndex + 1).flatMap((batch) => batch.span_ids)
      : renderBatchSpanIds;
    return new Set(queuedBatchSpanIds.filter((id) => !chapterRenderRenderingSegmentIds.has(id)));
  }, [job, chapterRenderActiveSegmentId, chapterRenderRenderingSegmentIds, scriptViewData?.render_batches]);

  const chapterRenderRenderingBatchProgressById = useMemo(() => {
    const progressById: Record<string, number> = {};
    // W-PAR 006: when active_segments_map is present, populate each rendering
    // segment's own batch with its own progress — N batches can be non-idle
    // simultaneously. Falls back to the single active-segment path (INV-1)
    // when the map is absent.
    if (chapterRenderActiveSegmentsMap) {
      for (const [segId, entry] of Object.entries(chapterRenderActiveSegmentsMap)) {
        if (entry.phase !== 'rendering') continue;
        const batch = scriptViewData?.render_batches?.find((candidate) =>
          candidate.span_ids.includes(segId),
        );
        if (!batch) continue;
        progressById[batch.id] = entry.progress;
      }
      return progressById;
    }
    const activeJob = generatingSegmentJob && ['queued', 'preparing', 'running', 'finalizing'].includes(generatingSegmentJob.status)
      ? generatingSegmentJob
      : (job && ['queued', 'preparing', 'running', 'finalizing'].includes(job.status) ? job : null);
    const activeSpanId = chapterRenderActiveSegmentId;
    if (!activeSpanId || chapterRenderRenderingSegmentIds.size === 0) return progressById;
    const activeBatch = scriptViewData?.render_batches?.find((batch) =>
      batch.span_ids.includes(activeSpanId),
    );
    if (!activeBatch) return progressById;
    const rawProgress = getRawActiveRenderProgress(activeJob, 0);
    const effectiveProgress = liveBarSegmentProgress > 0 ? liveBarSegmentProgress : rawProgress;
    progressById[activeBatch.id] = effectiveProgress;
    return progressById;
  }, [chapterRenderRenderingSegmentIds, generatingSegmentJob, job, scriptViewData?.render_batches, scriptViewData?.spans, liveBarSegmentProgress, chapterRenderActiveSegmentId, chapterRenderActiveSegmentsMap]);

  const handleGenerateWithFallback = useCallback(
    async (segmentIds: string[]) => {
      await handleGenerate(segmentIds, effectiveSelectedVoice, (msg) => {
        setConfirmConfig({
          title: 'Generation Blocked',
          message: msg,
          onConfirm: () => {},
          confirmText: 'OK',
        });
      });
    },
    [effectiveSelectedVoice, handleGenerate],
  );

  const {
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
  } = useChapterPlayback(
    projectId,
    chapterId,
    segments,
    chunkGroups,
    chapterRenderPendingSegmentIds,
    handleGenerateWithFallback,
    scriptViewData?.audio_groups || [],
  );

  const playbackQueue = useMemo(() => segments.map((segment) => segment.id), [segments]);

  const activePlaybackLabel = useMemo(() => {
    if (!playingSegmentId) return undefined;
    const seg = segments.find((s) => s.id === playingSegmentId);
    if (!seg) return undefined;
    const char = characters.find((c) => c.id === seg.character_id);
    const speakerName = char?.name || 'Narrator';
    return `${speakerName}: ${seg.text_content.slice(0, 40)}${seg.text_content.length > 40 ? '...' : ''}`;
  }, [playingSegmentId, segments, characters]);

  const playbackBlockStartIds = useMemo(() => {
    const queueSet = new Set(playbackQueue);
    const consumed = new Set<string>();
    const blockStarts: string[] = [];
    const audioGroups = [...(scriptViewData?.audio_groups || [])].sort((a, b) => a.order_index - b.order_index);
    audioGroups.forEach((group) => {
      const groupIds = group.span_ids.filter((spanId) => queueSet.has(spanId));
      if (groupIds.length === 0) return;
      blockStarts.push(groupIds[0]);
      groupIds.forEach((spanId) => consumed.add(spanId));
    });
    playbackQueue.forEach((segmentId) => {
      if (!consumed.has(segmentId)) blockStarts.push(segmentId);
    });
    return blockStarts;
  }, [playbackQueue, scriptViewData?.audio_groups]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        confirmConfig
        || e.target instanceof HTMLInputElement
        || e.target instanceof HTMLTextAreaElement
        || (e.target as HTMLElement).isContentEditable
      ) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        if (isPlaying) {
          togglePause();
        } else if (playbackBlockStartIds.length > 0) {
          playSegment(playingSegmentId || playbackBlockStartIds[0], playbackQueue);
        }
      } else if (e.code === 'Escape' && isPlaying) {
        stopPlayback();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmConfig, isPlaying, playingSegmentId, playbackBlockStartIds, playbackQueue, togglePause, playSegment, stopPlayback]);

  const currentPlaybackBlockIndex = useMemo(() => {
    if (!playingSegmentId) return -1;
    return playbackBlockStartIds.findIndex((startId) => {
      if (startId === playingSegmentId) return true;
      return scriptViewData?.audio_groups?.some((group) => (
        group.span_ids.includes(startId) && group.span_ids.includes(playingSegmentId)
      ));
    });
  }, [playbackBlockStartIds, playingSegmentId, scriptViewData?.audio_groups]);

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

  useEffect(() => {
    if (!queueNotice) return;
    const timer = setTimeout(() => setQueueNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [queueNotice]);

  const handleProgressBarDebugSnapshot = useCallback((snapshot: any) => {
    lastProgressBarSnapshotRef.current = snapshot;
    progressBarSnapshotHistoryRef.current = [
      snapshot,
      ...progressBarSnapshotHistoryRef.current,
    ].slice(0, 8);
  }, []);

  const handleCreateTempCharacter = useCallback(async (name: string, profileName?: string) => {
    if (!chapterId || !projectId) return;
    const trimmed = name.trim();
    if (!trimmed) return;
    try {
      await api.createCharacter(projectId, trimmed, profileName || undefined, undefined, undefined, chapterId);
      await loadChapter('create-temp');
    } catch (error) {
      console.error('Failed to create temp character', error);
    }
  }, [chapterId, projectId, loadChapter]);

  const handlePromoteCharacter = useCallback(async (characterId: string) => {
    try {
      await api.promoteCharacter(characterId);
      await loadChapter('promote-character');
    } catch (error) {
      console.error('Failed to promote character', error);
    }
  }, [loadChapter]);

  const handleDeleteCharacter = useCallback(async (characterId: string) => {
    try {
      await api.deleteCharacter(characterId);
      await loadChapter('delete-character');
    } catch (error) {
      console.error('Failed to delete character', error);
    }
  }, [loadChapter]);

  const handleRequestResyncPreview = useCallback(async () => {
    if (!text || text === chapter?.text_content) return;
    setIsPreviewingResync(true);
    setResyncPreviewData(null);
    try {
      const result = await api.previewSourceTextResync(chapterId, text);
      setResyncPreviewData(result);
    } catch (error) {
      console.error('Preview failed', error);
      setIsPreviewingResync(false);
    }
  }, [chapter?.text_content, chapterId, text]);

  const handleConfirmResync = useCallback(async () => {
    setIsResyncing(true);
    try {
      const success = await handleSave(title, text);
      if (success) setIsPreviewingResync(false);
    } finally {
      setIsResyncing(false);
    }
  }, [handleSave, text, title]);

  const handleExportAudio = useCallback(async (format: 'wav' | 'mp3') => {
    setExportingFormat(format);
    try {
      const blob = await api.exportChapterAudio(chapterId, format);
      const filename = formatExportFilename(chapter?.title || '', chapterId);
      downloadBlob(blob, `${filename}.${format}`);
    } catch (error) {
      console.error(error);
      setConfirmConfig({
        title: 'Export Failed',
        message: error instanceof Error ? error.message : `Could not save ${format.toUpperCase()} audio.`,
        onConfirm: () => {},
        confirmText: 'OK',
      });
    } finally {
      setExportingFormat(null);
    }
  }, [chapter?.title, chapterId]);

  const hasRenderedSegments = segments.some((segment) => segment.audio_status === 'done' || !!segment.audio_file_path);
  const hasPartialSegmentProgress = hasRenderedSegments && !hasRenderedOutput;
  const shouldWarnBeforeRequeue = hasRenderedOutput;
  const anyEnginesEnabled = useMemo(() => {
    if (!engines || engines.length === 0) return true;
    return engines.some((engine) => engine.enabled && engine.status === 'ready');
  }, [engines]);

  const queueVoiceStatus = resolveVoiceEngineStatus(
    effectiveSelectedVoice || getDefaultVoiceProfileName(speakerProfiles || [], engines),
    engines,
    speakerProfiles,
  );

  const queueButtonLabel = !anyEnginesEnabled
    ? 'Disabled'
    : !queueVoiceStatus.enabled
      ? 'Unavailable'
      : (shouldWarnBeforeRequeue ? 'Rebuild' : hasPartialSegmentProgress ? 'Complete' : 'Queue');

  const queueButtonTitle = !anyEnginesEnabled
    ? 'All TTS engines are disabled in Settings'
    : (queueVoiceStatus.enabled
      ? (shouldWarnBeforeRequeue ? 'Rebuild Chapter' : hasPartialSegmentProgress ? 'Complete Chapter Audio' : 'Queue Chapter')
      : queueVoiceStatus.message || 'Selected voice is unavailable');

  const headerQueuePending = submitting || (!job && chapter?.audio_status === 'processing');

  const activeBatch = useMemo(() => {
    const activeSegId = job?.active_segment_id || generatingSegmentJob?.active_segment_id || null;
    if (!activeSegId) return null;
    return scriptViewData?.render_batches?.find((batch) =>
      batch.span_ids.includes(activeSegId),
    );
  }, [job?.active_segment_id, generatingSegmentJob?.active_segment_id, scriptViewData?.render_batches]);

  const status = useChapterStatus(
    chapter || ({} as any),
    job,
    generatingSegmentJob,
    headerQueuePending,
    chapterRenderRenderingSegmentIds.size || chapterRenderPendingSegmentIds.size,
    submitting || !anyEnginesEnabled,
    activeBatch?.id || null,
    activeBatch?.estimated_work_weight,
  );

  const hasUnsavedChanges = (title || '').trim() !== (chapter?.title || '').trim()
    || (text || '').replace(/\r\n/g, '\n') !== (chapter?.text_content || '').replace(/\r\n/g, '\n');

  const handleStopAll = useCallback(async () => {
    try {
      stopPlayback();
      await api.cancelChapterGeneration(chapterId);
      loadChapter('cancel');
    } catch (error) {
      console.error('Cancel failed', error);
    }
  }, [chapterId, loadChapter, stopPlayback]);

  const handleQueue = useCallback(() => {
    const onBlocked = (msg: string) => setConfirmConfig({
      title: 'Queue Blocked',
      message: msg,
      onConfirm: () => {},
      confirmText: 'OK',
    });
    const onSuccess = (msg: string) => setQueueNotice(msg);

    if (shouldWarnBeforeRequeue) {
      setConfirmConfig({
        title: 'Requeue Completed Chapter',
        message: 'All audio for this chapter is already complete. Rebuilding will delete the existing final render and regenerate from the current segments. Continue?',
        onConfirm: async () => {
          setConfirmConfig(null);
          try {
            await api.resetChapter(chapterId);
          } catch (error) {
            console.error('Failed to reset chapter for rebuild:', error);
            onBlocked('Failed to clear existing chapter audio before rebuild. Try clearing audio from the chapter list, then queue again.');
            return;
          }
          await executeQueue(effectiveSelectedVoice, onBlocked, onSuccess, true);
        },
        confirmText: 'Yes, Rebuild It',
        isDestructive: true,
      });
    } else if (chapter?.char_count && chapter.char_count > 50000) {
      setConfirmConfig({
        title: 'Large Chapter Warning',
        message: `Chapter is long (${chapter.char_count.toLocaleString()} chars). Queue anyway?`,
        onConfirm: async () => {
          setConfirmConfig(null);
          await executeQueue(effectiveSelectedVoice, onBlocked, onSuccess);
        },
        confirmText: 'Yes, Queue It',
        isDestructive: false,
      });
    } else {
      executeQueue(effectiveSelectedVoice, onBlocked, onSuccess);
    }
  }, [chapter?.char_count, chapterId, executeQueue, effectiveSelectedVoice, shouldWarnBeforeRequeue]);

  const handleCopyDebugState = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return;
    const allUpdates = [
      ...(propJob?.segmentProgressUpdates || []),
      ...(generatingSegmentJob?.segmentProgressUpdates || []),
      ...chapterJobs.flatMap((jobEntry) => jobEntry.segmentProgressUpdates || []),
    ];
    const seen = new Set<number>();
    const uniqueUpdates = allUpdates.filter((update: any) => {
      if (seen.has(update.sequence)) return false;
      seen.add(update.sequence);
      return true;
    });
    uniqueUpdates.sort((a, b) => b.sequence - a.sequence);

    const snapshot = {
      generatedAt: new Date().toISOString(),
      frontend: {
        chapter: chapter ? {
          id: chapter.id,
          title: chapter.title,
          audio_status: chapter.audio_status,
          audio_file_path: chapter.audio_file_path,
          has_wav: chapter.has_wav,
          has_mp3: chapter.has_mp3,
          has_m4a: chapter.has_m4a,
          char_count: chapter.char_count,
          word_count: chapter.word_count,
          done_segments_count: chapter.done_segments_count,
          total_segments_count: chapter.total_segments_count,
        } : null,
        editor: {
          editorTab,
          sourceTextMode,
          loading,
          saving,
          submitting,
          analyzing,
          queueNotice,
          isPreviewingResync,
          isResyncing,
          liveBarSegmentProgress,
          hasRenderedOutput,
          hasUnsavedChanges,
        },
        jobs: {
          propJob: propJob ? {
            id: propJob.id,
            status: propJob.status,
            progress: propJob.progress,
            project_id: propJob.project_id,
            chapter_id: propJob.chapter_id,
            active_segment_id: propJob.active_segment_id,
            active_segment_progress: propJob.active_segment_progress,
            eta_seconds: propJob.eta_seconds,
            eta_basis: propJob.eta_basis,
            started_at: propJob.started_at,
            updated_at: propJob.updated_at,
            reason_code: propJob.reason_code,
            render_group_count: propJob.render_group_count,
            completed_render_groups: propJob.completed_render_groups,
            grouped_progress: propJob.grouped_progress,
          } : null,
          generatingSegmentJob: generatingSegmentJob ? {
            id: generatingSegmentJob.id,
            status: generatingSegmentJob.status,
            progress: generatingSegmentJob.progress,
            project_id: generatingSegmentJob.project_id,
            chapter_id: generatingSegmentJob.chapter_id,
            active_segment_id: generatingSegmentJob.active_segment_id,
            active_segment_progress: generatingSegmentJob.active_segment_progress,
            eta_seconds: generatingSegmentJob.eta_seconds,
            eta_basis: generatingSegmentJob.eta_basis,
            started_at: generatingSegmentJob.started_at,
            updated_at: generatingSegmentJob.updated_at,
            reason_code: generatingSegmentJob.reason_code,
            render_group_count: generatingSegmentJob.render_group_count,
            completed_render_groups: generatingSegmentJob.completed_render_groups,
            grouped_progress: generatingSegmentJob.grouped_progress,
          } : null,
          effectiveJob: job ? {
            id: job.id,
            status: job.status,
            progress: job.progress,
            project_id: job.project_id,
            chapter_id: job.chapter_id,
            active_segment_id: job.active_segment_id,
            active_segment_progress: job.active_segment_progress,
            eta_seconds: job.eta_seconds,
            eta_basis: job.eta_basis,
            started_at: job.started_at,
            updated_at: job.updated_at,
            reason_code: job.reason_code,
            render_group_count: job.render_group_count,
            completed_render_groups: job.completed_render_groups,
            grouped_progress: job.grouped_progress,
          } : null,
          chapterJobs: chapterJobs.map((jobEntry) => ({
            id: jobEntry.id,
            status: jobEntry.status,
            progress: jobEntry.progress,
            project_id: jobEntry.project_id,
            chapter_id: jobEntry.chapter_id,
            active_segment_id: jobEntry.active_segment_id,
            active_segment_progress: jobEntry.active_segment_progress,
            eta_seconds: jobEntry.eta_seconds,
            eta_basis: jobEntry.eta_basis,
            started_at: jobEntry.started_at,
            updated_at: jobEntry.updated_at,
            reason_code: jobEntry.reason_code,
            render_group_count: jobEntry.render_group_count,
            completed_render_groups: jobEntry.completed_render_groups,
            grouped_progress: jobEntry.grouped_progress,
          })),
        },
        status: {
          queueStatus: status.queueStatus,
          effectiveQueueLocked: status.effectiveQueueLocked,
          isQueued: status.isQueued,
          liveSegmentProgressValue: status.liveSegmentProgressValue,
          liveSegmentProgressJob: status.liveSegmentProgressJob ? {
            id: status.liveSegmentProgressJob.id,
            status: status.liveSegmentProgressJob.status,
            progress: status.liveSegmentProgressJob.progress,
            active_segment_id: status.liveSegmentProgressJob.active_segment_id,
            active_segment_progress: status.liveSegmentProgressJob.active_segment_progress,
            render_group_count: (status.liveSegmentProgressJob as any).render_group_count,
            eta_seconds: status.liveSegmentProgressJob.eta_seconds,
            started_at: status.liveSegmentProgressJob.started_at,
            updated_at: status.liveSegmentProgressJob.updated_at,
          } : null,
          generatingSegmentIdsCount: status.generatingSegmentIdsCount,
          segmentProgressBarSelection: status.segmentProgressBarSelection,
        },
        render: {
          chapterRenderActiveSegmentId,
          chapterRenderRenderingSegmentIds: Array.from(chapterRenderRenderingSegmentIds),
          chapterRenderQueuedSegmentIds: Array.from(chapterRenderQueuedSegmentIds),
          chapterRenderPendingSegmentIds: Array.from(chapterRenderPendingSegmentIds),
          chapterRenderRenderingBatchProgressById,
          // Preparing state for the active segment (loading/indeterminate window).
          chapterRenderPreparingSegmentIds: Array.from(chapterRenderPreparingSegmentIds),
          isActiveJobPreparing,
        },
        segmentProgressUpdates: uniqueUpdates
          .slice(0, 20)
          .filter((entry: any) => entry.chapterId === chapterId || entry.jobId === (generatingSegmentJob?.id || propJob?.id))
          .map((entry: any) => ({
            ...entry,
            isCurrentChapter: entry.chapterId === chapterId,
            isCurrentJob: entry.jobId === (generatingSegmentJob?.id || propJob?.id),
          })),
      },
      handoffTransitions: getHandoffTransitions(),
      handoffState: {
        displayedSegmentId: pageHandoff.displayedSegmentId,
        displayedProgress: pageHandoff.displayedProgress,
        hasPending: pageHandoff.hasPending,
      },
      backend: (typeof window !== 'undefined' && (((window as any).__studioDebugSnapshots && (window as any).__studioDebugSnapshots.length > 0) || (window as any).__studioDebugLast)) ? {
        websocketDebugTrail: (window as any).__studioDebugSnapshots,
        lastSnapshot: (window as any).__studioDebugLast,
      } : null,
    };
    await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
  }, [
    chapter,
    status,
    pageHandoff,
    chapterRenderActiveSegmentId,
    chapterRenderRenderingSegmentIds,
    chapterRenderQueuedSegmentIds,
    chapterRenderPendingSegmentIds,
    chapterRenderRenderingBatchProgressById,
    playingSegmentId,
    currentTime,
    duration,
    editorTab,
    sourceTextMode,
    loading,
    saving,
    submitting,
    analyzing,
    queueNotice,
    isPreviewingResync,
    isResyncing,
    liveBarSegmentProgress,
    hasRenderedOutput,
    hasUnsavedChanges,
    propJob,
    generatingSegmentJob,
    chapterJobs,
  ]);

  return {
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
    generatingSegmentIds,
    analysis,
    setAnalysis,
    analyzing,
    loadChapter,
    generatingSegmentJob,
    liveSegmentJobIds,
    handleSave,
    handleVoiceChange,
    hasRenderedOutput,
    handleScriptAssign,
    handleScriptAssignRange,
    handleUpdateCharacterColor,
    handleGenerate,
    handleGenerateWithFallback,
    executeQueue,
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
    setExportingFormat,
    queueNotice,
    setQueueNotice,
    confirmConfig,
    setConfirmConfig,
    isPreviewingResync,
    setIsPreviewingResync,
    resyncPreviewData,
    setResyncPreviewData,
    isResyncing,
    setIsResyncing,
    liveBarSegmentProgress,
    setLiveBarSegmentProgress,
    lastProgressBarSnapshotRef,
    progressBarSnapshotHistoryRef,
    renderGroupsRefreshKey,
    renderGroupCount,
    firstSpanGroupNumber,
    effectiveSelectedVoice,
    chapterDefaultVoiceLabel,
    chapterDefaultVoiceName,
    availableVoices,
    chunkGroups,
    effectivePendingSegmentIds,
    job,
    isChapterProcessing,
    pageHandoff,
    chapterRenderActiveSegmentId,
    chapterRenderActiveSegmentsMap,
    chapterRenderPreparingSegmentIds,
    chapterRenderRenderingSegmentIds,
    chapterRenderQueuedSegmentIds,
    chapterRenderPendingSegmentIds,
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
    hasRenderedSegments,
    hasPartialSegmentProgress,
    shouldWarnBeforeRequeue,
    anyEnginesEnabled,
    queueVoiceStatus,
    queueButtonLabel,
    queueButtonTitle,
    headerQueuePending,
    status,
    hasUnsavedChanges,
    handleCopyDebugState,
    handleProgressBarDebugSnapshot,
    handleQueue,
    handleStopAll,
    handleCreateTempCharacter,
    handlePromoteCharacter,
    handleDeleteCharacter,
    handoffTransitions: getHandoffTransitions(),
  };
}

export type StudioChapterState = ReturnType<typeof useStudioChapter>;
