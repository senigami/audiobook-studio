/**
 * siteMockup/panes/book.tsx — BookPane container, ManuscriptPane, CastingPane
 * Feature B: "+ New chapter" opens Add Chapter modal (Title, paste textarea, upload row, Cancel/Add)
 */
import React, { useState, useEffect } from 'react';
import {
  Row, Col, Label, Btn, ProgressBar,
  Card, Panel,
  SemanticChip, VoiceAttrPill,
  StatusOrb,
  Avatar,
  WaveformSvg,
  Mic, Volume2, CheckCircle, Loader2,
} from '../shared';
import { Upload, Lock, Edit3, Play, SkipBack, Rewind, FastForward, MoreHorizontal } from 'lucide-react';

// ---------------------------------------------------------------------------
// Manuscript pane data

type ChapterLifecycle = 'Draft' | 'Ready' | 'Cast' | 'Rendered';

const MANUSCRIPT_CHAPTERS: { n: number; title: string; words: number; lifecycle: ChapterLifecycle }[] = [
  { n: 1, title: 'The Hollow Road',       words: 2814, lifecycle: 'Rendered' },
  { n: 2, title: 'Ember in the Dark',     words: 3102, lifecycle: 'Rendered' },
  { n: 3, title: 'Voices Underground',    words: 2650, lifecycle: 'Rendered' },
  { n: 4, title: 'A Vale at Dusk',        words: 3440, lifecycle: 'Cast'     },
  { n: 5, title: 'Silver and Stone',      words: 2980, lifecycle: 'Ready'    },
  { n: 6, title: 'The Hollow Road',       words: 3210, lifecycle: 'Draft'    },
  { n: 7, title: 'Whispers at Threshold', words: 2775, lifecycle: 'Draft'    },
];

// Map lifecycle to SemanticChip variant
type SemanticVariant = 'success' | 'warning' | 'error' | 'cloud' | 'accent' | 'neutral';
const LIFECYCLE_VARIANT: Record<ChapterLifecycle, SemanticVariant> = {
  Draft:    'neutral',
  Ready:    'accent',
  Cast:     'cloud',
  Rendered: 'success',
};

// Map lifecycle to StatusOrb status
type OrbStatus = 'queued' | 'preparing' | 'running' | 'done' | 'failed' | 'idle';
const LIFECYCLE_ORB: Record<ChapterLifecycle, OrbStatus> = {
  Draft:    'idle',
  Ready:    'queued',
  Cast:     'preparing',
  Rendered: 'done',
};

const LifecyclePill: React.FC<{ lifecycle: ChapterLifecycle }> = ({ lifecycle }) => (
  <SemanticChip variant={LIFECYCLE_VARIANT[lifecycle]}>{lifecycle}</SemanticChip>
);

