import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, Bookmark, BookMarked, ChevronDown, ChevronLeft, ChevronRight, SkipForward, X } from 'lucide-react';
import type { Chapter, Job } from '@/types';
import { setLastChapter } from '@/pages/Book/lib/stages';
import { StatusOrb } from '@/components/ui/StatusOrb';
import { pickRelevantJob } from '@/utils/jobSelection';
import {
  useBookmarks,
  addBookmark,
  removeBookmark,
  type Bookmark as BookmarkEntry,
} from '@/store/bookmarks';

interface ChapterWorkspaceHeaderProps {
  bookId: string;
  chapters: Chapter[];
  activeChapterId: string;
  jobs?: Record<string, Job>;
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
// BookmarksPanel — dropdown list of all bookmarks across books

function BookmarksPanel({
  bookmarks,
  onNavigate,
  onRemove,
  onClose,
}: {
  bookmarks: BookmarkEntry[];
  onNavigate: (bookId: string, chapterId: string) => void;
  onRemove: (id: string) => void;
  onClose: () => void;
}) {
  return (
    <div
      className="workspace-bookmarks-panel"
      role="menu"
      aria-label="Bookmarks"
    >
      {bookmarks.length === 0 ? (
        <div className="workspace-bookmarks-panel__empty">No bookmarks yet</div>
      ) : (
        bookmarks.map((bm) => (
          <div key={bm.id} className="workspace-bookmarks-panel__item">
            <button
              type="button"
              role="menuitem"
              className="workspace-bookmarks-panel__nav-btn"
              onClick={(e) => {
                e.stopPropagation();
                onNavigate(bm.bookId, bm.chapterId);
                onClose();
              }}
            >
              <span className="workspace-bookmarks-panel__label">{bm.label}</span>
            </button>
            <button
              type="button"
              className="workspace-bookmarks-panel__remove"
              aria-label={`Remove bookmark: ${bm.label}`}
              onClick={(e) => {
                e.stopPropagation();
                onRemove(bm.id);
              }}
            >
              <X size={11} strokeWidth={2.5} aria-hidden="true" />
            </button>
          </div>
        ))
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ChapterDropdown — existing chapter switcher

function ChapterDropdown({
  chapters,
  activeChapterId,
  jobs = {},
  onSelect,
  onClose,
}: {
  chapters: Chapter[];
  activeChapterId: string;
  jobs?: Record<string, Job>;
  onSelect: (chapterId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="workspace-chapter-dropdown" role="menu" aria-label="Switch chapter">
      {chapters.map((ch, idx) => {
        const isActive = ch.id === activeChapterId;
        const activeJob = pickChapterJob(ch, jobs);
        const queuePending = !activeJob && ch.audio_status === 'processing';
        return (
          <button
            key={ch.id}
            type="button"
            role="menuitem"
            className={`workspace-chapter-dropdown__item${isActive ? ' workspace-chapter-dropdown__item--active' : ''}`}
            onClick={(e) => {
              e.stopPropagation();
              onSelect(ch.id);
              onClose();
            }}
            aria-current={isActive ? 'true' : undefined}
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
          </button>
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
}: ChapterWorkspaceHeaderProps) {
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [bookmarksOpen, setBookmarksOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const bookmarksRef = useRef<HTMLDivElement>(null);

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

  const goToChapter = (chapterId: string) => {
    setLastChapter(bookId, chapterId);
    navigate(`/book/${bookId}/chapter/${chapterId}`);
  };

  const handleBack = () => {
    navigate(`/book/${bookId}/contents`);
  };

  const handleToggleDropdown = () => {
    setDropdownOpen((open) => !open);
  };

  const handleCloseDropdown = () => {
    setDropdownOpen(false);
  };

  // Close chapter dropdown when clicking outside
  const handleDropdownWrapperBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!dropdownRef.current?.contains(e.relatedTarget as Node)) {
      setDropdownOpen(false);
    }
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
            type="button"
            className={`chapter-workspace-header__switcher-trigger${dropdownOpen ? ' chapter-workspace-header__switcher-trigger--open' : ''}`}
            onClick={handleToggleDropdown}
            aria-haspopup="menu"
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
              onSelect={goToChapter}
              onClose={handleCloseDropdown}
            />
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
          className={`chapter-workspace-header__nav-btn${bookmarksOpen ? ' chapter-workspace-header__nav-btn--active' : ''}`}
          onClick={() => setBookmarksOpen((o) => !o)}
          aria-haspopup="menu"
          aria-expanded={bookmarksOpen}
          aria-label="Show bookmarks"
          title="Show bookmarks"
        >
          <span
            style={{
              fontSize: 'var(--type-micro)',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
            }}
          >
            Bookmarks
            {allBookmarks.length > 0 && (
              <span
                aria-label={`${allBookmarks.length} bookmarks`}
                style={{
                  fontSize: 'var(--type-micro)',
                  fontWeight: 700,
                  padding: '0 4px',
                  borderRadius: 'var(--radius-round)',
                  background: 'var(--accent-tint-bg)',
                  border: '1px solid var(--accent-tint-border)',
                  color: 'var(--accent)',
                  lineHeight: 1.6,
                  minWidth: 16,
                  textAlign: 'center',
                }}
              >
                {allBookmarks.length}
              </span>
            )}
          </span>
        </button>

        {bookmarksOpen && (
          <BookmarksPanel
            bookmarks={allBookmarks}
            onNavigate={handleBookmarkNavigate}
            onRemove={removeBookmark}
            onClose={() => setBookmarksOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
