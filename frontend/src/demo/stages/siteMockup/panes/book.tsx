/**
 * siteMockup/panes/book.tsx — BookPane container, ManuscriptPane, CastingPane
 * Feature B: "+ New chapter" opens Add Chapter modal (Title, paste textarea, upload row, Cancel/Add)
 */
import React, { useState } from 'react';
import { Row, Col, Label, Chip, Btn, ProgressBar, PlannedChip } from '../shared';

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

const LIFECYCLE_COLORS: Record<ChapterLifecycle, string> = {
  Draft:    '#6b7280',
  Ready:    '#3b82f6',
  Cast:     '#8b5cf6',
  Rendered: '#22c55e',
};

const LifecyclePill: React.FC<{ lifecycle: ChapterLifecycle }> = ({ lifecycle }) => {
  const c = LIFECYCLE_COLORS[lifecycle];
  return (
    <span style={{
      fontSize: '0.55rem',
      padding: '1px 6px',
      borderRadius: 20,
      border: `1px solid ${c}55`,
      background: c + '22',
      color: c,
      whiteSpace: 'nowrap',
      display: 'inline-flex',
      alignItems: 'center',
      fontWeight: 600,
    }}>
      {lifecycle}
    </span>
  );
};

// ---------- Add Chapter modal ----------
const AddChapterModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
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
        borderRadius: 10, padding: '18px 20px', width: 340,
        boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
      }}>
        <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 14 }}>Add Chapter</div>
        {/* Title */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginBottom: 3 }}>Title</div>
          <input
            value={title}
            onChange={e => setTitle(e.target.value)}
            placeholder="Chapter title…"
            style={{
              width: '100%', boxSizing: 'border-box',
              fontSize: '0.65rem', padding: '5px 8px',
              borderRadius: 5, border: '1px solid var(--border)',
              background: 'var(--surface-alt)', color: 'var(--text-primary)', outline: 'none',
            }}
          />
        </div>
        {/* Paste textarea */}
        <div style={{ marginBottom: 10 }}>
          <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', marginBottom: 3 }}>Or paste text</div>
          <textarea
            rows={4}
            placeholder="Paste chapter text here…"
            style={{
              width: '100%', boxSizing: 'border-box',
              fontSize: '0.62rem', padding: '5px 8px',
              borderRadius: 5, border: '1px solid var(--border)',
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
          borderRadius: 6, background: 'var(--surface-alt)', marginBottom: 14,
        }}>
          <span style={{ fontSize: '0.7rem' }}>⬆</span>
          <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', flex: 1 }}>or upload a file (.txt, .docx, .epub)</span>
          <Btn small>Choose file</Btn>
        </div>
        <Row gap={8} style={{ justifyContent: 'flex-end' }}>
          <Btn small onClick={onClose}>Cancel</Btn>
          <Btn small primary>Add</Btn>
        </Row>
      </div>
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

  const selectedChapter = MANUSCRIPT_CHAPTERS.find(c => c.n === selectedChapterN)!;
  const isProduced = selectedChapter.lifecycle === 'Cast' || selectedChapter.lifecycle === 'Rendered';
  const isUnlocked = unlockedChapters.has(selectedChapterN);
  const isEditable = !isProduced || isUnlocked;

  const handleChapterClick = (n: number) => {
    setSelectedChapterN(n);
    setShowWarning(null);
  };

  const handleEditClick = () => {
    setShowWarning(selectedChapterN);
  };

  const handleEditAnyway = () => {
    setUnlockedChapters(prev => new Set([...prev, selectedChapterN]));
    setShowWarning(null);
  };

  // Editor panel (right side)
  const EditorPanel = (
    <Col gap={0} style={{
      flex: 1,
      background: 'var(--surface-alt)',
      border: '1px solid var(--border)',
      borderRadius: 6,
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
        <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>
          Ch {selectedChapter.n} · {selectedChapter.title}
        </span>

        {/* Focus mode toggle */}
        <div
          onClick={() => setFocusMode(f => !f)}
          style={{
            fontSize: '0.58rem',
            padding: '2px 7px',
            borderRadius: 20,
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
          {focusMode ? 'Exit focus' : 'Focus ✎'}
        </div>

        {/* Status chip */}
        {isEditable ? (
          <span style={{
            fontSize: '0.55rem',
            padding: '1px 7px',
            borderRadius: 10,
            border: '1px solid #22c55e55',
            background: '#22c55e18',
            color: '#22c55e',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            whiteSpace: 'nowrap',
          }}>
            editing — autosaved ✓
          </span>
        ) : (
          <span style={{
            fontSize: '0.55rem',
            padding: '1px 7px',
            borderRadius: 10,
            border: '1px solid var(--border)',
            background: 'var(--surface)',
            color: 'var(--text-muted)',
            display: 'inline-flex',
            alignItems: 'center',
            gap: 3,
            whiteSpace: 'nowrap',
          }}>
            🔒 read-only — this chapter is cast &amp; rendered
          </span>
        )}
      </Row>

      {/* Produced + unlocked amber strip */}
      {isProduced && isUnlocked && (
        <div style={{
          fontSize: '0.58rem',
          color: '#92400e',
          background: '#fef3c7',
          borderBottom: '1px solid #fbbf24',
          padding: '3px 10px',
          flexShrink: 0,
        }}>
          editing a produced chapter
        </div>
      )}

      {/* Warning banner */}
      {showWarning === selectedChapterN && (
        <div style={{
          background: '#fffbeb',
          border: '1px solid #fbbf2488',
          borderRadius: 0,
          padding: '8px 10px',
          flexShrink: 0,
          borderBottom: '1px solid var(--border)',
        }}>
          <div style={{ fontSize: '0.62rem', color: '#92400e', marginBottom: 6, lineHeight: 1.5 }}>
            Editing re-analyzes this chapter. Voice assignments are matched best-effort — some may be lost.
          </div>
          <Row gap={6}>
            <div
              onClick={handleEditAnyway}
              style={{
                fontSize: '0.6rem', fontWeight: 700, padding: '3px 10px', borderRadius: 5,
                background: '#f59e0b', border: '1px solid #d97706', color: '#fff', cursor: 'pointer',
              }}
            >
              Edit anyway
            </div>
            <div
              onClick={() => setShowWarning(null)}
              style={{
                fontSize: '0.6rem', fontWeight: 600, padding: '3px 10px', borderRadius: 5,
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
                fontSize: '0.72rem',
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
                fontSize: '0.72rem',
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
              <div key={i} style={{ fontSize: '0.72rem', lineHeight: 1.75, color: 'var(--text-secondary)' }}>
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
        <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', flex: 1 }}>
          1,842 words
        </span>
        {!isEditable && showWarning !== selectedChapterN && (
          <div
            onClick={handleEditClick}
            style={{
              fontSize: '0.6rem', fontWeight: 600, padding: '2px 8px', borderRadius: 5,
              background: 'var(--surface-alt)', border: '1px solid var(--border)',
              color: 'var(--text-secondary)', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center',
            }}
          >
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
          fontSize: '0.55rem',
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
            borderRadius: 6,
            overflow: 'hidden',
          }}>
            <Row gap={6} style={{
              padding: '6px 10px',
              borderBottom: '1px solid var(--border)',
              background: 'var(--surface)',
              alignItems: 'center',
              flexShrink: 0,
            }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>
                Ch {selectedChapter.n} · {selectedChapter.title}
              </span>
              <span style={{
                fontSize: '0.55rem', padding: '1px 7px', borderRadius: 10,
                border: '1px solid #22c55e55', background: '#22c55e18', color: '#22c55e',
                display: 'inline-flex', alignItems: 'center', gap: 3, whiteSpace: 'nowrap',
              }}>
                editing — autosaved ✓
              </span>
              <div
                onClick={() => setFocusMode(false)}
                style={{
                  fontSize: '0.58rem', padding: '2px 7px', borderRadius: 20, cursor: 'pointer',
                  border: '1px solid var(--accent)', background: 'var(--accent-tint-bg)',
                  color: 'var(--accent)', whiteSpace: 'nowrap',
                }}
              >
                Exit focus
              </div>
            </Row>
            <div style={{ flex: 1, overflowY: 'auto', padding: '14px 16px' }}>
              <Col gap={10}>
                <div
                  contentEditable
                  suppressContentEditableWarning
                  style={{ fontSize: '0.82rem', lineHeight: 1.85, color: 'var(--text-primary)', outline: 'none', background: 'transparent' }}
                >
                  The road wound down through silver birch and pale stone, the kind of road that remembers every foot that has ever crossed it. Maren pulled her cloak tighter against the chill that rose from the valley floor.
                </div>
                <div
                  contentEditable
                  suppressContentEditableWarning
                  style={{ fontSize: '0.82rem', lineHeight: 1.85, color: 'var(--text-primary)', outline: 'none', background: 'transparent' }}
                >
                  The vale smelled of old rain and something older still — loam and iron and time. Far above, an owl called once, then fell silent.
                </div>
              </Col>
            </div>
            <div style={{ padding: '5px 10px', borderTop: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
              <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>1,842 words</span>
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
            <Col gap={0} style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
              <Row gap={0} style={{ padding: '5px 10px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
                {['#', 'Title', 'Words', 'Stage'].map((h, i) => (
                  <div key={h} style={{
                    fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-muted)',
                    textTransform: 'uppercase', letterSpacing: '0.06em',
                    flex: i === 1 ? 3 : 1, textAlign: i > 1 ? 'right' : 'left',
                  }}>
                    {h}
                  </div>
                ))}
              </Row>
              {MANUSCRIPT_CHAPTERS.map((ch, i) => {
                const isSelected = ch.n === selectedChapterN;
                return (
                  <Row
                    key={ch.n} gap={0}
                    onClick={() => handleChapterClick(ch.n)}
                    style={{
                      padding: '5px 10px',
                      borderBottom: i < MANUSCRIPT_CHAPTERS.length - 1 ? '1px solid var(--border)' : 'none',
                      alignItems: 'center', cursor: 'pointer',
                      background: isSelected ? 'var(--accent-tint-bg)' : 'transparent',
                      borderLeft: isSelected ? '3px solid var(--accent)' : '3px solid transparent',
                    }}
                  >
                    <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', flex: 1 }}>{ch.n}</div>
                    <div style={{
                      fontSize: '0.62rem',
                      color: isSelected ? 'var(--accent)' : 'var(--text-primary)',
                      fontWeight: isSelected ? 700 : 500,
                      flex: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    }}>
                      {ch.title}
                    </div>
                    <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', flex: 1, textAlign: 'right' }}>
                      {ch.words.toLocaleString()}
                    </div>
                    <div style={{ flex: 1, textAlign: 'right' }}>
                      <LifecyclePill lifecycle={ch.lifecycle} />
                    </div>
                  </Row>
                );
              })}
            </Col>

            {/* Compact import row */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '5px 10px', border: '1px dashed var(--border)',
              borderRadius: 6, background: 'var(--surface-alt)',
            }}>
              <span style={{ fontSize: '0.7rem' }}>⬆</span>
              <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', flex: 1 }}>
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
// Casting pane (unchanged)

const CHARACTERS_NON_NARRATOR = [
  { name: 'Maren', color: '#6366f1', lines: 142, voice: 'Studio Voice' },
  { name: 'Dov', color: '#f59e0b', lines: 88, voice: 'Marcus Reed' },
  { name: 'The Warden', color: '#ef4444', lines: 34, voice: 'Old Tom' },
  { name: 'Sira', color: '#ec4899', lines: 29, voice: 'Unassigned' },
];

export const CastingPane: React.FC = () => (
  <Row gap={10} style={{ flex: 1, alignItems: 'stretch' }}>
    {/* Character table */}
    <Col gap={0} style={{ flex: 2, background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
      <Row gap={0} style={{ padding: '5px 10px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        {['Character', 'Lines', 'Voice'].map(h => (
          <div key={h} style={{
            fontSize: '0.58rem', fontWeight: 700, color: 'var(--text-muted)',
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
          <div style={{
            width: 20, height: 20, borderRadius: '50%',
            background: 'var(--accent-tint-bg)', border: '1px solid var(--accent)',
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '0.65rem', flexShrink: 0,
          }}>🎙</div>
          <span style={{ fontSize: '0.68rem', fontWeight: 700, color: 'var(--accent)' }}>
            Narrator <span style={{ fontWeight: 400, color: 'var(--text-muted)', fontSize: '0.6rem' }}>(default)</span>
          </span>
        </Row>
        <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', flex: 1 }}>—</div>
        <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
          <span style={{
            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
            width: 16, height: 16, borderRadius: '50%',
            background: 'var(--accent-tint-bg)', border: '1px solid var(--border)',
            fontSize: '0.55rem', marginRight: 4, verticalAlign: 'middle',
          }}>🎙</span>
          <span style={{ fontSize: '0.62rem', color: 'var(--text-primary)' }}>Elena Marsh</span>
          <Chip color="#6b7280">fallback for any unassigned line</Chip>
        </div>
      </Row>

      {CHARACTERS_NON_NARRATOR.map((ch, i) => (
        <Row key={ch.name} gap={0} style={{
          padding: '6px 10px',
          borderBottom: i < CHARACTERS_NON_NARRATOR.length - 1 ? '1px solid var(--border)' : 'none',
          alignItems: 'center',
        }}>
          <Row gap={6} style={{ flex: 1, alignItems: 'center' }}>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: ch.color, flexShrink: 0, display: 'inline-block' }} />
            <span style={{ fontSize: '0.68rem', fontWeight: 600, color: 'var(--text-primary)' }}>{ch.name}</span>
          </Row>
          <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', flex: 1 }}>{ch.lines}</div>
          <div style={{ flex: 1 }}>
            <span style={{
              fontSize: '0.62rem',
              color: ch.voice === 'Unassigned' ? 'var(--text-muted)' : 'var(--text-primary)',
              fontStyle: ch.voice === 'Unassigned' ? 'italic' : 'normal',
            }}>
              {ch.voice !== 'Unassigned' && (
                <span style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  width: 16, height: 16, borderRadius: '50%',
                  background: 'var(--accent-tint-bg)', border: '1px solid var(--border)',
                  fontSize: '0.55rem', marginRight: 4, verticalAlign: 'middle',
                }}>🎙</span>
              )}
              {ch.voice}
            </span>
          </div>
        </Row>
      ))}
    </Col>

    {/* Right panel */}
    <Col gap={8} style={{ flex: 1 }}>
      <div style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>🎙 Studio Voice</div>
        <Col gap={6}>
          <Row gap={4} style={{ flexWrap: 'wrap' }}>
            <Chip color="#6366f1">Narrator</Chip>
            <Chip color="#ec4899">Female</Chip>
            <Chip color="#f59e0b">Adult</Chip>
            <Chip color="#22c55e">Warm</Chip>
          </Row>
          <Btn small style={{ marginTop: 4 }}>▶ Preview 15s</Btn>
          <Btn primary small>Assign to Maren</Btn>
        </Col>
      </div>
      <div style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 8, padding: '10px 12px' }}>
        <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 4 }}>✨ Suggest cast (AI)</div>
        <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)', marginBottom: 8 }}>
          Recommends voices per character — never auto-assigns.
        </div>
        <Btn small>Run suggestions</Btn>
      </div>
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
  { text: 'Dov tightened his grip on the satchel.', state: 'future' },
  { text: 'Far above, an owl called once, then fell silent.', state: 'future' },
  { text: '"Right," he exhaled. "Right."', state: 'future' },
];

export const ReviewPane: React.FC = () => (
  <Col gap={0} style={{ flex: 1, minHeight: 0 }}>
    {/* Transport row + waveform */}
    <div style={{
      background: 'var(--surface-alt)', border: '1px solid var(--border)',
      borderRadius: 6, padding: '6px 10px', marginBottom: 8, flexShrink: 0,
    }}>
      <Row gap={6} style={{ alignItems: 'center', marginBottom: 6 }}>
        <span style={{ fontSize: '0.8rem', cursor: 'pointer' }}>⏮</span>
        <span style={{ fontSize: '0.72rem', cursor: 'pointer', color: 'var(--text-muted)' }}>⏪5s</span>
        <span style={{ fontSize: '0.9rem', cursor: 'pointer', color: 'var(--accent)' }}>▶</span>
        <span style={{ fontSize: '0.72rem', cursor: 'pointer', color: 'var(--text-muted)' }}>5s⏩</span>
        <Chip active>Chapter 7</Chip>
        <div style={{ flex: 1 }} />
        <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>§18 / §42</span>
      </Row>
      {/* Inline waveform mock */}
      <div style={{ height: 32, display: 'flex', alignItems: 'center', gap: 1 }}>
        {[4,8,14,20,28,18,24,30,22,16,26,32,24,18,12,20,28,22,16,10,18,26,30,20,14,8,16,24,18,10].map((h, i) => (
          <div key={i} style={{
            flex: 1, height: `${h / 32 * 100}%`,
            background: i > 8 && i < 18 ? 'var(--accent)' : 'var(--border)',
            borderRadius: 2, opacity: i > 8 && i < 18 ? 0.9 : 0.5,
          }} />
        ))}
      </div>
    </div>

    <Row gap={10} style={{ flex: 1, alignItems: 'stretch', minHeight: 0 }}>
      <Col gap={0} style={{ flex: 2, minHeight: 0 }}>
        <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 6 }}>
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
                  fontSize: '0.7rem', lineHeight: 1.65,
                  color: isPast ? 'var(--text-muted)' : 'var(--text-primary)',
                  padding: '3px 6px', borderRadius: 4,
                  background: isPlaying ? 'var(--accent-tint-bg)' : isRerendering ? 'rgba(139,92,246,0.08)' : 'transparent',
                  border: isPlaying ? '1px solid var(--accent)' : isRerendering ? '1px solid #8b5cf655' : '1px solid transparent',
                  cursor: 'pointer', fontWeight: isPlaying ? 600 : 400,
                  opacity: isPast ? 0.55 : 1,
                  display: 'flex', alignItems: 'center', gap: 6,
                }}>
                  <span style={{ flex: 1 }}>{s.text}</span>
                  {isRerendering && (
                    <span style={{ fontSize: '0.52rem', color: '#8b5cf6', fontStyle: 'italic', whiteSpace: 'nowrap' }}>
                      re-rendering — highlight follows progress, like Studio build view
                    </span>
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
          <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', fontStyle: 'italic', flex: 1 }}>
            notes attach to sections — re-renders don't shift them
          </span>
        </Row>
        <Col gap={6} style={{ flex: 1, overflowY: 'auto' }}>
          {[
            { section: '§14', note: "Mispronounced 'Vale' — needs re-render" },
            { section: '§22', note: 'Pause too long after sentence end' },
            { section: '§31', note: "Narrator volume dips on 'stone'" },
          ].map(ann => (
            <div key={ann.section} style={{
              background: 'var(--surface-alt)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '6px 8px',
            }}>
              <Row gap={6} style={{ alignItems: 'center', marginBottom: 4 }}>
                <Chip>{ann.section}</Chip>
                <span style={{ flex: 1, fontSize: '0.62rem', color: 'var(--text-secondary)', lineHeight: 1.4 }}>
                  {ann.note}
                </span>
              </Row>
              <Btn small>Re-render section</Btn>
            </div>
          ))}
          <div style={{ fontSize: '0.62rem', color: 'var(--accent)', cursor: 'pointer', padding: '4px 2px' }}>
            + Add note on §18 (playing)
          </div>
        </Col>
      </Col>
    </Row>
  </Col>
);

// Export unused but referenced items so lint is happy
export { Label, PlannedChip, ProgressBar };
