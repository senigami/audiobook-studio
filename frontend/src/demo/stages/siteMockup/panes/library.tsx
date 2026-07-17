/**
 * siteMockup/panes/library.tsx — Library pane
 * Feature A: grid/list view toggle, ActionMenu ⋯ on list rows (Open/Delete),
 *   "New Book" → Create modal (cover dropzone, Title, Author, Series, Cancel/Create),
 *   per-card ⋯ menu with Delete → confirm dialog (destructive red).
 *   Empty-state: icon + headline + primary CTA shown when no books exist.
 */
import React, { useState } from 'react';
import {
  BookOpen,
  Upload,
  MoreHorizontal,
  LayoutGrid,
  List,
  PlusCircle,
} from 'lucide-react';
import {
  Row, Col, SemanticChip, Btn, ProgressBar, StatusPill, BookCover, Card, Panel, PlayButton,
} from '../shared';

const LIBRARY_BOOKS: Array<{
  title: string;
  author: string;
  status: string;
  coverAspect?: 'square' | 'book';
}> = [
  { title: 'The Whispering Vale', author: 'E. Holloway', status: 'Studio' },
  { title: 'Echoes of Ember', author: 'R. Ashby', status: 'Review' },
  { title: 'Iron Meridian', author: 'S. Cross', status: 'Casting' },
  { title: 'The Silver Thread', author: 'A. Vance', status: 'Drafting', coverAspect: 'book' },
  { title: 'Starfall Compact', author: 'T. Wren', status: 'Published', coverAspect: 'book' },
  { title: 'Hollow Crown', author: 'D. Marsh', status: 'Drafting' },
];

// Discrete cover-display sizes (Finder-style). The slider snaps between these so
// the grid always lands on a clean column width. `col` drives the grid track,
// `cover` the BookCover size — they scale together.
const COVER_SIZES = [
  { col: 76, cover: 48 },
  { col: 92, cover: 64 },
  { col: 108, cover: 80 },
  { col: 124, cover: 96 },
  { col: 156, cover: 128 },
  { col: 188, cover: 160 },
  { col: 236, cover: 208 },
  { col: 284, cover: 256 },
  { col: 348, cover: 320 },
  { col: 412, cover: 384 },
  { col: 460, cover: 432 },
  { col: 540, cover: 512 },
];

