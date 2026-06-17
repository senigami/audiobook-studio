/**
 * CastPanel — chapter-aware three-tier cast & voices slide-out
 *
 * Tiers (computed from activeChapter N):
 *   1. In this chapter  — book chars whose `chapters` includes N (always open, starred)
 *   2. Chapter-scoped   — temp chars created for chapter N (collapsible, open by default)
 *   3. Everyone else    — book chars not in N (collapsible, collapsed by default)
 *
 * Operations:
 *   Surface  — click tier-3 row → adds N to chapters → moves to tier 1
 *   Promote  — click "Promote" on a tier-2 row → sets kind: 'book' → leaves tier 2
 *   Add temp — "+ temp voice" button adds a new auto-named Ch{N} · Character {i} temp
 *
 * Props:
 *   activeChapter   — current chapter number (default 4)
 *   armedSwatch     — currently selected character id (owned by StudioPane)
 *   onSwatchClick   — toggles armedSwatch (owned by StudioPane)
 */
import React, { useState } from 'react';
import { ChevronDown, ChevronUp, Star, Plus, ArrowUpCircle } from 'lucide-react';
import { Col, Avatar, SemanticChip, SPEAKER_TOKEN } from '../shared';

// ---------------------------------------------------------------------------
// Data model

export interface CastCharacter {
  id: string;
  /** Display alias */
  name: string;
  /** Voice library name */
  voiceName: string;
  /** Key into SPEAKER_TOKEN; falls back to Narrator tokens */
  colorKey: string;
  /** Chapter numbers this character appears in */
  chapters: number[];
  /** Book character = part of the book roster; temp = chapter-scoped one-off */
  kind: 'book' | 'temp';
  starred?: boolean;
}

// ---------------------------------------------------------------------------
// Voice variation data — keyed by voiceName.
// Each entry lists named variants beyond the implicit 'Default'.
// At least two voices carry a non-trivial list per task 010.

export const VOICE_VARIATIONS: Record<string, string[]> = {
  'Studio Voice': ['Urgent', 'Whisper', 'Warm'],
  'Marcus Reed': ['Tense', 'Jovial'],
  'Elena Marsh': ['Soft', 'Commanding'],
  'Old Tom': [],
  'Tavern Keeper': [],
  'Guard Voice': [],
  'Unassigned': [],
};

// ---------------------------------------------------------------------------
// Seed data — derived from CHARACTERS_NON_NARRATOR in book.tsx + Narrator,
// seeded so Maren, Dov, and Narrator are in chapter 4 ("A Vale at Dusk").
// The Warden appears in chapters 1–3 only (tier 3 for ch4).
// Sira appears in chapters 1–5 but not 4 (tier 3 for ch4).
// Two temp characters are pre-seeded for chapter 4.

export const INITIAL_CHARACTERS: CastCharacter[] = [
  {
    id: 'Narrator',
    name: 'Narrator (default)',
    voiceName: 'Elena Marsh',
    colorKey: 'Narrator',
    chapters: [1, 2, 3, 4, 5, 6, 7],
    kind: 'book',
    starred: true,
  },
  {
    id: 'Maren',
    name: 'Maren',
    voiceName: 'Studio Voice',
    colorKey: 'Maren',
    chapters: [1, 2, 3, 4, 5],
    kind: 'book',
    starred: true,
  },
  {
    id: 'Dov',
    name: 'Dov',
    voiceName: 'Marcus Reed',
    colorKey: 'Dov',
    chapters: [2, 3, 4, 5, 6],
    kind: 'book',
    starred: true,
  },
  {
    id: 'ElderRowan',
    name: 'Elder Rowan',
    voiceName: 'Old Tom',
    colorKey: 'ElderRowan',
    chapters: [1, 2, 3],
    kind: 'book',
  },
  {
    id: 'Sira',
    name: 'Sira',
    voiceName: 'Unassigned',
    colorKey: 'Narrator',
    chapters: [1, 2, 3, 5],
    kind: 'book',
  },
  // Pre-seeded temp characters for chapter 4
  {
    id: 'ch4-temp-1',
    name: 'Ch4 · Character 1',
    voiceName: 'Tavern Keeper',
    colorKey: 'Narrator',
    chapters: [4],
    kind: 'temp',
  },
  {
    id: 'ch4-temp-2',
    name: 'Ch4 · Character 2',
    voiceName: 'Guard Voice',
    colorKey: 'Narrator',
    chapters: [4],
    kind: 'temp',
  },
];

