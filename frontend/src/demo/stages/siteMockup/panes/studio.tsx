/**
 * siteMockup/panes/studio.tsx — Studio pane
 * Feature D:
 *  - Chapter-nav cluster (top-right of prose column): ← Save & prev · Save & next → + Export ▾ (WAV/MP3)
 *  - "Commit changes" green button with "2 unsaved text edits" chip → Resync Preview modal
 *  - Analysis strip under view-mode pills: stats + green badge + expandable amber ACTION REQUIRED badge
 *  - One prose sentence has hover-look inline controls (voice select chip, ▶, ↻ rebuild)
 *  - "Stop all" red ghost button next to render controls
 */
import React, { useState } from 'react';
import { Row, Col, Chip, Btn, ProgressBar } from '../shared';

const SCRIPT_LINES = [
  { speaker: 'Narrator', color: '#22c55e', text: 'The gate groaned open on rusted hinges.' },
  { speaker: 'Maren', color: '#6366f1', text: "\"Stay close. The warden's lantern moves at dusk.\"" },
  { speaker: 'Dov', color: '#f59e0b', text: '"How close?" He tightened his grip on the satchel.' },
  { speaker: 'Narrator', color: '#22c55e', text: 'The vale swallowed them whole.', rendering: true },
  { speaker: 'Maren', color: '#6366f1', text: '"Close enough that you can hear me breathe."' },
  { speaker: 'Narrator', color: '#22c55e', text: 'Far above, an owl called once, then fell silent.' },
  { speaker: 'Dov', color: '#f59e0b', text: '"Right." He exhaled. "Right."' },
];

const PAINTABLE_SENTENCE_IDS = ['s1', 's2', 's3', 's4', 's5'] as const;
type SentenceId = typeof PAINTABLE_SENTENCE_IDS[number];

const CAST_SWATCHES: { id: string; name: string; dot: string; avatar: string }[] = [
  { id: 'Narrator', name: 'Narrator (default)', dot: '#6b7280', avatar: '🎙' },
  { id: 'Maren',    name: 'Maren',              dot: '#6366f1', avatar: '👩' },
  { id: 'Dov',      name: 'Dov',                dot: '#f59e0b', avatar: '🧑' },
  { id: 'ElderRowan', name: 'Elder Rowan',       dot: '#0d9488', avatar: '🧓' },
];

const SPEAKER_COLOR: Record<string, string> = {
  Narrator: '#22c55e',
  Maren: '#6366f1',
  Dov: '#f59e0b',
  ElderRowan: '#0d9488',
};

// ---------- Resync Preview modal ----------
const ResyncModal: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div style={{
    position: 'fixed', inset: 0, zIndex: 200,
    background: 'rgba(0,0,0,0.45)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }}>
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '18px 20px', width: 320,
      boxShadow: '0 8px 32px rgba(0,0,0,0.3)',
    }}>
      <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
        Resync Preview
      </div>
      <div style={{
        background: 'var(--surface-alt)', border: '1px solid var(--border)',
        borderRadius: 6, padding: '8px 10px', marginBottom: 10,
      }}>
        <div style={{ fontSize: '0.65rem', color: 'var(--text-primary)', marginBottom: 4 }}>
          Segments: <strong>184 → 186</strong>
        </div>
        <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', marginBottom: 2 }}>
          Preserved assignments: <span style={{ color: '#22c55e', fontWeight: 600 }}>179</span>
        </div>
        <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)' }}>
          Need re-assignment: <span style={{ color: '#f59e0b', fontWeight: 600 }}>5</span>
        </div>
      </div>
      <div style={{
        background: '#fef3c7', border: '1px solid #fbbf24',
        borderRadius: 5, padding: '6px 10px', marginBottom: 14,
        fontSize: '0.6rem', color: '#92400e', lineHeight: 1.5,
      }}>
        ⚠ Re-analysis preserves assignments best-effort — 5 segments may need manual reassignment after commit.
      </div>
      <Row gap={8} style={{ justifyContent: 'flex-end' }}>
        <Btn small onClick={onClose}>Cancel</Btn>
        <Btn small primary onClick={onClose} style={{ background: '#22c55e', border: '1px solid #16a34a' }}>Commit &amp; re-analyze</Btn>
      </Row>
    </div>
  </div>
);

