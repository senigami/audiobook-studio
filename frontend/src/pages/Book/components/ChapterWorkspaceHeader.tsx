import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { ArrowLeft, Bookmark, BookMarked, ChevronDown, ChevronLeft, ChevronRight, Library, SkipForward } from 'lucide-react';
import type { Chapter, Job } from '@/types';
import { setLastChapter } from '@/pages/Book/lib/stages';
import { StatusOrb } from '@/components/ui/StatusOrb';
import { BookmarkList } from '@/components/BookmarkList';
import { pickRelevantJob } from '@/utils/jobSelection';
import { useBookmarks, addBookmark, removeBookmark } from '@/store/bookmarks';

interface ChapterWorkspaceHeaderProps {
  bookId: string;
  chapters: Chapter[];
  activeChapterId: string;
  jobs?: Record<string, Job>;
  /**
   * Extra trailing action(s) rendered in the same toolbar row (e.g.
   * BookLayout's Lexicon panel toggle). Consolidating these into one row
   * avoids an orphaned button floating alone in its own dead vertical band
   * below the header (design-critique HIG finding) — reclaiming that space
   * for the manuscript.
   */
  rightSlot?: ReactNode;
}

// ---------------------------------------------------------------------------
// Helper: find the most relevant in-flight job for a chapter (mirrors
// ChapterTable.tsx's pickChapterJob — same StatusOrb data contract, reused
// rather than re-derived so the two views never drift).

function pickChapterJob(chapter: Chapter, jobs: Record<string, Job>): Job | undefined {
  return pickRelevantJob(
    Object.values(jobs).filter((job) =>
      job.project_id === chapter.project_id &&
      (job.chapter_id === chapter.id || job.chapter_file?.includes(chapter.id)),
    ),
  );
}

// ---------------------------------------------------------------------------
// Helper: is a chapter fully rendered?

function isChapterFullyRendered(chapter: Chapter): boolean {
  if (chapter.audio_status === 'done') return true;
  const total = chapter.total_segments_count;
  const done = chapter.done_segments_count;
  if (typeof total === 'number' && typeof done === 'number' && total > 0) {
    return done >= total;
  }
  return false;
}

// ---------------------------------------------------------------------------
// Helper: find the next unrendered chapter after `activeChapterId`, wrapping around.

