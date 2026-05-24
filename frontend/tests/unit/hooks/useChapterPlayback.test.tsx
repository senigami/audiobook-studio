import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useChapterPlayback } from '@/hooks/useChapterPlayback';
import type { ChapterSegment } from '@/types';
import type { ChunkGroup } from '@/utils/chunkGroups';

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

    // Mock Audio global
    const mockAudio: any = {
      play: vi.fn().mockResolvedValue(undefined),
      pause: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    };

    global.Audio = vi.fn().mockImplementation(() => {
      // Trigger oncanplaythrough or loadeddata if needed, but here simple play is enough
      setTimeout(() => {
        if (mockAudio.oncanplaythrough) mockAudio.oncanplaythrough();
      }, 0);
      return mockAudio;
    }) as any;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('starts playback and plays next segment on end', async () => {
    const { result, unmount } = renderHook(() =>
      useChapterPlayback('proj1', 'chap1', segments, chunkGroups, generatingSegmentIds, onGenerate)
    );

    let mockAudioInstance: any;
    (global.Audio as any).mockImplementation((src: string) => {
      mockAudioInstance = {
        play: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn(),
        src,
      };
      return mockAudioInstance;
    });

    await act(async () => {
      await result.current.playSegment('s1', ['s1', 's2']);
    });

    expect(result.current.playingSegmentId).toBe('s1');
    expect(mockAudioInstance.play).toHaveBeenCalled();

    // Simulate audio ended
    await act(async () => {
      mockAudioInstance.onended();
    });

    // Should move to s2
    expect(result.current.playingSegmentId).toBe('s2');

    unmount();
    expect(mockAudioInstance.pause).toHaveBeenCalled();
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
  });

  it('stops playback on chapter change', async () => {
    const { result, rerender } = renderHook(
      ({ chapterId }) => useChapterPlayback('proj1', chapterId, segments, chunkGroups, generatingSegmentIds, onGenerate),
      { initialProps: { chapterId: 'chap1' } }
    );

    let mockAudioInstance: any;
    (global.Audio as any).mockImplementation((src: string) => {
      mockAudioInstance = {
        play: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn(),
        src,
      };
      return mockAudioInstance;
    });

    await act(async () => {
      await result.current.playSegment('s1', ['s1', 's2']);
    });

    expect(result.current.isPlaying).toBe(true);

    await act(async () => {
      rerender({ chapterId: 'chap2' });
    });

    expect(result.current.isPlaying).toBe(false);
    expect(mockAudioInstance.pause).toHaveBeenCalled();
  });

  it('keeps stop from leaving playback in a paused state', async () => {
    const { result } = renderHook(() =>
      useChapterPlayback('proj1', 'chap1', segments, chunkGroups, generatingSegmentIds, onGenerate)
    );

    let mockAudioInstance: any;
    (global.Audio as any).mockImplementation((_src: string) => {
      mockAudioInstance = {
        play: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn(),
      };
      return mockAudioInstance;
    });

    await act(async () => {
      await result.current.playSegment('s1', ['s1', 's2']);
    });

    act(() => {
      result.current.stopPlayback();
      mockAudioInstance.onpause?.();
    });

    expect(result.current.playingSegmentId).toBeNull();
    expect(result.current.isPlaying).toBe(false);
    expect(result.current.isPaused).toBe(false);

    await act(async () => {
      await result.current.playSegment('s1', ['s1', 's2']);
    });

    expect(result.current.playingSegmentId).toBe('s1');
    expect(result.current.isPlaying).toBe(true);
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

    let mockAudioInstance: any;
    (global.Audio as any).mockImplementation((src: string) => {
      mockAudioInstance = {
        play: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn(),
        src,
      };
      return mockAudioInstance;
    });

    await act(async () => {
      await result.current.playSegment('s1', ['s1', 's2']);
    });

    expect(onGenerate).toHaveBeenCalledWith(['s1']);
    expect(mockAudioInstance).toBeUndefined();

    rerender({
      segs: completedSegments,
      chunked: [{ characterId: null, profileName: null, engine: 'xtts' as const, segments: completedSegments as any }],
      generating: new Set<string>()
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.playingSegmentId).toBe('s1');
    expect(mockAudioInstance?.play).toHaveBeenCalled();
  });

  it('handles playback error with fallback', async () => {
    const { result } = renderHook(() =>
      useChapterPlayback('proj1', 'chap1', segments, chunkGroups, generatingSegmentIds, onGenerate)
    );

    let errorTriggered = false;
    (global.Audio as any).mockImplementation((_src: string) => {
      const audio: any = {
        play: vi.fn(),
        pause: vi.fn(),
        onerror: null,
      };

      audio.play.mockImplementation(() => {
        if (!errorTriggered) {
          errorTriggered = true;
          // Simulate error event instead of throwing
          setTimeout(() => { if (audio.onerror) audio.onerror(new Event('error')); }, 0);
          return Promise.reject(new Error('Play failed'));
        }
        return Promise.resolve();
      });

      return audio;
    });

    await act(async () => {
      await result.current.playSegment('s1', ['s1']);
    });

    // Should not crash, and should eventually move on or try fallback
    expect(result.current.playingSegmentId).toBe('s1');
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

    let mockAudioInstance: any;
    (global.Audio as any).mockImplementation((src: string) => {
      mockAudioInstance = {
        play: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn(),
        src,
      };
      return mockAudioInstance;
    });

    await act(async () => {
      await result.current.playSegment('s1', ['s1', 's2', 's3']);
    });

    expect(result.current.playingSegmentId).toBe('s1');

    // Simulate s1 (a.wav) ended
    await act(async () => {
      mockAudioInstance.onended();
    });

    // Should skip s2 and move to s3
    expect(result.current.playingSegmentId).toBe('s3');
  });

  it('skims forward and backward', async () => {
    const { result } = renderHook(() =>
      useChapterPlayback('proj1', 'chap1', segments, chunkGroups, generatingSegmentIds, onGenerate)
    );

    let mockAudioInstance: any;
    (global.Audio as any).mockImplementation((src: string) => {
      mockAudioInstance = {
        play: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn(),
        currentTime: 10,
        duration: 100,
        src,
      };
      return mockAudioInstance;
    });

    await act(async () => {
      await result.current.playSegment('s1', ['s1', 's2']);
    });

    act(() => {
      result.current.startSkim('forward');
    });

    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    expect(mockAudioInstance.currentTime).toBe(10.5);

    act(() => {
      result.current.startSkim('backward');
    });

    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    expect(mockAudioInstance.currentTime).toBe(10.0); // 10.5 - 0.5

    act(() => {
      result.current.stopSkim();
    });

    await act(async () => {
      vi.advanceTimersByTime(150);
    });

    expect(mockAudioInstance.currentTime).toBe(10.0); // Should not change after stop
  });

  it('plays a non-leader segment in a completed audio group using the group audio path', async () => {
    const groupedSegments: ChapterSegment[] = [
      { id: 's1', text_content: 'One', audio_status: 'done', audio_file_path: 'a.wav', chapter_id: 'chap1' },
      { id: 's2', text_content: 'Two', audio_status: 'unprocessed', audio_file_path: null, chapter_id: 'chap1' },
    ] as any;

    const audioGroups = [
      { id: 'g1', span_ids: ['s1', 's2'], status: 'draft', audio_file_path: 'a.wav', asset_url: '/api/assets/a.wav', order_index: 0, estimated_work_weight: 1 }
    ];

    const { result } = renderHook(() =>
      useChapterPlayback('proj1', 'chap1', groupedSegments, [], new Set(), onGenerate, audioGroups)
    );

    let mockAudioInstance: any;
    (global.Audio as any).mockImplementation((src: string) => {
      mockAudioInstance = {
        play: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn(),
        src,
      };
      return mockAudioInstance;
    });

    await act(async () => {
      await result.current.playSegment('s2', ['s1', 's2']);
    });

    // Playback should resolve audioPath to 'a.wav' from audioGroups and play it
    expect(result.current.playingSegmentId).toBe('s2');
    expect(mockAudioInstance.src).toContain('a.wav');
    expect(mockAudioInstance.play).toHaveBeenCalled();
    expect(onGenerate).not.toHaveBeenCalled();
  });

});
