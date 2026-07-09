/**
 * LexiconPanel — reusable per-book pronunciation lexicon UI.
 *
 * Used in two places:
 *   1. LexiconStage (the /book/:id/lexicon tab) — wraps this component.
 *   2. ChapterWorkspace dockable panel — first of the "dockable workspace panels" pattern.
 *
 * Props: { projectId } — the book's project ID.  All API calls are scoped to it.
 * No context dependency so it can render outside BookDataProvider (e.g. future modals).
 */
import { useEffect, useRef, useState } from 'react';
import { Check, Plus, X } from 'lucide-react';
import { api } from '@/api';
import { ConfirmModal } from '@/components/overlays/ConfirmModal';
import { emitToast } from '@/utils/toast';
import type { LexiconEntry } from '@/types';

// ---------------------------------------------------------------------------
// Entry row — view + edit-in-place
// ---------------------------------------------------------------------------

interface EntryRowProps {
  entry: LexiconEntry;
  onEdit: (entryId: string, word: string, replacement: string) => Promise<void>;
  onDelete: (entryId: string) => void;
}

function EntryRow({ entry, onEdit, onDelete }: EntryRowProps) {
  const [editing, setEditing] = useState(false);
  const [draftWord, setDraftWord] = useState(entry.word);
  const [draftReplacement, setDraftReplacement] = useState(entry.replacement);
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    const w = draftWord.trim();
    const r = draftReplacement.trim();
    if (!w || !r) {
      emitToast('Enter a word and a respelling.');
      return;
    }
    setSaving(true);
    try {
      await onEdit(entry.id, w, r);
      setEditing(false);
    } catch (e) {
      emitToast((e as Error).message || 'Failed to save entry.');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setDraftWord(entry.word);
    setDraftReplacement(entry.replacement);
    setEditing(false);
  };

  if (editing) {
    return (
      <div
        className="lexicon-stage__entry lexicon-stage__entry--editing"
        aria-label={`Edit entry for ${entry.word}`}
      >
        <input
          className="lexicon-stage__input"
          value={draftWord}
          onChange={(e) => setDraftWord(e.target.value)}
          placeholder="word"
          aria-label="Word"
          disabled={saving}
        />
        <span className="lexicon-stage__arrow" aria-hidden="true">→</span>
        <input
          className="lexicon-stage__input lexicon-stage__input--replacement"
          autoFocus
          value={draftReplacement}
          onChange={(e) => setDraftReplacement(e.target.value)}
          placeholder="respelling"
          aria-label="Respelling"
          disabled={saving}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { void handleSave(); }
            if (e.key === 'Escape') { handleCancel(); }
          }}
        />
        <button
          type="button"
          className="lexicon-stage__action-btn lexicon-stage__action-btn--save"
          onClick={() => void handleSave()}
          disabled={saving}
          aria-label="Save entry"
        >
          <Check size={13} aria-hidden="true" />
        </button>
        <button
          type="button"
          className="lexicon-stage__action-btn"
          onClick={handleCancel}
          disabled={saving}
          aria-label="Cancel edit"
        >
          <X size={13} aria-hidden="true" />
        </button>
      </div>
    );
  }

  return (
    <div className="lexicon-stage__entry" role="listitem">
      <span className="lexicon-stage__word">{entry.word}</span>
      <span className="lexicon-stage__arrow" aria-hidden="true">→</span>
      <span className="lexicon-stage__replacement">{entry.replacement}</span>
      <button
        type="button"
        className="lexicon-stage__action-btn"
        onClick={() => setEditing(true)}
        aria-label={`Edit pronunciation for ${entry.word}`}
      >
        Edit
      </button>
      <button
        type="button"
        className="lexicon-stage__action-btn lexicon-stage__action-btn--delete"
        onClick={() => onDelete(entry.id)}
        aria-label={`Delete pronunciation for ${entry.word}`}
      >
        <X size={13} aria-hidden="true" />
      </button>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Add-entry form
// ---------------------------------------------------------------------------

interface AddEntryFormProps {
  onAdd: (word: string, replacement: string) => Promise<void>;
  onCancel: () => void;
}

function AddEntryForm({ onAdd, onCancel }: AddEntryFormProps) {
  const [word, setWord] = useState('');
  const [replacement, setReplacement] = useState('');
  const [saving, setSaving] = useState(false);
  const wordRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    wordRef.current?.focus();
  }, []);

  const handleSubmit = async () => {
    const w = word.trim();
    const r = replacement.trim();
    if (!w || !r) {
      emitToast('Enter a word and a respelling.');
      return;
    }
    setSaving(true);
    try {
      await onAdd(w, r);
    } catch (e) {
      emitToast((e as Error).message || 'Failed to add entry.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="lexicon-stage__add-form" aria-label="Add pronunciation entry">
      <div
        style={{
          fontSize: 'var(--type-micro)',
          fontWeight: 700,
          color: 'var(--text-secondary)',
          marginBottom: 'var(--space-1)',
        }}
      >
        New entry
      </div>
      <div className="lexicon-stage__entry lexicon-stage__entry--editing">
        <input
          ref={wordRef}
          className="lexicon-stage__input"
          value={word}
          onChange={(e) => setWord(e.target.value)}
          placeholder="word"
          aria-label="New word"
          disabled={saving}
        />
        <span className="lexicon-stage__arrow" aria-hidden="true">→</span>
        <input
          className="lexicon-stage__input lexicon-stage__input--replacement"
          value={replacement}
          onChange={(e) => setReplacement(e.target.value)}
          placeholder="respelling"
          aria-label="New respelling"
          disabled={saving}
          onKeyDown={(e) => {
            if (e.key === 'Enter') { void handleSubmit(); }
            if (e.key === 'Escape') { onCancel(); }
          }}
        />
        <button
          type="button"
          className="btn-primary lexicon-stage__submit-btn"
          onClick={() => void handleSubmit()}
          disabled={saving || !word.trim() || !replacement.trim()}
        >
          Add
        </button>
        <button
          type="button"
          className="btn-ghost lexicon-stage__cancel-btn"
          onClick={onCancel}
          disabled={saving}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// LexiconPanel — the shared implementation used by both the tab and the workspace
// ---------------------------------------------------------------------------

export interface LexiconPanelProps {
  /** The book/project ID whose lexicon to load and manage. */
  projectId: string;
}

export function LexiconPanel({ projectId }: LexiconPanelProps) {
  const [entries, setEntries] = useState<LexiconEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<LexiconEntry | null>(null);

  const loadEntries = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await api.fetchLexicon(projectId);
      setEntries(Array.isArray(data) ? data : []);
    } catch (e) {
      setError((e as Error).message ?? 'Failed to load lexicon');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadEntries();
  }, [projectId]);

  const handleAdd = async (word: string, replacement: string) => {
    const created = await api.addLexiconEntry(projectId, word, replacement);
    setEntries((prev) => [...prev, created]);
    setShowAddForm(false);
  };

  const handleEdit = async (entryId: string, word: string, replacement: string) => {
    const updated = await api.updateLexiconEntry(projectId, entryId, word, replacement);
    setEntries((prev) => prev.map((e) => (e.id === entryId ? updated : e)));
  };

  const handleDeleteConfirmed = async () => {
    if (!deleteTarget) return;
    await api.deleteLexiconEntry(projectId, deleteTarget.id);
    setEntries((prev) => prev.filter((e) => e.id !== deleteTarget.id));
    setDeleteTarget(null);
  };

  return (
    <section className="lexicon-stage" aria-label="Lexicon">
      {/* Header */}
      <div className="lexicon-stage__header">
        <div className="lexicon-stage__header-text">
          <h2
            style={{
              margin: 0,
              fontSize: 'var(--type-callout)',
              fontWeight: 700,
              color: 'var(--text-primary)',
            }}
          >
            Pronunciation Lexicon
          </h2>
          <p
            style={{
              margin: 0,
              fontSize: 'var(--type-caption)',
              color: 'var(--text-secondary)',
            }}
          >
            Words listed here are replaced with their respelling before synthesis.{' '}
            {!loading && `${entries.length} entr${entries.length === 1 ? 'y' : 'ies'}.`}
          </p>
        </div>
        <button
          type="button"
          className="btn-primary lexicon-stage__add-btn"
          onClick={() => setShowAddForm((v) => !v)}
          aria-pressed={showAddForm}
          style={{ display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)' }}
        >
          <Plus size={14} aria-hidden="true" /> Add entry
        </button>
      </div>

      {/* Add form */}
      {showAddForm && (
        <AddEntryForm
          onAdd={handleAdd}
          onCancel={() => setShowAddForm(false)}
        />
      )}

      {/* Body */}
      {loading ? (
        <p
          style={{
            margin: 'var(--space-4) 0',
            color: 'var(--text-muted)',
            fontSize: 'var(--type-body)',
          }}
        >
          Loading…
        </p>
      ) : error ? (
        <p
          role="alert"
          style={{
            margin: 'var(--space-4) 0',
            color: 'var(--error)',
            fontSize: 'var(--type-body)',
          }}
        >
          {error}
        </p>
      ) : entries.length === 0 ? (
        <p
          style={{
            margin: 'var(--space-4) 0',
            color: 'var(--text-muted)',
            fontSize: 'var(--type-body)',
          }}
        >
          No entries yet. Add one to control how a word is pronounced.
        </p>
      ) : (
        <div className="lexicon-stage__list" role="list">
          {entries.map((entry) => (
            <EntryRow
              key={entry.id}
              entry={entry}
              onEdit={handleEdit}
              onDelete={(id) => setDeleteTarget(entries.find((e) => e.id === id) ?? null)}
            />
          ))}
        </div>
      )}

      {/* Delete confirmation */}
      <ConfirmModal
        isOpen={deleteTarget !== null}
        title="Remove lexicon entry"
        message={
          deleteTarget
            ? `Remove the respelling for "${deleteTarget.word}" → "${deleteTarget.replacement}"? This cannot be undone.`
            : ''
        }
        confirmText="Remove"
        isDestructive
        onConfirm={() => void handleDeleteConfirmed()}
        onCancel={() => setDeleteTarget(null)}
      />
    </section>
  );
}