// ---------- Export dropdown ----------
const ExportMenu: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div style={{
    position: 'absolute', top: '100%', right: 0, zIndex: 50,
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
    minWidth: 100, padding: '4px 0',
  }}>
    {['WAV', 'MP3'].map(fmt => (
      <div key={fmt} onClick={onClose} style={{ fontSize: '0.65rem', padding: '5px 12px', cursor: 'pointer', color: 'var(--text-primary)' }}>
        ⬇ {fmt}
      </div>
    ))}
  </div>
);

// ---------- Hover sentence controls ----------
const HoverSentenceControls: React.FC = () => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 6,
    fontSize: '0.58rem', verticalAlign: 'middle',
  }}>
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 2,
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, padding: '1px 6px', cursor: 'pointer',
      color: '#6366f1', fontSize: '0.58rem',
    }}>Maren ▾</span>
    <span style={{ cursor: 'pointer', color: 'var(--accent)', fontSize: '0.65rem' }}>▶</span>
    <span style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.65rem' }} title="Rebuild">↻</span>
  </span>
);

export const StudioPane: React.FC = () => {
  const [viewMode, setViewMode] = useState<'book' | 'script'>('book');
  const [safeText, setSafeText] = useState(false);
  const [showNumbers, setShowNumbers] = useState(false);
  const [armedSwatch, setArmedSwatch] = useState<string | null>(null);
  const [sentenceSpeaker, setSentenceSpeaker] = useState<Record<SentenceId, string>>({
    s1: 'Narrator', s2: 'Maren', s3: 'Dov', s4: 'Narrator', s5: 'Dov',
  });
  const [showResync, setShowResync] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [actionExpanded, setActionExpanded] = useState(false);

  const handleSwatchClick = (id: string) => {
    setArmedSwatch(prev => (prev === id ? null : id));
  };

  const handleSentenceClick = (sid: SentenceId) => {
    if (!armedSwatch) return;
    setSentenceSpeaker(prev => ({ ...prev, [sid]: armedSwatch }));
  };

  const speakerUnderline = (sid: SentenceId) => {
    const sp = sentenceSpeaker[sid];
    const color = SPEAKER_COLOR[sp] ?? '#6b7280';
    return { borderBottom: `2px solid ${color}`, paddingBottom: 1, cursor: armedSwatch ? 'crosshair' : 'default' };
  };

  const marenColor = sentenceSpeaker.s2 ? SPEAKER_COLOR[sentenceSpeaker.s2] : '#6366f1';
  const dovColor = sentenceSpeaker.s3 ? SPEAKER_COLOR[sentenceSpeaker.s3] : '#f59e0b';

  return (
    <>
      {showResync && <ResyncModal onClose={() => setShowResync(false)} />}

      <Col gap={0} style={{ flex: 1, overflow: 'hidden' }}>
        {/* View mode pills row */}
        <div style={{
          padding: '6px 12px',
          borderBottom: '1px solid var(--border)',
          display: 'flex', alignItems: 'center', gap: 6,
          background: 'var(--surface)', flexShrink: 0,
        }}>
          {(['book', 'script'] as const).map(mode => (
            <div
              key={mode}
              onClick={() => setViewMode(mode)}
              style={{
                fontSize: '0.65rem', fontWeight: 600, padding: '3px 10px', borderRadius: 20, cursor: 'pointer',
                border: `1px solid ${viewMode === mode ? 'var(--accent)' : 'var(--border)'}`,
                background: viewMode === mode ? 'var(--accent-tint-bg)' : 'var(--surface-alt)',
                color: viewMode === mode ? 'var(--accent)' : 'var(--text-secondary)',
                textTransform: 'capitalize',
              }}
            >
              {mode === 'book' ? 'Book view' : 'Script view'}
            </div>
          ))}
          <div style={{ flex: 1 }} />
          {/* Safe text / # toggles */}
          <div
            onClick={() => setSafeText(s => !s)}
            style={{
              fontSize: '0.6rem', padding: '2px 8px', borderRadius: 20, cursor: 'pointer',
              border: `1px solid ${safeText ? 'var(--accent)' : 'var(--border)'}`,
              background: safeText ? 'var(--accent-tint-bg)' : 'transparent',
              color: safeText ? 'var(--accent)' : 'var(--text-muted)',
            }}
          >Safe text</div>
          <div
            onClick={() => setShowNumbers(n => !n)}
            style={{
              fontSize: '0.6rem', padding: '2px 8px', borderRadius: 20, cursor: 'pointer',
              border: `1px solid ${showNumbers ? 'var(--accent)' : 'var(--border)'}`,
              background: showNumbers ? 'var(--accent-tint-bg)' : 'transparent',
              color: showNumbers ? 'var(--accent)' : 'var(--text-muted)',
            }}
          >#</div>
        </div>

        {/* Analysis strip */}
        <div style={{
          padding: '4px 12px',
          borderBottom: '1px solid var(--border)',
          background: 'var(--surface-alt)',
          display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>
            12,403 chars · 2,118 words · 184 sentences · 186 segments · est. 14m 32s
          </span>
          <div style={{ flex: 1 }} />
          {/* Green badge — auto-fixed */}
          <span style={{
            fontSize: '0.55rem', padding: '1px 6px', borderRadius: 10,
            background: '#22c55e22', border: '1px solid #22c55e55', color: '#22c55e',
            whiteSpace: 'nowrap',
          }}>
            ✓ 3/3 long sentences auto-fixed
          </span>
          {/* Amber expandable badge */}
          <span
            onClick={() => setActionExpanded(v => !v)}
            style={{
              fontSize: '0.55rem', padding: '1px 6px', borderRadius: 10,
              background: '#fef3c722', border: '1px solid #fbbf2455', color: '#d97706',
              whiteSpace: 'nowrap', cursor: 'pointer',
              display: 'inline-flex', alignItems: 'center', gap: 3,
            }}
          >
            ⚠ ACTION REQUIRED: 1 unresolvable {actionExpanded ? '▴' : '▾'}
          </span>
        </div>

        {/* Expanded action required row */}
        {actionExpanded && (
          <div style={{
            padding: '5px 12px 6px',
            background: '#fef3c788',
            borderBottom: '1px solid #fbbf2455',
            flexShrink: 0,
          }}>
            <div style={{
              background: 'var(--surface)', border: '1px solid #fbbf24',
              borderRadius: 5, padding: '5px 10px',
              display: 'flex', alignItems: 'center', gap: 8,
            }}>
              <span style={{ fontSize: '0.62rem', color: '#92400e', flex: 1, lineHeight: 1.5 }}>
                Segment 142: "Sira—who had never once spoken above a whisper in all her years at the vale and whom nobody could quite place—stepped forward." — too long, cannot auto-split (contains em-dash within dialogue attribution).
              </span>
              <Btn small>Edit</Btn>
            </div>
          </div>
        )}

        {/* Main row: prose + cast palette */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Content area — prose */}
          <div style={{ flex: 1, overflowY: 'auto', padding: '10px 14px' }}>
            {/* Chapter-nav cluster + unsaved chip + Commit changes */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8, flexWrap: 'wrap',
            }}>
              {/* Unsaved chip + Commit */}
              <span style={{
                fontSize: '0.55rem', padding: '1px 7px', borderRadius: 10,
                background: '#fef3c722', border: '1px solid #fbbf2455', color: '#d97706',
                whiteSpace: 'nowrap',
              }}>
                2 unsaved text edits
              </span>
              <div
                onClick={() => setShowResync(true)}
                style={{
                  fontSize: '0.6rem', fontWeight: 700, padding: '2px 9px', borderRadius: 5,
                  background: '#22c55e', border: '1px solid #16a34a', color: '#fff',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                Commit changes
              </div>
              <div style={{ flex: 1 }} />
              {/* Chapter nav */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <div style={{
                  fontSize: '0.58rem', padding: '2px 8px', borderRadius: '4px 0 0 4px',
                  border: '1px solid var(--border)', background: 'var(--surface-alt)',
                  color: 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap',
                }}>
                  ← Save &amp; prev
                </div>
                <div style={{
                  fontSize: '0.58rem', padding: '2px 8px', borderRadius: '0 4px 4px 0',
                  border: '1px solid var(--border)', borderLeft: 'none',
                  background: 'var(--surface-alt)',
                  color: 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap',
                }}>
                  Save &amp; next →
                </div>
              </div>
              {/* Export dropdown */}
              <div style={{ position: 'relative' }}>
                <div
                  onClick={() => setExportMenuOpen(m => !m)}
                  style={{
                    fontSize: '0.58rem', padding: '2px 8px', borderRadius: 4,
                    border: '1px solid var(--border)', background: 'var(--surface-alt)',
                    color: 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  Export ▾
                </div>
                {exportMenuOpen && <ExportMenu onClose={() => setExportMenuOpen(false)} />}
              </div>
            </div>

            {/* Paint-mode floating chip */}
            {armedSwatch && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '0.6rem',
                padding: '3px 8px', marginBottom: 8, borderRadius: 20,
                background: (SPEAKER_COLOR[armedSwatch] ?? '#6b7280') + '22',
                border: `1px solid ${(SPEAKER_COLOR[armedSwatch] ?? '#6b7280')}55`,
                color: SPEAKER_COLOR[armedSwatch] ?? '#6b7280',
              }}>
                🖌 painting: {armedSwatch === 'ElderRowan' ? 'Elder Rowan' : armedSwatch} — click sentences to assign
              </div>
            )}

            {viewMode === 'book' ? (
              <Col gap={10}>
                {/* Editable chip row */}
                <div style={{
                  fontSize: '0.58rem', color: 'var(--accent)',
                  background: 'var(--accent-tint-bg)', border: '1px solid var(--accent)',
                  borderRadius: 4, padding: '3px 8px',
                  display: 'inline-flex', alignItems: 'center', gap: 4,
                }}>
                  <span>✏</span>
                  <span>editable — edits re-analyze affected sections only</span>
                </div>

                {safeText && (
                  <div style={{
                    fontSize: '0.58rem', color: 'var(--accent)',
                    background: 'var(--accent-tint-bg)', border: '1px solid var(--accent)',
                    borderRadius: 4, padding: '3px 8px',
                  }}>
                    safe text is per-engine — may differ per section by voice
                  </div>
                )}

                {/* Paragraph 1 */}
                <div style={{ fontSize: '0.72rem', lineHeight: 1.75, color: 'var(--text-primary)' }}>
                  {showNumbers && <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginRight: 4 }}>§1</span>}
                  <span style={speakerUnderline('s1')} onClick={() => handleSentenceClick('s1')}>
                    {safeText
                      ? 'The road went down through pale trees and old stone.'
                      : 'The road wound down through silver birch and pale stone, the kind of road that remembers every foot that has ever crossed it.'
                    }
                  </span>{' '}
                  <span style={{
                    background: 'rgba(34,197,94,0.10)', borderRadius: 3, padding: '1px 3px',
                    cursor: 'pointer', position: 'relative', display: 'inline',
                  }}>
                    <span style={{ fontSize: '0.6rem', marginRight: 3, color: '#22c55e' }}>▶</span>
                    {safeText ? 'Maren pulled her cloak close.' : 'Maren pulled her cloak tighter against the chill that rose from the valley floor.'}
                  </span>{' '}
                  {showNumbers && <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginRight: 4 }}>§2</span>}
                  <span style={speakerUnderline('s2')} onClick={() => handleSentenceClick('s2')}>
                    {safeText ? 'The vale smelled of rain.' : 'The vale smelled of old rain and something older still — loam and iron and time.'}
                  </span>
                </div>

                {/* Paragraph 2 — with hover sentence controls on one sentence */}
                <div style={{ fontSize: '0.72rem', lineHeight: 1.75, color: 'var(--text-primary)' }}>
                  {showNumbers && <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginRight: 4 }}>§3</span>}
                  {/* Sentence with hover controls */}
                  <span style={{ position: 'relative', display: 'inline' }}>
                    <span style={{ ...speakerUnderline('s3') }} onClick={() => handleSentenceClick('s3')}>
                      {'"Stay close to me.'}
                    </span>
                    {/* per-section controls on hover — shown statically as demo */}
                    <HoverSentenceControls />
                    <span style={{ fontSize: '0.52rem', color: 'var(--text-muted)', fontStyle: 'italic', marginLeft: 4 }}>per-section controls on hover</span>
                  </span>{' '}
                  <span style={{ borderBottom: `2px solid ${marenColor}`, paddingBottom: 1 }}>
                    {safeText ? 'The warden moves at dusk."' : "The warden's lantern moves at dusk, and it moves fast.\""}
                  </span>{' '}
                  {showNumbers && <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginRight: 4 }}>§4</span>}
                  <span style={{
                    background: 'var(--accent-tint-bg)', borderRadius: 3, padding: '1px 3px', display: 'inline',
                  }}>
                    {safeText ? 'Dov tightened his grip.' : 'Dov tightened his grip on the satchel and said nothing for a long moment.'}
                    <span style={{ fontSize: '0.55rem', color: 'var(--accent)', fontStyle: 'italic', marginLeft: 5 }}>
                      rendering…
                    </span>
                  </span>{' '}
                  <span style={speakerUnderline('s4')} onClick={() => handleSentenceClick('s4')}>
                    {'"How close exactly?"'}
                  </span>
                </div>

                {/* Paragraph 3 */}
                <div style={{ fontSize: '0.72rem', lineHeight: 1.75, color: 'var(--text-primary)', position: 'relative' }}>
                  {showNumbers && <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginRight: 4 }}>§5</span>}
                  <span style={speakerUnderline('s5')} onClick={() => handleSentenceClick('s5')}>
                    {safeText ? 'The vale took them.' : 'Far above, an owl called once, then fell silent.'}
                  </span>{' '}
                  {showNumbers && <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginRight: 4 }}>§6</span>}
                  <span title='Mixed: "He excelled," = Dov; rest = Narrator'>
                    <span style={{ borderBottom: `2px solid ${dovColor}`, paddingBottom: 1 }}>
                      {'"He excelled,"'}
                    </span>
                    {' Dove said, rising from his chair.'}
                  </span>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', marginLeft: 6, fontSize: '0.52rem',
                    color: dovColor, background: dovColor + '18', border: `1px solid ${dovColor}55`,
                    borderRadius: 10, padding: '1px 6px', cursor: 'default', verticalAlign: 'middle',
                  }}>
                    sub-sentence assignment (planned)
                  </span>
                </div>
              </Col>
            ) : (
              /* Script view */
              <Col gap={0}>
                <div style={{ fontSize: '0.58rem', color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 8 }}>
                  Script view — final read-through / play-script preview
                </div>
                {SCRIPT_LINES.map((line, i) => (
                  <div key={i} style={{
                    marginBottom: 6, borderRadius: 6, padding: '5px 8px',
                    background: line.rendering ? 'var(--accent-tint-bg)' : 'transparent',
                    border: line.rendering ? '1px solid var(--accent)' : '1px solid transparent',
                  }}>
                    <Row gap={6} style={{ alignItems: 'center', marginBottom: 2 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: line.color, display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ fontSize: '0.58rem', fontWeight: 700, color: line.color, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                        {line.speaker}
                      </span>
                      {line.rendering && (
                        <span style={{ fontSize: '0.55rem', color: 'var(--accent)', fontStyle: 'italic', marginLeft: 4 }}>
                          rendering…
                        </span>
                      )}
                    </Row>
                    <div style={{ fontSize: '0.68rem', color: 'var(--text-primary)', lineHeight: 1.5, paddingLeft: 13 }}>
                      {line.text}
                    </div>
                    {line.rendering && (
                      <div style={{ marginTop: 4, paddingLeft: 13 }}>
                        <ProgressBar pct={64} height={3} shimmer />
                      </div>
                    )}
                  </div>
                ))}
              </Col>
            )}
          </div>

          {/* Cast palette — right column, ~150px */}
          <div style={{
            width: 150, flexShrink: 0,
            borderLeft: '1px solid var(--border)',
            background: 'var(--surface)',
            display: 'flex', flexDirection: 'column', padding: '8px 0 0',
          }}>
            <div style={{
              fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase',
              color: 'var(--text-muted)', padding: '0 10px 6px', borderBottom: '1px solid var(--border)', flexShrink: 0,
            }}>Cast</div>
            <Col gap={0} style={{ flex: 1, padding: '6px 0' }}>
              {CAST_SWATCHES.map(sw => {
                const isArmed = armedSwatch === sw.id;
                return (
                  <div
                    key={sw.id}
                    onClick={() => handleSwatchClick(sw.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7, padding: '5px 10px',
                      cursor: 'pointer',
                      background: isArmed ? sw.dot + '18' : 'transparent',
                      borderLeft: isArmed ? `3px solid ${sw.dot}` : '3px solid transparent',
                      outline: isArmed ? `1px solid ${sw.dot}44` : 'none',
                      outlineOffset: -1,
                    }}
                  >
                    <span style={{
                      width: 8, height: 8, borderRadius: '50%', background: sw.dot,
                      flexShrink: 0, display: 'inline-block',
                      boxShadow: isArmed ? `0 0 0 2px ${sw.dot}44` : 'none',
                    }} />
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%',
                      background: sw.dot + '22', border: `1px solid ${sw.dot}55`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '0.7rem', flexShrink: 0,
                    }}>
                      {sw.avatar}
                    </div>
                    <span style={{
                      fontSize: '0.6rem', fontWeight: isArmed ? 700 : 400,
                      color: isArmed ? sw.dot : 'var(--text-secondary)',
                      lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                    }}>
                      {sw.name}
                    </span>
                  </div>
                );
              })}
            </Col>
            <div style={{
              padding: '6px 10px 8px', borderTop: '1px solid var(--border)',
              fontSize: '0.52rem', color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.4,
            }}>
              paint a voice, then click text to assign — sub-sentence spans planned
            </div>
          </div>
        </div>

        {/* Render controls strip */}
        <div style={{
          flexShrink: 0, borderTop: '1px solid var(--border)', padding: '6px 12px',
          display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface)',
        }}>
          <Btn primary small>▶ Render chapter</Btn>
          <Btn small>Render remaining</Btn>
          {/* Stop all — red ghost */}
          <div style={{
            fontSize: '0.6rem', fontWeight: 600, padding: '2px 9px', borderRadius: 5,
            border: '1px solid #ef4444', color: '#ef4444', background: 'transparent',
            cursor: 'pointer', whiteSpace: 'nowrap',
          }}>
            ⏹ Stop all
          </div>
          <div style={{ flex: 1 }} />
          <Chip active>XTTS v2</Chip>
          <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>ETA ~12m</span>
        </div>
      </Col>
    </>
  );
};
