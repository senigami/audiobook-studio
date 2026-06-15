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
import { Row, Col, Chip, Btn, ProgressBar, SemanticChip, Avatar, Card, Panel } from '../shared';
import { Play, RefreshCw, ChevronDown, ChevronUp, Download, ChevronLeft, ChevronRight, Square } from 'lucide-react';

// Speaker token palette — maps speaker IDs to fixed design-token colors (no raw hex)
// We use pill token families as named palette entries for the 4-speaker cast
const SPEAKER_TOKEN: Record<string, { text: string; tintBg: string; tintBorder: string }> = {
  Narrator:   { text: 'var(--success-text)',            tintBg: 'var(--success-tint-bg)',       tintBorder: 'var(--success)' },
  Maren:      { text: 'var(--pill-class-text)',          tintBg: 'var(--pill-class-bg)',         tintBorder: 'var(--pill-class-border)' },
  Dov:        { text: 'var(--pill-age-text)',            tintBg: 'var(--pill-age-bg)',           tintBorder: 'var(--pill-age-border)' },
  ElderRowan: { text: 'var(--pill-extended-text)',       tintBg: 'var(--pill-extended-bg)',      tintBorder: 'var(--pill-extended-border)' },
};

const SCRIPT_LINES = [
  { speaker: 'Narrator',  text: 'The gate groaned open on rusted hinges.' },
  { speaker: 'Maren',     text: "\"Stay close. The warden's lantern moves at dusk.\"" },
  { speaker: 'Dov',       text: '"How close?" He tightened his grip on the satchel.' },
  { speaker: 'Narrator',  text: 'The vale swallowed them whole.', rendering: true },
  { speaker: 'Maren',     text: '"Close enough that you can hear me breathe."' },
  { speaker: 'Narrator',  text: 'Far above, an owl called once, then fell silent.' },
  { speaker: 'Dov',       text: '"Right." He exhaled. "Right."' },
];

const PAINTABLE_SENTENCE_IDS = ['s1', 's2', 's3', 's4', 's5'] as const;
type SentenceId = typeof PAINTABLE_SENTENCE_IDS[number];

const CAST_SWATCHES: { id: string; name: string }[] = [
  { id: 'Narrator',   name: 'Narrator (default)' },
  { id: 'Maren',      name: 'Maren' },
  { id: 'Dov',        name: 'Dov' },
  { id: 'ElderRowan', name: 'Elder Rowan' },
];

// ---------- Resync Preview modal ----------
const ResyncModal: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div style={{
    position: 'fixed', inset: 0, zIndex: 200,
    background: 'var(--overlay-backdrop)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }}>
    <Panel style={{ padding: '18px 20px', width: 320, boxShadow: 'var(--shadow-xl)' }}>
      <div style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 12 }}>
        Resync Preview
      </div>
      <Card style={{ padding: '8px 10px', marginBottom: 10 }}>
        <div style={{ fontSize: 'var(--type-caption)', color: 'var(--text-primary)', marginBottom: 4 }}>
          Segments: <strong>184 → 186</strong>
        </div>
        <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-secondary)', marginBottom: 2 }}>
          Preserved assignments: <span style={{ color: 'var(--success-text)', fontWeight: 600 }}>179</span>
        </div>
        <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-secondary)' }}>
          Need re-assignment: <span style={{ color: 'var(--warning-text)', fontWeight: 600 }}>5</span>
        </div>
      </Card>
      <div style={{
        background: 'var(--warning-tint-bg)', border: '1px solid var(--warning-tint-border)',
        borderRadius: 'var(--radius-button)', padding: '6px 10px', marginBottom: 14,
        fontSize: 'var(--type-micro)', color: 'var(--warning-text)', lineHeight: 1.5,
      }}>
        Re-analysis preserves assignments best-effort — 5 segments may need manual reassignment after commit.
      </div>
      <Row gap={8} style={{ justifyContent: 'flex-end' }}>
        <Btn small onClick={onClose}>Cancel</Btn>
        <Btn small primary onClick={onClose} style={{ background: 'var(--success-strong)', border: '1px solid var(--success-strong)' }}>
          Commit &amp; re-analyze
        </Btn>
      </Row>
    </Panel>
  </div>
);

