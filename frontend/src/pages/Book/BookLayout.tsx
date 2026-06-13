import { Navigate, NavLink, useParams } from 'react-router-dom';
import {
  BOOK_STAGE_LABELS,
  BOOK_STAGES,
  getLastStage,
  isBookStage,
  setLastStage,
  type BookStage,
} from '@/pages/Book/lib/stages';

export function BookIndexRedirect() {
  const { bookId } = useParams<{ bookId: string }>();

  if (!bookId) {
    return <Navigate to="/" replace />;
  }

  return <Navigate to={`/book/${bookId}/${getLastStage(bookId)}`} replace />;
}

function StagePlaceholder({ stage }: { stage: BookStage }) {
  return (
    <section className="book-stage-placeholder" data-testid={`stage-${stage}`} aria-labelledby={`book-stage-${stage}`}>
      <h1 id={`book-stage-${stage}`}>{BOOK_STAGE_LABELS[stage]}</h1>
      <p>This stage is ready for the R2 pipeline content.</p>
    </section>
  );
}

export function BookLayout() {
  const { bookId, stage } = useParams<{ bookId: string; stage: string }>();

  if (!bookId) {
    return <Navigate to="/" replace />;
  }

  if (!isBookStage(stage)) {
    return <Navigate to={`/book/${bookId}`} replace />;
  }

  return (
    <section className="book-layout" aria-label="Book pipeline">
      <nav className="book-stage-tabs" aria-label="Book stages">
        {BOOK_STAGES.map((bookStage) => (
          <NavLink
            key={bookStage}
            to={`/book/${bookId}/${bookStage}`}
            className={({ isActive }) =>
              isActive ? 'book-stage-tabs__link book-stage-tabs__link--active' : 'book-stage-tabs__link'
            }
            onClick={() => setLastStage(bookId, bookStage)}
          >
            {BOOK_STAGE_LABELS[bookStage]}
          </NavLink>
        ))}
      </nav>

      <StagePlaceholder stage={stage} />
    </section>
  );
}