// ---------------------------------------------------------------------------
// Sub-components

interface TierHeaderProps {
  label: string;
  count: number;
  open: boolean;
  onToggle: () => void;
  starFilled?: boolean;
  /** If true this tier is always open (no toggle affordance) */
  alwaysOpen?: boolean;
}

const TierHeader: React.FC<TierHeaderProps> = ({ label, count, open, onToggle, starFilled, alwaysOpen }) => (
  <div
    onClick={alwaysOpen ? undefined : onToggle}
    style={{
      display: 'flex',
      alignItems: 'center',
      gap: 4,
      padding: 'var(--space-1) var(--space-3)',
      borderBottom: '1px solid var(--hairline)',
      borderTop: '1px solid var(--hairline)',
      background: 'var(--surface-alt)',
      cursor: alwaysOpen ? 'default' : 'pointer',
      userSelect: 'none',
      flexShrink: 0,
    }}
  >
    {starFilled && (
      <Star
        size={10}
        aria-hidden="true"
        fill="var(--warning)"
        stroke="var(--warning)"
        style={{ flexShrink: 0 }}
      />
    )}
    <span style={{
      fontSize: 'var(--type-micro)',
      fontWeight: 700,
      letterSpacing: 'var(--tracking-wide)',
      textTransform: 'uppercase',
      color: 'var(--text-muted)',
      flex: 1,
    }}>
      {label}
    </span>
    <span style={{
      fontSize: 'var(--type-micro)',
      color: 'var(--text-muted)',
      marginRight: alwaysOpen ? 0 : 2,
    }}>
      {count}
    </span>
    {!alwaysOpen && (
      open
        ? <ChevronUp size={10} aria-hidden="true" style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        : <ChevronDown size={10} aria-hidden="true" style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
    )}
  </div>
);

interface CharRowProps {
  char: CastCharacter;
  isArmed: boolean;
  onArm: () => void;
  /** "Surface" action — moves char into current chapter (tier 3 only) */
  onSurface?: () => void;
  /** "Promote" action — converts temp to book character (tier 2 only) */
  onPromote?: () => void;
}

const CharRow: React.FC<CharRowProps> = ({ char, isArmed, onArm, onSurface, onPromote }) => {
  const tok = SPEAKER_TOKEN[char.colorKey] ?? SPEAKER_TOKEN.Narrator;
  const [hovered, setHovered] = useState(false);

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        borderBottom: '1px solid var(--hairline)',
        background: isArmed ? tok.tintBg : hovered ? 'var(--surface-alt)' : 'transparent',
        borderLeft: isArmed ? `3px solid ${tok.text}` : '3px solid transparent',
        transition: 'background 0.12s',
        flexShrink: 0,
      }}
    >
      <button
        type="button"
        aria-pressed={isArmed}
        onClick={onArm}
        style={{
          width: '100%',
          border: 0,
          fontFamily: 'inherit',
          display: 'flex',
          alignItems: 'center',
          gap: 'var(--space-2)',
          padding: 'var(--space-2) var(--space-3)',
          textAlign: 'left',
          cursor: 'pointer',
          background: 'transparent',
        }}
      >
        {/* Color dot */}
        <span style={{
          width: 10,
          height: 10,
          borderRadius: 'var(--radius-round)',
          background: tok.text,
          flexShrink: 0,
          display: 'inline-block',
          boxShadow: isArmed ? `0 0 0 2px ${tok.tintBorder}` : 'none',
        }} />
        {/* Avatar */}
        <Avatar
          name={char.id === 'ElderRowan' ? 'ER' : char.id === 'Narrator' ? 'N' : char.name.slice(0, 2).toUpperCase()}
          size={18}
          style={{
            background: tok.tintBg,
            border: `1px solid ${tok.tintBorder}`,
            fontSize: 'var(--type-micro)',
          }}
        />
        {/* Name */}
        <span style={{
          fontSize: 'var(--type-micro)',
          fontWeight: isArmed ? 700 : 400,
          color: isArmed ? tok.text : 'var(--text-secondary)',
          lineHeight: 'var(--leading-snug)',
          overflow: 'hidden',
          textOverflow: 'ellipsis',
          whiteSpace: 'nowrap',
          flex: 1,
          minWidth: 0,
        }}>
          {char.name}
        </span>
      </button>

      {/* Tier-2 Promote action */}
      {onPromote && hovered && (
        <div style={{ padding: '0 var(--space-3) var(--space-1)', display: 'flex', gap: 4 }}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onPromote(); }}
            title="Promote to book character"
            style={{
              fontSize: 'var(--type-micro)',
              padding: '1px 6px',
              borderRadius: 'var(--radius-round)',
              border: '1px solid var(--accent-tint-border)',
              background: 'var(--accent-tint-bg)',
              color: 'var(--accent)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              whiteSpace: 'nowrap',
            }}
          >
            <ArrowUpCircle size={9} aria-hidden="true" />
            Promote
          </button>
        </div>
      )}

      {/* Tier-3 Surface action */}
      {onSurface && hovered && (
        <div style={{ padding: '0 var(--space-3) var(--space-1)', display: 'flex', gap: 4 }}>
          <button
            type="button"
            onClick={(e) => { e.stopPropagation(); onSurface(); }}
            title="Add to this chapter"
            style={{
              fontSize: 'var(--type-micro)',
              padding: '1px 6px',
              borderRadius: 'var(--radius-round)',
              border: '1px solid var(--border)',
              background: 'var(--surface-alt)',
              color: 'var(--text-secondary)',
              cursor: 'pointer',
              fontFamily: 'inherit',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 3,
              whiteSpace: 'nowrap',
            }}
          >
            <Plus size={9} aria-hidden="true" />
            Add to chapter
          </button>
        </div>
      )}
    </div>
  );
};

