/**
 * bookmarkStore.ts — In-memory named bookmark store for the site-mockup demo.
 *
 * Keyed on (book, chapter, segment) so bookmarks survive text edits.
 * A tiny pub-sub layer lets ContentsPane and StudioPane stay in sync without
 * threading props through siteMockupStage.
 */

export interface NamedBookmark {
  id: string;
  book: string;
  chapter: number;
  segment: string; // chunk id
  label: string;
}

// ---------------------------------------------------------------------------
// Seed data — spans two books so the cross-book list is always non-trivial

const seed: NamedBookmark[] = [
  {
    id: 'bm-seed-1',
    book: 'The Whispering Vale',
    chapter: 2,
    segment: 'c13',
    label: 'warden reveal',
  },
  {
    id: 'bm-seed-2',
    book: 'The Whispering Vale',
    chapter: 4,
    segment: 'c21',
    label: 'lantern speech',
  },
  {
    id: 'bm-seed-3',
    book: 'Iron Meridian',
    chapter: 1,
    segment: 'c5',
    label: 'opening confrontation',
  },
  {
    id: 'bm-seed-4',
    book: 'Iron Meridian',
    chapter: 3,
    segment: 'c19',
    label: 'meridian gate',
  },
];

// ---------------------------------------------------------------------------
// Mutable store state

let _bookmarks: NamedBookmark[] = [...seed];
type Listener = () => void;
const _listeners = new Set<Listener>();

// ---------------------------------------------------------------------------
// Public API

export function getBookmarks(): NamedBookmark[] {
  return _bookmarks;
}

export function addBookmark(bm: Omit<NamedBookmark, 'id'>): NamedBookmark {
  const entry: NamedBookmark = { ...bm, id: `bm-${Date.now()}-${Math.random().toString(36).slice(2, 6)}` };
  _bookmarks = [entry, ..._bookmarks];
  _listeners.forEach(l => l());
  return entry;
}

export function removeBookmark(id: string): void {
  _bookmarks = _bookmarks.filter(bm => bm.id !== id);
  _listeners.forEach(l => l());
}

/** Subscribe to store changes. Returns an unsubscribe function. */
export function subscribeBookmarks(listener: Listener): () => void {
  _listeners.add(listener);
  return () => _listeners.delete(listener);
}
