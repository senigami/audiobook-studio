import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useChapterPlayback } from '@/hooks/useChapterPlayback';
import type { ChapterSegment } from '@/types';
import type { ChunkGroup } from '@/utils/chunkGroups';
import * as playerBus from '@/store/playerBus';

let mockPlayerBusState = {
  scope: null as any,
  title: '',
  subtitle: undefined as string | undefined,
  audioUrl: null as string | null,
  playing: false,
  position: 0,
  duration: 0,
  queue: { hasPrev: false, hasNext: false },
  requestId: 0,
};

vi.mock('@/store/playerBus', () => {
  return {
    usePlayerBus: () => mockPlayerBusState,
    loadAndPlay: vi.fn().mockImplementation((opts) => {
      mockPlayerBusState.scope = opts.scope;
      mockPlayerBusState.title = opts.title;
      mockPlayerBusState.subtitle = opts.subtitle;
      mockPlayerBusState.audioUrl = opts.audioUrl;
      mockPlayerBusState.playing = true;
      mockPlayerBusState.queue = {
        hasPrev: opts.hasPrev ?? false,
        hasNext: opts.hasNext ?? false,
      };
      mockPlayerBusState.requestId++;
    }),
    play: vi.fn().mockImplementation(() => {
      mockPlayerBusState.playing = true;
    }),
    pause: vi.fn().mockImplementation(() => {
      mockPlayerBusState.playing = false;
    }),
    stop: vi.fn().mockImplementation(() => {
      mockPlayerBusState.scope = null;
      mockPlayerBusState.audioUrl = null;
      mockPlayerBusState.playing = false;
      mockPlayerBusState.position = 0;
      mockPlayerBusState.duration = 0;
    }),
    seek: vi.fn().mockImplementation((pos) => {
      mockPlayerBusState.position = pos;
    }),
    resetPlayerBusForTests: vi.fn(),
  };
});