// ---------- Add Chapter modal ----------
const AddChapterModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [title, setTitle] = useState('');
  const [splitBy, setSplitBy] = useState('Markdown Header');
  const [enableCleanup, setEnableCleanup] = useState(true);

  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 200,
      background: 'var(--overlay-backdrop)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <Panel style={{ padding: '18px 20px', width: 340, boxShadow: 'var(--shadow-xl)' }}>
        <div style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>Add Chapter</div>
        {/* Title */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', marginBottom: 3 }}>Title</div>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Chapter title…"
            style={{
              width: '100%', boxSizing: 'border-box',
              fontSize: 'var(--type-micro)', padding: '5px 8px',
              borderRadius: 'var(--radius-button)', border: '1px solid var(--border)',
              background: 'var(--surface-alt)', color: 'var(--text-primary)', outline: 'none',
            }}
          />
        </div>
        {/* Paste textarea */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', marginBottom: 3 }}>Or paste text</div>
          <textarea
            rows={4}
            placeholder="Paste chapter text here…"
            style={{
              width: '100%', boxSizing: 'border-box',
              fontSize: 'var(--type-micro)', padding: '5px 8px',
              borderRadius: 'var(--radius-button)', border: '1px solid var(--border)',
              background: 'var(--surface-alt)', color: 'var(--text-primary)', outline: 'none',
              resize: 'vertical', lineHeight: 1.5,
            }}
          />
        </div>
        {/* Upload row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '5px 10px',
          border: '1px dashed var(--border)',
          borderRadius: 'var(--radius-card)', background: 'var(--surface-alt)', marginBottom: 10,
        }}>
          <Upload size={14} color="var(--text-muted)" aria-hidden="true" />
          <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', flex: 1 }}>or upload a file (.txt, .docx, .epub)</span>
          <Btn small>Choose file</Btn>
        </div>

        {/* Split rules configuration for imports */}
        <div style={{
          marginBottom: 14,
          padding: '8px 10px',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-card)',
          background: 'var(--surface-alt)',
        }}>
          <div style={{ fontSize: 'var(--type-micro)', fontWeight: 600, color: 'var(--text-secondary)', marginBottom: 6 }}>
            Import Settings (.txt, .docx, .epub)
          </div>
          <Row gap={8} style={{ alignItems: 'center', marginBottom: 6 }}>
            <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>Split by:</span>
            <select
              value={splitBy}
              onChange={e => setSplitBy(e.target.value)}
              style={{
                fontSize: 'var(--type-micro)',
                padding: '2px 4px',
                borderRadius: 'var(--radius-button)',
                border: '1px solid var(--border)',
                background: 'var(--surface)',
                color: 'var(--text-primary)',
                outline: 'none',
              }}
            >
              <option value="Markdown Header">Markdown Header</option>
              <option value="Regex Pattern">Regex Pattern</option>
              <option value="Word Count">Word Count (approx. 3000)</option>
              <option value="No Split">No Split (Single Chapter)</option>
            </select>
          </Row>
          <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={enableCleanup}
              onChange={e => setEnableCleanup(e.target.checked)}
              style={{ cursor: 'pointer' }}
            />
            <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>
              Enable cleanup regex
            </span>
          </label>
        </div>

        <Row gap={8} style={{ justifyContent: 'flex-end' }}>
          <Btn small onClick={onClose}>Cancel</Btn>
          <Btn small primary onClick={onClose}>Add</Btn>
        </Row>
      </Panel>
    </div>
  );
};

// ---------------------------------------------------------------------------
// ManuscriptPane

