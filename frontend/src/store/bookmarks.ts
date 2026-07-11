/**
 * bookmarks.ts — Cross-book chapter bookmarks, persisted to localStorage.
 *
 * Constraints:
 * - No import-time side effects (INV-6): localStorage is read lazily, never at module load.
 * - No timestamps injected at module-load time: Date.now() is called in addBookmark()
 *   at mutation time so tests can inject a fake clock via vi.setSystemTime().
 */
import { useSyncExternalStore, useMemo } from 'react';

export interface Bookmark {
  id: string;
  bookId: string;
  chapterId: string;
  label: string;
  createdAt: number;
}

const STORAGE_KEY = 'audiobook-factory:bookmarks';

// ---------------------------------------------------------------------------
// Internal module state — initialised lazily on first read, not at import time

// Stable empty array reference — returned by useSyncExternalStore when there
// are no bookmarks. A new [] each call would cause React to report an infinite
// loop ("getSnapshot should be cached").
const EMPTY: Bookmark[] = [];

let memoryCache: Bookmark[] = EMPTY;
let lastSerialized = '';

const listeners = new Set<() => void>();

// ---------------------------------------------------------------------------
// Storage helpers

function load(): Bookmark[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return memoryCache;
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      if (lastSerialized !== '') {
        // Storage was cleared externally — reset to the stable empty ref
        memoryCache = EMPTY;
        lastSerialized = '';
      }
      return memoryCache;
    }
    if (raw !== lastSerialized) {
      memoryCache = JSON.parse(raw) as Bookmark[];
      lastSerialized = raw;
    }
    return memoryCache;
  } catch {
    return memoryCache;
  }
}

function save(data: Bookmark[]): void {
  if (typeof window === 'undefined' || !window.localStorage) {
    memoryCache = data;
    return;
  }
  try {
    const raw = JSON.stringify(data);
    localStorage.setItem(STORAGE_KEY, raw);
    memoryCache = data;
    lastSerialized = raw;
  } catch {
    // silently ignore quota errors etc.
  }
}

function emit(): void {
  for (const listener of listeners) {
    listener();
  }
}

// ---------------------------------------------------------------------------
// Public API

/** Returns a stable-reference snapshot of the current bookmarks array. */
export function getBookmarks(): Bookmark[] {
  return load();
}

/**
 * Subscribe to store changes. Returns an unsubscribe function.
 * Compatible with React.useSyncExternalStore.
 */
export function subscribeBookmarks(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Add a bookmark. `id` and `createdAt` are generated automatically. */
export function addBookmark(entry: Omit<Bookmark, 'id' | 'createdAt'>): Bookmark {
  const bm: Bookmark = {
    ...entry,
    id: `bm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
    createdAt: Date.now(),
  };
  const next = [bm, ...load()];
  save(next);
  emit();
  return bm;
}

/** Remove a bookmark by id. */
export function removeBookmark(id: string): void {
  const next = load().filter((bm) => bm.id !== id);
  save(next);
  emit();
}

/** Update the label of an existing bookmark. */
export function renameBookmark(id: string, label: string): void {
  const next = load().map((bm) => (bm.id === id ? { ...bm, label } : bm));
  save(next);
  emit();
}

/**
 * React hook — returns the live bookmarks array.
 * Re-renders whenever any bookmark is added, removed, or renamed.
 */
export function useBookmarks(): Bookmark[] {
  return useSyncExternalStore(subscribeBookmarks, getBookmarks);
}

/**
 * React hook — returns only bookmarks for a specific book.
 */
export function useBookBookmarks(bookId: string): Bookmark[] {
  const all = useSyncExternalStore(subscribeBookmarks, getBookmarks);
  return useMemo(() => all.filter((bm) => bm.bookId === bookId), [all, bookId]);
}

/** Reset in-memory cache (used in tests via localStorage.clear() + invalidate). */
export function _resetCache(): void {
  memoryCache = EMPTY;
  lastSerialized = '';
}
