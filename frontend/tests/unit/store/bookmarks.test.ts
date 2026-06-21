import { describe, it, expect, beforeEach } from 'vitest';
import {
  getBookmarks,
  addBookmark,
  removeBookmark,
  renameBookmark,
  subscribeBookmarks,
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
});
