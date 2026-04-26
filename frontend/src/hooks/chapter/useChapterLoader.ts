import { useEffect, useCallback, useRef, useMemo } from 'react';
import { api } from '../../api';
import { buildFallbackProductionBlocks } from '../../utils/chapterEditorHelpers';
import type { ChapterEditorState } from './useChapterEditorState';
import type { Job } from '../../types';

export const useChapterLoader = (
  state: ChapterEditorState,
  chapterId: string,
  projectId: string,
  chapterJobs: Job[],
  segmentUpdate?: { chapterId: string; tick: number },
  chapterUpdate?: { chapterId: string; tick: number }
) => {
  const {
    setChapter, setTitle, setText, setLocalVoice,
    setSegments, setCharacters, setScriptViewData,
    syncProductionBlocks, setProductionBaseRevisionId,
    setProductionBlocks, setRenderBatches,
    setGeneratingSegmentIds, pendingGenerationIdsRef,
    pendingGenerationTimesRef, segmentRefreshTimerRef,
    completionPollTimerRef, completionPollAttemptsRef,
    setLoading, setScriptViewLoading,
    segments
  } = state;

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
  }, [chapterId, projectId, syncProductionBlocks, setChapter, setTitle, setText, setLocalVoice, setSegments, setCharacters, setScriptViewData, setProductionBaseRevisionId, setProductionBlocks, setRenderBatches, setGeneratingSegmentIds, setLoading, setScriptViewLoading]);

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
  }, [segmentUpdate, chapterId, syncProductionBlocks, setSegments, setScriptViewData, setProductionBlocks, setRenderBatches, setProductionBaseRevisionId, setGeneratingSegmentIds]);

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
  }, [chapterJobs, segments, setGeneratingSegmentIds]);

  const hasRenderedOutput = state.chapter?.audio_status === 'done' || !!state.chapter?.audio_file_path || !!state.chapter?.has_wav || !!state.chapter?.has_mp3;
  const jobLooksPendingCompletion = useMemo(() => {
    const mainJob = chapterJobs.find(j => !j.segment_ids || j.segment_ids.length === 0);
    return mainJob?.status === 'done' && !hasRenderedOutput && state.chapter?.audio_status !== 'processing';
  }, [chapterJobs, hasRenderedOutput, state.chapter?.audio_status]);
  
  const needsCompletionRefresh = jobLooksPendingCompletion || (state.chapter?.audio_status === 'processing' && !chapterJobs.some(j => ['queued', 'preparing', 'running', 'finalizing'].includes(j.status)));

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

  return { loadChapter, liveSegmentJobIds, hasRenderedOutput };
};
