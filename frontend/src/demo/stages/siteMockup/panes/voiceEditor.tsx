/**
 * siteMockup/panes/voiceEditor.tsx — Apple-style master-detail Voice Profile Editor
 * Design-vision mockup only; all actions are presentational.
 */
import React, { useState } from 'react';
import {
  ChevronLeft,
  ChevronRight,
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
  Star,
} from 'lucide-react';
import {
  Row,
  Col,
  VoiceAttrPill,
  SemanticChip,
  Panel,
  Btn,
} from '../shared';
import type { Voice, VoiceVariation } from './voices';
import { VoicePortrait } from './voicePortrait';

// ---------------------------------------------------------------------------
// Inline helper components

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

const selectStyle: React.CSSProperties = {
  ...inputStyle,
  cursor: 'pointer',
};

const PRIMARY_ROLE_OPTIONS = [
  'Audiobook Narrator',
  'Dark Fiction Narrator',
  'Fiction Narrator',
  'Nonfiction Narrator',
  'Documentary Narrator',
  'Children’s Narrator',
  'Romance Narrator',
  'Thriller / Suspense Narrator',
  'LitRPG / Game Fiction Narrator',
  'Stage / Play Voice',
  'Radio Drama Voice',
  'Animation Character',
  'Game Character',
  'Fantasy Character',
  'Dubbing / ADR',
  'Commercial / Promo',
  'Trailer / Announcer',
  'Podcast / Host',
  'Educational / E-learning',
  'Assistant / System Voice',
  'Creature / Nonhuman',
  'Vocal Effects',
];

const ENTITY_TYPE_OPTIONS = [
  'Human',
  'Creature',
  'Monster',
  'Mythological',
  'Spirit / Ghost',
  'Fairy / Small Magical',
  'Giant / Ogre-like',
  'Deity / Celestial',
  'Demon / Infernal',
  'Alien',
  'Robot / Android',
  'AI / Synthetic',
  'Animal-like',
  'Abstract / SFX',
  'Unknown',
];

const GENDER_OPTIONS = ['Female', 'Male', 'Non-binary', 'Nonhuman / Not applicable', 'Unknown'];
const AGE_OPTIONS = ['Infant', 'Child', 'Teen', 'Young Adult', 'Adult', 'Middle-aged', 'Senior', 'Ancient / Ageless', 'Unknown'];

const LANGUAGE_OPTIONS = [
  'English',
  'Spanish',
  'French',
  'German',
  'Italian',
  'Portuguese',
  'Mandarin Chinese',
  'Cantonese',
  'Japanese',
  'Korean',
  'Hindi',
  'Arabic',
  'Russian',
  'Dutch',
  'Swedish',
  'Norwegian',
  'Danish',
  'Finnish',
  'Polish',
  'Turkish',
  'Greek',
  'Hebrew',
  'Vietnamese',
  'Thai',
  'Indonesian',
  'Filipino / Tagalog',
  'Ukrainian',
];

const DIALECT_ORIGIN_OPTIONS = [
  'American Neutral',
  'American Southern',
  'New York',
  'Boston',
  'Midwest',
  'California',
  'Canadian',
  'RP British',
  'Cockney',
  'Scottish',
  'Irish',
  'Welsh',
  'Australian',
  'New Zealand',
  'South African',
  'Caribbean',
  'Indian English',
  'Nigerian English',
  'Singapore English',
  'Mexican Spanish',
  'Castilian Spanish',
  'Argentinian Spanish',
  'Brazilian Portuguese',
  'Quebec French',
  'Parisian French',
  'Mandarin Northern',
  'Cantonese Hong Kong',
  'Fantasy courtly',
  'Medieval Village',
  'Dark Fiction',
  'Infernal',
  'Celestial',
  'Alien',
  'Robotic',
  'Synthetic Assistant',
  'Cybernetic',
  'Animalistic',
  'Invented',
  'Neutral',
  'Mixed',
];

const BASE_STYLE_OPTIONS = [
  'Warm',
  'Clear',
  'Bright',
  'Deep',
  'Gruff',
  'Smooth',
  'Raspy',
  'Gravelly',
  'Breathy',
  'Nasal',
  'Airy',
  'Rich',
  'Thin',
  'Resonant',
  'Soft',
  'Sharp',
  'Ethereal',
  'Robotic',
  'Glitchy',
  'Monstrous',
];

