import { X } from 'lucide-react';

export interface BookmarkListEntry {
  id: string;
  /** Primary label — the bookmark's own name (usually the chapter title at save time). */
  label: string;
  /** Optional secondary context, e.g. the book title, shown alongside the label. */
  secondary?: string;
}

interface BookmarkListProps {
  entries: BookmarkListEntry[];
  onNavigate: (id: string) => void;
  onRemove: (id: string) => void;
  emptyMessage?: string;
}

/**
 * Shared presentational bookmark row list, reused by the book-scoped bookmarks
 * panel (Contents tab) and the library-wide bookmarks panel (Project Library).
 * Mirrors the row shape used by ChapterWorkspaceHeader's bookmarks dropdown
 * (label + remove control) without depending on that component.
 */
export function BookmarkList({ entries, onNavigate, onRemove, emptyMessage = 'No bookmarks yet' }: BookmarkListProps) {
  if (entries.length === 0) {
    return <div className="bookmark-list__empty">{emptyMessage}</div>;
  }

  return (
    <div className="bookmark-list" role="list">
      {entries.map((entry) => (
        <div key={entry.id} className="bookmark-list__item" role="listitem">
          <button
            type="button"
            className="bookmark-list__nav-btn"
            onClick={() => onNavigate(entry.id)}
          >
            <span className="bookmark-list__label">{entry.label}</span>
            {entry.secondary && <span className="bookmark-list__secondary">{entry.secondary}</span>}
          </button>
          <button
            type="button"
            className="bookmark-list__remove"
            aria-label={`Remove bookmark: ${entry.label}`}
            onClick={(e) => {
              e.stopPropagation();
              onRemove(entry.id);
            }}
          >
            <X size={11} strokeWidth={2.5} aria-hidden="true" />
          </button>
        </div>
      ))}
    </div>
  );
}
