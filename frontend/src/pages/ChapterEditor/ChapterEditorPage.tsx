import React, { useState, useEffect, useMemo } from 'react';
import { useDeferredWhileHeld } from '@/hooks/useDeferredWhileHeld';
import { ConfirmModal } from '@/components/overlays/ConfirmModal';
import { api } from '@/api';
import type { Job, SegmentProgress, TtsEngine, SpeakerProfile } from '@/types';

// Extracted Components
import { useChapterStatus, ChapterTopBar, ChapterScriptToolbar } from '@/pages/ChapterEditor/components/ChapterHeader';
import { EditorTabs, type ChapterEditorTab } from '@/pages/ChapterEditor/components/EditorTabs';

import { EditTab } from '@/pages/ChapterEditor/components/EditTab';
import { ScriptView } from '@/pages/ChapterEditor/components/ScriptView';
import { ResyncPreviewModal, type ResyncPreviewData } from '@/pages/ChapterEditor/components/ResyncPreviewModal';
import { CharacterSidebar } from '@/pages/ChapterEditor/components/CharacterSidebar';
import { QueueNotice } from '@/pages/ChapterEditor/components/QueueNotice';
import { ScriptViewFallback } from '@/pages/ChapterEditor/components/ScriptViewFallback';
import { PlaybackControls } from '@/pages/ChapterEditor/components/PlaybackControls';

