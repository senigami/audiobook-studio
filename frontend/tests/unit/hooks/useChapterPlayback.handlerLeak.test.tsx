/**
 * P4 pinning test — stopPlayback clears all Audio event handlers.
 *
 * Verifies that after stopPlayback() the audio element's onplay, onpause,
 * onended, and onerror callbacks are null so stale closures cannot fire.
 */
import { renderHook, act } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useChapterPlayback } from '@/hooks/useChapterPlayback';
import type { ChapterSegment } from '@/types';
import type { ChunkGroup } from '@/utils/chunkGroups';

describe('P4 — stopPlayback clears all audio event handlers', () => {
  let capturedAudio: any = null;

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
    capturedAudio = null;
    global.Audio = vi.fn().mockImplementation(() => {
      capturedAudio = {
        play: vi.fn().mockResolvedValue(undefined),
        pause: vi.fn(),
        onplay: null,
        onpause: null,
        onended: null,
        onerror: null,
        ontimeupdate: null,
        onloadedmetadata: null,
      };
      return capturedAudio;
    }) as any;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('nulls out onplay, onpause, onended, and onerror on stopPlayback', async () => {
    const { result } = renderHook(() =>
      useChapterPlayback('proj', 'ch', segments, chunkGroups, generatingIds, onGenerate)
    );

    await act(async () => {
      await result.current.playSegment('s1', ['s1']);
    });

    // After play, the audio element should have handlers attached.
    expect(capturedAudio).not.toBeNull();
    // Assign dummy handlers to verify they get cleared.
    capturedAudio.onplay = () => {};
    capturedAudio.onended = () => {};
    capturedAudio.onerror = () => {};

    act(() => {
      result.current.stopPlayback();
    });

    // All handlers must be null after stop.
    expect(capturedAudio.onplay).toBeNull();
    expect(capturedAudio.onpause).toBeNull();
    expect(capturedAudio.onended).toBeNull();
    expect(capturedAudio.onerror).toBeNull();
    expect(capturedAudio.ontimeupdate).toBeNull();
    expect(capturedAudio.onloadedmetadata).toBeNull();
  });
});
