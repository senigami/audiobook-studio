import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';

vi.mock('@/store/bookmarks', () => ({
  getAutoResumeBookmark: vi.fn(),
  upsertAutoResumeBookmark: vi.fn(),
  clearAutoResumeBookmark: vi.fn(),
}));

vi.mock('@/store/playerBus', () => ({
  loadAndPlay: vi.fn(),
  seek: vi.fn(),
  stop: vi.fn(),
  subscribe: vi.fn(),
  getSnapshot: vi.fn(),
}));

import { getAutoResumeBookmark, upsertAutoResumeBookmark, clearAutoResumeBookmark } from '@/store/bookmarks';
import { loadAndPlay, seek, stop, subscribe, getSnapshot } from '@/store/playerBus';
import { buildChapterQueue, playBookContinuous, useAutoSaveResumePosition } from '@/store/bookContinuousPlayback';

const mockGetAutoResumeBookmark = getAutoResumeBookmark as unknown as ReturnType<typeof vi.fn>;
const mockUpsertAutoResumeBookmark = upsertAutoResumeBookmark as unknown as ReturnType<typeof vi.fn>;
const mockClearAutoResumeBookmark = clearAutoResumeBookmark as unknown as ReturnType<typeof vi.fn>;
const mockLoadAndPlay = loadAndPlay as unknown as ReturnType<typeof vi.fn>;
const mockSeek = seek as unknown as ReturnType<typeof vi.fn>;
const mockStop = stop as unknown as ReturnType<typeof vi.fn>;
const mockSubscribe = subscribe as unknown as ReturnType<typeof vi.fn>;
const mockGetSnapshot = getSnapshot as unknown as ReturnType<typeof vi.fn>;

