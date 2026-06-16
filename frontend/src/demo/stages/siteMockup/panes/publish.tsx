/**
 * siteMockup/panes/publish.tsx — Publish pane
 * Feature C:
 *  - "Assemble M4B" switches assembly card to selection mode (checkbox list of chapters,
 *    Select all, only Rendered enabled, Cancel / Confirm Assembly (N))
 *  - Assembly-progress strip at top when confirmed (static 42%)
 *  - Create-backup row (description input + Save)
 */
import React, { useState, useEffect } from 'react';
import { Row, Col, Btn, ProgressBar, Card, SemanticChip, BookCover, Panel } from '../shared';
import { Check, Square, Download, Edit3 } from 'lucide-react';

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

const LIFECYCLE_VARIANT: Record<ChapterLifecycle, 'success' | 'warning' | 'cloud' | 'neutral'> = {
  Rendered: 'success',
  Cast:     'cloud',
  Ready:    'warning',
  Draft:    'neutral',
};

const RENDERED_CHAPTER_NS = ASSEMBLE_CHAPTERS.filter(c => c.lifecycle === 'Rendered').map(c => c.n);

export const PublishPane: React.FC = () => {
  const [assembleMode, setAssembleMode] = useState<'idle' | 'selecting' | 'assembling' | 'assembled'>('idle');
  const [selectedChapters, setSelectedChapters] = useState<Set<number>>(new Set(RENDERED_CHAPTER_NS));
  const [backupDesc, setBackupDesc] = useState('');
  const [includeAudio, setIncludeAudio] = useState(true);
  const [restoringBackup, setRestoringBackup] = useState<string | null>(null);

  const [assemblyProgress, setAssemblyProgress] = useState(42);

  const renderedCount = selectedChapters.size;

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (assembleMode === 'assembling') {
      setAssemblyProgress(42);
      interval = setInterval(() => {
        setAssemblyProgress(p => {
          if (p >= 100) {
            clearInterval(interval);
            setAssembleMode('assembled');
            return 100;
          }
          return p + 10;
        });
      }, 300);
    }
    return () => clearInterval(interval);
  }, [assembleMode]);

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

  const allSelected = selectedChapters.size === RENDERED_CHAPTER_NS.length;

  return (
    <div className="ns-enter" style={{ display: 'contents' }}>
      {restoringBackup && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 300,
          background: 'var(--overlay-backdrop)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}>
          <Panel style={{ padding: 'var(--space-4) var(--space-5)', width: 320, boxShadow: 'var(--shadow-xl)' }}>
            <div style={{ fontSize: 'var(--type-headline)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>
              Restore Backup?
            </div>
            <div style={{ fontSize: 'var(--type-caption)', color: 'var(--text-secondary)', marginBottom: 'var(--space-3)', lineHeight: 'var(--leading-normal)' }}>
              Are you sure you want to restore the backup from <strong>{restoringBackup}</strong>?
              <br /><br />
              <span style={{ color: 'var(--error)' }}>
                <strong>WARNING:</strong> Restoring this backup will overwrite all current chapters, audio files, and voice assignments. This action cannot be undone.
              </span>
            </div>
            <Row gap={8} style={{ justifyContent: 'flex-end' }}>
              <Btn small onClick={() => setRestoringBackup(null)}>Cancel</Btn>
              <Btn small primary onClick={() => {
                alert(`Restored backup: ${restoringBackup}`);
                setRestoringBackup(null);
              }} style={{ background: 'var(--error)', border: '1px solid var(--error)' }}>
                Restore &amp; Overwrite
              </Btn>
            </Row>
          </Panel>
        </div>
      )}

      <Row className="ns-publish-grid" gap={16} style={{ flex: 1, alignItems: 'stretch' }}>
        {/* Left: assembly card */}
        <Col gap={12} style={{ flex: 1 }}>

          {/* Assembly progress strip — shown when assembling */}
          {assembleMode === 'assembling' && (
            <Card style={{
              background: 'var(--accent-tint-bg)',
              border: '1px solid var(--accent-tint-border)',
              padding: 'var(--space-3) var(--space-4)',
              boxShadow: 'var(--shadow-md)',
            }}>
              <Row gap={8} style={{ alignItems: 'center', marginBottom: 'var(--space-1)' }}>
                <span style={{ fontSize: 'var(--type-callout)', fontWeight: 700, color: 'var(--accent)', flex: 1 }}>
                  Assembling M4B…
                </span>
                <span style={{ fontSize: 'var(--type-caption)', fontWeight: 600, color: 'var(--accent)' }}>{assemblyProgress}%</span>
              </Row>
              <ProgressBar pct={assemblyProgress} height={6} shimmer />
              <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', marginTop: 'var(--space-1)' }}>
                Merging {renderedCount} chapters — do not close Studio
              </div>
            </Card>
          )}

          {/* Assembly card */}
          {assembleMode !== 'assembled' ? (
            <Card style={{ padding: 'var(--space-4)', textAlign: 'center' }}>
              {/* BookCover replaces 📕 emoji */}
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--space-3)' }}>
                <BookCover title="The Whispering Vale" size={76} />
              </div>
              <div style={{ fontSize: 'var(--type-callout)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--space-1)', letterSpacing: 'var(--tracking-tight)' }}>
                The Whispering Vale
              </div>
              <div style={{ fontSize: 'var(--type-caption)', color: 'var(--text-muted)', marginBottom: 'var(--space-3)' }}>
                Runtime: 6h 12m · {RENDERED_CHAPTER_NS.length}/{ASSEMBLE_CHAPTERS.length} chapters rendered
              </div>
              <Row gap={4} style={{ justifyContent: 'center', marginBottom: 'var(--space-4)' }}>
                <ProgressBar pct={Math.round(RENDERED_CHAPTER_NS.length / ASSEMBLE_CHAPTERS.length * 100)} height={5} />
              </Row>

              {assembleMode === 'idle' && (
                <Btn primary onClick={() => setAssembleMode('selecting')}>Assemble M4B</Btn>
              )}

              {assembleMode === 'selecting' && (
                <Col gap={8} style={{ textAlign: 'left' }}>
                  {/* Select all toggle */}
                  <div
                    onClick={toggleSelectAll}
                    aria-label={allSelected ? 'Deselect all chapters' : 'Select all rendered chapters'}
                    style={{
                      fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--accent)',
                      cursor: 'pointer', padding: 'var(--space-1) 0',
                      display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                    }}
                  >
                    {allSelected
                      ? <Check size={14} aria-hidden="true" />
                      : <Square size={14} aria-hidden="true" />
                    }
                    {allSelected ? 'Deselect all' : 'Select all rendered'}
                  </div>
                  <Card style={{ overflow: 'hidden' }} className="ns-stagger">
                    {ASSEMBLE_CHAPTERS.map((ch, i) => {
                      const isRendered = ch.lifecycle === 'Rendered';
                      const isChecked = selectedChapters.has(ch.n);
                      return (
                        <div
                          key={ch.n}
                          onClick={() => toggleChapter(ch.n)}
                          style={{
                            display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                            padding: 'var(--space-2) var(--space-3)',
                            borderBottom: i < ASSEMBLE_CHAPTERS.length - 1 ? '1px solid var(--hairline)' : 'none',
                            cursor: isRendered ? 'pointer' : 'default',
                            opacity: isRendered ? 1 : 0.4,
                          }}
                        >
                          {isRendered ? (
                            isChecked
                              ? <Check size={15} color="var(--accent)" aria-hidden="true" />
                              : <Square size={15} color="var(--text-muted)" aria-hidden="true" />
                          ) : (
                            <Square size={15} color="var(--text-muted)" aria-hidden="true" />
                          )}
                          <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-primary)', flex: 1 }}>
                            Ch {ch.n} · {ch.title}
                          </span>
                          <SemanticChip variant={LIFECYCLE_VARIANT[ch.lifecycle]}>
                            {ch.lifecycle}
                          </SemanticChip>
                        </div>
                      );
                    })}
                  </Card>
                  <Row gap={8} style={{ justifyContent: 'flex-end', marginTop: 'var(--space-1)' }}>
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
            </Card>
          ) : (
            <Card style={{
              background: 'var(--success-tint-bg)', border: '1px solid var(--success-tint-border)',
              padding: 'var(--space-4)', textAlign: 'center', display: 'flex', flexDirection: 'column', alignItems: 'center'
            }}>
              <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--space-3)' }}>
                <BookCover title="The Whispering Vale" size={76} />
              </div>
              <div style={{ fontSize: 'var(--type-callout)', fontWeight: 700, color: 'var(--success-text)', marginBottom: 'var(--space-2)', letterSpacing: 'var(--tracking-tight)' }}>
                Assembly Completed Successfully!
              </div>
              <div style={{ fontSize: 'var(--type-caption)', color: 'var(--text-secondary)', marginBottom: 'var(--space-3)', lineHeight: 'var(--leading-normal)', textAlign: 'left', width: '100%' }}>
                <strong>Completed File Parameters:</strong>
                <ul style={{ margin: 'var(--space-1) 0 0 var(--space-3)', padding: 0 }}>
                  <li>Cover Image: Pinned (The Whispering Vale)</li>
                  <li>File Size: 184.2 MB</li>
                  <li>Duration: 6 hours 12 minutes</li>
                  <li>Channels: Mono (64 kbps, Speech Optimized)</li>
                </ul>
              </div>
              <div style={{ width: '100%', borderTop: '1px solid var(--hairline)', paddingTop: 'var(--space-3)', marginTop: 'var(--space-1)' }}>
                <div style={{ fontSize: 'var(--type-caption)', fontWeight: 600, color: 'var(--text-primary)', marginBottom: 'var(--space-2)', textAlign: 'left' }}>
                  Download Links:
                </div>
                <Row gap={12} style={{ justifyContent: 'center', flexWrap: 'wrap' }}>
                  <a href="#download-m4b" style={{
                    fontSize: 'var(--type-caption)', color: 'var(--success-text)', textDecoration: 'underline',
                    display: 'flex', alignItems: 'center', gap: 'var(--space-1)'
                  }}>
                    <Download size={13} /> .m4b (Audiobook)
                  </a>
                  <a href="#download-mp3" style={{
                    fontSize: 'var(--type-caption)', color: 'var(--success-text)', textDecoration: 'underline',
                    display: 'flex', alignItems: 'center', gap: 'var(--space-1)'
                  }}>
                    <Download size={13} /> .mp3 (Bundle)
                  </a>
                  <a href="#download-epub3" style={{
                    fontSize: 'var(--type-caption)', color: 'var(--success-text)', textDecoration: 'underline',
                    display: 'flex', alignItems: 'center', gap: 'var(--space-1)'
                  }}>
                    <Download size={13} /> .epub3 (Media Overlays)
                  </a>
                </Row>
              </div>
              <Btn small style={{ marginTop: 'var(--space-4)' }} onClick={() => setAssembleMode('idle')}>
                Done
              </Btn>
            </Card>
          )}
        </Col>

        {/* Right: book info + export + backups */}
        <Col gap={12} style={{ flex: 2 }} className="ns-stagger">
          {/* Book info section */}
          <Card style={{ overflow: 'hidden' }}>
            <div style={{
              padding: 'var(--space-2) var(--space-3)',
              borderBottom: '1px solid var(--hairline)',
              background: 'var(--surface)',
              fontSize: 'var(--type-micro)',
              fontWeight: 700,
              color: 'var(--text-muted)',
              textTransform: 'uppercase',
              letterSpacing: 'var(--tracking-wide)',
            }}>Book info</div>

            {/* Cover row */}
            <Row gap={0} style={{ padding: 'var(--space-3)', borderBottom: '1px solid var(--hairline)', alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)', width: 64, flexShrink: 0 }}>Cover</span>
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
                {/* BookCover replaces emoji cover placeholder */}
                <BookCover title="The Whispering Vale" size={36} style={{ height: 44, width: 32, borderRadius: 'var(--radius-button)' }} />
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
              <Row key={row.label} gap={0} style={{ padding: 'var(--space-2) var(--space-3)', borderBottom: '1px solid var(--hairline)', alignItems: 'center' }}>
                <span style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)', width: 64, flexShrink: 0 }}>{row.label}</span>
                <span style={{ fontSize: 'var(--type-callout)', color: 'var(--text-primary)', flex: 1 }}>{row.value}</span>
                <button
                  aria-label={`Edit ${row.label}`}
                  style={{ background: 'none', border: 'none', padding: 'var(--space-1)', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
                >
                  <Edit3 size={13} />
                </button>
              </Row>
            ))}

            {/* Read-only info chips */}
            <Row gap={8} style={{ padding: 'var(--space-2) var(--space-3)', flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)', width: 64, flexShrink: 0 }}>Info</span>
              <SemanticChip variant="neutral">6h 12m</SemanticChip>
              <SemanticChip variant="cloud">predicted 6h 28m</SemanticChip>
              <SemanticChip variant="neutral">Created 2026-05-14</SemanticChip>
            </Row>
          </Card>

          {/* Export row */}
          <Card style={{ padding: 'var(--space-3) var(--space-4)', boxShadow: 'var(--shadow-sm)' }}>
            <div style={{
              fontSize: 'var(--type-micro)',
              fontWeight: 700,
              letterSpacing: 'var(--tracking-wide)',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              marginBottom: 'var(--space-2)',
            }}>Export</div>
            <Row gap={8}>
              <Btn primary small>
                <Download size={11} style={{ marginRight: 4 }} aria-hidden="true" />
                M4B
              </Btn>
              <Btn small>
                <Download size={11} style={{ marginRight: 4 }} aria-hidden="true" />
                MP3
              </Btn>
              <Btn small>
                <Download size={11} style={{ marginRight: 4 }} aria-hidden="true" />
                EPUB3
              </Btn>
            </Row>
          </Card>

          {/* Backups */}
          <Card style={{ padding: 'var(--space-3) var(--space-4)', boxShadow: 'var(--shadow-md)' }}>
            <div style={{
              fontSize: 'var(--type-micro)',
              fontWeight: 700,
              letterSpacing: 'var(--tracking-wide)',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              marginBottom: 'var(--space-2)',
            }}>Backups</div>
            <Col gap={4}>
              {[
                '2026-06-11 23:14 — auto (pre-assemble)',
                '2026-06-10 18:30 — manual',
                '2026-06-09 09:05 — auto',
              ].map(b => (
                <div key={b} style={{
                  fontSize: 'var(--type-caption)', color: 'var(--text-secondary)', padding: 'var(--space-2) var(--space-3)',
                  background: 'var(--surface-alt)', border: '1px solid var(--hairline)',
                  borderRadius: 'var(--radius-button)', display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                }}>
                  <span>{b}</span>
                  <button
                    type="button"
                    style={{
                      border: 0,
                      background: 'transparent',
                      padding: 0,
                      fontFamily: 'inherit',
                      fontSize: 'var(--type-caption)',
                      fontWeight: 600,
                      color: 'var(--accent)',
                      cursor: 'pointer',
                    }}
                    onClick={() => setRestoringBackup(b)}
                  >
                    Restore
                  </button>
                </div>
              ))}
              {/* Create backup section */}
              <div style={{
                padding: 'var(--space-3)',
                background: 'var(--surface-alt)', border: '1px dashed var(--border)',
                borderRadius: 'var(--radius-button)',
                marginTop: 'var(--space-1)',
              }}>
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

          {/* Export quality controls */}
          <Col gap={6}>
            <div style={{
              fontSize: 'var(--type-micro)',
              fontWeight: 700,
              letterSpacing: 'var(--tracking-wide)',
              textTransform: 'uppercase',
              color: 'var(--text-muted)',
              paddingBottom: 'var(--space-1)',
            }}>Quality checks</div>
            <Card style={{ padding: 'var(--space-2) var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-secondary)', flex: 1 }}>
                Loudness QA — RMS/peak check before export
              </span>
              <SemanticChip variant="success">ready</SemanticChip>
              <Btn small>Run</Btn>
            </Card>
            <Card style={{ padding: 'var(--space-2) var(--space-3)', display: 'flex', alignItems: 'center', gap: 'var(--space-3)' }}>
              <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-secondary)', flex: 1 }}>
                Pronunciation lexicon — book-level say-as rules
              </span>
              <SemanticChip variant="accent">24 rules</SemanticChip>
              <Btn small>Edit</Btn>
            </Card>
          </Col>
        </Col>
      </Row>
    </div>
  );
};
