import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useChapterPlayback } from '@/hooks/useChapterPlayback';
import type { ChapterSegment } from '@/types';
import type { ChunkGroup } from '@/utils/chunkGroups';
import * as playerBus from '@/store/playerBus';

vi.mock('@/store/playerBus', () => {
  return {
    usePlayerBus: () => ({
      scope: 'segment',
      playing: true,
      position: 10,
      duration: 100,
    }),
    loadAndPlay: vi.fn(),
    play: vi.fn(),
    pause: vi.fn(),
    stop: vi.fn(),
    seek: vi.fn(),
  };
});

describe('P4 — stopPlayback clears all audio event handlers', () => {
  const segments: ChapterSegment[] = [
    { id: 's1', text_content: 'Hello', audio_status: 'done', audio_file_path: 's1.wav' } as any,
  ];
  const generatingIds = new Set<string>();
  const onGenerate = vi.fn().mockResolvedValue(undefined);
  const chunkGroups: ChunkGroup[] = [
    { characterId: null, profileName: null, engine: 'xtts', segments: [segments[0]] },
  ];

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('calls playerBus.stop() on stopPlayback', async () => {
    const { result } = renderHook(() =>
      useChapterPlayback('proj', 'ch', segments, chunkGroups, generatingIds, onGenerate)
    );

    await act(async () => {
      await result.current.playSegment('s1', ['s1']);
    });

    act(() => {
      result.current.stopPlayback();
    });

    expect(playerBus.stop).toHaveBeenCalled();
  });
});