describe('bookContinuousPlayback', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('buildChapterQueue', () => {
    it('filters out chapters with no audio_file_path, preserving order', () => {
      const chapters = [
        { id: 'ch-1', title: 'Chapter One', project_id: 'proj-1', audio_file_path: 'ch1.wav' },
        { id: 'ch-2', title: 'Chapter Two', project_id: 'proj-1', audio_file_path: null },
        { id: 'ch-3', title: 'Chapter Three', project_id: 'proj-1', audio_file_path: 'ch3.wav' },
      ];
      const queue = buildChapterQueue(chapters);
      expect(queue).toHaveLength(2);
      expect(queue[0]).toEqual({
        chapterId: 'ch-1',
        title: 'Chapter One',
        audioUrl: `/api/projects/proj-1/chapters/ch-1/assets/audio?filename=${encodeURIComponent('ch1.wav')}`,
      });
      expect(queue[1].chapterId).toBe('ch-3');
    });

    it('returns empty array when no chapters have audio', () => {
      const chapters = [{ id: 'ch-1', title: 'A', project_id: 'p', audio_file_path: undefined }];
      expect(buildChapterQueue(chapters)).toEqual([]);
    });
  });

  describe('playBookContinuous', () => {
    const queue = [
      { chapterId: 'ch-1', title: 'One', audioUrl: 'url-1' },
      { chapterId: 'ch-2', title: 'Two', audioUrl: 'url-2' },
      { chapterId: 'ch-3', title: 'Three', audioUrl: 'url-3' },
    ];

    it('does nothing when queue is empty', () => {
      mockGetAutoResumeBookmark.mockReturnValue(null);
      playBookContinuous('book-1', 'My Book', []);
      expect(mockLoadAndPlay).not.toHaveBeenCalled();
    });

    it('starts at index 0 with no resume bookmark, no seek call', () => {
      mockGetAutoResumeBookmark.mockReturnValue(null);
      playBookContinuous('book-1', 'My Book', queue);

      expect(mockLoadAndPlay).toHaveBeenCalledTimes(1);
      const call = mockLoadAndPlay.mock.calls[0][0];
      expect(call.scope).toBe('chapter');
      expect(call.bookId).toBe('book-1');
      expect(call.title).toBe('My Book');
      expect(call.subtitle).toBe('Chapter 1: One');
      expect(call.audioUrl).toBe('url-1');
      expect(call.hasPrev).toBe(false);
      expect(call.hasNext).toBe(true);
      expect(mockSeek).not.toHaveBeenCalled();
    });

    it('resumes at the bookmarked chapter and seeks after loadAndPlay', () => {
      mockGetAutoResumeBookmark.mockReturnValue({ chapterId: 'ch-2', positionSeconds: 42 });
      playBookContinuous('book-1', 'My Book', queue);

      const call = mockLoadAndPlay.mock.calls[0][0];
      expect(call.subtitle).toBe('Chapter 2: Two');
      expect(call.hasPrev).toBe(true);
      expect(call.hasNext).toBe(true);
      expect(mockSeek).toHaveBeenCalledWith(42);
      // seek called after loadAndPlay
      const loadOrder = mockLoadAndPlay.mock.invocationCallOrder[0];
      const seekOrder = mockSeek.mock.invocationCallOrder[0];
      expect(seekOrder).toBeGreaterThan(loadOrder);
    });

    it('falls back to index 0 when the bookmarked chapter is not in the queue', () => {
      mockGetAutoResumeBookmark.mockReturnValue({ chapterId: 'ch-deleted', positionSeconds: 99 });
      playBookContinuous('book-1', 'My Book', queue);

      const call = mockLoadAndPlay.mock.calls[0][0];
      expect(call.subtitle).toBe('Chapter 1: One');
      expect(mockSeek).not.toHaveBeenCalled();
    });

    it('onNext advances to the next chapter', () => {
      mockGetAutoResumeBookmark.mockReturnValue(null);
      playBookContinuous('book-1', 'My Book', queue);
      const firstCall = mockLoadAndPlay.mock.calls[0][0];

      firstCall.onNext();

      expect(mockLoadAndPlay).toHaveBeenCalledTimes(2);
      const secondCall = mockLoadAndPlay.mock.calls[1][0];
      expect(secondCall.subtitle).toBe('Chapter 2: Two');
      expect(secondCall.hasPrev).toBe(true);
      expect(secondCall.hasNext).toBe(true);
    });

    it('onPrev retreats to the previous chapter', () => {
      mockGetAutoResumeBookmark.mockReturnValue({ chapterId: 'ch-3', positionSeconds: 0 });
      playBookContinuous('book-1', 'My Book', queue);
      const firstCall = mockLoadAndPlay.mock.calls[0][0];
      expect(firstCall.subtitle).toBe('Chapter 3: Three');

      firstCall.onPrev();

      const secondCall = mockLoadAndPlay.mock.calls[1][0];
      expect(secondCall.subtitle).toBe('Chapter 2: Two');
    });

    it('onEnded advances when not on the last chapter', () => {
      mockGetAutoResumeBookmark.mockReturnValue(null);
      playBookContinuous('book-1', 'My Book', queue);
      const firstCall = mockLoadAndPlay.mock.calls[0][0];

      firstCall.onEnded();

      expect(mockLoadAndPlay).toHaveBeenCalledTimes(2);
      expect(mockClearAutoResumeBookmark).not.toHaveBeenCalled();
      expect(mockStop).not.toHaveBeenCalled();
    });

    it('onEnded on the last chapter clears the resume bookmark and stops instead of advancing', () => {
      mockGetAutoResumeBookmark.mockReturnValue({ chapterId: 'ch-3', positionSeconds: 0 });
      playBookContinuous('book-1', 'My Book', queue);
      const firstCall = mockLoadAndPlay.mock.calls[0][0];

      firstCall.onEnded();

      expect(mockLoadAndPlay).toHaveBeenCalledTimes(1);
      expect(mockClearAutoResumeBookmark).toHaveBeenCalledWith('book-1');
      expect(mockStop).toHaveBeenCalledTimes(1);
    });
  });

  describe('useAutoSaveResumePosition', () => {
    const queue = [
      { chapterId: 'ch-1', title: 'One', audioUrl: 'url-1' },
      { chapterId: 'ch-2', title: 'Two', audioUrl: 'url-2' },
    ];

    let listener: (() => void) | undefined;
    let snapshot: {
      bookId: string | null;
      playing: boolean;
      audioUrl: string | null;
      position: number;
    };

    beforeEach(() => {
      vi.useFakeTimers();
      vi.setSystemTime(0);
      listener = undefined;
      snapshot = { bookId: 'book-1', playing: true, audioUrl: 'url-1', position: 0 };
      mockSubscribe.mockImplementation((l: () => void) => {
        listener = l;
        return () => {
          listener = undefined;
        };
      });
      mockGetSnapshot.mockImplementation(() => snapshot);
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    function emit(patch: Partial<typeof snapshot>) {
      snapshot = { ...snapshot, ...patch };
      act(() => {
        listener?.();
      });
    }

    it('persists position when bookId matches and playing is true', () => {
      renderHook(() => useAutoSaveResumePosition('book-1', queue));

      emit({ position: 12 });

      expect(mockUpsertAutoResumeBookmark).toHaveBeenCalledWith('book-1', 'ch-1', 12);
    });

    it('does not persist when a different book is active', () => {
      snapshot.bookId = 'book-other';
      renderHook(() => useAutoSaveResumePosition('book-1', queue));

      emit({ position: 12 });

      expect(mockUpsertAutoResumeBookmark).not.toHaveBeenCalled();
    });

    it('does not persist when not playing', () => {
      snapshot.playing = false;
      renderHook(() => useAutoSaveResumePosition('book-1', queue));

      emit({ position: 12 });

      expect(mockUpsertAutoResumeBookmark).not.toHaveBeenCalled();
    });

    it('throttles rapid position updates to at most once per ~5 seconds', () => {
      renderHook(() => useAutoSaveResumePosition('book-1', queue));

      emit({ position: 1 });
      expect(mockUpsertAutoResumeBookmark).toHaveBeenCalledTimes(1);

      vi.setSystemTime(1000);
      emit({ position: 2 });
      vi.setSystemTime(2000);
      emit({ position: 3 });
      expect(mockUpsertAutoResumeBookmark).toHaveBeenCalledTimes(1);

      vi.setSystemTime(5001);
      emit({ position: 4 });
      expect(mockUpsertAutoResumeBookmark).toHaveBeenCalledTimes(2);
      expect(mockUpsertAutoResumeBookmark).toHaveBeenLastCalledWith('book-1', 'ch-1', 4);
    });

    it('does nothing when queue is empty', () => {
      renderHook(() => useAutoSaveResumePosition('book-1', []));
      emit({ position: 12 });
      expect(mockUpsertAutoResumeBookmark).not.toHaveBeenCalled();
    });
  });
});
