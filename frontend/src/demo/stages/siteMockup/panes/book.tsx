/**
 * siteMockup/panes/book.tsx — BookPane container, ContentsPane, CastingPane, BackupsPane
 * Feature B: "+ New chapter" opens Add Chapter modal (Title, paste textarea, upload row, Cancel/Add)
 * (ManuscriptPane — an orphaned, never-imported export — was deleted here in task 012, Part B;
 * see the comment left in its place below.)
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
import { Edit3, Play, BookOpen, Bookmark, ChevronDown, ChevronUp, X } from 'lucide-react';
import {
  getBookmarks, removeBookmark, subscribeBookmarks,
} from '../bookmarkStore';
import type { NamedBookmark } from '../bookmarkStore';

// ---------------------------------------------------------------------------
// Map CHAPTERS status to OrbStatus (for ContentsPane)

type OrbStatus = 'queued' | 'preparing' | 'running' | 'done' | 'failed' | 'idle';
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
                        color: isJumped ? 'var(--action-primary)' : 'var(--text-primary)',
                        lineHeight: 'var(--leading-normal)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                        display: 'block',
                      }}>
                        <span style={{ color: isJumped ? 'var(--action-primary)' : 'var(--text-secondary)', fontWeight: 600 }}>{bm.book}</span>
                        <span style={{ color: 'var(--text-muted)', margin: '0 3px' }}>·</span>
                        <span style={{ color: 'var(--text-muted)' }}>Ch {bm.chapter}</span>
                        <span style={{ color: 'var(--text-muted)', margin: '0 3px' }}>·</span>
                        <span style={{ fontStyle: 'italic', color: isJumped ? 'var(--action-primary)' : 'var(--text-primary)' }}>
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
// BookPane — front-door hero: cover + identity, description, Continue Listening CTA, demoted metadata footer

export const BookPane: React.FC = () => {
  return (
    <Col gap={16} className="ns-enter" style={{ flex: 1, minHeight: 0, overflow: 'auto' }}>
      <Card style={{ padding: 'var(--space-4)' }}>
        <Row gap={20} style={{ alignItems: 'flex-start' }}>
          {/* Hero cover — larger than ContentsPane's 40x54 thumbnail */}
          <div style={{
            width: 152, height: 205, borderRadius: 12, flexShrink: 0,
            background: 'linear-gradient(135deg, var(--accent-tint-bg) 0%, var(--border) 100%)',
            border: '1px solid var(--accent-tint-border)',
            boxShadow: 'var(--shadow-md)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <BookOpen size={48} color="var(--action-primary)" aria-hidden="true" />
          </div>

          {/* Identity + description + CTA + footer */}
          <Col gap={10} style={{ flex: 1, minWidth: 0 }}>
            <div>
              <div style={{
                fontSize: 'var(--type-large-title)', fontWeight: 800,
                color: 'var(--text-primary)', lineHeight: 1.05,
              }}>
                The Whispering Vale
              </div>
              <Row gap={8} style={{ alignItems: 'center', marginTop: 4 }}>
                <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  R.E. Hartley
                </span>
                <span style={{ color: 'var(--text-muted)' }}>·</span>
                <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-muted)', fontWeight: 650 }}>
                  The Vale Cycle #1
                </span>
              </Row>
            </div>

            <p style={{
              margin: 0, maxWidth: '42rem', color: 'var(--text-secondary)',
              fontSize: 'var(--type-caption)', lineHeight: 1.6,
            }}>
              A hollow road winds through the Vale, and something ancient walks it after dark.
              When Mira Ashford inherits her grandmother's cottage at the forest's edge, she finds
              a diary that says the walking things remember her name.
            </p>

            <Row gap={10} style={{ alignItems: 'center', marginTop: 4 }}>
              <PlayButton label="Play book The Whispering Vale" tone="overlay" size={18} />
              <span style={{ fontSize: 'var(--type-caption)', fontWeight: 600, color: 'var(--text-primary)' }}>
                Continue Listening
              </span>
              <Btn style={{ marginLeft: 8 }}>Download</Btn>
            </Row>

            <Row gap={0} style={{ alignItems: 'center', marginTop: 6 }}>
              <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>Runtime 6h 28m</span>
              <span style={{ color: 'var(--text-muted)', margin: '0 6px', fontSize: 'var(--type-micro)' }}>·</span>
              <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>Rendered</span>
              <span style={{ color: 'var(--text-muted)', margin: '0 6px', fontSize: 'var(--type-micro)' }}>·</span>
              <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>Created 2 days ago</span>
            </Row>
          </Col>
        </Row>
      </Card>
    </Col>
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
            <BookOpen size={18} color="var(--action-primary)" aria-hidden="true" />
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
              color: hasRemaining ? 'var(--action-primary)' : 'var(--text-muted)',
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
                        onMouseEnter={e => { e.currentTarget.style.color = 'var(--action-primary)'; e.currentTarget.style.borderColor = 'var(--accent-tint-border)'; }}
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


// ManuscriptPane (and its ManuscriptPane-only `AddChapterModal` helper, above) were deleted here
// (task 012, Part B): ManuscriptPane was an orphaned export never imported by
// `siteMockupStage.tsx`. Task 010 confirmed the demo's slim `ContentsPane` board (above) is the
// intended design and simplified live's Contents tab to match, rather than porting this pane's
// richer inline-editor design into live — see
// design-docs/plans/active/north_star_screen_parity/tasks/010-decision-contents-tab-fate.md.


// ---------------------------------------------------------------------------
// Casting pane

interface VoiceAttrPillDef {
  category: 'class' | 'gender' | 'age' | 'extended';
  label: string;
}

/** Attribute pills for each character's currently-assigned voice (empty for Unassigned). */
const VOICE_PILLS_BY_NAME: Record<string, VoiceAttrPillDef[]> = {
  'Studio Voice': [
    { category: 'class', label: 'Narrator' },
    { category: 'gender', label: 'Female' },
    { category: 'age', label: 'Adult' },
    { category: 'extended', label: 'Warm' },
  ],
  'Marcus Reed': [
    { category: 'class', label: 'Character' },
    { category: 'gender', label: 'Male' },
    { category: 'age', label: 'Adult' },
    { category: 'extended', label: 'Deep' },
  ],
  'Old Tom': [
    { category: 'class', label: 'Character' },
    { category: 'gender', label: 'Male' },
    { category: 'age', label: 'Senior' },
    { category: 'extended', label: 'Gruff' },
  ],
};

const CHARACTERS_NON_NARRATOR = [
  { name: 'Maren', category: 'class' as const, lines: 142, voice: 'Studio Voice', description: 'A young herbalist traveling the vale, cautious but quietly determined.' },
  { name: 'Dov', category: 'age' as const, lines: 88, voice: 'Marcus Reed', description: 'An older tracker, weathered and terse, rarely wastes a word.' },
  { name: 'The Warden', category: 'gender' as const, lines: 34, voice: 'Old Tom', description: 'A gruff frontier lawman guarding the vale\'s border keep.' },
  { name: 'Sira', category: 'extended' as const, lines: 29, voice: 'Unassigned', description: 'A minor character, an innkeeper\'s daughter with a handful of lines.' },
];

// ---------------------------------------------------------------------------
// AI casting suggestions — matches the casting contract shape from
// design-docs/plans/active/v2_voice_metadata_and_casting.md: ranked
// recommendations with a numeric score and a one-line human-readable reason
// per candidate. Recommend-only — no auto-assignment, ever.

interface CastingSuggestion {
  voiceName: string;
  score: number;
  reason: string;
}

const SUGGESTIONS_BY_CHARACTER: Record<string, CastingSuggestion[]> = {
  Sira: [
    { voiceName: 'Clara Bell', score: 0.88, reason: 'Bright young-adult female voice fits a minor supporting role with light dialogue.' },
    { voiceName: 'Aria', score: 0.71, reason: 'Clear adult female narrator delivery — right age and gender, more neutral tone.' },
    { voiceName: 'Studio Voice', score: 0.42, reason: 'Language and gender match, but already cast as book narrator — reuse not recommended.' },
  ],
  Maren: [
    { voiceName: 'Clara Bell', score: 0.74, reason: 'Bright, youthful tone suits a cautious young herbalist.' },
    { voiceName: 'Aria', score: 0.69, reason: 'Clear delivery, adult female, but reads slightly too formal for the character\'s warmth.' },
  ],
  Dov: [
    { voiceName: 'Old Tom', score: 0.65, reason: 'Right age and gruffness, but already cast for The Warden — accent is UK rural, not neutral.' },
    { voiceName: 'Marcus Reed', score: 0.93, reason: 'Deep, steady adult male voice matches a terse, weathered tracker.' },
  ],
  'The Warden': [
    { voiceName: 'Old Tom', score: 0.91, reason: 'Gruff senior male with rough texture — matches a frontier lawman exactly.' },
    { voiceName: 'Marcus Reed', score: 0.58, reason: 'Right gender and authority, but reads as adult rather than senior.' },
  ],
};

const CastingSuggestPanel: React.FC<{
  characterName: string;
  onClose: () => void;
}> = ({ characterName, onClose }) => {
  const [status, setStatus] = useState<'running' | 'done'>('running');

  React.useEffect(() => {
    setStatus('running');
    const t = setTimeout(() => setStatus('done'), 900);
    return () => clearTimeout(t);
  }, [characterName]);

  const suggestions = SUGGESTIONS_BY_CHARACTER[characterName] ?? [];

  return (
    <Panel style={{ padding: 'var(--space-3)' }}>
      <Row gap={8} style={{ alignItems: 'center', marginBottom: 'var(--space-1)' }}>
        <Volume2 size={13} color="var(--action-primary)" aria-hidden="true" />
        <div style={{ fontSize: 'var(--type-callout)', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>
          Suggestions for {characterName}
        </div>
        <button
          type="button"
          aria-label="Close suggestions"
          onClick={onClose}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
        >
          <X size={13} />
        </button>
      </Row>

      {status === 'running' && (
        <Col gap={8} style={{ alignItems: 'center', padding: 'var(--space-3) 0' }}>
          <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-secondary)' }}>
            Scoring voices against {characterName}'s profile…
          </span>
          <ProgressBar pct={64} height={4} shimmer />
        </Col>
      )}

      {status === 'done' && suggestions.length === 0 && (
        <div style={{
          fontSize: 'var(--type-caption)', color: 'var(--text-muted)', fontStyle: 'italic',
          padding: 'var(--space-2) 0',
        }}>
          Not enough character description to confidently recommend a voice — add a description in Manuscript to improve matches.
        </div>
      )}

      {status === 'done' && suggestions.length > 0 && (
        <Col gap={6}>
          <span style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)' }}>
            Concept — Illustrative Scoring
          </span>
          {suggestions.map((s, i) => {
            const lowConfidence = s.score < 0.5;
            return (
              <div
                key={s.voiceName}
                style={{
                  border: '1px solid var(--hairline)', borderRadius: 'var(--radius-card)',
                  padding: 'var(--space-2) var(--space-3)',
                  background: i === 0 ? 'var(--accent-tint-bg)' : 'var(--surface-alt)',
                  opacity: lowConfidence ? 0.75 : 1,
                }}
              >
                <Row gap={8} style={{ alignItems: 'center', marginBottom: 3 }}>
                  <Avatar size={18} />
                  <span style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>{s.voiceName}</span>
                  <SemanticChip variant={s.score >= 0.8 ? 'success' : s.score >= 0.5 ? 'accent' : 'warning'}>
                    {Math.round(s.score * 100)}% match
                  </SemanticChip>
                </Row>
                <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-secondary)', lineHeight: 'var(--leading-snug)', marginBottom: 6 }}>
                  {s.reason}
                </div>
                <Row gap={6}>
                  <Btn small aria-label={`Preview ${s.voiceName}`}>
                    <Row gap={3} style={{ alignItems: 'center' }}><Play size={9} /> Preview</Row>
                  </Btn>
                  <Btn small primary>Assign to {characterName}</Btn>
                </Row>
              </div>
            );
          })}
          <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontStyle: 'italic', marginTop: 2 }}>
            Suggestions only — nothing is assigned until you confirm.
          </div>
        </Col>
      )}
    </Panel>
  );
};

