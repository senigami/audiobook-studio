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

  // Post-fix (task 004): block membership is now defined solely by
  // getGroupSegmentIds (audioGroups first, falling back to chunkGroups) —
  // the standalone "walk forward while audio_file_path matches" mechanism
  // this test used to exercise was deleted as part of normalizing the
  // playback queue to block-leader ids. s1/s2 below deliberately are NOT in
  // the same chunkGroup/audioGroup (chunkGroups is empty, no audioGroups
  // passed), so — even though they happen to share an audio_file_path — they
  // are now two distinct blocks and onEnded no longer skips past s2.
  it('does not skip ahead past segments that merely share an audio_file_path outside any chunk/audio group', async () => {
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

    // s1 and s2 are separate blocks (no shared chunkGroup/audioGroup), so
    // onEnded lands on s2 next rather than skipping ahead to s3.
    expect(result.current.playingSegmentId).toBe('s2');
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

  // Post-fix (task 004): the playback queue is normalized to one entry per
  // block (the block's leader id), so requesting playback of a non-leader
  // member of a block now starts playback from — and reports — the block's
  // leader id rather than the exact non-leader id requested.
  it('starts playback from the block leader when a non-leader segment in a completed audio group is requested', async () => {
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

    // s1+s2 form one AudioGroup block; playback resolves to the block's
    // leader (s1) and plays its group audio path.
    expect(result.current.playingSegmentId).toBe('s1');
    expect(playerBus.loadAndPlay).toHaveBeenCalled();
    const lastCall = vi.mocked(playerBus.loadAndPlay).mock.calls.at(-1);
    expect(lastCall?.[0]?.audioUrl).toContain('a.wav');
    expect(onGenerate).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // Task 003 introduced these as characterization tests for the pre-fix
  // block-navigation bug (pinning down the then-buggy behavior). Task 004
  // fixed the underlying bug by normalizing the playback queue to
  // block-leader ids (see buildBlockQueue in useChapterPlayback.ts) and
  // updated these assertions to match the corrected, post-fix behavior.
  // See design-docs/plans/active/audio_player_completion_004/tasks/
  // 003-characterize-segment-playback.md and
  // 004-block-queue-navigation-fix.md.
  // -------------------------------------------------------------------------
  describe('block-navigation (post-fix)', () => {
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

    it('manual Next (playerBus.notifyNext()) mid an AudioGroup-based block skips past the whole block instead of reloading the same clip', async () => {
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

      // Fixed: the playback queue is normalized to one entry per block (s1
      // is the block leader for the s1+s2 AudioGroup), so idx+1 in the
      // block-leader queue lands on the next distinct block (s3), not a
      // restart-in-place of the same group clip.
      expect(result.current.playingSegmentId).toBe('s3');
      const secondCall = vi.mocked(playerBus.loadAndPlay).mock.calls.at(-1);
      const secondUrl = secondCall?.[0]?.audioUrl;
      expect(secondUrl).not.toBe(firstUrl);
    });

    it('auto-advance (onEnded) skips past a pure AudioGroup-based block to the next distinct block', async () => {
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

      // Fixed: onEnded is now a direct playFromIndex(idx + 1, queue) call
      // against the block-leader queue (['s1', 's3']), so it lands on s3
      // directly — s2 is no longer a separate queue entry to walk past.
      expect(result.current.playingSegmentId).toBe('s3');
      const secondCall = vi.mocked(playerBus.loadAndPlay).mock.calls.at(-1);
      expect(secondCall?.[0]?.audioUrl).not.toBe(firstUrl);
    });

    it('hasPrev/hasNext reflect block-queue position, and playback of a mid-block member resolves to its block leader', async () => {
      // Block members s1/s2/s3 share an AudioGroup; s0 precedes the block and
      // s4 follows it. s2 is the block's *middle* member.
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

      // Fixed: requesting s2 (a mid-block member) resolves to its block's
      // leader (s1) — the only id present in the normalized block-leader
      // queue (['s0', 's1', 's4']).
      expect(result.current.playingSegmentId).toBe('s1');
      const lastCall = vi.mocked(playerBus.loadAndPlay).mock.calls.at(-1);
      // Block-leader queue is ['s0', 's1', 's4']; s1 is at idx=1 of 3, with a
      // genuine previous block (s0) and next block (s4) on either side.
      expect(lastCall?.[0]?.hasPrev).toBe(true);
      expect(lastCall?.[0]?.hasNext).toBe(true);
    });

    it('no subtitle is ever set for segment-scope playback (loadAndPlay is always called with subtitle absent)', async () => {
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
