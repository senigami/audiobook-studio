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
  Volume2,
  Music,
  Sparkles,
  Mic,
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
} from '../shared';
import { VoiceProfileEditorPane } from './voiceEditor';

// ---------------------------------------------------------------------------
// Types

export type VoicePill = { label: string; category: 'class' | 'gender' | 'age' | 'extended' | 'tag' };

export type Voice = {
  name: string;
  description: string;
  pills: VoicePill[];
  cta: string;
  avatarColor?: string;
  avatarIcon?: string;
  // Taxonomy fields
  languages?: string[];
  accent?: string;
  styles?: string[];
  category?: 'Narrator' | 'Dialogue' | 'Character' | '';
  gender?: 'Female' | 'Male' | 'NB' | '';
  age?: 'Child' | 'Adult' | 'Senior' | '';
};

// ---------------------------------------------------------------------------
// Voice data — pills classified by category (class/gender/age/extended/tag)

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
// Custom Avatar component supporting dynamic icon and color

const CustomAvatar: React.FC<{
  name: string;
  size?: number;
  color?: string;
  icon?: string;
  style?: React.CSSProperties;
}> = ({ name, size = 44, color, icon, style }) => {
  const initials = name
    ? name.split(' ').slice(0, 2).map(w => w[0].toUpperCase()).join('')
    : '';

  const getIcon = () => {
    switch (icon) {
      case 'volume-2': return <Volume2 size={size * 0.44} />;
      case 'music': return <Music size={size * 0.44} />;
      case 'sparkles': return <Sparkles size={size * 0.44} />;
      case 'mic': return <Mic size={size * 0.44} />;
      default: return null;
    }
  };

  const bg = color || 'var(--accent-tint-bg)';
  const borderCol = color ? 'transparent' : 'var(--accent-tint-border)';
  const textCol = color ? '#ffffff' : 'var(--accent)';

  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        border: `1.5px solid ${borderCol}`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: textCol,
        fontWeight: 700,
        fontSize: `${size * 0.34}px`,
        flexShrink: 0,
        boxShadow: color ? '0 2px 8px rgba(0,0,0,0.18)' : 'var(--shadow-sm)',
        letterSpacing: '-0.01em',
        ...style,
      }}
    >
      {getIcon() || initials}
    </div>
  );
};

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
          background: 'var(--surface)', border: 'var(--hairline)',
          borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-lg)', minWidth: 150, overflow: 'hidden',
        }}>
          {['Rename', 'Move to another voice', 'Delete'].map((item, i, arr) => (
            <div
              key={item}
              onClick={() => setOpen(false)}
              style={{
                padding: '7px 12px', fontSize: 'var(--type-micro)', cursor: 'pointer',
                color: item === 'Delete' ? 'var(--error)' : 'var(--text-primary)',
                borderBottom: i < arr.length - 1 ? 'var(--hairline)' : 'none',
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
          background: 'var(--surface)', border: 'var(--hairline)',
          borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-md)', padding: 'var(--space-2) var(--space-3)', minWidth: 160,
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
// My Voice Card Component

const MyVoiceCard: React.FC<{
  voice: Voice;
  isDefault: boolean;
  hasWarning: boolean;
  onSelect: () => void;
  onSetDefault: () => void;
  onEditMetadata: () => void;
  onRename: () => void;
  onExportBundle: () => void;
  onDelete: () => void;
}> = ({ voice, isDefault, hasWarning, onSelect, onSetDefault, onEditMetadata, onRename, onExportBundle, onDelete }) => {
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <Card interactive style={{
      padding: 'var(--space-3) var(--space-3) var(--space-2)', textAlign: 'center',
      position: 'relative', borderRadius: 'var(--radius-card)',
      display: 'flex', flexDirection: 'column', height: '100%',
    }}>
      {/* Badges on left */}
      <div style={{ position: 'absolute', top: 'var(--space-2)', left: 'var(--space-2)', display: 'flex', gap: 4, alignItems: 'center', zIndex: 5 }}>
        {isDefault && (
          <SemanticChip variant="warning">
            <Row gap={3} style={{ alignItems: 'center' }}>
              <Star size={9} fill="currentColor" />
              default
            </Row>
          </SemanticChip>
        )}
        {hasWarning && (
          <SemanticChip variant="warning">
            <Row gap={3} style={{ alignItems: 'center' }}>
              <AlertTriangle size={9} />
              Untagged
            </Row>
          </SemanticChip>
        )}
      </div>

      {/* Overflow menu on right */}
      <div style={{ position: 'absolute', top: 'var(--space-2)', right: 'var(--space-2)', zIndex: 10 }}>
        <button
          onClick={(e) => {
            e.stopPropagation();
            setMenuOpen(o => !o);
          }}
          aria-label="Voice options"
          style={{
            background: 'var(--surface-alt)',
            border: 'var(--hairline)',
            borderRadius: 'var(--radius-round)',
            width: 22, height: 22,
            cursor: 'pointer',
            color: 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        >
          <MoreHorizontal size={12} />
        </button>

        {menuOpen && (
          <>
            {/* Backdrop to close menu */}
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 20 }}
              onClick={(e) => {
                e.stopPropagation();
                setMenuOpen(false);
              }}
            />
            <div style={{
              position: 'absolute', right: 0, top: '100%', marginTop: 4, zIndex: 30,
              background: 'var(--surface)', border: 'var(--hairline)',
              borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-lg)', minWidth: 140, overflow: 'hidden',
              textAlign: 'left',
            }}>
              {[
                { label: 'Set default', action: onSetDefault },
                { label: 'Edit metadata', action: onEditMetadata },
                { label: 'Rename', action: onRename },
                { label: 'Export bundle', action: onExportBundle },
                { label: 'Delete', action: onDelete, isDanger: true },
              ].map((opt) => (
                <button
                  type="button"
                  key={opt.label}
                  onClick={(e) => {
                    e.stopPropagation();
                    setMenuOpen(false);
                    opt.action();
                  }}
                  style={{
                    width: '100%',
                    border: 0,
                    fontFamily: 'inherit',
                    textAlign: 'left',
                    padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--type-caption)', cursor: 'pointer',
                    color: opt.isDanger ? 'var(--error)' : 'var(--text-primary)',
                    borderBottom: 'var(--hairline)',
                    background: 'var(--surface)',
                  }}
                  onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-alt)'}
                  onMouseLeave={(e) => e.currentTarget.style.background = 'var(--surface)'}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>

      {/* Card Content */}
      <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--space-2)', marginTop: 'var(--space-3)' }}>
        <CustomAvatar name={voice.name} color={voice.avatarColor} icon={voice.avatarIcon} size={44} />
      </div>
      <div style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: 'var(--tracking-tight)' }}>{voice.name}</div>

      <Row gap={3} style={{ marginTop: 'var(--space-1)', justifyContent: 'center', flexWrap: 'wrap', flex: 1 }}>
        {voice.pills.map((p) => (
          <VoiceAttrPill key={p.label} category={p.category}>{p.label}</VoiceAttrPill>
        ))}
      </Row>

      <Row gap={4} style={{ marginTop: 'var(--space-2)', justifyContent: 'center' }}>
        <Btn small aria-label={`Preview ${voice.name}`}>
          <Row gap={3} style={{ alignItems: 'center' }}>
            <Play size={9} />
            Preview
          </Row>
        </Btn>
        <Btn
          small
          onClick={onSelect}
          style={{
            background: 'var(--accent-tint-bg)',
            borderColor: 'var(--accent-tint-border)',
            color: 'var(--accent)',
          }}
        >
          {voice.cta}
        </Btn>
      </Row>
    </Card>
  );
};

// ---------------------------------------------------------------------------
// VoiceLab detail

const VoiceLab: React.FC<{
  voice: Voice;
  onBack: () => void;
  onSetDefault: () => void;
  onEditMetadata: () => void;
  onRename: () => void;
  onExportBundle: () => void;
  onDelete: () => void;
}> = ({ voice, onBack, onSetDefault, onEditMetadata, onRename, onExportBundle, onDelete }) => {
  const phaseSteps = ['Samples', 'Build', 'Test', 'Ready'] as const;
  const [activeStep, setActiveStep] = useState<'Samples' | 'Build' | 'Test' | 'Ready'>('Samples');
  const [actionsMenuOpen, setActionsMenuOpen] = useState(false);

  const SAMPLES = [
    { name: 'sample_01.mp3', dur: '0:12' },
    { name: 'sample_02.mp3', dur: '0:09' },
    { name: 'sample_03.mp3', dur: '0:15' },
  ];

  return (
    <Col gap={0} style={{ flex: 1, overflowY: 'auto' }}>
      <div style={{ padding: 'var(--space-2) var(--space-4) 0', flexShrink: 0 }}>
        <button
          onClick={onBack}
          aria-label="Back to Voices"
          style={{
            background: 'var(--surface-alt)', border: 'var(--hairline)', borderRadius: 'var(--radius-button)', cursor: 'pointer',
            fontSize: 'var(--type-micro)', color: 'var(--text-secondary)', padding: 'var(--space-1) var(--space-2)',
            display: 'inline-flex', alignItems: 'center', gap: 5, marginBottom: 'var(--space-2)',
          }}
        >
          <ChevronRight size={11} style={{ transform: 'rotate(180deg)' }} />
          Back to Voices
        </button>

        <Row gap={12} style={{ alignItems: 'flex-start', marginTop: 'var(--space-2)' }}>
          <CustomAvatar name={voice.name} color={voice.avatarColor} icon={voice.avatarIcon} size={56} style={{ border: '2px solid var(--accent)', boxShadow: 'var(--accent-glow-strong)' }} />
          <Col gap={4} style={{ flex: 1 }}>
            <Row gap={8} style={{ alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 'var(--type-headline)', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: 'var(--tracking-tight)' }}>{voice.name}</span>
              <Btn small>
                <Row gap={4} style={{ alignItems: 'center' }}>
                  <Copy size={10} />
                  Copy icon prompt
                </Row>
              </Btn>

              {/* Voice Actions Menu */}
              <div style={{ position: 'relative' }}>
                <Btn small onClick={() => setActionsMenuOpen(o => !o)}>
                  <Row gap={4} style={{ alignItems: 'center' }}>
                    <span>Voice Actions</span>
                    <ChevronDown size={10} />
                  </Row>
                </Btn>
                {actionsMenuOpen && (
                  <>
                    <div style={{ position: 'fixed', inset: 0, zIndex: 40 }} onClick={() => setActionsMenuOpen(false)} />
                    <div style={{
                      position: 'absolute', left: 0, top: '100%', marginTop: 4, zIndex: 50,
                      background: 'var(--surface)', border: 'var(--hairline)',
                      borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-lg)', minWidth: 145, overflow: 'hidden',
                    }}>
                      {[
                        { label: 'Set default', action: onSetDefault },
                        { label: 'Edit metadata', action: onEditMetadata },
                        { label: 'Rename', action: onRename },
                        { label: 'Export bundle', action: onExportBundle },
                        { label: 'Delete', action: onDelete, isDanger: true },
                      ].map((opt) => (
                        <button
                          type="button"
                          key={opt.label}
                          onClick={() => {
                            setActionsMenuOpen(false);
                            opt.action();
                          }}
                          style={{
                            width: '100%',
                            border: 0,
                            fontFamily: 'inherit',
                            textAlign: 'left',
                            padding: 'var(--space-2) var(--space-3)', fontSize: 'var(--type-caption)', cursor: 'pointer',
                            color: opt.isDanger ? 'var(--error)' : 'var(--text-primary)',
                            borderBottom: 'var(--hairline)',
                            background: 'var(--surface)',
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-alt)'}
                          onMouseLeave={(e) => e.currentTarget.style.background = 'var(--surface)'}
                        >
                          {opt.label}
                        </button>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </Row>
            <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              image prompt from attributes + description — uniform icons
            </div>
            <Row gap={4} style={{ flexWrap: 'wrap', marginTop: 2 }}>
              {voice.pills.map(p => (
                <VoiceAttrPill key={p.label} category={p.category}>{p.label}</VoiceAttrPill>
              ))}
            </Row>
            <div style={{ fontSize: 'var(--type-caption)', color: 'var(--text-secondary)', marginTop: 2, lineHeight: 'var(--leading-normal)' }}>
              {voice.description || 'No description provided.'}
            </div>
          </Col>
        </Row>

        {/* Phase stepper */}
        <Row gap={0} style={{ alignItems: 'center', marginTop: 'var(--space-4)', marginBottom: 'var(--space-2)' }}>
          {phaseSteps.map((step, i) => {
            const isActive = step === activeStep;
            const isPast = phaseSteps.indexOf(step) < phaseSteps.indexOf(activeStep);
            return (
              <React.Fragment key={step}>
                {i > 0 && (
                  <div style={{ flex: 1, height: 1, background: isPast || isActive ? 'var(--accent)' : 'var(--border)' }} />
                )}
                <div
                  onClick={() => setActiveStep(step)}
                  style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 3, flexShrink: 0, cursor: 'pointer' }}
                >
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%',
                    background: isActive ? 'var(--accent)' : isPast ? 'var(--accent-tint-bg)' : 'var(--surface-alt)',
                    border: `2px solid ${isActive || isPast ? 'var(--accent)' : 'var(--border)'}`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: 'var(--type-micro)',
                    color: isActive ? 'var(--text-on-accent)' : isPast ? 'var(--accent)' : 'var(--text-muted)',
                    fontWeight: 700,
                    boxShadow: isActive ? 'var(--shadow-sm)' : 'none',
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
        <div style={{ borderBottom: 'var(--hairline)', marginBottom: 'var(--space-4)' }} />
      </div>

      <Col gap={12} style={{ padding: '0 var(--space-4) var(--space-4)' }}>
        {/* Sample manager */}
        {activeStep === 'Samples' && (
          <Col gap={6}>
            <Label>Samples</Label>
            <Card style={{ borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
              {SAMPLES.map((s, i) => (
                <Row key={s.name} gap={8} style={{
                  padding: 'var(--space-2) var(--space-3)', alignItems: 'center',
                  borderBottom: i < SAMPLES.length - 1 ? 'var(--hairline)' : 'none',
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
              display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
              padding: 'var(--space-2) var(--space-3)', border: '1px dashed var(--border)',
              borderRadius: 'var(--radius-card)', background: 'var(--surface-alt)',
            }}>
              <Upload size={12} color="var(--text-muted)" />
              <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-muted)', flex: 1 }}>+ Add samples — drop MP3 or WAV here</span>
              <Btn small>Choose file</Btn>
            </div>
          </Col>
        )}

        {/* Variants & Engine Settings */}
        {activeStep === 'Build' && (
          <>
            <Col gap={6}>
              <Label>Variants</Label>
              <Card style={{ borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
                {[
                  { name: 'Default', isDefault: true, speed: '1.0', temp: '0.65' },
                  { name: 'Soft-spoken', isDefault: false, speed: '1.0', temp: '0.65' },
                ].map((variant, i, arr) => (
                  <Row key={variant.name} gap={8} style={{
                    padding: 'var(--space-2) var(--space-3)', alignItems: 'center',
                    borderBottom: i < arr.length - 1 ? 'var(--hairline)' : 'none',
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
                    padding: 'var(--space-2) var(--space-3)', alignItems: 'center',
                    borderBottom: i < arr.length - 1 ? 'var(--hairline)' : 'none',
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
          </>
        )}

        {/* Test Strip */}
        {activeStep === 'Test' && (
          <Col gap={6}>
            <Label>Test</Label>
            <Card style={{ borderRadius: 'var(--radius-card)', padding: 'var(--space-3)' }}>
              {/* Engine + reference sample row */}
              <Row gap={6} style={{ alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', flexShrink: 0 }}>Engine</span>
                <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-secondary)', background: 'var(--surface-alt)', border: 'var(--hairline)', borderRadius: 4, padding: 'var(--space-1) var(--space-2)', cursor: 'pointer' }}>
                  <Row gap={3} style={{ alignItems: 'center' }}>Primary Engine <ChevronDown size={10} /></Row>
                </span>
                <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', flexShrink: 0 }}>Ref</span>
                <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-secondary)', background: 'var(--surface-alt)', border: 'var(--hairline)', borderRadius: 4, padding: 'var(--space-1) var(--space-2)', cursor: 'pointer', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  <Row gap={3} style={{ alignItems: 'center' }}>sample_01.mp3 <ChevronDown size={10} /></Row>
                </span>
              </Row>
              <Row gap={6} style={{ alignItems: 'center', marginBottom: 'var(--space-2)' }}>
                <div style={{
                  flex: 1, fontSize: 'var(--type-caption)', color: 'var(--text-secondary)',
                  background: 'var(--surface-alt)', border: 'var(--hairline)',
                  borderRadius: 4, padding: 'var(--space-1) var(--space-2)',
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
        )}

        {/* Ready / Export */}
        {activeStep === 'Ready' && (
          <Col gap={4}>
            <Label>Export</Label>
            <Row gap={8} style={{ alignItems: 'center' }}>
              <Btn small onClick={() => onExportBundle()}>
                <Row gap={4} style={{ alignItems: 'center' }}>
                  <Download size={10} />
                  Export bundle (.zip)
                </Row>
              </Btn>
              <Btn small>Publish to Hugging Face</Btn>
            </Row>
          </Col>
        )}
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
        background: 'var(--surface)', border: 'var(--hairline)', borderRadius: 'var(--radius-panel)',
        width: 360, maxHeight: '90%', overflowY: 'auto', boxShadow: 'var(--shadow-xl)',
        padding: 'var(--space-4) var(--space-4)',
      }}>
        <Row gap={8} style={{ alignItems: 'center', marginBottom: 'var(--space-3)' }}>
          <span style={{ fontSize: 'var(--type-headline)', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>Recording Guide</span>
          <button onClick={onClose} aria-label="Close recording guide" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
            <X size={15} />
          </button>
        </Row>

        {/* Tips */}
        <Col gap={10} style={{ marginBottom: 'var(--space-4)' }}>
          {[
            { label: 'Audio quality', tips: ['Record in a quiet room — closets and carpeted spaces reduce echo.', 'Use 44.1kHz / 16-bit WAV or 320 kbps MP3; avoid compressed formats.'] },
            { label: 'Performance', tips: ['Maintain a consistent distance (6–8 in) from the microphone.', 'Read each prompt in your natural narrator voice without pauses mid-sentence.'] },
          ].map(group => (
            <Col gap={4} key={group.label}>
              <div style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-secondary)' }}>{group.label}</div>
              {group.tips.map(tip => (
                <Row gap={6} key={tip} style={{ alignItems: 'flex-start' }}>
                  <span style={{ fontSize: 'var(--type-micro)', color: 'var(--accent)', flexShrink: 0, marginTop: 1 }}>•</span>
                  <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-muted)', lineHeight: 'var(--leading-normal)' }}>{tip}</span>
                </Row>
              ))}
            </Col>
          ))}
        </Col>

        <div style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--space-2)' }}>Prompt library</div>
        <Col gap={4}>
          {/* Narration category */}
          <div style={{ border: 'var(--hairline)', borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
            <div
              onClick={() => setNarrationOpen(o => !o)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--space-2) var(--space-3)', cursor: 'pointer',
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
                    padding: 'var(--space-2) var(--space-3)', alignItems: 'flex-start',
                    borderTop: 'var(--hairline)',
                    background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-alt)',
                  }}>
                    <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-secondary)', flex: 1, lineHeight: 'var(--leading-normal)' }}>{prompt}</span>
                    <button aria-label="Copy prompt" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                      <Copy size={12} />
                    </button>
                  </Row>
                ))}
              </Col>
            )}
          </div>

          {/* Character range category */}
          <div style={{ border: 'var(--hairline)', borderRadius: 'var(--radius-card)', overflow: 'hidden' }}>
            <div
              onClick={() => setCharacterOpen(o => !o)}
              style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: 'var(--space-2) var(--space-3)', cursor: 'pointer',
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
                    padding: 'var(--space-2) var(--space-3)', alignItems: 'flex-start',
                    borderTop: 'var(--hairline)',
                    background: i % 2 === 0 ? 'var(--surface)' : 'var(--surface-alt)',
                  }}>
                    <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-secondary)', flex: 1, lineHeight: 'var(--leading-normal)' }}>{prompt}</span>
                    <button aria-label="Copy prompt" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                      <Copy size={12} />
                    </button>
                  </Row>
                ))}
              </Col>
            )}
          </div>
        </Col>

        <div style={{ marginTop: 'var(--space-4)', textAlign: 'right' }}>
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
      background: 'var(--surface)', border: 'var(--hairline)', borderRadius: 'var(--radius-panel)',
      width: 320, boxShadow: 'var(--shadow-xl)', padding: 'var(--space-4)',
    }}>
      <Row gap={8} style={{ alignItems: 'center', marginBottom: 'var(--space-4)' }}>
        <span style={{ fontSize: 'var(--type-headline)', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>New voice</span>
        <button onClick={onClose} aria-label="Close new voice dialog" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
          <X size={15} />
        </button>
      </Row>
      <Col gap={10}>
        <Col gap={4}>
          <div style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-secondary)' }}>Name</div>
          <div style={{
            background: 'var(--surface-alt)', border: 'var(--hairline)', borderRadius: 'var(--radius-button)',
            padding: 'var(--space-1) var(--space-2)', fontSize: 'var(--type-caption)', color: 'var(--text-muted)', fontStyle: 'italic',
          }}>e.g. Elena Marsh</div>
        </Col>
        <Col gap={4}>
          <div style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-secondary)' }}>Engine</div>
          <Col gap={4}>
            {[
              { id: 'primary', label: 'Primary Engine', ready: true },
              { id: 'voxtral', label: 'Voxtral (Mistral AI)', ready: false, note: 'Needs setup' },
            ].map(opt => (
              <Row key={opt.id} gap={8} style={{
                padding: 'var(--space-2) var(--space-3)', borderRadius: 'var(--radius-button)',
                background: opt.id === 'primary' ? 'var(--accent-tint-bg)' : 'var(--surface-alt)',
                border: `1px solid ${opt.id === 'primary' ? 'var(--accent)' : 'var(--border)'}`,
                alignItems: 'center', cursor: 'pointer',
              }}>
                <span style={{ fontSize: 'var(--type-caption)', color: opt.id === 'primary' ? 'var(--accent)' : 'var(--text-secondary)', flex: 1, fontWeight: opt.id === 'primary' ? 700 : 400 }}>
                  {opt.label}
                </span>
                {!opt.ready && (
                  <SemanticChip variant="warning">Needs setup</SemanticChip>
                )}
                {opt.id === 'primary' && <span style={{ fontSize: 'var(--type-micro)', color: 'var(--accent)' }}>●</span>}
              </Row>
            ))}
          </Col>
        </Col>
      </Col>
      <Row gap={6} style={{ marginTop: 'var(--space-4)', justifyContent: 'flex-end' }}>
        <Btn small onClick={onClose}>Cancel</Btn>
        <Btn small primary onClick={onClose}>Create voice</Btn>
      </Row>
    </div>
  </div>
);

// ---------------------------------------------------------------------------
// Voice Metadata Modal

const VoiceMetadataModal: React.FC<{
  voice: Voice;
  onClose: () => void;
  onSave: (updated: Voice) => void;
}> = ({ voice, onClose, onSave }) => {
  const [name, setName] = useState(voice.name || '');
  const [description, setDescription] = useState(voice.description || '');
  const [avatarColor, setAvatarColor] = useState(voice.avatarColor || '');
  const [avatarIcon, setAvatarIcon] = useState(voice.avatarIcon || '');

  // Taxonomy fields
  const [languages, setLanguages] = useState<string[]>(voice.languages || []);
  const [accent, setAccent] = useState(voice.accent || '');
  const [styles, setStyles] = useState<string[]>(voice.styles || []);
  const [category, setCategory] = useState<'Narrator' | 'Dialogue' | 'Character' | ''>(voice.category || '');
  const [gender, setGender] = useState<'Female' | 'Male' | 'NB' | ''>(voice.gender || '');
  const [age, setAge] = useState<'Child' | 'Adult' | 'Senior' | ''>(voice.age || '');

  const languageOptions = ['English', 'Spanish', 'French', 'German', 'Japanese'];
  const accentOptions = ['US', 'UK', 'Australia', 'India', 'Canada'];
  const styleOptions = ['Warm', 'Bright', 'Deep', 'Gruff', 'Clear', 'Cool', 'Whispering'];

  const colorOptions = [
    { value: '', label: 'Default Tint' },
    { value: '#ef4444', label: 'Red' },
    { value: '#3b82f6', label: 'Blue' },
    { value: '#10b981', label: 'Green' },
    { value: '#f59e0b', label: 'Amber' },
    { value: '#8b5cf6', label: 'Purple' },
    { value: '#06b6d4', label: 'Cyan' },
  ];

  const iconOptions = [
    { value: '', label: 'Initials Only' },
    { value: 'volume-2', label: 'Speaker' },
    { value: 'music', label: 'Music' },
    { value: 'sparkles', label: 'Sparkles' },
    { value: 'mic', label: 'Mic' },
  ];

  const toggleLanguage = (lang: string) => {
    setLanguages(prev =>
      prev.includes(lang) ? prev.filter(l => l !== lang) : [...prev, lang]
    );
  };

  const toggleStyle = (st: string) => {
    setStyles(prev =>
      prev.includes(st) ? prev.filter(s => s !== st) : [...prev, st]
    );
  };

  const hasAnyTags = languages.length > 0 || accent || styles.length > 0 || category || gender || age;
  const isNameEmpty = name.trim() === '';

  const handleSave = () => {
    if (isNameEmpty) return;

    const updatedVoice: Voice = {
      ...voice,
      name: name.trim(),
      description: description.trim(),
      avatarColor,
      avatarIcon,
      languages,
      accent,
      styles,
      category,
      gender,
      age,
      // generate pills dynamically
      pills: [
        ...(category ? [{ label: category, category: 'class' as const }] : []),
        ...(gender ? [{ label: gender === 'NB' ? 'Non-Binary' : gender, category: 'gender' as const }] : []),
        ...(age ? [{ label: age, category: 'age' as const }] : []),
        ...(accent ? [{ label: accent, category: 'extended' as const }] : []),
        ...languages.map(lang => ({ label: lang, category: 'tag' as const })),
        ...styles.map(st => ({ label: st, category: 'extended' as const })),
      ],
    };

    onSave(updatedVoice);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Edit Voice Metadata"
      style={{
        position: 'absolute', inset: 0, background: 'var(--overlay-backdrop)', zIndex: 110,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{
        background: 'var(--surface)', border: 'var(--hairline)', borderRadius: 'var(--radius-panel)',
        width: 380, maxHeight: '90%', overflowY: 'auto', boxShadow: 'var(--shadow-xl)', padding: 'var(--space-4)',
      }}>
        <Row gap={8} style={{ alignItems: 'center', marginBottom: 'var(--space-4)' }}>
          <span style={{ fontSize: 'var(--type-headline)', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>Edit Metadata</span>
          <button onClick={onClose} aria-label="Close edit metadata dialog" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
            <X size={15} />
          </button>
        </Row>

        {/* Warning Banner */}
        {!hasAnyTags && (
          <div style={{
            background: 'var(--warning-tint-bg)',
            border: '1px solid var(--warning-tint-border)',
            color: 'var(--warning-text)',
            padding: 'var(--space-2) var(--space-3)',
            borderRadius: 'var(--radius-card)',
            fontSize: 'var(--type-caption)',
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginBottom: 'var(--space-3)'
          }}>
            <AlertTriangle size={14} color="var(--warning)" />
            <span><strong>Not tagged:</strong> Please specify at least one taxonomy attribute below.</span>
          </div>
        )}

        <Col gap={12}>
          {/* Name */}
          <Col gap={4}>
            <div style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-secondary)' }}>Name</div>
            <input
              type="text"
              value={name}
              onChange={e => setName(e.target.value)}
              style={{
                background: 'var(--surface-alt)', border: 'var(--hairline)', borderRadius: 'var(--radius-button)',
                padding: 'var(--space-1) var(--space-2)', fontSize: 'var(--type-caption)', color: 'var(--text-primary)', width: '100%',
              }}
              placeholder="e.g. Elena Marsh"
            />
            {isNameEmpty && (
              <span style={{ fontSize: 'var(--type-micro)', color: 'var(--error)' }}>Name cannot be empty.</span>
            )}
          </Col>

          {/* Description */}
          <Col gap={4}>
            <div style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-secondary)' }}>Description</div>
            <textarea
              value={description}
              onChange={e => setDescription(e.target.value)}
              rows={3}
              style={{
                background: 'var(--surface-alt)', border: 'var(--hairline)', borderRadius: 'var(--radius-button)',
                padding: 'var(--space-1) var(--space-2)', fontSize: 'var(--type-caption)', color: 'var(--text-primary)', width: '100%',
                resize: 'vertical',
              }}
              placeholder="Describe the voice character and training details..."
            />
          </Col>

          {/* Icon/Color Controls */}
          <Row gap={8}>
            <Col gap={4} style={{ flex: 1 }}>
              <div style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-secondary)' }}>Avatar Color</div>
              <select
                value={avatarColor}
                onChange={e => setAvatarColor(e.target.value)}
                style={{
                  background: 'var(--surface-alt)', border: 'var(--hairline)', borderRadius: 'var(--radius-button)',
                  padding: 'var(--space-1) var(--space-2)', fontSize: 'var(--type-caption)', color: 'var(--text-primary)', width: '100%',
                }}
              >
                {colorOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </Col>
            <Col gap={4} style={{ flex: 1 }}>
              <div style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-secondary)' }}>Avatar Icon</div>
              <select
                value={avatarIcon}
                onChange={e => setAvatarIcon(e.target.value)}
                style={{
                  background: 'var(--surface-alt)', border: 'var(--hairline)', borderRadius: 'var(--radius-button)',
                  padding: 'var(--space-1) var(--space-2)', fontSize: 'var(--type-caption)', color: 'var(--text-primary)', width: '100%',
                }}
              >
                {iconOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </Col>
          </Row>

          <div style={{ borderBottom: 'var(--hairline)', margin: 'var(--space-1) 0' }} />

          {/* Taxonomy fields */}
          <Col gap={8}>
            <Label>Taxonomy v2 Fields</Label>

            {/* Category, Gender, Age */}
            <Row gap={8}>
              <Col gap={4} style={{ flex: 1 }}>
                <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)' }}>Category</div>
                <select
                  value={category}
                  onChange={e => setCategory(e.target.value as any)}
                  style={{
                    background: 'var(--surface-alt)', border: 'var(--hairline)', borderRadius: 'var(--radius-button)',
                    padding: 'var(--space-1) var(--space-2)', fontSize: 'var(--type-caption)', color: 'var(--text-primary)', width: '100%',
                  }}
                >
                  <option value="">Select...</option>
                  <option value="Narrator">Narrator</option>
                  <option value="Dialogue">Dialogue</option>
                  <option value="Character">Character</option>
                </select>
              </Col>

              <Col gap={4} style={{ flex: 1 }}>
                <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)' }}>Gender</div>
                <select
                  value={gender}
                  onChange={e => setGender(e.target.value as any)}
                  style={{
                    background: 'var(--surface-alt)', border: 'var(--hairline)', borderRadius: 'var(--radius-button)',
                    padding: 'var(--space-1) var(--space-2)', fontSize: 'var(--type-caption)', color: 'var(--text-primary)', width: '100%',
                  }}
                >
                  <option value="">Select...</option>
                  <option value="Female">Female</option>
                  <option value="Male">Male</option>
                  <option value="NB">Non-Binary</option>
                </select>
              </Col>

              <Col gap={4} style={{ flex: 1 }}>
                <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)' }}>Age</div>
                <select
                  value={age}
                  onChange={e => setAge(e.target.value as any)}
                  style={{
                    background: 'var(--surface-alt)', border: 'var(--hairline)', borderRadius: 'var(--radius-button)',
                    padding: 'var(--space-1) var(--space-2)', fontSize: 'var(--type-caption)', color: 'var(--text-primary)', width: '100%',
                  }}
                >
                  <option value="">Select...</option>
                  <option value="Child">Child</option>
                  <option value="Adult">Adult</option>
                  <option value="Senior">Senior</option>
                </select>
              </Col>
            </Row>

            {/* Accent (single-select) */}
            <Col gap={4}>
              <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)' }}>Accent (Single-select)</div>
              <Row gap={4} style={{ flexWrap: 'wrap' }}>
                {accentOptions.map(acc => (
                  <Chip
                    key={acc}
                    onClick={() => setAccent(accent === acc ? '' : acc)}
                    style={{
                      border: accent === acc ? '1px solid var(--accent)' : 'var(--hairline)',
                      background: accent === acc ? 'var(--accent-tint-bg)' : 'var(--surface)',
                      color: accent === acc ? 'var(--accent)' : 'var(--text-secondary)',
                      fontSize: 'var(--type-micro)',
                      padding: 'var(--space-1) var(--space-2)',
                    }}
                  >
                    {acc}
                  </Chip>
                ))}
              </Row>
            </Col>

            {/* Languages (multi-select) */}
            <Col gap={4}>
              <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)' }}>Languages (Multi-select)</div>
              <Row gap={4} style={{ flexWrap: 'wrap' }}>
                {languageOptions.map(lang => {
                  const isSel = languages.includes(lang);
                  return (
                    <Chip
                      key={lang}
                      onClick={() => toggleLanguage(lang)}
                      style={{
                        border: isSel ? '1px solid var(--accent)' : 'var(--hairline)',
                        background: isSel ? 'var(--accent-tint-bg)' : 'var(--surface)',
                        color: isSel ? 'var(--accent)' : 'var(--text-secondary)',
                        fontSize: 'var(--type-micro)',
                        padding: 'var(--space-1) var(--space-2)',
                      }}
                    >
                      {lang}
                    </Chip>
                  );
                })}
              </Row>
            </Col>

            {/* Styles (multi-select) */}
            <Col gap={4}>
              <div style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: 'var(--text-muted)' }}>Styles (Multi-select)</div>
              <Row gap={4} style={{ flexWrap: 'wrap' }}>
                {styleOptions.map(st => {
                  const isSel = styles.includes(st);
                  return (
                    <Chip
                      key={st}
                      onClick={() => toggleStyle(st)}
                      style={{
                        border: isSel ? '1px solid var(--accent)' : 'var(--hairline)',
                        background: isSel ? 'var(--accent-tint-bg)' : 'var(--surface)',
                        color: isSel ? 'var(--accent)' : 'var(--text-secondary)',
                        fontSize: 'var(--type-micro)',
                        padding: 'var(--space-1) var(--space-2)',
                      }}
                    >
                      {st}
                    </Chip>
                  );
                })}
              </Row>
            </Col>
          </Col>
        </Col>

        <Row gap={6} style={{ marginTop: 'var(--space-5)', justifyContent: 'flex-end' }}>
          <Btn small onClick={onClose}>Cancel</Btn>
          <Btn small primary onClick={handleSave} disabled={isNameEmpty}>Save Changes</Btn>
        </Row>
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// Export Bundle Modal