export const CastingPane: React.FC = () => {
  const [selectedCharacter, setSelectedCharacter] = useState('Maren');
  const [suggestFor, setSuggestFor] = useState<string | null>(null);
  const selected = CHARACTERS_NON_NARRATOR.find(c => c.name === selectedCharacter) ?? CHARACTERS_NON_NARRATOR[0];

  return (
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
            <span style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--action-primary)' }}>
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
          {CHARACTERS_NON_NARRATOR.map((ch, i) => {
            const isSelected = ch.name === selectedCharacter;
            return (
              <Row
                key={ch.name}
                gap={0}
                onClick={() => { setSelectedCharacter(ch.name); setSuggestFor(null); }}
                style={{
                  padding: 'var(--space-2) var(--space-3)',
                  borderBottom: i < CHARACTERS_NON_NARRATOR.length - 1 ? 'var(--hairline)' : 'none',
                  alignItems: 'center',
                  cursor: 'pointer',
                  background: isSelected ? 'var(--accent-tint-bg)' : 'transparent',
                  borderLeft: isSelected ? '3px solid var(--action-primary)' : '3px solid transparent',
                  transition: 'background var(--dur-fast) var(--ease-standard)',
                }}
                onMouseEnter={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'var(--surface-alt)'; }}
                onMouseLeave={e => { if (!isSelected) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
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
            );
          })}
        </div>
      </Card>

      {/* Right detail panel */}
      <Col gap={12} style={{ flex: 1 }}>
        <Panel style={{ padding: 'var(--space-3)' }}>
          <Row gap={8} style={{ alignItems: 'center', marginBottom: 'var(--space-2)' }}>
            <Mic size={14} color="var(--action-primary)" aria-hidden="true" />
            <div style={{ fontSize: 'var(--type-callout)', fontWeight: 700, color: 'var(--text-primary)' }}>{selected.voice === 'Unassigned' ? selected.name : selected.voice}</div>
          </Row>
          <Col gap={8}>
            <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 'var(--leading-snug)' }}>
              {selected.description}
            </div>
            {selected.voice !== 'Unassigned' && (
              <Row gap={4} style={{ flexWrap: 'wrap' }}>
                {(VOICE_PILLS_BY_NAME[selected.voice] ?? []).map(p => (
                  <VoiceAttrPill key={p.category} category={p.category}>{p.label}</VoiceAttrPill>
                ))}
              </Row>
            )}
            <Btn small style={{ marginTop: 'var(--space-1)' }}>
              <Play size={10} style={{ marginRight: 3 }} aria-hidden="true" />
              Preview 15s
            </Btn>
            <Btn primary small>Assign to {selected.name}</Btn>
          </Col>
        </Panel>

        {suggestFor === selected.name ? (
          <CastingSuggestPanel characterName={selected.name} onClose={() => setSuggestFor(null)} />
        ) : (
          <Panel style={{ padding: 'var(--space-3)' }}>
            <Row gap={8} style={{ alignItems: 'center', marginBottom: 'var(--space-1)' }}>
              <Volume2 size={13} color="var(--action-primary)" aria-hidden="true" />
              <div style={{ fontSize: 'var(--type-callout)', fontWeight: 700, color: 'var(--text-primary)' }}>Suggest cast (AI)</div>
            </Row>
            <div style={{ fontSize: 'var(--type-caption)', color: 'var(--text-muted)', marginBottom: 'var(--space-2)', lineHeight: 'var(--leading-snug)' }}>
              Recommends voices for <strong>{selected.name}</strong> from your library — never auto-assigns.
            </div>
            <Btn primary small onClick={() => setSuggestFor(selected.name)}>Run suggestions</Btn>
          </Panel>
        )}
      </Col>
    </Row>
  );
};