const EMOTION_OPTIONS = [
  'Neutral',
  'Happy',
  'Sad',
  'Angry',
  'Excited',
  'Afraid',
  'Anxious',
  'Calm',
  'Tender',
  'Warm',
  'Cold',
  'Confident',
  'Uncertain',
  'Sarcastic',
  'Playful',
  'Mysterious',
  'Ominous',
  'Grieving',
  'Joyful',
  'Tense',
  'Panicked',
  'Determined',
  'Villainous',
  'Heroic',
];

const PERFORMANCE_STYLE_OPTIONS = [
  'Conversational',
  'Dramatic',
  'Theatrical',
  'Intimate',
  'Whispered',
  'Shouting',
  'Deadpan',
  'Comedic',
  'Formal',
  'Storytelling',
  'Announcer',
  'Documentary',
  'Cinematic',
  'Character Acting',
  'Creature Acting',
  'Effort Sounds',
  'Energetic',
];

const INTENSITY_OPTIONS: VoiceVariation['intensity'][] = ['Subtle', 'Moderate', 'Strong', 'Extreme'];
const PACING_OPTIONS: VoiceVariation['pacing'][] = ['Slow', 'Natural', 'Fast', 'Variable'];
const ENERGY_OPTIONS: VoiceVariation['energy'][] = ['Low', 'Medium', 'High'];

const SelectField: React.FC<{
  label: string;
  value?: string;
  options: readonly string[];
  onChange: (value: string) => void;
}> = ({ label, value = '', options, onChange }) => (
  <Col gap={6}>
    <FieldLabel>{label}</FieldLabel>
    <select
      aria-label={label}
      className="vpe-input"
      value={value}
      onChange={e => onChange(e.target.value)}
      style={selectStyle}
    >
      <option value="">Select…</option>
      {options.map(option => (
        <option key={option} value={option}>{option}</option>
      ))}
    </select>
  </Col>
);

const TokenPicker: React.FC<{
  label: string;
  addLabel: string;
  removeLabel: string;
  values: string[];
  options: readonly string[];
  onChange: (next: string[]) => void;
}> = ({ label, addLabel, removeLabel, values, options, onChange }) => {
  const available = options.filter(option => !values.includes(option));

  return (
    <Col gap={8}>
      <FieldLabel>{label}</FieldLabel>
      <Row gap={6} style={{ flexWrap: 'wrap' }}>
        {values.map(value => (
          <button
            key={value}
            type="button"
            aria-label={`Remove ${removeLabel} ${value}`}
            onClick={() => onChange(values.filter(item => item !== value))}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 10px',
              minHeight: 30,
              borderRadius: 'var(--radius-round)',
              border: '1px solid var(--accent-tint-border)',
              background: 'var(--accent-tint-bg)',
              color: 'var(--action-primary)',
              fontFamily: 'inherit',
              fontSize: 'var(--type-caption)',
              fontWeight: 650,
              cursor: 'pointer',
            }}
          >
            {value}
            <span aria-hidden="true" style={{ fontWeight: 800 }}>×</span>
          </button>
        ))}
      </Row>
      <select
        aria-label={addLabel}
        className="vpe-input"
        value=""
        onChange={e => {
          if (!e.target.value) return;
          onChange([...values, e.target.value]);
        }}
        style={selectStyle}
      >
        <option value="">{available.length ? addLabel : 'All options selected'}</option>
        {available.map(option => (
          <option key={option} value={option}>{option}</option>
        ))}
      </select>
    </Col>
  );
};

// ---------------------------------------------------------------------------
// Avatar color swatch palette (literal hex permitted per spec)

const AVATAR_COLORS = ['#3b82f6', '#8b5cf6', '#ec4899', '#f59e0b', '#10b981', '#64748b'];

const getPillLabel = (voice: Voice, category: 'class' | 'gender' | 'age' | 'extended') =>
  voice.pills.find(pill => pill.category === category)?.label;

