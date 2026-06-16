/**
 * siteMockup/panes/voiceEditor.tsx — Apple-style master-detail Voice Profile Editor
 * Design-vision mockup only; all actions are presentational.
 */
import React, { useState } from 'react';
import {
  ChevronLeft,
  Plus,
  Search,
  Play,
  Check,
  MoreHorizontal,
  Download,
  RotateCcw,
  Trash2,
  ImagePlus,
  Sparkles,
} from 'lucide-react';
import {
  Row,
  Col,
  Avatar,
  VoiceAttrPill,
  SemanticChip,
  Panel,
  Btn,
} from '../shared';
import type { Voice } from './voices';

// ---------------------------------------------------------------------------
// Inline helper components

const Segmented: React.FC<{
  options: readonly string[];
  value?: string;
  onChange: (v: string) => void;
  ariaLabel: string;
}> = ({ options, value, onChange, ariaLabel }) => (
  <div
    role="radiogroup"
    aria-label={ariaLabel}
    style={{
      display: 'inline-flex',
      gap: 'var(--space-1)',
      padding: 'var(--space-1)',
      background: 'var(--surface-alt)',
      border: '1px solid var(--hairline)',
      borderRadius: 'var(--radius-button)',
    }}
  >
    {options.map(opt => {
      const sel = opt === value;
      return (
        <button
          key={opt}
          role="radio"
          aria-checked={sel}
          type="button"
          onClick={() => onChange(opt)}
          style={{
            padding: '5px 14px',
            minHeight: 30,
            borderRadius: 'calc(var(--radius-button) - 2px)',
            border: sel ? '1px solid var(--accent-tint-border)' : '1px solid transparent',
            background: sel ? 'var(--accent-tint-bg)' : 'transparent',
            boxShadow: sel ? 'var(--shadow-sm)' : 'none',
            color: sel ? 'var(--accent)' : 'var(--text-secondary)',
            fontWeight: 600,
            fontSize: 'var(--type-caption)',
            fontFamily: 'inherit',
            cursor: 'pointer',
            transition: 'background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard)',
          }}
        >
          {opt}
        </button>
      );
    })}
  </div>
);

const ToggleChip: React.FC<{ label: string; on: boolean; onClick: () => void }> = ({
  label,
  on,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    aria-pressed={on}
    style={{
      padding: '5px 14px',
      minHeight: 32,
      borderRadius: 'var(--radius-round)',
      fontFamily: 'inherit',
      fontSize: 'var(--type-caption)',
      fontWeight: 600,
      cursor: 'pointer',
      border: `1px solid ${on ? 'var(--accent-tint-border)' : 'var(--hairline)'}`,
      background: on ? 'var(--accent-tint-bg)' : 'var(--surface-alt)',
      color: on ? 'var(--accent)' : 'var(--text-secondary)',
      transition: 'background var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard)',
    }}
  >
    {label}
  </button>
);

// ---------------------------------------------------------------------------
// Section label helper — uppercase eyebrow with generous breathing room

const SectionLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      fontSize: 'var(--type-micro)',
      fontWeight: 700,
      textTransform: 'uppercase',
      letterSpacing: 'var(--tracking-wide)',
      color: 'var(--text-muted)',
      marginBottom: 'var(--space-2)',
      paddingTop: 'var(--space-1)',
    }}
  >
    {children}
  </div>
);

// Form field label helper
const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div
    style={{
      fontSize: 'var(--type-caption)',
      fontWeight: 600,
      color: 'var(--text-secondary)',
      letterSpacing: 'var(--tracking-tight)',
    }}
  >
    {children}
  </div>
);

// Input/textarea shared styles (object, to reuse inline)
const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '10px var(--space-3)',
  border: '1px solid var(--hairline)',
  borderRadius: 'var(--radius-button)',
  background: 'var(--surface-alt)',
  color: 'var(--text-primary)',
  fontFamily: 'inherit',
  fontSize: 'var(--type-body)',
  boxSizing: 'border-box',
  outline: 'none',
  transition: 'border-color var(--dur-fast) var(--ease-standard), box-shadow var(--dur-fast) var(--ease-standard)',
};

