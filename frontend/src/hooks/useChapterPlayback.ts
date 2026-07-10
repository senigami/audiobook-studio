import { useState, useRef, useEffect } from 'react';
import type { ChapterSegment, AudioGroup } from '@/types';
import type { ChunkGroup } from '@/utils/chunkGroups';
import { usePlayerBus, loadAndPlay, play, pause, stop, seek } from '@/store/playerBus';

export function useChapterPlayback(
  projectId: string,
  chapterId: string,
  segments: ChapterSegment[],
  chunkGroups: ChunkGroup[],
  generatingSegmentIds: Set<string>,
  onGenerate: (sids: string[]) => Promise<void>,
  audioGroups: AudioGroup[] = []
) {
  const [playingSegmentId, setPlayingSegmentId] = useState<string | null>(null);
  const [playingSegmentIds, setPlayingSegmentIds] = useState<Set<string>>(new Set());
  const playbackQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef<boolean>(false);
  const segmentsRef = useRef<ChapterSegment[]>(segments);
  const generatingSegmentIdsRef = useRef<Set<string>>(generatingSegmentIds);
  const chunkGroupsRef = useRef<ChunkGroup[]>(chunkGroups);
  const audioGroupsRef = useRef<AudioGroup[]>(audioGroups);
  const pendingPlaybackRef = useRef<{ segmentId: string; queue: string[] } | null>(null);
  const skimIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Full per-block segment membership, keyed by block-leader id. Populated
  // once per playSegment() call (see buildBlockQueue) so playFromIndex can
  // recover a block's full membership (for playingSegmentIds highlighting
  // and missing-audio detection) even though playbackQueueRef.current itself
  // only holds one (leader) entry per block.
  const blockMembersRef = useRef<Map<string, string[]>>(new Map());

  const playerBusState = usePlayerBus();

  // Mirror the latest bus snapshot into a ref so the setInterval closure in
  // startSkim always reads fresh position/duration (avoids stale closure).
  const skimStateRef = useRef(playerBusState);

  const isPlaying = playerBusState.scope === 'segment' && playingSegmentId !== null && playerBusState.playing;
  const isPaused = playerBusState.scope === 'segment' && playingSegmentId !== null && !playerBusState.playing;
  const currentTime = playerBusState.scope === 'segment' && playingSegmentId !== null ? playerBusState.position : 0;
  const duration = playerBusState.scope === 'segment' && playingSegmentId !== null ? playerBusState.duration : 0;

  // Keep the skim state ref pointing at the latest playerBusState snapshot so
  // the setInterval closure always reads fresh position/duration values
  // (avoids stale-closure bug where position is captured at interval creation).
  skimStateRef.current = playerBusState;

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

    // queue is now the block-leader queue (one entry per block), so it can no
    // longer be filtered directly for a block's full membership — recover the
    // full membership captured at buildBlockQueue time instead.
    const groupIds = blockMembersRef.current.get(currentId) ?? [currentId];

    setPlayingSegmentId(currentId);
    setPlayingSegmentIds(new Set(groupIds));

    const audioGroup = audioGroupsRef.current.find(g => g.span_ids.includes(currentId));
    const isReady = (seg.audio_file_path && seg.audio_status === 'done') || !!(audioGroup && (audioGroup.status === 'rendered' || audioGroup.audio_file_path || audioGroup.asset_url));

    if (!isReady) {
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

    let audioPath: string | null | undefined = seg.audio_file_path || audioGroup?.audio_file_path;
    if (!audioPath && audioGroup?.asset_url) {
      const parts = audioGroup.asset_url.split('/');
      audioPath = parts[parts.length - 1] || undefined;
    }
    if (!audioPath) return;
    const wavPath = audioPath.replace(/\.[^.]+$/, '.wav');
    const mp3Path = audioPath.replace(/\.[^.]+$/, '.mp3');

    const urls = [
      `/api/projects/${projectId}/chapters/${seg.chapter_id}/assets/segment?filename=${encodeURIComponent(audioPath)}`,
      `/api/projects/${projectId}/chapters/${seg.chapter_id}/assets/segment?filename=${encodeURIComponent(wavPath)}`,
      `/api/projects/${projectId}/chapters/${seg.chapter_id}/assets/segment?filename=${encodeURIComponent(mp3Path)}`,
    ].filter((v, i, a) => a.indexOf(v) === i);

    let urlIdx = 0;
    const playWithFallback = (u: string) => {
      loadAndPlay({
        scope: 'segment',
        title: seg.text_content || `Segment ${seg.id}`,
        audioUrl: u,
        onEnded: () => {
          if (!isPlayingRef.current) return;
          playFromIndex(idx + 1, queue);
        },
        onPrev: () => {
          if (!isPlayingRef.current) return;
          // Restart-current-block-first semantics (owner-confirmed): pressing
          // Prev restarts the current block unless playback is already at/near
          // the block's start, in which case it goes to the previous block.
          const atBlockStart = skimStateRef.current.position < 1.0;
          const targetIdx = atBlockStart ? idx - 1 : idx;
          if (targetIdx >= 0) {
            playFromIndex(targetIdx, queue);
          }
        },
        onNext: () => {
          if (!isPlayingRef.current) return;
          const nextIdx = idx + 1;
          if (nextIdx < queue.length) {
            playFromIndex(nextIdx, queue);
          }
        },
        onError: () => {
          if (!isPlayingRef.current) return;
          urlIdx++;
          if (urlIdx < urls.length) {
            playWithFallback(urls[urlIdx]);
          } else {
            playFromIndex(idx + 1, queue);
          }
        },
        hasPrev: idx > 0,
        hasNext: idx < queue.length - 1,
      });
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
    return () => stopPlayback();
  }, [chapterId]);

  const stopPlayback = () => {
    stopSkim();
    if (playerBusState.scope === 'segment') {
      stop();
    }
    setPlayingSegmentId(null);
    setPlayingSegmentIds(new Set());
    isPlayingRef.current = false;
    playbackQueueRef.current = [];
    blockMembersRef.current = new Map();
    pendingPlaybackRef.current = null;
  };

  const togglePause = () => {
    if (playerBusState.scope === 'segment') {
      if (playerBusState.playing) {
        pause();
      } else {
        play();
      }
    }
  };

  const seekTo = (time: number) => {
    if (playerBusState.scope === 'segment') {
      seek(time);
    }
  };

  const getGroupSegmentIds = (idx: number, queue: string[]): string[] => {
    if (idx >= queue.length) return [];
    const segId = queue[idx];

    if (audioGroupsRef.current && audioGroupsRef.current.length > 0) {
      const group = audioGroupsRef.current.find(g => g.span_ids.includes(segId));
      if (group) {
        return queue.filter(qid => group.span_ids.includes(qid));
      }
    }

    const group = chunkGroupsRef.current.find(g => g.segments.some(segment => segment.id === segId));
    if (!group) return [segId];
    const groupIds = group.segments.map(segment => segment.id);
    return queue.filter(qid => groupIds.includes(qid));
  };

  // Normalize a raw per-segment queue down to one entry per block, using each
  // block's leader (first-encountered) segment id. getGroupSegmentIds is the
  // single source of truth for block membership (audioGroups first, falling
  // back to chunkGroups) — walking fullQueue once and marking each block's
  // full membership as consumed keeps every later entry from re-emitting.
  // Also returns the full membership captured per leader, since the
  // block-leader queue itself no longer carries non-leader ids.
  const buildBlockQueue = (fullQueue: string[]): { blockQueue: string[]; membersByLeader: Map<string, string[]> } => {
    const consumed = new Set<string>();
    const blockQueue: string[] = [];
    const membersByLeader = new Map<string, string[]>();
    fullQueue.forEach((segId, idx) => {
      if (consumed.has(segId)) return;
      blockQueue.push(segId);
      const memberIds = getGroupSegmentIds(idx, fullQueue);
      membersByLeader.set(segId, memberIds);
      memberIds.forEach(memberId => consumed.add(memberId));
    });
    return { blockQueue, membersByLeader };
  };

  const playSegment = async (segmentId: string, fullQueue: string[]) => {
    // segmentId may be a non-leader member of its block (e.g. a span deep
    // inside an AudioGroup) — resolve to the block's leader id up front so
    // both the toggle-pause guard below and the navigation queue agree on
    // "which id represents this block".
    const rawIndex = fullQueue.indexOf(segmentId);
    const memberIds = rawIndex !== -1 ? getGroupSegmentIds(rawIndex, fullQueue) : [segmentId];
    const leaderId = memberIds[0] ?? segmentId;

    if (playingSegmentId === leaderId && playerBusState.scope === 'segment') {
      togglePause();
      return;
    }

    stopPlayback();
    isPlayingRef.current = true;

    const { blockQueue, membersByLeader } = buildBlockQueue(fullQueue);
    playbackQueueRef.current = blockQueue;
    blockMembersRef.current = membersByLeader;

    if (rawIndex === -1) {
      return;
    }
    const currentIndex = blockQueue.indexOf(leaderId);
    if (currentIndex === -1) {
      return;
    }
    pendingPlaybackRef.current = { segmentId: leaderId, queue: blockQueue };
    await playFromIndex(currentIndex, blockQueue);
  };

  const startSkim = (direction: 'forward' | 'backward') => {
    if (playerBusState.scope !== 'segment' || !isPlayingRef.current) return;
    stopSkim();

    const step = direction === 'forward' ? 0.5 : -0.5;
    skimIntervalRef.current = setInterval(() => {
      // Read from ref to avoid stale closure capturing the initial position/duration.
      // skimStateRef.current is updated every render so the interval always
      // advances from the actual current playback position.
      const { position, duration } = skimStateRef.current;
      seek(Math.max(0, Math.min(position + step, duration || 0)));
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
    seekTo,
    isPlaying,
    isPaused,
    currentTime,
    duration,
    startSkim,
    stopSkim
  };
}
