import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ArrowLeft, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Chapter } from '@/types';
import { setLastChapter } from '@/pages/Book/lib/stages';

interface ChapterWorkspaceHeaderProps {
  bookId: string;
  chapters: Chapter[];
  activeChapterId: string;
}

/** Dropdown list of chapters, shown when the Contents ▾ trigger is open. */
function ChapterDropdown({
  chapters,
  activeChapterId,
  onSelect,
  onClose,
}: {
  chapters: Chapter[];
  activeChapterId: string;
  onSelect: (chapterId: string) => void;
  onClose: () => void;
}) {
  return (
    <div className="workspace-chapter-dropdown" role="menu" aria-label="Switch chapter">
      {chapters.map((ch, idx) => {
        const isActive = ch.id === activeChapterId;
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
            <span className="workspace-chapter-dropdown__title">{ch.title}</span>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Header for the Chapter Workspace.
 * Shows: back-to-Contents button · chapter title · Contents ▾ dropdown switcher · prev/next navigation.
 */
export function ChapterWorkspaceHeader({
  bookId,
  chapters,
  activeChapterId,
}: ChapterWorkspaceHeaderProps) {
  const navigate = useNavigate();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const activeIndex = chapters.findIndex((c) => c.id === activeChapterId);
  const activeChapter = chapters[activeIndex] ?? null;
  const prevChapterId = activeIndex > 0 ? (chapters[activeIndex - 1]?.id ?? null) : null;
  const nextChapterId =
    activeIndex >= 0 && activeIndex < chapters.length - 1
      ? (chapters[activeIndex + 1]?.id ?? null)
      : null;

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

  // Close dropdown when clicking outside
  const handleDropdownWrapperBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    if (!dropdownRef.current?.contains(e.relatedTarget as Node)) {
      setDropdownOpen(false);
    }
  };

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
    </div>
  );
}