export const ManuscriptPane: React.FC<{ onSwitchToPublish: () => void }> = ({ onSwitchToPublish: _onSwitchToPublish }) => {
  const [selectedChapterN, setSelectedChapterN] = useState<number>(6);
  const [unlockedChapters, setUnlockedChapters] = useState<Set<number>>(new Set());
  const [showWarning, setShowWarning] = useState<number | null>(null);
  const [focusMode, setFocusMode] = useState(false);
  const [showAddChapter, setShowAddChapter] = useState(false);

  // Chapters list and actions state
  const [chapters, setChapters] = useState(MANUSCRIPT_CHAPTERS);
  const [activeMenuChapter, setActiveMenuChapter] = useState<number | null>(null);

  // Title renaming state
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editTitleVal, setEditTitleVal] = useState('');

  // Close row actions menu on click elsewhere
  useEffect(() => {
    const closeMenu = () => setActiveMenuChapter(null);
    document.addEventListener('click', closeMenu);
    return () => document.removeEventListener('click', closeMenu);
  }, []);

  const selectedChapter = chapters.find(c => c.n === selectedChapterN) || chapters[0] || {
    n: 1, title: 'No Chapters', words: 0, lifecycle: 'Draft'
  };
  const isProduced = selectedChapter.lifecycle === 'Cast' || selectedChapter.lifecycle === 'Rendered';
  const isUnlocked = unlockedChapters.has(selectedChapterN);
  const isEditable = !isProduced || isUnlocked;

  const handleChapterClick = (n: number) => {
    setSelectedChapterN(n);
    setShowWarning(null);
    setIsEditingTitle(false);
  };

  const handleEditClick = () => {
    setShowWarning(selectedChapterN);
  };

  const handleEditAnyway = () => {
    setUnlockedChapters(prev => new Set([...prev, selectedChapterN]));
    setShowWarning(null);
  };

  const handleSaveTitle = () => {
    if (editTitleVal.trim()) {
      setChapters(prev => prev.map(c => c.n === selectedChapterN ? { ...c, title: editTitleVal.trim() } : c));
    }
    setIsEditingTitle(false);
  };

  const toggleRowActionsMenu = (n: number) => {
    setActiveMenuChapter(prev => (prev === n ? null : n));
  };

  // Editor panel (right side)
  const EditorPanel = (
    <Col gap={0} style={{
      flex: 1,
      background: 'var(--surface-alt)',
      border: '1px solid var(--border)',
      borderRadius: 'var(--radius-card)',
      boxShadow: 'var(--shadow-sm)',
      overflow: 'hidden',
      minWidth: 0,
    }}>
      {/* Editor header */}
      <Row gap={6} style={{
        padding: '6px 10px',
        borderBottom: '1px solid var(--border)',
        background: 'var(--surface)',
        alignItems: 'center',
        flexShrink: 0,
      }}>
        {isEditingTitle ? (
          <input
            value={editTitleVal}
            onChange={e => setEditTitleVal(e.target.value)}
            onBlur={handleSaveTitle}
            onKeyDown={e => {
              if (e.key === 'Enter') handleSaveTitle();
              if (e.key === 'Escape') setIsEditingTitle(false);
            }}
            autoFocus
            style={{
              fontSize: 'var(--type-caption)',
              fontWeight: 700,
              color: 'var(--text-primary)',
              background: 'var(--surface-alt)',
              border: '1px solid var(--accent)',
              borderRadius: 'var(--radius-button)',
              padding: '2px 6px',
              outline: 'none',
              flex: 1,
              maxWidth: 300,
            }}
          />
        ) : (
          <span
            onDoubleClick={() => {
              setIsEditingTitle(true);
              setEditTitleVal(selectedChapter.title);
            }}
            title="Double click to rename"
            style={{
              fontSize: 'var(--type-caption)',
              fontWeight: 700,
              color: 'var(--text-primary)',
              flex: 1,
              cursor: 'pointer',
            }}
          >
            Ch {selectedChapter.n} · {selectedChapter.title} <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 'var(--type-micro)', marginLeft: 4 }}>(Double-click to rename)</span>
          </span>
        )}

        {/* Focus mode toggle */}
        <div
          onClick={() => setFocusMode(f => !f)}
          aria-label={focusMode ? 'Exit focus mode' : 'Enter focus mode'}
          style={{
            fontSize: 'var(--type-micro)',
            padding: '2px 7px',
            borderRadius: 'var(--radius-round)',
            cursor: 'pointer',
            border: `1px solid ${focusMode ? 'var(--accent)' : 'var(--border)'}`,
            background: focusMode ? 'var(--accent-tint-bg)' : 'transparent',
            color: focusMode ? 'var(--accent)' : 'var(--text-muted)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            whiteSpace: 'nowrap',
          }}
        >
          <Edit3 size={10} aria-hidden="true" />
          {focusMode ? 'Exit focus' : 'Focus'}
        </div>

        {/* Status chip */}
        {isEditable ? (
          <SemanticChip variant="success">
            <CheckCircle size={9} style={{ marginRight: 3 }} aria-hidden="true" />
            editing — autosaved
          </SemanticChip>
        ) : (
          <SemanticChip variant="neutral">
            <Lock size={9} style={{ marginRight: 3 }} aria-hidden="true" />
            read-only — cast &amp; rendered
          </SemanticChip>
        )}
      </Row>

      {/* Produced + unlocked amber strip */}
      {isProduced && isUnlocked && (
        <div style={{
          fontSize: 'var(--type-micro)',
          color: 'var(--warning-text)',
          background: 'var(--warning-tint-bg)',
          borderBottom: '1px solid var(--warning-tint-border)',
          padding: '3px 10px',
          flexShrink: 0,
        }}>
          editing a produced chapter
        </div>
      )}

      {/* Warning banner */}
      {showWarning === selectedChapterN && (
        <div style={{
          background: 'var(--warning-tint-bg)',
          border: '1px solid var(--warning-tint-border)',
          borderRadius: 0,
          padding: '8px 10px',
          flexShrink: 0,
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: 'var(--type-micro)', color: 'var(--warning-text)', marginBottom: 6, lineHeight: 1.5 }}>
            Editing re-analyzes this chapter. Voice assignments are matched best-effort — some may be lost.
          </div>
          <Row gap={6}>
            <div
              onClick={handleEditAnyway}
              style={{
                fontSize: 'var(--type-micro)', fontWeight: 700, padding: '3px 10px',
                borderRadius: 'var(--radius-button)',
                background: 'var(--warning)', border: '1px solid var(--warning)',
                color: 'var(--text-on-accent)', cursor: 'pointer',
              }}
            >
              Edit anyway
            </div>
            <div
              onClick={() => setShowWarning(null)}
              style={{
                fontSize: 'var(--type-micro)', fontWeight: 600, padding: '3px 10px',
                borderRadius: 'var(--radius-button)',
                background: 'var(--surface-alt)', border: '1px solid var(--border)',
                color: 'var(--text-secondary)', cursor: 'pointer',
              }}
            >
              Cancel
            </div>
          </Row>
        </div>
      )}

      {/* Editor body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '10px 12px' }}>
        {isEditable ? (
          <Col gap={8}>
            <div
              contentEditable
              suppressContentEditableWarning
              style={{
                fontSize: 'var(--type-callout)',
                lineHeight: 1.75,
                color: 'var(--text-primary)',
                outline: 'none',
                background: 'transparent',
                minHeight: 40,
              }}
            >
              The road wound down through silver birch and pale stone, the kind of road that remembers every foot that has ever crossed it. Maren pulled her cloak tighter against the chill that rose from the valley floor.
            </div>
            <div
              contentEditable
              suppressContentEditableWarning
              style={{
                fontSize: 'var(--type-callout)',
                lineHeight: 1.75,
                color: 'var(--text-primary)',
                outline: 'none',
                background: 'transparent',
                minHeight: 40,
              }}
            >
              The vale smelled of old rain and something older still — loam and iron and time. Far above, an owl called once, then fell silent.
            </div>
          </Col>
        ) : (
          <Col gap={8}>
            {[
              'The road wound down through silver birch and pale stone, the kind of road that remembers every foot that has ever crossed it.',
              'Maren pulled her cloak tighter against the chill that rose from the valley floor.',
              'The vale smelled of old rain and something older still — loam and iron and time.',
              'Far above, an owl called once, then fell silent.',
            ].map((line, i) => (
              <div key={i} style={{ fontSize: 'var(--type-callout)', lineHeight: 1.75, color: 'var(--text-secondary)' }}>
                {line}
              </div>
            ))}
          </Col>
        )}
      </div>

      {/* Footer: word count + edit button */}
      <div style={{
        padding: '5px 10px',
        borderTop: '1px solid var(--border)',
        background: 'var(--surface)',
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        flexShrink: 0,
      }}>
        <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', flex: 1 }}>
          1,842 words
        </span>
        {!isEditable && showWarning !== selectedChapterN && (
          <div
            onClick={handleEditClick}
            aria-label="Edit chapter text"
            style={{
              fontSize: 'var(--type-micro)', fontWeight: 600, padding: '2px 8px',
              borderRadius: 'var(--radius-button)',
              background: 'var(--surface-alt)', border: '1px solid var(--border)',
              color: 'var(--text-secondary)', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}
          >
            <Edit3 size={10} aria-hidden="true" />
            Edit text
          </div>
        )}
      </div>
    </Col>
  );

  // Focus mode
  if (focusMode) {
    return (
      <Col gap={0} style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-start', position: 'relative' }}>
        <div style={{
          fontSize: 'var(--type-micro)',
          color: 'var(--text-muted)',
          fontStyle: 'italic',
          padding: '3px 0 6px',
          alignSelf: 'flex-start',
        }}>
          rail auto-collapses in focus mode
        </div>
        <div style={{ width: '100%', maxWidth: 620, flex: 1, display: 'flex', flexDirection: 'column' }}>
          <Col gap={0} style={{
            flex: 1,
            background: 'var(--surface-alt)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-card)',
            boxShadow: 'var(--shadow-sm)',
            overflow: 'hidden',
          }}>
            <Row gap={6} style={{
              padding: '6px 10px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--surface)',
              alignItems: 'center',
              flexShrink: 0,
            }}>
              {isEditingTitle ? (
                <input
                  value={editTitleVal}
                  onChange={e => setEditTitleVal(e.target.value)}
                  onBlur={handleSaveTitle}
                  onKeyDown={e => {
                    if (e.key === 'Enter') handleSaveTitle();
                    if (e.key === 'Escape') setIsEditingTitle(false);
                  }}
                  autoFocus
                  style={{
                    fontSize: 'var(--type-caption)',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    background: 'var(--surface-alt)',
                    border: '1px solid var(--accent)',
                    borderRadius: 'var(--radius-button)',
                    padding: '2px 6px',
                    outline: 'none',
                    flex: 1,
                    maxWidth: 300,
                  }}
                />
              ) : (
                <span
                  onDoubleClick={() => {
                    setIsEditingTitle(true);
                    setEditTitleVal(selectedChapter.title);
                  }}
                  title="Double click to rename"
                  style={{
                    fontSize: 'var(--type-caption)',
                    fontWeight: 700,
                    color: 'var(--text-primary)',
                    flex: 1,
                    cursor: 'pointer',
                  }}
                >
                  Ch {selectedChapter.n} · {selectedChapter.title} <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 'var(--type-micro)', marginLeft: 4 }}>(Double-click to rename)</span>
                </span>
              )}
              <SemanticChip variant="success">
                <CheckCircle size={9} style={{ marginRight: 3 }} aria-hidden="true" />
                editing — autosaved
              </SemanticChip>
              <div
                onClick={() => setFocusMode(false)}
                aria-label="Exit focus mode"
                style={{
                  fontSize: 'var(--type-micro)', padding: '2px 7px',
                  borderRadius: 'var(--radius-round)', cursor: 'pointer',
                  border: '1px solid var(--accent)', background: 'var(--accent-tint-bg)',
                  color: 'var(--accent)', whiteSpace: 'nowrap',
                  display: 'inline-flex', alignItems: 'center', gap: 3,
                }}
              >
                <Edit3 size={10} aria-hidden="true" />
                Exit focus
              </div>
            </Row>
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
              <Col gap={10}>
                <div
                  contentEditable
                  suppressContentEditableWarning
                  style={{ fontSize: 'var(--type-body)', lineHeight: 1.85, color: 'var(--text-primary)', outline: 'none', background: 'transparent' }}
                >
                  The road wound down through silver birch and pale stone, the kind of road that remembers every foot that has ever crossed it. Maren pulled her cloak tighter against the chill that rose from the valley floor.
                </div>
                <div
                  contentEditable
                  suppressContentEditableWarning
                  style={{ fontSize: 'var(--type-body)', lineHeight: 1.85, color: 'var(--text-primary)', outline: 'none', background: 'transparent' }}
                >
                  The vale smelled of old rain and something older still — loam and iron and time. Far above, an owl called once, then fell silent.
                </div>
              </Col>
            </div>
            <div style={{ padding: '5px 10px', borderTop: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
              <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>1,842 words</span>
            </div>
          </Col>
        </div>
      </Col>
    );
  }

  return (
    <>
      {showAddChapter && <AddChapterModal onClose={() => setShowAddChapter(false)} />}
      <Col gap={8} style={{ flex: 1 }}>
        <Row gap={10} style={{ flex: 1, alignItems: 'stretch' }}>
          {/* Left: chapter table + compact import row */}
          <Col gap={6} style={{ flex: 2, minWidth: 0 }}>
            {/* + New chapter button */}
            <Row gap={6} style={{ alignItems: 'center' }}>
              <Btn small onClick={() => setShowAddChapter(true)}>+ New chapter</Btn>
            </Row>

            {/* Chapter table */}
            <Card style={{ overflow: 'hidden' }}>
              <Row gap={0} style={{ padding: '5px 10px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
                <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', flex: 0.5 }}>#</div>
                <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', flex: 3 }}>Title</div>
                <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1, textAlign: 'right' }}>Words</div>
                <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1.5, textAlign: 'right' }}>Stage</div>
                <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.06em', flex: 0.5, textAlign: 'right' }}></div>
              </Row>
              {chapters.map((ch, i) => {
                const isSelected = ch.n === selectedChapterN;
                return (
                  <Row
                    key={ch.n} gap={0}
                    onClick={() => handleChapterClick(ch.n)}
                    style={{
                      padding: '5px 10px',
                      borderBottom: i < chapters.length - 1 ? '1px solid var(--border)' : 'none',
                      alignItems: 'center', cursor: 'pointer',
                      background: isSelected ? 'var(--accent-tint-bg)' : 'transparent',
                      borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent',
                    }}
                  >
                    {/* StatusOrb replaces plain dot for chapter status */}
                    <div style={{ flex: 0.5, display: 'flex', alignItems: 'center', gap: 4 }}>
                      <StatusOrb status={LIFECYCLE_ORB[ch.lifecycle]} size={14} />
                      <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>{ch.n}</span>
                    </div>
                    <div style={{
                      fontSize: 'var(--type-caption)',
                      color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                      fontWeight: isSelected ? 700 : 500,
                      flex: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {ch.title}
                    </div>
                    <div style={{ fontSize: 'var(--type-caption)', color: 'var(--text-muted)', flex: 1, textAlign: 'right' }}>
                      {ch.words.toLocaleString()}
                    </div>
                    <div style={{ flex: 1.5, textAlign: 'right' }}>
                      <LifecyclePill lifecycle={ch.lifecycle} />
                    </div>
                    <div style={{ flex: 0.5, textAlign: 'right', position: 'relative' }}>
                      <button
                        type="button"
                        aria-label={`Chapter ${ch.n} actions`}
                        aria-expanded={activeMenuChapter === ch.n}
                        onClick={(e) => { e.stopPropagation(); toggleRowActionsMenu(ch.n); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '2px' }}
                      >
                        <MoreHorizontal size={14} />
                      </button>
                      {activeMenuChapter === ch.n && (
                        <div style={{
                          position: 'absolute', top: '100%', right: 0, zIndex: 100,
                          background: 'var(--surface)', border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-md)',
                          minWidth: 120, padding: '4px 0', textAlign: 'left'
                        }}>
                          {[
                            { label: 'Rebuild Audio', action: () => {
                              alert(`Rebuilding audio for Ch ${ch.n}`);
                              setChapters(prev => prev.map(c => c.n === ch.n ? { ...c, lifecycle: 'Rendered' } : c));
                            } },
                            { label: 'Export Chapter', action: () => alert(`Exported Ch ${ch.n} audio.`) },
                            { label: 'Reset Renders', action: () => {
                              setChapters(prev => prev.map(c => c.n === ch.n ? { ...c, lifecycle: 'Ready' } : c));
                            } },
                            { label: 'Delete', action: () => {
                              if (confirm(`Are you sure you want to delete Chapter ${ch.n}?`)) {
                                setChapters(prev => prev.filter(c => c.n !== ch.n));
                              }
                            }, isDestructive: true }
                          ].map(opt => (
                            <button
                              type="button"
                              key={opt.label}
                              onClick={(e) => { e.stopPropagation(); opt.action(); setActiveMenuChapter(null); }}
                              style={{
                                width: '100%',
                                border: 0,
                                background: 'transparent',
                                fontFamily: 'inherit',
                                textAlign: 'left',
                                fontSize: 'var(--type-micro)', padding: '6px 12px', cursor: 'pointer',
                                color: opt.isDestructive ? 'var(--error)' : 'var(--text-primary)',
                              }}
                              onMouseEnter={(e) => { e.currentTarget.style.background = 'var(--surface-alt)'; }}
                              onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                            >
                              {opt.label}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  </Row>
                );
              })}
            </Card>

            {/* Compact import row */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '5px 10px', border: '1px dashed var(--border)',
              borderRadius: 'var(--radius-card)', background: 'var(--surface-alt)',
            }}>
              <Upload size={14} color="var(--text-muted)" aria-hidden="true" />
              <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', flex: 1 }}>
                Import text/EPUB — drops into new chapters
              </span>
              <Btn small>Choose file</Btn>
            </div>
          </Col>

          {/* Right: chapter editor panel */}
          {EditorPanel}
        </Row>
      </Col>
    </>
  );
};

// ---------------------------------------------------------------------------
// Casting pane

const CHARACTERS_NON_NARRATOR = [
  { name: 'Maren', category: 'class' as const, lines: 142, voice: 'Studio Voice' },
  { name: 'Dov', category: 'age' as const, lines: 88, voice: 'Marcus Reed' },
  { name: 'The Warden', category: 'gender' as const, lines: 34, voice: 'Old Tom' },
  { name: 'Sira', category: 'extended' as const, lines: 29, voice: 'Unassigned' },
];

export const CastingPane: React.FC = () => (
  <Row gap={10} style={{ flex: 1, alignItems: 'stretch' }}>
    {/* Character table */}
    <Card style={{ flex: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      <Row gap={0} style={{ padding: '5px 10px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        {['Character', 'Lines', 'Voice'].map(h => (
          <div key={h} style={{
            fontSize: 'var(--type-micro)',
            fontWeight: 'var(--type-weight-micro)' as unknown as number,
            color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.06em', flex: 1,
          }}>
            {h}
          </div>
        ))}
      </Row>

      {/* Pinned Narrator row */}
      <Row gap={0} style={{
        padding: '6px 10px', borderBottom: '1px solid var(--border)',
        alignItems: 'center', background: 'var(--accent-tint-bg)',
      }}>
        <Row gap={6} style={{ flex: 1, alignItems: 'center' }}>
          <Avatar size={20} />
          <span style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--accent)' }}>
            Narrator <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: 'var(--type-micro)' }}>(default)</span>
          </span>
        </Row>
        <div style={{ fontSize: 'var(--type-caption)', color: 'var(--text-muted)', flex: 1 }}>—</div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <Avatar size={16} />
          <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-primary)' }}>Elena Marsh</span>
          <VoiceAttrPill category="tag">fallback</VoiceAttrPill>
        </div>
      </Row>

      {CHARACTERS_NON_NARRATOR.map((ch, i) => (
        <Row key={ch.name} gap={0} style={{
          padding: '6px 10px',
          borderBottom: i < CHARACTERS_NON_NARRATOR.length - 1 ? '1px solid var(--border)' : 'none',
          alignItems: 'center',
        }}>
          <Row gap={6} style={{ flex: 1, alignItems: 'center' }}>
            {/* Color dot replaced by VoiceAttrPill category dot via Avatar accent tinted by pill category */}
            <div style={{
              width: 8, height: 8, borderRadius: 'var(--radius-round)',
              background: `var(--pill-${ch.category}-text)`,
              flexShrink: 0,
            }} />
            <span style={{ fontSize: 'var(--type-caption)', fontWeight: 600, color: 'var(--text-primary)' }}>{ch.name}</span>
          </Row>
          <div style={{ fontSize: 'var(--type-caption)', color: 'var(--text-muted)', flex: 1 }}>{ch.lines}</div>
          <div style={{ flex: 1 }}>
            <span style={{
              fontSize: 'var(--type-caption)',
              color: ch.voice === 'Unassigned' ? 'var(--text-muted)' : 'var(--text-primary)',
              fontStyle: ch.voice === 'Unassigned' ? 'italic' : 'normal',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}>
              {ch.voice !== 'Unassigned' && <Avatar size={16} />}
              {ch.voice}
            </span>
          </div>
        </Row>
      ))}
    </Card>

    {/* Right panel */}
    <Col gap={8} style={{ flex: 1 }}>
      <Card style={{ padding: '10px 12px' }}>
        <Row gap={6} style={{ alignItems: 'center', marginBottom: 8 }}>
          <Mic size={14} color="var(--accent)" aria-hidden="true" />
          <div style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-primary)' }}>Studio Voice</div>
        </Row>
        <Col gap={6}>
          <Row gap={4} style={{ flexWrap: 'wrap' }}>
            <VoiceAttrPill category="class">Narrator</VoiceAttrPill>
            <VoiceAttrPill category="gender">Female</VoiceAttrPill>
            <VoiceAttrPill category="age">Adult</VoiceAttrPill>
            <VoiceAttrPill category="extended">Warm</VoiceAttrPill>
          </Row>
          <Btn small style={{ marginTop: 4 }}>
            <Play size={10} style={{ marginRight: 3 }} aria-hidden="true" />
            Preview 15s
          </Btn>
          <Btn primary small>Assign to Maren</Btn>
        </Col>
      </Card>
      <Card style={{ padding: '10px 12px' }}>
        <Row gap={6} style={{ alignItems: 'center', marginBottom: 4 }}>
          <Volume2 size={13} color="var(--accent)" aria-hidden="true" />
          <div style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-primary)' }}>Suggest cast (AI)</div>
        </Row>
        <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', marginBottom: 8 }}>
          Recommends voices per character — never auto-assigns.
        </div>
        <Btn small>Run suggestions</Btn>
      </Card>
    </Col>
  </Row>
);

