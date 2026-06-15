/**
 * siteMockup/panes/voices.tsx — Voices catalog + Discover + VoiceLab
 */
import React, { useState } from 'react';
import {
  ChevronDown,
  ChevronRight,
  Download,
  Upload,
  Play,
  X,
  Star,
  Pencil,
  Search,
  BookOpen,
  Copy,
  MoreHorizontal,
  AlertTriangle,
} from 'lucide-react';
import {
  Row,
  Col,
  Label,
  Chip,
  SemanticChip,
  VoiceAttrPill,
  Avatar,
  Card,
  Btn,
  ProgressBar,
  PlannedChip,
} from '../shared';

// ---------------------------------------------------------------------------
// Voice data — pills classified by category (class/gender/age/extended/tag)

type VoicePill = { label: string; category: 'class' | 'gender' | 'age' | 'extended' | 'tag' };

const VOICE_CARDS: { name: string; pills: VoicePill[]; cta: string }[] = [
  {
    name: 'Studio Voice',
    pills: [
      { label: 'Narrator', category: 'class' },
      { label: 'Female', category: 'gender' },
      { label: 'Warm', category: 'extended' },
    ],
    cta: 'Edit voice',
  },
  {
    name: 'Marcus Reed',
    pills: [
      { label: 'Narrator', category: 'class' },
      { label: 'Male', category: 'gender' },
      { label: 'Deep', category: 'extended' },
    ],
    cta: 'Edit voice',
  },
  {
    name: 'Clara Bell',
    pills: [
      { label: 'Dialogue', category: 'class' },
      { label: 'Female', category: 'gender' },
      { label: 'Bright', category: 'extended' },
    ],
    cta: 'Edit voice',
  },
  {
    name: 'Old Tom',
    pills: [
      { label: 'Character', category: 'class' },
      { label: 'Male', category: 'gender' },
      { label: 'Gruff', category: 'extended' },
    ],
    cta: 'Edit voice',
  },
  {
    name: 'Aria',
    pills: [
      { label: 'Narrator', category: 'class' },
      { label: 'Female', category: 'gender' },
      { label: 'Clear', category: 'extended' },
    ],
    cta: 'Edit voice',
  },
  {
    name: 'Frost',
    pills: [
      { label: 'Character', category: 'class' },
      { label: 'NB', category: 'gender' },
      { label: 'Cool', category: 'extended' },
    ],
    cta: 'Edit voice',
  },
];

const DISCOVER_CARDS: { name: string; pills: VoicePill[] }[] = [
  {
    name: 'VoxNarrator-v2',
    pills: [
      { label: 'Narrator', category: 'class' },
      { label: 'Male', category: 'gender' },
    ],
  },
  {
    name: 'EmberReader',
    pills: [
      { label: 'Dialogue', category: 'class' },
      { label: 'Female', category: 'gender' },
    ],
  },
  {
    name: 'DeepCast-M',
    pills: [
      { label: 'Character', category: 'class' },
      { label: 'Male', category: 'gender' },
    ],
  },
  {
    name: 'ClearTone-F',
    pills: [
      { label: 'Narrator', category: 'class' },
      { label: 'Female', category: 'gender' },
    ],
  },
];

// ---------------------------------------------------------------------------
// Variant dot-menu

