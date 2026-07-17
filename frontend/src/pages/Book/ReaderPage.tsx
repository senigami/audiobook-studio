import { useEffect, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { api } from '@/api';
import { ReaderContainer } from '@/components/reader/ReaderContainer';
import { useChapterReaderSync } from '@/pages/Book/lib/useChapterReaderSync';
import type { Chapter } from '@/types';

/**
 * Standalone full-page reader route — entry point #1 of the synced-reader
 * plan (Task 9, `03-reader-frontend.md` "Entry points": "A link/button on
 * the main Book page opening the standalone reader (its own route ... )").
 *
 * Mounted at `/book/:bookId/chapter/:chapterId/reader`. Fetches this
 * chapter directly (no `BookDataProvider` — this route is intentionally
 * lightweight/standalone, not nested in the full Book-tab data chain) and
 * reuses the same `useChapterReaderSync` wiring as the embedded
 * `ChapterReaderCard`, so the two entry points can never drift apart.
 *
 * Starts `ReaderContainer` in the "expanded" (full-browser overlay) display
 * state rather than "embedded" (see `ReaderContainer`'s `startExpanded` doc)
 * — a standalone page IS the full-page reader experience, not a small card
 * floating on an otherwise-blank page.
 */
export function ReaderPage() {
  const { bookId, chapterId } = useParams<{ bookId: string; chapterId: string }>();
  const navigate = useNavigate();
  const [chapter, setChapter] = useState<Chapter | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!bookId || !chapterId) return;
    let cancelled = false;
    setLoading(true);
    setNotFound(false);
    api.fetchChapter(chapterId, bookId)
      .then((fetched) => {
        if (cancelled) return;
        setChapter(fetched);
      })
      .catch(() => {
        if (!cancelled) setNotFound(true);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [bookId, chapterId]);

  const { readerProps } = useChapterReaderSync(bookId ?? '', chapter);

  if (!bookId || !chapterId) {
    return <Navigate to="/library" replace />;
  }

  if (notFound) {
    return <Navigate to={`/book/${bookId}/contents`} replace />;
  }

  return (
    <section className="reader-page" aria-label="Reader" style={{ height: '100%', minHeight: '60vh' }}>
      <button
        type="button"
        className="btn-ghost reader-page__back"
        onClick={() => navigate(`/book/${bookId}/chapter/${chapterId}`)}
        aria-label="Back to chapter"
      >
        <ArrowLeft size={14} strokeWidth={2.2} aria-hidden="true" />
        <span>Back to chapter</span>
      </button>

      {!loading && chapter && <ReaderContainer {...readerProps} startExpanded />}
    </section>
  );
}
