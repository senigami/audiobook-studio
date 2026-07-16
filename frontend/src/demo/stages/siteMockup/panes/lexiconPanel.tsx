/**
 * siteMockup/panes/lexiconPanel.tsx — Mock pronunciation lexicon panel (task 013)
 *
 * Shows per-word phonetic entries scoped to book / series / global.
 * Most-specific-wins resolution: book > series > global.
 * Inherited (series/global) entries are read-only with an "inherited" badge.
 * book-scoped entries are editable with a scope selector.
 * A word that appears at multiple scopes shows the lower-priority entry
 * as overridden (struck-through, annotated "overridden by book").
 */
import React, { useState } from 'react';
import { Row, Col, SemanticChip, VoiceAttrPill, Btn, Card } from '../shared';
import { ChevronDown, Plus, X, Check } from 'lucide-react';

export type LexiconScope = 'book' | 'series' | 'global';

export interface LexiconEntry {
  id: string;
  word: string;
  phonetic: string;
  scope: LexiconScope;
}

// ---------- Seed data -------------------------------------------------------
// Demonstrates:
//   - One book-only entry: "Rowan" (a character name)
//   - One series entry: "Warden" (series-wide fix)
//   - One global entry: "loam" (universally mispronounced word)
//   - "vale" appears at two scopes (book overrides series) → shows resolution
const INITIAL_ENTRIES: LexiconEntry[] = [
  { id: 'e1', word: 'Rowan',  phonetic: 'ROH-an',       scope: 'book' },
  { id: 'e2', word: 'vale',   phonetic: 'VAYL',          scope: 'book' },
  { id: 'e3', word: 'Maren',  phonetic: 'MAIR-en',       scope: 'book' },
  { id: 'e4', word: 'vale',   phonetic: 'vahl',          scope: 'series' },
  { id: 'e5', word: 'Warden', phonetic: 'WAWRD-en',      scope: 'series' },
  { id: 'e6', word: 'loam',   phonetic: 'lohm',          scope: 'global' },
  { id: 'e7', word: 'cairn',  phonetic: 'KAIRN',         scope: 'global' },
];

// Scope precedence: lower index = more specific.
const SCOPE_RANK: Record<LexiconScope, number> = { book: 0, series: 1, global: 2 };

/** Returns the set of word→scope pairs that win, for the overridden-highlight logic. */
function getWinningScopes(entries: LexiconEntry[]): Map<string, LexiconScope> {
  const winners = new Map<string, LexiconScope>();
  for (const e of entries) {
    const existing = winners.get(e.word.toLowerCase());
    if (existing === undefined || SCOPE_RANK[e.scope] < SCOPE_RANK[existing]) {
      winners.set(e.word.toLowerCase(), e.scope);
    }
  }
  return winners;
}

// ---------- Scope badge -----------------------------------------------------
const ScopeBadge: React.FC<{ scope: LexiconScope; inherited?: boolean }> = ({ scope, inherited }) => {
  if (inherited) {
    return (
      <Row gap={4} style={{ alignItems: 'center' }}>
        <VoiceAttrPill category="extended">{scope}</VoiceAttrPill>
        <SemanticChip variant="neutral">inherited</SemanticChip>
      </Row>
    );
  }
  const variantMap: Record<LexiconScope, React.CSSProperties> = {
    book:   { background: 'var(--accent-tint-bg)',   border: '1px solid var(--accent-tint-border)',   color: 'var(--action-primary)' },
    series: { background: 'var(--pill-class-bg)',     border: '1px solid var(--pill-class-border)',     color: 'var(--pill-class-text)' },
    global: { background: 'var(--pill-age-bg)',       border: '1px solid var(--pill-age-border)',       color: 'var(--pill-age-text)' },
  };
  return (
    <span style={{
      fontSize: 'var(--type-micro)', padding: '2px 7px',
      borderRadius: 'var(--radius-round)', whiteSpace: 'nowrap',
      display: 'inline-flex', alignItems: 'center',
      ...variantMap[scope],
    }}>{scope}</span>
  );
};

