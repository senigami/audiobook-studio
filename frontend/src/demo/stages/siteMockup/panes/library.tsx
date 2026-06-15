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
  Row, Col, Label, SemanticChip, Btn, ProgressBar, StatusPill, BookCover, Card, Panel,
} from '../shared';

const LIBRARY_BOOKS = [
  { title: 'The Whispering Vale', author: 'E. Holloway', status: 'Studio' },
  { title: 'Echoes of Ember', author: 'R. Ashby', status: 'Review' },
  { title: 'Iron Meridian', author: 'S. Cross', status: 'Casting' },
  { title: 'The Silver Thread', author: 'A. Vance', status: 'Drafting' },
  { title: 'Starfall Compact', author: 'T. Wren', status: 'Published' },
  { title: 'Hollow Crown', author: 'D. Marsh', status: 'Drafting' },
];

// ---------- Create Book modal ----------
const CreateBookModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [title, setTitle] = useState('');
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="New Book"
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
        padding: '18px 20px',
        width: 320,
        boxShadow: 'var(--shadow-xl)',
      }}>
        <div style={{ fontSize: 'var(--type-headline)', fontWeight: 'var(--type-weight-headline)' as unknown as number, color: 'var(--text-primary)', marginBottom: 14 }}>
          New Book
        </div>
        {/* Cover dropzone */}
        <div style={{
          border: '1.5px dashed var(--border)',
          borderRadius: 'var(--radius-card)',
          height: 72,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 4, marginBottom: 12,
          background: 'var(--surface-alt)', cursor: 'pointer',
        }}>
          <Upload size={18} color="var(--text-muted)" strokeWidth={1.5} />
          <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>Drop cover image or click to browse</span>
        </div>
        {/* Title */}
        <div style={{ marginBottom: 8 }}>
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
        <div style={{ marginBottom: 8 }}>
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
        <div style={{ marginBottom: 14 }}>
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
      borderRadius: 'var(--radius-panel)', padding: '18px 20px', width: 280,
      boxShadow: 'var(--shadow-xl)',
    }}>
      <div style={{ fontSize: 'var(--type-headline)', fontWeight: 'var(--type-weight-headline)' as unknown as number, color: 'var(--error)', marginBottom: 6 }}>Delete book?</div>
      <div style={{ fontSize: 'var(--type-caption)', color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5 }}>
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
      gap: 12,
      padding: '48px 24px',
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
      <BookOpen size={28} color="var(--accent)" strokeWidth={1.5} />
    </div>
    <div style={{ textAlign: 'center' }}>
      <div style={{ fontSize: 'var(--type-headline)', fontWeight: 'var(--type-weight-headline)' as unknown as number, color: 'var(--text-primary)', marginBottom: 6 }}>
        No books yet
      </div>
      <div style={{ fontSize: 'var(--type-callout)', color: 'var(--text-secondary)', maxWidth: 260, lineHeight: 1.5 }}>
        Create your first audiobook project. Import a manuscript and start casting voices.
      </div>
    </div>
    <Btn primary onClick={onNew} style={{ gap: 6, display: 'inline-flex', alignItems: 'center' }}>
      <PlusCircle size={14} strokeWidth={2} />
      New book
    </Btn>
  </div>
);

