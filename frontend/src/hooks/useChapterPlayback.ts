import { useState, useRef, useEffect } from 'react';
import type { ChapterSegment } from '../types';

export function useChapterPlayback(
  projectId: string,
  segments: ChapterSegment[],
  generatingSegmentIds: Set<string>,
  onGenerate: (sids: string[]) => Promise<void>
) {
  const [playingSegmentId, setPlayingSegmentId] = useState<string | null>(null);
  const audioPlayerRef = useRef<HTMLAudioElement | null>(null);
  const playbackQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef<boolean>(false);
  const segmentsRef = useRef<ChapterSegment[]>(segments);
  const generatingSegmentIdsRef = useRef<Set<string>>(generatingSegmentIds);
  const pendingPlaybackRef = useRef<{ segmentId: string; queue: string[] } | null>(null);

  useEffect(() => {
    segmentsRef.current = segments;
  }, [segments]);

  useEffect(() => {
    generatingSegmentIdsRef.current = generatingSegmentIds;
  }, [generatingSegmentIds]);

  const playFromIndex = async (idx: number, queue: string[]) => {
    if (!isPlayingRef.current || idx >= queue.length) {
      if (idx >= queue.length) stopPlayback();
      return;
    }

    const currentId = queue[idx];
    const seg = segmentsRef.current.find(s => s.id === currentId);
    if (!seg) return;

    setPlayingSegmentId(currentId);

    const currentGroup = getGroupSegmentIds(idx, queue);
    const nextGroupStartIdx = idx + currentGroup.length - (currentGroup.indexOf(currentId));
    lookAheadGenerate(nextGroupStartIdx, queue);

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
      projectId ? `/projects/${projectId}/audio/${audioPath}` : `/out/xtts/${audioPath}`,
      projectId ? `/projects/${projectId}/audio/${wavPath}` : `/out/xtts/${wavPath}`,
      projectId ? `/projects/${projectId}/audio/${mp3Path}` : `/out/xtts/${mp3Path}`,
      `/out/xtts/${audioPath}`,
      `/out/xtts/${wavPath}`,
      `/out/xtts/${mp3Path}`
    ].filter((v, i, a) => a.indexOf(v) === i);

    let urlIdx = 0;
    const playWithFallback = (u: string) => {
      const audio = new Audio(u);
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

  const stopPlayback = () => {
    if (audioPlayerRef.current) {
      audioPlayerRef.current.pause();
      audioPlayerRef.current = null;
    }
    setPlayingSegmentId(null);
    isPlayingRef.current = false;
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
    
    // Simplification: Chunking logic for playback lookahead
    const limit = 500;
    const groups: string[][] = [];
    let currentGroup: string[] = [];
    let currentLength = 0;
    let lastCharId: string | null | undefined = undefined;

    segmentsRef.current.forEach(s => {
        if (lastCharId !== undefined && s.character_id !== lastCharId) {
            groups.push(currentGroup);
            currentGroup = [];
            currentLength = 0;
        }
        if (currentLength + s.text_content.length > limit && currentGroup.length > 0) {
            groups.push(currentGroup);
            currentGroup = [];
            currentLength = 0;
        }
        currentGroup.push(s.id);
        currentLength += s.text_content.length;
        lastCharId = s.character_id;
    });
    if (currentGroup.length > 0) groups.push(currentGroup);

    const group = groups.find(g => g.includes(segId));
    if (!group) return [segId];
    return queue.filter(qid => group.includes(qid));
  };

  const lookAheadGenerate = (idx: number, queue: string[]) => {
    if (idx >= queue.length) return;
    const groupIds = getGroupSegmentIds(idx, queue);
    if (groupIds.length === 0) return;
    if (groupIds.some(id => generatingSegmentIdsRef.current.has(id))) return;
    
    const missingIds = groupIds.filter(id => {
      const s = segmentsRef.current.find(seg => seg.id === id);
      return s && (!s.audio_file_path || s.audio_status !== 'done') && s.audio_status !== 'processing' && !generatingSegmentIdsRef.current.has(id);
    });
    
    if (missingIds.length > 0) {
      onGenerate(missingIds);
    }
  };

  const playSegment = async (segmentId: string, fullQueue: string[]) => {
    if (playingSegmentId === segmentId && audioPlayerRef.current) {
      togglePause();
      return;
    }

    stopPlayback();
    isPlayingRef.current = true;
    playbackQueueRef.current = fullQueue;
    
    const currentIndex = fullQueue.indexOf(segmentId);
    if (currentIndex === -1) return;
    pendingPlaybackRef.current = { segmentId, queue: fullQueue };
    await playFromIndex(currentIndex, fullQueue);
  };

  return {
    playingSegmentId,
    playSegment,
    stopPlayback,
    togglePause,
    isPlaying: isPlayingRef.current
  };
}
