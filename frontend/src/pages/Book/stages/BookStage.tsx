import { BookInfoCard } from '@/pages/Book/components/BookInfoCard';
import { useBookDataContext } from '@/pages/Book/BookDataContext';

export function BookStage() {
  const { actions, project, totalRuntime, totalPredicted, hasRendered, hasUnrendered } = useBookDataContext();

  if (!project) {
    return (
      <section className="book-stage" aria-label="Book">
        <div className="chapter-text-panel__empty">Book information is loading.</div>
      </section>
    );
  }

  return (
    <section className="book-stage" aria-label="Book">
      <header className="book-stage__hero">
        <div className="book-stage__hero-copy">
          <p className="book-stage__eyebrow">Book overview</p>
          <p className="book-stage__subtitle">
            A compact summary of the cover, metadata, and current production state.
          </p>
        </div>
      </header>

      <div className="book-stage__primary">
        <BookInfoCard
          project={project}
          totalRuntime={totalRuntime}
          totalPredicted={totalPredicted}
          hasRendered={hasRendered}
          hasUnrendered={hasUnrendered}
          onUpdateProject={actions.handleUpdateProject}
        />
      </div>
      <aside className="book-stage__notes" aria-label="Book overview notes">
        <div className="book-stage__panel">
          <strong>Overview notes</strong>
          <p>
            This area is reserved for a description, synopsis, or any higher-level notes you want
            visible before you go into Contents, Cast, Lexicon, or Publish.
          </p>
        </div>
      </aside>
    </section>
  );
}
