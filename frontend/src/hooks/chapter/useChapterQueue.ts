import { useCallback, useMemo, useRef, useEffect } from 'react';
import { api } from '../../api';
import { resolveVoiceEngineStatus } from '../../utils/chapterEditorHelpers';
import { getDefaultVoiceProfileName } from '../../utils/voiceProfiles';
import { pickRelevantJob } from '../../utils/jobSelection';
import type { ChapterEditorState } from './useChapterEditorState';
import type { Job, SpeakerProfile, TtsEngine } from '../../types';

export const useChapterQueue = (
  state: ChapterEditorState,
  projectId: string,
  chapterId: string,
  speakerProfiles: SpeakerProfile[],
  engines: TtsEngine[],
  chapterJobs: Job[],
  loadChapter: (source?: string) => Promise<void>,
  liveSegmentJobIds: Set<string>
) => {
  const {
    segments, setGeneratingSegmentIds, pendingGenerationIdsRef,
    pendingGenerationTimesRef, queueSyncTimerRef, setSubmitting
  } = state;

  const liveSegmentJobIdsRef = useRef(liveSegmentJobIds);
  useEffect(() => { liveSegmentJobIdsRef.current = liveSegmentJobIds; }, [liveSegmentJobIds]);

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
  }, [segments, speakerProfiles, engines, setGeneratingSegmentIds, pendingGenerationIdsRef, pendingGenerationTimesRef]);

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
  }, [chapterId, projectId, speakerProfiles, engines, loadChapter, queueSyncTimerRef, setSubmitting]);

  const generatingSegmentJob = useMemo(() => pickRelevantJob(chapterJobs), [chapterJobs]);

  return {
    handleGenerate,
    executeQueue,
    generatingSegmentJob
  };
};