// ---------- Create Book modal ----------
const CreateBookModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [title, setTitle] = useState('');
  const [seriesPosition, setSeriesPosition] = useState('');
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Create New Project"
      style={{
        position: 'fixed', inset: 0, zIndex: 200,
        background: 'var(--overlay-backdrop)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-panel)',
        padding: 'var(--space-4) var(--space-4)',
        width: 320,
        boxShadow: 'var(--shadow-xl)',
      }}>
        <div style={{ fontSize: 'var(--type-headline)', fontWeight: 'var(--type-weight-headline)' as unknown as number, color: 'var(--text-primary)', marginBottom: 'var(--space-3)' }}>
          Create New Project
        </div>
        {/* Cover dropzone */}
        <div style={{
          border: '1.5px dashed var(--border)',
          borderRadius: 'var(--radius-card)',
          height: 72,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 4, marginBottom: 'var(--space-3)',
          background: 'var(--surface-alt)', cursor: 'pointer',
        }}>
          <Upload size={18} color="var(--text-muted)" strokeWidth={1.5} />
          <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>Drop cover image or click to browse</span>
        </div>
        {/* Title */}
        <div style={{ marginBottom: 'var(--space-2)' }}>
          <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', marginBottom: 3 }}>
            Title <span style={{ color: 'var(--error)' }}>*</span>
          </div>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Book title…"
            aria-label="Book title"
            style={{
              width: '100%', boxSizing: 'border-box',
              fontSize: 'var(--type-micro)', padding: '5px 8px',
              borderRadius: 'var(--radius-button)', border: '1px solid var(--border)',
              background: 'var(--surface-alt)', color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
        </div>
        {/* Author */}
        <div style={{ marginBottom: 'var(--space-2)' }}>
          <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', marginBottom: 3 }}>Author</div>
          <input
            placeholder="Author name…"
            aria-label="Author name"
            style={{
              width: '100%', boxSizing: 'border-box',
              fontSize: 'var(--type-micro)', padding: '5px 8px',
              borderRadius: 'var(--radius-button)', border: '1px solid var(--border)',
              background: 'var(--surface-alt)', color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
        </div>
        {/* Series */}
        <div style={{ marginBottom: 'var(--space-2)' }}>
          <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', marginBottom: 3 }}>Series</div>
          <input
            placeholder="Series name (optional)…"
            aria-label="Series name"
            style={{
              width: '100%', boxSizing: 'border-box',
              fontSize: 'var(--type-micro)', padding: '5px 8px',
              borderRadius: 'var(--radius-button)', border: '1px solid var(--border)',
              background: 'var(--surface-alt)', color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
        </div>
        {/* Series position */}
        <div style={{ marginBottom: 'var(--space-3)' }}>
          <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', marginBottom: 3 }}>Series position</div>
          <input
            value={seriesPosition}
            onChange={e => setSeriesPosition(e.target.value)}
            placeholder="e.g. 1"
            aria-label="Series position"
            style={{
              width: '100%', boxSizing: 'border-box',
              fontSize: 'var(--type-micro)', padding: '5px 8px',
              borderRadius: 'var(--radius-button)', border: '1px solid var(--border)',
              background: 'var(--surface-alt)', color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
        </div>
        <Row gap={8} style={{ justifyContent: 'flex-end' }}>
          <Btn small onClick={onClose}>Cancel</Btn>
          <Btn small primary disabled={!title.trim()}>Create</Btn>
        </Row>
      </div>
    </div>
  );
};

// ---------- Delete confirm dialog ----------
const DeleteConfirmDialog: React.FC<{ bookTitle: string; onClose: () => void }> = ({ bookTitle, onClose }) => (
  <div
    role="dialog"
    aria-modal="true"
    aria-label="Delete book confirmation"
    style={{
      position: 'fixed', inset: 0, zIndex: 210,
      background: 'var(--overlay-backdrop)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}
    onClick={e => { if (e.target === e.currentTarget) onClose(); }}
  >
    <div style={{
      background: 'var(--surface)',
      border: '1px solid var(--error-tint-border)',
      borderRadius: 'var(--radius-panel)', padding: 'var(--space-4) var(--space-4)', width: 280,
      boxShadow: 'var(--shadow-xl)',
    }}>
      <div style={{ fontSize: 'var(--type-headline)', fontWeight: 'var(--type-weight-headline)' as unknown as number, color: 'var(--error)', marginBottom: 6 }}>Delete book?</div>
      <div style={{ fontSize: 'var(--type-caption)', color: 'var(--text-secondary)', marginBottom: 'var(--space-3)', lineHeight: 1.5 }}>
        <strong style={{ color: 'var(--text-primary)' }}>{bookTitle}</strong> and all its chapters, audio, and renders will be permanently deleted. This cannot be undone.
      </div>
      <Row gap={8} style={{ justifyContent: 'flex-end' }}>
        <Btn small onClick={onClose}>Cancel</Btn>
        <Btn small onClick={onClose} style={{ background: 'var(--error)', border: '1px solid var(--error-tint-border)', color: 'var(--text-on-accent)' }}>Delete permanently</Btn>
      </Row>
    </div>
  </div>
);

// ---------- Shared action menu (CardMenu + ListRowMenu merged) ----------
const BookActionMenu: React.FC<{
  onClose: () => void;
  onDelete: () => void;
  onOpen: () => void;
  style?: React.CSSProperties;
}> = ({ onClose, onDelete, onOpen, style }) => (
  <div
    style={{
      position: 'absolute', top: '100%', right: 0, zIndex: 50,
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-button)', boxShadow: 'var(--shadow-lg)',
      minWidth: 120, padding: '4px 0',
      ...style,
    }}
    onClick={e => e.stopPropagation()}
  >
    <div
      onClick={() => { onOpen(); onClose(); }}
      style={{ fontSize: 'var(--type-caption)', padding: '5px 12px', cursor: 'pointer', color: 'var(--text-primary)' }}
    >
      Open
    </div>
    <div
      onClick={() => { onClose(); onDelete(); }}
      style={{ fontSize: 'var(--type-caption)', padding: '5px 12px', cursor: 'pointer', color: 'var(--error)' }}
    >
      Delete
    </div>
  </div>
);

// ---------- Library empty-state ----------
const LibraryEmptyState: React.FC<{ onNew: () => void }> = ({ onNew }) => (
  <div
    style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 'var(--space-3)',
      padding: 'var(--space-6) var(--space-4)',
      flex: 1,
    }}
  >
    <div style={{
      width: 56, height: 56,
      borderRadius: 'var(--radius-card)',
      background: 'var(--accent-tint-bg)',
      border: '1px solid var(--accent-tint-border)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <BookOpen size={28} color="var(--action-primary)" strokeWidth={1.5} />
    </div>
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 'var(--type-headline)', fontWeight: 'var(--type-weight-headline)' as unknown as number, color: 'var(--text-primary)', marginBottom: 6 }}>
        No projects yet
      </div>
      <div style={{ fontSize: 'var(--type-callout)', color: 'var(--text-secondary)', maxWidth: 260, lineHeight: 1.5 }}>
        Create a project to start turning text into audio.
      </div>
    </div>
    <Btn primary onClick={onNew} style={{ gap: 6, display: 'inline-flex', alignItems: 'center' }}>
      <PlusCircle size={14} strokeWidth={2} />
      New Project
    </Btn>
  </div>
);

export const LibraryPane: React.FC<{ onOpenBook: () => void }> = ({ onOpenBook }) => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [coverSizeIdx, setCoverSizeIdx] = useState(1);
  const coverSize = COVER_SIZES[coverSizeIdx];
  const coverWrapMin = Math.round(coverSize.cover * 1.34);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [openMenuBook, setOpenMenuBook] = useState<string | null>(null);
  const [deletingBook, setDeletingBook] = useState<string | null>(null);
  // Demo toggle: set to true to preview empty-state
  const [showEmpty] = useState(false);
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening';

  return (
    <>
      {showCreateModal && <CreateBookModal onClose={() => setShowCreateModal(false)} />}
      {deletingBook && <DeleteConfirmDialog bookTitle={deletingBook} onClose={() => setDeletingBook(null)} />}

      <Col gap={0} className="ns-enter" style={{ padding: 'var(--space-4)', flex: 1, overflowY: 'auto' }}>
        {/* Greeting + action row */}
        <Row gap={8} style={{ alignItems: 'flex-start', marginBottom: 'var(--space-4)' }}>
          <Col gap={4} style={{ flex: 1 }}>
            <div style={{
              fontSize: 'var(--type-large-title)',
              fontWeight: 700,
              letterSpacing: 'var(--tracking-tight)',
              color: 'var(--text-primary)',
              lineHeight: 'var(--leading-tight)',
            }}>
              {greeting}
            </div>
            <div style={{
              fontSize: 'var(--type-callout)',
              color: 'var(--text-secondary)',
              lineHeight: 'var(--leading-snug)',
            }}>
              Your audiobook projects
            </div>
          </Col>
          <Btn primary onClick={() => setShowCreateModal(true)} style={{ flexShrink: 0, marginTop: 4 }}>
            <PlusCircle size={14} strokeWidth={2} style={{ marginRight: 4 }} />
            New Project
          </Btn>
        </Row>

        {showEmpty ? (
          <LibraryEmptyState onNew={() => setShowCreateModal(true)} />
        ) : (
          <>
            {/* CONTINUE section */}
            <div style={{
              fontSize: 'var(--type-micro)',
              fontWeight: 700,
              letterSpacing: 'var(--tracking-wide)',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              marginBottom: 'var(--space-2)',
            }}>
              Continue
            </div>
            <Row gap={12} style={{ marginBottom: 'var(--space-5)' }}>
              {[
                {
                  title: 'The Whispering Vale',
                  author: 'E. Holloway',
                  series: 'The Vale Cycle · #1',
                  statusLine: 'Studio · 6 of 7 chapters rendered',
                  pct: 64,
                  eta: '12m left',
                },
                {
                  title: 'Echoes of Ember',
                  author: 'R. Ashby',
                  series: 'Ember Sequence · #2',
                  statusLine: 'Review · 3 notes open',
                  pct: null as number | null,
                  eta: null as string | null,
                },
              ].map(book => (
                <Card
                  key={book.title}
                  interactive
                  onClick={onOpenBook}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: 'var(--space-3)',
                    cursor: 'pointer',
                    display: 'flex',
                    gap: 'var(--space-3)',
                    alignItems: 'flex-start',
                  }}
                >
                  {/* Cover thumbnail */}
                  <BookCover title={book.title} size={52} style={{ borderRadius: 'var(--radius-button)', flexShrink: 0 }} />
                  <Col gap={3} style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--type-callout)', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 'var(--leading-snug)' }}>
                      {book.title}
                    </div>
                    <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>{book.author}</div>
                    <div style={{ fontSize: 'var(--type-micro)', color: 'var(--action-primary)', fontStyle: 'italic', lineHeight: 1.2 }}>
                      {book.series}
                    </div>
                    <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', marginTop: 1 }}>
                      {book.statusLine}
                    </div>
                    {book.pct !== null && (
                      <Row gap={6} style={{ alignItems: 'center', marginTop: 1 }}>
                        <ProgressBar pct={book.pct} height={3} />
                        <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', flexShrink: 0 }}>
                          {book.eta}
                        </span>
                      </Row>
                    )}
                  </Col>
                </Card>
              ))}
            </Row>

            {/* ALL BOOKS header row */}
            <Row gap={8} style={{ alignItems: 'center', marginBottom: 'var(--space-2)' }}>
              <div style={{
                fontSize: 'var(--type-micro)',
                fontWeight: 700,
                letterSpacing: 'var(--tracking-wide)',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
              }}>
                All Books
              </div>
              <div style={{ flex: 1 }} />
              {/* Sort chips */}
              <Row gap={4} style={{ alignItems: 'center' }}>
                {['Recent', 'A–Z', 'In Progress'].map((c, i) => (
                  <SemanticChip key={c} variant={i === 0 ? 'accent' : 'neutral'}>{c}</SemanticChip>
                ))}
              </Row>
              {/* Cover-size slider (grid view only) — Finder-style icon-size control */}
              {viewMode === 'grid' && (
                <div className="ns-size-control" role="group" aria-label="Cover size" style={{ marginLeft: 'var(--space-2)' }}>
                  <button
                    type="button"
                    className="ns-size-glyph"
                    aria-label="Smallest covers"
                    title="Smaller"
                    onClick={() => setCoverSizeIdx(0)}
                    style={{ width: 9, height: 9 }}
                  />
                  <div className="ns-size-slider-wrap">
                    <div className="ns-size-track" aria-hidden="true" />
                    {COVER_SIZES.map((_, i) => (
                      <span
                        key={i}
                        className="ns-size-tick"
                        aria-hidden="true"
                        style={{ left: `calc(7px + ${i / (COVER_SIZES.length - 1)} * (100% - 14px))` }}
                      />
                    ))}
                    <input
                      type="range"
                      className="ns-size-slider"
                      min={0}
                      max={COVER_SIZES.length - 1}
                      step={1}
                      value={coverSizeIdx}
                      onChange={e => setCoverSizeIdx(Number(e.target.value))}
                      aria-label="Cover size"
                      title="Cover size"
                    />
                  </div>
                  <button
                    type="button"
                    className="ns-size-glyph"
                    aria-label="Largest covers"
                    title="Larger"
                    onClick={() => setCoverSizeIdx(COVER_SIZES.length - 1)}
                    style={{ width: 15, height: 15 }}
                  />
                </div>
              )}
              {/* View toggle */}
              <div style={{
                display: 'flex',
                gap: 2,
                background: 'var(--surface-alt)',
                border: 'var(--hairline)',
                borderRadius: 'var(--radius-button)',
                padding: 2,
                marginLeft: 'var(--space-1)',
              }}>
                <div
                  onClick={() => setViewMode('grid')}
                  title="Grid view"
                  aria-label="Grid view"
                  style={{
                    padding: '3px 6px',
                    borderRadius: 'var(--radius-button)',
                    cursor: 'pointer',
                    border: viewMode === 'grid' ? '1px solid var(--accent-tint-border)' : '1px solid transparent',
                    background: viewMode === 'grid' ? 'var(--accent-tint-bg)' : 'transparent',
                    color: viewMode === 'grid' ? 'var(--action-primary)' : 'var(--text-muted)',
                    display: 'flex', alignItems: 'center',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                >
                  <LayoutGrid size={13} strokeWidth={1.8} />
                </div>
                <div
                  onClick={() => setViewMode('list')}
                  title="List view"
                  aria-label="List view"
                  style={{
                    padding: '3px 6px',
                    borderRadius: 'var(--radius-button)',
                    cursor: 'pointer',
                    border: viewMode === 'list' ? '1px solid var(--accent-tint-border)' : '1px solid transparent',
                    background: viewMode === 'list' ? 'var(--accent-tint-bg)' : 'transparent',
                    color: viewMode === 'list' ? 'var(--action-primary)' : 'var(--text-muted)',
                    display: 'flex', alignItems: 'center',
                    transition: 'background 0.15s, color 0.15s',
                  }}
                >
                  <List size={13} strokeWidth={1.8} />
                </div>
              </div>
            </Row>

            {viewMode === 'grid' ? (
              <div
                className="ns-stagger ns-library-grid"
                style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(auto-fill, minmax(${coverSize.col}px, 1fr))`,
                  gap: 'var(--space-3)',
                }}
              >
                {LIBRARY_BOOKS.map((book) => (
                  <Card
                    key={book.title}
                    interactive
                    onClick={onOpenBook}
                    style={{
                      padding: 'var(--space-2) var(--space-2) var(--space-2)',
                      textAlign: 'center',
                      cursor: 'pointer',
                      position: 'relative',
                      minHeight: coverWrapMin + 86,
                    }}
                  >
                    {/* ⋯ menu trigger */}
                    <div
                      onClick={e => { e.stopPropagation(); setOpenMenuBook(openMenuBook === book.title ? null : book.title); }}
                      style={{
                        position: 'absolute', top: 4, right: 4,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'var(--text-muted)', cursor: 'pointer',
                        padding: '1px 2px', lineHeight: 1, borderRadius: 'var(--radius-button)',
                        background: 'transparent',
                      }}
                      aria-label={`More actions for ${book.title}`}
                    >
                      <MoreHorizontal size={13} strokeWidth={2} />
                    </div>
                    {openMenuBook === book.title && (
                      <BookActionMenu
                        onClose={() => setOpenMenuBook(null)}
                        onDelete={() => setDeletingBook(book.title)}
                        onOpen={onOpenBook}
                      />
                    )}
                    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'flex-end', minHeight: coverWrapMin, marginBottom: 8 }}>
                      {/* Hover-reveal ▶ to play the book (transport then lives in the bottom bar). */}
                      <div className="ns-cover-wrap" style={{ position: 'relative', display: 'inline-flex' }}>
                        <BookCover title={book.title} aspect={book.coverAspect ?? 'square'} size={coverSize.cover} />
                        <span className="ns-cover-play">
                          <PlayButton label={`Play book ${book.title}`} tone="overlay" size={18} />
                        </span>
                      </div>
                    </div>
                    <div style={{
                      fontSize: 'var(--type-micro)',
                      fontWeight: 600,
                      color: 'var(--text-primary)',
                      marginTop: 4,
                      lineHeight: 1.3,
                      display: '-webkit-box',
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: 'vertical',
                      overflow: 'hidden',
                    }}>
                      {book.title}
                    </div>
                    <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', marginTop: 1 }}>
                      {book.author}
                    </div>
                    <div style={{ marginTop: 5, display: 'flex', justifyContent: 'center' }}>
                      <StatusPill status={book.status} />
                    </div>
                  </Card>
                ))}
              </div>
            ) : (
              /* List view */
              <Panel style={{ overflow: 'hidden', padding: 0 }}>
                {/* Header */}
                <Row gap={0} style={{ padding: 'var(--space-1) var(--space-3)', borderBottom: 'var(--hairline)', background: 'var(--surface-alt)' }}>
                  {['Title', 'Author', 'Status', ''].map((h, i) => (
                    <div key={i} style={{
                      fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)',
                      textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)',
                      flex: i === 0 ? 3 : i === 3 ? 0 : 1,
                      width: i === 3 ? 28 : undefined,
                    }}>
                      {h}
                    </div>
                  ))}
                </Row>
                {LIBRARY_BOOKS.map((book, i) => (
                  <div
                    key={book.title}
                    onClick={onOpenBook}
                    style={{
                      display: 'flex', alignItems: 'center', padding: 'var(--space-2) var(--space-3)',
                      borderBottom: i < LIBRARY_BOOKS.length - 1 ? 'var(--hairline)' : 'none',
                      cursor: 'pointer', gap: 0, position: 'relative',
                    }}
                  >
                    <Row gap={6} style={{ flex: 3, alignItems: 'center', minWidth: 0 }}>
                      <BookCover title={book.title} size={24} />
                      <span style={{ fontSize: 'var(--type-caption)', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {book.title}
                      </span>
                    </Row>
                    <span style={{ flex: 1, fontSize: 'var(--type-caption)', color: 'var(--text-muted)' }}>{book.author}</span>
                    <div style={{ flex: 1 }}><StatusPill status={book.status} /></div>
                    {/* ⋯ action menu */}
                    <div style={{ width: 28, flexShrink: 0, position: 'relative', display: 'flex', justifyContent: 'center' }}>
                      <span
                        onClick={e => { e.stopPropagation(); setOpenMenuBook(openMenuBook === book.title ? null : book.title); }}
                        style={{ display: 'flex', alignItems: 'center', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 4px' }}
                        aria-label={`More actions for ${book.title}`}
                      >
                        <MoreHorizontal size={14} strokeWidth={2} />
                      </span>
                      {openMenuBook === book.title && (
                        <BookActionMenu
                          onClose={() => setOpenMenuBook(null)}
                          onDelete={() => setDeletingBook(book.title)}
                          onOpen={onOpenBook}
                        />
                      )}
                    </div>
                  </div>
                ))}
              </Panel>
            )}
          </>
        )}
      </Col>
    </>
  );
};