const VariantDotMenu: React.FC<{ variantName: string }> = ({ variantName: _variantName }) => {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        onClick={() => setOpen(o => !o)}
        aria-label="Variant options"
        style={{
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          color: 'var(--text-muted)',
          padding: '0 3px',
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
        }}
      >
        <MoreHorizontal size={13} />
      </button>
      {open && (
        <div style={{
          position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 20,
          background: 'var(--surface)', border: '1px solid var(--border)',
          borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-lg)', minWidth: 150, overflow: 'hidden',
        }}>
          {['Rename', 'Move to another voice', 'Delete'].map((item, i, arr) => (
            <div
              key={item}
              onClick={() => setOpen(false)}
              style={{
                padding: '7px 12px', fontSize: 'var(--type-micro)', cursor: 'pointer',
                color: item === 'Delete' ? 'var(--error)' : 'var(--text-primary)',
                borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
              }}
            >{item}</div>
          ))}
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// Speed chip

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
          borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-md)', padding: '8px 12px', minWidth: 160,
        }}>
          <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 6 }}>Playback speed</div>
          <Row gap={8} style={{ alignItems: 'center' }}>
            <input
              type="range" min={0.5} max={2.0} step={0.05}
              value={speed}
              onChange={e => setSpeed(parseFloat(e.target.value))}
              style={{ flex: 1, accentColor: 'var(--accent)', cursor: 'pointer' }}
            />
            <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-secondary)', fontFamily: 'monospace', width: 28, textAlign: 'right' }}>{speed.toFixed(2)}</span>
          </Row>
          <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', marginTop: 5 }}>0.5× – 2.0×</div>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// VoiceLab detail

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
        <button
          onClick={onBack}
          aria-label="Back to Voices"
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            fontSize: 'var(--type-micro)', color: 'var(--accent)', padding: 0,
            display: 'inline-flex', alignItems: 'center', gap: 3,
          }}
        >
          <ChevronRight size={11} style={{ transform: 'rotate(180deg)' }} />
          Voices
        </button>

        <Row gap={12} style={{ alignItems: 'flex-start', marginTop: 10 }}>
          <Avatar name={voice.name} size={56} style={{ border: '2px solid var(--accent)', borderRadius: '50%' }} />
          <Col gap={4} style={{ flex: 1 }}>
            <Row gap={8} style={{ alignItems: 'center' }}>
              <span style={{ fontSize: 'var(--type-headline)', fontWeight: 700, color: 'var(--text-primary)' }}>{voice.name}</span>
              <Btn small>
                <Row gap={4} style={{ alignItems: 'center' }}>
                  <Copy size={10} />
                  Copy icon prompt
                </Row>
              </Btn>
            </Row>
            <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              image prompt from attributes + description — uniform icons
            </div>
            <Row gap={4} style={{ flexWrap: 'wrap', marginTop: 2 }}>
              {voice.pills.map(p => (
                <VoiceAttrPill key={p.label} category={p.category}>{p.label}</VoiceAttrPill>
              ))}
            </Row>
            <div style={{ fontSize: 'var(--type-caption)', color: 'var(--text-secondary)', marginTop: 2, lineHeight: 1.4 }}>
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
                    fontSize: 'var(--type-micro)',
                    color: isActive ? 'var(--text-on-accent)' : isPast ? 'var(--accent)' : 'var(--text-muted)',
                    fontWeight: 700,
                  }}>
                    {isPast ? '✓' : i + 1}
                  </div>
                  <span style={{
                    fontSize: 'var(--type-micro)',
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
          <Card style={{ borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
            {SAMPLES.map((s, i) => (
              <Row key={s.name} gap={8} style={{
                padding: '6px 10px', alignItems: 'center',
                borderBottom: i < SAMPLES.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-primary)', flex: 1 }}>{s.name}</span>
                <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>{s.dur}</span>
                <Btn small aria-label={`Play ${s.name}`}>
                  <Play size={10} />
                </Btn>
                <Btn small aria-label={`Remove ${s.name}`}>
                  <X size={10} />
                </Btn>
              </Row>
            ))}
          </Card>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            padding: '5px 10px', border: '1px dashed var(--border)',
            borderRadius: 'var(--radius-card)', background: 'var(--surface-alt)',
          }}>
            <Upload size={12} color="var(--text-muted)" />
            <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-muted)', flex: 1 }}>+ Add samples — drop MP3 or WAV here</span>
            <Btn small>Choose file</Btn>
          </div>
        </Col>

        {/* Variants */}
        <Col gap={6}>
          <Label>Variants</Label>
          <Card style={{ borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
            {[
              { name: 'Default', isDefault: true, speed: '1.0', temp: '0.65' },
              { name: 'Soft-spoken', isDefault: false, speed: '1.0', temp: '0.65' },
            ].map((variant, i, arr) => (
              <Row key={variant.name} gap={8} style={{
                padding: '6px 10px', alignItems: 'center',
                borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                {variant.isDefault && (
                  <Star size={11} color="var(--warning)" fill="var(--warning)" style={{ flexShrink: 0 }} aria-label="default variant" />
                )}
                <span style={{
                  fontSize: 'var(--type-caption)', fontWeight: variant.isDefault ? 700 : 400,
                  color: variant.isDefault ? 'var(--accent)' : 'var(--text-primary)', flex: 1,
                }}>
                  {variant.name}
                  {variant.isDefault && (
                    <span style={{ fontSize: 'var(--type-micro)', fontWeight: 400, color: 'var(--text-muted)', marginLeft: 5 }}>(default)</span>
                  )}
                </span>
                <SpeedChip />
                <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontFamily: 'monospace', flexShrink: 0 }}>
                  temp {variant.temp}
                </span>
                <button
                  aria-label={`Edit ${variant.name} variant`}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 2px', display: 'flex', alignItems: 'center' }}
                >
                  <Pencil size={11} />
                </button>
                <VariantDotMenu variantName={variant.name} />
              </Row>
            ))}
          </Card>
          <Row gap={6} style={{ alignItems: 'center' }}>
            <Btn small>+ Add variant</Btn>
            <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              per-variant engine settings override the engine defaults
            </span>
          </Row>
        </Col>

        {/* Engine settings */}
        <Col gap={6}>
          <Row gap={6} style={{ alignItems: 'center' }}>
            <Label>Engine settings</Label>
            <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              generated from plugin settings schema
            </span>
          </Row>
          <Card style={{ borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
            {[
              { label: 'Temperature', value: '0.75' },
              { label: 'Repetition penalty', value: '1.1' },
              { label: 'Top-k', value: '50' },
            ].map((row, i, arr) => (
              <Row key={row.label} gap={8} style={{
                padding: '6px 10px', alignItems: 'center',
                borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none',
              }}>
                <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-primary)', flex: 1 }}>{row.label}</span>
                <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-muted)', fontFamily: 'monospace' }}>{row.value}</span>
                <button aria-label={`Edit ${row.label}`} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', padding: '0 2px', display: 'flex', alignItems: 'center' }}>
                  <Pencil size={11} />
                </button>
              </Row>
            ))}
          </Card>
        </Col>

        {/* Test strip */}
        <Col gap={6}>
          <Label>Test</Label>
          <Card style={{ borderRadius: 'var(--radius-card)', padding: '8px 10px' }}>
            {/* Engine + reference sample row */}
            <Row gap={6} style={{ alignItems: 'center', marginBottom: 6 }}>
              <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', flexShrink: 0 }}>Engine</span>
              <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-secondary)', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer' }}>
                <Row gap={3} style={{ alignItems: 'center' }}>XTTS v2 <ChevronDown size={10} /></Row>
              </span>
              <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', flexShrink: 0 }}>Ref</span>
              <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-secondary)', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 4, padding: '2px 8px', cursor: 'pointer', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                <Row gap={3} style={{ alignItems: 'center' }}>sample_01.mp3 <ChevronDown size={10} /></Row>
              </span>
            </Row>
            <Row gap={6} style={{ alignItems: 'center', marginBottom: 6 }}>
              <div style={{
                flex: 1, fontSize: 'var(--type-caption)', color: 'var(--text-secondary)',
                background: 'var(--surface-alt)', border: '1px solid var(--border)',
                borderRadius: 4, padding: '4px 8px',
              }}>
                The road wound down through silver birch and pale stone.
              </div>
              <Btn small primary>Generate test</Btn>
            </Row>
            <Row gap={6} style={{ alignItems: 'center', marginBottom: 4 }}>
              <button aria-label="Play test audio" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-primary)', padding: '0 2px', display: 'flex', alignItems: 'center' }}>
                <Play size={13} />
              </button>
              <ProgressBar pct={42} height={3} />
              <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>0:05 / 0:12</span>
            </Row>
            <div style={{ textAlign: 'right' }}>
              <span style={{ fontSize: 'var(--type-micro)', color: 'var(--accent)', cursor: 'pointer', textDecoration: 'underline' }}>Edit preview script</span>
            </div>
          </Card>
        </Col>

        {/* Export row */}
        <Col gap={4}>
          <Label>Export</Label>
          <Row gap={8} style={{ alignItems: 'center' }}>
            <Btn small>
              <Row gap={4} style={{ alignItems: 'center' }}>
                <Download size={10} />
                Export bundle (.zip)
              </Row>
            </Btn>
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

