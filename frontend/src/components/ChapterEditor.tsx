import React, { useState, useEffect, useRef } from 'react';
import { ConfirmModal } from './ConfirmModal';
import { api } from '../api';
import type { Chapter, SpeakerProfile, Job, Character, ChapterSegment } from '../types';

// Extracted Components
import { ChapterHeader } from './chapter/ChapterHeader';
import { EditorTabs } from './chapter/EditorTabs';
import { EditTab } from './chapter/EditTab';
import { PerformanceTab } from './chapter/PerformanceTab';
import { PreviewTab } from './chapter/PreviewTab';
import { ProductionTab } from './chapter/ProductionTab';
import { CharacterSidebar } from './chapter/CharacterSidebar';

// Extracted Hooks
import { useChapterPlayback } from '../hooks/useChapterPlayback';
import { useChapterAnalysis } from '../hooks/useChapterAnalysis';
import { buildVoiceOptions } from '../utils/voiceProfiles';
import { buildChunkGroups } from '../utils/chunkGroups';
import { getDefaultVoiceProfileName, getVoiceOptionLabel } from '../utils/voiceProfiles';
import { logVoxtralDebug } from '../utils/debugVoxtral';
import { pickRelevantJob } from '../utils/jobSelection';

interface ChapterEditorProps {
  chapterId: string;
  projectId: string;
  speakerProfiles: SpeakerProfile[];
  speakers: import('../types').Speaker[];
  job?: Job;
  chapterJobs?: Job[];
  selectedVoice?: string;
  onBack: () => void;
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
  job, 
  chapterJobs = [],
  selectedVoice: externalVoice, 
  onBack, 
  onNext, 
  onPrev, 
  segmentUpdate,
  chapterUpdate
}) => {
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [title, setTitle] = useState('');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [queuePending, setQueuePending] = useState(false);
  const [queueNotice, setQueueNotice] = useState<string | null>(null);
  const [localVoice, setLocalVoice] = useState<string>('');
  
  const [segments, setSegments] = useState<ChapterSegment[]>([]);
  const [characters, setCharacters] = useState<Character[]>([]);
  const [activeSegmentId, setActiveSegmentId] = useState<string | null>(null);
  const [selectedCharacterId, setSelectedCharacterId] = useState<string | null>(null);
  const [selectedProfileName, setSelectedProfileName] = useState<string | null>(null);
  const [expandedCharacterId, setExpandedCharacterId] = useState<string | null>(null);
  const [hoveredSegmentId, setHoveredSegmentId] = useState<string | null>(null);
  
  const [confirmConfig, setConfirmConfig] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
    isDestructive?: boolean;
    confirmText?: string;
  } | null>(null);

  const projectVoice = externalVoice || '';
  const chapterVoice = localVoice;
  const effectiveSelectedVoice = chapterVoice || projectVoice;
  const chapterDefaultVoiceLabel = React.useMemo(() => {
    const fallbackVoiceValue = projectVoice || getDefaultVoiceProfileName(speakerProfiles || []) || '';
    const fallbackVoiceLabel = getVoiceOptionLabel(fallbackVoiceValue, speakerProfiles || [], speakers || []);
    return fallbackVoiceLabel ? `Use Project Default (${fallbackVoiceLabel})` : 'Use Project Default';
  }, [projectVoice, speakerProfiles, speakers]);
  const handleVoiceChange = async (voice: string) => {
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
        setConfirmConfig({
          title: 'Voice Update Failed',
          message: e instanceof Error ? e.message : 'The chapter voice could not be saved.',
          onConfirm: () => {},
          confirmText: 'OK'
        });
      }
  };

  const [editorTab, setEditorTab] = useState<'edit' | 'preview' | 'production' | 'performance'>('edit');
  const [generatingSegmentIds, setGeneratingSegmentIds] = useState<Set<string>>(new Set());
  const pendingGenerationIdsRef = useRef<Set<string>>(new Set());
  const pendingGenerationTimesRef = useRef<Map<string, number>>(new Map());
  const segmentRefreshTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queueSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completionPollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const completionPollAttemptsRef = useRef(0);

  const availableVoices = React.useMemo(() => {
    return buildVoiceOptions(speakerProfiles || [], speakers || []);
  }, [speakers, speakerProfiles]);

  const { analysis, setAnalysis, analyzing, loadingVoiceChunks, ensureVoiceChunks, runAnalysis } = useChapterAnalysis(chapterId, text);

  const handleGenerate = async (sids: string[]) => {
    const uniqueIds = Array.from(new Set(sids));
    const freshIds = uniqueIds.filter(id => {
        const seg = segments.find(s => s.id === id);
        return !!seg
            && seg.audio_status !== 'processing'
            && !effectivePendingSegmentIds.has(id)
            && !pendingGenerationIdsRef.current.has(id);
    });

    if (freshIds.length === 0) return;

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
        setConfirmConfig({
          title: 'Generation Blocked',
          message: e instanceof Error ? e.message : 'This segment could not be queued.',
          onConfirm: () => {},
          confirmText: 'OK'
        });
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
  };

  const chunkGroups = React.useMemo(() => {
    return buildChunkGroups(segments, characters, effectiveSelectedVoice, speakerProfiles);
  }, [segments, characters, effectiveSelectedVoice, speakerProfiles]);

  const liveSegmentJobIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const chapterJob of chapterJobs) {
      for (const segmentId of chapterJob.segment_ids || []) {
        ids.add(segmentId);
      }
    }
    return ids;
  }, [chapterJobs]);

  const queuedSegmentJobIds = React.useMemo(() => {
    const ids = new Set<string>();
    for (const chapterJob of chapterJobs) {
      if (!['queued', 'preparing'].includes(chapterJob.status)) continue;
      for (const segmentId of chapterJob.segment_ids || []) {
        ids.add(segmentId);
      }
    }
    return ids;
  }, [chapterJobs]);

  const effectivePendingSegmentIds = React.useMemo(() => {
    const ids = new Set<string>(generatingSegmentIds);
    for (const segmentId of liveSegmentJobIds) ids.add(segmentId);
    return ids;
  }, [generatingSegmentIds, liveSegmentJobIds]);

  const generatingSegmentJob = React.useMemo(() => {
    return pickRelevantJob(chapterJobs);
  }, [chapterJobs]);

  const { playingSegmentId, playSegment, stopPlayback } = useChapterPlayback(projectId, segments, chunkGroups, effectivePendingSegmentIds, handleGenerate);

  const paragraphGroups = React.useMemo(() => {
    const groups: { characterId: string | null; segments: ChapterSegment[] }[] = [];
    segments.forEach(seg => {
        const lastGroup = groups[groups.length - 1];
        const lastSeg = lastGroup?.segments[lastGroup.segments.length - 1];
        const isNewParagraph = lastSeg && (lastSeg.text_content.includes('\n') || lastSeg.text_content.includes('\r'));
        if (lastGroup && !isNewParagraph) {
            lastGroup.segments.push(seg);
        } else {
            groups.push({ characterId: seg.character_id, segments: [seg] });
        }
    });
    return groups;
  }, [segments]);

  const loadChapter = async (source: string = 'unknown') => {
    try {
      const chapters = await api.fetchChapters(projectId);
      const target = chapters.find(c => c.id === chapterId);
      if (target) {
        logVoxtralDebug('chapter-editor-load-result', {
          source,
          chapterId,
          chapterAudioStatus: target.audio_status ?? null,
          chapterAudioFilePath: target.audio_file_path ?? null,
          hasWav: !!target.has_wav,
          hasMp3: !!target.has_mp3,
          hasM4a: !!target.has_m4a,
          speakerProfileName: target.speaker_profile_name ?? null,
        });
        setChapter(target);
        setTitle(target.title);
        setText(target.text_content || '');
        setLocalVoice(target.speaker_profile_name || '');
      }
      const [segs, chars] = await Promise.all([
        api.fetchSegments(chapterId),
        api.fetchCharacters(projectId)
      ]);
      setSegments(segs);
      setCharacters(chars);
      setGeneratingSegmentIds(prev => {
        if (prev.size === 0) return prev;
        const next = new Set(
          Array.from(prev).filter(id => {
            const seg = segs.find((s: any) => s.id === id);
            if (!seg) return false;
            if (seg.audio_status === 'processing') return true;
            if (liveSegmentJobIds.has(id)) return true;
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
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadChapter('mount'); }, [chapterId]);

  useEffect(() => {
    if (!chapterUpdate || chapterUpdate.chapterId !== chapterId || chapterUpdate.tick === 0) return;
    void loadChapter('chapter-update');
  }, [chapterUpdate, chapterId]);

  useEffect(() => {
    if (!segmentUpdate || segmentUpdate.chapterId !== chapterId || segmentUpdate.tick === 0) return;
    if (segmentRefreshTimerRef.current) clearTimeout(segmentRefreshTimerRef.current);
    segmentRefreshTimerRef.current = setTimeout(async () => {
        try {
        const updated = await api.fetchSegments(chapterId);
        setSegments(updated);
        setGeneratingSegmentIds(prev => {
          const next = new Set(prev);
          for (const id of prev) {
            const seg = updated.find((s: any) => s.id === id);
            if (!seg) {
              next.delete(id);
              pendingGenerationIdsRef.current.delete(id);
              pendingGenerationTimesRef.current.delete(id);
              continue;
            }
            if (liveSegmentJobIds.has(id) || seg.audio_status === 'processing') {
              continue;
            }
            const shouldClear = seg.audio_status === 'done'
              || seg.audio_status === 'error'
              || seg.audio_status === 'failed'
              || seg.audio_status === 'cancelled'
              || seg.audio_status === 'unprocessed';
            if (shouldClear) {
              next.delete(id);
              pendingGenerationIdsRef.current.delete(id);
              pendingGenerationTimesRef.current.delete(id);
              continue;
            }
            const pendingAt = pendingGenerationTimesRef.current.get(id) || 0;
            if (pendingGenerationIdsRef.current.has(id) && (Date.now() - pendingAt) < 10000) {
              continue;
            }
          }
          return next.size !== prev.size ? next : prev;
        });
      } catch (e) { console.error("WS refresh failed", e); }
    }, 300);
  }, [segmentUpdate, chapterId, liveSegmentJobIds]);

  useEffect(() => {
    if (chapterJobs.length > 0) return;
    setGeneratingSegmentIds(prev => {
      if (prev.size === 0) return prev;
      const next = new Set(
        Array.from(prev).filter(id => {
          const seg = segments.find(s => s.id === id);
          if (!seg) return false;
          if (seg.audio_status === 'processing') return true;
          if (seg.audio_status === 'done' || seg.audio_status === 'error' || seg.audio_status === 'failed' || seg.audio_status === 'cancelled') {
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

  const handleSave = async (manualTitle?: string, manualText?: string) => {
    if (!chapter) return false;
    const finalTitle = manualTitle !== undefined ? manualTitle : title;
    const finalText = manualText !== undefined ? manualText : text;
    if (finalTitle === chapter.title && finalText === chapter.text_content) return true;

    setSaving(true);
    try {
      const result = await api.updateChapter(chapterId, { title: finalTitle, text_content: finalText });
      if (result.chapter) setChapter(result.chapter);
      if (finalText !== chapter.text_content) {
          const updatedSegs = await api.fetchSegments(chapterId);
          setSegments(updatedSegs);
          runAnalysis(finalText);
      }
      return true;
    } catch (e) { console.error("Save failed", e); return false; }
    finally { setTimeout(() => setSaving(false), 500); }
  };

  useEffect(() => {
    if (loading) return;
    const timer = setTimeout(() => handleSave(title, text), 1500);
    return () => clearTimeout(timer);
  }, [title, text]);

  const handleUpdateCharacterColor = async (id: string, color: string) => {
    try {
      setCharacters(prev => prev.map(c => c.id === id ? { ...c, color } : c));
      await api.updateCharacter(id, undefined, undefined, undefined, color);
    } catch (e) { console.error("Color update failed", e); loadChapter(); }
  };

  const resolveDefaultVariantName = (characterId: string | null) => {
    if (!characterId || characterId === 'CLEAR_ASSIGNMENT') return null;
    const character = characters.find(c => c.id === characterId);
    if (!character?.speaker_profile_name) return null;
    const speaker = speakers.find(s => s.name === character.speaker_profile_name);
    if (!speaker) return null;
    const variants = (speakerProfiles || []).filter(p => p.speaker_id === speaker.id);
    return getDefaultVoiceProfileName(variants);
  };

  const handleParagraphBulkAssign = async (segmentIds: string[]) => {
    const isClearing = selectedCharacterId === 'CLEAR_ASSIGNMENT';
    const characterId = isClearing ? null : selectedCharacterId;
    const profileName = isClearing ? null : (selectedCharacterId ? (selectedProfileName || resolveDefaultVariantName(selectedCharacterId)) : null);
    
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
  };

  const handleParagraphBulkReset = async (segmentIds: string[]) => {
    setSegments(prev => prev.map(s => segmentIds.includes(s.id) ? { ...s, character_id: null, speaker_profile_name: null } : s));
    try { await api.updateSegmentsBulk(segmentIds, { character_id: null, speaker_profile_name: null }); }
    catch (e) { console.error("Bulk reset failed", e); }
  };

  const hasRenderedOutput = chapter?.audio_status === 'done' || !!chapter?.audio_file_path || !!chapter?.has_wav || !!chapter?.has_mp3;
  const hasRenderedSegments = segments.some(s => s.audio_status === 'done' || !!s.audio_file_path);
  const hasPartialSegmentProgress = hasRenderedSegments && !hasRenderedOutput;
  const shouldWarnBeforeRequeue = hasRenderedOutput;
  const hasLiveJob = ['queued', 'preparing', 'running', 'finalizing'].includes(job?.status || '');
  const jobLooksPendingCompletion = job?.status === 'done' && !hasRenderedOutput && chapter?.audio_status !== 'processing';
  const needsCompletionRefresh = jobLooksPendingCompletion || (chapter?.audio_status === 'processing' && !hasLiveJob);
  const rawQueueLocked = queuePending || submitting || chapter?.audio_status === 'processing' || hasLiveJob || jobLooksPendingCompletion;
  const [heldQueueLocked, setHeldQueueLocked] = useState(false);
  const queueLockReleaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isQueueLocked = rawQueueLocked || heldQueueLocked;
  const queueButtonLabel = shouldWarnBeforeRequeue ? 'Rebuild' : hasPartialSegmentProgress ? 'Complete' : 'Queue';
  const queueButtonTitle = shouldWarnBeforeRequeue ? 'Rebuild Chapter' : hasPartialSegmentProgress ? 'Complete Chapter Audio' : 'Queue Chapter';

  const prevQueuePendingRef = useRef(queuePending);
  const prevNeedsCompletionRefreshRef = useRef(needsCompletionRefresh);
  const prevRawQueueLockedRef = useRef(rawQueueLocked);

  useEffect(() => {
    if (chapter?.audio_status === 'processing' || ['queued', 'preparing', 'running', 'finalizing'].includes(job?.status || '') || jobLooksPendingCompletion) {
      setQueuePending(false);
    }
  }, [chapter?.audio_status, job?.status, jobLooksPendingCompletion]);

  useEffect(() => {
    const wasRawQueueLocked = prevRawQueueLockedRef.current;
    prevRawQueueLockedRef.current = rawQueueLocked;

    if (queueLockReleaseTimerRef.current) {
      clearTimeout(queueLockReleaseTimerRef.current);
      queueLockReleaseTimerRef.current = null;
    }

    if (rawQueueLocked) {
      if (!heldQueueLocked) setHeldQueueLocked(true);
      return;
    }

    if (!hasRenderedOutput && wasRawQueueLocked) {
      if (!heldQueueLocked) setHeldQueueLocked(true);
      queueLockReleaseTimerRef.current = setTimeout(() => {
        setHeldQueueLocked(false);
        queueLockReleaseTimerRef.current = null;
      }, 500);
      return;
    }

    if (heldQueueLocked) {
      setHeldQueueLocked(false);
    }
  }, [rawQueueLocked, hasRenderedOutput, heldQueueLocked]);

  useEffect(() => {
    logVoxtralDebug('chapter-editor-state', {
      chapterId,
      chapterAudioStatus: chapter?.audio_status ?? null,
      chapterAudioFilePath: chapter?.audio_file_path ?? null,
      hasWav: !!chapter?.has_wav,
      hasMp3: !!chapter?.has_mp3,
      queuePending,
      rawQueueLocked,
      heldQueueLocked,
      hasLiveJob,
      jobId: job?.id ?? null,
      jobEngine: job?.engine ?? null,
      jobStatus: job?.status ?? null,
      jobProgress: job?.progress ?? null,
      jobStartedAt: job?.started_at ?? null,
      hasRenderedOutput,
      jobLooksPendingCompletion,
      needsCompletionRefresh,
    });
  }, [
    chapterId,
    chapter?.audio_status,
    chapter?.audio_file_path,
    chapter?.has_wav,
    chapter?.has_mp3,
    queuePending,
    rawQueueLocked,
    heldQueueLocked,
    hasLiveJob,
    job?.id,
    job?.engine,
    job?.status,
    job?.progress,
    job?.started_at,
    hasRenderedOutput,
    jobLooksPendingCompletion,
    needsCompletionRefresh,
  ]);

  useEffect(() => {
    if (prevQueuePendingRef.current !== queuePending) {
      logVoxtralDebug('chapter-editor-queue-pending', {
        chapterId,
        previous: prevQueuePendingRef.current,
        next: queuePending,
        jobId: job?.id ?? null,
        jobStatus: job?.status ?? null,
        chapterAudioStatus: chapter?.audio_status ?? null,
      });
      prevQueuePendingRef.current = queuePending;
    }
    if (prevNeedsCompletionRefreshRef.current !== needsCompletionRefresh) {
      logVoxtralDebug('chapter-editor-needs-completion-refresh', {
        chapterId,
        previous: prevNeedsCompletionRefreshRef.current,
        next: needsCompletionRefresh,
        jobId: job?.id ?? null,
        jobStatus: job?.status ?? null,
        chapterAudioStatus: chapter?.audio_status ?? null,
        hasRenderedOutput,
        hasLiveJob,
      });
      prevNeedsCompletionRefreshRef.current = needsCompletionRefresh;
    }
  }, [
    chapterId,
    queuePending,
    needsCompletionRefresh,
    job?.id,
    job?.status,
    chapter?.audio_status,
    hasRenderedOutput,
    hasLiveJob,
  ]);

  useEffect(() => {
    return () => {
      if (queueLockReleaseTimerRef.current) clearTimeout(queueLockReleaseTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (completionPollTimerRef.current) {
      clearTimeout(completionPollTimerRef.current);
      completionPollTimerRef.current = null;
    }

    if (!needsCompletionRefresh) {
      completionPollAttemptsRef.current = 0;
      return;
    }

    if (completionPollAttemptsRef.current >= 30) {
      return;
    }

    let cancelled = false;

    const scheduleNextPoll = () => {
      if (cancelled) return;
      if (completionPollAttemptsRef.current >= 30) {
        logVoxtralDebug('chapter-editor-refresh-exhausted', {
          chapterId,
          attempts: completionPollAttemptsRef.current,
          jobId: job?.id ?? null,
          jobStatus: job?.status ?? null,
          chapterAudioStatus: chapter?.audio_status ?? null,
        });
        return;
      }

      completionPollTimerRef.current = setTimeout(async () => {
        completionPollTimerRef.current = null;
        if (cancelled) return;

        completionPollAttemptsRef.current += 1;
        logVoxtralDebug('chapter-editor-refresh-attempt', {
          chapterId,
          attempt: completionPollAttemptsRef.current,
          jobId: job?.id ?? null,
          jobStatus: job?.status ?? null,
          chapterAudioStatus: chapter?.audio_status ?? null,
        });
        try {
          await loadChapter('completion-refresh');
        } catch (e) {
          console.error("Completion refresh failed", e);
        }

        if (!cancelled) {
          scheduleNextPoll();
        }
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
  }, [needsCompletionRefresh, chapterId, job?.id, job?.status]);

  const executeQueue = async () => {
    if (queueSyncTimerRef.current) {
      clearTimeout(queueSyncTimerRef.current);
      queueSyncTimerRef.current = null;
    }
    setQueuePending(true);
    setSubmitting(true);
    try {
        setQueueNotice('Queued. Keep this page open to watch progress.');
        await api.addProcessingQueue(projectId, chapterId, 0, effectiveSelectedVoice || undefined);
        await loadChapter('queue-submit');
        queueSyncTimerRef.current = setTimeout(async () => {
          queueSyncTimerRef.current = null;
          try {
            await loadChapter('queue-sync-delay');
          } catch (e) {
            console.error("Delayed queue sync failed", e);
          } finally {
            setQueuePending(false);
          }
        }, 1000);
    } catch (e) {
        setQueuePending(false);
        setQueueNotice(null);
        setConfirmConfig({
          title: 'Queue Blocked',
          message: e instanceof Error ? e.message : 'Failed to queue chapter.',
          onConfirm: () => {},
          confirmText: 'OK'
        });
    } finally { setSubmitting(false); }
  };

  useEffect(() => {
    if (!queueNotice) return;
    const timer = setTimeout(() => setQueueNotice(null), 3500);
    return () => clearTimeout(timer);
  }, [queueNotice]);

  useEffect(() => {
    return () => {
      if (queueSyncTimerRef.current) clearTimeout(queueSyncTimerRef.current);
      if (segmentRefreshTimerRef.current) clearTimeout(segmentRefreshTimerRef.current);
      if (completionPollTimerRef.current) clearTimeout(completionPollTimerRef.current);
    };
  }, []);

  if (loading) return <div style={{ padding: '2rem' }}>Loading editor...</div>;
  if (!chapter) return <div style={{ padding: '2rem' }}>Chapter not found.</div>;

  const hasUnsavedChanges = (title || "").trim() !== (chapter.title || "").trim() || 
                           (text || "").replace(/\r\n/g, '\n') !== (chapter.text_content || "").replace(/\r\n/g, '\n');

  return (
    <div className="animate-in" style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 72px)', margin: '-2.5rem', background: 'var(--bg)', position: 'relative', zIndex: 100 }}>
      <ChapterHeader 
        chapter={chapter} title={title} setTitle={setTitle} saving={saving} hasUnsavedChanges={hasUnsavedChanges}
        onBack={async () => { await handleSave(); onBack(); }}
        onPrev={onPrev ? async () => { await handleSave(); onPrev(); } : undefined}
        onNext={onNext ? async () => { await handleSave(); onNext(); } : undefined}
        selectedVoice={chapterVoice} onVoiceChange={handleVoiceChange} availableVoices={availableVoices} defaultVoiceLabel={chapterDefaultVoiceLabel}
        submitting={submitting} queueLocked={isQueueLocked} queuePending={queuePending} job={job} generatingJob={generatingSegmentJob} generatingSegmentIdsCount={effectivePendingSegmentIds.size}
        queueLabel={queueButtonLabel}
        queueTitle={queueButtonTitle}
        onQueue={() => {
            if (shouldWarnBeforeRequeue) {
                setConfirmConfig({
                    title: 'Requeue Completed Chapter',
                    message: 'All audio for this chapter is already complete. Rebuilding will delete the existing final render and regenerate from the current segments. Continue?',
                    onConfirm: async () => { setConfirmConfig(null); await executeQueue(); },
                    confirmText: 'Yes, Rebuild It',
                    isDestructive: true
                });
            } else if (chapter?.char_count && chapter.char_count > 50000) {
                setConfirmConfig({
                    title: 'Large Chapter Warning',
                    message: `Chapter is long (${chapter.char_count.toLocaleString()} chars). Queue anyway?`,
                    onConfirm: async () => { setConfirmConfig(null); await executeQueue(); },
                    confirmText: 'Yes, Queue It',
                    isDestructive: false
                });
            } else executeQueue();
        }}
        onStopAll={async () => {
            try { await api.cancelChapterGeneration(chapterId); setGeneratingSegmentIds(new Set()); loadChapter('cancel'); }
            catch (e) { console.error("Cancel failed", e); }
        }}
      />

      <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', padding: '1.5rem', overflow: 'hidden', minHeight: 0 }}>
            <div style={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', minHeight: 0 }}>
                <EditorTabs 
                  editorTab={editorTab} setEditorTab={setEditorTab} onSave={handleSave} 
                  onEnsureVoiceChunks={() => ensureVoiceChunks(handleSave)}
                  analysis={analysis} loadingVoiceChunks={loadingVoiceChunks}
                />
                
                {editorTab === 'edit' && (
                  <EditTab text={text} setText={setText} analysis={analysis} setAnalysis={setAnalysis} analyzing={analyzing} chapter={chapter} segmentsCount={segments.length} />
                )}
                {editorTab === 'performance' && (
                  <PerformanceTab 
                    chunkGroups={chunkGroups} characters={characters} playingSegmentId={playingSegmentId} 
                    playbackQueue={segments.map(s => s.id)} generatingSegmentIds={generatingSegmentIds} queuedSegmentIds={queuedSegmentJobIds}
                    allSegmentIds={segments.map(s => s.id)} segments={segments}
                    onPlay={playSegment} onStop={stopPlayback} onGenerate={handleGenerate}
                    generatingJob={generatingSegmentJob}
                  />
                )}
                {editorTab === 'preview' && <PreviewTab analysis={analysis} analyzing={analyzing} />}
                {editorTab === 'production' && (
                  <ProductionTab 
                    paragraphGroups={paragraphGroups} characters={characters} speakerProfiles={speakerProfiles} selectedCharacterId={selectedCharacterId}
                    hoveredSegmentId={hoveredSegmentId} setHoveredSegmentId={setHoveredSegmentId}
                    activeSegmentId={activeSegmentId} setActiveSegmentId={setActiveSegmentId}
                    onBulkAssign={handleParagraphBulkAssign} onBulkReset={handleParagraphBulkReset}
                    segmentsCount={segments.length}
                  />
                )}
            </div>
        </div>

        <CharacterSidebar 
            characters={characters} speakers={speakers} speakerProfiles={speakerProfiles}
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

      {queueNotice && (
        <div style={{
          position: 'fixed',
          right: '1.5rem',
          bottom: '1.5rem',
          zIndex: 1500,
          background: 'var(--surface)',
          color: 'var(--text-primary)',
          border: '1px solid var(--accent)',
          boxShadow: 'var(--shadow-lg)',
          borderRadius: '14px',
          padding: '0.85rem 1rem',
          display: 'flex',
          alignItems: 'center',
          gap: '0.65rem',
          maxWidth: '360px'
        }}>
          <div style={{
            width: '32px',
            height: '32px',
            borderRadius: '50%',
            background: 'var(--accent-tint)',
            color: 'var(--accent)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontWeight: 800,
            flexShrink: 0
          }}>
            ✓
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.1rem' }}>
            <span style={{ fontWeight: 700 }}>Queued</span>
            <span style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{queueNotice}</span>
          </div>
        </div>
      )}
    </div>
  );
};
