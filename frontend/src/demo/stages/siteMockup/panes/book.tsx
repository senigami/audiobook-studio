/**
 * siteMockup/panes/book.tsx — BookPane container, ManuscriptPane, CastingPane
 * Feature B: "+ New chapter" opens Add Chapter modal (Title, paste textarea, upload row, Cancel/Add)
 */
import React, { useState, useEffect } from 'react';
import {
  Row, Col, Label, Btn, ProgressBar, PlayButton,
  Card, Panel,
  SemanticChip, VoiceAttrPill,
  StatusOrb,
  Avatar,
  Mic, Volume2, CheckCircle,
  CHAPTERS,
  CHAPTER_RENDER_PCT,
} from '../shared';
import { Upload, Lock, Edit3, Play, MoreHorizontal, BookOpen, Bookmark, ChevronDown, ChevronUp, X } from 'lucide-react';
import {
  getBookmarks, removeBookmark, subscribeBookmarks,
} from '../bookmarkStore';
import type { NamedBookmark } from '../bookmarkStore';

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

// Map CHAPTERS status to OrbStatus (for ContentsPane)
type ChapterStatus = 'Published' | 'Review' | 'Studio' | 'Drafting';
const CHAPTER_STATUS_ORB: Record<ChapterStatus, OrbStatus> = {
  Published: 'done',
  Review:    'running',
  Studio:    'preparing',
  Drafting:  'idle',
};

// ---------------------------------------------------------------------------
// GlobalBookmarkPanel — cross-book named bookmark list (task 012)