// ---------- Export dropdown ----------
const ExportMenu: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div style={{
    position: 'absolute', top: '100%', right: 0, zIndex: 50,
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-md)',
    minWidth: 100, padding: '4px 0',
  }}>
    {['WAV', 'MP3'].map(fmt => (
      <div key={fmt} onClick={onClose} style={{
        fontSize: 'var(--type-caption)', padding: '5px 12px', cursor: 'pointer',
        color: 'var(--text-primary)',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <Download size={11} aria-hidden="true" />
        {fmt}
      </div>
    ))}
  </div>
);

// ---------- Hover sentence controls ----------
const HoverSentenceControls: React.FC = () => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 4, marginLeft: 6,
    fontSize: 'var(--type-micro)', verticalAlign: 'middle',
  }}>
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 2,
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-round)', padding: '1px 6px', cursor: 'pointer',
      color: 'var(--pill-class-text)', fontSize: 'var(--type-micro)',
    }}>
      Maren <ChevronDown size={9} aria-hidden="true" />
    </span>
    <button aria-label="Preview segment" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)', display: 'flex', alignItems: 'center' }}>
      <Play size={13} />
    </button>
    <button aria-label="Rebuild segment" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
      <RefreshCw size={11} />
    </button>
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

  // Returns the token-based underline style for a sentence
  const speakerUnderline = (sid: SentenceId): React.CSSProperties => {
    const sp = sentenceSpeaker[sid];
    const tok = SPEAKER_TOKEN[sp] ?? SPEAKER_TOKEN.Narrator;
    return { borderBottom: `2px solid ${tok.text}`, paddingBottom: 1, cursor: armedSwatch ? 'crosshair' : 'default' };
  };

  const marenTok = SPEAKER_TOKEN[sentenceSpeaker.s2] ?? SPEAKER_TOKEN.Maren;
  const dovTok = SPEAKER_TOKEN[sentenceSpeaker.s5] ?? SPEAKER_TOKEN.Dov;

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
                fontSize: 'var(--type-caption)', fontWeight: 600, padding: '3px 10px',
                borderRadius: 'var(--radius-round)', cursor: 'pointer',
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
              fontSize: 'var(--type-micro)', padding: '2px 8px', borderRadius: 'var(--radius-round)', cursor: 'pointer',
              border: `1px solid ${safeText ? 'var(--accent)' : 'var(--border)'}`,
              background: safeText ? 'var(--accent-tint-bg)' : 'transparent',
              color: safeText ? 'var(--accent)' : 'var(--text-muted)',
            }}
          >Safe text</div>
          <div
            onClick={() => setShowNumbers(n => !n)}
            style={{
              fontSize: 'var(--type-micro)', padding: '2px 8px', borderRadius: 'var(--radius-round)', cursor: 'pointer',
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
          <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>
            12,403 chars · 2,118 words · 184 sentences · 186 segments · est. 14m 32s
          </span>
          <div style={{ flex: 1 }} />
          {/* Green badge — auto-fixed */}
          <SemanticChip variant="success">✓ 3/3 long sentences auto-fixed</SemanticChip>
          {/* Amber expandable badge */}
          <span
            onClick={() => setActionExpanded(v => !v)}
            style={{
              display: 'inline-flex', alignItems: 'center', gap: 3, cursor: 'pointer',
            }}
          >
            <SemanticChip variant="warning">
              ⚠ ACTION REQUIRED: 1 unresolvable
              {actionExpanded
                ? <ChevronUp size={9} style={{ marginLeft: 3 }} aria-hidden="true" />
                : <ChevronDown size={9} style={{ marginLeft: 3 }} aria-hidden="true" />
              }
            </SemanticChip>
          </span>
        </div>

        {/* Expanded action required row */}
        {actionExpanded && (
          <div style={{
            padding: '5px 12px 6px',
            background: 'var(--warning-tint-bg)',
            borderBottom: '1px solid var(--warning-tint-border)',
            flexShrink: 0,
          }}>
            <Card style={{ padding: '5px 10px', border: '1px solid var(--warning-tint-border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 'var(--type-micro)', color: 'var(--warning-text)', flex: 1, lineHeight: 1.5 }}>
                Segment 142: "Sira—who had never once spoken above a whisper in all her years at the vale and whom nobody could quite place—stepped forward." — too long, cannot auto-split (contains em-dash within dialogue attribution).
              </span>
              <Btn small>Edit</Btn>
            </Card>
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
              <SemanticChip variant="warning">2 unsaved text edits</SemanticChip>
              <div
                onClick={() => setShowResync(true)}
                style={{
                  fontSize: 'var(--type-micro)', fontWeight: 700, padding: '2px 9px',
                  borderRadius: 'var(--radius-button)',
                  background: 'var(--success-strong)', border: '1px solid var(--success-strong)',
                  color: 'var(--text-on-accent)',
                  cursor: 'pointer', whiteSpace: 'nowrap',
                }}
              >
                Commit changes
              </div>
              <div style={{ flex: 1 }} />
              {/* Chapter nav */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <div style={{
                  fontSize: 'var(--type-micro)', padding: '2px 8px',
                  borderRadius: 'var(--radius-button) 0 0 var(--radius-button)',
                  border: '1px solid var(--border)', background: 'var(--surface-alt)',
                  color: 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap',
                  display: 'flex', alignItems: 'center', gap: 3,
                }}>
                  <ChevronLeft size={10} aria-hidden="true" /> Save &amp; prev
                </div>
                <div style={{
                  fontSize: 'var(--type-micro)', padding: '2px 8px',
                  borderRadius: '0 var(--radius-button) var(--radius-button) 0',
                  border: '1px solid var(--border)', borderLeft: 'none',
                  background: 'var(--surface-alt)',
                  color: 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap',
                  display: 'flex', alignItems: 'center', gap: 3,
                }}>
                  Save &amp; next <ChevronRight size={10} aria-hidden="true" />
                </div>
              </div>
              {/* Export dropdown */}
              <div style={{ position: 'relative' }}>
                <div
                  onClick={() => setExportMenuOpen(m => !m)}
                  style={{
                    fontSize: 'var(--type-micro)', padding: '2px 8px',
                    borderRadius: 'var(--radius-button)',
                    border: '1px solid var(--border)', background: 'var(--surface-alt)',
                    color: 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap',
                    display: 'flex', alignItems: 'center', gap: 3,
                  }}
                >
                  Export <ChevronDown size={9} aria-hidden="true" />
                </div>
                {exportMenuOpen && <ExportMenu onClose={() => setExportMenuOpen(false)} />}
              </div>
            </div>

            {/* Paint-mode floating chip */}
            {armedSwatch && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 6,
                fontSize: 'var(--type-micro)',
                padding: '3px 8px', marginBottom: 8, borderRadius: 'var(--radius-round)',
                background: SPEAKER_TOKEN[armedSwatch]?.tintBg ?? 'var(--surface-alt)',
                border: `1px solid ${SPEAKER_TOKEN[armedSwatch]?.tintBorder ?? 'var(--border)'}`,
                color: SPEAKER_TOKEN[armedSwatch]?.text ?? 'var(--text-secondary)',
              }}>
                painting: {armedSwatch === 'ElderRowan' ? 'Elder Rowan' : armedSwatch} — click sentences to assign
              </div>
            )}

            {viewMode === 'book' ? (
              <Col gap={10}>
                {/* Editable chip row */}
                <SemanticChip variant="accent">
                  editable — edits re-analyze affected sections only
                </SemanticChip>

                {safeText && (
                  <SemanticChip variant="accent">
                    safe text is per-engine — may differ per section by voice
                  </SemanticChip>
                )}

                {/* Paragraph 1 */}
                <div style={{ fontSize: 'var(--type-callout)', lineHeight: 1.75, color: 'var(--text-primary)' }}>
                  {showNumbers && <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', marginRight: 4 }}>§1</span>}
                  <span style={speakerUnderline('s1')} onClick={() => handleSentenceClick('s1')}>
                    {safeText
                      ? 'The road went down through pale trees and old stone.'
                      : 'The road wound down through silver birch and pale stone, the kind of road that remembers every foot that has ever crossed it.'
                    }
                  </span>{' '}
                  <span style={{
                    background: 'var(--success-tint-bg)', borderRadius: 3, padding: '1px 3px',
                    cursor: 'pointer', position: 'relative', display: 'inline',
                  }}>
                    <Play size={9} style={{ marginRight: 3, color: 'var(--success-text)', verticalAlign: 'middle' }} aria-hidden="true" />
                    {safeText ? 'Maren pulled her cloak close.' : 'Maren pulled her cloak tighter against the chill that rose from the valley floor.'}
                  </span>{' '}
                  {showNumbers && <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', marginRight: 4 }}>§2</span>}
                  <span style={speakerUnderline('s2')} onClick={() => handleSentenceClick('s2')}>
                    {safeText ? 'The vale smelled of rain.' : 'The vale smelled of old rain and something older still — loam and iron and time.'}
                  </span>
                </div>

                {/* Paragraph 2 — with hover sentence controls on one sentence */}
                <div style={{ fontSize: 'var(--type-callout)', lineHeight: 1.75, color: 'var(--text-primary)' }}>
                  {showNumbers && <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', marginRight: 4 }}>§3</span>}
                  {/* Sentence with hover controls */}
                  <span style={{ position: 'relative', display: 'inline' }}>
                    <span style={{ ...speakerUnderline('s3') }} onClick={() => handleSentenceClick('s3')}>
                      {'"Stay close to me.'}
                    </span>
                    {/* per-section controls on hover — shown statically as demo */}
                    <HoverSentenceControls />
                    <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontStyle: 'italic', marginLeft: 4 }}>per-section controls on hover</span>
                  </span>{' '}
                  <span style={{ borderBottom: `2px solid ${marenTok.text}`, paddingBottom: 1 }}>
                    {safeText ? 'The warden moves at dusk."' : "The warden's lantern moves at dusk, and it moves fast.\""}
                  </span>{' '}
                  {showNumbers && <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', marginRight: 4 }}>§4</span>}
                  <span style={{
                    background: 'var(--accent-tint-bg)', borderRadius: 3, padding: '1px 3px', display: 'inline',
                  }}>
                    {safeText ? 'Dov tightened his grip.' : 'Dov tightened his grip on the satchel and said nothing for a long moment.'}
                    <span style={{ fontSize: 'var(--type-micro)', color: 'var(--accent)', fontStyle: 'italic', marginLeft: 5 }}>
                      rendering…
                    </span>
                  </span>{' '}
                  <span style={speakerUnderline('s4')} onClick={() => handleSentenceClick('s4')}>
                    {'"How close exactly?"'}
                  </span>
                </div>

                {/* Paragraph 3 */}
                <div style={{ fontSize: 'var(--type-callout)', lineHeight: 1.75, color: 'var(--text-primary)', position: 'relative' }}>
                  {showNumbers && <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', marginRight: 4 }}>§5</span>}
                  <span style={speakerUnderline('s5')} onClick={() => handleSentenceClick('s5')}>
                    {safeText ? 'The vale took them.' : 'Far above, an owl called once, then fell silent.'}
                  </span>{' '}
                  {showNumbers && <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', marginRight: 4 }}>§6</span>}
                  <span title='Mixed: "He excelled," = Dov; rest = Narrator'>
                    <span style={{ borderBottom: `2px solid ${dovTok.text}`, paddingBottom: 1 }}>
                      {'"He excelled,"'}
                    </span>
                    {' Dove said, rising from his chair.'}
                  </span>
                  <span style={{
                    display: 'inline-flex', alignItems: 'center', marginLeft: 6, fontSize: 'var(--type-micro)',
                    color: dovTok.text, background: dovTok.tintBg, border: `1px solid ${dovTok.tintBorder}`,
                    borderRadius: 'var(--radius-round)', padding: '1px 6px', cursor: 'default', verticalAlign: 'middle',
                  }}>
                    sub-sentence assignment (planned)
                  </span>
                </div>
              </Col>
            ) : (
              /* Script view */
              <Col gap={0}>
                <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 8 }}>
                  Script view — final read-through / play-script preview
                </div>
                {SCRIPT_LINES.map((line, i) => {
                  const tok = SPEAKER_TOKEN[line.speaker] ?? SPEAKER_TOKEN.Narrator;
                  return (
                    <div key={i} style={{
                      marginBottom: 6, borderRadius: 'var(--radius-card)', padding: '5px 8px',
                      background: line.rendering ? 'var(--accent-tint-bg)' : 'transparent',
                      border: line.rendering ? '1px solid var(--accent-tint-border)' : '1px solid transparent',
                    }}>
                      <Row gap={6} style={{ alignItems: 'center', marginBottom: 2 }}>
                        <span style={{ width: 7, height: 7, borderRadius: 'var(--radius-round)', background: tok.text, display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: tok.text, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                          {line.speaker}
                        </span>
                        {line.rendering && (
                          <SemanticChip variant="accent">rendering…</SemanticChip>
                        )}
                      </Row>
                      <div style={{ fontSize: 'var(--type-caption)', color: 'var(--text-primary)', lineHeight: 1.5, paddingLeft: 13 }}>
                        {line.text}
                      </div>
                      {line.rendering && (
                        <div style={{ marginTop: 4, paddingLeft: 13 }}>
                          <ProgressBar pct={64} height={3} shimmer />
                        </div>
                      )}
                    </div>
                  );
                })}
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
              fontSize: 'var(--type-micro)',
              fontWeight: 'var(--type-weight-micro)' as unknown as number,
              letterSpacing: '0.08em', textTransform: 'uppercase',
              color: 'var(--text-muted)', padding: '0 10px 6px', borderBottom: '1px solid var(--border)', flexShrink: 0,
            }}>Cast</div>
            <Col gap={0} style={{ flex: 1, padding: '6px 0' }}>
              {CAST_SWATCHES.map(sw => {
                const isArmed = armedSwatch === sw.id;
                const tok = SPEAKER_TOKEN[sw.id] ?? SPEAKER_TOKEN.Narrator;
                return (
                  <div
                    key={sw.id}
                    onClick={() => handleSwatchClick(sw.id)}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 7, padding: '5px 10px',
                      cursor: 'pointer',
                      background: isArmed ? tok.tintBg : 'transparent',
                      borderLeft: isArmed ? `3px solid ${tok.text}` : '3px solid transparent',
                    }}
                  >
                    <span style={{
                      width: 8, height: 8, borderRadius: 'var(--radius-round)', background: tok.text,
                      flexShrink: 0, display: 'inline-block',
                      boxShadow: isArmed ? `0 0 0 2px ${tok.tintBorder}` : 'none',
                    }} />
                    {/* Avatar replaces emoji */}
                    <Avatar name={sw.id === 'ElderRowan' ? 'ER' : sw.id} size={20} style={{
                      background: tok.tintBg,
                      border: `1px solid ${tok.tintBorder}`,
                    }} />
                    <span style={{
                      fontSize: 'var(--type-micro)', fontWeight: isArmed ? 700 : 400,
                      color: isArmed ? tok.text : 'var(--text-secondary)',
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
              fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.4,
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
          <Btn primary small>
            <Play size={10} style={{ marginRight: 3 }} aria-hidden="true" />
            Render chapter
          </Btn>
          <Btn small>Render remaining</Btn>
          {/* Stop all — uses error token, no raw hex */}
          <button
            aria-label="Stop all rendering"
            style={{
              fontSize: 'var(--type-micro)', fontWeight: 600, padding: '2px 9px',
              borderRadius: 'var(--radius-button)',
              border: '1px solid var(--error)', color: 'var(--error)', background: 'transparent',
              cursor: 'pointer', whiteSpace: 'nowrap',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}
          >
            <Square size={9} aria-hidden="true" />
            Stop all
          </button>
          <div style={{ flex: 1 }} />
          <Chip active>XTTS v2</Chip>
          <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>ETA ~12m</span>
        </div>
      </Col>
    </>
  );
};