function findNextUnrenderedChapterId(
  chapters: Chapter[],
  activeChapterId: string,
): string | null {
  if (chapters.length === 0) return null;

  const activeIndex = chapters.findIndex((c) => c.id === activeChapterId);
  // Walk from the chapter AFTER the current one, wrapping around, back to (not including) activeIndex
  for (let offset = 1; offset < chapters.length; offset++) {
    const idx = (activeIndex + offset) % chapters.length;
    if (!isChapterFullyRendered(chapters[idx])) {
      return chapters[idx].id;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// ChapterDropdown — existing chapter switcher

function ChapterDropdown({
  chapters,
  activeChapterId,
  jobs = {},
  focusedIndex,
  optionRefs,
  listboxRef,
  onKeyDown,
  onSelect,
  onClose,
}: {
  chapters: Chapter[];
  activeChapterId: string;
  jobs?: Record<string, Job>;
  focusedIndex: number;
  optionRefs: React.MutableRefObject<(HTMLDivElement | null)[]>;
  listboxRef: React.RefObject<HTMLDivElement | null>;
  onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void;
  onSelect: (chapterId: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      ref={listboxRef}
      className="workspace-chapter-dropdown"
      role="listbox"
      aria-label="Switch chapter"
      onKeyDown={onKeyDown}
    >
      {chapters.map((ch, idx) => {
        const isActive = ch.id === activeChapterId;
        const isFocused = idx === focusedIndex;
        const activeJob = pickChapterJob(ch, jobs);
        const queuePending = !activeJob && ch.audio_status === 'processing';
        return (
          <div
            key={ch.id}
            ref={(el) => {
              optionRefs.current[idx] = el;
            }}
            role="option"
            aria-selected={isActive}
            tabIndex={isFocused ? 0 : -1}
            className={`workspace-chapter-dropdown__item${isActive ? ' workspace-chapter-dropdown__item--active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(ch.id);
              onClose();
            }}
          >
            <span className="workspace-chapter-dropdown__num" aria-hidden="true">
              {idx + 1}
            </span>
            <StatusOrb
              chap={ch}
              activeJob={activeJob}
              queuePending={queuePending}
              doneSegments={ch.done_segments_count}
              totalSegments={ch.total_segments_count}
              size={16}
            />
            <span className="workspace-chapter-dropdown__title">{ch.title}</span>
          </div>
        );
      })}
    </div>
  );
}

/**
 * Header for the Chapter Workspace.
 * Shows: back-to-Contents button · chapter title · Contents ▾ dropdown switcher · prev/next navigation
 *        · jump-to-next-unrendered · bookmark controls.
 */
export function ChapterWorkspaceHeader({
  bookId,
  chapters,
  activeChapterId,
  jobs = {},
  rightSlot,
}: ChapterWorkspaceHeaderProps) {
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const bookmarksRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const listboxRef = useRef<HTMLDivElement>(null);
  const optionRefs = useRef<(HTMLDivElement | null)[]>([]);
  const closingRef = useRef(false);
  const [focusedIndex, setFocusedIndex] = useState(0);
  const [liveMessage, setLiveMessage] = useState('');
  const prevStatusesRef = useRef<Record<string, string>>({});

  // All bookmarks (across books) for the panel list
  const allBookmarks = useBookmarks();

  const activeIndex = chapters.findIndex((c) => c.id === activeChapterId);
  const activeChapter = chapters[activeIndex] ?? null;
  const prevChapterId = activeIndex > 0 ? (chapters[activeIndex - 1]?.id ?? null) : null;
  const nextChapterId =
    activeIndex >= 0 && activeIndex < chapters.length - 1
      ? (chapters[activeIndex + 1]?.id ?? null)
      : null;

  const nextUnrenderedId = findNextUnrenderedChapterId(chapters, activeChapterId);
  const allRendered = nextUnrenderedId === null;

  // Single authoritative close path: both the Escape-keydown handler and the
  // wrapper-blur fallback route through here. `closingRef` makes it idempotent
  // so a blur/keydown race can't produce a second, conflicting close (gap 2 /
  // INV-NAV-3b / round-4 addition 6) — whichever fires first wins, the other
  // is a no-op.
  const closeDropdown = (returnFocusToTrigger: boolean) => {
    if (closingRef.current) return;
    closingRef.current = true;
    setDropdownOpen(false);
    if (returnFocusToTrigger) {
      triggerRef.current?.focus();
    }
  };

  const handleToggleDropdown = () => {
    setDropdownOpen((open) => !open);
  };

  // Close chapter dropdown when focus leaves the wrapper entirely. This is a
  // fallback for pointer-driven "click elsewhere" dismissal only — the
  // Escape key uses `closeDropdown` directly, and `closingRef` prevents this
  // from double-firing the close path when both happen in the same tick.
  const handleDropdownWrapperBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!dropdownRef.current?.contains(e.relatedTarget as Node)) {
      closeDropdown(false);
    }
  };

  // Initial-focus-on-open (gap 1): move real DOM focus onto the active
  // chapter's option (or the first option if none is active) as soon as the
  // listbox opens, and reset the race-guard for the new open session.
  useEffect(() => {
    if (!dropdownOpen) return;
    closingRef.current = false;
    const initialIndex = activeIndex >= 0 ? activeIndex : 0;
    setFocusedIndex(initialIndex);
    // Reset the status baseline for the live-region diff below so opening
    // the dropdown never itself announces a "change".
    const baseline: Record<string, string> = {};
    chapters.forEach((ch) => {
      const activeJob = pickChapterJob(ch, jobs);
      baseline[ch.id] = activeJob?.status ?? ch.audio_status;
    });
    prevStatusesRef.current = baseline;
    setLiveMessage('');
    // Deliberately only re-runs on open/close, not on every chapters/jobs
    // change — the cross-book reset effect below handles chapters-identity
    // changes while already open.
  }, [dropdownOpen]);

  // Round-4 addition 3 / INV-NAV-3c: every focusedIndex change (initial focus
  // or arrow-key nav) moves real DOM focus and scrolls the option into view —
  // never just a state/visual update.
  useEffect(() => {
    if (!dropdownOpen) return;
    const el = optionRefs.current[focusedIndex];
    if (el) {
      el.focus();
      el.scrollIntoView({ block: 'nearest' });
    }
  }, [dropdownOpen, focusedIndex]);

  // Round-4 addition 8: if `chapters` changes identity while the dropdown is
  // open (e.g. the user switched to a different, shorter book), clamp
  // focusedIndex back into range rather than leaving it pointing past the end
  // or at a stale ref.
  useEffect(() => {
    if (!dropdownOpen) return;
    setFocusedIndex((idx) => {
      if (chapters.length === 0) return 0;
      return Math.min(idx, chapters.length - 1);
    });
  }, [chapters]);

  // Scoped aria-live announcement: if a visible row's status changes while
  // the dropdown is open, announce it (not a general app-wide live region).
  useEffect(() => {
    if (!dropdownOpen) return;
    const prev = prevStatusesRef.current;
    const next: Record<string, string> = {};
    let changedMessage: string | null = null;
    chapters.forEach((ch) => {
      const activeJob = pickChapterJob(ch, jobs);
      const status = activeJob?.status ?? ch.audio_status;
      next[ch.id] = status;
      if (prev[ch.id] !== undefined && prev[ch.id] !== status) {
        changedMessage = `${ch.title} status: ${status}`;
      }
    });
    prevStatusesRef.current = next;
    if (changedMessage) setLiveMessage(changedMessage);
  }, [dropdownOpen, chapters, jobs]);

  const handleListboxKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (chapters.length === 0) return;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setFocusedIndex((idx) => (idx + 1) % chapters.length);
        break;
      case 'ArrowUp':
        e.preventDefault();
        setFocusedIndex((idx) => (idx - 1 + chapters.length) % chapters.length);
        break;
      case 'Enter':
      case ' ':
        e.preventDefault();
        {
          const ch = chapters[focusedIndex];
          if (ch) {
            goToChapter(ch.id);
            closeDropdown(false);
          }
        }
        break;
      case 'Escape':
        e.preventDefault();
        closeDropdown(true);
        break;
      default:
        break;
    }
  };

  const goToChapter = (chapterId: string) => {
    setLastChapter(bookId, chapterId);
    navigate(`/book/${bookId}/chapter/${chapterId}`);
  };

  const handleBack = () => {
    navigate(`/book/${bookId}/contents`);
  };

  // Close bookmarks panel when clicking outside
  const handleBookmarksWrapperBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!bookmarksRef.current?.contains(e.relatedTarget as Node)) {
      setBookmarksOpen(false);
    }
  };

  const handleJumpToNextUnrendered = () => {
    if (!nextUnrenderedId) return;
    goToChapter(nextUnrenderedId);
  };

  const handleAddBookmark = () => {
    const label = activeChapter?.title ?? activeChapterId;
    addBookmark({ bookId, chapterId: activeChapterId, label });
  };

  const handleBookmarkNavigate = (targetBookId: string, targetChapterId: string) => {
    setLastChapter(targetBookId, targetChapterId);
    navigate(`/book/${targetBookId}/chapter/${targetChapterId}`);
  };

  const currentChapterIsBookmarked = allBookmarks.some(
    (bm) => bm.bookId === bookId && bm.chapterId === activeChapterId,
  );

  return (
    <div className="chapter-workspace-header" role="toolbar" aria-label="Chapter workspace navigation">
      {/* Back to Contents */}
      <button
        type="button"
        className="chapter-workspace-header__back"
        onClick={handleBack}
        aria-label="Back to Contents"
      >
        <ArrowLeft size={14} strokeWidth={2.2} aria-hidden="true" />
        <span>Contents</span>
      </button>

      <span className="chapter-workspace-header__sep" aria-hidden="true">·</span>

      {/* Chapter title */}
      <span className="chapter-workspace-header__title" aria-current="page">
        {activeChapter?.title ?? activeChapterId}
      </span>

      {/* Contents dropdown switcher */}
      {chapters.length > 1 && (
        <div
          ref={dropdownRef}
          className="chapter-workspace-header__switcher"
          onBlur={handleDropdownWrapperBlur}
        >
          <button
            ref={triggerRef}
            type="button"
            className={`chapter-workspace-header__switcher-trigger${dropdownOpen ? ' chapter-workspace-header__switcher-trigger--open' : ''}`}
            onClick={handleToggleDropdown}
            aria-haspopup="listbox"
            aria-expanded={dropdownOpen}
            aria-label="Switch chapter"
          >
            <span>Contents</span>
            <ChevronDown size={12} strokeWidth={2.5} aria-hidden="true" />
          </button>

          {dropdownOpen && (
            <ChapterDropdown
              chapters={chapters}
              activeChapterId={activeChapterId}
              jobs={jobs}
              focusedIndex={focusedIndex}
              optionRefs={optionRefs}
              listboxRef={listboxRef}
              onKeyDown={handleListboxKeyDown}
              onSelect={goToChapter}
              onClose={() => closeDropdown(false)}
            />
          )}

          {/* Scoped aria-live announcement for in-place chapter status changes
              while the dropdown is open (not a general app-wide live region). */}
          {dropdownOpen && (
            <div className="sr-only" aria-live="polite" role="status">
              {liveMessage}
            </div>
          )}
        </div>
      )}

      {/* Prev / Next chapter navigation */}
      <div className="chapter-workspace-header__nav" aria-label="Previous and next chapter">
        <button
          type="button"
          className="chapter-workspace-header__nav-btn"
          onClick={() => prevChapterId && goToChapter(prevChapterId)}
          disabled={!prevChapterId}
          aria-label="Previous chapter"
          title={prevChapterId ? `Previous: ${chapters[activeIndex - 1]?.title ?? ''}` : 'No previous chapter'}
        >
          <ChevronLeft size={14} strokeWidth={2.2} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="chapter-workspace-header__nav-btn"
          onClick={() => nextChapterId && goToChapter(nextChapterId)}
          disabled={!nextChapterId}
          aria-label="Next chapter"
          title={nextChapterId ? `Next: ${chapters[activeIndex + 1]?.title ?? ''}` : 'No next chapter'}
        >
          <ChevronRight size={14} strokeWidth={2.2} aria-hidden="true" />
        </button>
      </div>

      {/* Jump to next unrendered chapter */}
      <button
        type="button"
        className="chapter-workspace-header__nav-btn"
        onClick={handleJumpToNextUnrendered}
        disabled={allRendered}
        aria-label="Jump to next unrendered chapter"
        title={allRendered ? 'All chapters rendered' : `Jump to next unrendered chapter`}
      >
        <SkipForward size={14} strokeWidth={2.2} aria-hidden="true" />
      </button>

      {/* Bookmark controls */}
      <button
        type="button"
        className={`chapter-workspace-header__nav-btn${currentChapterIsBookmarked ? ' chapter-workspace-header__nav-btn--active' : ''}`}
        onClick={handleAddBookmark}
        aria-label="Bookmark this chapter"
        title="Bookmark this chapter"
      >
        {currentChapterIsBookmarked ? (
          <BookMarked size={14} strokeWidth={2.2} aria-hidden="true" />
        ) : (
          <Bookmark size={14} strokeWidth={2.2} aria-hidden="true" />
        )}
      </button>

      {/* Bookmarks list panel */}
      <div
        ref={bookmarksRef}
        className="chapter-workspace-header__bookmarks-wrapper"
        onBlur={handleBookmarksWrapperBlur}
      >
        <button
          type="button"
          className={`chapter-workspace-header__nav-btn${bookmarksOpen ? ' chapter-workspace-header__nav-btn--active' : ''}${allBookmarks.length > 0 ? ' chapter-workspace-header__nav-btn--badged' : ''}`}
          onClick={() => setBookmarksOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={bookmarksOpen}
          aria-label="Show bookmarks"
          title="Show bookmarks"
        >
          {/* Icon-only (matching the rest of the row's icon buttons) —
              a "Bookmarks" text label next to the icon collided/wrapped at
              1280px (design-critique HIG finding). Count is a small corner
              badge rather than inline text. */}
          <Library size={14} strokeWidth={2.2} aria-hidden="true" />
          {allBookmarks.length > 0 && (
            <span className="chapter-workspace-header__nav-btn-badge" aria-hidden="true">
              {allBookmarks.length > 99 ? '99+' : allBookmarks.length}
            </span>
          )}
        </button>

        {bookmarksOpen && (
          <div role="menu" aria-label="Bookmarks">
            <BookmarkList
              entries={allBookmarks.map((bm) => ({
                id: bm.id,
                label: bm.label,
                // Distinguish bookmarks from other books — this header only
                // has the current book's id/chapters in scope, not a title
                // lookup for arbitrary books, so a generic marker (rather
                // than a fetched book title) is the honest, scoped fix for
                // "two identical chapter-title rows from different books
                // are indistinguishable."
                secondary: bm.bookId === bookId ? undefined : 'Other book',
              }))}
              onNavigate={(id) => {
                const bm = allBookmarks.find((b) => b.id === id);
                if (!bm) return;
                handleBookmarkNavigate(bm.bookId, bm.chapterId);
                setBookmarksOpen(false);
              }}
              onRemove={removeBookmark}
            />
          </div>
        )}
      </div>

      {rightSlot && (
        <div className="chapter-workspace-header__right-slot">{rightSlot}</div>
      )}
    </div>
  );
}