const GlobalBookmarkPanel: React.FC<{
  /** If provided, clicking an entry that belongs to this book's chapter fires the callback. */
  onOpenChapter?: (n: number) => void;
}> = ({ onOpenChapter }) => {
  const [open, setOpen] = useState(true);
  const [bookmarks, setBookmarks] = useState<NamedBookmark[]>(() => getBookmarks());
  const [jumpedId, setJumpedId] = useState<string | null>(null);

  // Stay in sync with the store
  useEffect(() => subscribeBookmarks(() => setBookmarks(getBookmarks())), []);

  const handleJump = (bm: NamedBookmark) => {
    // Mock navigation: flash the row, and if it's this book open the chapter.
    setJumpedId(bm.id);
    setTimeout(() => setJumpedId(null), 1400);
    if (bm.book === 'The Whispering Vale' && onOpenChapter) {
      onOpenChapter(bm.chapter);
    }
  };

  return (
    <div>
      {/* Collapsible header */}
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        style={{
          width: '100%', border: 'none', background: 'transparent',
          display: 'flex', alignItems: 'center', gap: 6, padding: '0 0 var(--space-1)',
          cursor: 'pointer', fontFamily: 'inherit',
        }}
      >
        <Bookmark size={12} color="var(--text-secondary)" aria-hidden="true" />
        <span style={{
          fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-secondary)',
          textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', flex: 1, textAlign: 'left',
        }}>
          Bookmarks <span style={{ fontWeight: 400, color: 'var(--text-muted)', textTransform: 'none', letterSpacing: 0 }}>({bookmarks.length})</span>
        </span>
        {open
          ? <ChevronUp size={12} color="var(--text-muted)" aria-hidden="true" />
          : <ChevronDown size={12} color="var(--text-muted)" aria-hidden="true" />
        }
      </button>

      {open && (
        <Card style={{ overflow: 'hidden' }}>
          {bookmarks.length === 0 ? (
            <div style={{ padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              No bookmarks yet — use the Bookmark button in the workspace to tag a scene.
            </div>
          ) : (
            <div>
              {bookmarks.map((bm, i) => {
                const isJumped = bm.id === jumpedId;
                return (
                  <Row
                    key={bm.id}
                    gap={0}
                    style={{
                      padding: 'var(--space-1) var(--space-2)',
                      borderBottom: i < bookmarks.length - 1 ? 'var(--hairline)' : 'none',
                      alignItems: 'center',
                      background: isJumped ? 'var(--accent-tint-bg)' : 'transparent',
                      transition: 'background 0.3s',
                    }}
                  >
                    {/* Book + chapter + label */}
                    <button
                      type="button"
                      onClick={() => handleJump(bm)}
                      title={`Jump to ${bm.book} · Ch ${bm.chapter}`}
                      style={{
                        flex: 1, border: 'none', background: 'transparent',
                        textAlign: 'left', cursor: 'pointer', padding: 0,
                        fontFamily: 'inherit', minWidth: 0,
                      }}
                    >
                      <span style={{
                        fontSize: 'var(--type-micro)',
                        color: isJumped ? 'var(--accent)' : 'var(--text-primary)',
                        lineHeight: 'var(--leading-normal)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        display: 'block',
                      }}>
                        <span style={{ color: isJumped ? 'var(--accent)' : 'var(--text-secondary)', fontWeight: 600 }}>{bm.book}</span>
                        <span style={{ color: 'var(--text-muted)', margin: '0 3px' }}>·</span>
                        <span style={{ color: 'var(--text-muted)' }}>Ch {bm.chapter}</span>
                        <span style={{ color: 'var(--text-muted)', margin: '0 3px' }}>·</span>
                        <span style={{ fontStyle: 'italic', color: isJumped ? 'var(--accent)' : 'var(--text-primary)' }}>
                          "{bm.label}"
                        </span>
                      </span>
                    </button>

                    {/* Remove button */}
                    <button
                      type="button"
                      aria-label={`Remove bookmark "${bm.label}"`}
                      onClick={() => removeBookmark(bm.id)}
                      style={{
                        background: 'none', border: 'none', padding: '2px 3px',
                        cursor: 'pointer', color: 'var(--text-muted)', flexShrink: 0,
                        display: 'inline-flex', alignItems: 'center',
                      }}
                      onMouseEnter={e => { e.currentTarget.style.color = 'var(--error)'; }}
                      onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; }}
                    >
                      <X size={11} aria-hidden="true" />
                    </button>
                  </Row>
                );
              })}
            </div>
          )}
        </Card>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// ContentsPane — book command center: slim header + chapter board + publish readiness

export const ContentsPane: React.FC<{
  onSwitchToPublish: () => void;
  onOpenChapter?: (n: number) => void;
}> = ({ onSwitchToPublish, onOpenChapter }) => {
  // allGreen: every chapter must have 100% render progress.
  // Demo data CHAPTER_RENDER_PCT = [100,100,80,60,30,0,0] — not all-green by default.
  // To see the enabled publish button, change all values in CHAPTER_RENDER_PCT to 100.
  const allGreen = CHAPTER_RENDER_PCT.every(pct => pct === 100);
  const hasRemaining = CHAPTER_RENDER_PCT.some(pct => pct < 100);

  return (
    <Col gap={12} className="ns-enter" style={{ flex: 1, minHeight: 0 }}>

      {/* ── Slim book header ─────────────────────────────────────── */}
      <Card style={{ padding: 'var(--space-2) var(--space-3)', flexShrink: 0 }}>
        <Row gap={12} style={{ alignItems: 'center' }}>
          {/* Cover thumbnail */}
          <div style={{
            width: 40, height: 54, borderRadius: 3, flexShrink: 0,
            background: 'linear-gradient(135deg, var(--accent-tint-bg) 0%, var(--border) 100%)',
            border: '1px solid var(--accent-tint-border)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            overflow: 'hidden',
          }}>
            <BookOpen size={18} color="var(--accent)" aria-hidden="true" />
          </div>

          {/* Title + meta */}
          <Col gap={2} style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 'var(--type-callout)', fontWeight: 700,
              color: 'var(--text-primary)', lineHeight: 'var(--leading-tight)',
              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
            }}>
              The Whispering Vale
            </div>
            <Row gap={8} style={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>
                R.E. Hartley · The Vale Cycle #1
              </span>
              <span style={{
                fontSize: 'var(--type-micro)', color: 'var(--text-secondary)',
                display: 'inline-flex', alignItems: 'center', gap: 3,
              }}>
                <span style={{ color: 'var(--text-muted)', fontSize: '0.65rem' }}>▶</span>
                6h 28m total
              </span>
            </Row>
          </Col>

          {/* Edit pencil affordance */}
          <button
            type="button"
            aria-label="Edit book details"
            title="Edit book details"
            style={{
              background: 'none', border: '1px solid var(--border)',
              borderRadius: 'var(--radius-button)', cursor: 'pointer',
              color: 'var(--text-muted)', padding: '4px 8px',
              display: 'inline-flex', alignItems: 'center', gap: 4,
              fontSize: 'var(--type-micro)', fontFamily: 'inherit',
            }}
          >
            <Edit3 size={12} aria-hidden="true" />
            Edit
          </button>
        </Row>
      </Card>

      {/* ── Chapter board ────────────────────────────────────────── */}
      <Col gap={8} style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        {/* Board header row */}
        <Row gap={8} style={{ alignItems: 'center', flexShrink: 0 }}>
          <div style={{
            fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-secondary)',
            textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', flex: 1,
          }}>
            Chapters
          </div>
          {/* Render all remaining — enabled when at least one chapter is not green */}
          <button
            type="button"
            disabled={!hasRemaining}
            aria-label="Render all remaining chapters"
            style={{
              background: hasRemaining ? 'var(--accent-tint-bg)' : 'var(--surface-alt)',
              border: `1px solid ${hasRemaining ? 'var(--accent-tint-border)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-button)', cursor: hasRemaining ? 'pointer' : 'default',
              color: hasRemaining ? 'var(--accent)' : 'var(--text-muted)',
              fontSize: 'var(--type-micro)', fontWeight: 600, fontFamily: 'inherit',
              padding: '4px 10px', display: 'inline-flex', alignItems: 'center', gap: 4,
              opacity: hasRemaining ? 1 : 0.5,
            }}
          >
            ▶ Render all remaining
          </button>
        </Row>

        {/* Chapter table card */}
        <Card style={{ overflow: 'auto', flex: 1 }}>
          {/* Table header — eyebrow labels */}
          <Row gap={0} style={{
            padding: 'var(--space-1) var(--space-2)',
            borderBottom: 'var(--hairline)', background: 'var(--surface)', position: 'sticky', top: 0,
          }}>
            <div style={{ width: 28, flexShrink: 0 }} />
            <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', flex: 0.5 }}>#</div>
            <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', flex: 3 }}>Title</div>
            <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', flex: 1, textAlign: 'right' }}>Words</div>
            <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', flex: 1.5, textAlign: 'right' }}>Rendered</div>
            <div style={{ width: 60, flexShrink: 0 }} />
          </Row>

          <div className="ns-stagger">
            {CHAPTERS.map((ch, i) => {
              const pct = CHAPTER_RENDER_PCT[ch.n - 1] ?? 0;
              const orbStatus = CHAPTER_STATUS_ORB[ch.status as ChapterStatus] ?? 'idle';
              return (
                <Row
                  key={ch.n}
                  gap={0}
                  onClick={() => onOpenChapter?.(ch.n)}
                  style={{
                    padding: 'var(--space-2) var(--space-2)',
                    borderBottom: i < CHAPTERS.length - 1 ? 'var(--hairline)' : 'none',
                    alignItems: 'center', cursor: onOpenChapter ? 'pointer' : 'default',
                    transition: 'background var(--dur-fast) var(--ease-standard)',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-alt)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  {/* StatusOrb — existing component, not a new one */}
                  <div style={{ width: 28, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <StatusOrb status={orbStatus} progress={pct / 100} size={16} />
                  </div>
                  {/* Chapter number */}
                  <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', flex: 0.5 }}>
                    {ch.n}
                  </div>
                  {/* Title */}
                  <div style={{
                    fontSize: 'var(--type-caption)', fontWeight: 500,
                    color: 'var(--text-primary)', flex: 3,
                    overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                  }}>
                    {ch.title}
                  </div>
                  {/* Word count */}
                  <div style={{ fontSize: 'var(--type-caption)', color: 'var(--text-muted)', flex: 1, textAlign: 'right' }}>
                    {ch.words.toLocaleString()}
                  </div>
                  {/* Render % */}
                  <div style={{ fontSize: 'var(--type-micro)', color: pct === 100 ? 'var(--success-text)' : 'var(--text-muted)', flex: 1.5, textAlign: 'right', fontWeight: pct === 100 ? 700 : 400 }}>
                    {pct}%
                  </div>
                  {/* Open affordance */}
                  <div style={{ width: 60, flexShrink: 0, display: 'flex', justifyContent: 'flex-end' }}>
                    {onOpenChapter && (
                      <button
                        type="button"
                        aria-label={`Open chapter ${ch.n} workspace`}
                        onClick={e => { e.stopPropagation(); onOpenChapter(ch.n); }}
                        style={{
                          background: 'none', border: '1px solid var(--border)',
                          borderRadius: 'var(--radius-button)', cursor: 'pointer',
                          color: 'var(--text-muted)', fontSize: 'var(--type-micro)', fontWeight: 600,
                          padding: '2px 7px', fontFamily: 'inherit',
                          display: 'inline-flex', alignItems: 'center', gap: 3,
                          whiteSpace: 'nowrap',
                        }}
                        onMouseEnter={e => { e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.borderColor = 'var(--accent-tint-border)'; }}
                        onMouseLeave={e => { e.currentTarget.style.color = 'var(--text-muted)'; e.currentTarget.style.borderColor = 'var(--border)'; }}
                      >
                        Open ▸
                      </button>
                    )}
                  </div>
                </Row>
              );
            })}
          </div>
        </Card>
      </Col>

      {/* ── Global bookmark list (task 012) ────────────────────────── */}
      <div style={{ flexShrink: 0 }}>
        <GlobalBookmarkPanel onOpenChapter={onOpenChapter} />
      </div>

      {/* ── Publish-readiness control ─────────────────────────────── */}
      <div style={{ flexShrink: 0 }}>
        <button
          type="button"
          disabled={!allGreen}
          onClick={() => { if (allGreen) onSwitchToPublish(); }}
          aria-label={allGreen ? 'Book ready — switch to Publish tab' : 'Not all chapters rendered — publish unavailable'}
          style={{
            width: '100%',
            padding: 'var(--space-2) var(--space-3)',
            borderRadius: 'var(--radius-card)',
            border: `1px solid ${allGreen ? 'var(--success)' : 'var(--border)'}`,
            background: allGreen ? 'var(--success-tint-bg)' : 'var(--surface-alt)',
            color: allGreen ? 'var(--success-text)' : 'var(--text-muted)',
            cursor: allGreen ? 'pointer' : 'not-allowed',
            opacity: allGreen ? 1 : 0.6,
            fontFamily: 'inherit',
            fontSize: 'var(--type-callout)',
            fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            transition: 'background var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard)',
          }}
        >
          {allGreen ? (
            <>
              <CheckCircle size={16} aria-hidden="true" />
              Book ready — Publish ▸
            </>
          ) : (
            <>
              <span style={{ fontSize: 'var(--type-micro)', opacity: 0.8 }}>
                {CHAPTER_RENDER_PCT.filter(p => p < 100).length} chapter{CHAPTER_RENDER_PCT.filter(p => p < 100).length !== 1 ? 's' : ''} remaining — render all to unlock Publish
              </span>
            </>
          )}
        </button>
      </div>

    </Col>
  );
};

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
      <Panel style={{ padding: 'var(--space-3) var(--space-3)', width: 340, boxShadow: 'var(--shadow-xl)' }}>
        <div style={{ fontSize: 'var(--type-callout)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>Add Chapter</div>
        {/* Title */}
        <div style={{ marginBottom: 'var(--space-2)' }}>
          <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', color: 'var(--text-muted)', marginBottom: 'var(--space-1)' }}>Title</div>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Chapter title…"
            style={{
              width: '100%', boxSizing: 'border-box',
              fontSize: 'var(--type-caption)', padding: 'var(--space-1) var(--space-2)',
              borderRadius: 'var(--radius-button)', border: '1px solid var(--border)',
              background: 'var(--surface-alt)', color: 'var(--text-primary)', outline: 'none',
            }}
          />
        </div>
        {/* Paste textarea */}
        <div style={{ marginBottom: 'var(--space-2)' }}>
          <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', color: 'var(--text-muted)', marginBottom: 'var(--space-1)' }}>Or paste text</div>
          <textarea
            rows={4}
            placeholder="Paste chapter text here…"
            style={{
              width: '100%', boxSizing: 'border-box',
              fontSize: 'var(--type-caption)', padding: 'var(--space-1) var(--space-2)',
              borderRadius: 'var(--radius-button)', border: '1px solid var(--border)',
              background: 'var(--surface-alt)', color: 'var(--text-primary)', outline: 'none',
              resize: 'vertical', lineHeight: 'var(--leading-normal)',
            }}
          />
        </div>
        {/* Upload row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
          padding: 'var(--space-1) var(--space-2)',
          border: '1px dashed var(--border)',
          borderRadius: 'var(--radius-card)', background: 'var(--surface-alt)', marginBottom: 'var(--space-2)',
        }}>
          <Upload size={14} color="var(--text-muted)" aria-hidden="true" />
          <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', flex: 1 }}>or upload a file (.txt, .docx, .epub)</span>
          <Btn small>Choose file</Btn>
        </div>

        {/* Split rules configuration for imports */}
        <div style={{
          marginBottom: 'var(--space-3)',
          padding: 'var(--space-2)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-card)',
          background: 'var(--surface-alt)',
        }}>
          <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', color: 'var(--text-muted)', marginBottom: 'var(--space-1)' }}>
            Import Settings (.txt, .docx, .epub)
          </div>
          <Row gap={8} style={{ alignItems: 'center', marginBottom: 'var(--space-1)' }}>
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

export const ManuscriptPane: React.FC<{ onSwitchToPublish: () => void; onOpenChapter?: (n: number) => void }> = ({ onSwitchToPublish: _onSwitchToPublish, onOpenChapter }) => {
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
        padding: 'var(--space-1) var(--space-2)',
        borderBottom: 'var(--hairline)',
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
          padding: 'var(--space-1) var(--space-2)',
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
          padding: 'var(--space-2)',
          flexShrink: 0,
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: 'var(--type-micro)', color: 'var(--warning-text)', marginBottom: 'var(--space-1)', lineHeight: 'var(--leading-snug)' }}>
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
      <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-3) var(--space-4)' }}>
        {isEditable ? (
          <Col gap={0} style={{ maxWidth: '64ch', margin: '0 auto' }}>
            <div
              contentEditable
              suppressContentEditableWarning
              style={{
                fontSize: 'var(--type-reading)',
                lineHeight: 'var(--leading-reading)',
                color: 'var(--text-primary)',
                outline: 'none',
                background: 'transparent',
                minHeight: 40,
                marginBottom: 'var(--space-3)',
              }}
            >
              The road wound down through silver birch and pale stone, the kind of road that remembers every foot that has ever crossed it. Maren pulled her cloak tighter against the chill that rose from the valley floor.
            </div>
            <div
              contentEditable
              suppressContentEditableWarning
              style={{
                fontSize: 'var(--type-reading)',
                lineHeight: 'var(--leading-reading)',
                color: 'var(--text-primary)',
                outline: 'none',
                background: 'transparent',
                minHeight: 40,
                marginBottom: 'var(--space-3)',
              }}
            >
              The vale smelled of old rain and something older still — loam and iron and time. Far above, an owl called once, then fell silent.
            </div>
          </Col>
        ) : (
          <Col gap={0} style={{ maxWidth: '64ch', margin: '0 auto' }}>
            {[
              'The road wound down through silver birch and pale stone, the kind of road that remembers every foot that has ever crossed it.',
              'Maren pulled her cloak tighter against the chill that rose from the valley floor.',
              'The vale smelled of old rain and something older still — loam and iron and time.',
              'Far above, an owl called once, then fell silent.',
            ].map((line, i) => (
              <div key={i} style={{
                fontSize: 'var(--type-reading)',
                lineHeight: 'var(--leading-reading)',
                color: 'var(--text-secondary)',
                marginBottom: 'var(--space-3)',
              }}>
                {line}
              </div>
            ))}
          </Col>
        )}
      </div>

      {/* Footer: word count + edit button */}
      <div style={{
        padding: 'var(--space-1) var(--space-2)',
        borderTop: 'var(--hairline)',
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
      <Col gap={0} className="ns-enter" style={{ flex: 1, alignItems: 'center', justifyContent: 'flex-start', position: 'relative' }}>
        <div style={{
          fontSize: 'var(--type-micro)',
          color: 'var(--text-muted)',
          fontStyle: 'italic',
          padding: 'var(--space-1) 0 var(--space-2)',
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
              padding: 'var(--space-1) var(--space-2)',
              borderBottom: 'var(--hairline)',
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
            <div style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-4) var(--space-5)' }}>
              <Col gap={0} style={{ maxWidth: '64ch', margin: '0 auto' }}>
                <div
                  contentEditable
                  suppressContentEditableWarning
                  style={{
                    fontSize: 'var(--type-reading)',
                    lineHeight: 'var(--leading-reading)',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    background: 'transparent',
                    marginBottom: 'var(--space-4)',
                  }}
                >
                  The road wound down through silver birch and pale stone, the kind of road that remembers every foot that has ever crossed it. Maren pulled her cloak tighter against the chill that rose from the valley floor.
                </div>
                <div
                  contentEditable
                  suppressContentEditableWarning
                  style={{
                    fontSize: 'var(--type-reading)',
                    lineHeight: 'var(--leading-reading)',
                    color: 'var(--text-primary)',
                    outline: 'none',
                    background: 'transparent',
                    marginBottom: 'var(--space-4)',
                  }}
                >
                  The vale smelled of old rain and something older still — loam and iron and time. Far above, an owl called once, then fell silent.
                </div>
              </Col>
            </div>
            <div style={{ padding: 'var(--space-1) var(--space-2)', borderTop: 'var(--hairline)', background: 'var(--surface)', flexShrink: 0 }}>
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
      <Col gap={0} className="ns-enter" style={{ flex: 1 }}>
        <Row className="ns-manuscript-grid" gap={12} style={{ flex: 1, alignItems: 'stretch' }}>
          {/* Left: chapter table + compact import row */}
          <Col gap={8} style={{ flex: 2, minWidth: 0 }}>
            {/* + New chapter button */}
            <Row gap={6} style={{ alignItems: 'center' }}>
              <Btn small onClick={() => setShowAddChapter(true)}>+ New chapter</Btn>
            </Row>

            {/* Chapter table */}
            <Card style={{ overflow: 'hidden' }}>
              {/* Table header — eyebrow labels */}
              <Row gap={0} style={{ padding: 'var(--space-1) var(--space-2)', borderBottom: 'var(--hairline)', background: 'var(--surface)' }}>
                <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', flex: 0.5 }}>#</div>
                <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', flex: 3 }}>Title</div>
                <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', flex: 1, textAlign: 'right' }}>Words</div>
                <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', flex: 1.5, textAlign: 'right' }}>Stage</div>
                <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', flex: 0.5, textAlign: 'right' }}></div>
              </Row>
              <div className="ns-stagger">
                {chapters.map((ch, i) => {
                  const isSelected = ch.n === selectedChapterN;
                  return (
                    <Row
                      key={ch.n} gap={0}
                      onClick={() => handleChapterClick(ch.n)}
                      style={{
                        padding: 'var(--space-2) var(--space-2)',
                        borderBottom: i < chapters.length - 1 ? 'var(--hairline)' : 'none',
                        alignItems: 'center', cursor: 'pointer',
                        background: isSelected ? 'var(--accent-tint-bg)' : 'transparent',
                        borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent',
                        transition: 'background var(--dur-fast) var(--ease-standard)',
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
                      {/* Open chapter workspace affordance */}
                      {onOpenChapter && isSelected && (
                        <button
                          type="button"
                          aria-label={`Open chapter ${ch.n} workspace`}
                          onClick={(e) => { e.stopPropagation(); onOpenChapter(ch.n); }}
                          style={{
                            flexShrink: 0, marginRight: 4,
                            background: 'none', border: '1px solid var(--accent-tint-border)',
                            borderRadius: 'var(--radius-button)',
                            color: 'var(--accent)', cursor: 'pointer',
                            fontSize: 'var(--type-micro)', fontWeight: 600,
                            padding: '2px 7px', fontFamily: 'inherit',
                            display: 'inline-flex', alignItems: 'center', gap: 3,
                            whiteSpace: 'nowrap',
                          }}
                        >
                          Open ▸
                        </button>
                      )}
                      {/* Play this chapter — only once it has rendered audio. */}
                      <div style={{ flexShrink: 0, marginRight: 4, display: 'flex', justifyContent: 'flex-end' }}>
                        {ch.lifecycle === 'Rendered' && <PlayButton label={`Play chapter ${ch.n}`} tone="ghost" size={12} />}
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
              </div>
            </Card>

            {/* Compact import row */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
              padding: 'var(--space-1) var(--space-2)', border: '1px dashed var(--border)',
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
  <Row gap={12} className="ns-enter ns-casting-grid" style={{ flex: 1, alignItems: 'stretch' }}>
    {/* Character table */}
    <Card style={{ flex: 2, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
      {/* Table header — eyebrow labels */}
      <Row gap={0} style={{ padding: 'var(--space-1) var(--space-3)', borderBottom: 'var(--hairline)', background: 'var(--surface)' }}>
        {['Character', 'Lines', 'Voice'].map(h => (
          <div key={h} style={{
            fontSize: 'var(--type-micro)',
            fontWeight: 700,
            color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)', flex: 1,
          }}>
            {h}
          </div>
        ))}
      </Row>

      {/* Pinned Narrator row */}
      <Row gap={0} style={{
        padding: 'var(--space-2) var(--space-3)', borderBottom: 'var(--hairline)',
        alignItems: 'center', background: 'var(--accent-tint-bg)',
      }}>
        <Row gap={8} style={{ flex: 1, alignItems: 'center' }}>
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

      <div className="ns-stagger">
        {CHARACTERS_NON_NARRATOR.map((ch, i) => (
          <Row key={ch.name} gap={0} style={{
            padding: 'var(--space-2) var(--space-3)',
            borderBottom: i < CHARACTERS_NON_NARRATOR.length - 1 ? 'var(--hairline)' : 'none',
            alignItems: 'center',
            cursor: 'pointer',
            transition: 'background var(--dur-fast) var(--ease-standard)',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-alt)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <Row gap={8} style={{ flex: 1, alignItems: 'center' }}>
              {/* Larger color dot — 13px */}
              <div style={{
                width: 13, height: 13, borderRadius: 'var(--radius-round)',
                background: `var(--pill-${ch.category}-text)`,
                flexShrink: 0,
                boxShadow: `0 0 0 2px var(--pill-${ch.category}-bg)`,
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
      </div>
    </Card>

    {/* Right detail panel */}
    <Col gap={12} style={{ flex: 1 }}>
      <Panel style={{ padding: 'var(--space-3)' }}>
        <Row gap={8} style={{ alignItems: 'center', marginBottom: 'var(--space-2)' }}>
          <Mic size={14} color="var(--accent)" aria-hidden="true" />
          <div style={{ fontSize: 'var(--type-callout)', fontWeight: 700, color: 'var(--text-primary)' }}>Studio Voice</div>
        </Row>
        <Col gap={8}>
          <Row gap={4} style={{ flexWrap: 'wrap' }}>
            <VoiceAttrPill category="class">Narrator</VoiceAttrPill>
            <VoiceAttrPill category="gender">Female</VoiceAttrPill>
            <VoiceAttrPill category="age">Adult</VoiceAttrPill>
            <VoiceAttrPill category="extended">Warm</VoiceAttrPill>
          </Row>
          <Btn small style={{ marginTop: 'var(--space-1)' }}>
            <Play size={10} style={{ marginRight: 3 }} aria-hidden="true" />
            Preview 15s
          </Btn>
          <Btn primary small>Assign to Maren</Btn>
        </Col>
      </Panel>
      <Panel style={{ padding: 'var(--space-3)' }}>
        <Row gap={8} style={{ alignItems: 'center', marginBottom: 'var(--space-1)' }}>
          <Volume2 size={13} color="var(--accent)" aria-hidden="true" />
          <div style={{ fontSize: 'var(--type-callout)', fontWeight: 700, color: 'var(--text-primary)' }}>Suggest cast (AI)</div>
        </Row>
        <div style={{ fontSize: 'var(--type-caption)', color: 'var(--text-muted)', marginBottom: 'var(--space-2)', lineHeight: 'var(--leading-snug)' }}>
          Recommends voices per character — never auto-assigns.
        </div>
        <Btn primary small>Run suggestions</Btn>
      </Panel>
    </Col>
  </Row>
);

// ---------------------------------------------------------------------------
// BackupsPane — stub surface (real functionality is out of scope for 005)

export const BackupsPane: React.FC = () => (
  <Col gap={12} className="ns-enter" style={{ flex: 1 }}>
    <Panel style={{ padding: 'var(--space-3)' }}>
      <div style={{ fontSize: 'var(--type-callout)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--space-1)' }}>
        Backups
      </div>
      <div style={{ fontSize: 'var(--type-caption)', color: 'var(--text-muted)', lineHeight: 'var(--leading-snug)' }}>
        Versioned snapshots of this book. Restore any checkpoint to recover chapters, cast assignments, and render history.
      </div>
    </Panel>
  </Col>
);

// Re-export shared primitives used by sibling modules that import from this barrel
export { Label, ProgressBar };