// ---------------------------------------------------------------------------
// Recording Guide Modal

const RecordingGuideModal: React.FC<{ onClose: () => void }> = ({ onClose }) => {
  const [narrationOpen, setNarrationOpen] = useState(true);
  const [characterOpen, setCharacterOpen] = useState(false);
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Recording Guide"
      style={{
        position: 'absolute', inset: 0, background: 'var(--overlay-backdrop)', zIndex: 100,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{
        background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-panel)',
        width: 360, maxHeight: '90%', overflowY: 'auto', boxShadow: 'var(--shadow-xl)',
        padding: '16px 18px',
      }}>
        <Row gap={8} style={{ alignItems: 'center', marginBottom: 12 }}>
          <span style={{ fontSize: 'var(--type-headline)', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>Recording Guide</span>
          <button onClick={onClose} aria-label="Close recording guide" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
            <X size={15} />
          </button>
        </Row>

        {/* Tips */}
        <Col gap={10} style={{ marginBottom: 14 }}>
          {[
            { label: 'Audio quality', tips: ['Record in a quiet room — closets and carpeted spaces reduce echo.', 'Use 44.1kHz / 16-bit WAV or 320 kbps MP3; avoid compressed formats.'] },
            { label: 'Performance', tips: ['Maintain a consistent distance (6–8 in) from the microphone.', 'Read each prompt in your natural narrator voice without pauses mid-sentence.'] },
          ].map(group => (
            <Col gap={4} key={group.label}>
              <div style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-secondary)' }}>{group.label}</div>
              {group.tips.map(tip => (
                <Row gap={6} key={tip} style={{ alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 'var(--type-micro)', color: 'var(--accent)', flexShrink: 0, marginTop: 1 }}>•</span>
                  <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-muted)', lineHeight: 1.5 }}>{tip}</span>
                </Row>
              ))}
            </Col>
          ))}
        </Col>

        <div style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 8 }}>Prompt library</div>
        <Col gap={4}>
          {/* Narration category */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
            <div
              onClick={() => setNarrationOpen(o => !o)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', cursor: 'pointer',
                background: narrationOpen ? 'var(--accent-tint-bg)' : 'var(--surface-alt)',
              }}
            >
              {narrationOpen
                ? <ChevronDown size={12} color="var(--text-muted)" />
                : <ChevronRight size={12} color="var(--text-muted)" />}
              <span style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>Narration — 12 scripts</span>
              <SemanticChip variant="success">RECOMMENDED</SemanticChip>
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
                    <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-secondary)', flex: 1, lineHeight: 1.5 }}>{prompt}</span>
                    <button aria-label="Copy prompt" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                      <Copy size={12} />
                    </button>
                  </Row>
                ))}
              </Col>
            )}
          </div>

          {/* Character range category */}
          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
            <div
              onClick={() => setCharacterOpen(o => !o)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', cursor: 'pointer',
                background: 'var(--surface-alt)',
              }}
            >
              {characterOpen
                ? <ChevronDown size={12} color="var(--text-muted)" />
                : <ChevronRight size={12} color="var(--text-muted)" />}
              <span style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>Character range — 8 scripts</span>
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
                    <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-secondary)', flex: 1, lineHeight: 1.5 }}>{prompt}</span>
                    <button aria-label="Copy prompt" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                      <Copy size={12} />
                    </button>
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