// Extracted Hooks
import { useChapterPlayback } from '@/hooks/useChapterPlayback';
import { useChapterEditor } from '@/hooks/useChapterEditor';
import { useSegmentHandoffQueue, getHandoffTransitions, recordExternalHandoffEvent } from '@/hooks/useSegmentHandoffQueue';
import { buildVoiceOptions, getDefaultVoiceProfileName, getVoiceOptionLabel } from '@/utils/voiceProfiles';
import { buildChunkGroups } from '@/utils/chunkGroups';
import { getRawActiveRenderProgress } from '@/utils/chapterRenderProgress';

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
  segmentProgress: _segmentProgress = {},
  selectedVoice: externalVoice,
  onNext,
  onPrev,
  segmentUpdate,
  chapterUpdate
}) => {
  // Terminal-burst refetches land ~300–500ms after the job-done frame — exactly while the
  // end-of-chapter completion animation + 500ms hold is mid-flight.  Gate the ticks so the
  // full refetch (chapters + segments + scriptView) is deferred until the hold flushes,
  // preventing main-thread jank from ScriptView re-renders during the animation.
  // The handoff state is not yet available here (pageHandoff is created after
  // useChapterEditor), so we maintain mirror state synced via effects below.
  //
  // Two different gates on purpose:
  // - segmentUpdate defers only while a completion hold is pending (hasPending), so the
  //   per-save mid-render refreshes keep flowing.
  // - chapterUpdate (the heavy full reload) defers while ANY segment is still displayed:
  //   the first terminal chapters.lifecycle tick arrives ~10ms BEFORE the job-done frame
  //   that starts the hold, so gating it on hasPending alone would let it slip through.
  const [handoffHeld, setHandoffHeld] = useState(false);
  const [displayHeld, setDisplayHeld] = useState(false);
  const deferredSegmentUpdate = useDeferredWhileHeld(segmentUpdate, handoffHeld);
  const deferredChapterUpdate = useDeferredWhileHeld(chapterUpdate, displayHeld);

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
    scriptViewData,
    scriptViewLoading,
    generatingSegmentIds,
    analysis, setAnalysis,
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
    executeQueue
  } = useChapterEditor(chapterId, projectId, speakerProfiles, speakers, engines, chapterJobs, deferredSegmentUpdate, deferredChapterUpdate);

  const [editorTab, setEditorTab] = useState<ChapterEditorTab>('script');
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [selectedProfileName, setSelectedProfileName] = useState<string | null>(null);
  const [expandedCharacterId, setExpandedCharacterId] = useState<string | null>(null);
  const [exportingFormat, setExportingFormat] = useState<'wav' | 'mp3' | null>(null);
  const [queueNotice, setQueueNotice] = useState<string | null>(null);
  const [isPreviewingResync, setIsPreviewingResync] = useState(false);
  const [resyncPreviewData, setResyncPreviewData] = useState<ResyncPreviewData | null>(null);
  const [isResyncing, setIsResyncing] = useState(false);
  const [sourceTextMode, setSourceTextMode] = useState<'view' | 'edit'>('view');
  // Tracks the live interpolated display value from the header's PredictiveProgressBar
  // so letter animation stays frame-accurate with the visual bar.
  const [liveBarSegmentProgress, setLiveBarSegmentProgress] = useState(0);

  // Captures the latest PredictiveProgressBar debug snapshot and a small history so that
  // the copied debug bundle shows live bar state, not just shell-level chapter/job state.
  const lastProgressBarSnapshotRef = React.useRef<any>(null);
  const progressBarSnapshotHistoryRef = React.useRef<any[]>([]);

  const handleProgressBarDebugSnapshot = React.useCallback((snapshot: any) => {
    lastProgressBarSnapshotRef.current = snapshot;
    progressBarSnapshotHistoryRef.current = [
      snapshot,
      ...progressBarSnapshotHistoryRef.current,
    ].slice(0, 8);
  }, []);
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    isDestructive?: boolean;
    confirmText?: string;
  } | null>(null);

  const effectiveSelectedVoice = localVoice || externalVoice || '';
  const chapterDefaultVoiceLabel = useMemo(() => {
    const fallbackVoiceValue = externalVoice || getDefaultVoiceProfileName(speakerProfiles || [], engines) || '';
    const fallbackVoiceLabel = getVoiceOptionLabel(fallbackVoiceValue, speakerProfiles || [], speakers || [], engines, characters);
    return fallbackVoiceLabel ? `Use Project Default (${fallbackVoiceLabel})` : 'Use Project Default';
  }, [externalVoice, speakerProfiles, speakers, engines, characters]);


  const availableVoices = useMemo(() => {
    return buildVoiceOptions(speakerProfiles || [], speakers || [], engines, characters);
  }, [speakers, speakerProfiles, engines, characters]);

  const chunkGroups = useMemo(() => {
    return buildChunkGroups(segments, characters, effectiveSelectedVoice, speakerProfiles);
  }, [segments, characters, effectiveSelectedVoice, speakerProfiles]);

  const effectivePendingSegmentIds = useMemo(() => {
    const ids = new Set<string>(generatingSegmentIds);
    for (const segmentId of liveSegmentJobIds) ids.add(segmentId);
    return ids;
  }, [generatingSegmentIds, liveSegmentJobIds]);

  const job = generatingSegmentJob || propJob;
  const isChapterProcessing = useMemo(() => {
    return !!job && ['queued', 'preparing', 'running', 'finalizing'].includes(job.status)
      || chapter?.audio_status === 'processing'
      || chapterJobs.some(chapterJob => ['queued', 'preparing', 'running', 'finalizing'].includes(chapterJob.status));
  }, [job, chapter?.audio_status, chapterJobs]);


  const rawActiveSegmentId = job?.active_segment_id || generatingSegmentJob?.active_segment_id || null;

  // Segment handoff queue at the page level: one instance drives BOTH the header
  // progress bar and the script text highlight.  We feed it the raw job's active segment
  // so it can hold the outgoing segment's identity and progress until the visual bar
  // reaches 100%, ensuring the text fill completes before the highlight moves.
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

  // Record job status transitions into the handoff ring for debug correlation.
  useEffect(() => {
    if (job?.status) {
      recordExternalHandoffEvent('job_status', { status: job.status, jobId: job.id });
    }
  }, [job?.status, job?.id]);

  // Keep the gate mirrors in sync with the handoff state. handoffHeld gates segment
  // ticks during the completion hold; displayHeld gates the heavy chapter reload while
  // any segment is still displayed (render in progress OR hold in flight).
  useEffect(() => {
    setHandoffHeld(pageHandoff.hasPending);
  }, [pageHandoff.hasPending]);
  useEffect(() => {
    setDisplayHeld(pageHandoff.hasPending || pageHandoff.displayedSegmentId !== 'none');
  }, [pageHandoff.hasPending, pageHandoff.displayedSegmentId]);

  // Log deferred tick events into the handoff debug ring.
  useEffect(() => {
    if (handoffHeld && segmentUpdate !== undefined) {
      recordExternalHandoffEvent('tick_deferred', { kind: 'segment', tick: segmentUpdate.tick });
    }
   
  }, [segmentUpdate?.tick]);

  useEffect(() => {
    if (displayHeld && chapterUpdate !== undefined) {
      recordExternalHandoffEvent('tick_deferred', { kind: 'chapter', tick: chapterUpdate.tick });
    }
   
  }, [chapterUpdate?.tick]);

  useEffect(() => {
    if (!handoffHeld && deferredSegmentUpdate !== segmentUpdate && segmentUpdate !== undefined) {
      recordExternalHandoffEvent('tick_released', { kind: 'segment', tick: deferredSegmentUpdate?.tick });
    }
   
  }, [handoffHeld]);

  useEffect(() => {
    if (!displayHeld && deferredChapterUpdate !== chapterUpdate && chapterUpdate !== undefined) {
      recordExternalHandoffEvent('tick_released', { kind: 'chapter', tick: deferredChapterUpdate?.tick });
    }
   
  }, [displayHeld]);

  // The "active segment" used to drive the script view highlight and batch progress.
  // During the handoff hold (outgoing segment completing), this stays on the outgoing
  // segment so the text fill reaches 100% before the highlight moves to the next segment.
  const chapterRenderActiveSegmentId = pageHandoff.hasPending || pageHandoff.displayedSegmentId !== 'none'
    ? (pageHandoff.displayedSegmentId !== 'none' ? pageHandoff.displayedSegmentId : rawActiveSegmentId)
    : rawActiveSegmentId;

  // Reset the animated fill when the DISPLAYED segment changes (not the raw one):
  // during a handoff hold the displayed segment stays on the outgoing segment, so
  // its fill keeps animating to 100%; the reset lands exactly when the next
  // segment mounts, so it starts at 0 instead of inheriting the previous fill.
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
    if (!isChapterProcessing && !pageHandoff.hasPending) return ids;

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
  }, [isChapterProcessing, pageHandoff.hasPending, generatingSegmentIds, liveSegmentJobIds, chapterRenderActiveSegmentId, chapterRenderActiveBatchSegmentIds]);

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
    // Use the handoff-aware active segment id so that during a hold the outgoing segment's
    // batch gets the progress value (not the newly-started segment's batch).
    const activeSpanId = chapterRenderActiveSegmentId;
    if (!activeSpanId || chapterRenderRenderingSegmentIds.size === 0) return progressById;

    const activeBatch = scriptViewData?.render_batches?.find(batch =>
      batch.span_ids.includes(activeSpanId)
    );
    if (!activeBatch) return progressById;

    const rawProgress = getRawActiveRenderProgress(activeJob, 0);
    // The text fill must follow the bar's ANIMATED display value (fed back via
    // onSegmentDisplayProgress), never the raw stepped data — raw frames arrive in
    // ~16% jumps and would kill the predictive letter animation. The handoff decides
    // WHICH segment gets the fill (chapterRenderActiveSegmentId above); during a hold
    // the bar's data is driven to 1.0, so this animated value keeps climbing to 100%.
    const effectiveProgress = liveBarSegmentProgress > 0 ? liveBarSegmentProgress : rawProgress;
    progressById[activeBatch.id] = effectiveProgress;
    return progressById;
  }, [chapterRenderRenderingSegmentIds, generatingSegmentJob, job, scriptViewData?.render_batches, scriptViewData?.spans, liveBarSegmentProgress, chapterRenderActiveSegmentId]);


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
    stopSkim
  } = useChapterPlayback(
    projectId, chapterId, segments, chunkGroups, chapterRenderPendingSegmentIds,
    (sids) => handleGenerate(sids, effectiveSelectedVoice, (msg) => setConfirmConfig({ title: 'Generation Blocked', message: msg, onConfirm: () => {}, confirmText: 'OK' })),
    scriptViewData?.audio_groups || []
  );

  const playbackQueue = useMemo(() => segments.map(segment => segment.id), [segments]);

  const activePlaybackLabel = useMemo(() => {
    if (!playingSegmentId) return undefined;
    const seg = segments.find(s => s.id === playingSegmentId);
    if (!seg) return undefined;
    const char = characters.find(c => c.id === seg.character_id);
    const speakerName = char?.name || 'Narrator';
    return `${speakerName}: ${seg.text_content.slice(0, 40)}${seg.text_content.length > 40 ? '...' : ''}`;
  }, [playingSegmentId, segments, characters]);


  const playbackBlockStartIds = useMemo(() => {
    const queueSet = new Set(playbackQueue);
    const consumed = new Set<string>();
    const blockStarts: string[] = [];
    const audioGroups = [...(scriptViewData?.audio_groups || [])].sort((a, b) => a.order_index - b.order_index);

    audioGroups.forEach(group => {
      const groupIds = group.span_ids.filter(spanId => queueSet.has(spanId));
      if (groupIds.length === 0) return;
      blockStarts.push(groupIds[0]);
      groupIds.forEach(spanId => consumed.add(spanId));
    });

    playbackQueue.forEach(segmentId => {
      if (!consumed.has(segmentId)) {
        blockStarts.push(segmentId);
      }
    });

    return blockStarts;
  }, [playbackQueue, scriptViewData?.audio_groups]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (confirmConfig || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || (e.target as HTMLElement).isContentEditable) {
        return;
      }

      if (e.code === 'Space') {
        e.preventDefault();
        if (isPlaying) {
          togglePause();
        } else if (playbackBlockStartIds.length > 0) {
          playSegment(playingSegmentId || playbackBlockStartIds[0], playbackQueue);
        }
      } else if (e.code === 'Escape') {
        if (isPlaying) {
          stopPlayback();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [confirmConfig, isPlaying, playingSegmentId, playbackBlockStartIds, playbackQueue, togglePause, playSegment, stopPlayback]);

  const currentPlaybackBlockIndex = useMemo(() => {
    if (!playingSegmentId) return -1;

    return playbackBlockStartIds.findIndex(startId => {
      if (startId === playingSegmentId) return true;
      return scriptViewData?.audio_groups?.some(group => (
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

  const queueVoiceStatus = resolveVoiceEngineStatus(effectiveSelectedVoice || getDefaultVoiceProfileName(speakerProfiles || [], engines), engines, speakerProfiles);
  const queueButtonLabel = !anyEnginesEnabled ? 'Disabled' : !queueVoiceStatus.enabled ? 'Unavailable' : (shouldWarnBeforeRequeue ? 'Rebuild' : hasPartialSegmentProgress ? 'Complete' : 'Queue');
  const queueButtonTitle = !anyEnginesEnabled ? 'All TTS engines are disabled in Settings' : (queueVoiceStatus.enabled ? (shouldWarnBeforeRequeue ? 'Rebuild Chapter' : hasPartialSegmentProgress ? 'Complete Chapter Audio' : 'Queue Chapter') : queueVoiceStatus.message || 'Selected voice is unavailable');
  const headerQueuePending = submitting || (!job && chapter?.audio_status === 'processing');

  useEffect(() => {
    if (!queueNotice) return;
    const timer = setTimeout(() => setQueueNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [queueNotice]);

  const activeBatch = useMemo(() => {
    const activeSegId = job?.active_segment_id || generatingSegmentJob?.active_segment_id || null;
    if (!activeSegId) return null;
    return scriptViewData?.render_batches?.find(batch =>
      batch.span_ids.includes(activeSegId)
    );
  }, [job?.active_segment_id, generatingSegmentJob?.active_segment_id, scriptViewData?.render_batches]);
  const activeRenderBatchId = activeBatch?.id || null;

  const status = useChapterStatus(
    chapter || ({} as any),
    job,
    generatingSegmentJob,
    headerQueuePending,
    chapterRenderRenderingSegmentIds.size || chapterRenderPendingSegmentIds.size,
    submitting || !anyEnginesEnabled,
    activeRenderBatchId,
    activeBatch?.estimated_work_weight
  );

  const handleCopyDebugState = async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      console.error('Clipboard API is not available.');
      return;
    }

    const buildCompactJobSummary = (j: any) => {
      if (!j) return null;
      const prov = j.segmentProgressSocketProvenance;
      const compactProv = prov ? {
        frameId: prov.rawEnvelope?.frameId || prov.frameId || null,
        receivedAt: prov.receivedAt || null,
        topic: prov.rawEnvelope?.topic || prov.topic || null,
        eventKind: prov.rawEnvelope?.eventKind || prov.eventKind || null,
        jobId: prov.rawEnvelope?.jobId || prov.jobId || null,
        segmentId: prov.rawEnvelope?.segmentId || prov.segmentId || null,
        activeSegmentId: prov.selectedFields?.activeSegmentId || prov.activeSegmentId || null,
        activeSegmentProgress: prov.selectedFields?.activeSegmentProgress ?? prov.activeSegmentProgress ?? null,
        etaSeconds: prov.selectedFields?.etaSeconds ?? prov.etaSeconds ?? null,
        progress: prov.selectedFields?.progress ?? prov.progress ?? null,
        reasonCode: prov.selectedFields?.reasonCode || prov.reasonCode || null,
        updatedAt: prov.selectedFields?.updatedAt || prov.updatedAt || null,
      } : undefined;

      return {
        id: j.id,
        status: j.status,
        progress: j.progress,
        project_id: j.project_id,
        chapter_id: j.chapter_id,
        active_segment_id: j.active_segment_id,
        active_segment_progress: j.active_segment_progress,
        eta_seconds: j.eta_seconds,
        eta_basis: j.eta_basis,
        started_at: j.started_at,
        updated_at: j.updated_at,
        reason_code: j.reason_code,
        render_group_count: j.render_group_count,
        completed_render_groups: j.completed_render_groups,
        grouped_progress: j.grouped_progress,
        segmentProgressSource: compactProv,
      };
    };

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
          propJob: buildCompactJobSummary(propJob),
          generatingSegmentJob: buildCompactJobSummary(generatingSegmentJob),
          effectiveJob: buildCompactJobSummary(job),
          chapterJobs: chapterJobs.map(j => buildCompactJobSummary(j)),
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
        },
        segmentProgressUpdates: (() => {
          const allUpdates = [
            ...(propJob?.segmentProgressUpdates || []),
            ...(generatingSegmentJob?.segmentProgressUpdates || []),
            ...chapterJobs.flatMap((j: any) => j.segmentProgressUpdates || [])
          ];
          const seen = new Set();
          const uniqueUpdates = allUpdates.filter(u => {
            if (seen.has(u.sequence)) return false;
            seen.add(u.sequence);
            return true;
          });
          uniqueUpdates.sort((a, b) => b.sequence - a.sequence);
          return uniqueUpdates
            .slice(0, 20)
            .filter((entry: any) => entry.chapterId === chapterId || entry.jobId === (generatingSegmentJob?.id || propJob?.id))
            .map((entry: any) => ({
              ...entry,
              isCurrentChapter: entry.chapterId === chapterId,
              isCurrentJob: entry.jobId === (generatingSegmentJob?.id || propJob?.id),
            }));
        })(),
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

    try {
      await navigator.clipboard.writeText(JSON.stringify(snapshot, null, 2));
      setQueueNotice('Copied debug state to clipboard.');
    } catch (error) {
      console.error('Failed to copy debug state', error);
      setQueueNotice('Could not copy debug state.');
    }
  };

  if (loading) return <div style={{ padding: '2rem' }}>Loading editor...</div>;
  if (!chapter) return <div style={{ padding: '2rem' }}>Chapter not found.</div>;

  const hasUnsavedChanges = (title || "").trim() !== (chapter.title || "").trim() ||
                           (text || "").replace(/\r\n/g, '\n') !== (chapter.text_content || "").replace(/\r\n/g, '\n');

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, background: 'var(--bg)', position: 'relative', zIndex: 100 }}>
      <ChapterTopBar
        title={title} setTitle={setTitle}
        onPrev={onPrev ? async () => { await handleSave(); onPrev(); } : undefined}
        onNext={onNext ? async () => { await handleSave(); onNext(); } : undefined}
        onSaveWav={() => void handleExportAudio('wav')}
        onSaveMp3={() => void handleExportAudio('mp3')}
        exportingFormat={exportingFormat}
      />

      {!queueVoiceStatus.enabled && queueVoiceStatus.message && (
        <div style={{
          margin: '1rem 1.5rem 0 1.5rem',
          padding: '1rem',
          background: 'rgba(239, 68, 68, 0.1)',
          border: '1px solid rgba(239, 68, 68, 0.2)',
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
            <strong style={{ display: 'block', marginBottom: '0.25rem', color: '#ef4444' }}>Voice Engine Unavailable</strong>
            <span>{queueVoiceStatus.message}</span>
          </div>
        </div>
      )}

      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '1.5rem', overflow: 'hidden', minHeight: 0 }}>
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <EditorTabs
                  editorTab={editorTab} setEditorTab={(tab) => {
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
                      isDestructive: true
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
                    onQueue={() => {
                        const onBlocked = (msg: string) => setConfirmConfig({ title: 'Queue Blocked', message: msg, onConfirm: () => {}, confirmText: 'OK' });
                        const onSuccess = (msg: string) => setQueueNotice(msg);

                        if (shouldWarnBeforeRequeue) {
                            setConfirmConfig({
                                title: 'Requeue Completed Chapter',
                                message: 'All audio for this chapter is already complete. Rebuilding will delete the existing final render and regenerate from the current segments. Continue?',
                                onConfirm: async () => {
                                    setConfirmConfig(null);
                                    try {
                                        await api.resetChapter(chapterId);
                                    } catch (e) {
                                        console.error('Failed to reset chapter for rebuild:', e);
                                        onBlocked('Failed to clear existing chapter audio before rebuild. Try clearing audio from the chapter list, then queue again.');
                                        return;
                                    }
                                    await executeQueue(effectiveSelectedVoice, onBlocked, onSuccess);
                                },
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
                        try {
                            stopPlayback();
                            await api.cancelChapterGeneration(chapterId);
                            loadChapter('cancel');
                        }
                        catch (e) { console.error("Cancel failed", e); }
                    }}
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
                    pendingSpanIds={effectivePendingSegmentIds}
                    renderingSpanIds={chapterRenderRenderingSegmentIds}
                    queuedSpanIds={chapterRenderQueuedSegmentIds}
                    renderingBatchProgressById={chapterRenderRenderingBatchProgressById}
                    playingSpanId={playingSegmentId}
                    playingSpanIds={playingSegmentIds}
                    onPlaySpan={(sid) => playSegment(sid, playbackQueue)}
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


            </div>
        </div>

        <CharacterSidebar
            characters={characters} speakers={speakers} speakerProfiles={speakerProfiles} engines={engines}
            selectedCharacterId={selectedCharacterId} setSelectedCharacterId={setSelectedCharacterId}
            selectedProfileName={selectedProfileName} setSelectedProfileName={setSelectedProfileName}
            expandedCharacterId={expandedCharacterId} setExpandedCharacterId={setExpandedCharacterId}
            onUpdateCharacterColor={handleUpdateCharacterColor}
            segmentsCount={segments.length} wordCount={chapter.word_count || 0}
            selectedVoice={localVoice}
            onVoiceChange={(v) => handleVoiceChange(v, (msg) => setConfirmConfig({ title: 'Voice Update Failed', message: msg, onConfirm: () => {}, confirmText: 'OK' }))}
            availableVoices={availableVoices}
            defaultVoiceLabel={chapterDefaultVoiceLabel}
            submitting={submitting}
        />
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
