/**
 * siteMockup/panes/voices.tsx — Voices pane + VoiceLab detail
 */
import React, { useState } from 'react';
import { Row, Col, Label, Chip, Btn, ProgressBar, PlannedChip } from '../shared';

const VOICE_CARDS = [
  { name: 'Studio Voice', pills: [{ label: 'Narrator', color: '#6366f1' }, { label: 'Female', color: '#ec4899' }, { label: 'Warm', color: '#f59e0b' }], emoji: '🎙', cta: 'Edit voice' },
  { name: 'Marcus Reed', pills: [{ label: 'Narrator', color: '#6366f1' }, { label: 'Male', color: '#3b82f6' }, { label: 'Deep', color: '#8b5cf6' }], emoji: '🎤', cta: 'Edit voice' },
  { name: 'Clara Bell', pills: [{ label: 'Dialogue', color: '#22c55e' }, { label: 'Female', color: '#ec4899' }, { label: 'Bright', color: '#f59e0b' }], emoji: '🎙', cta: 'Edit voice' },
  { name: 'Old Tom', pills: [{ label: 'Character', color: '#ef4444' }, { label: 'Male', color: '#3b82f6' }, { label: 'Gruff', color: '#6b7280' }], emoji: '🎤', cta: 'Edit voice' },
  { name: 'Aria', pills: [{ label: 'Narrator', color: '#6366f1' }, { label: 'Female', color: '#ec4899' }, { label: 'Clear', color: '#0ea5e9' }], emoji: '🎙', cta: 'Edit voice' },
  { name: 'Frost', pills: [{ label: 'Character', color: '#ef4444' }, { label: 'NB', color: '#a78bfa' }, { label: 'Cool', color: '#0ea5e9' }], emoji: '🎤', cta: 'Edit voice' },
];

const DISCOVER_CARDS = [
  { name: 'VoxNarrator-v2', pills: [{ label: 'Narrator', color: '#6366f1' }, { label: 'Male', color: '#3b82f6' }], emoji: '🤗' },
  { name: 'EmberReader', pills: [{ label: 'Dialogue', color: '#22c55e' }, { label: 'Female', color: '#ec4899' }], emoji: '🤗' },
  { name: 'DeepCast-M', pills: [{ label: 'Character', color: '#ef4444' }, { label: 'Male', color: '#3b82f6' }], emoji: '🤗' },
  { name: 'ClearTone-F', pills: [{ label: 'Narrator', color: '#6366f1' }, { label: 'Female', color: '#ec4899' }], emoji: '🤗' },
];

const VariantDotMenu: React.FC<{ variantName: string }> = ({ variantName: _variantName }) => {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <span
        onClick={() => setOpen(o => !o)}
        style={{ fontSize: '0.85rem', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 3px', lineHeight: 1, userSelect: 'none' }}
        title="Variant options"
      >⋯</span>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 20,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.18)', minWidth: 150, overflow: 'hidden',
        }}>
          {['Rename', 'Move to another voice', 'Delete'].map((item, i, arr) => (
            <div
              key={item}
              onClick={() => setOpen(false)}
              style={{
                padding: '7px 12px', fontSize: '0.65rem', cursor: 'pointer',
                color: item === 'Delete' ? '#ef4444' : 'var(--text-primary)',
                borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >{item}</div>
          ))}
        </div>
      )}
    </div>
  );
};

