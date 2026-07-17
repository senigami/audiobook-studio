/**
 * useReaderSync.test.ts
 *
 * Tests for frontend/src/hooks/useReaderSync.ts (synced-reader plan, Task 7)
 * — derives the active reading group + intra-group progress from a fixed
 * timing fixture and a fake player-bus snapshot, gated to this chapter's own
 * playback.
 *
 * No fetch/websocket/real player involved (R2 — this hook is pure, its
 * inputs are handed in directly): a hand-built `timing` fixture and a
 * hand-built `PlayerBusState`-shaped object stand in for the real bus.
 */
import { describe, it, expect } from 'vitest';
import { useReaderSync } from '@/hooks/useReaderSync';
import type { PlayerBusState } from '@/store/playerBus';
import type { UseChapterTimingResult } from '@/hooks/useChapterTiming';

const CHAPTER_AUDIO_URL = '/api/projects/proj1/chapters/ch1/assets/audio?filename=chapter.wav';

const TIMING: UseChapterTimingResult = {
  audioDurationMs: 9000,
  groups: [
    { group_id: 'g0', segment_ids: ['s0'], order: 0, start_ms: 0, end_ms: 3000, duration_ms: 3000 },
    { group_id: 'g1', segment_ids: ['s1'], order: 1, start_ms: 3000, end_ms: 6000, duration_ms: 3000 },
    { group_id: 'g2', segment_ids: ['s2'], order: 2, start_ms: 6000, end_ms: 9000, duration_ms: 3000 },
  ],
};

function bus(overrides: Partial<PlayerBusState> = {}): PlayerBusState {
  return {
    scope: 'chapter',
    title: 'Chapter Audio',
    subtitle: undefined,
    audioUrl: CHAPTER_AUDIO_URL,
    playing: true,
    position: 0,
    duration: 9,
    queue: { hasPrev: false, hasNext: false },
    requestId: 1,
    seekRequestId: 0,
    bookId: null,
    ...overrides,
  };
}

describe('useReaderSync', () => {
  it('resolves group 0 with groupProgress 0 at the exact start (positionMs === 0)', () => {
    const result = useReaderSync(TIMING, bus({ position: 0 }), CHAPTER_AUDIO_URL);
    expect(result.isTrackingThisChapter).toBe(true);
    expect(result.activeGroup?.group_id).toBe('g0');
    expect(result.groupProgress).toBe(0);
    expect(result.prev).toBeNull();
    expect(result.next?.group_id).toBe('g1');
  });

  it('resolves the correct activeGroup and groupProgress fraction mid-way through group 1', () => {
    // Group 1 spans 3000-6000ms; 1500ms in is the midpoint -> position 4.5s.
    const result = useReaderSync(TIMING, bus({ position: 4.5 }), CHAPTER_AUDIO_URL);
    expect(result.activeGroup?.group_id).toBe('g1');
    expect(result.groupProgress).toBeCloseTo(0.5, 5);
    expect(result.prev?.group_id).toBe('g0');
    expect(result.next?.group_id).toBe('g2');
  });

  it('resolves to the NEXT group at an exact boundary (positionMs === groups[1].end_ms === groups[2].start_ms)', () => {
    // groups[1].end_ms === groups[2].start_ms === 6000ms -> position 6s.
    const result = useReaderSync(TIMING, bus({ position: 6 }), CHAPTER_AUDIO_URL);
    expect(result.activeGroup?.group_id).toBe('g2');
    expect(result.groupProgress).toBe(0);
  });

  it('clamps to the last group past its end_ms (float/rounding overshoot) without returning null', () => {
    // Last group ends at 9000ms; simulate audio reporting slightly past it.
    const result = useReaderSync(TIMING, bus({ position: 9.05 }), CHAPTER_AUDIO_URL);
    expect(result.activeGroup).not.toBeNull();
    expect(result.activeGroup?.group_id).toBe('g2');
    expect(result.groupProgress).toBe(1);
    expect(result.next).toBeNull();
  });

  it('returns isTrackingThisChapter: false and a null activeGroup when scope is not "chapter"', () => {
    const result = useReaderSync(TIMING, bus({ scope: 'preview', position: 4.5 }), CHAPTER_AUDIO_URL);
    expect(result.isTrackingThisChapter).toBe(false);
    expect(result.activeGroup).toBeNull();
    expect(result.groupProgress).toBe(0);
    expect(result.prev).toBeNull();
    expect(result.next).toBeNull();
  });

  it('returns isTrackingThisChapter: false when the bus audioUrl is a different chapter', () => {
    const result = useReaderSync(
      TIMING,
      bus({ audioUrl: '/api/projects/proj1/chapters/OTHER/assets/audio?filename=other.wav', position: 4.5 }),
      CHAPTER_AUDIO_URL,
    );
    expect(result.isTrackingThisChapter).toBe(false);
    expect(result.activeGroup).toBeNull();
  });

  it('distinguishes "no timing data" from "not tracking": scoped correctly but timing is null', () => {
    const result = useReaderSync(null, bus({ position: 4.5 }), CHAPTER_AUDIO_URL);
    expect(result.isTrackingThisChapter).toBe(true);
    expect(result.activeGroup).toBeNull();
    expect(result.groupProgress).toBe(0);
    expect(result.prev).toBeNull();
    expect(result.next).toBeNull();
  });
});
