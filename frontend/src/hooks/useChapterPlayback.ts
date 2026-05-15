import { useState, useRef, useEffect } from 'react';
import type { ChapterSegment, AudioGroup } from '@/types';
import type { ChunkGroup } from '@/utils/chunkGroups';

export function useChapterPlayback(
  projectId: string,
  segments: ChapterSegment[],
  chunkGroups: ChunkGroup[],
  generatingSegmentIds: Set<string>,
  onGenerate: (sids: string[]) => Promise<void>,
  audioGroups: AudioGroup[] = []
) {
  const [playingSegmentId, setPlayingSegmentId] = useState<string | null>(null);
  const [playingSegmentIds, setPlayingSegmentIds] = useState<Set<string>>(new Set());
  const [isPlaying, setIsPlaying] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const playbackQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef<boolean>(false);
  const segmentsRef = useRef<ChapterSegment[]>(segments);
  const generatingSegmentIdsRef = useRef<Set<string>>(generatingSegmentIds);
  const chunkGroupsRef = useRef<ChunkGroup[]>(chunkGroups);
  const audioGroupsRef = useRef<AudioGroup[]>(audioGroups);
  const pendingPlaybackRef = useRef<{ segmentId: string; queue: string[] } | null>(null);
  const skimIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  useEffect(() => {
    generatingSegmentIdsRef.current = generatingSegmentIds;
  }, [generatingSegmentIds]);

  useEffect(() => {
    chunkGroupsRef.current = chunkGroups;
  }, [chunkGroups]);

  useEffect(() => {
    audioGroupsRef.current = audioGroups;
  }, [audioGroups]);

  const playFromIndex = async (idx: number, queue: string[]) => {
    if (!isPlayingRef.current || idx >= queue.length) {
      if (idx >= queue.length) stopPlayback();
      return;
    }

    const currentId = queue[idx];
    const seg = segmentsRef.current.find(s => s.id === currentId);
    if (!seg) return;

    setPlayingSegmentId(currentId);
    setPlayingSegmentIds(new Set(getGroupSegmentIds(idx, queue)));

    if (!seg.audio_file_path || seg.audio_status !== 'done') {
      const groupIds = getGroupSegmentIds(idx, queue);
      const missingInGroup = groupIds.filter(id => {
        const s = segmentsRef.current.find(seg => seg.id === id);
        return s && (!s.audio_file_path || s.audio_status !== 'done') && s.audio_status !== 'processing' && !generatingSegmentIdsRef.current.has(id);
      });

      if (missingInGroup.length > 0 && !groupIds.some(id => generatingSegmentIdsRef.current.has(id))) {
        pendingPlaybackRef.current = { segmentId: currentId, queue };
        await onGenerate(missingInGroup);
      }

      return;
    }

    pendingPlaybackRef.current = null;

    const audioPath = seg.audio_file_path;
    const wavPath = audioPath.replace(/\.[^.]+$/, '.wav');
    const mp3Path = audioPath.replace(/\.[^.]+$/, '.mp3');
    
    const urls = [
      `/api/projects/${projectId}/chapters/${seg.chapter_id}/assets/segment?filename=${encodeURIComponent(audioPath)}`,
      `/api/projects/${projectId}/chapters/${seg.chapter_id}/assets/segment?filename=${encodeURIComponent(wavPath)}`,
      `/api/projects/${projectId}/chapters/${seg.chapter_id}/assets/segment?filename=${encodeURIComponent(mp3Path)}`,
    ].filter((v, i, a) => a.indexOf(v) === i);

    let urlIdx = 0;
    const playWithFallback = (u: string) => {
      const audio = new Audio(u);
      audio.onplay = () => {
        setIsPaused(false);
      };
      audio.onpause = () => {
        if (!isPlayingRef.current) return;
        setIsPaused(true);
      };
      audio.onended = () => {
        if (!isPlayingRef.current) return;
        let nextIdx = idx + 1;
        while (nextIdx < playbackQueueRef.current.length) {
          const nextId = playbackQueueRef.current[nextIdx];
          const nextSeg = segmentsRef.current.find(s => s.id === nextId);
          if (nextSeg && nextSeg.audio_file_path && nextSeg.audio_file_path === seg.audio_file_path) {
            nextIdx++;
          } else {
            break;
          }
        }
        playFromIndex(nextIdx, queue);
      };
      
      audio.onerror = () => {
        if (!isPlayingRef.current) return;
        urlIdx++;
        if (urlIdx < urls.length) {
          playWithFallback(urls[urlIdx]);
        } else {
          playFromIndex(idx + 1, queue);
        }
      };
      
      audio.play().catch(e => {
        console.error("Playback failed", e);
        audio.onerror?.(new Event('error') as any);
      });
      audioPlayerRef.current = audio;
    };

    playWithFallback(urls[0]);
  };

  useEffect(() => {
    const pending = pendingPlaybackRef.current;
    if (!pending || !isPlayingRef.current) return;
    const pendingIdx = pending.queue.indexOf(pending.segmentId);
    if (pendingIdx === -1) {
      pendingPlaybackRef.current = null;
      return;
    }

    const seg = segmentsRef.current.find(s => s.id === pending.segmentId);
    const ready = !!seg && !!seg.audio_file_path && seg.audio_status === 'done' && !generatingSegmentIdsRef.current.has(pending.segmentId);
    if (ready) {
      pendingPlaybackRef.current = null;
      void playFromIndex(pendingIdx, pending.queue);
    }
  }, [segments, generatingSegmentIds]);

  useEffect(() => {
    return () => stopSkim();
  }, []);

  const stopPlayback = () => {
    stopSkim();
    if (audioPlayerRef.current) {
      audioPlayerRef.current.onpause = null;
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }
    setPlayingSegmentId(null);
    setPlayingSegmentIds(new Set());
    isPlayingRef.current = false;
    setIsPlaying(false);
    setIsPaused(false);
    playbackQueueRef.current = [];
    pendingPlaybackRef.current = null;
  };

  const togglePause = () => {
    const audio = audioPlayerRef.current;
    if (!audio) return;
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  };

  const getGroupSegmentIds = (idx: number, queue: string[]): string[] => {
    if (idx >= queue.length) return [];
    const segId = queue[idx];

    // Priority 1: Authoritative render-group mapping from backend
    if (audioGroupsRef.current && audioGroupsRef.current.length > 0) {
      const group = audioGroupsRef.current.find(g => g.span_ids.includes(segId));
      if (group) {
        return queue.filter(qid => group.span_ids.includes(qid));
      }
    }

    // Priority 2: Client-side heuristic grouping
    const group = chunkGroupsRef.current.find(g => g.segments.some(segment => segment.id === segId));
    if (!group) return [segId];
    const groupIds = group.segments.map(segment => segment.id);
    return queue.filter(qid => groupIds.includes(qid));
  };

  const playSegment = async (segmentId: string, fullQueue: string[]) => {
    if (playingSegmentId === segmentId && audioPlayerRef.current) {
      togglePause();
      return;
    }

    stopPlayback();
    isPlayingRef.current = true;
    setIsPlaying(true);
    setIsPaused(false);
    playbackQueueRef.current = fullQueue;
    
    const currentIndex = fullQueue.indexOf(segmentId);
    if (currentIndex === -1) {
      setIsPlaying(false);
      return;
    }
    pendingPlaybackRef.current = { segmentId, queue: fullQueue };
    await playFromIndex(currentIndex, fullQueue);
  };

  const startSkim = (direction: 'forward' | 'backward') => {
    if (!audioPlayerRef.current || !isPlayingRef.current) return;
    stopSkim();

    const step = direction === 'forward' ? 0.5 : -0.5;
    skimIntervalRef.current = setInterval(() => {
      if (audioPlayerRef.current) {
        const newTime = audioPlayerRef.current.currentTime + step;
        audioPlayerRef.current.currentTime = Math.max(0, Math.min(newTime, audioPlayerRef.current.duration || 0));
      } else {
        stopSkim();
      }
    }, 150);
  };

  const stopSkim = () => {
    if (skimIntervalRef.current) {
      clearInterval(skimIntervalRef.current);
      skimIntervalRef.current = null;
    }
  };

  return {
    playingSegmentId,
    playingSegmentIds,
    playSegment,
    stopPlayback,
    togglePause,
    isPlaying,
    isPaused,
    startSkim,
    stopSkim
  };
}