// ---------------------------------------------------------------------------
// CastPanel

interface CastPanelProps {
  activeChapter?: number;
  armedSwatch: string | null;
  onSwatchClick: (id: string) => void;
}

export const CastPanel: React.FC<CastPanelProps> = ({
  activeChapter = 4,
  armedSwatch,
  onSwatchClick,
}) => {
  const N = activeChapter;
  const [characters, setCharacters] = useState<CastCharacter[]>(INITIAL_CHARACTERS);
  const [tier2Open, setTier2Open] = useState(true);
  const [tier3Open, setTier3Open] = useState(false);

  // Tier 1: book characters in this chapter
  const tier1 = characters.filter(c => c.kind === 'book' && c.chapters.includes(N));
  // Tier 2: temp characters for this chapter
  const tier2 = characters.filter(c => c.kind === 'temp' && c.chapters.includes(N));
  // Tier 3: book characters NOT in this chapter
  const tier3 = characters.filter(c => c.kind === 'book' && !c.chapters.includes(N));

  // Surface: add N to a tier-3 character's chapters
  const handleSurface = (id: string) => {
    setCharacters(prev =>
      prev.map(c => c.id === id ? { ...c, chapters: [...c.chapters, N] } : c)
    );
  };

  // Promote: convert a tier-2 temp to a book character
  const handlePromote = (id: string) => {
    setCharacters(prev =>
      prev.map(c => c.id === id ? { ...c, kind: 'book' } : c)
    );
  };

  // Add temp: create a new ch{N} · Character {i} temp
  const handleAddTemp = () => {
    const existingTemps = characters.filter(
      c => c.kind === 'temp' && c.chapters.includes(N)
    );
    const nextIndex = existingTemps.length + 1;
    const newId = `ch${N}-temp-${nextIndex}-${Date.now()}`;
    const newChar: CastCharacter = {
      id: newId,
      name: `Ch${N} · Character ${nextIndex}`,
      voiceName: 'Unassigned',
      colorKey: 'Narrator',
      chapters: [N],
      kind: 'temp',
    };
    setCharacters(prev => [...prev, newChar]);
  };

  return (
    <div style={{
      width: 168,
      flexShrink: 0,
      borderLeft: '1px solid var(--hairline)',
      background: 'var(--surface)',
      display: 'flex',
      flexDirection: 'column',
      overflow: 'hidden',
    }}>
      {/* Panel label */}
      <div style={{
        fontSize: 'var(--type-micro)',
        fontWeight: 'var(--type-weight-micro)' as unknown as number,
        letterSpacing: 'var(--tracking-wide)',
        textTransform: 'uppercase',
        color: 'var(--text-muted)',
        padding: 'var(--space-2) var(--space-3)',
        borderBottom: '1px solid var(--hairline)',
        flexShrink: 0,
      }}>
        Cast
      </div>

      {/* Scrollable tier list */}
      <Col gap={0} style={{ flex: 1, overflowY: 'auto' }}>

        {/* ── Tier 1: In this chapter ─────────────────── */}
        <TierHeader
          label="In this chapter"
          count={tier1.length}
          open={true}
          onToggle={() => {}}
          starFilled
          alwaysOpen
        />
        <Col gap={0}>
          {tier1.map(char => (
            <CharRow
              key={char.id}
              char={char}
              isArmed={armedSwatch === char.id}
              onArm={() => onSwatchClick(char.id)}
            />
          ))}
          {tier1.length === 0 && (
            <div style={{
              padding: 'var(--space-1) var(--space-3)',
              fontSize: 'var(--type-micro)',
              color: 'var(--text-muted)',
              fontStyle: 'italic',
            }}>
              none
            </div>
          )}
        </Col>

        {/* ── Tier 2: Chapter-scoped temps ────────────── */}
        <TierHeader
          label="Chapter-scoped"
          count={tier2.length}
          open={tier2Open}
          onToggle={() => setTier2Open(v => !v)}
        />
        {tier2Open && (
          <Col gap={0}>
            {tier2.map(char => (
              <CharRow
                key={char.id}
                char={char}
                isArmed={armedSwatch === char.id}
                onArm={() => onSwatchClick(char.id)}
                onPromote={() => handlePromote(char.id)}
              />
            ))}
            {/* Add temp affordance */}
            <button
              type="button"
              onClick={handleAddTemp}
              style={{
                width: '100%',
                border: 0,
                borderBottom: '1px solid var(--hairline)',
                fontFamily: 'inherit',
                display: 'flex',
                alignItems: 'center',
                gap: 4,
                padding: 'var(--space-1) var(--space-3)',
                textAlign: 'left',
                cursor: 'pointer',
                background: 'transparent',
                color: 'var(--text-muted)',
                fontSize: 'var(--type-micro)',
                fontStyle: 'italic',
              }}
            >
              <Plus size={9} aria-hidden="true" />
              temp voice
            </button>
          </Col>
        )}

        {/* ── Tier 3: Everyone else ────────────────────── */}
        <TierHeader
          label="Everyone else"
          count={tier3.length}
          open={tier3Open}
          onToggle={() => setTier3Open(v => !v)}
        />
        {tier3Open && (
          <Col gap={0}>
            {tier3.map(char => (
              <CharRow
                key={char.id}
                char={char}
                isArmed={armedSwatch === char.id}
                onArm={() => onSwatchClick(char.id)}
                onSurface={() => handleSurface(char.id)}
              />
            ))}
            {tier3.length === 0 && (
              <div style={{
                padding: 'var(--space-1) var(--space-3)',
                fontSize: 'var(--type-micro)',
                color: 'var(--text-muted)',
                fontStyle: 'italic',
              }}>
                none
              </div>
            )}
          </Col>
        )}

      </Col>

      {/* Footer hint */}
      <div style={{
        padding: 'var(--space-2) var(--space-3)',
        borderTop: '1px solid var(--hairline)',
        fontSize: 'var(--type-micro)',
        color: 'var(--text-muted)',
        fontStyle: 'italic',
        lineHeight: 'var(--leading-snug)',
        flexShrink: 0,
      }}>
        {armedSwatch ? (
          <span style={{ color: SPEAKER_TOKEN[armedSwatch]?.text ?? 'var(--accent)', fontStyle: 'normal', fontWeight: 600 }}>
            painting: {armedSwatch === 'Narrator' ? 'Narrator' : characters.find(c => c.id === armedSwatch)?.name ?? armedSwatch}
          </span>
        ) : (
          'paint a voice, click text to assign'
        )}
      </div>

      {/* Inline hint chip when a char is armed */}
      {armedSwatch && (
        <div style={{
          padding: '0 var(--space-3) var(--space-2)',
          flexShrink: 0,
        }}>
          <SemanticChip variant="accent">click text to assign</SemanticChip>
        </div>
      )}
    </div>
  );
};
