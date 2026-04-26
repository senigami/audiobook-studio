import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { api } from '../api';
import type { 
  Chapter, ChapterSegment, Character, ProductionBlock, 
  ProductionRenderBatch, ScriptViewResponse, SpeakerProfile, 
  TtsEngine, Job, ProductionBlocksResponse, ScriptRangeAssignment 
} from '../types';
import { buildFallbackProductionBlocks, resolveDefaultVariantName, resolveVoiceEngineStatus } from '../utils/chapterEditorHelpers';
import { useChapterAnalysis } from './useChapterAnalysis';
import { pickRelevantJob } from '../utils/jobSelection';
import { getDefaultVoiceProfileName } from '../utils/voiceProfiles';

export const useChapterEditor = (
  chapterId: string, 
  projectId: string, 
  speakerProfiles: SpeakerProfile[],
  speakers: import('../types').Speaker[],
  engines: TtsEngine[] = [],
  chapterJobs: Job[] = [],
  segmentUpdate?: { chapterId: string; tick: number },
  chapterUpdate?: { chapterId: string; tick: number }
) => {
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [localVoice, setLocalVoice] = useState<string>('');
  
  const [segments, setSegments] = useState<ChapterSegment[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [productionBlocks, setProductionBlocks] = useState<ProductionBlock[]>([]);
  const [renderBatches, setRenderBatches] = useState<ProductionRenderBatch[]>([]);
  const [productionBaseRevisionId, setProductionBaseRevisionId] = useState<string | null>(null);
  const [scriptViewData, setScriptViewData] = useState<ScriptViewResponse | null>(null);
  const [scriptViewLoading, setScriptViewLoading] = useState(true);
  
  const [generatingSegmentIds, setGeneratingSegmentIds] = useState<Set<string>>(new Set());
  const pendingGenerationIdsRef = useRef<Set<string>>(new Set());
  const pendingGenerationTimesRef = useRef<Map<string, number>>(new Map());
  const segmentRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completionPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completionPollAttemptsRef = useRef(0);
  const [saveConflictError, setSaveConflictError] = useState<string | null>(null);

  const { 
    analysis, setAnalysis, analyzing, loadingVoiceChunks, 
    ensureVoiceChunks, runAnalysis 
  } = useChapterAnalysis(chapterId, text);

  const syncProductionBlocks = useCallback((payload: {
    base_revision_id?: string | null;
    blocks: ProductionBlock[];
    render_batches?: ProductionRenderBatch[];
  }) => {
    setProductionBaseRevisionId(payload.base_revision_id ?? null);
    setProductionBlocks([...payload.blocks].sort((a, b) => a.order_index - b.order_index));
    setRenderBatches(payload.render_batches ? [...payload.render_batches] : []);
  }, []);

  const liveSegmentJobIds = useMemo(() => {
    const ids = new Set<string>();
    for (const chapterJob of chapterJobs) {
      for (const segmentId of chapterJob.segment_ids || []) {
        ids.add(segmentId);
      }
    }
    return ids;
  }, [chapterJobs]);

  const liveSegmentJobIdsRef = useRef(liveSegmentJobIds);
  useEffect(() => { liveSegmentJobIdsRef.current = liveSegmentJobIds; }, [liveSegmentJobIds]);

  const loadChapter = useCallback(async (source: string = 'unknown') => {
    try {
      setScriptViewLoading(true);
      const chapters = await api.fetchChapters(projectId);
      const target = chapters.find(c => c.id === chapterId);
      if (target) {
        setChapter(target);
        setTitle(target.title);
        setText(target.text_content || '');
        setLocalVoice(target.speaker_profile_name || '');
      }
      const [segs, chars, production, scriptView] = await Promise.all([
        api.fetchSegments(chapterId),
        api.fetchCharacters(projectId),
        api.fetchProductionBlocks(chapterId).catch(() => null),
        api.fetchScriptView(chapterId).catch(() => null)
      ]);
      setSegments(segs);
      setCharacters(chars);
      if (scriptView) setScriptViewData(scriptView);
      else setScriptViewData(null);
      
      if (production?.blocks?.length) {
        syncProductionBlocks(production);
      } else {
        setProductionBaseRevisionId(null);
        setProductionBlocks(buildFallbackProductionBlocks(segs));
        setRenderBatches([]);
      }
      
      setGeneratingSegmentIds(prev => {
        if (prev.size === 0) return prev;
        const currentLiveIds = liveSegmentJobIdsRef.current;
        const next = new Set(
          Array.from(prev).filter(id => {
            const seg = segs.find((s: any) => s.id === id);
            if (!seg) return false;
            if (seg.audio_status === 'processing') return true;
            if (currentLiveIds.has(id)) return true;
            const pendingAt = pendingGenerationTimesRef.current.get(id) || 0;
            if (pendingGenerationIdsRef.current.has(id) && (Date.now() - pendingAt) < 10000) return true;
            pendingGenerationIdsRef.current.delete(id);
            pendingGenerationTimesRef.current.delete(id);
            return false;
          })
        );
        return next.size === prev.size ? prev : next;
      });
    } catch (e) {
      console.error(`Failed to load chapter (${source})`, e);
    } finally {
      setLoading(false);
      setScriptViewLoading(false);
    }
  }, [chapterId, projectId, syncProductionBlocks]);

  useEffect(() => { loadChapter('mount'); }, [loadChapter]);

  // Websocket updates
  useEffect(() => {
    if (!chapterUpdate || chapterUpdate.chapterId !== chapterId || chapterUpdate.tick === 0) return;
    void loadChapter('chapter-update');
  }, [chapterUpdate, chapterId, loadChapter]);

  useEffect(() => {
    if (!segmentUpdate || segmentUpdate.chapterId !== chapterId || segmentUpdate.tick === 0) return;
    if (segmentRefreshTimerRef.current) clearTimeout(segmentRefreshTimerRef.current);
    segmentRefreshTimerRef.current = setTimeout(async () => {
        try {
        const [updatedSegments, updatedProduction, updatedScript] = await Promise.all([
          api.fetchSegments(chapterId),
          api.fetchProductionBlocks(chapterId).catch(() => null),
          api.fetchScriptView(chapterId).catch(() => null),
        ]);
        setSegments(updatedSegments);
        if (updatedScript) setScriptViewData(updatedScript);
        if (updatedProduction?.blocks?.length) {
          syncProductionBlocks(updatedProduction);
        } else {
          setProductionBlocks(buildFallbackProductionBlocks(updatedSegments));
          setRenderBatches([]);
          setProductionBaseRevisionId(null);
        }
        setGeneratingSegmentIds(prev => {
          const next = new Set(prev);
          const currentLiveIds = liveSegmentJobIdsRef.current;
          for (const id of prev) {
            const seg = updatedSegments.find((s: any) => s.id === id);
            if (!seg) {
              next.delete(id);
              pendingGenerationIdsRef.current.delete(id);
              pendingGenerationTimesRef.current.delete(id);
              continue;
            }
            if (currentLiveIds.has(id) || seg.audio_status === 'processing') continue;
            const shouldClear = seg.audio_status === 'done' || seg.audio_status === 'error' || seg.audio_status === 'failed' || seg.audio_status === 'cancelled' || seg.audio_status === 'unprocessed';
            if (shouldClear) {
              next.delete(id);
              pendingGenerationIdsRef.current.delete(id);
              pendingGenerationTimesRef.current.delete(id);
              continue;
            }
          }
          return next.size !== prev.size ? next : prev;
        });
      } catch (e) { console.error("WS refresh failed", e); }
    }, 300);
  }, [segmentUpdate, chapterId, syncProductionBlocks]);

  useEffect(() => {
    if (chapterJobs.length > 0) return;
    setGeneratingSegmentIds(prev => {
      if (prev.size === 0) return prev;
      const next = new Set(
        Array.from(prev).filter(id => {
          const seg = segments.find(s => s.id === id);
          if (!seg) return false;
          if (seg.audio_status === 'processing') return true;
          if (['done', 'error', 'failed', 'cancelled'].includes(seg.audio_status)) {
            pendingGenerationIdsRef.current.delete(id);
            pendingGenerationTimesRef.current.delete(id);
            return false;
          }
          return true;
        })
      );
      return next.size !== prev.size ? next : prev;
    });
  }, [chapterJobs, segments]);

  const hasRenderedOutput = chapter?.audio_status === 'done' || !!chapter?.audio_file_path || !!chapter?.has_wav || !!chapter?.has_mp3;
  const jobLooksPendingCompletion = useMemo(() => {
    const mainJob = chapterJobs.find(j => !j.segment_ids || j.segment_ids.length === 0);
    return mainJob?.status === 'done' && !hasRenderedOutput && chapter?.audio_status !== 'processing';
  }, [chapterJobs, hasRenderedOutput, chapter?.audio_status]);
  
  const needsCompletionRefresh = jobLooksPendingCompletion || (chapter?.audio_status === 'processing' && !chapterJobs.some(j => ['queued', 'preparing', 'running', 'finalizing'].includes(j.status)));

  useEffect(() => {
    if (completionPollTimerRef.current) {
      clearTimeout(completionPollTimerRef.current);
      completionPollTimerRef.current = null;
    }
    if (!needsCompletionRefresh) {
      completionPollAttemptsRef.current = 0;
      return;
    }
    if (completionPollAttemptsRef.current >= 30) return;
    let cancelled = false;
    const scheduleNextPoll = () => {
      if (cancelled || completionPollAttemptsRef.current >= 30) return;
      completionPollTimerRef.current = setTimeout(async () => {
        completionPollTimerRef.current = null;
        if (cancelled) return;
        completionPollAttemptsRef.current += 1;
        try { await loadChapter('completion-refresh'); } 
        catch (e) { console.error("Completion refresh failed", e); }
        if (!cancelled) scheduleNextPoll();
      }, 1000);
    };
    scheduleNextPoll();
    return () => {
      cancelled = true;
      if (completionPollTimerRef.current) {
        clearTimeout(completionPollTimerRef.current);
        completionPollTimerRef.current = null;
      }
    };
  }, [needsCompletionRefresh, chapterId, loadChapter]);

  const handleSave = useCallback(async (manualTitle?: string, manualText?: string) => {
    if (!chapter) return false;
    const finalTitle = manualTitle !== undefined ? manualTitle : title;
    const finalText = manualText !== undefined ? manualText : text;
    if (finalTitle === chapter.title && finalText === chapter.text_content) return true;

    setSaving(true);
    try {
      const result = await api.updateChapter(chapterId, { title: finalTitle, text_content: finalText });
      if (result.chapter) setChapter(result.chapter);
      if (finalText !== chapter.text_content) {
          const [updatedSegs, updatedProduction, updatedScript] = await Promise.all([
            api.fetchSegments(chapterId),
            api.fetchProductionBlocks(chapterId).catch(() => null),
            api.fetchScriptView(chapterId).catch(() => null)
          ]);
          setSegments(updatedSegs);
          if (updatedScript) setScriptViewData(updatedScript);
          if (updatedProduction?.blocks?.length) {
            syncProductionBlocks(updatedProduction);
          } else {
            setProductionBlocks(buildFallbackProductionBlocks(updatedSegs));
            setRenderBatches([]);
            setProductionBaseRevisionId(null);
          }
          runAnalysis(finalText);
      }
      return true;
    } catch (e) { console.error("Save failed", e); return false; }
    finally { setTimeout(() => setSaving(false), 500); }
  }, [chapter, chapterId, title, text, runAnalysis, syncProductionBlocks]);

  const handleVoiceChange = useCallback(async (voice: string, onError?: (msg: string) => void) => {
      const previousVoice = localVoice;
      const previousChapterVoice = chapter?.speaker_profile_name ?? null;
      setLocalVoice(voice);
      setChapter(prev => prev ? { ...prev, speaker_profile_name: voice || null } : prev);
      try {
        await api.updateChapter(chapterId, { speaker_profile_name: voice || null });
      } catch (e) {
        console.error(e);
        setLocalVoice(previousVoice);
        setChapter(prev => prev ? { ...prev, speaker_profile_name: previousChapterVoice } : prev);
        onError?.(e instanceof Error ? e.message : 'The chapter voice could not be saved.');
      }
  }, [chapter, chapterId, localVoice]);

  const saveProductionBlocks = useCallback(async (blocks: ProductionBlock[]) => {
    setSaveConflictError(null);
    try {
      const result = await api.updateProductionBlocks(chapterId, {
        base_revision_id: productionBaseRevisionId ?? undefined,
        blocks,
      });
      syncProductionBlocks(result);
      return result;
    } catch (e: any) {
      if (e.status === 409) {
        setSaveConflictError(e.message || "A conflict occurred while saving. The chapter was modified by another process.");
      }
      throw e;
    }
  }, [chapterId, productionBaseRevisionId, syncProductionBlocks]);

  const handleScriptAssign = useCallback(async (
    spanIds: string[], 
    selectedCharacterId: string | null, 
    selectedProfileName: string | null,
    onConflict?: () => void
  ) => {
    if (!scriptViewData || !selectedCharacterId) return;
    const isClearing = selectedCharacterId === 'CLEAR_ASSIGNMENT';
    const characterId = isClearing ? null : selectedCharacterId;
    const profileName = isClearing ? null : (selectedProfileName || resolveDefaultVariantName(selectedCharacterId, characters, speakers, speakerProfiles));

    // Optimistic update
    setScriptViewData(prev => {
        if (!prev) return prev;
        return {
            ...prev,
            spans: prev.spans.map(s => spanIds.includes(s.id) ? { 
                ...s, character_id: characterId, speaker_profile_name: profileName,
                status: (s.status === 'rendered' && (s.character_id !== characterId || s.speaker_profile_name !== profileName)) ? 'draft' : s.status
            } : s)
        };
    });

    try {
        const result = await api.saveScriptAssignments(chapterId, {
            base_revision_id: scriptViewData.base_revision_id,
            assignments: [{
                span_ids: spanIds,
                character_id: characterId,
                speaker_profile_name: profileName
            }]
        });
        setScriptViewData(result);
        const updatedSegs = await api.fetchSegments(chapterId);
        setSegments(updatedSegs);
    } catch (e: any) {
        console.error("Script assignment failed", e);
        if (e.status === 409) {
            onConflict?.();
        } else {
            loadChapter('assignment-error-rollback');
        }
    }
  }, [chapterId, scriptViewData, characters, speakers, speakerProfiles, loadChapter]);

  const handleScriptAssignRange = useCallback(async (
    range: ScriptRangeAssignment,
    selectedCharacterId: string | null,
    selectedProfileName: string | null,
    onConflict?: () => void
  ) => {
    if (!scriptViewData || !selectedCharacterId) return;
    const isClearing = selectedCharacterId === 'CLEAR_ASSIGNMENT';
    const characterId = isClearing ? null : selectedCharacterId;
    const profileName = isClearing ? null : (selectedProfileName || resolveDefaultVariantName(selectedCharacterId, characters, speakers, speakerProfiles));

    try {
        const result = await api.saveScriptAssignments(chapterId, {
            base_revision_id: scriptViewData.base_revision_id,
            assignments: [],
            range_assignments: [{
                ...range,
                character_id: characterId,
                speaker_profile_name: profileName
            }]
        });
        setScriptViewData(result);
        const updatedSegs = await api.fetchSegments(chapterId);
        setSegments(updatedSegs);
    } catch (e: any) {
        console.error("Script range assignment failed", e);
        if (e.status === 409) {
            onConflict?.();
        } else {
            loadChapter('assignment-range-error-rollback');
        }
    }
  }, [chapterId, scriptViewData, characters, speakers, speakerProfiles, loadChapter]);

  const handleParagraphBulkAssign = useCallback(async (
    segmentIds: string[],
    selectedCharacterId: string | null,
    selectedProfileName: string | null
  ) => {
    if (!selectedCharacterId) return;
    const isClearing = selectedCharacterId === 'CLEAR_ASSIGNMENT';
    const characterId = isClearing ? null : selectedCharacterId;
    const profileName = isClearing ? null : (selectedProfileName || resolveDefaultVariantName(selectedCharacterId, characters, speakers, speakerProfiles));
    
    setSegments(prev => prev.map(s => segmentIds.includes(s.id) ? { 
        ...s, character_id: characterId, speaker_profile_name: profileName, 
        audio_status: isClearing ? s.audio_status : 'unprocessed'
    } : s));

    try {
        await api.updateSegmentsBulk(segmentIds, { 
            character_id: characterId, speaker_profile_name: profileName,
            audio_status: isClearing ? undefined : 'unprocessed'
        });
    } catch (e) { console.error("Bulk assign failed", e); }
  }, [characters, speakers, speakerProfiles]);

  const handleParagraphBulkReset = useCallback(async (segmentIds: string[]) => {
    setSegments(prev => prev.map(s => segmentIds.includes(s.id) ? { ...s, character_id: null, speaker_profile_name: null } : s));
    try { await api.updateSegmentsBulk(segmentIds, { character_id: null, speaker_profile_name: null }); }
    catch (e) { console.error("Bulk reset failed", e); }
  }, []);

  const handleUpdateCharacterColor = useCallback(async (id: string, color: string) => {
    try {
      setCharacters(prev => prev.map(c => c.id === id ? { ...c, color } : c));
      await api.updateCharacter(id, undefined, undefined, undefined, color);
    } catch (e) { console.error("Color update failed", e); loadChapter('color-refresh'); }
  }, [loadChapter]);

  const reloadLatestBlocks = useCallback(async (): Promise<ProductionBlocksResponse | null> => {
    try {
      const result = await api.fetchProductionBlocks(chapterId);
      syncProductionBlocks(result);
      setSaveConflictError(null); // CLEAR CONFLICT ERROR ON RELOAD
      return result;
    } catch (e) {
      console.error("Failed to reload production blocks", e);
      return null;
    }
  }, [chapterId, syncProductionBlocks]);

  const handleGenerate = useCallback(async (
    sids: string[], 
    effectiveSelectedVoice: string,
    onBlocked: (msg: string) => void
  ) => {
    const uniqueIds = Array.from(new Set(sids));
    const freshIds = uniqueIds.filter(id => {
        const seg = segments.find(s => s.id === id);
        return !!seg
            && seg.audio_status !== 'processing'
            && !liveSegmentJobIdsRef.current.has(id)
            && !pendingGenerationIdsRef.current.has(id);
    });

    if (freshIds.length === 0) return;

    const requiredVoiceNames = Array.from(new Set(
      freshIds
        .map(id => {
          const seg = segments.find(segment => segment.id === id);
          return (seg?.speaker_profile_name || effectiveSelectedVoice || getDefaultVoiceProfileName(speakerProfiles || []) || '').trim();
        })
        .filter(Boolean)
    ));
    const blockedVoice = requiredVoiceNames
      .map(name => resolveVoiceEngineStatus(name, engines, speakerProfiles))
      .find(status => !status.enabled);
      
    if (blockedVoice) {
      onBlocked(blockedVoice.message || 'This voice is unavailable.');
      return;
    }

    const now = Date.now();
    freshIds.forEach(id => {
      pendingGenerationIdsRef.current.add(id);
      pendingGenerationTimesRef.current.set(id, now);
    });
    setGeneratingSegmentIds(prev => {
        const next = new Set(prev);
        freshIds.forEach(id => next.add(id));
        return next;
    });
    try {
        await api.generateSegments(freshIds, effectiveSelectedVoice || undefined);
    } catch (e) {
        console.error(e);
        onBlocked(e instanceof Error ? e.message : 'This segment could not be queued.');
        freshIds.forEach(id => {
            pendingGenerationIdsRef.current.delete(id);
            pendingGenerationTimesRef.current.delete(id);
        });
        setGeneratingSegmentIds(prev => {
            const next = new Set(prev);
            freshIds.forEach(id => next.delete(id));
            return next;
        });
    }
  }, [segments, speakerProfiles, engines]);

  const executeQueue = useCallback(async (
    effectiveSelectedVoice: string,
    onBlocked: (msg: string) => void,
    onSuccess: (msg: string) => void
  ) => {
    const queueVoiceStatus = resolveVoiceEngineStatus(effectiveSelectedVoice || getDefaultVoiceProfileName(speakerProfiles || []), engines, speakerProfiles);
    if (!queueVoiceStatus.enabled) {
      onBlocked(queueVoiceStatus.message || 'The selected voice is unavailable.');
      return;
    }
    if (queueSyncTimerRef.current) {
      clearTimeout(queueSyncTimerRef.current);
      queueSyncTimerRef.current = null;
    }
    setSubmitting(true);
    try {
        onSuccess('Queued. Keep this page open to watch progress.');
        await api.addProcessingQueue(projectId, chapterId, 0, effectiveSelectedVoice || undefined);
        await loadChapter('queue-submit');
        queueSyncTimerRef.current = setTimeout(async () => {
          queueSyncTimerRef.current = null;
          try { await loadChapter('queue-sync-delay'); } 
          catch (e) { console.error("Delayed queue sync failed", e); }
        }, 1000);
    } catch (e) {
        onBlocked(e instanceof Error ? e.message : 'Failed to queue chapter.');
    } finally { setSubmitting(false); }
  }, [chapterId, projectId, speakerProfiles, engines, loadChapter]);

  useEffect(() => {
    return () => {
      if (queueSyncTimerRef.current) clearTimeout(queueSyncTimerRef.current);
    };
  }, []);

  const generatingSegmentJob = useMemo(() => pickRelevantJob(chapterJobs), [chapterJobs]);

  return {
    chapter, setChapter,
    title, setTitle,
    text, setText,
    loading,
    saving, setSaving,
    submitting, setSubmitting,
    localVoice, setLocalVoice,
    segments, setSegments,
    characters, setCharacters,
    productionBlocks, setProductionBlocks,
    renderBatches, setRenderBatches,
    productionBaseRevisionId,
    scriptViewData, setScriptViewData,
    scriptViewLoading,
    generatingSegmentIds, setGeneratingSegmentIds,
    pendingGenerationIdsRef,
    pendingGenerationTimesRef,
    analysis, setAnalysis,
    analyzing, loadingVoiceChunks,
    ensureVoiceChunks, runAnalysis,
    loadChapter,
    syncProductionBlocks,
    reloadLatestBlocks,
    generatingSegmentJob,
    liveSegmentJobIds,
    handleSave,
    handleVoiceChange,
    hasRenderedOutput,
    saveProductionBlocks,
    saveConflictError, setSaveConflictError,
    handleScriptAssign,
    handleScriptAssignRange,
    handleParagraphBulkAssign,
    handleParagraphBulkReset,
    handleUpdateCharacterColor,
    handleGenerate,
    executeQueue
  };
};
