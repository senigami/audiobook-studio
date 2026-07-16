import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import {
  getBookmarks,
  addBookmark,
  removeBookmark,
  renameBookmark,
  subscribeBookmarks,
  useBookBookmarks,
  upsertAutoResumeBookmark,
  getAutoResumeBookmark,
  clearAutoResumeBookmark,
  _resetCache,
} from '@/store/bookmarks';

describe('bookmarks store', () => {
  beforeEach(() => {
    localStorage.clear();
    _resetCache();
  });

  it('starts empty after localStorage.clear()', () => {
    expect(getBookmarks()).toEqual([]);
  });

  it('addBookmark persists to localStorage and returns the new entry', () => {
    const bm = addBookmark({ bookId: 'book-1', chapterId: 'ch-1', label: 'My note' });

    expect(bm.bookId).toBe('book-1');
    expect(bm.chapterId).toBe('ch-1');
    expect(bm.label).toBe('My note');
    expect(typeof bm.id).toBe('string');
    expect(typeof bm.createdAt).toBe('number');

    // Survives a cache reset (reread from localStorage)
    _resetCache();
    const stored = getBookmarks();
    expect(stored).toHaveLength(1);
    expect(stored[0].label).toBe('My note');
  });

  it('addBookmark prepends so newest comes first', () => {
    addBookmark({ bookId: 'book-1', chapterId: 'ch-1', label: 'first' });
    addBookmark({ bookId: 'book-1', chapterId: 'ch-2', label: 'second' });

    const bms = getBookmarks();
    expect(bms[0].label).toBe('second');
    expect(bms[1].label).toBe('first');
  });

  it('removeBookmark removes by id and persists', () => {
    const bm = addBookmark({ bookId: 'book-1', chapterId: 'ch-1', label: 'to remove' });
    removeBookmark(bm.id);

    expect(getBookmarks()).toHaveLength(0);

    _resetCache();
    expect(getBookmarks()).toHaveLength(0);
  });

  it('removeBookmark leaves other bookmarks intact', () => {
    const a = addBookmark({ bookId: 'book-1', chapterId: 'ch-1', label: 'a' });
    addBookmark({ bookId: 'book-1', chapterId: 'ch-2', label: 'b' });
    removeBookmark(a.id);

    const remaining = getBookmarks();
    expect(remaining).toHaveLength(1);
    expect(remaining[0].label).toBe('b');
  });

  it('renameBookmark updates the label in place', () => {
    const bm = addBookmark({ bookId: 'book-1', chapterId: 'ch-1', label: 'original' });
    renameBookmark(bm.id, 'renamed');

    const updated = getBookmarks().find((b) => b.id === bm.id);
    expect(updated?.label).toBe('renamed');
  });

  it('subscribeBookmarks fires on add and returns an unsubscribe function', () => {
    const calls: number[] = [];
    const unsub = subscribeBookmarks(() => calls.push(1));

    addBookmark({ bookId: 'book-1', chapterId: 'ch-1', label: 'test' });
    expect(calls).toHaveLength(1);

    unsub();
    addBookmark({ bookId: 'book-1', chapterId: 'ch-2', label: 'test2' });
    // listener was removed — no extra call
    expect(calls).toHaveLength(1);
  });

  it('subscribeBookmarks fires on remove', () => {
    const calls: number[] = [];
    const bm = addBookmark({ bookId: 'book-1', chapterId: 'ch-1', label: 'removable' });

    subscribeBookmarks(() => calls.push(1));
    removeBookmark(bm.id);

    expect(calls).toHaveLength(1);
  });

  it('stores bookmarks for multiple books independently', () => {
    addBookmark({ bookId: 'book-1', chapterId: 'ch-a', label: 'book one' });
    addBookmark({ bookId: 'book-2', chapterId: 'ch-b', label: 'book two' });

    const all = getBookmarks();
    expect(all).toHaveLength(2);
    expect(all.map((b) => b.bookId).sort()).toEqual(['book-1', 'book-2'].sort());
  });

  describe('useBookBookmarks', () => {
    it('returns only bookmarks belonging to the given book, newest first', () => {
      addBookmark({ bookId: 'book-1', chapterId: 'ch-a', label: 'book one - a' });
      addBookmark({ bookId: 'book-2', chapterId: 'ch-b', label: 'book two - b' });
      addBookmark({ bookId: 'book-1', chapterId: 'ch-c', label: 'book one - c' });

      const { result } = renderHook(() => useBookBookmarks('book-1'));

      expect(result.current).toHaveLength(2);
      expect(result.current.map((b) => b.label)).toEqual(['book one - c', 'book one - a']);
    });

    it('returns an empty array when the book has no bookmarks', () => {
      addBookmark({ bookId: 'book-2', chapterId: 'ch-b', label: 'other book' });

      const { result } = renderHook(() => useBookBookmarks('book-1'));

      expect(result.current).toEqual([]);
    });

    it('excludes auto-resume bookmarks from the visible list', () => {
      addBookmark({ bookId: 'book-1', chapterId: 'ch-a', label: 'user note' });
      upsertAutoResumeBookmark('book-1', 'ch-b', 42);

      const { result } = renderHook(() => useBookBookmarks('book-1'));

      expect(result.current).toHaveLength(1);
      expect(result.current[0].label).toBe('user note');
      expect(result.current.every((b) => b.kind !== 'auto')).toBe(true);
    });

    it('a bookmark without a kind field behaves as a user bookmark (back-compat)', () => {
      addBookmark({ bookId: 'book-1', chapterId: 'ch-a', label: 'legacy note' });

      const { result } = renderHook(() => useBookBookmarks('book-1'));

      expect(result.current).toHaveLength(1);
      expect(result.current[0].kind).toBeUndefined();
    });
  });

  describe('auto-resume bookmark', () => {
    it('upsertAutoResumeBookmark creates a new auto bookmark when none exists', () => {
      upsertAutoResumeBookmark('book-1', 'ch-1', 10);

      const all = getBookmarks();
      expect(all).toHaveLength(1);
      expect(all[0].bookId).toBe('book-1');
      expect(all[0].chapterId).toBe('ch-1');
      expect(all[0].kind).toBe('auto');
      expect(all[0].positionSeconds).toBe(10);
    });

    it('upsertAutoResumeBookmark updates the existing auto bookmark in place (same id)', () => {
      upsertAutoResumeBookmark('book-1', 'ch-1', 10);
      const firstId = getAutoResumeBookmark('book-1')?.id;

      upsertAutoResumeBookmark('book-1', 'ch-2', 55);

      const all = getBookmarks();
      expect(all).toHaveLength(1);
      expect(all[0].id).toBe(firstId);
      expect(all[0].chapterId).toBe('ch-2');
      expect(all[0].positionSeconds).toBe(55);
    });

    it('upsertAutoResumeBookmark does not disturb user bookmarks for the same book', () => {
      addBookmark({ bookId: 'book-1', chapterId: 'ch-a', label: 'user note' });
      upsertAutoResumeBookmark('book-1', 'ch-1', 10);

      const all = getBookmarks();
      expect(all).toHaveLength(2);
      expect(all.some((b) => b.label === 'user note' && b.kind !== 'auto')).toBe(true);
    });

    it('getAutoResumeBookmark returns null when none exists', () => {
      expect(getAutoResumeBookmark('book-1')).toBeNull();
    });

    it('getAutoResumeBookmark returns the auto bookmark for the book', () => {
      upsertAutoResumeBookmark('book-1', 'ch-3', 99);

      const bm = getAutoResumeBookmark('book-1');
      expect(bm).not.toBeNull();
      expect(bm?.chapterId).toBe('ch-3');
      expect(bm?.positionSeconds).toBe(99);
    });

    it('getAutoResumeBookmark does not return a user bookmark for the same book', () => {
      addBookmark({ bookId: 'book-1', chapterId: 'ch-a', label: 'user note' });

      expect(getAutoResumeBookmark('book-1')).toBeNull();
    });

    it('clearAutoResumeBookmark removes only the auto entry, leaving user bookmarks intact', () => {
      addBookmark({ bookId: 'book-1', chapterId: 'ch-a', label: 'user note' });
      upsertAutoResumeBookmark('book-1', 'ch-1', 10);

      clearAutoResumeBookmark('book-1');

      const all = getBookmarks();
      expect(all).toHaveLength(1);
      expect(all[0].label).toBe('user note');
      expect(getAutoResumeBookmark('book-1')).toBeNull();
    });

    it('clearAutoResumeBookmark is a no-op when no auto bookmark exists', () => {
      addBookmark({ bookId: 'book-1', chapterId: 'ch-a', label: 'user note' });

      clearAutoResumeBookmark('book-1');

      expect(getBookmarks()).toHaveLength(1);
    });
  });
});
