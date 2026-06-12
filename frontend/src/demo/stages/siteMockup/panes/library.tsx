/**
 * siteMockup/panes/library.tsx — Library pane
 * Feature A: grid/list view toggle, ActionMenu ⋯ on list rows (Open/Delete),
 *   "New Book" → Create modal (cover dropzone, Title, Author, Series, Cancel/Create),
 *   per-card ⋯ menu with Delete → confirm dialog (destructive red).
 */
import React, { useState } from 'react';
import { Row, Col, Label, Chip, Btn, ProgressBar, StatusPill } from '../shared';

const LIBRARY_BOOKS = [
  { title: 'The Whispering Vale', author: 'E. Holloway', status: 'Studio', emoji: '📕' },
  { title: 'Echoes of Ember', author: 'R. Ashby', status: 'Review', emoji: '📗' },
  { title: 'Iron Meridian', author: 'S. Cross', status: 'Casting', emoji: '📘' },
  { title: 'The Silver Thread', author: 'A. Vance', status: 'Drafting', emoji: '📙' },
  { title: 'Starfall Compact', author: 'T. Wren', status: 'Published', emoji: '📒' },
  { title: 'Hollow Crown', author: 'D. Marsh', status: 'Drafting', emoji: '📓' },
];

// ---------- Create Book modal ----------
const CreateBookModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [title, setTitle] = useState('');
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'rgba(0,0,0,0.45)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--surface)',
        border: '1px solid var(--border)',
        borderRadius: 10,
        padding: '18px 20px',
        width: 320,
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>
          New Book
        </div>
        {/* Cover dropzone */}
        <div style={{
          border: '1.5px dashed var(--border)',
          borderRadius: 8,
          height: 72,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexDirection: 'column', gap: 3, marginBottom: 12,
          background: 'var(--surface-alt)', cursor: 'pointer',
        }}>
          <span style={{ fontSize: '1.5rem' }}>📁</span>
          <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>Drop cover image or click to browse</span>
        </div>
        {/* Title */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginBottom: 3 }}>Title <span style={{ color: '#ef4444' }}>*</span></div>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Book title…"
            style={{
              width: '100%', boxSizing: 'border-box',
              fontSize: '0.65rem', padding: '5px 8px',
              borderRadius: 5, border: '1px solid var(--border)',
              background: 'var(--surface-alt)', color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
        </div>
        {/* Author */}
        <div style={{ marginBottom: 8 }}>
          <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginBottom: 3 }}>Author</div>
          <input
            placeholder="Author name…"
            style={{
              width: '100%', boxSizing: 'border-box',
              fontSize: '0.65rem', padding: '5px 8px',
              borderRadius: 5, border: '1px solid var(--border)',
              background: 'var(--surface-alt)', color: 'var(--text-primary)',
              outline: 'none',
            }}
          />
        </div>
        {/* Series */}
        <div style={{ marginBottom: 14 }}>
          <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginBottom: 3 }}>Series</div>
          <input
            placeholder="Series name (optional)…"
            style={{
              width: '100%', boxSizing: 'border-box',
              fontSize: '0.65rem', padding: '5px 8px',
              borderRadius: 5, border: '1px solid var(--border)',
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
  <div style={{
    position: 'fixed', inset: 0, zIndex: 210,
    background: 'rgba(0,0,0,0.5)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }}>
    <div style={{
      background: 'var(--surface)',
      border: '1px solid #ef4444',
      borderRadius: 10, padding: '18px 20px', width: 280,
      boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
    }}>
      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: '#ef4444', marginBottom: 6 }}>Delete book?</div>
      <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', marginBottom: 14, lineHeight: 1.5 }}>
        <strong style={{ color: 'var(--text-primary)' }}>{bookTitle}</strong> and all its chapters, audio, and renders will be permanently deleted. This cannot be undone.
      </div>
      <Row gap={8} style={{ justifyContent: 'flex-end' }}>
        <Btn small onClick={onClose}>Cancel</Btn>
        <Btn small onClick={onClose} style={{ background: '#ef4444', border: '1px solid #dc2626', color: '#fff' }}>Delete permanently</Btn>
      </Row>
    </div>
  </div>
);

// ---------- Card action menu ----------
const CardMenu: React.FC<{ bookTitle: string; onClose: () => void; onDelete: () => void; onOpen: () => void }> = ({
  bookTitle: _bookTitle, onClose, onDelete, onOpen,
}) => (
  <div
    style={{
      position: 'absolute', top: '100%', right: 0, zIndex: 50,
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
      minWidth: 120, padding: '4px 0',
    }}
    onClick={e => e.stopPropagation()}
  >
    <div onClick={() => { onOpen(); onClose(); }} style={{ fontSize: '0.65rem', padding: '5px 12px', cursor: 'pointer', color: 'var(--text-primary)' }}>Open</div>
    <div onClick={() => { onClose(); onDelete(); }} style={{ fontSize: '0.65rem', padding: '5px 12px', cursor: 'pointer', color: '#ef4444' }}>Delete</div>
  </div>
);

// ---------- List row action menu ----------
const ListRowMenu: React.FC<{ onClose: () => void; onDelete: () => void; onOpen: () => void }> = ({ onClose, onDelete, onOpen }) => (
  <div
    style={{
      position: 'absolute', top: '100%', right: 0, zIndex: 50,
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
      minWidth: 120, padding: '4px 0',
    }}
    onClick={e => e.stopPropagation()}
  >
    <div onClick={() => { onOpen(); onClose(); }} style={{ fontSize: '0.65rem', padding: '5px 12px', cursor: 'pointer', color: 'var(--text-primary)' }}>Open</div>
    <div onClick={() => { onClose(); onDelete(); }} style={{ fontSize: '0.65rem', padding: '5px 12px', cursor: 'pointer', color: '#ef4444' }}>Delete</div>
  </div>
);

export const LibraryPane: React.FC<{ onOpenBook: () => void }> = ({ onOpenBook }) => {
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [openMenuBook, setOpenMenuBook] = useState<string | null>(null);
  const [deletingBook, setDeletingBook] = useState<string | null>(null);

  return (
    <>
      {showCreateModal && <CreateBookModal onClose={() => setShowCreateModal(false)} />}
      {deletingBook && <DeleteConfirmDialog bookTitle={deletingBook} onClose={() => setDeletingBook(null)} />}

      <Col gap={10} style={{ padding: 14, flex: 1, overflowY: 'auto' }}>
        <Row gap={8} style={{ alignItems: 'center' }}>
          <div style={{ flex: 1, fontSize: '0.9rem', fontWeight: 700, color: 'var(--text-primary)' }}>
            Good evening, Steven
          </div>
          <Btn primary onClick={() => setShowCreateModal(true)}>+ New Book</Btn>
        </Row>

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
              emoji: '📕',
            },
            {
              title: 'Echoes of Ember',
              author: 'R. Ashby',
              series: 'Ember Sequence · #2',
              statusLine: 'Review · 3 notes open',
              pct: null,
              eta: null,
              emoji: '📗',
            },
          ].map(book => (
            <div
              key={book.title}
              onClick={onOpenBook}
              style={{
                flex: 1,
                minWidth: 0,
                background: 'var(--surface-alt)',
                border: '1px solid var(--border)',
                borderRadius: 8,
                padding: '9px 11px',
                cursor: 'pointer',
                display: 'flex',
                gap: 9,
                alignItems: 'flex-start',
              }}
            >
              {/* Cover thumbnail */}
              <div style={{
                width: 36,
                height: 50,
                borderRadius: 4,
                background: 'linear-gradient(135deg, var(--accent-tint-bg) 0%, var(--border) 100%)',
                border: '1px solid var(--border)',
                flexShrink: 0,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.3rem',
                lineHeight: 1,
              }}>
                {book.emoji}
              </div>
              <Col gap={3} style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', lineHeight: 1.2 }}>
                  {book.title}
                </div>
                <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>{book.author}</div>
                <div style={{ fontSize: '0.57rem', color: 'var(--accent)', fontStyle: 'italic', lineHeight: 1.2 }}>
                  {book.series}
                </div>
                <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginTop: 1 }}>
                  {book.statusLine}
                </div>
                {book.pct !== null && (
                  <Row gap={6} style={{ alignItems: 'center', marginTop: 1 }}>
                    <ProgressBar pct={book.pct} height={3} />
                    <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', flexShrink: 0 }}>
                      {book.eta}
                    </span>
                  </Row>
                )}
              </Col>
            </div>
          ))}
        </Row>

        <Row gap={6} style={{ alignItems: 'center', marginTop: 4 }}>
          <Label>All Books</Label>
          <div style={{ flex: 1 }} />
          {['Recent', 'A–Z', 'In Progress'].map((c, i) => (
            <Chip key={c} active={i === 0}>{c}</Chip>
          ))}
          {/* View toggle buttons */}
          <div style={{ display: 'flex', gap: 2, marginLeft: 4 }}>
            <div
              onClick={() => setViewMode('grid')}
              title="Grid view"
              style={{
                padding: '2px 6px', borderRadius: '4px 0 0 4px', cursor: 'pointer', fontSize: '0.7rem',
                border: `1px solid ${viewMode === 'grid' ? 'var(--accent)' : 'var(--border)'}`,
                background: viewMode === 'grid' ? 'var(--accent-tint-bg)' : 'var(--surface-alt)',
                color: viewMode === 'grid' ? 'var(--accent)' : 'var(--text-muted)',
              }}
            >⊞</div>
            <div
              onClick={() => setViewMode('list')}
              title="List view"
              style={{
                padding: '2px 6px', borderRadius: '0 4px 4px 0', cursor: 'pointer', fontSize: '0.7rem',
                border: `1px solid ${viewMode === 'list' ? 'var(--accent)' : 'var(--border)'}`,
                borderLeft: 'none',
                background: viewMode === 'list' ? 'var(--accent-tint-bg)' : 'var(--surface-alt)',
                color: viewMode === 'list' ? 'var(--accent)' : 'var(--text-muted)',
              }}
            >☰</div>
          </div>
        </Row>

        {viewMode === 'grid' ? (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(82px, 1fr))',
              gap: 8,
            }}
          >
            {LIBRARY_BOOKS.map((book) => (
              <div
                key={book.title}
                onClick={onOpenBook}
                style={{
                  background: 'var(--surface-alt)',
                  border: '1px solid var(--border)',
                  borderRadius: 6,
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
                    fontSize: '0.65rem', color: 'var(--text-muted)', cursor: 'pointer',
                    padding: '0 3px', lineHeight: 1, borderRadius: 3,
                    background: 'transparent',
                  }}
                >⋯</div>
                {openMenuBook === book.title && (
                  <CardMenu
                    bookTitle={book.title}
                    onClose={() => setOpenMenuBook(null)}
                    onDelete={() => setDeletingBook(book.title)}
                    onOpen={onOpenBook}
                  />
                )}
                <div style={{ fontSize: '1.9rem', lineHeight: 1 }}>{book.emoji}</div>
                <div style={{ fontSize: '0.62rem', fontWeight: 600, color: 'var(--text-primary)', marginTop: 4, lineHeight: 1.3 }}>
                  {book.title}
                </div>
                <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginTop: 1 }}>
                  {book.author}
                </div>
                <div style={{ marginTop: 5 }}>
                  <StatusPill status={book.status} />
                </div>
              </div>
            ))}
          </div>
        ) : (
          /* List view */
          <Col gap={0} style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
            {/* Header */}
            <Row gap={0} style={{ padding: '5px 10px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
              {['Title', 'Author', 'Status', ''].map((h, i) => (
                <div key={i} style={{
                  fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-muted)',
                  textTransform: 'uppercase', letterSpacing: '0.06em',
                  flex: i === 0 ? 3 : i === 3 ? 0 : 1,
                  width: i === 3 ? 24 : undefined,
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
                  <span style={{ fontSize: '1rem' }}>{book.emoji}</span>
                  <span style={{ fontSize: '0.65rem', fontWeight: 600, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {book.title}
                  </span>
                </Row>
                <span style={{ flex: 1, fontSize: '0.6rem', color: 'var(--text-muted)' }}>{book.author}</span>
                <div style={{ flex: 1 }}><StatusPill status={book.status} /></div>
                {/* ⋯ action menu */}
                <div style={{ width: 24, flexShrink: 0, position: 'relative' }}>
                  <span
                    onClick={e => { e.stopPropagation(); setOpenMenuBook(openMenuBook === book.title ? null : book.title); }}
                    style={{ fontSize: '0.7rem', color: 'var(--text-muted)', cursor: 'pointer', padding: '0 4px' }}
                  >⋯</span>
                  {openMenuBook === book.title && (
                    <ListRowMenu
                      onClose={() => setOpenMenuBook(null)}
                      onDelete={() => setDeletingBook(book.title)}
                      onOpen={onOpenBook}
                    />
                  )}
                </div>
              </div>
            ))}
          </Col>
        )}
      </Col>
    </>
  );
};
