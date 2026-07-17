import { useNavigate } from 'react-router-dom';
import { BookOpenText } from 'lucide-react';
import { ReaderContainer } from '@/components/reader/ReaderContainer';
import { useChapterReaderSync } from '@/pages/Book/lib/useChapterReaderSync';
import type { Chapter } from '@/types';

interface ChapterReaderCardProps {
  bookId: string;
  chapter: Chapter;
}

/**
 * Embedded read-along reader — entry point #2 of the synced-reader plan
 * (Task 9, `03-reader-frontend.md` "Entry points"): the compact
 * `ReaderContainer` card (display state 1, "embedded") wired to this
 * chapter's own timing + the global player bus, plus a link out to the
 * standalone full-page reader route (entry point #1).
 *
 * Lands in the Chapter Workspace (`BookLayout.tsx`, near
 * `ChapterWorkspaceHeader`) rather than inside `DirectorsConsole`/Booth —
 * the chapter editor is out of scope for this whole plan (owner decision,
 * `03-reader-frontend.md` "Chapter editor / Booth: explicitly untouched").
 */
export function ChapterReaderCard({ bookId, chapter }: ChapterReaderCardProps) {
  const navigate = useNavigate();
  const { readerProps } = useChapterReaderSync(bookId, chapter);

  return (
    <section className="chapter-reader-card" aria-label="Read along">
      <ReaderContainer {...readerProps} />
      <button
        type="button"
        className="btn-ghost chapter-reader-card__open-full"
        onClick={() => navigate(`/book/${bookId}/chapter/${chapter.id}/reader`)}
      >
        <BookOpenText size={14} aria-hidden="true" />
        Open Full Reader
      </button>
    </section>
  );
}