const ExportBundleModal: React.FC<{
  voiceName: string;
  onClose: () => void;
}> = ({ voiceName, onClose }) => {
  const [includeMetadata, setIncludeMetadata] = useState(true);
  const [includeAudio, setIncludeAudio] = useState(true);
  const [includeWeights, setIncludeWeights] = useState(false);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [downloadUrl, setDownloadUrl] = useState<string | null>(null);

  const handleAssemble = () => {
    setLoading(true);
    setProgress(0);
    setDownloadUrl(null);

    const interval = setInterval(() => {
      setProgress(prev => {
        if (prev >= 100) {
          clearInterval(interval);
          setLoading(false);
          setDownloadUrl(`mock-download-url-for-${voiceName.toLowerCase().replace(/\s+/g, '-')}-bundle.zip`);
          return 100;
        }
        return prev + 10;
      });
    }, 120);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Export Voice Bundle"
      style={{
        position: 'absolute', inset: 0, background: 'var(--overlay-backdrop)', zIndex: 110,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}
    >
      <div style={{
        background: 'var(--surface)', border: 'var(--hairline)', borderRadius: 'var(--radius-panel)',
        width: 340, boxShadow: 'var(--shadow-xl)', padding: 'var(--space-4)',
      }}>
        <Row gap={8} style={{ alignItems: 'center', marginBottom: 'var(--space-4)' }}>
          <span style={{ fontSize: 'var(--type-headline)', fontWeight: 700, color: 'var(--text-primary)', flex: 1 }}>Export Voice Bundle</span>
          <button onClick={onClose} aria-label="Close export dialog" style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
            <X size={15} />
          </button>
        </Row>

        {!loading && !downloadUrl && (
          <Col gap={12}>
            <div style={{ fontSize: 'var(--type-caption)', color: 'var(--text-secondary)' }}>
              Configure the assets to package in the export bundle for <strong>{voiceName}</strong>.
            </div>

            <Col gap={8} style={{ background: 'var(--surface-alt)', padding: 'var(--space-3)', borderRadius: 'var(--radius-card)', border: 'var(--hairline)' }}>
              <Label style={{ marginBottom: 4 }}>Bundle Options</Label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--type-caption)', cursor: 'pointer', color: 'var(--text-primary)' }}>
                <input type="checkbox" checked={includeMetadata} onChange={e => setIncludeMetadata(e.target.checked)} />
                Metadata (JSON)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--type-caption)', cursor: 'pointer', color: 'var(--text-primary)' }}>
                <input type="checkbox" checked={includeAudio} onChange={e => setIncludeAudio(e.target.checked)} />
                Reference Audio (.wav)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 'var(--type-caption)', cursor: 'pointer', color: 'var(--text-primary)' }}>
                <input type="checkbox" checked={includeWeights} onChange={e => setIncludeWeights(e.target.checked)} />
                Engine Model Weights
              </label>
            </Col>

            <Row gap={8} style={{ justifyContent: 'flex-end', marginTop: 'var(--space-2)' }}>
              <Btn small onClick={onClose}>Cancel</Btn>
              <Btn small primary onClick={handleAssemble}>Assemble Bundle</Btn>
            </Row>
          </Col>
        )}

        {loading && (
          <Col gap={12} style={{ alignItems: 'center', padding: 'var(--space-3) 0' }}>
            <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-secondary)' }}>Packaging bundle components...</span>
            <div style={{ width: '100%' }}>
              <ProgressBar pct={progress} height={6} shimmer />
            </div>
            <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>{progress}% complete</span>
          </Col>
        )}

        {downloadUrl && (
          <Col gap={12} style={{ padding: 'var(--space-3) 0' }}>
            <div style={{ fontSize: 'var(--type-caption)', color: 'var(--text-primary)' }}>
              Voice bundle successfully assembled!
            </div>

            <div style={{ background: 'var(--success-tint-bg)', border: '1px solid var(--success)', padding: 'var(--space-3)', borderRadius: 'var(--radius-card)', fontSize: 'var(--type-caption)', color: 'var(--success-text)' }}>
              Includes: {includeMetadata ? 'Metadata, ' : ''}{includeAudio ? 'Audio, ' : ''}{includeWeights ? 'Weights' : ''}
            </div>

            <a
              href={`data:text/plain;charset=utf-8,${encodeURIComponent('Mock voice bundle data')}`}
              download={`${voiceName.toLowerCase().replace(/\s+/g, '-')}-bundle.zip`}
              style={{
                display: 'block',
                textDecoration: 'none',
                textAlign: 'center',
                background: 'var(--accent)',
                color: '#fff',
                padding: 'var(--space-2) var(--space-3)',
                borderRadius: 'var(--radius-button)',
                fontSize: 'var(--type-caption)',
                fontWeight: 600,
                marginTop: 'var(--space-2)',
              }}
              onClick={onClose}
            >
              Download .zip Bundle
            </a>
          </Col>
        )}
      </div>
    </div>
  );
};