const SpeedChip: React.FC = () => {
  const [open, setOpen] = useState(false);
  const [speed, setSpeed] = useState(1.0);
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <Chip onClick={() => setOpen(o => !o)}>Speed {speed.toFixed(1)}×</Chip>
      {open && (
        <div style={{
          position: 'absolute', left: 0, top: '100%', marginTop: 4, zIndex: 20,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 6, boxShadow: '0 4px 16px rgba(0,0,0,0.18)', padding: '8px 12px', minWidth: 160,
        }}>
          <div style={{ fontSize: '0.6rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>Playback speed</div>
          <Row gap={8} style={{ alignItems: 'center' }}>
            <input
              type="range" min={0.5} max={2.0} step={0.05}
              value={speed}
              onChange={e => setSpeed(parseFloat(e.target.value))}
              style={{ flex: 1, accentColor: 'var(--accent)', cursor: 'pointer' }}
            />
            <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', fontFamily: 'monospace', width: 28, textAlign: 'right' }}>{speed.toFixed(2)}</span>
          </Row>
          <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', marginTop: 5 }}>0.5× – 2.0×</div>
        </div>
      )}
    </div>
  );
};

const VoiceLab: React.FC<{ voice: typeof VOICE_CARDS[0]; onBack: () => void }> = ({ voice, onBack }) => {
  const phaseSteps = ['Samples', 'Build', 'Test', 'Ready'] as const;
  const currentPhase = 'Ready';
  const SAMPLES = [
    { name: 'sample_01.mp3', dur: '0:12' },
    { name: 'sample_02.mp3', dur: '0:09' },
    { name: 'sample_03.mp3', dur: '0:15' },
  ];
  return (
    <Col gap={0} style={{ flex: 1, overflowY: 'auto' }}>
      <div style={{ padding: '10px 14px 0', flexShrink: 0 }}>
        <span onClick={onBack} style={{ fontSize: '0.65rem', color: 'var(--accent)', cursor: 'pointer' }}>
          ← Voices
        </span>
        <Row gap={12} style={{ alignItems: 'flex-start', marginTop: 10 }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%',
            background: 'var(--accent-tint-bg)', border: '2px solid var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: '2rem', flexShrink: 0,
          }}>
            {voice.emoji}
          </div>
          <Col gap={4} style={{ flex: 1 }}>
            <Row gap={8} style={{ alignItems: 'center' }}>
              <span style={{ fontSize: '1rem', fontWeight: 700, color: 'var(--text-primary)' }}>{voice.name}</span>
              <Btn small>📋 Copy icon prompt</Btn>
            </Row>
            <div style={{ fontSize: '0.55rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              image prompt from attributes + description — uniform icons
            </div>
            <Row gap={4} style={{ flexWrap: 'wrap', marginTop: 2 }}>
              {voice.pills.map(p => <Chip key={p.label} color={p.color}>{p.label}</Chip>)}
            </Row>
            <div style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>
              A warm, expressive narrator voice suited for literary fiction and long-form narration. Trained on 4h 20m of clean studio recordings.
            </div>
          </Col>
        </Row>

        {/* Phase stepper */}
        <Row gap={0} style={{ alignItems: 'center', marginTop: 14, marginBottom: 10 }}>
          {phaseSteps.map((step, i) => {
            const isActive = step === currentPhase;
            const isPast = phaseSteps.indexOf(step) < phaseSteps.indexOf(currentPhase);
            return (
              <React.Fragment key={step}>
                {i > 0 && (
                  <div style={{ flex: 1, height: 1, background: isPast || isActive ? 'var(--accent)' : 'var(--border)' }} />
                )}
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0 }}>
                  <div style={{
                    width: 20, height: 20, borderRadius: '50%',
                    background: isActive ? 'var(--accent)' : isPast ? 'var(--accent-tint-bg)' : 'var(--surface-alt)',
                    border: `2px solid ${isActive || isPast ? 'var(--accent)' : 'var(--border)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.55rem', color: isActive ? '#fff' : isPast ? 'var(--accent)' : 'var(--text-muted)',
                    fontWeight: 700,
                  }}>
                    {isPast ? '✓' : i + 1}
                  </div>
                  <span style={{
                    fontSize: '0.55rem',
                    color: isActive ? 'var(--accent)' : isPast ? 'var(--text-secondary)' : 'var(--text-muted)',
                    fontWeight: isActive ? 700 : 400, whiteSpace: 'nowrap',
                  }}>
                    {step}
                  </span>
                </div>
              </React.Fragment>
            );
          })}
        </Row>
        <div style={{ borderBottom: '1px solid var(--border)', marginBottom: 14 }} />
      </div>

      <Col gap={12} style={{ padding: '0 14px 14px' }}>
        {/* Sample manager */}
        <Col gap={6}>
          <Label>Samples</Label>
          <div style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
            {SAMPLES.map((s, i) => (
              <Row key={s.name} gap={8} style={{
                padding: '6px 10px', alignItems: 'center',
                borderBottom: i < SAMPLES.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <span style={{ fontSize: '0.62rem', color: 'var(--text-primary)', flex: 1 }}>{s.name}</span>
                <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>{s.dur}</span>
                <Btn small>▶</Btn>
                <Btn small>✕</Btn>
              </Row>
            ))}
          </div>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '5px 10px', border: '1px dashed var(--border)',
            borderRadius: 6, background: 'var(--surface-alt)',
          }}>
            <span style={{ fontSize: '0.7rem' }}>⬆</span>
            <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', flex: 1 }}>+ Add samples — drop MP3 or WAV here</span>
            <Btn small>Choose file</Btn>
          </div>
        </Col>

        {/* Variants */}
        <Col gap={6}>
          <Label>Variants</Label>
          <div style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
            {[
              { name: 'Default', isDefault: true, speed: '1.0', temp: '0.65' },
              { name: 'Soft-spoken', isDefault: false, speed: '1.0', temp: '0.65' },
            ].map((variant, i, arr) => (
              <Row key={variant.name} gap={8} style={{
                padding: '6px 10px', alignItems: 'center',
                borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                {variant.isDefault && (
                  <span style={{ fontSize: '0.65rem', color: '#f59e0b', flexShrink: 0 }} title="default variant">★</span>
                )}
                <span style={{
                  fontSize: '0.65rem', fontWeight: variant.isDefault ? 700 : 400,
                  color: variant.isDefault ? 'var(--accent)' : 'var(--text-primary)', flex: 1,
                }}>
                  {variant.name}
                  {variant.isDefault && (
                    <span style={{ fontSize: '0.55rem', fontWeight: 400, color: 'var(--text-muted)', marginLeft: 5 }}>(default)</span>
                  )}
                </span>
                <SpeedChip />
                <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', fontFamily: 'monospace', flexShrink: 0 }}>
                  temp {variant.temp}
                </span>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', cursor: 'pointer', flexShrink: 0 }}>✎</span>
                <VariantDotMenu variantName={variant.name} />
              </Row>
            ))}
          </div>
          <Row gap={6} style={{ alignItems: 'center' }}>
            <Btn small>+ Add variant</Btn>
            <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              per-variant engine settings override the engine defaults
            </span>
          </Row>
        </Col>

        {/* Engine settings */}
        <Col gap={6}>
          <Row gap={6} style={{ alignItems: 'center' }}>
            <Label>Engine settings</Label>
            <span style={{ fontSize: '0.55rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              generated from plugin settings schema
            </span>
          </Row>
          <div style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
            {[
              { label: 'Temperature', value: '0.75' },
              { label: 'Repetition penalty', value: '1.1' },
              { label: 'Top-k', value: '50' },
            ].map((row, i, arr) => (
              <Row key={row.label} gap={8} style={{
                padding: '6px 10px', alignItems: 'center',
                borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <span style={{ fontSize: '0.62rem', color: 'var(--text-primary)', flex: 1 }}>{row.label}</span>
                <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{row.value}</span>
                <span style={{ fontSize: '0.6rem', color: 'var(--text-muted)', cursor: 'pointer' }}>✎</span>
              </Row>
            ))}
          </div>
        </Col>

        {/* Test strip */}
        <Col gap={6}>
          <Label>Test</Label>
          <div style={{ background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 6, padding: '8px 10px' }}>
            {/* Engine + reference sample row */}
            <Row gap={6} style={{ alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', flexShrink: 0 }}>Engine</span>
              <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>XTTS v2 ▾</span>
              <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)', flexShrink: 0 }}>Ref</span>
              <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>sample_01.mp3 ▾</span>
            </Row>
            <Row gap={6} style={{ alignItems: 'center', marginBottom: 6 }}>
              <div style={{
                flex: 1, fontSize: '0.65rem', color: 'var(--text-secondary)',
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 4, padding: '4px 8px',
              }}>
                The road wound down through silver birch and pale stone.
              </div>
              <Btn small primary>Generate test</Btn>
            </Row>
            <Row gap={6} style={{ alignItems: 'center', marginBottom: 4 }}>
              <span style={{ fontSize: '0.75rem', cursor: 'pointer' }}>▶</span>
              <ProgressBar pct={42} height={3} />
              <span style={{ fontSize: '0.58rem', color: 'var(--text-muted)' }}>0:05 / 0:12</span>
            </Row>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: '0.58rem', color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline' }}>Edit preview script</span>
            </div>
          </div>
        </Col>

        {/* Export row */}
        <Col gap={4}>
          <Label>Export</Label>
          <Row gap={8} style={{ alignItems: 'center' }}>
            <Btn small>Export bundle (.zip)</Btn>
            <Row gap={6} style={{ alignItems: 'center' }}>
              <Btn small>Publish to Hugging Face</Btn>
              <PlannedChip />
            </Row>
          </Row>
        </Col>
      </Col>
    </Col>
  );
};

// Recording Guide Modal
const RecordingGuideModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [narrationOpen, setNarrationOpen] = useState(true);
  const [characterOpen, setCharacterOpen] = useState(false);
  return (
    <div style={{
      position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}>
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
        width: 360, maxHeight: '90%', overflowY: 'auto', boxShadow: '0 8px 40px rgba(0,0,0,0.3)',
        padding: '16px 18px',
      }}>
        <Row gap={8} style={{ alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>Recording Guide</span>
          <span onClick={onClose} style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.9rem' }}>✕</span>
        </Row>

        {/* Tips */}
        <Col gap={10} style={{ marginBottom: 14 }}>
          {[
            { label: 'Audio quality', tips: ['Record in a quiet room — closets and carpeted spaces reduce echo.', 'Use 44.1kHz / 16-bit WAV or 320 kbps MP3; avoid compressed formats.'] },
            { label: 'Performance', tips: ['Maintain a consistent distance (6–8 in) from the microphone.', 'Read each prompt in your natural narrator voice without pauses mid-sentence.'] },
          ].map(group => (
            <Col gap={4} key={group.label}>
              <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-secondary)' }}>{group.label}</div>
              {group.tips.map(tip => (
                <Row gap={6} key={tip} style={{ alignItems: 'flex-start' }}>
                  <span style={{ fontSize: '0.6rem', color: 'var(--accent)', flexShrink: 0, marginTop: 1 }}>•</span>
                  <span style={{ fontSize: '0.62rem', color: 'var(--text-muted)', lineHeight: 1.5 }}>{tip}</span>
                </Row>
              ))}
            </Col>
          ))}
        </Col>

        <div style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Prompt library</div>
        <Col gap={4}>
          {/* Narration category */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
            <div
              onClick={() => setNarrationOpen(o => !o)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', cursor: 'pointer',
                background: narrationOpen ? 'var(--accent-tint-bg)' : 'var(--surface-alt)',
              }}
            >
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{narrationOpen ? '▾' : '›'}</span>
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>Narration — 12 scripts</span>
              <span style={{ fontSize: '0.55rem', fontWeight: 700, color: '#22c55e', background: 'rgba(34,197,94,0.12)', border: '1px solid #22c55e55', borderRadius: 10, padding: '1px 6px' }}>RECOMMENDED</span>
            </div>
            {narrationOpen && (
              <Col gap={0}>
                {[
                  'The road stretched ahead through fields of pale silver grass.',
                  'She turned the page slowly, as if afraid of what she\'d find.',
                ].map((prompt, i) => (
                  <Row key={prompt} gap={8} style={{
                    padding: '6px 10px', alignItems: 'flex-start',
                    borderTop: '1px solid var(--border)',
                    background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-alt)',
                  }}>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', flex: 1, lineHeight: 1.5 }}>{prompt}</span>
                    <span style={{ fontSize: '0.7rem', cursor: 'pointer', flexShrink: 0 }} title="Copy">📋</span>
                  </Row>
                ))}
              </Col>
            )}
          </div>

          {/* Character range category */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 6, overflow: 'hidden' }}>
            <div
              onClick={() => setCharacterOpen(o => !o)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', cursor: 'pointer',
                background: 'var(--surface-alt)',
              }}
            >
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)' }}>{characterOpen ? '▾' : '›'}</span>
              <span style={{ fontSize: '0.65rem', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>Character range — 8 scripts</span>
            </div>
            {characterOpen && (
              <Col gap={0}>
                {[
                  '"I told you once," he said, low and even. "I will not tell you again."',
                  '"Oh, wonderful!" she cried, eyes wide. "I never expected this at all!"',
                ].map((prompt, i) => (
                  <Row key={prompt} gap={8} style={{
                    padding: '6px 10px', alignItems: 'flex-start',
                    borderTop: '1px solid var(--border)',
                    background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-alt)',
                  }}>
                    <span style={{ fontSize: '0.62rem', color: 'var(--text-secondary)', flex: 1, lineHeight: 1.5 }}>{prompt}</span>
                    <span style={{ fontSize: '0.7rem', cursor: 'pointer', flexShrink: 0 }} title="Copy">📋</span>
                  </Row>
                ))}
              </Col>
            )}
          </div>
        </Col>

        <div style={{ marginTop: 14, textAlign: 'right' }}>
          <Btn small primary onClick={onClose}>Done</Btn>
        </div>
      </div>
    </div>
  );
};

// Create Voice Modal
const CreateVoiceModal: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div style={{
    position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.35)', zIndex: 100,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }}>
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10,
      width: 320, boxShadow: '0 8px 40px rgba(0,0,0,0.3)', padding: '16px 18px',
    }}>
      <Row gap={8} style={{ alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: '0.85rem', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>New voice</span>
        <span onClick={onClose} style={{ cursor: 'pointer', color: 'var(--text-muted)', fontSize: '0.9rem' }}>✕</span>
      </Row>
      <Col gap={10}>
        <Col gap={4}>
          <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Name</div>
          <div style={{
            background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 5,
            padding: '5px 10px', fontSize: '0.65rem', color: 'var(--text-muted)', fontStyle: 'italic',
          }}>e.g. Elena Marsh</div>
        </Col>
        <Col gap={4}>
          <div style={{ fontSize: '0.62rem', fontWeight: 700, color: 'var(--text-secondary)' }}>Engine</div>
          <Col gap={4}>
            {[
              { id: 'xtts', label: 'XTTS v2', ready: true },
              { id: 'voxtral', label: 'Voxtral (Mistral AI)', ready: false, note: 'Needs setup' },
            ].map(opt => (
              <Row key={opt.id} gap={8} style={{
                padding: '6px 10px', borderRadius: 5,
                background: opt.id === 'xtts' ? 'var(--accent-tint-bg)' : 'var(--surface-alt)',
                border: `1px solid ${opt.id === 'xtts' ? 'var(--accent)' : 'var(--border)'}`,
                alignItems: 'center', cursor: 'pointer',
              }}>
                <span style={{ fontSize: '0.65rem', color: opt.id === 'xtts' ? 'var(--accent)' : 'var(--text-secondary)', flex: 1, fontWeight: opt.id === 'xtts' ? 700 : 400 }}>
                  {opt.label}
                </span>
                {!opt.ready && (
                  <span style={{ fontSize: '0.55rem', color: '#d97706', background: '#fef3c7', border: '1px solid #fbbf24', borderRadius: 4, padding: '1px 5px' }}>Needs setup</span>
                )}
                {opt.id === 'xtts' && <span style={{ fontSize: '0.62rem', color: 'var(--accent)' }}>●</span>}
              </Row>
            ))}
          </Col>
        </Col>
      </Col>
      <Row gap={6} style={{ marginTop: 16, justifyContent: 'flex-end' }}>
        <Btn small onClick={onClose}>Cancel</Btn>
        <Btn small primary onClick={onClose}>Create voice</Btn>
      </Row>
    </div>
  </div>
);

export const VoicesPane: React.FC = () => {
  const [voiceTab, setVoiceTab] = useState<'local' | 'discover'>('local');
  const [selectedVoice, setSelectedVoice] = useState<typeof VOICE_CARDS[0] | null>(null);
  const [showGuide, setShowGuide] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  if (selectedVoice) {
    return <VoiceLab voice={selectedVoice} onBack={() => setSelectedVoice(null)} />;
  }

  return (
    <Col gap={10} style={{ padding: 14, flex: 1, overflowY: 'auto', position: 'relative' }}>
      {showGuide && <RecordingGuideModal onClose={() => setShowGuide(false)} />}
      {showCreate && <CreateVoiceModal onClose={() => setShowCreate(false)} />}

      <Row gap={6} style={{ flexWrap: 'wrap', alignItems: 'center' }}>
        {(['local', 'discover'] as const).map(tab => (
          <div
            key={tab}
            onClick={() => setVoiceTab(tab)}
            style={{
              fontSize: '0.7rem', fontWeight: 600, padding: '4px 14px', borderRadius: 20, cursor: 'pointer',
              border: `1px solid ${voiceTab === tab ? 'var(--accent)' : 'var(--border)'}`,
              background: voiceTab === tab ? 'var(--accent-tint-bg)' : 'var(--surface-alt)',
              color: voiceTab === tab ? 'var(--accent)' : 'var(--text-secondary)',
            }}
          >
            {tab === 'local' ? 'My Voices' : '🤗 Discover'}
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <Btn small>⬆ Import (.zip)</Btn>
        <Btn small>⬇ Export</Btn>
        <Btn small onClick={() => setShowGuide(true)}>📖 Recording guide</Btn>
        <Btn small primary onClick={() => setShowCreate(true)}>+ New voice</Btn>
      </Row>

      {voiceTab === 'local' && (
        <>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            {[
              { label: 'Narrator', color: '#6366f1' },
              { label: 'Female', color: '#ec4899' },
              { label: 'Adult', color: '#f59e0b' },
              { label: 'Warm', color: '#22c55e' },
            ].map((f, i) => (
              <Chip key={f.label} active={i === 0} color={i === 0 ? f.color : undefined}>{f.label}</Chip>
            ))}
            <Chip>+ Filter</Chip>
          </Row>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))', gap: 8 }}>
            {VOICE_CARDS.map((v, idx) => (
              <div key={v.name} style={{
                background: 'var(--surface-alt)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '10px 10px 8px', textAlign: 'center',
                position: 'relative',
              }}>
                {/* Default marker on first card */}
                {idx === 0 && (
                  <span style={{
                    position: 'absolute', top: 6, right: 6,
                    fontSize: '0.55rem', fontWeight: 700, color: '#f59e0b',
                    background: 'rgba(245,158,11,0.12)', border: '1px solid #f59e0b66',
                    borderRadius: 8, padding: '1px 5px',
                  }}>★ default</span>
                )}
                {/* Untagged warning on second card */}
                {idx === 1 && (
                  <span
                    title="missing required attributes"
                    style={{
                      position: 'absolute', top: 6, right: 6,
                      fontSize: '0.6rem', color: '#f59e0b', cursor: 'default',
                    }}
                  >⚠</span>
                )}
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'var(--accent-tint-bg)', border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.2rem', margin: '0 auto 6px',
                }}>
                  {v.emoji}
                </div>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-primary)' }}>{v.name}</div>
                <Row gap={3} style={{ marginTop: 5, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {v.pills.map(p => <Chip key={p.label} color={p.color}>{p.label}</Chip>)}
                </Row>
                <Row gap={4} style={{ marginTop: 6, justifyContent: 'center' }}>
                  <Btn small>▶ Preview</Btn>
                  <Btn small primary onClick={() => setSelectedVoice(v)}>{v.cta}</Btn>
                </Row>
              </div>
            ))}
          </div>
        </>
      )}

      {voiceTab === 'discover' && (
        <>
          <Row gap={6} style={{ alignItems: 'center' }}>
            <div style={{
              flex: 1, display: 'flex', alignItems: 'center', gap: 6,
              background: 'var(--surface-alt)', border: '1px solid var(--border)',
              borderRadius: 6, padding: '4px 10px',
            }}>
              <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>🔍</span>
              <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>Search voices…</span>
            </div>
          </Row>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            {[
              { label: 'Narrator', color: '#6366f1' },
              { label: 'Male', color: '#3b82f6' },
              { label: 'English', color: '#22c55e' },
            ].map((f, i) => (
              <Chip key={f.label} active={i === 0} color={i === 0 ? f.color : undefined}>{f.label}</Chip>
            ))}
            <Chip>+ Filter</Chip>
          </Row>
          <div style={{ fontSize: '0.62rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Community voices from Hugging Face — install to use locally.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))', gap: 8 }}>
            {DISCOVER_CARDS.map((v, idx) => (
              <div key={v.name} style={{
                background: 'var(--surface-alt)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '10px 10px 8px', textAlign: 'center',
              }}>
                <div style={{
                  width: 36, height: 36, borderRadius: '50%',
                  background: 'var(--surface)', border: '1px solid var(--border)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.2rem', margin: '0 auto 6px',
                }}>
                  {v.emoji}
                </div>
                <div style={{ fontSize: '0.7rem', fontWeight: 700, color: 'var(--text-primary)' }}>{v.name}</div>
                <Row gap={3} style={{ marginTop: 5, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {v.pills.map(p => <Chip key={p.label} color={p.color}>{p.label}</Chip>)}
                </Row>
                {idx === 1 ? (
                  <Col gap={3} style={{ marginTop: 6 }}>
                    <span style={{ fontSize: '0.58rem', color: 'var(--accent)', fontStyle: 'italic' }}>installing… 64%</span>
                    <ProgressBar pct={64} height={3} shimmer />
                  </Col>
                ) : (
                  <Btn small style={{ marginTop: 6 }}>⬇ Install</Btn>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </Col>
  );
};
