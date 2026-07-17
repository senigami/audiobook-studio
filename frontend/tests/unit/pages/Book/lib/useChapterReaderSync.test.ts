/**
 * useChapterReaderSync.test.ts
 *
 * Tests for frontend/src/pages/Book/lib/useChapterReaderSync.ts (synced-reader
 * plan, Task 9 "entry points") — the shared wiring behind both the embedded
 * ChapterReaderCard and the standalone ReaderPage.
 *
 * Mocks (R2 — boundaries outside the unit): `@/api` (fetchSegments — network),
 * `fetch` (the timing route — network), and `@/store/playerBus`'s `seek`
 * export specifically (asserting the click-to-seek call without actually
 * mutating the real bus). `usePlayerBus`/`loadAndPlay`/`resetPlayerBusForTests`
 * stay real so the gate logic (`useReaderSync`) is exercised for real.
 */
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { api } from '@/api';
import { loadAndPlay, reportTime, resetPlayerBusForTests } from '@/store/playerBus';
import { buildChapterAudioUrl } from '@/pages/Book/lib/chapterAudioUrl';
import { useChapterReaderSync } from '@/pages/Book/lib/useChapterReaderSync';
import type { Chapter } from '@/types';

vi.mock('@/api', () => ({
  api: {
    fetchSegments: vi.fn(),
  },
}));

vi.mock('@/store/playerBus', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/store/playerBus')>();
  return { ...actual, seek: vi.fn() };
});

const CHAPTER: Pick<Chapter, 'id' | 'project_id' | 'audio_file_path'> = {
  id: 'chapter-seek',
  project_id: 'book-seek',
  audio_file_path: 'chapter_seek.wav',
};

function timingPayload() {
  return {
    schema: 'chapter_segment_timing',
    version: 1,
    chapter_id: CHAPTER.id,
    audio_file: CHAPTER.audio_file_path,
    audio_generated_at: 1,
    audio_duration_ms: 4000,
    generated_at: 1,
    group_count: 2,
    groups: [
      { group_id: 'g0', segment_ids: ['s0'], order: 0, start_ms: 0, end_ms: 2000, duration_ms: 2000 },
      { group_id: 'g1', segment_ids: ['s1'], order: 1, start_ms: 2000, end_ms: 4000, duration_ms: 2000 },
    ],
  };
}

describe('useChapterReaderSync', () => {
  beforeEach(() => {
    resetPlayerBusForTests();
    vi.mocked(api.fetchSegments).mockResolvedValue([]);
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('chapterAudioUrl matches the shared buildChapterAudioUrl construction', async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: () => Promise.resolve({}) });
    const { result } = renderHook(() => useChapterReaderSync(CHAPTER.project_id, CHAPTER));
    expect(result.current.chapterAudioUrl).toBe(buildChapterAudioUrl(CHAPTER));
    // Let the segments fetch settle before the test unmounts.
    await waitFor(() => expect(api.fetchSegments).toHaveBeenCalled());
  });

  it("gates isTrackingThisChapter true once the bus plays this exact chapterAudioUrl (ChapterTable's own construction)", async () => {
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: () => Promise.resolve({}) });
    const { result } = renderHook(() => useChapterReaderSync(CHAPTER.project_id, CHAPTER));
    const expectedUrl = buildChapterAudioUrl(CHAPTER)!;

    act(() => {
      loadAndPlay({ scope: 'chapter', title: 'Chapter Audio', audioUrl: expectedUrl });
    });

    await waitFor(() => {
      expect(result.current.readerProps.isTrackingThisChapter).toBe(true);
    });
    await waitFor(() => expect(api.fetchSegments).toHaveBeenCalled());
  });

  it('the reader block click handler calls playerBus.seek with group.start_ms / 1000 seconds', async () => {
    const { seek } = await import('@/store/playerBus');
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve(timingPayload()),
    });
    const { result } = renderHook(() => useChapterReaderSync(CHAPTER.project_id, CHAPTER));
    const expectedUrl = buildChapterAudioUrl(CHAPTER)!;

    act(() => {
      loadAndPlay({ scope: 'chapter', title: 'Chapter Audio', audioUrl: expectedUrl });
      reportTime(2.5, 4); // 2500ms -> inside the second group (start_ms 2000)
    });

    await waitFor(() => {
      expect(result.current.readerProps.activeGroup?.group_id).toBe('g1');
    });

    act(() => {
      result.current.readerProps.onActiveBlockClick?.();
    });

    expect(seek).toHaveBeenCalledTimes(1);
    expect(seek).toHaveBeenCalledWith(2); // group g1's start_ms (2000) / 1000
  });

  it('does not call seek when there is no active group (e.g. no chapter yet)', async () => {
    const { seek } = await import('@/store/playerBus');
    (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({ ok: false, json: () => Promise.resolve({}) });
    const { result } = renderHook(() => useChapterReaderSync(CHAPTER.project_id, null));

    act(() => {
      result.current.readerProps.onActiveBlockClick?.();
    });

    expect(seek).not.toHaveBeenCalled();
  });
});