// ---------------------------------------------------------------------------
// VoicesPane

export const VoicesPane: React.FC = () => {
  const [voiceTab, setVoiceTab] = useState<'local' | 'discover'>('local');
  const [selectedVoiceName, setSelectedVoiceName] = useState<string | null>(null);
  const [defaultVoiceName, setDefaultVoiceName] = useState<string>('Studio Voice');

  const [editorOpen, setEditorOpen] = useState(false);
  const [editorVoiceName, setEditorVoiceName] = useState<string | null>(null);

  const [editingVoice, setEditingVoice] = useState<Voice | null>(null);
  const [exportingVoice, setExportingVoice] = useState<Voice | null>(null);

  const [showGuide, setShowGuide] = useState(false);
  const [showCreate, setShowCreate] = useState(false);

  const [voices, setVoices] = useState<Voice[]>(() => {
    return VOICE_CARDS.map((v) => {
      let desc = '';
      let languages: string[] = [];
      let accent = '';
      let styles: string[] = [];
      let category: 'Narrator' | 'Dialogue' | 'Character' | '' = '';
      let gender: 'Female' | 'Male' | 'NB' | '' = '';
      let age: 'Child' | 'Adult' | 'Senior' | '' = '';

      if (v.name === 'Studio Voice') {
        desc = 'A warm, expressive narrator voice suited for literary fiction and long-form narration. Trained on 4h 20m of clean studio recordings.';
        languages = ['English'];
        accent = 'US';
        styles = ['Warm'];
        category = 'Narrator';
        gender = 'Female';
        age = 'Adult';
      } else if (v.name === 'Marcus Reed') {
        desc = 'A deep, authoritative voice perfect for thrillers, biographies, and dramatic audiobooks.';
      } else if (v.name === 'Clara Bell') {
        desc = 'A bright, energetic voice, ideal for dialogues, children\'s books, and commercial narration.';
        languages = ['English'];
        accent = 'UK';
        styles = ['Bright'];
        category = 'Dialogue';
        gender = 'Female';
        age = 'Adult';
      } else if (v.name === 'Old Tom') {
        desc = 'A gruff, characterful older voice with texture, suited for fantasy and historical fiction roles.';
        languages = ['English'];
        accent = 'UK';
        styles = ['Gruff'];
        category = 'Character';
        gender = 'Male';
        age = 'Senior';
      } else if (v.name === 'Aria') {
        desc = 'A clear, natural voice designed for educational content and clean textbook narration.';
        languages = ['English'];
        accent = 'US';
        styles = ['Clear'];
        category = 'Narrator';
        gender = 'Female';
        age = 'Adult';
      } else if (v.name === 'Frost') {
        desc = 'A cool, ambient non-binary voice that brings a modern, stylistic edge to speculative fiction.';
        languages = ['English'];
        accent = 'Canada';
        styles = ['Cool'];
        category = 'Character';
        gender = 'NB';
        age = 'Adult';
      }

      return {
        ...v,
        description: desc,
        languages,
        accent,
        styles,
        category,
        gender,
        age,
        avatarColor: v.name === 'Studio Voice' ? '#3b82f6' : '',
        avatarIcon: v.name === 'Studio Voice' ? 'volume-2' : '',
      };
    });
  });

  const selectedVoice = voices.find(v => v.name === selectedVoiceName) || null;

  if (editorOpen) {
    return (
      <VoiceProfileEditorPane
        voices={voices}
        initialSelectedName={editorVoiceName}
        onBack={() => setEditorOpen(false)}
        onChangeVoice={(updated, originalName) =>
          setVoices(prev => prev.map(v => (v.name === originalName ? updated : v)))}
      />
    );
  }

  if (selectedVoice) {
    return (
      <VoiceLab
        voice={selectedVoice}
        onBack={() => setSelectedVoiceName(null)}
        onSetDefault={() => setDefaultVoiceName(selectedVoice.name)}
        onEditMetadata={() => { setEditorVoiceName(selectedVoice.name); setEditorOpen(true); }}
        onRename={() => {
          const newName = window.prompt(`Rename voice "${selectedVoice.name}" to:`, selectedVoice.name);
          if (newName !== null && newName.trim() !== '') {
            setVoices(prev => prev.map(v => v.name === selectedVoice.name ? { ...v, name: newName.trim() } : v));
            setSelectedVoiceName(newName.trim());
          }
        }}
        onExportBundle={() => setExportingVoice(selectedVoice)}
        onDelete={() => {
          if (window.confirm(`Are you sure you want to delete the voice "${selectedVoice.name}"?`)) {
            setVoices(prev => prev.filter(v => v.name !== selectedVoice.name));
            setSelectedVoiceName(null);
          }
        }}
      />
    );
  }

  return (
    <Col gap={0} className="ns-enter" style={{ padding: 0, flex: 1, overflowY: 'auto', position: 'relative' }}>
      {showGuide && <RecordingGuideModal onClose={() => setShowGuide(false)} />}
      {showCreate && <CreateVoiceModal onClose={() => setShowCreate(false)} />}
      {editingVoice && (
        <VoiceMetadataModal
          voice={editingVoice}
          onClose={() => setEditingVoice(null)}
          onSave={(updated) => {
            setVoices(prev => prev.map(v => v.name === editingVoice.name ? updated : v));
            if (selectedVoiceName === editingVoice.name) {
              setSelectedVoiceName(updated.name);
            }
            setEditingVoice(null);
          }}
        />
      )}
      {exportingVoice && (
        <ExportBundleModal
          voiceName={exportingVoice.name}
          onClose={() => setExportingVoice(null)}
        />
      )}

      {/* Top action bar */}
      <div style={{
        padding: 'var(--space-3) var(--space-4)',
        borderBottom: 'var(--hairline)',
        display: 'flex',
        alignItems: 'center',
        gap: 'var(--space-2)',
        flexWrap: 'wrap',
      }}>
        {/* Segmented tab control */}
        <div style={{
          display: 'inline-flex',
          border: 'var(--hairline)',
          borderRadius: 'var(--radius-round)',
          overflow: 'hidden',
          background: 'var(--surface-alt)',
          flexShrink: 0,
        }}>
          {(['local', 'discover'] as const).map((tab, i) => (
            <div
              key={tab}
              onClick={() => setVoiceTab(tab)}
              style={{
                fontSize: 'var(--type-caption)', fontWeight: 600,
                padding: 'var(--space-1) var(--space-3)',
                cursor: 'pointer',
                borderRight: i === 0 ? 'var(--hairline)' : 'none',
                background: voiceTab === tab ? 'var(--accent-tint-bg)' : 'transparent',
                color: voiceTab === tab ? 'var(--accent)' : 'var(--text-secondary)',
                transition: 'background 0.15s, color 0.15s',
                whiteSpace: 'nowrap',
              }}
            >
              {tab === 'local' ? 'My Voices' : 'Discover'}
            </div>
          ))}
        </div>

        <div style={{ flex: 1 }} />

        {/* Action buttons */}
        <Btn small onClick={() => { setEditorVoiceName(null); setEditorOpen(true); }}>
          <Row gap={4} style={{ alignItems: 'center' }}>
            <Pencil size={11} />
            Edit profiles
          </Row>
        </Btn>
        <Btn small>
          <Row gap={4} style={{ alignItems: 'center' }}>
            <Upload size={10} />
            Import (.zip)
          </Row>
        </Btn>
        <Btn small onClick={() => {
          const defaultVoice = voices.find(v => v.name === defaultVoiceName) || voices[0];
          if (defaultVoice) setExportingVoice(defaultVoice);
        }}>
          <Row gap={4} style={{ alignItems: 'center' }}>
            <Download size={10} />
            Export bundle (.zip)
          </Row>
        </Btn>
        <Btn small onClick={() => setShowGuide(true)}>
          <Row gap={4} style={{ alignItems: 'center' }}>
            <BookOpen size={10} />
            Recording guide
          </Row>
        </Btn>
        <Btn primary onClick={() => setShowCreate(true)}>
          <Row gap={4} style={{ alignItems: 'center' }}>
            + New voice
          </Row>
        </Btn>
      </div>

      <Col gap={0} style={{ padding: 'var(--space-3) var(--space-4)', flex: 1 }}>
        {voiceTab === 'local' && (
          <>
            {/* Filter chips */}
            <Row gap={6} style={{ flexWrap: 'wrap', marginBottom: 'var(--space-3)' }}>
              <VoiceAttrPill category="class">Narrator</VoiceAttrPill>
              <VoiceAttrPill category="gender">Female</VoiceAttrPill>
              <VoiceAttrPill category="age">Adult</VoiceAttrPill>
              <VoiceAttrPill category="extended">Warm</VoiceAttrPill>
              <Chip>+ Filter</Chip>
            </Row>

            <div
              className="ns-stagger"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 'var(--space-2)' }}
            >
              {voices.map((v) => {
                const isDefault = v.name === defaultVoiceName;
                const hasWarning = !(v.languages && v.languages.length > 0) &&
                                   !v.accent &&
                                   !(v.styles && v.styles.length > 0) &&
                                   !v.category &&
                                   !v.gender &&
                                   !v.age;

                return (
                  <MyVoiceCard
                    key={v.name}
                    voice={v}
                    isDefault={isDefault}
                    hasWarning={hasWarning}
                    onSelect={() => setSelectedVoiceName(v.name)}
                    onSetDefault={() => setDefaultVoiceName(v.name)}
                    onEditMetadata={() => { setEditorVoiceName(v.name); setEditorOpen(true); }}
                    onRename={() => {
                      const newName = window.prompt(`Rename voice "${v.name}" to:`, v.name);
                      if (newName !== null && newName.trim() !== '') {
                        setVoices(prev => prev.map(item => item.name === v.name ? { ...item, name: newName.trim() } : item));
                      }
                    }}
                    onExportBundle={() => setExportingVoice(v)}
                    onDelete={() => {
                      if (window.confirm(`Are you sure you want to delete the voice "${v.name}"?`)) {
                        setVoices(prev => prev.filter(item => item.name !== v.name));
                      }
                    }}
                  />
                );
              })}
            </div>
          </>
        )}

        {voiceTab === 'discover' && (
          <>
            <Row gap={6} style={{ alignItems: 'center', marginBottom: 'var(--space-2)' }}>
              <div style={{
                flex: 1, display: 'flex', alignItems: 'center', gap: 6,
                background: 'var(--surface-alt)', border: 'var(--hairline)',
                borderRadius: 'var(--radius-card)', padding: 'var(--space-1) var(--space-3)',
              }}>
                <Search size={12} color="var(--text-muted)" />
                <span style={{ fontSize: 'var(--type-caption)', color: 'var(--text-muted)', fontStyle: 'italic' }}>Search voices…</span>
              </div>
            </Row>
            <Row gap={6} style={{ flexWrap: 'wrap', marginBottom: 'var(--space-2)' }}>
              <VoiceAttrPill category="class">Narrator</VoiceAttrPill>
              <VoiceAttrPill category="gender">Male</VoiceAttrPill>
              <VoiceAttrPill category="extended">English</VoiceAttrPill>
              <Chip>+ Filter</Chip>
            </Row>
            <div style={{ fontSize: 'var(--type-caption)', color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 'var(--space-3)' }}>
              Community voices from Hugging Face — install to use locally.
            </div>
            <div
              className="ns-stagger"
              style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(148px, 1fr))', gap: 'var(--space-2)' }}
            >
              {DISCOVER_CARDS.map((v, idx) => (
                <Card interactive key={v.name} style={{
                  padding: 'var(--space-3) var(--space-3) var(--space-2)', textAlign: 'center',
                  borderRadius: 'var(--radius-card)',
                }}>
                  <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 'var(--space-2)' }}>
                    <Avatar name={v.name} size={44} style={{ background: 'var(--surface-alt)', borderColor: 'var(--border)' }} />
                  </div>
                  <div style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-primary)', letterSpacing: 'var(--tracking-tight)' }}>{v.name}</div>
                  <Row gap={3} style={{ marginTop: 'var(--space-1)', justifyContent: 'center', flexWrap: 'wrap' }}>
                    {v.pills.map(p => (
                      <VoiceAttrPill key={p.label} category={p.category}>{p.label}</VoiceAttrPill>
                    ))}
                  </Row>
                  {idx === 1 ? (
                    <Col gap={3} style={{ marginTop: 'var(--space-2)' }}>
                      <span style={{ fontSize: 'var(--type-micro)', color: 'var(--accent)', fontStyle: 'italic' }}>installing… 64%</span>
                      <ProgressBar pct={64} height={3} shimmer />
                    </Col>
                  ) : (
                    <Btn small style={{ marginTop: 'var(--space-2)' }}>
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
    </Col>
  );
};