// ---------------------------------------------------------------------------
// ReviewPane

const REVIEW_SENTENCES = [
  { text: 'The road wound down through silver birch and pale stone.', state: 'past' },
  { text: 'Maren pulled her cloak tighter against the chill.', state: 'past' },
  { text: 'The vale smelled of old rain and something older still.', state: 'playing' },
  { text: '"Stay close to me," she said quietly.', state: 'rerendering' },
  { text: 'Dov tightened his grip on the satchel.', state: 'upcoming' },
  { text: 'Far above, an owl called once, then fell silent.', state: 'upcoming' },
  { text: '"Right," he exhaled. "Right."', state: 'upcoming' },
];

export const ReviewPane: React.FC = () => (
  <Col gap={0} style={{ flex: 1, minHeight: 0 }}>
    {/* Transport row + waveform */}
    <Card style={{ padding: '6px 10px', marginBottom: 8, flexShrink: 0 }}>
      <Row gap={6} style={{ alignItems: 'center', marginBottom: 6 }}>
        <button
          aria-label="Skip to start"
          style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: 'var(--text-primary)', display: 'flex', alignItems: 'center' }}
        >
          <SkipBack size={16} />
        </button>
        <button
          aria-label="Rewind 5 seconds"
          style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
        >
          <Rewind size={13} />
          <span style={{ fontSize: 'var(--type-micro)', marginLeft: 2 }}>5s</span>
        </button>
        <button
          aria-label="Play"
          style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: 'var(--accent)', display: 'flex', alignItems: 'center' }}
        >
          <Play size={18} />
        </button>
        <button
          aria-label="Fast-forward 5 seconds"
          style={{ background: 'none', border: 'none', padding: 2, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
        >
          <span style={{ fontSize: 'var(--type-micro)', marginRight: 2 }}>5s</span>
          <FastForward size={13} />
        </button>
        <SemanticChip variant="accent">Chapter 7</SemanticChip>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>§18 / §42</span>
      </Row>
      {/* Waveform via shared WaveformSvg */}
      <WaveformSvg height={32} />
    </Card>

    <Row gap={10} style={{ flex: 1, alignItems: 'stretch', minHeight: 0 }}>
      <Col gap={0} style={{ flex: 2, minHeight: 0 }}>
        <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 6 }}>
          text follows playback — auto-scroll, tap a sentence to seek
        </div>
        <div style={{ flex: 1, overflowY: 'auto' }}>
          <Col gap={3}>
            {REVIEW_SENTENCES.map((s, i) => {
              const isPlaying = s.state === 'playing';
              const isPast = s.state === 'past';
              const isRerendering = s.state === 'rerendering';
              return (
                <div key={i} style={{
                  fontSize: 'var(--type-caption)', lineHeight: 1.65,
                  color: isPast ? 'var(--text-muted)' : 'var(--text-primary)',
                  padding: '3px 6px',
                  borderRadius: 'var(--radius-button)',
                  background: isPlaying
                    ? 'var(--accent-tint-bg)'
                    : isRerendering
                    ? 'var(--warning-tint-bg)'
                    : 'transparent',
                  border: isPlaying
                    ? '1px solid var(--accent-tint-border)'
                    : isRerendering
                    ? '1px solid var(--warning-tint-border)'
                    : '1px solid transparent',
                  cursor: 'pointer', fontWeight: isPlaying ? 600 : 400,
                  opacity: isPast ? 0.55 : 1,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span style={{ flex: 1 }}>{s.text}</span>
                  {isRerendering && (
                    <SemanticChip variant="warning">
                      <Loader2 size={9} style={{ marginRight: 3 }} aria-hidden="true" />
                      re-rendering
                    </SemanticChip>
                  )}
                </div>
              );
            })}
          </Col>
        </div>
      </Col>

      <Col gap={8} style={{ flex: 1, minHeight: 0 }}>
        <Row gap={6} style={{ alignItems: 'center' }}>
          <Label>Annotations</Label>
          <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontStyle: 'italic', flex: 1 }}>
            notes attach to sections — re-renders don't shift them
          </span>
        </Row>
        <Col gap={6} style={{ flex: 1, overflowY: 'auto' }}>
          {[
            { section: '§14', note: "Mispronounced 'Vale' — needs re-render" },
            { section: '§22', note: 'Pause too long after sentence end' },
            { section: '§31', note: "Narrator volume dips on 'stone'" },
          ].map(ann => (
            <Card key={ann.section} style={{ padding: '6px 8px' }}>
              <Row gap={6} style={{ alignItems: 'center', marginBottom: 4 }}>
                <SemanticChip variant="neutral">{ann.section}</SemanticChip>
                <span style={{ flex: 1, fontSize: 'var(--type-micro)', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  {ann.note}
                </span>
              </Row>
              <Btn small>Re-render section</Btn>
            </Card>
          ))}
          <div style={{ fontSize: 'var(--type-caption)', color: 'var(--accent)', cursor: 'pointer', padding: '4px 2px' }}>
            + Add note on §18 (playing)
          </div>
        </Col>
      </Col>
    </Row>
  </Col>
);

// Re-export shared primitives used by sibling modules that import from this barrel
export { Label, ProgressBar };
