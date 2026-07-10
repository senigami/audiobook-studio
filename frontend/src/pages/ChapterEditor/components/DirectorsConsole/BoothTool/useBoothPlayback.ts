import { useMemo } from 'react';
import { usePlayerBus, loadAndPlay, play, pause, seek } from '@/store/playerBus';
import type { ChapterSegment } from '@/types';

/**
 * Ported from `frontend/src/pages/Book/stages/ReviewStage/useReviewPlayback.ts`
 * (renamed only — same percent-based active-segment mapping, no behavior
 * change). See design-docs/plans/active/directors_console_activation/tasks/004-booth-tool.md.
 */
export interface UseBoothPlaybackOptions {
  chapterId: string | null;
  segments: ChapterSegment[];
}

export function useBoothPlayback({
  chapterId,
  segments,
}: UseBoothPlaybackOptions) {
  const playerBus = usePlayerBus();

  const isCurrentChapterPlaying = useMemo(() => {
    if (!chapterId || !playerBus.audioUrl) return false;
    return (
      playerBus.scope === 'chapter' &&
      playerBus.audioUrl.includes(`/chapters/${chapterId}/`)
    );
  }, [chapterId, playerBus.scope, playerBus.audioUrl]);

  const segmentTimeRanges = useMemo(() => {
    if (!segments || segments.length === 0) return [];

    const totalChars = segments.reduce((sum, seg) => sum + (seg.text_content?.length || 0), 0);
    if (totalChars === 0) {
      return segments.map((seg) => ({
        id: seg.id,
        startPct: 0,
        endPct: 1,
      }));
    }

    let currentChars = 0;
    return segments.map((seg) => {
      const charCount = seg.text_content?.length || 0;
      const startPct = currentChars / totalChars;
      currentChars += charCount;
      const endPct = currentChars / totalChars;
      return {
        id: seg.id,
        startPct,
        endPct,
      };
    });
  }, [segments]);

  const activeSegmentId = useMemo(() => {
    if (!isCurrentChapterPlaying || !playerBus.duration || segmentTimeRanges.length === 0) {
      return null;
    }
    const currentPct = playerBus.position / playerBus.duration;
    const match = segmentTimeRanges.find(
      (range) => currentPct >= range.startPct && currentPct <= range.endPct
    );
    return match ? match.id : segmentTimeRanges[0].id;
  }, [isCurrentChapterPlaying, playerBus.position, playerBus.duration, segmentTimeRanges]);

  /**
   * Load and play a chapter render. The player is scope-agnostic
   * (audio-player.md 1.6.0) — there is no segment/chapter toggle to register.
   */
  const playChapter = (audioUrl: string, title: string) => {
    loadAndPlay({
      scope: 'chapter',
      title,
      audioUrl,
    });
  };

  const seekToSegment = (segmentId: string) => {
    if (!playerBus.duration || segmentTimeRanges.length === 0) return;
    const match = segmentTimeRanges.find((range) => range.id === segmentId);
    if (match) {
      const targetTime = match.startPct * playerBus.duration;
      seek(targetTime);
    }
  };

  const togglePlayPause = () => {
    if (isCurrentChapterPlaying) {
      if (playerBus.playing) {
        pause();
      } else {
        play();
      }
    }
  };

  const seekBy = (seconds: number) => {
    if (playerBus.duration) {
      const newPos = Math.max(0, Math.min(playerBus.position + seconds, playerBus.duration));
      seek(newPos);
    }
  };

  return {
    activeSegmentId,
    isPlaying: isCurrentChapterPlaying && playerBus.playing,
    isPaused: isCurrentChapterPlaying && !playerBus.playing,
    position: playerBus.position,
    duration: playerBus.duration,
    audioUrl: playerBus.audioUrl,
    playChapter,
    seekToSegment,
    togglePlayPause,
    seekBy,
    isCurrentChapterPlaying,
  };
}