// ---------- Scope selector dropdown -----------------------------------------
const ScopeSelector: React.FC<{
  value: LexiconScope;
  onChange: (s: LexiconScope) => void;
}> = ({ value, onChange }) => {
  const [open, setOpen] = useState(false);
  const scopes: LexiconScope[] = ['book', 'series', 'global'];
  return (
    <span style={{ position: 'relative', display: 'inline-flex' }}>
      <span
        role="button"
        tabIndex={0}
        aria-label="Select scope"
        onClick={(e) => { e.stopPropagation(); setOpen(v => !v); }}
        onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setOpen(v => !v); } }}
        style={{
          display: 'inline-flex', alignItems: 'center', gap: 3, cursor: 'pointer',
          fontSize: 'var(--type-micro)', padding: '2px 6px',
          borderRadius: 'var(--radius-round)',
          border: '1px solid var(--border)',
          background: 'var(--surface-alt)', color: 'var(--text-secondary)',
        }}
      >
        {value} <ChevronDown size={9} aria-hidden="true" />
      </span>
      {open && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, zIndex: 200,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-md)',
          minWidth: 80, padding: 'var(--space-1) 0', marginTop: 2,
        }}>
          {scopes.map(s => (
            <button
              key={s}
              type="button"
              onClick={(e) => { e.stopPropagation(); onChange(s); setOpen(false); }}
              style={{
                width: '100%', border: 0, background: s === value ? 'var(--accent-tint-bg)' : 'transparent',
                fontFamily: 'inherit', textAlign: 'left',
                fontSize: 'var(--type-micro)', padding: 'var(--space-1) var(--space-3)',
                cursor: 'pointer', color: s === value ? 'var(--action-primary)' : 'var(--text-primary)',
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}
    </span>
  );
};

// ---------- Single entry row ------------------------------------------------
const EntryRow: React.FC<{
  entry: LexiconEntry;
  isOverridden: boolean;
  onEdit: (id: string, word: string, phonetic: string, scope: LexiconScope) => void;
  onDelete: (id: string) => void;
}> = ({ entry, isOverridden, onEdit, onDelete }) => {
  const isInherited = entry.scope !== 'book';
  const [editing, setEditing] = useState(false);
  const [draftWord, setDraftWord] = useState(entry.word);
  const [draftPhonetic, setDraftPhonetic] = useState(entry.phonetic);
  const [draftScope, setDraftScope] = useState<LexiconScope>(entry.scope);

  const handleSave = () => {
    if (draftWord.trim() && draftPhonetic.trim()) {
      onEdit(entry.id, draftWord.trim(), draftPhonetic.trim(), draftScope);
    }
    setEditing(false);
  };

  const handleCancel = () => {
    setDraftWord(entry.word);
    setDraftPhonetic(entry.phonetic);
    setDraftScope(entry.scope);
    setEditing(false);
  };

  if (editing && !isInherited) {
    return (
      <Card style={{ padding: 'var(--space-2) var(--space-3)', marginBottom: 'var(--space-1)' }}>
        <Col gap={6}>
          <Row gap={6} style={{ alignItems: 'center' }}>
            <input
              value={draftWord}
              onChange={e => setDraftWord(e.target.value)}
              placeholder="word"
              style={{
                flex: 1, fontSize: 'var(--type-caption)', padding: '3px 6px',
                border: '1px solid var(--accent-tint-border)',
                borderRadius: 'var(--radius-button)',
                background: 'var(--accent-tint-bg)', color: 'var(--text-primary)',
                outline: 'none', fontFamily: 'inherit',
              }}
            />
            <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', flexShrink: 0 }}>→</span>
            <input
              autoFocus
              value={draftPhonetic}
              onChange={e => setDraftPhonetic(e.target.value)}
              placeholder="phonetic respelling"
              style={{
                flex: 1, fontSize: 'var(--type-caption)', padding: '3px 6px',
                border: '1px solid var(--accent-tint-border)',
                borderRadius: 'var(--radius-button)',
                background: 'var(--accent-tint-bg)', color: 'var(--text-primary)',
                outline: 'none', fontFamily: 'inherit', fontStyle: 'italic',
              }}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') handleCancel(); }}
            />
          </Row>
          <Row gap={6} style={{ alignItems: 'center' }}>
            <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>Scope:</span>
            <ScopeSelector value={draftScope} onChange={setDraftScope} />
            <div style={{ flex: 1 }} />
            <button
              type="button"
              onClick={handleSave}
              style={{
                background: 'var(--action-primary)', border: '1px solid var(--action-primary)',
                borderRadius: 'var(--radius-button)', padding: '2px 8px',
                color: 'var(--text-on-accent)', fontSize: 'var(--type-micro)',
                fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3,
                fontFamily: 'inherit',
              }}
            >
              <Check size={11} aria-hidden="true" /> Save
            </button>
            <button
              type="button"
              onClick={handleCancel}
              style={{
                background: 'none', border: '1px solid var(--border)',
                borderRadius: 'var(--radius-button)', padding: '2px 6px',
                color: 'var(--text-muted)', fontSize: 'var(--type-micro)',
                cursor: 'pointer', fontFamily: 'inherit',
              }}
            >
              Cancel
            </button>
          </Row>
        </Col>
      </Card>
    );
  }

  return (
    <div style={{
      display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
      padding: 'var(--space-1) var(--space-2)',
      borderRadius: 'var(--radius-button)',
      background: isOverridden ? 'var(--surface-alt)' : 'transparent',
      border: isOverridden ? '1px solid var(--hairline)' : '1px solid transparent',
      opacity: isOverridden ? 0.65 : 1,
      marginBottom: 2,
    }}>
      {/* Word → Phonetic */}
      <span style={{
        fontSize: 'var(--type-caption)', fontWeight: 600,
        color: isOverridden ? 'var(--text-muted)' : 'var(--text-primary)',
        textDecoration: isOverridden ? 'line-through' : 'none',
        minWidth: 64, flexShrink: 0,
      }}>
        {entry.word}
      </span>
      <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', flexShrink: 0 }}>→</span>
      <span style={{
        fontSize: 'var(--type-caption)', fontStyle: 'italic',
        color: isOverridden ? 'var(--text-muted)' : 'var(--text-secondary)',
        textDecoration: isOverridden ? 'line-through' : 'none',
        flex: 1, minWidth: 0,
      }}>
        {entry.phonetic}
      </span>

      {/* Scope badge or "overridden by book" annotation */}
      {isOverridden ? (
        <SemanticChip variant="warning">overridden by book</SemanticChip>
      ) : (
        <ScopeBadge scope={entry.scope} inherited={isInherited} />
      )}

      {/* Edit / delete — only for book-scoped entries that are not overridden */}
      {!isInherited && !isOverridden && (
        <Row gap={4} style={{ alignItems: 'center', flexShrink: 0 }}>
          <button
            type="button"
            aria-label={`Edit pronunciation for ${entry.word}`}
            onClick={() => setEditing(true)}
            style={{
              background: 'none', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-button)', padding: '1px 6px',
              color: 'var(--text-secondary)', fontSize: 'var(--type-micro)',
              cursor: 'pointer', fontFamily: 'inherit',
            }}
          >
            Edit
          </button>
          <button
            type="button"
            aria-label={`Delete pronunciation for ${entry.word}`}
            onClick={() => onDelete(entry.id)}
            style={{
              background: 'none', border: 'none', padding: '1px 2px',
              color: 'var(--text-muted)', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center',
            }}
          >
            <X size={13} aria-hidden="true" />
          </button>
        </Row>
      )}
    </div>
  );
};

// ---------- Add-entry form --------------------------------------------------
const AddEntryForm: React.FC<{ onAdd: (entry: Omit<LexiconEntry, 'id'>) => void; onCancel: () => void }> = ({ onAdd, onCancel }) => {
  const [word, setWord] = useState('');
  const [phonetic, setPhonetic] = useState('');
  const [scope, setScope] = useState<LexiconScope>('book');

  const handleSubmit = () => {
    if (word.trim() && phonetic.trim()) {
      onAdd({ word: word.trim(), phonetic: phonetic.trim(), scope });
      setWord('');
      setPhonetic('');
      setScope('book');
    }
  };

  return (
    <Card style={{ padding: 'var(--space-2) var(--space-3)', marginTop: 'var(--space-2)' }}>
      <Col gap={6}>
        <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 2 }}>
          New entry
        </div>
        <Row gap={6} style={{ alignItems: 'center' }}>
          <input
            autoFocus
            value={word}
            onChange={e => setWord(e.target.value)}
            placeholder="word"
            style={{
              flex: 1, fontSize: 'var(--type-caption)', padding: '3px 6px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-button)',
              background: 'var(--surface)', color: 'var(--text-primary)',
              outline: 'none', fontFamily: 'inherit',
            }}
          />
          <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', flexShrink: 0 }}>→</span>
          <input
            value={phonetic}
            onChange={e => setPhonetic(e.target.value)}
            placeholder="phonetic respelling"
            onKeyDown={e => { if (e.key === 'Enter') handleSubmit(); if (e.key === 'Escape') onCancel(); }}
            style={{
              flex: 1, fontSize: 'var(--type-caption)', padding: '3px 6px',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-button)',
              background: 'var(--surface)', color: 'var(--text-primary)',
              outline: 'none', fontFamily: 'inherit', fontStyle: 'italic',
            }}
          />
        </Row>
        <Row gap={6} style={{ alignItems: 'center' }}>
          <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>Scope:</span>
          <ScopeSelector value={scope} onChange={setScope} />
          <div style={{ flex: 1 }} />
          <Btn small primary onClick={handleSubmit}>Add</Btn>
          <Btn small onClick={onCancel}>Cancel</Btn>
        </Row>
      </Col>
    </Card>
  );
};