// ---------------------------------------------------------------------------
// Avatar color swatch palette (literal hex permitted per spec)

const AVATAR_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#64748b'];

// ---------------------------------------------------------------------------
// Props

type Props = {
  voices: Voice[];
  initialSelectedName?: string | null;
  onBack: () => void;
  onChangeVoice: (updated: Voice, originalName: string) => void;
};

// ---------------------------------------------------------------------------
// VoiceProfileEditorPane

export const VoiceProfileEditorPane: React.FC<Props> = ({
  voices,
  initialSelectedName,
  onBack,
  onChangeVoice,
}) => {
  const [selectedName, setSelectedName] = useState<string | null>(
    initialSelectedName ?? voices[0]?.name ?? null
  );

  const selected = voices.find(v => v.name === selectedName) ?? null;

  /** Patch a single field and lift the change up. */
  const patch = <K extends keyof Voice>(key: K, value: Voice[K]) => {
    if (!selected) return;
    const originalName = selected.name;
    const updated: Voice = { ...selected, [key]: value };
    if (key === 'name') {
      setSelectedName(value as string);
    }
    onChangeVoice(updated, originalName);
  };

  const LANGUAGE_OPTIONS = ['English', 'Spanish', 'French', 'German', 'Italian', 'Japanese'];
  const ACCENT_OPTIONS = ['US', 'UK', 'Canada', 'Australia', 'India'];
  const STYLE_OPTIONS = ['Warm', 'Bright', 'Gruff', 'Clear', 'Cool', 'Calm', 'Dramatic', 'Soft'];
  const CATEGORY_OPTIONS = ['Narrator', 'Dialogue', 'Character'] as const;
  const GENDER_OPTIONS = ['Female', 'Male', 'NB'] as const;
  const AGE_OPTIONS = ['Child', 'Adult', 'Senior'] as const;

  const MOCK_SAMPLES = [
    { label: 'Sample 1', dur: '0:08' },
    { label: 'Sample 2', dur: '0:11' },
    { label: 'Sample 3', dur: '0:07' },
  ];

  return (
    <div
      className="ns-enter"
      style={{ display: 'flex', flexDirection: 'column', flex: 1, minHeight: 0, containerType: 'inline-size' }}
    >
      {/* Scoped container query styles — the container is THIS root (an element
          cannot respond to its own container query), so .vpe-split is queried as
          a descendant. */}
      <style>{`
        @container (max-width: 720px) {
          .vpe-split { grid-template-columns: 1fr !important; }
          .vpe-list {
            border-right: none !important;
            border-bottom: 1px solid var(--hairline);
            display: flex !important;
            flex-direction: row !important;
            overflow-x: auto;
            overflow-y: hidden !important;
            gap: 6px;
            padding: 8px;
            max-height: none !important;
          }
          .vpe-list .vpe-row { flex: 0 0 auto; min-height: 0; }
          .vpe-list .vpe-sublabel { display: none; }
        }
        .vpe-row { transition: background var(--dur-fast) var(--ease-standard); }
        .vpe-row:not([aria-current="true"]):hover {
          background: var(--surface-dim) !important;
        }
        .vpe-input:focus {
          border-color: var(--accent-tint-border) !important;
          box-shadow: 0 0 0 3px var(--accent-tint-bg) !important;
          background: var(--surface) !important;
        }
        .vpe-dropzone:hover {
          border-color: var(--accent-tint-border) !important;
          background: var(--accent-tint-bg) !important;
          color: var(--accent) !important;
        }
        .vpe-mgmt-btn:hover {
          border-color: var(--accent-tint-border) !important;
          background: var(--accent-tint-bg) !important;
          color: var(--text-primary) !important;
        }
        .vpe-sample-row:hover {
          background: var(--surface) !important;
          border-color: var(--accent-tint-border) !important;
        }
      `}</style>

      {/* ── Top bar ────────────────────────────────────────────────── */}
      <div
        style={{
          height: 48,
          flexShrink: 0,
          borderBottom: `1px solid var(--hairline)`,
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: '0 var(--space-3)',
        }}
      >
        {/* Back button */}
        <button
          type="button"
          onClick={onBack}
          aria-label="Back to Voices"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 'var(--space-1)',
            background: 'none',
            border: 'none',
            cursor: 'pointer',
            color: 'var(--accent)',
            fontSize: 'var(--type-caption)',
            fontWeight: 600,
            fontFamily: 'inherit',
            padding: '4px var(--space-2)',
            borderRadius: 'var(--radius-button)',
          }}
        >
          <ChevronLeft size={15} />
          Voices
        </button>

        {/* Title */}
        <span
          style={{
            fontSize: 'var(--type-caption)',
            fontWeight: 600,
            color: 'var(--text-primary)',
          }}
        >
          Voice Profiles
        </span>

        <div style={{ flex: 1 }} />

        <Btn>
          <Row gap={4} style={{ alignItems: 'center' }}>
            <Plus size={13} />
            New voice
          </Row>
        </Btn>
      </div>

      {/* ── Split ──────────────────────────────────────────────────── */}
      <div
        className="vpe-split"
        style={{
          display: 'grid',
          gridTemplateColumns: 'minmax(220px, 280px) 1fr',
          flex: 1,
          minHeight: 0,
        }}
      >
        {/* ── Sidebar ──────────────────────────────────────────────── */}
        <div
          className="vpe-list"
          style={{
            overflowY: 'auto',
            borderRight: `1px solid var(--hairline)`,
            background: 'var(--surface-alt)',
            minHeight: 0,
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Sticky sub-header */}
          <div
            className="vpe-sublabel"
            style={{
              position: 'sticky',
              top: 0,
              zIndex: 1,
              background: 'var(--surface-alt)',
              borderBottom: `1px solid var(--hairline)`,
              padding: 'var(--space-2) var(--space-3) var(--space-2)',
            }}
          >
            <div
              style={{
                fontSize: 'var(--type-micro)',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: 'var(--tracking-wide)',
                color: 'var(--text-muted)',
                marginBottom: 'var(--space-2)',
              }}
            >
              Voices
            </div>
            {/* Visual search — not functional */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 'var(--space-2)',
                background: 'var(--surface)',
                border: '1px solid var(--hairline)',
                borderRadius: 'var(--radius-button)',
                padding: '6px var(--space-2)',
              }}
            >
              <Search size={12} color="var(--text-muted)" />
              <span
                style={{
                  fontSize: 'var(--type-caption)',
                  color: 'var(--text-muted)',
                  fontStyle: 'italic',
                }}
              >
                Search voices…
              </span>
            </div>
          </div>

          {/* Voice list */}
          {voices.map(v => {
            const isSel = v.name === selectedName;
            const statusLabel = v.cta === 'Edit voice' ? 'Ready' : v.cta;
            const secondaryLine = [v.category || 'Voice', statusLabel].filter(Boolean).join(' · ');
            return (
              <button
                key={v.name}
                type="button"
                className="vpe-row"
                aria-current={isSel ? 'true' : undefined}
                onClick={() => setSelectedName(v.name)}
                style={{
                  display: 'flex',
                  gap: 'var(--space-2)',
                  alignItems: 'center',
                  padding: 'var(--space-2) var(--space-3)',
                  minHeight: 44,
                  border: 'none',
                  textAlign: 'left',
                  cursor: 'pointer',
                  width: '100%',
                  background: isSel ? 'var(--accent-tint-bg)' : 'transparent',
                  boxShadow: isSel ? 'inset 3px 0 0 var(--accent)' : 'none',
                  fontFamily: 'inherit',
                }}
              >
                <Avatar name={v.name} size={34} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 'var(--type-caption)',
                      fontWeight: 600,
                      color: isSel ? 'var(--accent)' : 'var(--text-primary)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {v.name}
                  </div>
                  <div
                    style={{
                      fontSize: 'var(--type-micro)',
                      color: 'var(--text-muted)',
                      marginTop: 'var(--space-1)',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    {secondaryLine}
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Detail panel ─────────────────────────────────────────── */}
        <div
          className="vpe-detail"
          style={{ overflowY: 'auto', minHeight: 0 }}
        >
          {!selected ? (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                height: '100%',
                color: 'var(--text-muted)',
                fontSize: 'var(--type-caption)',
                fontStyle: 'italic',
              }}
            >
              Select a voice
            </div>
          ) : (
            <>
              {/* Sticky glass header */}
              <div
                className="ns-glass"
                style={{
                  position: 'sticky',
                  top: 0,
                  zIndex: 2,
                  background: 'var(--glass)',
                  borderBottom: `1px solid var(--hairline)`,
                  padding: 'var(--space-4) var(--space-5)',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 'var(--space-4)',
                }}
              >
                <Avatar name={selected.name} size={56} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 'var(--type-title)',
                      fontWeight: 700,
                      color: 'var(--text-primary)',
                      lineHeight: 'var(--leading-tight)',
                      letterSpacing: 'var(--tracking-tight)',
                    }}
                  >
                    {selected.name}
                  </div>
                  <Row gap={4} style={{ flexWrap: 'wrap', marginTop: 'var(--space-1)' }}>
                    {selected.category && (
                      <VoiceAttrPill category="class">{selected.category}</VoiceAttrPill>
                    )}
                    {selected.gender && (
                      <VoiceAttrPill category="gender">{selected.gender}</VoiceAttrPill>
                    )}
                    {selected.age && (
                      <VoiceAttrPill category="age">{selected.age}</VoiceAttrPill>
                    )}
                  </Row>
                </div>

                {/* Right cluster */}
                <Row gap={6} style={{ alignItems: 'center', flexShrink: 0, flexWrap: 'wrap' }}>
                  <SemanticChip variant="success">
                    <Row gap={4} style={{ alignItems: 'center' }}>
                      <Check size={11} />
                      Saved
                    </Row>
                  </SemanticChip>
                  <Btn primary>
                    <Row gap={5} style={{ alignItems: 'center' }}>
                      <Play size={12} />
                      Preview
                    </Row>
                  </Btn>
                  <Btn>Set as default</Btn>
                  <button
                    type="button"
                    aria-label="More actions"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 32,
                      height: 32,
                      borderRadius: 'var(--radius-button)',
                      border: `1px solid var(--hairline)`,
                      background: 'var(--surface-alt)',
                      cursor: 'pointer',
                      color: 'var(--text-secondary)',
                    }}
                  >
                    <MoreHorizontal size={15} />
                  </button>
                </Row>
              </div>

              {/* Form body */}
              <div
                style={{
                  padding: 'var(--space-5)',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 'var(--space-5)',
                  maxWidth: 760,
                }}
              >
                {/* ── IDENTITY ────────────────────────────────────── */}
                <section>
                  <SectionLabel>Identity</SectionLabel>
                  <Panel
                    style={{
                      padding: 'var(--space-4)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--space-4)',
                    }}
                  >
                    <Col gap={6}>
                      <FieldLabel>Name</FieldLabel>
                      <input
                        type="text"
                        className="vpe-input"
                        value={selected.name}
                        onChange={e => patch('name', e.target.value)}
                        style={inputStyle}
                      />
                    </Col>
                    <Col gap={6}>
                      <FieldLabel>Description</FieldLabel>
                      <textarea
                        rows={3}
                        className="vpe-input"
                        value={selected.description}
                        onChange={e => patch('description', e.target.value)}
                        style={{ ...inputStyle, resize: 'vertical' }}
                      />
                    </Col>
                  </Panel>
                </section>

                {/* ── APPEARANCE ──────────────────────────────────── */}
                <section>
                  <SectionLabel>Appearance</SectionLabel>
                  <Panel style={{ padding: 'var(--space-4)', display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
                    {/* Image upload — the primary way to set a voice icon */}
                    <Row gap={12} style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                      <Avatar name={selected.name} size={48} />
                      <Col gap={6} style={{ flex: 1 }}>
                        <Row gap={8} style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                          <button
                            type="button"
                            aria-label="Upload voice image"
                            className="vpe-dropzone"
                            style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: 'var(--space-2)',
                              padding: '8px var(--space-3)',
                              borderRadius: 'var(--radius-button)',
                              border: '1px dashed var(--hairline)',
                              background: 'var(--surface-alt)',
                              color: 'var(--text-secondary)',
                              fontFamily: 'inherit',
                              fontSize: 'var(--type-caption)',
                              fontWeight: 600,
                              cursor: 'pointer',
                              transition: 'background var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard)',
                            }}
                          >
                            <ImagePlus size={14} />
                            Upload image
                          </button>
                          <Btn primary>
                            <Row gap={5} style={{ alignItems: 'center' }}>
                              <Sparkles size={13} />
                              Generate prompt
                            </Row>
                          </Btn>
                        </Row>
                        <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>
                          JPG or PNG · square works best. Falls back to a color tile below.
                        </span>
                      </Col>
                    </Row>

                    {/* Color-tile fallback when there is no uploaded image */}
                    <div
                      style={{
                        paddingTop: 'var(--space-3)',
                        borderTop: `1px solid var(--hairline)`,
                      }}
                    >
                      <Row gap={8} style={{ alignItems: 'center', flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontWeight: 600 }}>
                          Or pick a color
                        </span>
                        {AVATAR_COLORS.map(color => {
                          const isActive = selected.avatarColor === color;
                          return (
                            <button
                              key={color}
                              type="button"
                              aria-label={`Set avatar color ${color}`}
                              onClick={() => patch('avatarColor', color)}
                              style={{
                                width: 24,
                                height: 24,
                                borderRadius: '50%',
                                background: color,
                                border: 'none',
                                cursor: 'pointer',
                                padding: 0,
                                flexShrink: 0,
                                boxShadow: isActive
                                  ? '0 0 0 2px var(--surface), 0 0 0 4px var(--accent)'
                                  : 'var(--shadow-sm)',
                                transform: isActive ? 'scale(1.15)' : 'scale(1)',
                                transition: 'transform var(--dur-fast) var(--ease-spring), box-shadow var(--dur-fast) var(--ease-standard)',
                              }}
                            />
                          );
                        })}
                        {selected.avatarColor && (
                          <button
                            type="button"
                            aria-label="Clear avatar color"
                            onClick={() => patch('avatarColor', '')}
                            style={{
                              fontSize: 'var(--type-micro)',
                              color: 'var(--text-muted)',
                              background: 'none',
                              border: `1px solid var(--hairline)`,
                              borderRadius: 'var(--radius-button)',
                              padding: '3px var(--space-2)',
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                            }}
                          >
                            Clear
                          </button>
                        )}
                      </Row>
                    </div>
                  </Panel>
                </section>

                {/* ── CLASSIFICATION ──────────────────────────────── */}
                <section>
                  <SectionLabel>Classification</SectionLabel>
                  <Panel
                    style={{
                      padding: 'var(--space-4)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--space-4)',
                    }}
                  >
                    <Row gap={10} style={{ alignItems: 'center' }}>
                      <div
                        style={{
                          width: 72,
                          fontSize: 'var(--type-caption)',
                          color: 'var(--text-secondary)',
                          fontWeight: 600,
                          flexShrink: 0,
                        }}
                      >
                        Category
                      </div>
                      <Segmented
                        ariaLabel="Category"
                        options={CATEGORY_OPTIONS}
                        value={selected.category || undefined}
                        onChange={v =>
                          patch(
                            'category',
                            v as 'Narrator' | 'Dialogue' | 'Character'
                          )
                        }
                      />
                    </Row>
                    <div style={{ height: 1, background: 'var(--hairline)' }} />
                    <Row gap={10} style={{ alignItems: 'center' }}>
                      <div
                        style={{
                          width: 72,
                          fontSize: 'var(--type-caption)',
                          color: 'var(--text-secondary)',
                          fontWeight: 600,
                          flexShrink: 0,
                        }}
                      >
                        Gender
                      </div>
                      <Segmented
                        ariaLabel="Gender"
                        options={GENDER_OPTIONS}
                        value={selected.gender || undefined}
                        onChange={v =>
                          patch('gender', v as 'Female' | 'Male' | 'NB')
                        }
                      />
                    </Row>
                    <div style={{ height: 1, background: 'var(--hairline)' }} />
                    <Row gap={10} style={{ alignItems: 'center' }}>
                      <div
                        style={{
                          width: 72,
                          fontSize: 'var(--type-caption)',
                          color: 'var(--text-secondary)',
                          fontWeight: 600,
                          flexShrink: 0,
                        }}
                      >
                        Age
                      </div>
                      <Segmented
                        ariaLabel="Age"
                        options={AGE_OPTIONS}
                        value={selected.age || undefined}
                        onChange={v =>
                          patch('age', v as 'Child' | 'Adult' | 'Senior')
                        }
                      />
                    </Row>
                  </Panel>
                </section>

                {/* ── LANGUAGES & ACCENT ──────────────────────────── */}
                <section>
                  <SectionLabel>Languages &amp; Accent</SectionLabel>
                  <Panel
                    style={{
                      padding: 'var(--space-4)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--space-4)',
                    }}
                  >
                    <Col gap={8}>
                      <FieldLabel>Languages</FieldLabel>
                      <Row gap={6} style={{ flexWrap: 'wrap' }}>
                        {LANGUAGE_OPTIONS.map(lang => {
                          const on = (selected.languages ?? []).includes(lang);
                          return (
                            <ToggleChip
                              key={lang}
                              label={lang}
                              on={on}
                              onClick={() => {
                                const current = selected.languages ?? [];
                                const next = on
                                  ? current.filter(l => l !== lang)
                                  : [...current, lang];
                                patch('languages', next);
                              }}
                            />
                          );
                        })}
                      </Row>
                    </Col>
                    <div style={{ height: 1, background: 'var(--hairline)' }} />
                    <Col gap={8}>
                      <FieldLabel>Accent</FieldLabel>
                      <Row gap={6} style={{ flexWrap: 'wrap' }}>
                        {ACCENT_OPTIONS.map(acc => {
                          const on = selected.accent === acc;
                          return (
                            <ToggleChip
                              key={acc}
                              label={acc}
                              on={on}
                              onClick={() =>
                                patch('accent', on ? '' : acc)
                              }
                            />
                          );
                        })}
                      </Row>
                    </Col>
                  </Panel>
                </section>

                {/* ── SPEAKING STYLES ─────────────────────────────── */}
                <section>
                  <SectionLabel>Speaking Styles</SectionLabel>
                  <Panel style={{ padding: 'var(--space-4)' }}>
                    <Row gap={6} style={{ flexWrap: 'wrap' }}>
                      {STYLE_OPTIONS.map(st => {
                        const on = (selected.styles ?? []).includes(st);
                        return (
                          <ToggleChip
                            key={st}
                            label={st}
                            on={on}
                            onClick={() => {
                              const current = selected.styles ?? [];
                              const next = on
                                ? current.filter(s => s !== st)
                                : [...current, st];
                              patch('styles', next);
                            }}
                          />
                        );
                      })}
                    </Row>
                  </Panel>
                </section>

                {/* ── SAMPLES ─────────────────────────────────────── */}
                <section>
                  <SectionLabel>Samples</SectionLabel>
                  <Panel
                    style={{
                      padding: 'var(--space-4)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--space-2)',
                    }}
                  >
                    {MOCK_SAMPLES.map(s => (
                      <Row
                        key={s.label}
                        gap={10}
                        className="vpe-sample-row"
                        style={{
                          alignItems: 'center',
                          padding: 'var(--space-2) var(--space-3)',
                          borderRadius: 'var(--radius-button)',
                          background: 'var(--surface-alt)',
                          border: `1px solid var(--hairline)`,
                          transition: 'background var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard)',
                        }}
                      >
                        <button
                          type="button"
                          aria-label={`Play ${s.label}`}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            width: 28,
                            height: 28,
                            borderRadius: '50%',
                            border: `1px solid var(--hairline)`,
                            background: 'var(--surface)',
                            cursor: 'pointer',
                            color: 'var(--accent)',
                            flexShrink: 0,
                          }}
                        >
                          <Play size={11} />
                        </button>
                        <span
                          style={{
                            flex: 1,
                            fontSize: 'var(--type-caption)',
                            color: 'var(--text-primary)',
                          }}
                        >
                          {s.label}
                        </span>
                        <span
                          style={{
                            fontSize: 'var(--type-micro)',
                            color: 'var(--text-muted)',
                            fontFamily: 'monospace',
                          }}
                        >
                          {s.dur}
                        </span>
                      </Row>
                    ))}
                    <button
                      type="button"
                      style={{
                        alignSelf: 'flex-start',
                        background: 'none',
                        border: 'none',
                        padding: 'var(--space-1) 0',
                        marginTop: 'var(--space-1)',
                        cursor: 'pointer',
                        fontSize: 'var(--type-caption)',
                        fontWeight: 600,
                        color: 'var(--accent)',
                        fontFamily: 'inherit',
                        textDecoration: 'underline',
                      }}
                    >
                      Manage in Voice Lab ›
                    </button>
                  </Panel>
                </section>

                {/* ── MANAGEMENT ──────────────────────────────────── */}
                <section>
                  <SectionLabel>Management</SectionLabel>
                  <Panel style={{ padding: 'var(--space-4)' }}>
                    <Row gap={8} style={{ flexWrap: 'wrap' }}>
                      <button
                        type="button"
                        className="vpe-mgmt-btn"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 'var(--space-2)',
                          background: 'var(--surface-alt)',
                          border: `1px solid var(--hairline)`,
                          borderRadius: 'var(--radius-button)',
                          padding: '7px var(--space-3)',
                          cursor: 'pointer',
                          fontSize: 'var(--type-caption)',
                          color: 'var(--text-secondary)',
                          fontFamily: 'inherit',
                          fontWeight: 600,
                          transition: 'background var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard)',
                        }}
                      >
                        <Download size={13} />
                        Export bundle
                      </button>
                      <button
                        type="button"
                        className="vpe-mgmt-btn"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 'var(--space-2)',
                          background: 'var(--surface-alt)',
                          border: `1px solid var(--hairline)`,
                          borderRadius: 'var(--radius-button)',
                          padding: '7px var(--space-3)',
                          cursor: 'pointer',
                          fontSize: 'var(--type-caption)',
                          color: 'var(--text-secondary)',
                          fontFamily: 'inherit',
                          fontWeight: 600,
                          transition: 'background var(--dur-fast) var(--ease-standard), border-color var(--dur-fast) var(--ease-standard), color var(--dur-fast) var(--ease-standard)',
                        }}
                      >
                        <RotateCcw size={13} />
                        Reset calibration
                      </button>
                      <button
                        type="button"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          gap: 'var(--space-2)',
                          background: 'var(--error-tint-bg)',
                          border: `1px solid var(--error-tint-border)`,
                          borderRadius: 'var(--radius-button)',
                          padding: '7px var(--space-3)',
                          cursor: 'pointer',
                          fontSize: 'var(--type-caption)',
                          color: 'var(--error-text)',
                          fontFamily: 'inherit',
                          fontWeight: 600,
                        }}
                      >
                        <Trash2 size={13} />
                        Delete voice
                      </button>
                    </Row>
                  </Panel>
                </section>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
