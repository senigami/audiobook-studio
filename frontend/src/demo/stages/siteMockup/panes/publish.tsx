/**
 * siteMockup/panes/publish.tsx — Publish pane
 * Feature C:
 *  - "Assemble M4B" switches assembly card to selection mode (checkbox list of chapters,
 *    Select all, only Rendered enabled, Cancel / Confirm Assembly (N))
 *  - Assembly-progress strip at top when confirmed (static 42%)
 *  - Create-backup row (description input + Save)
 */
import React, { useState } from 'react';
import { Row, Col, Chip, Btn, ProgressBar, PlannedChip } from '../shared';

type ChapterLifecycle = 'Draft' | 'Ready' | 'Cast' | 'Rendered';

const ASSEMBLE_CHAPTERS: { n: number; title: string; lifecycle: ChapterLifecycle }[] = [
  { n: 1, title: 'The Hollow Road', lifecycle: 'Rendered' },
  { n: 2, title: 'Ember in the Dark', lifecycle: 'Rendered' },
  { n: 3, title: 'Voices Underground', lifecycle: 'Rendered' },
  { n: 4, title: 'A Vale at Dusk', lifecycle: 'Cast' },
  { n: 5, title: 'Silver and Stone', lifecycle: 'Ready' },
  { n: 6, title: "The Warden's Keep", lifecycle: 'Draft' },
  { n: 7, title: 'Whispers at Threshold', lifecycle: 'Draft' },
];

const RENDERED_CHAPTER_NS = ASSEMBLE_CHAPTERS.filter(c => c.lifecycle === 'Rendered').map(c => c.n);

