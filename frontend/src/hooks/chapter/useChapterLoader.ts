import { useEffect, useCallback, useRef, useMemo } from 'react';
import { api } from '@/api';
import { pickRelevantJob } from '@/utils/jobSelection';
import { shouldEnableStudioDebugLogging, recordStudioDebugSnapshot } from '@/utils/runtimeDebug';
import type { ChapterEditorState } from '@/hooks/chapter/useChapterEditorState';
import type { Job } from '@/types';

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
    setGeneratingSegmentIds, pendingGenerationIdsRef,
    pendingGenerationTimesRef, segmentRefreshTimerRef,
    completionPollTimerRef, completionPollAttemptsRef,
    setLoading, setScriptViewLoading,
    setChapterNotFound,
    segments, title, text
  } = state;

  // COR-F-1: loadChapter used to unconditionally clobber the local title/text
  // draft with whatever the server returned — on mount, on every WS
  // chapter-update tick, AND on every 1s completion-poll iteration. The
  // autosave in useStudioChapter.ts is debounced 1500ms, so a reload landing
  // inside that window would revert an unsaved edit before it had a chance to
  // save. These refs track (a) the current draft values, read without making
  // loadChapter depend on title/text (which would re-trigger it on every
  // keystroke), and (b) the server value last applied by THIS hook, so a
  // reload can tell "user has an unsaved local edit" apart from "server value
  // genuinely changed since we last loaded".
  const currentTitleRef = useRef(title);
  useEffect(() => { currentTitleRef.current = title; }, [title]);
  const currentTextRef = useRef(text);
  useEffect(() => { currentTextRef.current = text; }, [text]);
  const lastLoadedTitleRef = useRef<string | undefined>(undefined);
  const lastLoadedTextRef = useRef<string | undefined>(undefined);

  const liveSegmentJobIds = useMemo(() => {
    const ids = new Set<string>();
    for (const chapterJob of chapterJobs) {
      if (!['queued', 'preparing', 'running', 'finalizing'].includes(chapterJob.status)) continue;
      for (const segmentId of chapterJob.segment_ids || []) {
        ids.add(segmentId);
      }
    }
    return ids;
  }, [chapterJobs]);

  const liveSegmentJobIdsRef = useRef(liveSegmentJobIds);
  useEffect(() => { liveSegmentJobIdsRef.current = liveSegmentJobIds; }, [liveSegmentJobIds]);
  const shouldLogLoadTimings = import.meta.env.DEV || shouldEnableStudioDebugLogging();

  const loadChapter = useCallback(async (source: string = 'unknown') => {
    const loadStartedAt = performance.now();
    try {
      setScriptViewLoading(true);
      const chaptersStartedAt = performance.now();
      // Single-chapter fetch, not the whole project's chapter list (with every
      // other chapter's full text_content) — this only needs `chapterId`'s own
      // metadata/text, and this loader re-runs on mount, on every WS
      // chapter-update tick, and on completion-poll ticks.
      const target = await api.fetchChapter(chapterId, projectId);
      setChapterNotFound(false);
      if (shouldLogLoadTimings) {
        recordStudioDebugSnapshot('load:chapter metadata', {
          chapterId,
          projectId,
          source,
          ms: Math.round(performance.now() - chaptersStartedAt),
        });
      }
      if (target) {
        setChapter(target);
        // Only apply the server's title/text when there is no pending local
        // edit relative to the last value THIS hook loaded — `undefined`
        // (nothing loaded yet, e.g. the very first mount) always applies.
        const previousLoadedTitle = lastLoadedTitleRef.current;
        const previousLoadedText = lastLoadedTextRef.current;
        const hasUnsavedTitleEdit = previousLoadedTitle !== undefined && currentTitleRef.current !== previousLoadedTitle;
        const hasUnsavedTextEdit = previousLoadedText !== undefined && currentTextRef.current !== previousLoadedText;
        if (!hasUnsavedTitleEdit) setTitle(target.title);
        if (!hasUnsavedTextEdit) setText(target.text_content || '');
        lastLoadedTitleRef.current = target.title;
        lastLoadedTextRef.current = target.text_content || '';
        setLocalVoice(target.speaker_profile_name || '');
      }
      const detailsStartedAt = performance.now();
      const [segs, chars, scriptView] = await Promise.all([
        api.fetchSegments(chapterId),
        api.fetchCharacters(projectId, chapterId),
        api.fetchScriptView(chapterId).catch(() => null)
      ]);
      if (shouldLogLoadTimings) {
        recordStudioDebugSnapshot('load:chapter details', {
          chapterId,
          projectId,
          source,
          ms: Math.round(performance.now() - detailsStartedAt),
          segments: segs.length,
          hasScriptView: !!scriptView,
        });
      }
      setSegments(segs);
      setCharacters(chars);
      if (scriptView) setScriptViewData(scriptView);
      else setScriptViewData(null);

      setGeneratingSegmentIds(prev => {
        const currentLiveIds = liveSegmentJobIdsRef.current;
        const next = new Set<string>();
        const initialProcessingIds = new Set(
          segs
            .filter(seg => seg.audio_status === 'processing')
            .map(seg => seg.id)
        );

        for (const id of prev) {
          const seg = segs.find((s: any) => s.id === id);
          if (!seg) continue;
          if (seg.audio_status === 'processing' || currentLiveIds.has(id)) {
            next.add(id);
            continue;
          }
          const pendingAt = pendingGenerationTimesRef.current.get(id) || 0;
          if (pendingGenerationIdsRef.current.has(id) && (Date.now() - pendingAt) < 10000) {
            next.add(id);
            continue;
          }
          pendingGenerationIdsRef.current.delete(id);
          pendingGenerationTimesRef.current.delete(id);
        }

        for (const id of initialProcessingIds) {
          if (!currentLiveIds.has(id)) {
            next.add(id);
          }
        }

        return next.size === prev.size && [...next].every(id => prev.has(id)) ? prev : next;
      });
    } catch (e) {
      console.error(`Failed to load chapter (${source})`, e);
      if ((e as { status?: number })?.status === 404) {
        // Chapter deleted while viewing / bad deep link — clear stale
        // chapter/segment/character state and surface an explicit
        // not-found indicator rather than leaving old content visible.
        setChapterNotFound(true);
        setChapter(null);
        setSegments([]);
        setCharacters([]);
        setScriptViewData(null);
      }
    } finally {
      if (shouldLogLoadTimings) {
        recordStudioDebugSnapshot('load:chapter view complete', {
          chapterId,
          projectId,
          source,
          ms: Math.round(performance.now() - loadStartedAt),
        });
      }
      setLoading(false);
      setScriptViewLoading(false);
    }
  }, [chapterId, projectId, setChapter, setTitle, setText, setLocalVoice, setSegments, setCharacters, setScriptViewData, setGeneratingSegmentIds, setLoading, setScriptViewLoading, setChapterNotFound]);

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
        const [updatedSegments, updatedScript] = await Promise.all([
          api.fetchSegments(chapterId),
          api.fetchScriptView(chapterId).catch(() => null),
        ]);
        setSegments(updatedSegments);
        if (updatedScript) setScriptViewData(updatedScript);
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
  }, [segmentUpdate, chapterId, setSegments, setScriptViewData, setGeneratingSegmentIds]);


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

  const hasRenderedOutput = !!state.chapter?.audio_file_path || !!state.chapter?.has_wav || !!state.chapter?.has_mp3 || !!state.chapter?.has_m4a;
  const jobLooksPendingCompletion = useMemo(() => {
    const mainJob = pickRelevantJob(
      chapterJobs.filter(j => (j.render_group_count ?? 0) > 0 || !j.segment_ids || j.segment_ids.length === 0),
      true
    );
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
