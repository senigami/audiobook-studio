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

// Tracks the callbacks handed to the most recent loadAndPlay() call so
// notifyNext/notifyPrev below can forward to them exactly like the real
// playerBus.ts module does (`callbacks.onNext?.()` / `callbacks.onPrev?.()`).
// This keeps the existing mocked-hook harness (playerBus is outside the
// useChapterPlayback unit under test) while still letting new tests literally
// call `playerBus.notifyNext()` per the task instructions, rather than reaching
// into loadAndPlay's captured opts by hand.
let capturedCallbacks: { onEnded?: () => void; onPrev?: () => void; onNext?: () => void; onError?: () => void } = {};

vi.mock('@/store/playerBus', () => {
  return {
    usePlayerBus: () => mockPlayerBusState,
    loadAndPlay: vi.fn().mockImplementation((opts) => {
      capturedCallbacks = {
        onEnded: opts.onEnded,
        onPrev: opts.onPrev,
        onNext: opts.onNext,
        onError: opts.onError,
      };
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
    notifyNext: vi.fn().mockImplementation(() => {
      capturedCallbacks.onNext?.();
    }),
    notifyPrev: vi.fn().mockImplementation(() => {
      capturedCallbacks.onPrev?.();
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
    capturedCallbacks = {};
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

  // -------------------------------------------------------------------------
  // Task 003 — characterization tests for the pre-fix block-navigation bug.
  // These pin down TODAY's actual (buggy) behavior of useChapterPlayback.ts;
  // task 004/005 will change the underlying code and these assertions along
  // with it. See design-docs/plans/active/audio_player_completion_004/tasks/003-characterize-segment-playback.md.
  // -------------------------------------------------------------------------
  describe('block-navigation characterization (pre-fix)', () => {
    // Two segments, s1+s2, that only share playback identity via an AudioGroup
    // (span_ids) — neither has an individual audio_file_path — plus a separate
    // s3 with its own rendered file, outside the group.
    const buildAudioGroupBlockFixture = () => {
      const groupedSegments: ChapterSegment[] = [
        { id: 's1', text_content: 'One', audio_status: 'unprocessed', audio_file_path: null, chapter_id: 'chap1' },
        { id: 's2', text_content: 'Two', audio_status: 'unprocessed', audio_file_path: null, chapter_id: 'chap1' },
        { id: 's3', text_content: 'Three', audio_status: 'done', audio_file_path: 's3.wav', chapter_id: 'chap1' },
      ] as any;
      const audioGroups = [
        { id: 'g1', span_ids: ['s1', 's2'], status: 'rendered', audio_file_path: 'group.wav', asset_url: null, order_index: 0, estimated_work_weight: 1 },
      ] as any;
      return { groupedSegments, audioGroups };
    };

    it('documents PRE-FIX behavior — see task 004/005. This assertion is expected to change when those land. Manual Next (playerBus.notifyNext()) mid an AudioGroup-based block reloads the identical clip instead of skipping past the block', async () => {
      const { groupedSegments, audioGroups } = buildAudioGroupBlockFixture();

      const { result } = renderHook(() =>
        useChapterPlayback('proj1', 'chap1', groupedSegments, [], new Set(), onGenerate, audioGroups)
      );

      await act(async () => {
        await result.current.playSegment('s1', ['s1', 's2', 's3']);
      });

      expect(result.current.playingSegmentId).toBe('s1');
      const firstCall = vi.mocked(playerBus.loadAndPlay).mock.calls.at(-1);
      const firstUrl = firstCall?.[0]?.audioUrl;
      expect(firstUrl).toContain('group.wav');

      // Simulate the bus's manual "Next" control (e.g. PlayerBar's next
      // button), which forwards to the hook's registered onNext callback.
      await act(async () => {
        playerBus.notifyNext();
      });

      // Bug: the segment id advances to s2 (idx+1, unconditionally — see
      // onNext at useChapterPlayback.ts ~lines 133-139), but s2 resolves to
      // the SAME group audio_file_path as s1, so the resulting loadAndPlay
      // call reloads the identical clip from position 0 — a restart-in-place
      // rather than a genuine skip past the block.
      expect(result.current.playingSegmentId).toBe('s2');
      const secondCall = vi.mocked(playerBus.loadAndPlay).mock.calls.at(-1);
      const secondUrl = secondCall?.[0]?.audioUrl;
      expect(secondUrl).toBe(firstUrl);
    });

    it('documents PRE-FIX behavior — see task 004/005. This assertion is expected to change when those land. Auto-advance (onEnded) does NOT skip a pure AudioGroup-based block (only the audio_file_path-equality walk does — see the passing "skips segments sharing the same audio file path" test above for that contrasting case)', async () => {
      const { groupedSegments, audioGroups } = buildAudioGroupBlockFixture();

      const { result } = renderHook(() =>
        useChapterPlayback('proj1', 'chap1', groupedSegments, [], new Set(), onGenerate, audioGroups)
      );

      await act(async () => {
        await result.current.playSegment('s1', ['s1', 's2', 's3']);
      });

      const firstCall = vi.mocked(playerBus.loadAndPlay).mock.calls.at(-1);
      const firstUrl = firstCall?.[0]?.audioUrl;

      // Simulate the audio element reaching the end of s1's clip naturally.
      await act(async () => {
        firstCall?.[0]?.onEnded?.();
      });

      // Gap: onEnded's walk (useChapterPlayback.ts ~lines 112-124) only skips
      // forward while `nextSeg.audio_file_path === seg.audio_file_path`, which
      // is never true here (both s1 and s2 have audio_file_path === null, and
      // the check requires a truthy match) — so it lands on s2 (idx+1) rather
      // than walking past the whole AudioGroup block to s3. This reloads the
      // same group clip again, mirroring the manual-Next bug above.
      expect(result.current.playingSegmentId).toBe('s2');
      const secondCall = vi.mocked(playerBus.loadAndPlay).mock.calls.at(-1);
      expect(secondCall?.[0]?.audioUrl).toBe(firstUrl);
    });

    it('documents PRE-FIX behavior — see task 004/005. This assertion is expected to change when those land. hasPrev/hasNext are naive idx>0/idx<queue.length-1 flags: a non-first/non-last member of a multi-segment block still reports both true', async () => {
      // Block members s1/s2/s3 share an AudioGroup; s0 precedes the block and
      // s4 follows it, so the block itself is not first/last in the queue.
      // s2 is the block's *middle* member — not first/last within the block —
      // yet hasPrev/hasNext are computed purely from its raw queue index.
      const naiveFlagSegments: ChapterSegment[] = [
        { id: 's0', text_content: 'Zero', audio_status: 'done', audio_file_path: 's0.wav', chapter_id: 'chap1' },
        { id: 's1', text_content: 'One', audio_status: 'done', audio_file_path: 's1.wav', chapter_id: 'chap1' },
        { id: 's2', text_content: 'Two', audio_status: 'done', audio_file_path: 's2.wav', chapter_id: 'chap1' },
        { id: 's3', text_content: 'Three', audio_status: 'done', audio_file_path: 's3.wav', chapter_id: 'chap1' },
        { id: 's4', text_content: 'Four', audio_status: 'done', audio_file_path: 's4.wav', chapter_id: 'chap1' },
      ] as any;
      const audioGroups = [
        { id: 'g1', span_ids: ['s1', 's2', 's3'], status: 'rendered', audio_file_path: null, asset_url: null, order_index: 0, estimated_work_weight: 1 },
      ] as any;
      const queue = ['s0', 's1', 's2', 's3', 's4'];

      const { result } = renderHook(() =>
        useChapterPlayback('proj1', 'chap1', naiveFlagSegments, [], new Set(), onGenerate, audioGroups)
      );

      await act(async () => {
        await result.current.playSegment('s2', queue);
      });

      expect(result.current.playingSegmentId).toBe('s2');
      const lastCall = vi.mocked(playerBus.loadAndPlay).mock.calls.at(-1);
      // idx=2 (of 5): naive idx>0 -> true, idx<queue.length-1 -> true. Both
      // report true even though s2 is semantically mid-block (not first/last
      // among its own block's members s1/s2/s3), and — per the bugs above —
      // "next" from here would not cleanly leave the block anyway.
      expect(lastCall?.[0]?.hasPrev).toBe(true);
      expect(lastCall?.[0]?.hasNext).toBe(true);
    });

    it('documents PRE-FIX behavior — see task 004/005. This assertion is expected to change when those land. No subtitle is ever set for segment-scope playback (loadAndPlay is always called with subtitle absent)', async () => {
      const { result } = renderHook(() =>
        useChapterPlayback('proj1', 'chap1', segments, chunkGroups, generatingSegmentIds, onGenerate)
      );

      await act(async () => {
        await result.current.playSegment('s1', ['s1', 's2']);
      });

      const firstCall = vi.mocked(playerBus.loadAndPlay).mock.calls.at(-1);
      expect(firstCall?.[0]?.subtitle).toBeUndefined();

      // Auto-advance to s2 and confirm subtitle is still never populated.
      await act(async () => {
        firstCall?.[0]?.onEnded?.();
      });
      const secondCall = vi.mocked(playerBus.loadAndPlay).mock.calls.at(-1);
      expect(secondCall?.[0]?.subtitle).toBeUndefined();
    });
  });
});