export const PublishPane: React.FC = () => {
  const [assembleMode, setAssembleMode] = useState<'idle' | 'selecting' | 'assembling'>('idle');
  const [selectedChapters, setSelectedChapters] = useState<Set<number>>(new Set(RENDERED_CHAPTER_NS));
  const [backupDesc, setBackupDesc] = useState('');

  const renderedCount = selectedChapters.size;

  const toggleChapter = (n: number) => {
    if (!RENDERED_CHAPTER_NS.includes(n)) return; // only rendered chapters enabled
    setSelectedChapters(prev => {
      const next = new Set(prev);
      if (next.has(n)) next.delete(n); else next.add(n);
      return next;
    });
  };

  const toggleSelectAll = () => {
    if (selectedChapters.size === RENDERED_CHAPTER_NS.length) {
      setSelectedChapters(new Set());
    } else {
      setSelectedChapters(new Set(RENDERED_CHAPTER_NS));
    }
  };

  return (
    <Row gap={10} style={{ flex: 1, alignItems: 'stretch' }}>
      {/* Left: assembly card */}
      <Col gap={8} style={{ flex: 1 }}>

        {/* Assembly progress strip — shown when assembling */}
        {assembleMode === 'assembling' && (
          <div style={{
            background: 'var(--accent-tint-bg)', border: '1px solid var(--accent)',
            borderRadius: 6, padding: '8px 12px',
          }}>
            <Row gap={6} style={{ alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--accent)', flex: 1 }}>
                Assembling M4B…
              </span>
              <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>42%</span>
            </Row>
            <ProgressBar pct={42} shimmer />
            <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginTop: 4 }}>
              Merging {renderedCount} chapters — do not close Studio
            </div>
          </div>
        )}

        {/* Assembly card */}
        <div style={{
          background: 'var(--surface-alt)', border: '1px solid var(--border)',
          borderRadius: 8, padding: '12px', textAlign: 'center',
        }}>
          <div style={{ fontSize: '2rem', marginBottom: 6 }}>📕</div>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 2 }}>
            The Whispering Vale
          </div>
          <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', marginBottom: 8 }}>
            Runtime: 6h 12m · {RENDERED_CHAPTER_NS.length}/{ASSEMBLE_CHAPTERS.length} chapters rendered
          </div>
          <Row gap={4} style={{ justifyContent: 'center', marginBottom: 8 }}>
            <ProgressBar pct={Math.round(RENDERED_CHAPTER_NS.length / ASSEMBLE_CHAPTERS.length * 100)} height={4} />
          </Row>

          {assembleMode === 'idle' && (
            <Btn primary onClick={() => setAssembleMode('selecting')}>Assemble M4B</Btn>
          )}

          {assembleMode === 'selecting' && (
            <Col gap={6} style={{ textAlign: 'left' }}>
              {/* Select all toggle */}
              <div
                onClick={toggleSelectAll}
                style={{
                  fontSize: '0.6rem', fontWeight: 700, color: 'var(--accent)',
                  cursor: 'pointer', padding: '2px 0',
                }}
              >
                {selectedChapters.size === RENDERED_CHAPTER_NS.length ? '☑ Deselect all' : '☐ Select all rendered'}
              </div>
              <Col gap={0} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 5, overflow: 'hidden' }}>
                {ASSEMBLE_CHAPTERS.map((ch, i) => {
                  const isRendered = ch.lifecycle === 'Rendered';
                  const isChecked = selectedChapters.has(ch.n);
                  return (
                    <div
                      key={ch.n}
                      onClick={() => toggleChapter(ch.n)}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '4px 8px',
                        borderBottom: i < ASSEMBLE_CHAPTERS.length - 1 ? '1px solid var(--border)' : 'none',
                        cursor: isRendered ? 'pointer' : 'default',
                        opacity: isRendered ? 1 : 0.4,
                      }}
                    >
                      <span style={{ fontSize: '0.65rem', color: isRendered && isChecked ? 'var(--accent)' : 'var(--text-muted)' }}>
                        {isRendered ? (isChecked ? '☑' : '☐') : '○'}
                      </span>
                      <span style={{ fontSize: '0.6rem', color: 'var(--text-primary)', flex: 1 }}>
                        Ch {ch.n} · {ch.title}
                      </span>
                      <span style={{
                        fontSize: '0.52rem', padding: '1px 5px', borderRadius: 10,
                        background: ch.lifecycle === 'Rendered' ? '#22c55e22' : 'var(--surface-alt)',
                        border: `1px solid ${ch.lifecycle === 'Rendered' ? '#22c55e55' : 'var(--border)'}`,
                        color: ch.lifecycle === 'Rendered' ? '#22c55e' : 'var(--text-muted)',
                        whiteSpace: 'nowrap',
                      }}>
                        {ch.lifecycle}
                      </span>
                    </div>
                  );
                })}
              </Col>
              <Row gap={6} style={{ justifyContent: 'flex-end', marginTop: 4 }}>
                <Btn small onClick={() => setAssembleMode('idle')}>Cancel</Btn>
                <Btn
                  small primary
                  disabled={selectedChapters.size === 0}
                  onClick={() => setAssembleMode('assembling')}
                >
                  Confirm Assembly ({selectedChapters.size})
                </Btn>
              </Row>
            </Col>
          )}

          {assembleMode === 'assembling' && (
            <Btn small onClick={() => setAssembleMode('idle')}>Cancel assembly</Btn>
          )}
        </div>
      </Col>

      {/* Right: book info + export + backups */}
      <Col gap={8} style={{ flex: 2 }}>
        {/* Book info section */}
        <div style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
          <div style={{
            padding: '6px 10px', borderBottom: '1px solid var(--border)',
            background: 'var(--surface)',
            fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)',
            textTransform: 'uppercase', letterSpacing: '0.06em',
          }}>Book info</div>

          {/* Cover row */}
          <Row gap={0} style={{ padding: '8px 10px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
            <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', width: 60, flexShrink: 0 }}>Cover</span>
            <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
              <div style={{
                width: 32, height: 44, borderRadius: 4,
                background: 'linear-gradient(135deg, #6366f133 0%, #8b5cf633 100%)',
                border: '1px solid var(--border)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.2rem', flexShrink: 0,
              }}>📕</div>
              <Btn small>Change cover</Btn>
            </div>
          </Row>

          {/* Editable metadata rows */}
          {[
            { label: 'Title', value: 'The Whispering Vale' },
            { label: 'Author', value: 'E. Holloway' },
            { label: 'Narrator', value: 'Studio Voice' },
            { label: 'Series', value: 'The Vale Chronicles, #1' },
          ].map(row => (
            <Row key={row.label} gap={0} style={{ padding: '6px 10px', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
              <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', width: 60, flexShrink: 0 }}>{row.label}</span>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-primary)', flex: 1 }}>{row.value}</span>
              <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>✎</span>
            </Row>
          ))}

          {/* Read-only info chips */}
          <Row gap={6} style={{ padding: '6px 10px', flexWrap: 'wrap', alignItems: 'center' }}>
            <span style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', width: 60, flexShrink: 0 }}>Info</span>
            <Chip>6h 12m</Chip>
            <Chip color="#8b5cf6">predicted 6h 28m</Chip>
            <Chip>Created 2026-05-14</Chip>
          </Row>
        </div>

        {/* Export row */}
        <div>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)', padding: '4px 0 2px' }}>Export</div>
          <Row gap={6} style={{ marginTop: 4 }}>
            <Btn primary small>⬇ M4B</Btn>
            <Btn small>⬇ MP3</Btn>
            <Btn small>⬇ EPUB3</Btn>
          </Row>
        </div>

        {/* Backups */}
        <div>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-secondary)', padding: '4px 0 2px' }}>Backups</div>
          <Col gap={4} style={{ marginTop: 4 }}>
            {[
              '2026-06-11 23:14 — auto (pre-assemble)',
              '2026-06-10 18:30 — manual',
              '2026-06-09 09:05 — auto',
            ].map(b => (
              <div key={b} style={{
                fontSize: '0.6rem', color: 'var(--text-muted)', padding: '4px 8px',
                background: 'var(--surface-alt)', border: '1px solid var(--border)',
                borderRadius: 4, display: 'flex', justifyContent: 'space-between',
              }}>
                <span>{b}</span>
                <span style={{ color: 'var(--accent)', cursor: 'pointer' }}>Restore</span>
              </div>
            ))}
            {/* Create backup row */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '4px 8px',
              background: 'var(--surface-alt)', border: '1px dashed var(--border)',
              borderRadius: 4,
            }}>
              <input
                value={backupDesc}
                onChange={e => setBackupDesc(e.target.value)}
                placeholder="Backup description…"
                style={{
                  flex: 1, fontSize: '0.6rem', padding: '2px 6px',
                  borderRadius: 4, border: '1px solid var(--border)',
                  background: 'var(--surface)', color: 'var(--text-primary)', outline: 'none',
                }}
              />
              <Btn small>Save</Btn>
            </div>
          </Col>
        </div>

        {/* Coming soon */}
        <Col gap={6}>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)', padding: '4px 0 2px' }}>Coming soon</div>
          <Row gap={8} style={{ alignItems: 'center', padding: '5px 8px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 5 }}>
            <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', flex: 1 }}>
              Loudness QA — RMS/peak check before export
            </span>
            <PlannedChip />
          </Row>
          <Row gap={8} style={{ alignItems: 'center', padding: '5px 8px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 5 }}>
            <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', flex: 1 }}>
              Pronunciation lexicon — book-level say-as rules
            </span>
            <PlannedChip />
          </Row>
        </Col>
      </Col>
    </Row>
  );
};