// ---------- Main panel component -------------------------------------------
export const LexiconPanel: React.FC = () => {
  const [entries, setEntries] = useState<LexiconEntry[]>(INITIAL_ENTRIES);
  const [showAddForm, setShowAddForm] = useState(false);

  const winningScopes = getWinningScopes(entries);

  const handleEdit = (id: string, word: string, phonetic: string, scope: LexiconScope) => {
    setEntries(prev => prev.map(e => e.id === id ? { ...e, word, phonetic, scope } : e));
  };

  const handleDelete = (id: string) => {
    setEntries(prev => prev.filter(e => e.id !== id));
  };

  const handleAdd = (entry: Omit<LexiconEntry, 'id'>) => {
    const id = `e${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;
    setEntries(prev => [...prev, { ...entry, id }]);
    setShowAddForm(false);
  };

  // Group: book on top, then series, then global
  const grouped: Record<LexiconScope, LexiconEntry[]> = { book: [], series: [], global: [] };
  for (const e of entries) grouped[e.scope].push(e);

  const renderGroup = (scope: LexiconScope, label: string) => {
    const group = grouped[scope];
    if (group.length === 0) return null;
    return (
      <div key={scope} style={{ marginBottom: 'var(--space-2)' }}>
        <div style={{
          fontSize: 'var(--type-micro)', fontWeight: 700,
          letterSpacing: '0.08em', textTransform: 'uppercase',
          color: 'var(--text-muted)', padding: '2px 0 4px',
          borderBottom: '1px solid var(--hairline)', marginBottom: 'var(--space-1)',
        }}>
          {label}
        </div>
        {group.map(entry => {
          const winnerScope = winningScopes.get(entry.word.toLowerCase());
          const isOverridden = winnerScope !== undefined && winnerScope !== entry.scope;
          return (
            <EntryRow
              key={entry.id}
              entry={entry}
              isOverridden={isOverridden}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          );
        })}
      </div>
    );
  };

  return (
    <div style={{
      width: 280, flexShrink: 0,
      borderLeft: '1px solid var(--hairline)',
      background: 'var(--surface-alt)',
      display: 'flex', flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        padding: 'var(--space-2) var(--space-3)',
        borderBottom: '1px solid var(--hairline)',
        display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
        background: 'var(--surface)', flexShrink: 0,
      }}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-primary)' }}>
            Pronunciation Lexicon
          </div>
          <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', marginTop: 1 }}>
            book &gt; series &gt; global · {entries.length} entries
          </div>
        </div>
        <button
          type="button"
          aria-label="Add pronunciation entry"
          title="Add entry"
          onClick={() => setShowAddForm(v => !v)}
          style={{
            background: showAddForm ? 'var(--accent-tint-bg)' : 'var(--surface-alt)',
            border: `1px solid ${showAddForm ? 'var(--accent-tint-border)' : 'var(--border)'}`,
            borderRadius: 'var(--radius-button)', padding: '3px 7px',
            color: showAddForm ? 'var(--action-primary)' : 'var(--text-secondary)',
            cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3,
            fontSize: 'var(--type-micro)', fontFamily: 'inherit', fontWeight: 600,
          }}
        >
          <Plus size={11} aria-hidden="true" /> Add
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-2) var(--space-3)' }}>
        {/* Scope-resolution hint */}
        <div style={{
          fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontStyle: 'italic',
          marginBottom: 'var(--space-2)', lineHeight: 'var(--leading-normal)',
        }}>
          Most-specific wins: a book entry supersedes series or global for the same word.
          Inherited entries are read-only at this level.
        </div>

        {renderGroup('book', 'This book')}
        {renderGroup('series', 'Series (inherited)')}
        {renderGroup('global', 'Global (inherited)')}

        {showAddForm && (
          <AddEntryForm
            onAdd={handleAdd}
            onCancel={() => setShowAddForm(false)}
          />
        )}
      </div>
    </div>
  );
};
