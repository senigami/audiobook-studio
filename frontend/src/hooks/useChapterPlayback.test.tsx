import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useChapterPlayback } from './useChapterPlayback';
import type { ChapterSegment } from '../types';

describe('useChapterPlayback', () => {
  const segments: ChapterSegment[] = [
    { id: 's1', text_content: 'Hello', audio_status: 'done', audio_file_path: 's1.wav' },
    { id: 's2', text_content: 'World', audio_status: 'done', audio_file_path: 's2.wav' },
  ] as any;
  const generatingSegmentIds = new Set<string>();
  const onGenerate = vi.fn().mockResolvedValue(undefined);

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
    const { result } = renderHook(() => 
      useChapterPlayback('proj1', segments, generatingSegmentIds, onGenerate)
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
  });

  it('stops playback', async () => {
    const { result } = renderHook(() => 
      useChapterPlayback('proj1', segments, generatingSegmentIds, onGenerate)
    );

    await act(async () => {
      await result.current.playSegment('s1', ['s1', 's2']);
    });

    act(() => {
      result.current.stopPlayback();
    });

    expect(result.current.playingSegmentId).toBeNull();
  });

  it('triggers onGenerate for missing audio', async () => {
    const segmentsMissing = [
      { id: 's1', text_content: 'Hello', audio_status: 'unprocessed' },
    ] as any;

    const { result } = renderHook(() => 
      useChapterPlayback('proj1', segmentsMissing, generatingSegmentIds, onGenerate)
    );

    await act(async () => {
      await result.current.playSegment('s1', ['s1']);
    });

    expect(onGenerate).toHaveBeenCalledWith(['s1']);
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
      ({ segs, generating }) => useChapterPlayback('proj1', segs, generating, onGenerate),
      { initialProps: { segs: segmentsMissing, generating: new Set<string>() } }
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

    rerender({ segs: completedSegments, generating: new Set<string>() });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
    });

    expect(result.current.playingSegmentId).toBe('s1');
    expect(mockAudioInstance?.play).toHaveBeenCalled();
  });

  it('handles playback error with fallback', async () => {
    const { result } = renderHook(() => 
      useChapterPlayback('proj1', segments, generatingSegmentIds, onGenerate)
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
});