describe('useChapterPlayback', () => {
  const segments: ChapterSegment[] = [
    { id: 's1', text_content: 'Hello', audio_status: 'done', audio_file_path: 's1.wav' },
    { id: 's2', text_content: 'World', audio_status: 'done', audio_file_path: 's2.wav' },
  ] as any;
  const generatingSegmentIds = new Set<string>();
  const onGenerate = vi.fn().mockResolvedValue(undefined);
  const chunkGroups: ChunkGroup[] = [
    { characterId: null, profileName: null, engine: 'xtts', segments: [segments[0]] },
    { characterId: null, profileName: null, engine: 'xtts', segments: [segments[1]] },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mockPlayerBusState = {
      scope: null,
      title: '',
      subtitle: undefined,
      audioUrl: null,
      playing: false,
      position: 0,
      duration: 0,
      queue: { hasPrev: false, hasNext: false },
      requestId: 0,
    };
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts playback and plays next segment on end', async () => {
    const { result, unmount } = renderHook(() =>
      useChapterPlayback('proj1', 'chap1', segments, chunkGroups, generatingSegmentIds, onGenerate)
    );

    await act(async () => {
      await result.current.playSegment('s1', ['s1', 's2']);
    });

    expect(result.current.playingSegmentId).toBe('s1');
    expect(playerBus.loadAndPlay).toHaveBeenCalled();

    // Simulate audio ended by calling the onEnded callback passed to loadAndPlay
    const lastCall = vi.mocked(playerBus.loadAndPlay).mock.calls.at(-1);
    const opts = lastCall?.[0];
    
    await act(async () => {
      opts?.onEnded?.();
    });

    // Should move to s2
    expect(result.current.playingSegmentId).toBe('s2');

    unmount();
    expect(playerBus.stop).toHaveBeenCalled();
  });

  it('stops playback', async () => {
    const { result } = renderHook(() =>
      useChapterPlayback('proj1', 'chap1', segments, chunkGroups, generatingSegmentIds, onGenerate)
    );

    await act(async () => {
      await result.current.playSegment('s1', ['s1', 's2']);
    });

    act(() => {
      result.current.stopPlayback();
    });

    expect(result.current.playingSegmentId).toBeNull();
    expect(playerBus.stop).toHaveBeenCalled();
  });

  it('stops playback on chapter change', async () => {
    const { result, rerender } = renderHook(
      ({ chapterId }) => useChapterPlayback('proj1', chapterId, segments, chunkGroups, generatingSegmentIds, onGenerate),
      { initialProps: { chapterId: 'chap1' } }
    );

    await act(async () => {
      await result.current.playSegment('s1', ['s1', 's2']);
    });

    expect(result.current.isPlaying).toBe(true);

    await act(async () => {
      rerender({ chapterId: 'chap2' });
    });

    expect(result.current.isPlaying).toBe(false);
    expect(playerBus.stop).toHaveBeenCalled();
  });

  it('keeps stop from leaving playback in a paused state', async () => {
    const { result } = renderHook(() =>
      useChapterPlayback('proj1', 'chap1', segments, chunkGroups, generatingSegmentIds, onGenerate)
    );

    await act(async () => {
      await result.current.playSegment('s1', ['s1', 's2']);
    });

    act(() => {
      result.current.stopPlayback();
    });

    expect(result.current.playingSegmentId).toBeNull();
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.isPaused).toBe(false);
  });

  it('triggers onGenerate for missing audio', async () => {
    const segmentsMissing = [
      { id: 's1', text_content: 'Hello', audio_status: 'unprocessed' },
    ] as any;

    const { result } = renderHook(() =>
      useChapterPlayback('proj1', 'chap1', segmentsMissing, [{ characterId: null, profileName: null, engine: 'xtts', segments: segmentsMissing as any }], generatingSegmentIds, onGenerate)
    );

    await act(async () => {
      await result.current.playSegment('s1', ['s1']);
    });

    expect(onGenerate).toHaveBeenCalledWith(['s1']);
  });

  it('does not auto-queue the next group while playing a completed segment', async () => {
    const nextGroupMissing = [
      { id: 's1', character_id: 'char-1', text_content: 'Hello', audio_status: 'done', audio_file_path: 's1.wav' },
      { id: 's2', character_id: 'char-2', text_content: 'World', audio_status: 'unprocessed', audio_file_path: null },
    ] as any;

    const { result } = renderHook(() =>
      useChapterPlayback(
        'proj1',
        'chap1',
        nextGroupMissing as any,
        [
          { characterId: 'char-1', profileName: null, engine: 'xtts', segments: [nextGroupMissing[0] as any] },
          { characterId: 'char-2', profileName: null, engine: 'xtts', segments: [nextGroupMissing[1] as any] },
        ],
        generatingSegmentIds,
        onGenerate
      )
    );

    await act(async () => {
      await result.current.playSegment('s1', ['s1', 's2']);
    });

    expect(onGenerate).not.toHaveBeenCalled();
  });

  it('resumes playback automatically after a missing segment renders', async () => {
    const segmentsMissing = [
      { id: 's1', text_content: 'Hello', audio_status: 'unprocessed', audio_file_path: null },
      { id: 's2', text_content: 'World', audio_status: 'done', audio_file_path: 's2.wav' },
    ] as any;
    const completedSegments = [
      { id: 's1', text_content: 'Hello', audio_status: 'done', audio_file_path: 's1.wav' },
      { id: 's2', text_content: 'World', audio_status: 'done', audio_file_path: 's2.wav' },
    ] as any;

    const { result, rerender } = renderHook(
      ({ segs, chunked, generating }) => useChapterPlayback('proj1', 'chap1', segs, chunked, generating, onGenerate),
      {
        initialProps: {
          segs: segmentsMissing,
          chunked: [{ characterId: null, profileName: null, engine: 'xtts' as const, segments: segmentsMissing as any }],
          generating: new Set<string>()
        }
      }
    );

    await act(async () => {
      await result.current.playSegment('s1', ['s1', 's2']);
    });

    expect(onGenerate).toHaveBeenCalledWith(['s1']);
    expect(playerBus.loadAndPlay).not.toHaveBeenCalled();

    rerender({
      segs: completedSegments,
      chunked: [{ characterId: null, profileName: null, engine: 'xtts' as const, segments: completedSegments as any }],
      generating: new Set<string>()
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.playingSegmentId).toBe('s1');
    expect(playerBus.loadAndPlay).toHaveBeenCalled();
  });

  it('handles playback error with fallback', async () => {
    const { result } = renderHook(() =>
      useChapterPlayback('proj1', 'chap1', segments, chunkGroups, generatingSegmentIds, onGenerate)
    );

    await act(async () => {
      await result.current.playSegment('s1', ['s1']);
    });

    expect(playerBus.loadAndPlay).toHaveBeenCalled();
    const lastCall = vi.mocked(playerBus.loadAndPlay).mock.calls.at(-1);
    const opts = lastCall?.[0];

    // Trigger error callback
    await act(async () => {
      opts?.onError?.();
    });

    // Should have tried fallback URL
    expect(playerBus.loadAndPlay).toHaveBeenCalledTimes(2);
  });

  it('skips segments sharing the same audio file path', async () => {
    const groupedSegments: ChapterSegment[] = [
      { id: 's1', text_content: 'One', audio_status: 'done', audio_file_path: 'a.wav', chapter_id: 'chap1' },
      { id: 's2', text_content: 'Two', audio_status: 'done', audio_file_path: 'a.wav', chapter_id: 'chap1' },
      { id: 's3', text_content: 'Three', audio_status: 'done', audio_file_path: 'b.wav', chapter_id: 'chap1' },
    ] as any;

    const { result } = renderHook(() =>
      useChapterPlayback('proj1', 'chap1', groupedSegments, [], new Set(), onGenerate)
    );

    await act(async () => {
      await result.current.playSegment('s1', ['s1', 's2', 's3']);
    });

    expect(result.current.playingSegmentId).toBe('s1');

    const lastCall = vi.mocked(playerBus.loadAndPlay).mock.calls.at(-1);
    const opts = lastCall?.[0];

    // Simulate s1 (a.wav) ended
    await act(async () => {
      opts?.onEnded?.();
    });

    // Should skip s2 and move to s3
    expect(result.current.playingSegmentId).toBe('s3');
  });

  it('skims forward and backward', async () => {
    const { result } = renderHook(() =>
      useChapterPlayback('proj1', 'chap1', segments, chunkGroups, generatingSegmentIds, onGenerate)
    );

    await act(async () => {
      await result.current.playSegment('s1', ['s1', 's2']);
    });

    mockPlayerBusState.position = 10;
    mockPlayerBusState.duration = 100;

    act(() => {
      result.current.startSkim('forward');
    });

    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    expect(playerBus.seek).toHaveBeenCalledWith(10.5);

    act(() => {
      result.current.startSkim('backward');
    });

    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    expect(playerBus.seek).toHaveBeenCalledWith(10.0); // 10.5 - 0.5

    act(() => {
      result.current.stopSkim();
    });

    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    expect(playerBus.seek).toHaveBeenCalledTimes(2); // Should not be called again after stop
  });

  it('plays a non-leader segment in a completed audio group using the group audio path', async () => {
    const groupedSegments: ChapterSegment[] = [
      { id: 's1', text_content: 'One', audio_status: 'done', audio_file_path: 'a.wav', chapter_id: 'chap1' },
      { id: 's2', text_content: 'Two', audio_status: 'unprocessed', audio_file_path: null, chapter_id: 'chap1' },
    ] as any;

    const audioGroups = [
      { id: 'g1', span_ids: ['s1', 's2'], status: 'draft', audio_file_path: 'a.wav', asset_url: '/api/assets/a.wav', order_index: 0, estimated_work_weight: 1 }
    ] as any;

    const { result } = renderHook(() =>
      useChapterPlayback('proj1', 'chap1', groupedSegments, [], new Set(), onGenerate, audioGroups)
    );

    await act(async () => {
      await result.current.playSegment('s2', ['s1', 's2']);
    });

    // Playback should resolve audioPath to 'a.wav' from audioGroups and play it
    expect(result.current.playingSegmentId).toBe('s2');
    expect(playerBus.loadAndPlay).toHaveBeenCalled();
    const lastCall = vi.mocked(playerBus.loadAndPlay).mock.calls.at(-1);
    expect(lastCall?.[0]?.audioUrl).toContain('a.wav');
    expect(onGenerate).not.toHaveBeenCalled();
  });
});
