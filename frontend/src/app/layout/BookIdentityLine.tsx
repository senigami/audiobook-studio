import { useSyncExternalStore } from 'react';
import { useMatch, useNavigate } from 'react-router-dom';
import { Image as ImageIcon } from 'lucide-react';
import {
  getBookIdentitySnapshot,
  subscribeBookIdentity,
} from '@/app/layout/bookIdentityStore';
import { formatLength } from '@/utils/format';

export function BookIdentityLine() {
  const match = useMatch('/book/:bookId/*');
  const identity = useSyncExternalStore(
    subscribeBookIdentity,
    getBookIdentitySnapshot,
    getBookIdentitySnapshot,
  );
  const navigate = useNavigate();

  if (!match || !identity) {
    return null;
  }

  const predictedLabel = identity.predictedSeconds === null
    ? 'Predicted unavailable'
    : `Predicted ${formatLength(identity.predictedSeconds)}`;

  return (
    <button
      type="button"
      className="book-identity-line"
      onClick={() => navigate(`/book/${identity.id}/publish`)}
      title="Edit book info in Publish"
      aria-label={`${identity.title} book identity`}
    >
      <span className="book-identity-line__cover" aria-hidden={!identity.coverUrl}>
        {identity.coverUrl ? (
          <img src={identity.coverUrl} alt={`${identity.title} cover`} />
        ) : (
          <ImageIcon aria-hidden="true" size={14} />
        )}
      </span>
      <span className="book-identity-line__text">
        <span className="book-identity-line__title">{identity.title}</span>
        {identity.author ? <span className="book-identity-line__meta">{identity.author}</span> : null}
        {identity.series ? <span className="book-identity-line__meta">{identity.series}</span> : null}
      </span>
      <span className="book-identity-line__chip">Runtime {formatLength(identity.runtimeSeconds)}</span>
      <span className="book-identity-line__chip">{predictedLabel}</span>
    </button>
  );
}
