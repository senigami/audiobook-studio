/**
 * LexiconStage — Per-book pronunciation lexicon panel.
 *
 * Surfaces at /book/:bookId/lexicon (a Book-level tab).
 * The lexicon UI lives in LexiconPanel (shared with the Chapter Workspace dockable panel).
 * Inline-respell from the segment text view is deferred.
 */
import { useBookDataContext } from '@/pages/Book/BookDataContext';
import { LexiconPanel } from '@/pages/Book/components/LexiconPanel';

export function LexiconStage() {
  const { bookId } = useBookDataContext();
  return <LexiconPanel projectId={bookId} />;
}