// ---------------------------------------------------------------------------
// Create Voice Modal

const CreateVoiceModal: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div
    role="dialog"
    aria-modal="true"
    aria-label="New voice"
    style={{
      position: 'absolute', inset: 0, background: 'var(--overlay-backdrop)', zIndex: 100,
      display: 'flex', alignItems: 'center', justifyContent: 'center',
    }}
  >
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 'var(--radius-panel)',
      width: 320, boxShadow: 'var(--shadow-xl)', padding: '16px 18px',
    }}>
      <Row gap={8} style={{ alignItems: 'center', marginBottom: 14 }}>
        <span style={{ fontSize: 'var(--type-headline)', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>New voice</span>
        <button onClick={onClose} aria-label="Close new voice dialog" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
          <X size={15} />
        </button>
      </Row>
      <Col gap={10}>
        <Col gap={4}>
          <div style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-secondary)' }}>Name</div>
          <div style={{
            background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 'var(--radius-button)',
            padding: '5px 10px', fontSize: 'var(--type-caption)', color: 'var(--text-muted)', fontStyle: 'italic',
          }}>e.g. Elena Marsh</div>
        </Col>
        <Col gap={4}>
          <div style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-secondary)' }}>Engine</div>
          <Col gap={4}>
            {[
              { id: 'xtts', label: 'XTTS v2', ready: true },
              { id: 'voxtral', label: 'Voxtral (Mistral AI)', ready: false, note: 'Needs setup' },
            ].map(opt => (
              <Row key={opt.id} gap={8} style={{
                padding: '6px 10px', borderRadius: 'var(--radius-button)',
                background: opt.id === 'xtts' ? 'var(--accent-tint-bg)' : 'var(--surface-alt)',
                border: `1px solid ${opt.id === 'xtts' ? 'var(--accent)' : 'var(--border)'}`,
                alignItems: 'center', cursor: 'pointer',
              }}>
                <span style={{ fontSize: 'var(--type-caption)', color: opt.id === 'xtts' ? 'var(--accent)' : 'var(--text-secondary)', flex: 1, fontWeight: opt.id === 'xtts' ? 700 : 400 }}>
                  {opt.label}
                </span>
                {!opt.ready && (
                  <SemanticChip variant="warning">Needs setup</SemanticChip>
                )}
                {opt.id === 'xtts' && <span style={{ fontSize: 'var(--type-micro)', color: 'var(--accent)' }}>●</span>}
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

// ---------------------------------------------------------------------------
// VoicesPane

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
              fontSize: 'var(--type-caption)', fontWeight: 600, padding: '4px 14px', borderRadius: 'var(--radius-round)', cursor: 'pointer',
              border: `1px solid ${voiceTab === tab ? 'var(--accent)' : 'var(--border)'}`,
              background: voiceTab === tab ? 'var(--accent-tint-bg)' : 'var(--surface-alt)',
              color: voiceTab === tab ? 'var(--accent)' : 'var(--text-secondary)',
            }}
          >
            {tab === 'local' ? 'My Voices' : 'Discover'}
          </div>
        ))}
        <div style={{ flex: 1 }} />
        <Btn small>
          <Row gap={4} style={{ alignItems: 'center' }}>
            <Upload size={10} />
            Import (.zip)
          </Row>
        </Btn>
        <Btn small>
          <Row gap={4} style={{ alignItems: 'center' }}>
            <Download size={10} />
            Export
          </Row>
        </Btn>
        <Btn small onClick={() => setShowGuide(true)}>
          <Row gap={4} style={{ alignItems: 'center' }}>
            <BookOpen size={10} />
            Recording guide
          </Row>
        </Btn>
        <Btn small primary onClick={() => setShowCreate(true)}>+ New voice</Btn>
      </Row>

      {voiceTab === 'local' && (
        <>
          {/* Filter chips — use VoiceAttrPill categories for the active one */}
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            <VoiceAttrPill category="class">Narrator</VoiceAttrPill>
            <VoiceAttrPill category="gender">Female</VoiceAttrPill>
            <VoiceAttrPill category="age">Adult</VoiceAttrPill>
            <VoiceAttrPill category="extended">Warm</VoiceAttrPill>
            <Chip>+ Filter</Chip>
          </Row>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))', gap: 8 }}>
            {VOICE_CARDS.map((v, idx) => (
              <Card key={v.name} style={{
                padding: '10px 10px 8px', textAlign: 'center',
                position: 'relative', borderRadius: 'var(--radius-card)',
              }}>
                {/* Default marker on first card */}
                {idx === 0 && (
                  <div style={{ position: 'absolute', top: 6, right: 6 }}>
                    <SemanticChip variant="warning">
                      <Row gap={3} style={{ alignItems: 'center' }}>
                        <Star size={9} fill="currentColor" />
                        default
                      </Row>
                    </SemanticChip>
                  </div>
                )}
                {/* Untagged warning on second card */}
                {idx === 1 && (
                  <div style={{ position: 'absolute', top: 6, right: 6 }}>
                    <AlertTriangle size={13} color="var(--warning)" aria-label="missing required attributes" />
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
                  <Avatar name={v.name} size={36} />
                </div>
                <div style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-primary)' }}>{v.name}</div>
                <Row gap={3} style={{ marginTop: 5, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {v.pills.map(p => (
                    <VoiceAttrPill key={p.label} category={p.category}>{p.label}</VoiceAttrPill>
                  ))}
                </Row>
                <Row gap={4} style={{ marginTop: 6, justifyContent: 'center' }}>
                  <Btn small aria-label={`Preview ${v.name}`}>
                    <Row gap={3} style={{ alignItems: 'center' }}>
                      <Play size={9} />
                      Preview
                    </Row>
                  </Btn>
                  <Btn small primary onClick={() => setSelectedVoice(v)}>{v.cta}</Btn>
                </Row>
              </Card>
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
              borderRadius: 'var(--radius-card)', padding: '4px 10px',
            }}>
              <Search size={12} color="var(--text-muted)" />
              <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-muted)', fontStyle: 'italic' }}>Search voices…</span>
            </div>
          </Row>
          <Row gap={6} style={{ flexWrap: 'wrap' }}>
            <VoiceAttrPill category="class">Narrator</VoiceAttrPill>
            <VoiceAttrPill category="gender">Male</VoiceAttrPill>
            <VoiceAttrPill category="extended">English</VoiceAttrPill>
            <Chip>+ Filter</Chip>
          </Row>
          <div style={{ fontSize: 'var(--type-caption)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Community voices from Hugging Face — install to use locally.
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(145px, 1fr))', gap: 8 }}>
            {DISCOVER_CARDS.map((v, idx) => (
              <Card key={v.name} style={{
                padding: '10px 10px 8px', textAlign: 'center',
                borderRadius: 'var(--radius-card)',
              }}>
                <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 6 }}>
                  <Avatar name={v.name} size={36} style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }} />
                </div>
                <div style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-primary)' }}>{v.name}</div>
                <Row gap={3} style={{ marginTop: 5, justifyContent: 'center', flexWrap: 'wrap' }}>
                  {v.pills.map(p => (
                    <VoiceAttrPill key={p.label} category={p.category}>{p.label}</VoiceAttrPill>
                  ))}
                </Row>
                {idx === 1 ? (
                  <Col gap={3} style={{ marginTop: 6 }}>
                    <span style={{ fontSize: 'var(--type-micro)', color: 'var(--accent)', fontStyle: 'italic' }}>installing… 64%</span>
                    <ProgressBar pct={64} height={3} shimmer />
                  </Col>
                ) : (
                  <Btn small style={{ marginTop: 6 }}>
                    <Row gap={4} style={{ alignItems: 'center' }}>
                      <Download size={10} />
                      Install
                    </Row>
                  </Btn>
                )}
              </Card>
            ))}
          </div>
        </>
      )}
    </Col>
  );
};