// ---------------------------------------------------------------------------
// BackupsPane

const BACKUP_ENTRIES = [
  '2026-06-11 23:14 — auto (pre-assemble)',
  '2026-06-10 18:30 — manual',
  '2026-06-09 09:05 — auto',
];

export const BackupsPane: React.FC = () => {
  const [backupDesc, setBackupDesc] = useState('');
  const [includeAudio, setIncludeAudio] = useState(true);
  const [restoringBackup, setRestoringBackup] = useState<string | null>(null);

  return (
    <Col gap={12} className="ns-enter" style={{ flex: 1 }}>
      {/* Restore confirmation modal */}
      {restoringBackup && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'var(--overlay-backdrop)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Card style={{ maxWidth: 380, width: '90%', padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
            <div style={{ fontSize: 'var(--type-callout)', fontWeight: 700, color: 'var(--text-primary)' }}>Restore Backup?</div>
            <div style={{ fontSize: 'var(--type-caption)', color: 'var(--text-secondary)', lineHeight: 'var(--leading-snug)' }}>
              Are you sure you want to restore the backup from <strong>{restoringBackup}</strong>?
            </div>
            <div style={{ fontSize: 'var(--type-caption)', color: 'var(--action-danger, #c0392b)', background: 'rgba(192,57,43,.07)', border: '1px solid rgba(192,57,43,.2)', borderRadius: 'var(--radius-button)', padding: 'var(--space-2) var(--space-3)', lineHeight: 'var(--leading-snug)' }}>
              <strong>WARNING:</strong> Restoring this backup will overwrite all current chapters, audio files, and voice assignments. This action cannot be undone.
            </div>
            <Row gap={8} style={{ justifyContent: 'flex-end' }}>
              <Btn small onClick={() => setRestoringBackup(null)}>Cancel</Btn>
              <Btn primary small onClick={() => {
                alert(`Restored backup: ${restoringBackup}`);
                setRestoringBackup(null);
              }}>Restore</Btn>
            </Row>
          </Card>
        </div>
      )}

      <Card style={{ padding: 'var(--space-3) var(--space-4)', boxShadow: 'var(--shadow-md)' }}>
        <div style={{
          fontSize: 'var(--type-micro)', fontWeight: 700, letterSpacing: 'var(--tracking-wide)',
          textTransform: 'uppercase', color: 'var(--text-muted)', marginBottom: 'var(--space-2)',
        }}>Saved backups</div>
        <Col gap={4}>
          {BACKUP_ENTRIES.map(b => (
            <div key={b} style={{
              fontSize: 'var(--type-caption)', color: 'var(--text-secondary)', padding: 'var(--space-2) var(--space-3)',
              background: 'var(--surface-alt)', border: '1px solid var(--hairline)',
              borderRadius: 'var(--radius-button)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
            }}>
              <span>{b}</span>
              <button
                type="button"
                style={{ border: 0, background: 'transparent', padding: 0, fontFamily: 'inherit', fontSize: 'var(--type-caption)', fontWeight: 600, color: 'var(--action-primary)', cursor: 'pointer' }}
                onClick={() => setRestoringBackup(b)}
              >Restore</button>
            </div>
          ))}
          {/* Create backup */}
          <div style={{ padding: 'var(--space-3)', background: 'var(--surface-alt)', border: '1px dashed var(--border)', borderRadius: 'var(--radius-button)', marginTop: 'var(--space-1)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)' }}>
              <input
                value={backupDesc}
                onChange={e => setBackupDesc(e.target.value)}
                placeholder="Backup description…"
                style={{
                  flex: 1, fontSize: 'var(--type-caption)', padding: 'var(--space-1) var(--space-2)',
                  borderRadius: 'var(--radius-button)', border: '1px solid var(--border)',
                  background: 'var(--surface)', color: 'var(--text-primary)', outline: 'none',
                }}
              />
              <Btn primary small onClick={() => {
                alert(`Backup saved: "${backupDesc}" (audio included: ${includeAudio ? 'yes' : 'no'})`);
                setBackupDesc('');
              }}>Save</Btn>
            </div>
            <label style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={includeAudio}
                onChange={e => setIncludeAudio(e.target.checked)}
                style={{ cursor: 'pointer', width: 14, height: 14 }}
              />
              <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-muted)' }}>
                Include rendered audio files in backup (increases file size)
              </span>
            </label>
          </div>
        </Col>
      </Card>
    </Col>
  );
};

// Re-export shared primitives used by sibling modules that import from this barrel
export { Label, ProgressBar };
