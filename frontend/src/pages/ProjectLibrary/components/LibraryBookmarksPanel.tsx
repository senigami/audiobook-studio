import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bookmark, ChevronDown, ChevronUp } from 'lucide-react';
import { BookmarkList } from '@/components/BookmarkList';
import { removeBookmark, useBookmarks } from '@/store/bookmarks';
import { setLastChapter } from '@/pages/Book/lib/stages';
import type { Project } from '@/types';

/**
 * Library-wide bookmarks panel — every bookmark across every book (unlike
 * ContentsStage's book-scoped panel, this one is intentionally cross-book;
 * see design-docs/plans/active/north_star_screen_parity task 010, Gate 2).
 * Reuses the same store/bookmarks.ts data source and BookmarkList UI.
 */
export function LibraryBookmarksPanel({ projects }: { projects: Project[] }) {
  const [open, setOpen] = useState(true);
  // useBookmarks() is intentionally raw/unfiltered (cross-book, every kind) —
  // exclude the internal `kind: 'auto'` continue-listening marker here so it
  // never appears in this user-facing list (see store/bookmarks.ts).
  const bookmarks = useBookmarks().filter((bm) => bm.kind !== 'auto');
  const navigate = useNavigate();

  const projectNameById = new Map(projects.map((p) => [p.id, p.name]));

  // Collapse entirely when there are no bookmarks anywhere — an empty panel
  // with only italic placeholder copy would otherwise occupy the page's top
  // slot above "Continue", ahead of anything with actual value (item 6,
  // 2026-07-14 HIG review of the library page).
  if (bookmarks.length === 0) {
    return null;
  }

  return (
    <div className="bookmarks-panel project-library-bookmarks-panel">
      <button
        type="button"
        className="bookmarks-panel__toggle"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        <Bookmark size={12} aria-hidden="true" />
        <span className="bookmarks-panel__toggle-label">
          Bookmarks <span className="bookmarks-panel__count">({bookmarks.length})</span>
        </span>
        {open ? <ChevronUp size={12} aria-hidden="true" /> : <ChevronDown size={12} aria-hidden="true" />}
      </button>

      {open && (
        <BookmarkList
          entries={bookmarks.map((bm) => ({
            id: bm.id,
            label: bm.label,
            secondary: projectNameById.get(bm.bookId) ?? 'Unknown book',
          }))}
          onNavigate={(id) => {
            const bm = bookmarks.find((b) => b.id === id);
            if (!bm) return;
            setLastChapter(bm.bookId, bm.chapterId);
            navigate(`/book/${bm.bookId}/chapter/${bm.chapterId}`);
          }}
          onRemove={removeBookmark}
          emptyMessage="No bookmarks yet — use the Bookmark button in any chapter workspace to tag a scene."
        />
      )}
    </div>
  );
}