export const LibraryPane: React.FC<{ onOpenBook: () => void }> = ({ onOpenBook }) => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [openMenuBook, setOpenMenuBook] = useState<string | null>(null);
  const [deletingBook, setDeletingBook] = useState<string | null>(null);
  // Demo toggle: set to true to preview empty-state
  const [showEmpty] = useState(false);

  return (
    <>
      {showCreateModal && <CreateBookModal onClose={() => setShowCreateModal(false)} />}
      {deletingBook && <DeleteConfirmDialog bookTitle={deletingBook} onClose={() => setDeletingBook(null)} />}

      <Col gap={10} style={{ padding: 14, flex: 1, overflowY: 'auto' }}>
        <Row gap={8} style={{ alignItems: 'center' }}>
          <div style={{ flex: 1, fontSize: 'var(--type-headline)', fontWeight: 'var(--type-weight-headline)' as unknown as number, color: 'var(--text-primary)' }}>
            Good evening, Steven
          </div>
          <Btn primary onClick={() => setShowCreateModal(true)}>+ New Book</Btn>
        </Row>

        {showEmpty ? (
          <LibraryEmptyState onNew={() => setShowCreateModal(true)} />
        ) : (
          <>
            <Label>Continue</Label>
            <Row gap={8}>
              {[
                {
                  title: 'The Whispering Vale',
                  author: 'E. Holloway',
                  series: 'The Vale Cycle · #1',
                  statusLine: 'Studio · Chapter 7 rendering',
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
                  onClick={onOpenBook}
                  style={{
                    flex: 1,
                    minWidth: 0,
                    padding: '9px 11px',
                    cursor: 'pointer',
                    display: 'flex',
                    gap: 9,
                    alignItems: 'flex-start',
                  }}
                >
                  {/* Cover thumbnail */}
                  <BookCover title={book.title} size={50} style={{ borderRadius: 'var(--radius-button)' }} />
                  <Col gap={3} style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 'var(--type-callout)', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                      {book.title}
                    </div>
                    <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>{book.author}</div>
                    <div style={{ fontSize: 'var(--type-micro)', color: 'var(--accent)', fontStyle: 'italic', lineHeight: 1.2 }}>
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

            <Row gap={6} style={{ alignItems: 'center', marginTop: 4 }}>
              <Label>All Books</Label>
              <div style={{ flex: 1 }} />
              {['Recent', 'A–Z', 'In Progress'].map((c, i) => (
                <SemanticChip key={c} variant={i === 0 ? 'accent' : 'neutral'}>{c}</SemanticChip>
              ))}
              {/* View toggle buttons */}
              <div style={{ display: 'flex', gap: 2, marginLeft: 4 }}>
                <div
                  onClick={() => setViewMode('grid')}
                  title="Grid view"
                  aria-label="Grid view"
                  style={{
                    padding: '3px 6px', borderRadius: 'var(--radius-button)', cursor: 'pointer',
                    border: `1px solid ${viewMode === 'grid' ? 'var(--accent-tint-border)' : 'var(--border)'}`,
                    background: viewMode === 'grid' ? 'var(--accent-tint-bg)' : 'var(--surface-alt)',
                    color: viewMode === 'grid' ? 'var(--accent)' : 'var(--text-muted)',
                    display: 'flex', alignItems: 'center',
                  }}
                >
                  <LayoutGrid size={13} strokeWidth={1.8} />
                </div>
                <div
                  onClick={() => setViewMode('list')}
                  title="List view"
                  aria-label="List view"
                  style={{
                    padding: '3px 6px', borderRadius: 'var(--radius-button)', cursor: 'pointer',
                    border: `1px solid ${viewMode === 'list' ? 'var(--accent-tint-border)' : 'var(--border)'}`,
                    background: viewMode === 'list' ? 'var(--accent-tint-bg)' : 'var(--surface-alt)',
                    color: viewMode === 'list' ? 'var(--accent)' : 'var(--text-muted)',
                    display: 'flex', alignItems: 'center',
                  }}
                >
                  <List size={13} strokeWidth={1.8} />
                </div>
              </div>
            </Row>

            {viewMode === 'grid' ? (
              <div
                style={{
                  display: 'grid',
                  gridTemplateColumns: 'repeat(auto-fill, minmax(90px, 1fr))',
                  gap: 8,
                }}
              >
                {LIBRARY_BOOKS.map((book) => (
                  <Card
                    key={book.title}
                    onClick={onOpenBook}
                    style={{
                      padding: '9px 6px 7px',
                      textAlign: 'center',
                      cursor: 'pointer',
                      position: 'relative',
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
                    <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
                      <BookCover title={book.title} size={48} />
                    </div>
                    <div style={{ fontSize: 'var(--type-micro)', fontWeight: 600, color: 'var(--text-primary)', marginTop: 4, lineHeight: 1.3 }}>
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
                <Row gap={0} style={{ padding: '5px 10px', borderBottom: '1px solid var(--border)', background: 'var(--surface-alt)' }}>
                  {['Title', 'Author', 'Status', ''].map((h, i) => (
                    <div key={i} style={{
                      fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)',
                      textTransform: 'uppercase', letterSpacing: '0.06em',
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
                      display: 'flex', alignItems: 'center', padding: '6px 10px',
                      borderBottom: i < LIBRARY_BOOKS.length - 1 ? '1px solid var(--border)' : 'none',
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