const getVoiceProfileImagePrompt = (voice: Voice) => {
  const voiceClass = voice.category || getPillLabel(voice, 'class') || 'Narrator';
  const gender = voice.gender || getPillLabel(voice, 'gender') || 'NB';
  const age = voice.age || getPillLabel(voice, 'age') || 'Adult';
  const style = voice.styles?.[0] || getPillLabel(voice, 'extended') || 'Clear';
  const background = voice.avatarColor || '#F0B27A';
  const traitSummary = `${style.toLowerCase()} ${age.toLowerCase()} ${gender.toLowerCase()} ${voiceClass.toLowerCase()}`;

  return [
    'Use case: stylized-concept',
    'Asset type: reusable voice avatar portrait for audiobook studio UI, exported voice bundles, and Hugging Face voice profile',
    `Primary request: create a simple polished raster portrait image for a ${traitSummary} voice named ${voice.name}.`,
    'Style/medium: high-quality softly rendered digital portrait, Apple-quality clean UI asset, simple and premium, not photorealistic, not cartoonish.',
    'Composition/framing: square 1024x1024 image, centered bust portrait from shoulders up, head and shoulders fully inside frame, generous padding so it can be cropped into a circular avatar without cutting off the head or shoulders.',
    `Scene/backdrop: one perfectly solid flat background color, background ${background}, no gradient, no texture, no shadows on the background.`,
    `Subject: ${voice.description} Keep the portrait readable at small sizes and suitable for a voice category avatar.`,
    'Lighting/mood: soft studio light, refined, approachable, and reusable.',
    'Constraints: solid background must fill the entire square; no text, no watermark, no logo, no microphone, no headphones, no props, no scenery; keep the portrait simple and reusable across voice cards and Hugging Face listings.',
  ].join('\n');
};

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

  const patchFields = (values: Partial<Voice>) => {
    if (!selected) return;
    const originalName = selected.name;
    const updated: Voice = { ...selected, ...values };
    if (values.name) {
      setSelectedName(values.name);
    }
    onChangeVoice(updated, originalName);
  };

  const MOCK_SAMPLES = [
    { label: 'Sample 1', dur: '0:08' },
    { label: 'Sample 2', dur: '0:11' },
    { label: 'Sample 3', dur: '0:07' },
  ];
  const [showImagePrompt, setShowImagePrompt] = useState(false);
  const [promptCopied, setPromptCopied] = useState(false);
  const [selectedVariationId, setSelectedVariationId] = useState('');
  const imagePrompt = selected ? getVoiceProfileImagePrompt(selected) : '';
  const variations = selected?.variations ?? [];
  const activeVariation = variations.find(variation => variation.id === selectedVariationId)
    ?? variations.find(variation => variation.isDefault)
    ?? variations[0]
    ?? null;

  const handleCopyPrompt = () => {
    void navigator.clipboard?.writeText(imagePrompt);
    setPromptCopied(true);
  };

  const patchVariation = (
    variationId: string,
    updater: (variation: VoiceVariation) => VoiceVariation,
  ) => {
    if (!selected) return;
    patch(
      'variations',
      (selected.variations ?? []).map(variation =>
        variation.id === variationId ? updater(variation) : variation
      ),
    );
  };

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
          .vpe-variation-panel { grid-template-columns: 1fr !important; }
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
          color: var(--action-primary) !important;
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
            color: 'var(--action-primary)',
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
                  boxShadow: isSel ? 'inset 3px 0 0 var(--action-primary)' : 'none',
                  fontFamily: 'inherit',
                }}
              >
                <VoicePortrait voice={v} size={34} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 'var(--type-caption)',
                      fontWeight: 600,
                      color: isSel ? 'var(--action-primary)' : 'var(--text-primary)',
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
                <VoicePortrait voice={selected} size={56} emphasized />
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
                    {selected.primaryRole && (
                      <VoiceAttrPill category="class">{selected.primaryRole}</VoiceAttrPill>
                    )}
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
                      <VoicePortrait voice={selected} size={48} />
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
                          <Btn
                            primary
                            aria-expanded={showImagePrompt}
                            onClick={() => {
                              setShowImagePrompt(prev => !prev);
                              setPromptCopied(false);
                            }}
                          >
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

                    {showImagePrompt && (
                      <Col
                        gap={8}
                        style={{
                          padding: 'var(--space-3)',
                          borderRadius: 'var(--radius-card)',
                          border: '1px solid var(--hairline)',
                          background: 'var(--surface-alt)',
                        }}
                      >
                        <Row gap={8} style={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                          <Col gap={2}>
                            <span style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-primary)' }}>
                              Voice profile image prompt
                            </span>
                            <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>
                              1024 x 1024 · solid background · safe circular crop · Hugging Face ready
                            </span>
                          </Col>
                          <Btn small onClick={handleCopyPrompt}>
                            {promptCopied ? 'Copied' : 'Copy prompt'}
                          </Btn>
                        </Row>
                        <textarea
                          readOnly
                          aria-label="Generated voice profile image prompt"
                          value={imagePrompt}
                          rows={8}
                          className="vpe-input"
                          style={{
                            ...inputStyle,
                            resize: 'vertical',
                            fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
                            fontSize: 'var(--type-micro)',
                            lineHeight: 1.55,
                          }}
                        />
                      </Col>
                    )}

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
                                  ? '0 0 0 2px var(--surface), 0 0 0 4px var(--action-primary)'
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
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 'var(--space-3)' }}>
                      <SelectField
                        label="Primary role"
                        value={selected.primaryRole || ''}
                        options={PRIMARY_ROLE_OPTIONS}
                        onChange={value => patch('primaryRole', value)}
                      />
                      <SelectField
                        label="Entity type"
                        value={selected.entityType || ''}
                        options={ENTITY_TYPE_OPTIONS}
                        onChange={value => patch('entityType', value)}
                      />
                      <SelectField
                        label="Gender"
                        value={selected.gender || ''}
                        options={GENDER_OPTIONS}
                        onChange={value => patch('gender', value)}
                      />
                      <SelectField
                        label="Age"
                        value={selected.age || ''}
                        options={AGE_OPTIONS}
                        onChange={value => patch('age', value)}
                      />
                    </div>
                  </Panel>
                </section>

                {/* ── LANGUAGE, ORIGIN & STYLE ─────────────────────── */}
                <section>
                  <SectionLabel>Language, Origin &amp; Base Style</SectionLabel>
                  <Panel
                    style={{
                      padding: 'var(--space-4)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 'var(--space-4)',
                    }}
                  >
                    <TokenPicker
                      label="Languages"
                      addLabel="Add language"
                      removeLabel="language"
                      values={selected.languages ?? []}
                      options={LANGUAGE_OPTIONS}
                      onChange={next => patch('languages', next)}
                    />
                    <div style={{ height: 1, background: 'var(--hairline)' }} />
                    <TokenPicker
                      label="Dialect / Vocal Origin"
                      addLabel="Add dialect or vocal origin"
                      removeLabel="dialect or vocal origin"
                      values={selected.dialectOrigins ?? (selected.accent ? [selected.accent] : [])}
                      options={DIALECT_ORIGIN_OPTIONS}
                      onChange={next => patchFields({ dialectOrigins: next, accent: next[0] ?? '' })}
                    />
                    <div style={{ height: 1, background: 'var(--hairline)' }} />
                    <TokenPicker
                      label="Base Voice Qualities"
                      addLabel="Add base voice quality"
                      removeLabel="base voice quality"
                      values={selected.styles ?? []}
                      options={BASE_STYLE_OPTIONS}
                      onChange={next => patch('styles', next)}
                    />
                  </Panel>
                </section>

                {/* ── VARIATIONS ──────────────────────────────────── */}
                <section>
                  <h2
                    style={{
                      fontSize: 'var(--type-headline)',
                      color: 'var(--text-primary)',
                      margin: '0 0 var(--space-2)',
                    }}
                  >
                    Voice variations
                  </h2>
                  <Panel
                    className="vpe-variation-panel"
                    style={{
                      padding: 'var(--space-4)',
                      display: 'grid',
                      gridTemplateColumns: 'minmax(170px, 220px) 1fr',
                      gap: 'var(--space-4)',
                    }}
                  >
                    <Col gap={6}>
                      {variations.map(variation => {
                        const isActive = activeVariation?.id === variation.id;
                        return (
                          <button
                            key={variation.id}
                            type="button"
                            aria-label={`${variation.name}${variation.isDefault ? ' default variation' : ' variation'}`}
                            onClick={() => setSelectedVariationId(variation.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              gap: 8,
                              width: '100%',
                              minHeight: 36,
                              borderRadius: 'var(--radius-button)',
                              border: `1px solid ${isActive ? 'var(--accent-tint-border)' : 'var(--hairline)'}`,
                              background: isActive ? 'var(--accent-tint-bg)' : 'var(--surface-alt)',
                              color: isActive ? 'var(--action-primary)' : 'var(--text-primary)',
                              fontFamily: 'inherit',
                              fontSize: 'var(--type-caption)',
                              fontWeight: isActive ? 700 : 600,
                              textAlign: 'left',
                              cursor: 'pointer',
                              padding: 'var(--space-2) var(--space-3)',
                            }}
                          >
                            {variation.isDefault && <Star size={12} fill="currentColor" aria-hidden="true" />}
                            <span style={{ flex: 1 }}>{variation.name}</span>
                          </button>
                        );
                      })}
                      <Btn small>
                        <Row gap={5} style={{ alignItems: 'center' }}>
                          <Plus size={12} />
                          Add variation
                        </Row>
                      </Btn>
                    </Col>

                    {activeVariation ? (
                      <Col gap={12}>
                        <Row gap={8} style={{ alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
                          <Col gap={2}>
                            <span style={{ fontSize: 'var(--type-caption)', fontWeight: 800, color: 'var(--text-primary)' }}>
                              {activeVariation.name}
                            </span>
                            <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>
                              Variation tags override delivery while keeping the same base voice identity.
                            </span>
                          </Col>
                          {activeVariation.isDefault && (
                            <SemanticChip variant="warning">
                              <Row gap={4} style={{ alignItems: 'center' }}>
                                <Star size={10} fill="currentColor" />
                                default
                              </Row>
                            </SemanticChip>
                          )}
                        </Row>
                        <TokenPicker
                          label="Emotion tags"
                          addLabel="Add emotion"
                          removeLabel="emotion"
                          values={activeVariation.emotions}
                          options={EMOTION_OPTIONS}
                          onChange={next => patchVariation(activeVariation.id, variation => ({ ...variation, emotions: next }))}
                        />
                        <TokenPicker
                          label="Performance styles"
                          addLabel="Add performance style"
                          removeLabel="performance style"
                          values={activeVariation.performanceStyles}
                          options={PERFORMANCE_STYLE_OPTIONS}
                          onChange={next => patchVariation(activeVariation.id, variation => ({ ...variation, performanceStyles: next }))}
                        />
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: 'var(--space-3)' }}>
                          <SelectField
                            label="Variation intensity"
                            value={activeVariation.intensity}
                            options={INTENSITY_OPTIONS}
                            onChange={value => patchVariation(activeVariation.id, variation => ({ ...variation, intensity: value as VoiceVariation['intensity'] }))}
                          />
                          <SelectField
                            label="Variation pacing"
                            value={activeVariation.pacing}
                            options={PACING_OPTIONS}
                            onChange={value => patchVariation(activeVariation.id, variation => ({ ...variation, pacing: value as VoiceVariation['pacing'] }))}
                          />
                          <SelectField
                            label="Variation energy"
                            value={activeVariation.energy}
                            options={ENERGY_OPTIONS}
                            onChange={value => patchVariation(activeVariation.id, variation => ({ ...variation, energy: value as VoiceVariation['energy'] }))}
                          />
                        </div>
                        <Row gap={6} style={{ flexWrap: 'wrap' }}>
                          <Btn small>Upload take samples</Btn>
                          <Btn small>Test variation</Btn>
                          <Btn small>Set as default</Btn>
                        </Row>
                      </Col>
                    ) : (
                      <Col gap={8} style={{ justifyContent: 'center', color: 'var(--text-muted)', fontSize: 'var(--type-caption)' }}>
                        No variations defined for this voice.
                      </Col>
                    )}
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
                            color: 'var(--action-primary)',
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
                        color: 'var(--action-primary)',
                        fontFamily: 'inherit',
                        textDecoration: 'underline',
                      }}
                    >
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>Manage in Voice Lab<ChevronRight size={12} strokeWidth={2} aria-hidden="true" /></span>
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
