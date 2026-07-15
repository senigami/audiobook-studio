import { useSyncExternalStore } from 'react';
import { NavLink, useMatch, useNavigate } from 'react-router-dom';
import {
  getBookIdentitySnapshot,
  subscribeBookIdentity,
} from '@/app/layout/bookIdentityStore';
import { BOOK_STAGE_LABELS, BOOK_STAGES } from '@/pages/Book/lib/stages';

interface RailBookBlockProps {
  compact?: boolean;
}

export function RailBookBlock({ compact = false }: RailBookBlockProps) {
  const match = useMatch('/book/:bookId/*');
  const navigate = useNavigate();
  const identity = useSyncExternalStore(
    subscribeBookIdentity,
    getBookIdentitySnapshot,
    getBookIdentitySnapshot,
  );

  if (!match || !identity) {
    return null;
  }

  // Collapsed: show a single centred book cover thumbnail beneath the Library icon.
  if (compact) {
    return (
      <div
        className="rail-book-block rail-book-block--collapsed"
        title={identity.title}
        onClick={() => navigate(`/book/${identity.id}/publish`)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') navigate(`/book/${identity.id}/publish`); }}
        aria-label={`Open ${identity.title}`}
      >
        <span className="rail-book-block__cover-compact" aria-hidden="true">
          {identity.coverUrl ? <img src={identity.coverUrl} alt="" /> : null}
        </span>
      </div>
    );
  }

  return (
    <section className="rail-book-block" aria-label="Current book">
      {/* Book title row */}
      <button
        type="button"
        className="rail-book-block__header"
        onClick={() => navigate(`/book/${identity.id}/publish`)}
      >
        <span className="rail-book-block__cover" aria-hidden="true">
          {identity.coverUrl ? <img src={identity.coverUrl} alt="" /> : null}
        </span>
        <span className="rail-book-block__title">{identity.title}</span>
      </button>

      {/* Stage links — fixed set, no chapter expansion */}
      <div className="rail-book-block__stages" aria-label="Book stages">
        {BOOK_STAGES.map((stage) => (
          <NavLink
            key={stage}
            to={`/book/${identity.id}/${stage}`}
            className={({ isActive }) =>
              isActive ? 'rail-book-block__stage rail-book-block__stage--active' : 'rail-book-block__stage'
            }
          >
            {BOOK_STAGE_LABELS[stage]}
          </NavLink>
        ))}
      </div>
    </section>
  );
}
