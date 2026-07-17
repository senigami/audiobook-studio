/**
 * Director's Console — Northstar demo pane
 *
 * Demonstrates the Chapter Editor's "Director's Console" design:
 *   Cast (V) · Booth (R) · Revise (E) · Write (W)
 *   Left annotation gutter · Cast palette · Karaoke · In-place editing
 *   Stage Direction (S) and Performance Cue (P) built-ins
 */
import React, { useState, useEffect, useRef } from 'react';
import { Mic, Headphones, FileText, Pencil, Zap, X, Play, Pause, ChevronDown, ChevronUp, Plus, AlertTriangle, CaseLower, Quote, Pilcrow, MousePointer2, CircleSlash } from 'lucide-react';

// ── Types ────────────────────────────────────────────────────────────────────

type Mode = 'cast' | 'booth' | 'write' | 'revise';
type View = 'book' | 'script' | 'play';
type Brush = 'word' | 'sentence' | 'paragraph';
type Variation = 'natural' | 'whisper' | 'urgent';
type CastTool = 'select' | 'voice' | 'stage' | 'cue';
type CueDelivery = 'whisper' | 'normal' | 'loud';
type CueSpeed = 'slow' | 'normal' | 'fast';
type CueEmotion = '' | 'angry' | 'anxious' | 'bitter' | 'calm' | 'cheerful' | 'confused' | 'content' | 'dejected' | 'excited' | 'fearful' | 'frustrated' | 'grief' | 'happy' | 'hopeful' | 'melancholic' | 'nervous' | 'nostalgic' | 'playful' | 'sad' | 'sarcastic' | 'surprised' | 'tender' | 'tense' | 'weary';

interface Block {
  id: string;
  type: 'stage' | 'perf-cue' | 'speech' | 'unassigned';
  voice?: 'marcus' | 'eleanor' | 'narrator';
  variation?: Variation;
  /** id of the cast member who painted this (preserves character color even when
   *  two characters share a voice slot, e.g. Maren + Eleanor both paint 'eleanor') */
  painterId?: string;
  text: string;
  /** perf-cue label shown inline */
  cueLabel?: string;
  /** false = never render audio; skipped by booth playhead */
  renderable: boolean;
  /**
   * Author's paragraph number. Renderable segments sharing a paragraph flow
   * together as continuous prose in Book view (and break onto their own line
   * in Script view). Annotations (stage/perf-cue) leave this unset.
   */
  para?: number;
}

// ── Voice tokens ─────────────────────────────────────────────────────────────

const VOICE = {
  marcus: {
    label: 'Marcus',
    tintBg: 'var(--accent-tint-bg)',
    tintBorder: 'var(--accent-tint-border)',
    textColor: 'var(--action-primary)',
    dot: 'var(--action-primary)',
  },
  eleanor: {
    label: 'Eleanor',
    tintBg: 'rgba(124,58,237,.1)',
    tintBorder: 'rgba(196,181,253,.4)',
    textColor: '#8b5cf6',
    dot: '#8b5cf6',
  },
  narrator: {
    label: 'Narrator',
    tintBg: 'transparent',
    tintBorder: 'var(--border)',
    textColor: 'var(--text-secondary)',
    dot: 'var(--text-muted)',
  },
} as const;

// ── Mode appearance tokens ────────────────────────────────────────────────────

const MODE_STYLE = {
  cast: { label: 'Cast', key: 'V', color: 'var(--action-primary)', bg: 'var(--accent-tint-bg)', border: 'var(--accent-tint-border)' },
  booth: { label: 'Booth', key: 'R', color: 'var(--success)', bg: 'var(--success-tint-bg)', border: 'var(--success-tint-border)' },
  revise: { label: 'Revise', key: 'E', color: 'var(--error)', bg: 'var(--error-tint-bg)', border: 'var(--error-tint-border)' },
  write: { label: 'Write', key: 'W', color: 'var(--warning)', bg: 'var(--warning-tint-bg)', border: 'var(--warning-tint-border)' },
} as const;

// ── Reader preferences ────────────────────────────────────────────────────────

type ReaderFont = 'georgia' | 'literary' | 'sans' | 'humanist' | 'accessible' | 'dyslexia';
type ReaderBg   = 'white' | 'cream' | 'paper' | 'parchment' | 'antique' | 'card';

const SIZE_STOPS = [12, 13.5, 15, 17, 20] as const;

// Texture assets live in frontend/public/textures and are copied to the demo root.
// BASE_URL keeps them resolvable both in dev and in the relative-base docs/demo build.
const TEX = (name: string) => `${import.meta.env.BASE_URL}textures/${name}`;

// Tracks the live theme via the `data-theme` attribute on <html> (the demo's theme
// toggle flips it). Observes changes so the reader background updates instantly when
// the user switches light/dark — regardless of which control toggled it.
function useIsDark(): boolean {
  const [dark, setDark] = useState(
    () => typeof document !== 'undefined' && document.documentElement.dataset.theme === 'dark',
  );
  useEffect(() => {
    const el = document.documentElement;
    const sync = () => setDark(el.dataset.theme === 'dark');
    sync();
    const obs = new MutationObserver(sync);
    obs.observe(el, { attributes: true, attributeFilter: ['data-theme'] });
    return () => obs.disconnect();
  }, []);
  return dark;
}

const READER_FONTS: Record<ReaderFont, { label: string; family: string; tag?: string }> = {
  georgia:    { label: 'Georgia',  family: "Georgia, 'Times New Roman', serif"              },
  literary:   { label: 'Literary', family: "'Source Serif 4', Georgia, serif"               },
  sans:       { label: 'Inter',    family: "'Inter Variable', system-ui, sans-serif"        },
  humanist:   { label: 'Humanist', family: "'Space Grotesk', system-ui, sans-serif"         },
  accessible: { label: 'Atkinson', family: "'Atkinson Hyperlegible', system-ui, sans-serif", tag: 'Low vision' },
  dyslexia:   { label: 'Lexend',   family: "'Lexend Variable', system-ui, sans-serif",       tag: 'Dyslexia'   },
};

// Each background has a light and a dark variant so the same choice carries across
// theme without reassigning. `bg` is the fallback/blend colour shown under the image
// (and while it loads); `img` is the optional texture file. Solids (White/Cream) have
// no image — just a flat colour per theme.
type BgVariant = { bg: string; img?: string };
const READER_BGS: Record<ReaderBg, { label: string; light: BgVariant; dark: BgVariant }> = {
  white:     { label: 'White',     light: { bg: '#ffffff' },                              dark: { bg: '#16161a' } },
  cream:     { label: 'Cream',     light: { bg: '#faf6f0' },                              dark: { bg: '#211d19' } },
  paper:     { label: 'Paper',     light: { bg: '#fbfaf6', img: TEX('paper.jpg')     },   dark: { bg: '#1c1c1b', img: TEX('paper-dark.jpg')     } },
  parchment: { label: 'Parchment', light: { bg: '#f3e9d2', img: TEX('parchment.jpg') },   dark: { bg: '#2a261f', img: TEX('parchment-dark.jpg') } },
  antique:   { label: 'Antique',   light: { bg: '#ece0c6', img: TEX('antique.jpg')   },   dark: { bg: '#2a2620', img: TEX('antique-dark.jpg')   } },
  card:      { label: 'Card',      light: { bg: '#e3e0d6', img: TEX('card.jpg')      },   dark: { bg: '#26241f', img: TEX('card-dark.jpg')      } },
};

// Tool-grid layout order — matches the shipping Director's Console icon rail,
// which renders its tool registry in order (Cast · Booth · Revise · Write).
// See pages/ChapterEditor/components/DirectorsConsole/registry.ts.
const MODE_GRID_ORDER: Mode[] = ['cast', 'booth', 'revise', 'write'];

// Cast sub-tool definitions — shown as a toolbar when Cast mode is active
const CAST_TOOL_DEFS: { id: CastTool; Icon: typeof Mic; label: string; title: string; shortcut: string }[] = [
  { id: 'select', Icon: MousePointer2, label: 'Select', title: 'Inspect segment (S)',           shortcut: 'S' },
  { id: 'voice',  Icon: Mic,           label: 'Voice',  title: 'Paint speaker (V)',             shortcut: 'V' },
  { id: 'stage',  Icon: CircleSlash,   label: 'Stage',  title: 'Mark stage direction (G)',      shortcut: 'G' },
  { id: 'cue',    Icon: Zap,           label: 'Cue',    title: 'Set performance cue (C)',       shortcut: 'C' },
];
// Cue delivery presets (set rate + pitch together)
// Delivery = volume/projection (sets pitch). Speed = pacing (sets rate). Independent axes.
const DELIVERY_PRESETS: { key: CueDelivery; label: string; pitch: string }[] = [
  { key: 'whisper', label: 'Whisper', pitch: 'low'    },
  { key: 'normal',  label: 'Normal',  pitch: 'normal' },
  { key: 'loud',    label: 'Loud',    pitch: 'high'   },
];
const SPEED_PRESETS: { key: CueSpeed; label: string; rate: string }[] = [
  { key: 'slow',   label: 'Slow',   rate: 'slow'   },
  { key: 'normal', label: 'Normal', rate: 'normal' },
  { key: 'fast',   label: 'Fast',   rate: 'fast'   },
];
const EMOTION_PRESETS: { key: CueEmotion; label: string; prompt: string }[] = [
  { key: '',           label: '—',           prompt: ''                         },
  { key: 'angry',      label: 'Angry',       prompt: 'angry, heated'            },
  { key: 'anxious',    label: 'Anxious',     prompt: 'anxious, uneasy'          },
  { key: 'bitter',     label: 'Bitter',      prompt: 'bitter, resentful'        },
  { key: 'calm',       label: 'Calm',        prompt: 'calm, composed'           },
  { key: 'cheerful',   label: 'Cheerful',    prompt: 'cheerful, upbeat'         },
  { key: 'confused',   label: 'Confused',    prompt: 'confused, uncertain'      },
  { key: 'content',    label: 'Content',     prompt: 'content, at ease'         },
  { key: 'dejected',   label: 'Dejected',    prompt: 'dejected, downcast'       },
  { key: 'excited',    label: 'Excited',     prompt: 'excited, eager'           },
  { key: 'fearful',    label: 'Fearful',     prompt: 'fearful, trembling'       },
  { key: 'frustrated', label: 'Frustrated',  prompt: 'frustrated, impatient'    },
  { key: 'grief',      label: 'Grief',       prompt: 'grief-stricken, sorrowful'},
  { key: 'happy',      label: 'Happy',       prompt: 'warm, joyful'             },
  { key: 'hopeful',    label: 'Hopeful',     prompt: 'hopeful, expectant'       },
  { key: 'melancholic',label: 'Melancholic', prompt: 'melancholic, wistful'     },
  { key: 'nervous',    label: 'Nervous',     prompt: 'nervous, on edge'         },
  { key: 'nostalgic',  label: 'Nostalgic',   prompt: 'nostalgic, reflective'    },
  { key: 'playful',    label: 'Playful',     prompt: 'playful, teasing'         },
  { key: 'sad',        label: 'Sad',         prompt: 'sad, subdued'             },
  { key: 'sarcastic',  label: 'Sarcastic',   prompt: 'sarcastic, dry'           },
  { key: 'surprised',  label: 'Surprised',   prompt: 'surprised, taken aback'   },
  { key: 'tender',     label: 'Tender',      prompt: 'tender, gentle'           },
  { key: 'tense',      label: 'Tense',       prompt: 'tense, strained'          },
  { key: 'weary',      label: 'Weary',       prompt: 'weary, exhausted'         },
];

const MODE_ICON: Record<Mode, typeof Mic> = { write: FileText, revise: Pencil, cast: Mic, booth: Headphones };
const MODE_HINT: Record<Mode, string> = {
  write: 'Write — full source editor',
  revise: 'Revise — in-place paragraph edits',
  cast: 'Cast — assign voices to text',
  booth: 'Booth — listen back with karaoke follow',
};

// ── Cast roster (chapter-aware tiers) ─────────────────────────────────────────
// Restores the live-site three-tier cast organization: In this chapter /
// Chapter cast / Everyone else. Each member carries its own variation list,
// shown as an expansion under the selected character.

type CastTier = 'chapter' | 'temp' | 'else';

interface VariationOpt { key: Variation; label: string; }

interface CastMember {
  id: string;
  name: string;
  /** Voice library name shown under the alias */
  voiceName: string;
  /** Which block-voice this paints as (keeps assignment functional) */
  paint: 'marcus' | 'eleanor' | 'narrator';
  tier: CastTier;
  dot: string;
  tintBg: string;
  tintBorder: string;
  text: string;
  /** Named variations for this voice, surfaced under the selected row */
  variations: VariationOpt[];
}

const DEFAULT_VARIATIONS: VariationOpt[] = [
  { key: 'natural', label: 'Natural' },
  { key: 'whisper', label: 'Whisper' },
  { key: 'urgent', label: 'Urgent' },
];

// Narrator is rendered as a dedicated "default" row above the tiers.
const NARRATOR_MEMBER: CastMember = {
  id: 'narrator', name: 'Narrator', voiceName: 'Dark Fantasy', paint: 'narrator', tier: 'chapter',
  dot: 'var(--text-muted)', tintBg: 'var(--surface-alt)', tintBorder: 'var(--border)', text: 'var(--text-secondary)',
  variations: DEFAULT_VARIATIONS,
};

const CAST_ROSTER: CastMember[] = [
  // ── In this chapter (speaking characters present in the text) ──
  {
    id: 'marcus', name: 'Marcus', voiceName: 'Marcus Reed', paint: 'marcus', tier: 'chapter',
    dot: 'var(--action-primary)', tintBg: 'var(--accent-tint-bg)', tintBorder: 'var(--accent-tint-border)', text: 'var(--action-primary)',
    variations: DEFAULT_VARIATIONS,
  },
  {
    id: 'eleanor', name: 'Eleanor', voiceName: 'Studio Voice', paint: 'eleanor', tier: 'chapter',
    dot: '#8b5cf6', tintBg: 'rgba(124,58,237,.1)', tintBorder: 'rgba(196,181,253,.4)', text: '#8b5cf6',
    variations: [{ key: 'natural', label: 'Natural' }, { key: 'whisper', label: 'Whisper' }, { key: 'urgent', label: 'Commanding' }],
  },
  // ── Everyone else (book roster not used in this chapter) ──
  {
    id: 'dov', name: 'Dov', voiceName: 'Old Tom', paint: 'marcus', tier: 'else',
    dot: '#2f9e6f', tintBg: 'rgba(47,158,111,.10)', tintBorder: 'rgba(47,158,111,.30)', text: '#2f9e6f',
    variations: [{ key: 'natural', label: 'Natural' }, { key: 'urgent', label: 'Tense' }],
  },
  {
    id: 'maren', name: 'Maren', voiceName: 'Elena Marsh', paint: 'eleanor', tier: 'else',
    dot: '#e08a3c', tintBg: 'rgba(224,138,60,.10)', tintBorder: 'rgba(224,138,60,.30)', text: '#e08a3c',
    variations: [{ key: 'natural', label: 'Natural' }, { key: 'whisper', label: 'Soft' }],
  },
  {
    // Reuses "Old Tom" (also Dov's voice) — a realistic casting collision the
    // ⚠ flag surfaces; the two characters keep distinct color bars.
    id: 'elderRowan', name: 'Elder Rowan', voiceName: 'Old Tom', paint: 'narrator', tier: 'else',
    dot: '#0e9aa7', tintBg: 'rgba(14,154,167,.10)', tintBorder: 'rgba(14,154,167,.30)', text: '#0e9aa7',
    variations: [{ key: 'natural', label: 'Natural' }],
  },
];

// Resolve a block's performance variation to its display label (e.g. Eleanor's
// 'urgent' shows as "Commanding"). Returns null for natural/none — variation is
// shown as TEXT under the speaker name, never encoded as color.
// painterId is preferred over voice-slot lookup so Maren's variation labels
// come from Maren's roster entry, not Eleanor's.
const variationLabelFor = (
  voice: 'marcus' | 'eleanor' | 'narrator' | undefined,
  variationKey: Variation | undefined,
  painterId?: string,
): string | null => {
  if (!voice) return null;
  const member = painterId
    ? (painterId === 'narrator' ? NARRATOR_MEMBER : CAST_ROSTER.find(m => m.id === painterId))
    : (voice === 'narrator' ? NARRATOR_MEMBER : CAST_ROSTER.find(m => m.paint === voice && m.tier === 'chapter'));
  // Only show if the member has more than one variation — single-variation
  // members have nothing meaningful to label.
  if (!member || member.variations.length <= 1) return null;
  const effectiveKey = variationKey ?? 'natural';
  const opt = member.variations.find(v => v.key === effectiveKey);
  return opt?.label ?? effectiveKey.charAt(0).toUpperCase() + effectiveKey.slice(1);
};

// Resolve the display style for a speech block: prefer the painter's character
// color (painterId) so Maren's orange shows even though she shares the
// 'eleanor' voice slot with Eleanor.
const resolveBlockStyle = (block: Block): { dot: string; textColor: string; label: string } | null => {
  if (block.type !== 'speech' || !block.voice) return null;
  if (block.painterId) {
    const m = block.painterId === 'narrator'
      ? NARRATOR_MEMBER
      : CAST_ROSTER.find(m => m.id === block.painterId);
    if (m) return { dot: m.dot, textColor: m.text, label: m.name };
  }
  const vc = VOICE[block.voice];
  return vc ? { dot: vc.dot, textColor: vc.textColor, label: vc.label } : null;
};

// Bold/italic comes from the performance CUE (emotion layer), not variation.
// Variation is a recorded take (character-defining); it must not affect typeface.
const cueEmphasis = (cueLabel?: string) => ({
  isItalic:     !!cueLabel && /\bWhisper\b/i.test(cueLabel),
  isBold:       !!cueLabel && /\bLoud\b/i.test(cueLabel),
  letterSpacing: cueLabel && /\bSlow\b/i.test(cueLabel) ? '.06em'
              : cueLabel && /\bFast\b/i.test(cueLabel) ? '-.03em'
              : undefined,
});

// ── Cast sub-components ───────────────────────────────────────────────────────

const TierHeader: React.FC<{
  label: string; count: number; open?: boolean; onToggle?: () => void; collapsible?: boolean; warn?: number;
}> = ({ label, count, open, onToggle, collapsible, warn }) => (
  <div
    onClick={collapsible ? onToggle : undefined}
    style={{
      display: 'flex', alignItems: 'center', gap: 4,
      padding: '4px 8px', background: 'var(--surface-alt)',
      borderTop: '1px solid var(--hairline)', borderBottom: '1px solid var(--hairline)',
      cursor: collapsible ? 'pointer' : 'default', userSelect: 'none', flexShrink: 0,
    }}
  >
    <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-muted)', flex: 1 }}>{label}</span>
    {warn != null && warn > 0 && (
      <span title={`${warn} voice collision${warn > 1 ? 's' : ''}`} style={{ display: 'flex', alignItems: 'center', gap: 2, color: 'var(--action-danger, #c0392b)' }}>
        <AlertTriangle size={10} strokeWidth={2} aria-hidden="true" />
        <span style={{ fontSize: 10, fontWeight: 700 }}>{warn}</span>
      </span>
    )}
    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>{count}</span>
    {collapsible && (open
      ? <ChevronUp size={10} aria-hidden="true" style={{ color: 'var(--text-muted)' }} />
      : <ChevronDown size={10} aria-hidden="true" style={{ color: 'var(--text-muted)' }} />)}
  </div>
);

const NARRATOR_VOICES = [
  { value: 'project-default', label: 'Default (Dark Fantasy)' },
  { value: 'dark-fantasy', label: 'Dark Fantasy' },
  { value: 'marcus-reed', label: 'Marcus Reed' },
  { value: 'studio-voice', label: 'Studio Voice' },
  { value: 'old-tom', label: 'Old Tom' },
  { value: 'elena-marsh', label: 'Elena Marsh' },
  { value: 'aria-stone', label: 'Aria Stone' },
];

const NarratorRow: React.FC<{
  selected: boolean;
  voiceValue: string;
  onSelect: () => void;
  onVoiceChange: (v: string) => void;
}> = ({ selected, voiceValue, onSelect, onVoiceChange }) => {
  const currentVoice = NARRATOR_VOICES.find(v => v.value === voiceValue) ?? NARRATOR_VOICES[0];
  const displayName = voiceValue === 'project-default' ? 'Dark Fantasy' : currentVoice.label;
  return (
    <div style={{
      borderBottom: '1px solid var(--hairline)',
      background: selected ? 'var(--surface-alt)' : 'transparent',
      borderLeft: selected ? '2px solid var(--text-muted)' : '2px solid transparent',
      transition: 'background .12s',
    }}>
      <button
        type="button"
        aria-pressed={selected}
        onClick={onSelect}
        style={{
          width: '100%', border: 0, background: 'transparent', fontFamily: 'inherit',
          display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
          textAlign: 'left', cursor: 'pointer',
        }}
      >
        <span style={{
          width: 9, height: 9, borderRadius: '50%', background: 'var(--text-muted)', flexShrink: 0,
          boxShadow: selected ? '0 0 0 2px var(--surface-alt)' : 'none',
        }} />
        <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
          <span style={{ fontSize: 12, fontWeight: selected ? 700 : 500, color: 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>Narrator</span>
          <span style={{ fontSize: 10, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</span>
        </span>
        {selected
          ? <ChevronUp size={12} aria-hidden="true" style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
          : <ChevronDown size={12} aria-hidden="true" style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
      </button>
      {selected && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: '2px 8px 7px 8px' }}>
          <div style={{ position: 'relative' }}>
            {/* Visual — identical to a selected variation pill */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 7, padding: '4px 10px',
              borderRadius: 5, background: 'var(--surface)',
              fontSize: 11, fontWeight: 600, color: 'var(--text-secondary)',
              pointerEvents: 'none',
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', flexShrink: 0, background: 'var(--text-muted)' }} />
              <span style={{ flex: 1 }}>{displayName}</span>
              <ChevronDown size={10} aria-hidden="true" style={{ color: 'var(--text-muted)' }} />
            </div>
            {/* Invisible select captures clicks and opens native picker */}
            <select
              value={voiceValue}
              onChange={e => { e.stopPropagation(); onVoiceChange(e.target.value); }}
              aria-label="Narrator voice"
              style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%' }}
            >
              {NARRATOR_VOICES.map(v => (
                <option key={v.value} value={v.value}>{v.label}</option>
              ))}
            </select>
          </div>
        </div>
      )}
    </div>
  );
};

const CastRow: React.FC<{
  member: CastMember;
  segCount?: number;
  selected: boolean;
  activeVariation: Variation;
  conflictWith?: string[] | null;
  onSelect: () => void;
  onVariation: (v: Variation) => void;
}> = ({ member, segCount, selected, activeVariation, conflictWith, onSelect, onVariation }) => (
  <div style={{
    borderBottom: '1px solid var(--hairline)',
    background: selected ? member.tintBg : 'transparent',
    borderLeft: selected ? `2px solid ${member.text}` : '2px solid transparent',
    transition: 'background .12s',
  }}>
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      style={{
        width: '100%', border: 0, background: 'transparent', fontFamily: 'inherit',
        display: 'flex', alignItems: 'center', gap: 8, padding: '6px 8px',
        textAlign: 'left', cursor: 'pointer',
      }}
    >
      <span style={{
        width: 9, height: 9, borderRadius: '50%', background: member.dot, flexShrink: 0,
        boxShadow: selected ? `0 0 0 2px ${member.tintBorder}` : 'none',
      }} />
      <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0, flex: 1 }}>
        <span style={{ fontSize: 12, fontWeight: selected ? 700 : 500, color: selected ? member.text : 'var(--text-primary)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.name}</span>
        <span style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0 }}>
          <span style={{ fontSize: 10, color: conflictWith ? 'var(--action-danger, #c0392b)' : 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{member.voiceName}</span>
          {conflictWith && (
            <AlertTriangle
              size={11}
              strokeWidth={2}
              aria-label={`Voice collision: also used by ${conflictWith.join(', ')}`}
              style={{ color: 'var(--action-danger, #c0392b)', flexShrink: 0 }}
            />
          )}
        </span>
      </span>
      {segCount != null && segCount > 0 && (
        <span title={`${segCount} line(s) assigned`} style={{
          fontSize: 10, fontWeight: 600, flexShrink: 0,
          color: selected ? member.text : 'var(--text-muted)',
          background: selected ? 'transparent' : 'var(--surface-alt)',
          borderRadius: 10, padding: '1px 6px',
        }}>{segCount}</span>
      )}
      {member.variations.length > 1 && (selected
        ? <ChevronUp size={12} aria-hidden="true" style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
        : <ChevronDown size={12} aria-hidden="true" style={{ color: 'var(--text-muted)', flexShrink: 0 }} />)}
    </button>

    {/* Variation expansion — sub-list under the selected character */}
    {selected && member.variations.length > 1 && (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 1, padding: '2px 8px 7px 8px' }}>
        {member.variations.map(v => {
          const on = activeVariation === v.key;
          return (
            <button
              key={v.key}
              type="button"
              aria-pressed={on}
              onClick={(e) => { e.stopPropagation(); onVariation(v.key); }}
              style={{
                width: '100%', textAlign: 'left', fontFamily: 'inherit', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'flex-start', gap: 7, padding: '4px 10px',
                border: 0, borderRadius: 5,
                background: on ? 'var(--surface)' : 'transparent',
                color: on ? member.text : 'var(--text-secondary)',
                fontSize: 11, fontWeight: on ? 600 : 400,
              }}
            >
              <span style={{
                width: 6, height: 6, borderRadius: '50%', flexShrink: 0,
                background: on ? member.dot : 'transparent',
                border: on ? 'none' : `1.5px solid ${member.dot}`,
              }} />
              {v.label}
            </button>
          );
        })}
      </div>
    )}
  </div>
);

// ── Initial content blocks ────────────────────────────────────────────────────

const INITIAL_BLOCKS: Block[] = [
  { id: 'b1', type: 'stage', text: '[No music cue — this scene opens in silence]', renderable: false },
  // ¶1 — narration (two sentence-segments that flow as one paragraph in Book view)
  { id: 'b2', type: 'speech', voice: 'narrator', para: 1, text: 'The road wound down through silver birch and pale stone, the kind of road that remembers every foot that has ever crossed it.', renderable: true },
  { id: 'b2b', type: 'speech', voice: 'narrator', para: 1, text: 'Maren pulled her cloak tighter against the chill rising from the valley floor, and for a long moment said nothing at all.', renderable: true },
  // ¶2 — Marcus (dialogue gets its own paragraph, as in a book)
  { id: 'b3', type: 'perf-cue', text: 'b4', cueLabel: '[slowly · low | voice catches]', renderable: false },
  { id: 'b4', type: 'speech', voice: 'marcus', para: 2, text: '"Stay close to me."', renderable: true },
  // ¶3 — Eleanor
  { id: 'b5', type: 'stage', text: '[Eleanor steps forward from the shadows]', renderable: false },
  { id: 'b6', type: 'speech', voice: 'eleanor', para: 3, text: '"The warden\'s lantern moves at dusk, and it moves fast."', renderable: true },
  // ¶4 — narration (two segments flow together)
  { id: 'b7', type: 'speech', voice: 'narrator', variation: 'whisper', para: 4, text: 'Dov tightened his grip on the satchel and said nothing for a long moment.', renderable: true },
  { id: 'b9', type: 'speech', voice: 'narrator', para: 4, text: 'Far above, an owl called once, then fell silent.', renderable: true },
  // ¶5 — Marcus
  { id: 'b8', type: 'speech', voice: 'marcus', para: 5, text: '"How close exactly?"', renderable: true },
  // ¶6 — Eleanor (urgent)
  { id: 'b10', type: 'speech', voice: 'eleanor', variation: 'urgent', para: 6, text: '"Run — don\'t look back. Not for anything."', renderable: true },
  // ¶7 — closing narration (unassigned)
  { id: 'b11', type: 'stage', text: '[Long pause. Ambient wind fades to silence.]', renderable: false },
  { id: 'b12', type: 'unassigned', para: 7, text: 'They walked a long while without speaking, the path narrowing until the dark swallowed them whole.', renderable: true },
];

const WRITE_TEXT = INITIAL_BLOCKS
  .filter(b => b.renderable)
  .map(b => b.text)
  .join('\n\n');

const RENDERABLE_IDS = INITIAL_BLOCKS.filter(b => b.renderable).map(b => b.id);

// ── Subcomponents ─────────────────────────────────────────────────────────────

const KbdKey: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <span style={{
    marginLeft: 'auto', fontSize: 10, fontFamily: 'monospace',
    background: 'var(--bg)', border: '1px solid var(--border)',
    borderRadius: 3, padding: '1px 4px', fontWeight: 700, lineHeight: 1.4,
    color: 'var(--text-muted)', flexShrink: 0,
  }}>{children}</span>
);

// ── Cue Editor Popover ────────────────────────────────────────────────────────

interface CueEditorProps {
  rate: string; pitch: string; prompt: string; desc: string;
  onRate: (v: string) => void; onPitch: (v: string) => void;
  onPrompt: (v: string) => void; onDesc: (v: string) => void;
  onApply: () => void; onCancel: () => void;
}

const RATE_OPTIONS = ['slow', 'normal', 'fast'] as const;
const PITCH_OPTIONS = ['low', 'normal', 'high'] as const;

const CueEditor: React.FC<CueEditorProps> = ({ rate, pitch, prompt, desc, onRate, onPitch, onPrompt, onDesc, onApply, onCancel }: CueEditorProps) => {
  const preview = [
    rate !== 'normal' || pitch !== 'normal' ? `${rate} · ${pitch}` : '',
    prompt || desc ? `${prompt}${desc ? ` | ${desc}` : ''}` : '',
  ].filter(Boolean).join(' · ') || 'no cue set';

  const sbStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, padding: '3px 4px', fontSize: 11,
    background: active ? 'var(--accent-tint-bg)' : 'var(--surface-alt)',
    border: `1px solid ${active ? 'var(--accent-tint-border)' : 'var(--border)'}`,
    borderRadius: 4, color: active ? 'var(--action-primary)' : 'var(--text-secondary)',
    cursor: 'pointer', textAlign: 'center' as const,
    fontFamily: 'inherit', transition: 'all .1s',
  });

  return (
    <div style={{
      position: 'fixed', width: 310, zIndex: 300,
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 10, padding: 14, boxShadow: 'var(--shadow-xl)',
      display: 'flex', flexDirection: 'column', gap: 10,
      top: 80, left: '50%', transform: 'translateX(-50%)',
    }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, fontWeight: 600, color: 'var(--text-primary)' }}>
        <Zap size={14} style={{ color: 'var(--action-primary)' }} aria-hidden="true" />
        Performance Cue Editor
        <button onClick={onCancel} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', padding: 2 }}>
          <X size={14} aria-hidden="true" />
        </button>
      </div>

      {/* Rate */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.06em', width: 38, flexShrink: 0 }}>Rate</span>
        <div style={{ display: 'flex', gap: 2, flex: 1 }}>
          {RATE_OPTIONS.map(r => <button key={r} onClick={() => onRate(r)} style={sbStyle(rate === r)}>{r}</button>)}
        </div>
      </div>

      {/* Pitch */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
        <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.06em', width: 38, flexShrink: 0 }}>Pitch</span>
        <div style={{ display: 'flex', gap: 2, flex: 1 }}>
          {PITCH_OPTIONS.map(p => <button key={p} onClick={() => onPitch(p)} style={sbStyle(pitch === p)}>{p}</button>)}
        </div>
      </div>

      {/* Divider */}
      <div style={{ height: 1, background: 'var(--border)', margin: '0 -2px' }} />

      {/* Style prompt */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Style prompt</label>
        <input
          value={prompt}
          onChange={e => onPrompt(e.target.value)}
          placeholder="e.g. voice catches, breathless…"
          style={{
            background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 5,
            padding: '5px 8px', fontSize: 12, color: 'var(--text-primary)', outline: 'none',
            fontFamily: 'inherit', width: '100%',
          }}
        />
      </div>

      {/* Description */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Note</label>
        <input
          value={desc}
          onChange={e => onDesc(e.target.value)}
          placeholder="human-readable note for this cue…"
          style={{
            background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 5,
            padding: '5px 8px', fontSize: 12, color: 'var(--text-primary)', outline: 'none',
            fontFamily: 'inherit', width: '100%',
          }}
        />
      </div>

      {/* Live preview */}
      <div>
        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 3 }}>Preview</div>
        <div style={{
          fontFamily: 'var(--font-mono, monospace)', fontSize: 12,
          color: 'var(--action-primary)', background: 'var(--accent-tint-bg)',
          border: '1px solid var(--accent-tint-border)',
          padding: '5px 8px', borderRadius: 4, minHeight: 25,
        }}>
          [{preview}]
        </div>
      </div>

      {/* Actions */}
      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
        <button onClick={onCancel} style={{
          padding: '5px 13px', borderRadius: 'var(--radius-button)',
          border: '1px solid var(--border)', background: 'var(--surface-alt)',
          color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
        }}>Cancel</button>
        <button onClick={onApply} style={{
          padding: '5px 13px', borderRadius: 'var(--radius-button)',
          border: '1px solid var(--action-primary)', background: 'var(--action-primary)',
          color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
        }}>Apply cue</button>
      </div>
    </div>
  );
};

// ── Resync Modal ──────────────────────────────────────────────────────────────

const ResyncModal: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div style={{
    position: 'fixed', inset: 0, zIndex: 400,
    background: 'rgba(0,0,0,.5)', backdropFilter: 'blur(4px)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }}>
    <div style={{
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 12, padding: 22, maxWidth: 420, width: '90%',
      boxShadow: 'var(--shadow-xl)', display: 'flex', flexDirection: 'column', gap: 14,
    }}>
      <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--text-primary)' }}>Resync Preview</div>
      <div style={{ fontSize: 13, color: 'var(--text-secondary)' }}>
        Re-analyzes the edited source and maps existing voice assignments best-effort.
      </div>
      <div style={{ display: 'flex', gap: 18 }}>
        {[['8', 'segments kept', 'var(--success)'], ['1', 'need re-assign', 'var(--warning)']] .map(([n, l, c]) => (
          <div key={l} style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <span style={{ fontSize: 22, fontWeight: 700, color: c as string }}>{n}</span>
            <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>{l}</span>
          </div>
        ))}
      </div>
      <div style={{
        fontSize: 12, color: 'var(--text-secondary)', background: 'var(--surface-alt)',
        borderRadius: 6, padding: '8px 10px', lineHeight: 1.55,
      }}>
        Write mode edits invalidate voice assignments in changed paragraphs. Resync runs a
        lightweight re-parse and preserves as many segment boundaries as it can.
      </div>
      <div style={{ display: 'flex', gap: 7, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={{
          padding: '7px 15px', borderRadius: 'var(--radius-button)',
          border: '1px solid var(--border)', background: 'var(--surface-alt)',
          color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
        }}>Cancel</button>
        <button onClick={onClose} style={{
          padding: '7px 15px', borderRadius: 'var(--radius-button)',
          border: '1px solid var(--action-primary)', background: 'var(--action-primary)',
          color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
        }}>Commit &amp; re-analyze</button>
      </div>
    </div>
  </div>
);

// ── Main component ────────────────────────────────────────────────────────────

export const DirectorsConsolePane: React.FC = () => {
  const [mode, setMode] = useState<Mode>('cast');
  const [view, setView] = useState<View>('book');
  const [brush, setBrush] = useState<Brush>('sentence');
  const [variation, setVariation] = useState<Variation>('natural');
  const [selectedCastId, setSelectedCastId] = useState<string>('marcus');
  const [tempOpen, setTempOpen] = useState(true);
  const [elseOpen, setElseOpen] = useState(false);
  const [narratorVoice, setNarratorVoice] = useState('project-default');
  const [castTool, setCastTool] = useState<CastTool>('voice');
  const [selectedSegId, setSelectedSegId] = useState<string | null>(null);
  const [tempMembers, setTempMembers] = useState<CastMember[]>([]);
  const [blocks, setBlocks] = useState<Block[]>(INITIAL_BLOCKS);
  const [boothActive, setBoothActive] = useState(false);
  const [boothIdx, setBoothIdx] = useState(0);
  const [revisingId, setRevisingId] = useState<string | null>(null);
  const [revisingText, setRevisingText] = useState('');
  const [cueOpen, setCueOpen] = useState(false);
  const [cueTarget, setCueTarget] = useState<string | null>(null);
  const [cueRate, setCueRate] = useState('normal');
  const [cuePitch, setCuePitch] = useState('normal');
  const [cuePrompt, setCuePrompt] = useState('');
  const [cueDesc, setCueDesc] = useState('');
  const [cueDelivery, setCueDelivery] = useState<CueDelivery>('normal');
  const [cueSpeed, setCueSpeed] = useState<CueSpeed>('normal');
  const [cueEmotion, setCueEmotion] = useState<CueEmotion>('');
  const [hoveredBlockId, setHoveredBlockId] = useState<string | null>(null);
  const [reassignOpen, setReassignOpen] = useState(false);
  const [resyncOpen, setResyncOpen] = useState(false);
  const [writeText, setWriteText] = useState(WRITE_TEXT);
  const [readerPrefsOpen, setReaderPrefsOpen] = useState(false);
  const [readerFont, setReaderFont]           = useState<ReaderFont>('georgia');
  const [readerSizeIdx, setReaderSizeIdx]     = useState(2); // index into SIZE_STOPS; default 15px
  const [readerBg, setReaderBg]               = useState<ReaderBg>('white');
  const boothTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Keyboard shortcuts
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'r' || e.key === 'R') setMode('booth');
      if (e.key === 'w' || e.key === 'W') setMode('write');
      if (e.key === 'e' || e.key === 'E') setMode('revise');
      if (e.key === 'Escape') {
        setMode('cast');
        setRevisingId(null);
        setCueOpen(false);
      }
      if (e.key === ' ' && mode === 'booth') {
        e.preventDefault();
        setBoothActive(v => !v);
      }
      // Cast sub-tool shortcuts (also switch to cast mode)
      if (e.key === 's' || e.key === 'S') { setMode('cast'); setCastTool('select'); }
      if (e.key === 'v' || e.key === 'V') { setMode('cast'); setCastTool('voice'); }
      if (e.key === 'g' || e.key === 'G') { setMode('cast'); setCastTool('stage'); }
      if (e.key === 'c' || e.key === 'C') { setMode('cast'); setCastTool('cue'); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [mode]);

  // Booth timer
  useEffect(() => {
    if (boothActive) {
      boothTimerRef.current = setInterval(() => {
        setBoothIdx(i => {
          if (i >= RENDERABLE_IDS.length - 1) { setBoothActive(false); return 0; }
          return i + 1;
        });
      }, 1400);
    } else {
      if (boothTimerRef.current) { clearInterval(boothTimerRef.current); boothTimerRef.current = null; }
    }
    return () => { if (boothTimerRef.current) clearInterval(boothTimerRef.current); };
  }, [boothActive]);

  const handleBlockClick = (block: Block) => {
    if (mode === 'cast') {
      if (castTool === 'select') {
        if (block.type === 'perf-cue') return;
        setSelectedSegId(prev => prev === block.id ? null : block.id);
        return;
      }
      if (castTool === 'stage') {
        if (block.type === 'perf-cue') return;
        setBlocks(prev => prev.map(b => {
          if (b.id !== block.id) return b;
          if (b.type === 'stage') {
            // restore to speech if the block had a voice before being marked as stage
            return b.voice
              ? { ...b, type: 'speech' as Block['type'], renderable: true }
              : { ...b, type: 'unassigned' as Block['type'], renderable: true };
          }
          // keep voice/painterId when marking as stage so the toggle can undo it cleanly
          return { ...b, type: 'stage' as Block['type'], renderable: false, variation: undefined };
        }));
        return;
      }
      if (castTool === 'cue') {
        if (!block.renderable) return;
        const deliveryLabel = cueDelivery !== 'normal' ? DELIVERY_PRESETS.find(p => p.key === cueDelivery)!.label : '';
        const speedLabel = cueSpeed !== 'normal' ? SPEED_PRESETS.find(p => p.key === cueSpeed)!.label : '';
        const emotionLabel = cueEmotion !== '' ? EMOTION_PRESETS.find(p => p.key === cueEmotion)!.label : '';
        const promptPart = !emotionLabel && cuePrompt ? cuePrompt : '';
        const parts = [deliveryLabel, speedLabel, emotionLabel || promptPart].filter(Boolean);
        const inner = parts.join(' · ');
        setBlocks(prev => prev.map(b => b.id !== block.id ? b : {
          ...b,
          cueLabel: inner ? `[${inner}]` : '[cue]',
        }));
        return;
      }
      // voice tool — can reassign stage blocks; only skip structural perf-cue markers
      if (block.type === 'perf-cue') return;
      if (!selectedCastId) return;
      const member = selectedCastId === 'narrator'
        ? NARRATOR_MEMBER
        : [...CAST_ROSTER, ...tempMembers].find(m => m.id === selectedCastId);
      if (!member) return;
      setBlocks(prev => prev.map(b => b.id !== block.id ? b : {
        ...b,
        type: 'speech' as Block['type'],
        renderable: true,
        voice: member.paint,
        painterId: member.id,
        variation: variation === 'natural' ? undefined : variation,
      }));
    } else if (mode === 'booth' && block.renderable) {
      const idx = RENDERABLE_IDS.indexOf(block.id);
      if (idx >= 0) { setBoothIdx(idx); setBoothActive(true); }
    } else if (mode === 'revise' && block.renderable) {
      setRevisingId(block.id);
      setRevisingText(block.text);
    }
  };

  const handleReviseConfirm = () => {
    if (!revisingId) return;
    setBlocks(prev => prev.map(b => b.id !== revisingId ? b : { ...b, text: revisingText }));
    setRevisingId(null);
  };

  const handleCueClick = (blockId: string) => openCueFor(blockId);

  const handleCueApply = () => {
    if (!cueTarget) return;
    const label = [
      cueRate !== 'normal' || cuePitch !== 'normal' ? `${cueRate} · ${cuePitch}` : '',
      cuePrompt || cueDesc ? `${cuePrompt}${cueDesc ? ` | ${cueDesc}` : ''}` : '',
    ].filter(Boolean).join(' · ');
    setBlocks(prev => prev.map(b => b.id !== cueTarget ? b : { ...b, cueLabel: label ? `[${label}]` : '[cue]' }));
    setCueOpen(false);
  };

  // Opens the cue editor for any block (used by the Cue sub-tool and inline cue chips).
  const openCueFor = (blockId: string) => {
    const b = blocks.find(x => x.id === blockId);
    if (!b) return;
    const m = (b.cueLabel ?? '').match(/\[([^\]]*)\]/);
    if (m) {
      const parts = m[1].split(' · ');
      const rateP = parts.find(p => ['slow', 'normal', 'fast'].includes(p));
      const pitchP = parts.find(p => ['low', 'normal', 'high'].includes(p));
      setCueRate(rateP ?? 'normal');
      setCuePitch(pitchP ?? 'normal');
      const rest = m[1].split('|');
      setCuePrompt(rest[0]?.replace(/slow|normal|fast|low|high|·/g, '').trim() ?? '');
      setCueDesc(rest[1]?.trim() ?? '');
    } else {
      setCueRate('normal'); setCuePitch('normal'); setCuePrompt(''); setCueDesc('');
    }
    setCueTarget(blockId);
    setCueOpen(true);
  };

  // ── Painting state (voice tool) ───────────────────────────────────────────
  const isPainting = mode === 'cast' && castTool === 'voice' && !!selectedCastId;
  const paintMember = isPainting
    ? (selectedCastId === 'narrator' ? NARRATOR_MEMBER : [...CAST_ROSTER, ...tempMembers].find(m => m.id === selectedCastId) ?? null)
    : null;
  const brushLabel = brush === 'paragraph' ? 'paragraph' : brush === 'word' ? 'word' : 'sentence';
  const hoveredSet = (() => {
    if (!hoveredBlockId || !isPainting) return new Set<string>();
    if (brush === 'paragraph') {
      const hb = blocks.find(b => b.id === hoveredBlockId);
      if (hb?.para != null) return new Set(blocks.filter(b => b.para === hb.para && b.type !== 'perf-cue').map(b => b.id));
    }
    return new Set([hoveredBlockId]);
  })();
  const paintHover = (blockId: string): React.CSSProperties =>
    hoveredSet.has(blockId) && paintMember
      ? { outline: `2px solid ${paintMember.dot}`, outlineOffset: 2, borderRadius: 3 }
      : {};
  const hoverHandlers = (block: Block) => isPainting && block.type !== 'perf-cue'
    ? { onMouseEnter: () => setHoveredBlockId(block.id), onMouseLeave: () => setHoveredBlockId(null) }
    : {};

  // ── Block rendering ────────────────────────────────────────────────────────

  // Shared in-place edit affordance (used by both views)
  const reviseEditor = (
    <>
      <textarea
        autoFocus
        value={revisingText}
        onChange={e => setRevisingText(e.target.value)}
        rows={3}
        style={{
          width: '100%', fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: 16, lineHeight: 1.7,
          background: 'var(--surface)', border: '1px solid var(--action-primary)',
          borderRadius: 6, padding: '6px 9px', color: 'var(--text-primary)',
          resize: 'vertical', outline: 'none', fontStyle: 'normal',
        }}
      />
      <div style={{ display: 'flex', gap: 5, marginTop: 5 }}>
        <button onClick={handleReviseConfirm} style={{
          padding: '5px 12px', borderRadius: 'var(--radius-button)',
          border: '1px solid var(--action-primary)', background: 'var(--action-primary)',
          color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
        }}>Save</button>
        <button onClick={() => setRevisingId(null)} style={{
          padding: '5px 12px', borderRadius: 'var(--radius-button)',
          border: '1px solid var(--border)', background: 'var(--surface-alt)',
          color: 'var(--text-primary)', fontSize: 12, cursor: 'pointer', fontFamily: 'inherit',
        }}>Cancel</button>
      </div>
    </>
  );

  const blockCursor = (block: Block): React.CSSProperties['cursor'] => {
    if (mode === 'booth') return block.renderable ? 'pointer' : 'default';
    if (mode === 'revise') return block.renderable ? 'text' : 'default';
    if (mode === 'cast') {
      if (block.type === 'perf-cue') return 'default';
      if (castTool === 'select') return 'pointer';
      if (castTool === 'stage') return 'crosshair';
      if (castTool === 'cue') return block.renderable ? 'crosshair' : 'default';
      if (castTool === 'voice') return (block.renderable || block.type === 'stage') && !!selectedCastId ? 'crosshair' : 'default';
    }
    return 'default';
  };

  // ── Script view — Hollywood / US screenplay format ────────────────────────
  //   Column positions scaled from standard 8.5"×11" spec (Courier 12pt):
  //     Action:        0 px (full width)   ← left margin — plain text, NOT italic
  //     Dialogue:     68 px (~17%)         ← 2.5" equiv, max-width ~300px
  //     Parenthetical: 107 px (~27%)       ← 3.1" equiv, indented inside dialogue
  //     Character:    148 px (~37%)        ← 3.7" equiv, all-caps bold + speaker color
  const renderScriptRow = (block: Block, blockIdx: number): React.ReactNode => {
    const renderableIdx = RENDERABLE_IDS.indexOf(block.id);
    const isBoothActive = mode === 'booth' && block.renderable && renderableIdx === boothIdx && boothActive;
    const isBoothPlayed = mode === 'booth' && block.renderable && renderableIdx < boothIdx && boothActive;
    const isRevising = revisingId === block.id;

    // Suppress perf-cues that immediately precede a speech block — they become parentheticals there.
    const nextBlock = blockIdx < blocks.length - 1 ? blocks[blockIdx + 1] : null;
    if (block.type === 'perf-cue' && nextBlock?.type === 'speech') return null;

    const handleClick = () => handleBlockClick(block);

    // ACTION LINE — plain serif, full width, NOT italic (Hollywood rule)
    if (block.type === 'stage') {
      return (
        <div key={block.id} style={{ margin: '0 0 16px' }}>
          <span onClick={handleClick} {...hoverHandlers(block)} style={{
            fontFamily: bodyFont, fontSize: Math.max(12, bodySize - 1),
            color: 'var(--text-secondary)', lineHeight: 1.65,
            cursor: blockCursor(block), ...paintHover(block.id),
          }}>{block.text}</span>
        </div>
      );
    }

    // STANDALONE PERF-CUE — indented to parenthetical column
    if (block.type === 'perf-cue') {
      const cueText = block.cueLabel?.replace(/^\[|\]$/g, '') ?? 'cue';
      return (
        <div key={block.id} style={{ paddingLeft: 107, marginBottom: 4 }}>
          <span
            onClick={() => handleCueClick(block.id)}
            style={{ fontFamily: 'var(--font-sans, system-ui)', fontSize: 13, fontStyle: 'italic', color: 'var(--action-primary)', cursor: 'pointer' }}
          >({cueText})</span>
        </div>
      );
    }

    // UNASSIGNED — at dialogue column, no character header
    if (block.type === 'unassigned') {
      return (
        <div key={block.id} style={{ paddingLeft: 68, marginBottom: 18, opacity: isBoothPlayed ? 0.38 : 1 }}>
          <span onClick={handleClick} {...hoverHandlers(block)} style={{
            fontFamily: bodyFont, fontSize: bodySize, lineHeight: 1.75,
            color: 'var(--text-secondary)', cursor: blockCursor(block), display: 'block',
            ...(isBoothActive ? { background: 'var(--accent-tint-bg)', borderRadius: 3, boxShadow: '0 0 0 3px var(--accent-tint-bg)' } : {}),
            ...paintHover(block.id),
          }}>{block.text}</span>
        </div>
      );
    }

    // SPEECH — three-row couplet at Hollywood column positions
    const vc = resolveBlockStyle(block);
    const prevBlock = blockIdx > 0 ? blocks[blockIdx - 1] : null;
    const prevPerfCue = prevBlock?.type === 'perf-cue' ? prevBlock : null;
    const continues = !prevPerfCue && prevBlock?.type === 'speech' && prevBlock.voice === block.voice && prevBlock.painterId === block.painterId;

    let parenthetical: string | null = null;
    if (prevPerfCue) {
      parenthetical = prevPerfCue.cueLabel?.replace(/^\[|\]$/g, '') ?? null;
    } else if (block.cueLabel) {
      parenthetical = block.cueLabel.replace(/^\[|\]$/g, '');
    } else if (!continues) {
      parenthetical = variationLabelFor(block.voice, block.variation, block.painterId);
    }

    return (
      <div key={block.id} style={{
        marginBottom: 18, opacity: isBoothPlayed ? 0.38 : 1,
        borderLeft: vc ? `3px solid ${vc.dot}` : '3px solid transparent',
        paddingLeft: 6,
      }}>
        {/* CHARACTER — centered, ALL CAPS, bold, speaker color */}
        {!continues && vc && (
          <div style={{
            textAlign: 'center',
            fontFamily: 'var(--font-sans, system-ui)', marginBottom: 0,
            fontSize: 13, fontWeight: 700, letterSpacing: '.10em', textTransform: 'uppercase',
            color: vc.textColor,
          }}>{vc.label}</div>
        )}

        {/* PARENTHETICAL — centered, italic, lowercase; clickable when a perf-cue backs it */}
        {parenthetical && (
          <div
            onClick={prevPerfCue ? () => handleCueClick(prevPerfCue.id) : undefined}
            style={{
              textAlign: 'center',
              fontFamily: 'var(--font-sans, system-ui)', fontSize: 12.5, fontStyle: 'italic',
              color: 'var(--text-muted)', marginBottom: 1,
              cursor: prevPerfCue ? 'pointer' : 'default',
            }}
          >({parenthetical.toLowerCase()})</div>
        )}

        {/* DIALOGUE — at 2.5" column, left-aligned, runs to right margin */}
        <div style={{ paddingLeft: 68 }}>
          {isRevising ? reviseEditor : (
            <span onClick={handleClick} {...hoverHandlers(block)} style={{
              fontFamily: bodyFont, fontSize: bodySize, lineHeight: 1.75,
              color: 'var(--text-primary)', display: 'block',
              fontStyle: cueEmphasis(block.cueLabel).isItalic ? 'italic' : 'normal',
              fontWeight: cueEmphasis(block.cueLabel).isBold ? 600 : 400,
              letterSpacing: cueEmphasis(block.cueLabel).letterSpacing,
              cursor: blockCursor(block),
              ...(isBoothActive ? { background: 'var(--accent-tint-bg)', borderRadius: 3, boxShadow: '0 0 0 3px var(--accent-tint-bg)' } : {}),
              ...paintHover(block.id),
            }}>{block.text}</span>
          )}
        </div>
      </div>
    );
  };

  // ── Stage play view ────────────────────────────────────────────────────────
  //   CHARACTER:  (parenthetical) dialogue text
  //   Stage directions: italic, full width
  //   Based on BBC/stage-play manuscript format: bold-left name + colon,
  //   parenthetical inline on the same line, single-spaced.
  const renderPlayRow = (block: Block, blockIdx: number): React.ReactNode => {
    const renderableIdx = RENDERABLE_IDS.indexOf(block.id);
    const isBoothActive = mode === 'booth' && block.renderable && renderableIdx === boothIdx && boothActive;
    const isBoothPlayed = mode === 'booth' && block.renderable && renderableIdx < boothIdx && boothActive;
    const isRevising = revisingId === block.id;

    // Suppress perf-cues followed by speech — folded in as inline parenthetical
    const nextBlock = blockIdx < blocks.length - 1 ? blocks[blockIdx + 1] : null;
    if (block.type === 'perf-cue' && nextBlock?.type === 'speech') return null;

    const handleClick = () => handleBlockClick(block);

    // STAGE DIRECTION — full-width italic
    if (block.type === 'stage') {
      return (
        <div key={block.id} style={{ fontStyle: 'italic', fontSize: 14, lineHeight: 1.6, color: 'var(--text-secondary)', margin: '0 0 12px' }}>
          <span onClick={handleClick} {...hoverHandlers(block)} style={{ cursor: blockCursor(block), ...paintHover(block.id) }}>{block.text}</span>
        </div>
      );
    }

    // STANDALONE PERF-CUE
    if (block.type === 'perf-cue') {
      const cueText = block.cueLabel?.replace(/^\[|\]$/g, '') ?? 'cue';
      return (
        <div key={block.id} style={{ fontStyle: 'italic', fontSize: 13, color: 'var(--text-muted)', margin: '0 0 8px', paddingLeft: 88 }}>
          <span onClick={() => handleCueClick(block.id)} style={{ cursor: 'pointer' }}>({cueText})</span>
        </div>
      );
    }

    // UNASSIGNED — no character name, indented to dialogue column
    if (block.type === 'unassigned') {
      return (
        <div key={block.id} style={{ paddingLeft: 88, marginBottom: 10, fontSize: bodySize, lineHeight: 1.7, color: 'var(--text-secondary)', fontFamily: bodyFont, opacity: isBoothPlayed ? 0.38 : 1 }}>
          <span onClick={handleClick} {...hoverHandlers(block)} style={{ cursor: blockCursor(block), ...paintHover(block.id), ...(isBoothActive ? { background: 'var(--accent-tint-bg)', borderRadius: 3 } : {}) }}>
            {block.text}
          </span>
        </div>
      );
    }

    // SPEECH — 2-column grid: name col | dialogue col
    const vc = resolveBlockStyle(block);
    const prevBlock = blockIdx > 0 ? blocks[blockIdx - 1] : null;
    const prevPerfCue = prevBlock?.type === 'perf-cue' ? prevBlock : null;
    const continues = !prevPerfCue && prevBlock?.type === 'speech' && prevBlock.voice === block.voice && prevBlock.painterId === block.painterId;

    // Perf-cue → inline directorial parenthetical; performance variation → a text
    // label UNDER the speaker name (keeps the speaker color bar one-per-character).
    const perfCueLabel = prevPerfCue
      ? (prevPerfCue.cueLabel?.replace(/^\[|\]$/g, '') ?? null)
      : (block.cueLabel?.replace(/^\[|\]$/g, '') ?? null);
    const variationLabel = !continues ? variationLabelFor(block.voice, block.variation, block.painterId) : null;

    return (
      <div key={block.id} style={{ display: 'grid', gridTemplateColumns: '90px 1fr', columnGap: 8, marginBottom: 10, opacity: isBoothPlayed ? 0.38 : 1, alignItems: 'baseline', borderLeft: vc ? `3px solid ${vc.dot}` : '3px solid transparent', paddingLeft: 6 }}>
        {/* CHARACTER: + variation beneath */}
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'flex-end',
          textAlign: 'right', paddingRight: 4,
          fontFamily: 'var(--font-sans, system-ui)',
        }}>
          {!continues && vc && (
            <span style={{ fontSize: 13.5, fontWeight: 700, letterSpacing: '.03em', color: vc.textColor, whiteSpace: 'nowrap' }}>
              {vc.label.toUpperCase()}:
            </span>
          )}
          {variationLabel && (
            <span style={{ fontSize: 10.5, fontWeight: 400, fontStyle: 'italic', color: 'var(--text-muted)', whiteSpace: 'nowrap', lineHeight: 1.5 }}>
              {variationLabel}
            </span>
          )}
        </div>

        {/* (cue) dialogue */}
        <div>
          {isRevising ? reviseEditor : (
            <span onClick={handleClick} {...hoverHandlers(block)} style={{
              fontFamily: bodyFont, fontSize: bodySize, lineHeight: 1.7,
              color: 'var(--text-primary)',
              fontStyle: cueEmphasis(block.cueLabel).isItalic ? 'italic' : 'normal',
              fontWeight: cueEmphasis(block.cueLabel).isBold ? 600 : 400,
              letterSpacing: cueEmphasis(block.cueLabel).letterSpacing,
              cursor: blockCursor(block),
              ...(isBoothActive ? { background: 'var(--accent-tint-bg)', borderRadius: 3, boxShadow: '0 0 0 3px var(--accent-tint-bg)' } : {}),
              ...paintHover(block.id),
            }}>
              {perfCueLabel && (
                <em style={{ color: 'var(--text-muted)', fontStyle: 'italic', fontWeight: 400, marginRight: 7 }}>({perfCueLabel})</em>
              )}
              {block.text}
            </span>
          )}
        </div>
      </div>
    );
  };

  // ── Book view — flowing prose in the author's paragraphs ──────────────────
  // Renderable segments are inline; an assignment shows as an underline in the
  // speaker's colour (the live-site convention). Segments sharing a paragraph
  // flow as continuous text. Stage directions / cues sit between paragraphs.

  const renderInlineSegment = (block: Block, isLast: boolean) => {
    const renderableIdx = RENDERABLE_IDS.indexOf(block.id);
    const isBoothActive = mode === 'booth' && boothActive && renderableIdx === boothIdx;
    const isBoothPlayed = mode === 'booth' && boothActive && renderableIdx < boothIdx;
    const v = resolveBlockStyle(block);
    const { isItalic, isBold, letterSpacing } = cueEmphasis(block.cueLabel);

    if (revisingId === block.id) {
      return <span key={block.id} style={{ display: 'block', margin: '6px 0' }}>{reviseEditor}</span>;
    }

    const segStyle: React.CSSProperties = {
      cursor: blockCursor(block),
      color: block.type === 'unassigned' ? 'var(--text-secondary)' : 'var(--text-primary)',
      borderBottom: v ? `2px solid ${v.dot}` : (block.type === 'unassigned' ? '2px dotted var(--text-muted)' : 'none'),
      paddingBottom: 2,
      fontStyle: isItalic ? 'italic' : 'normal',
      fontWeight: isBold ? 600 : 400,
      letterSpacing,
      opacity: isBoothPlayed ? 0.4 : 1,
      background: isBoothActive ? 'var(--accent-tint-bg)' : 'transparent',
      borderRadius: isBoothActive ? 3 : undefined,
      boxShadow: isBoothActive ? '0 0 0 3px var(--accent-tint-bg)' : undefined,
      transition: 'background .12s',
    };

    return (
      <React.Fragment key={block.id}>
        <span onClick={() => handleBlockClick(block)} {...hoverHandlers(block)} style={{ ...segStyle, cursor: blockCursor(block), ...paintHover(block.id) }}>{block.text}</span>
        {!isLast && ' '}
      </React.Fragment>
    );
  };

  const renderAnnotation = (block: Block) => {
    if (block.type === 'stage') {
      return (
        <div key={block.id} style={{ fontFamily: 'var(--font-mono, monospace)', fontSize: 12.5, color: 'var(--text-muted)', fontStyle: 'italic', margin: '0 0 0.9em' }}>
          <span onClick={() => handleBlockClick(block)} {...hoverHandlers(block)} style={{ cursor: blockCursor(block), ...paintHover(block.id) }}>{block.text}</span>
        </div>
      );
    }
    // perf-cue
    return (
      <div key={block.id} style={{ margin: '-0.4em 0 0.7em' }}>
        <span
          onClick={() => handleCueClick(block.id)}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, cursor: 'pointer',
            fontFamily: 'var(--font-mono, monospace)', fontSize: 12, color: 'var(--action-primary)',
            background: 'var(--accent-tint-bg)', border: '1px solid var(--accent-tint-border)',
            borderRadius: 4, padding: '2px 8px',
          }}
        >
          <Zap size={11} aria-hidden="true" />
          {block.cueLabel ?? '[cue]'}
        </span>
      </div>
    );
  };

  const renderBookView = () => {
    const out: React.ReactNode[] = [];
    let i = 0;
    while (i < blocks.length) {
      const b = blocks[i];
      if (b.type === 'stage' || b.type === 'perf-cue') {
        out.push(renderAnnotation(b));
        i++;
        continue;
      }
      // Gather consecutive renderable segments sharing this paragraph.
      const para = b.para;
      const group: Block[] = [];
      while (i < blocks.length && blocks[i].type !== 'stage' && blocks[i].type !== 'perf-cue' && blocks[i].para === para) {
        group.push(blocks[i]);
        i++;
      }
      out.push(
        <p key={`para-${para ?? 'x'}-${group[0].id}`} style={{
          fontFamily: bodyFont, fontSize: bodySize, lineHeight: 1.85,
          color: 'var(--text-primary)', margin: '0 0 1.05em',
        }}>
          {group.map((g, gi) => renderInlineSegment(g, gi === group.length - 1))}
        </p>
      );
    }
    return out;
  };

  // ── Rail palettes ──────────────────────────────────────────────────────────

  const brushBtnStyle = (active: boolean): React.CSSProperties => ({
    flex: 1, background: active ? 'var(--surface)' : 'none',
    border: 'none', borderRadius: 4, color: active ? 'var(--text-primary)' : 'var(--text-muted)',
    cursor: 'pointer', padding: '4px 5px', fontSize: 11, fontWeight: 500,
    transition: 'all .1s', fontFamily: 'inherit',
  });

  // Segment counts per paint-voice, derived from current blocks (live as you paint).
  const segCountFor = (paint: 'marcus' | 'eleanor' | 'narrator') =>
    blocks.filter(b => b.type === 'speech' && b.voice === paint).length;

  const selectCast = (m: CastMember) => {
    if (selectedCastId === m.id) { setSelectedCastId(''); return; }
    setSelectedCastId(m.id);
  };

  const handleAddTemp = () => {
    const n = tempMembers.length + 1;
    setTempMembers(prev => [...prev, {
      id: `temp-${n}`, name: `Ch 1 · Character ${n}`, voiceName: 'Unassigned', paint: 'narrator', tier: 'temp',
      dot: 'var(--text-muted)', tintBg: 'var(--surface-alt)', tintBorder: 'var(--border)', text: 'var(--text-secondary)',
      variations: DEFAULT_VARIATIONS,
    }]);
  };

  const chapterCast = CAST_ROSTER.filter(m => m.tier === 'chapter');
  const elseCast = CAST_ROSTER.filter(m => m.tier === 'else');

  const applyDelivery = (d: CueDelivery) => {
    setCueDelivery(d);
    setCuePitch(DELIVERY_PRESETS.find(x => x.key === d)!.pitch);
  };
  const applySpeed = (s: CueSpeed) => {
    setCueSpeed(s);
    setCueRate(SPEED_PRESETS.find(x => x.key === s)!.rate);
  };
  const applyEmotion = (e: CueEmotion) => {
    setCueEmotion(e);
    setCuePrompt(EMOTION_PRESETS.find(x => x.key === e)!.prompt);
  };

  // Voice-collision detection: which characters share a voice. Surfaced as a ⚠
  // flag (not color) so two characters on one voice read as a conflict, while
  // each character keeps its own single color bar.
  const voiceToNames = new Map<string, string[]>();
  [NARRATOR_MEMBER, ...CAST_ROSTER, ...tempMembers].forEach(m => {
    if (!m.voiceName || m.voiceName === 'Unassigned') return;
    voiceToNames.set(m.voiceName, [...(voiceToNames.get(m.voiceName) ?? []), m.name]);
  });
  const conflictsFor = (m: CastMember): string[] | null => {
    const others = (voiceToNames.get(m.voiceName) ?? []).filter(n => n !== m.name);
    return others.length ? others : null;
  };

  const armedMember = selectedCastId === 'narrator'
    ? NARRATOR_MEMBER
    : [...CAST_ROSTER, ...tempMembers].find(m => m.id === selectedCastId) ?? null;

  const castRowProps = (m: CastMember) => ({
    member: m,
    selected: selectedCastId === m.id,
    activeVariation: variation,
    conflictWith: conflictsFor(m),
    onSelect: () => selectCast(m),
    onVariation: setVariation,
  });

  const castPalette = () => {
    // ── Select tool: segment inspector ────────────────────────────────────────
    const seg = selectedSegId ? blocks.find(b => b.id === selectedSegId) ?? null : null;
    // Prefer painterId for the member lookup so Maren's inspector shows Maren,
    // not Eleanor (they share the 'eleanor' voice slot).
    const segMember = seg?.type === 'speech'
      ? (
          seg.painterId
            ? (seg.painterId === 'narrator' ? NARRATOR_MEMBER : CAST_ROSTER.find(m => m.id === seg.painterId) ?? null)
            : seg.voice === 'narrator' ? NARRATOR_MEMBER
              : chapterCast.find(m => m.paint === seg.voice) ?? null
        )
      : null;
    // Resolve cue label: check seg's own cueLabel OR a preceding perf-cue block
    const segIdx = seg ? blocks.findIndex(b => b.id === seg.id) : -1;
    const prevCueBlock = segIdx > 0 ? blocks[segIdx - 1] : null;
    const linkedCue = prevCueBlock?.type === 'perf-cue' ? prevCueBlock : null;
    const cueLabelDisplay = seg?.cueLabel || linkedCue?.cueLabel;
    const cueEditId = seg?.cueLabel ? seg.id : (linkedCue?.id ?? seg?.id);

    // All cast members available for reassignment
    const allCastForReassign = [NARRATOR_MEMBER, ...CAST_ROSTER, ...tempMembers];

    const selectPanel = seg ? (
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        {seg.type === 'stage' ? (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 9px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 6 }}>
              <CircleSlash size={13} style={{ color: 'var(--text-muted)', flexShrink: 0 }} aria-hidden="true" />
              <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Stage Direction</span>
            </div>
            <textarea
              value={seg.text}
              onChange={e => setBlocks(prev => prev.map(b => b.id !== seg.id ? b : { ...b, text: e.target.value }))}
              rows={3}
              style={{
                width: '100%', padding: '6px 8px', boxSizing: 'border-box',
                background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 5,
                fontSize: 12.5, fontFamily: 'var(--font-serif, Georgia, serif)', fontStyle: 'italic',
                color: 'var(--text-secondary)', lineHeight: 1.6, resize: 'vertical', outline: 'none',
              }}
            />
            <button onClick={() => setBlocks(prev => prev.map(b => b.id !== seg.id ? b : { ...b, type: 'unassigned', renderable: true }))} style={{ padding: '5px 10px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--surface-alt)', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit' }}>
              Remove stage direction
            </button>
          </>
        ) : (
          <>
            {/* Speaker — reuse CastRow so the UX matches the Voice panel */}
            {segMember ? (
              <div>
                <CastRow
                  member={segMember}
                  selected
                  activeVariation={(seg.variation ?? 'natural') as Variation}
                  conflictWith={conflictsFor(segMember)}
                  onSelect={() => setReassignOpen(v => !v)}
                  onVariation={v => setBlocks(prev => prev.map(b => b.id !== seg.id ? b : { ...b, variation: v === 'natural' ? undefined : v }))}
                />
                {/* Reassign inline picker */}
                <button
                  onClick={() => setReassignOpen(v => !v)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%', padding: '4px 8px', border: 'none', background: 'transparent', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', marginTop: 2 }}
                >
                  <ChevronDown size={11} style={{ transform: reassignOpen ? 'rotate(180deg)' : 'none', transition: 'transform .12s' }} aria-hidden="true" />
                  Change speaker
                </button>
                {reassignOpen && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, padding: '6px 0' }}>
                    {allCastForReassign.map(m => {
                      const isOn = seg.painterId ? m.id === seg.painterId : m.paint === seg.voice && m.tier !== 'else';
                      return (
                        <button
                          key={m.id}
                          onClick={() => {
                            setBlocks(prev => prev.map(b => b.id !== seg.id ? b : { ...b, type: 'speech', voice: m.paint, painterId: m.id, variation: undefined }));
                            setReassignOpen(false);
                          }}
                          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 9px', border: `1px solid ${isOn ? m.tintBorder : 'var(--border)'}`, borderRadius: 5, background: isOn ? m.tintBg : 'var(--surface-alt)', color: isOn ? m.text : 'var(--text-secondary)', cursor: 'pointer', fontSize: 11, fontWeight: isOn ? 600 : 400, fontFamily: 'inherit' }}
                        >
                          <span style={{ width: 6, height: 6, borderRadius: '50%', background: m.dot, flexShrink: 0 }} />
                          {m.name}
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            ) : seg.type === 'unassigned' ? (
              <div style={{ fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', padding: '4px 2px' }}>
                No speaker assigned. Use the Voice tool to paint one.
              </div>
            ) : null}
            {/* Performance cue */}
            <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: 8 }}>
              <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 5 }}>Performance Cue</div>
              {cueLabelDisplay ? (
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ flex: 1, fontFamily: 'var(--font-mono, monospace)', fontSize: 11, color: 'var(--action-primary)', background: 'var(--accent-tint-bg)', border: '1px solid var(--accent-tint-border)', borderRadius: 4, padding: '3px 7px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{cueLabelDisplay}</span>
                  <button onClick={() => cueEditId && openCueFor(cueEditId)} style={{ padding: '3px 8px', borderRadius: 4, border: '1px solid var(--border)', background: 'var(--surface-alt)', color: 'var(--text-secondary)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', flexShrink: 0 }}>Edit</button>
                </div>
              ) : (
                <button onClick={() => seg && openCueFor(seg.id)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 9px', borderRadius: 5, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', fontStyle: 'italic' }}>
                  <Zap size={11} aria-hidden="true" /> Add performance cue
                </button>
              )}
            </div>
            {/* Clear */}
            {seg.type === 'speech' && (
              <button onClick={() => { setBlocks(prev => prev.map(b => b.id !== seg.id ? b : { ...b, type: 'unassigned', voice: undefined, painterId: undefined, variation: undefined, cueLabel: undefined })); setSelectedSegId(null); setReassignOpen(false); }} style={{ padding: '6px', borderRadius: 5, border: '1px solid var(--border)', background: 'var(--surface-alt)', color: 'var(--text-muted)', fontSize: 11, cursor: 'pointer', fontFamily: 'inherit', marginTop: 4 }}>
                Clear assignment
              </button>
            )}
          </>
        )}
      </div>
    ) : (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: 16, color: 'var(--text-muted)' }}>
        <MousePointer2 size={22} style={{ opacity: 0.25 }} aria-hidden="true" />
        <span style={{ fontSize: 12, textAlign: 'center', lineHeight: 1.5 }}>Click any segment to inspect it</span>
      </div>
    );

    // ── Voice tool panel ───────────────────────────────────────────────────────
    const voicePanel = (
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.07em', textTransform: 'uppercase', color: 'var(--text-muted)', padding: '6px 8px 4px' }}>Cast</div>
        <NarratorRow selected={selectedCastId === 'narrator'} voiceValue={narratorVoice} onSelect={() => selectCast(NARRATOR_MEMBER)} onVoiceChange={setNarratorVoice} />
        {(() => { const m = CAST_ROSTER.find(r => r.id === 'maren')!; return <CastRow key={m.id} segCount={0} {...castRowProps(m)} />; })()}
        <TierHeader label="In this chapter" count={chapterCast.length} />
        {chapterCast.map(m => <CastRow key={m.id} segCount={segCountFor(m.paint)} {...castRowProps(m)} />)}
        <TierHeader label="Chapter cast" count={tempMembers.length} open={tempOpen} onToggle={() => setTempOpen(o => !o)} collapsible />
        {tempOpen && (
          <>
            {tempMembers.map(m => <CastRow key={m.id} {...castRowProps(m)} />)}
            <button type="button" onClick={handleAddTemp} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5, width: 'calc(100% - 16px)', margin: '6px 8px', padding: '6px 8px', boxSizing: 'border-box', border: '1px dashed var(--border)', borderRadius: 6, background: 'transparent', color: 'var(--text-muted)', fontSize: 11, fontStyle: 'italic', cursor: 'pointer', fontFamily: 'inherit' }}>
              <Plus size={11} aria-hidden="true" /> Temp character
            </button>
          </>
        )}
        <TierHeader label="Everyone else" count={elseCast.length} open={elseOpen} onToggle={() => setElseOpen(o => !o)} collapsible warn={elseCast.filter(m => conflictsFor(m)).length} />
        {elseOpen && elseCast.map(m => <CastRow key={m.id} {...castRowProps(m)} />)}
        <div style={{ marginTop: 'auto', padding: '8px 10px', borderTop: '1px solid var(--hairline)', fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.5 }}>
          {armedMember
            ? <span style={{ color: armedMember.text, fontStyle: 'normal', fontWeight: 600 }}>painting: {armedMember.name} · {variation}</span>
            : 'choose a cast member to start painting'}
        </div>
      </div>
    );

    // ── Stage tool panel ───────────────────────────────────────────────────────
    const stagePanel = (
      <div style={{ flex: 1, padding: '14px 10px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 7 }}>
          <CircleSlash size={14} style={{ color: 'var(--text-muted)', flexShrink: 0 }} aria-hidden="true" />
          <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-primary)' }}>Stage Direction</span>
        </div>
        <p style={{ margin: 0, fontSize: 12, color: 'var(--text-secondary)', lineHeight: 1.6 }}>
          Marks a segment as <strong>non-audio</strong> — rendered visibly in the text but skipped by the voice engine.
        </p>
        <p style={{ margin: 0, fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.5 }}>
          Click any segment to assign or remove. To add new stage direction text, use Write or Revise mode.
        </p>
        <div style={{ marginTop: 'auto', paddingTop: 6, borderTop: '1px solid var(--hairline)', fontSize: 10, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 6 }}>
          <KbdKey>G</KbdKey> keyboard shortcut
        </div>
      </div>
    );

    // ── Cue tool panel ─────────────────────────────────────────────────────────
    const deliveryChip = cueDelivery !== 'normal' ? DELIVERY_PRESETS.find(p => p.key === cueDelivery)!.label : '';
    const speedChip    = cueSpeed !== 'normal' ? SPEED_PRESETS.find(p => p.key === cueSpeed)!.label : '';
    const emotionChip  = cueEmotion ? EMOTION_PRESETS.find(p => p.key === cueEmotion)!.label : '';
    const activeCuePreview = [deliveryChip, speedChip, emotionChip].filter(Boolean).join(' · ') || 'Normal';

    const presetBtn = (active: boolean): React.CSSProperties => ({
      flex: 1, padding: '4px 4px', fontSize: 11,
      background: active ? 'var(--accent-tint-bg)' : 'var(--surface-alt)',
      border: `1px solid ${active ? 'var(--accent-tint-border)' : 'var(--border)'}`,
      borderRadius: 5, color: active ? 'var(--action-primary)' : 'var(--text-secondary)',
      cursor: 'pointer', textAlign: 'center' as const,
      fontFamily: 'inherit', transition: 'all .1s', fontWeight: active ? 600 : 400,
    });

    const cuePanel = (
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 8px 8px', display: 'flex', flexDirection: 'column', gap: 10 }}>
          {/* Active cue chip */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 9px', background: 'var(--accent-tint-bg)', border: '1px solid var(--accent-tint-border)', borderRadius: 7, fontSize: 12, fontWeight: 500, color: 'var(--action-primary)' }}>
            <Zap size={12} style={{ flexShrink: 0 }} aria-hidden="true" />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeCuePreview}</span>
          </div>
          {/* Delivery (volume/projection) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Delivery</span>
            <div style={{ display: 'flex', gap: 3 }}>
              {DELIVERY_PRESETS.map(p => (
                <button key={p.key} onClick={() => applyDelivery(p.key)} style={{ ...presetBtn(cueDelivery === p.key), fontStyle: p.key === 'whisper' ? 'italic' : 'normal', fontWeight: p.key === 'loud' ? 'bold' : 'normal' }}>{p.label}</button>
              ))}
            </div>
          </div>
          {/* Speed (pacing) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Speed</span>
            <div style={{ display: 'flex', gap: 3 }}>
              {SPEED_PRESETS.map(p => (
                <button key={p.key} onClick={() => applySpeed(p.key)} style={{ ...presetBtn(cueSpeed === p.key), letterSpacing: p.key === 'slow' ? '.25em' : p.key === 'fast' ? '-.08em' : '0' }}>{p.label}</button>
              ))}
            </div>
          </div>
          {/* Emotion */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Emotion</span>
            <select
              value={cueEmotion}
              onChange={e => applyEmotion(e.target.value as CueEmotion)}
              style={{
                background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 5,
                padding: '5px 8px', fontSize: 12, color: cueEmotion ? 'var(--text-primary)' : 'var(--text-muted)',
                fontFamily: 'inherit', width: '100%', cursor: 'pointer', outline: 'none',
              }}
            >
              {EMOTION_PRESETS.map(p => (
                <option key={p.key || 'none'} value={p.key}>{p.label}</option>
              ))}
            </select>
          </div>
          {/* Divider */}
          <div style={{ height: 1, background: 'var(--hairline)' }} />
          {/* Fine-tune: custom style prompt */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            <label style={{ fontSize: 10, fontWeight: 700, color: 'var(--text-secondary)', textTransform: 'uppercase', letterSpacing: '.06em' }}>Custom prompt</label>
            <input
              value={cuePrompt}
              onChange={e => { setCuePrompt(e.target.value); setCueEmotion(''); }}
              placeholder="e.g. voice catches, breathless…"
              style={{
                background: 'var(--surface-alt)', border: '1px solid var(--border)', borderRadius: 5,
                padding: '5px 8px', fontSize: 12, color: 'var(--text-primary)', outline: 'none',
                fontFamily: 'inherit', width: '100%', boxSizing: 'border-box',
              }}
            />
          </div>
        </div>
        <div style={{ marginTop: 'auto', padding: '8px 10px', borderTop: '1px solid var(--hairline)', fontSize: 10, color: 'var(--text-muted)', fontStyle: 'italic', lineHeight: 1.5 }}>
          click speech segments to paint
        </div>
      </div>
    );

    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Sub-tool toolbar */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 2, padding: '6px 8px', borderBottom: '1px solid var(--hairline)', flexShrink: 0 }}>
          {CAST_TOOL_DEFS.map(({ id, Icon, label, title, shortcut }) => {
            const isActive = castTool === id;
            return (
              <button key={id} onClick={() => setCastTool(id)} title={title} aria-pressed={isActive} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '5px 2px', border: 'none', borderRadius: 6, background: isActive ? 'var(--surface-alt)' : 'transparent', color: isActive ? 'var(--text-primary)' : 'var(--text-muted)', cursor: 'pointer', fontSize: 9, fontWeight: isActive ? 600 : 400, fontFamily: 'inherit', transition: 'all .12s', position: 'relative' }}>
                <Icon size={14} aria-hidden="true" />
                {label}
                <span style={{ fontSize: 8, lineHeight: 1, opacity: isActive ? 0.7 : 0.45, fontFamily: 'var(--font-mono, monospace)', letterSpacing: 0 }}>{shortcut}</span>
              </button>
            );
          })}
        </div>
        {/* Shared: brush size — applies to all four cast tools */}
        <div style={{ padding: '5px 8px', borderBottom: '1px solid var(--hairline)', flexShrink: 0 }}>
          <div style={{ display: 'flex', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 6, padding: 2, gap: 1 }}>
            {([['word', CaseLower, 'Word'], ['sentence', Quote, 'Sent'], ['paragraph', Pilcrow, 'Para']] as [Brush, typeof CaseLower, string][]).map(([b, Icon, label]) => (
              <button key={b} onClick={() => setBrush(b)} style={{ ...brushBtnStyle(brush === b), display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 3 }}>
                <Icon size={11} aria-hidden="true" />
                {label}
              </button>
            ))}
          </div>
        </div>
        {castTool === 'select' && selectPanel}
        {castTool === 'voice'  && voicePanel}
        {castTool === 'stage'  && stagePanel}
        {castTool === 'cue'    && cuePanel}
      </div>
    );
  };

  const boothPalette = () => (
    <div style={{ flex: 1, overflowY: 'auto', padding: '10px 7px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <button
        type="button"
        aria-label={boothActive ? 'Pause chapter playback' : 'Play chapter 7 (follow)'}
        onClick={() => setBoothActive(v => !v)}
        style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 7, width: '100%',
          padding: 9, background: boothActive ? 'var(--surface-alt)' : 'var(--action-primary)',
          border: boothActive ? '1px solid var(--border)' : 'none',
          borderRadius: 8, color: boothActive ? 'var(--text-primary)' : '#fff',
          fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'background .12s',
          fontFamily: 'inherit',
        }}
      >
        {boothActive ? <Pause size={14} aria-hidden="true" /> : <Play size={14} aria-hidden="true" />}
        {boothActive ? 'Pause' : 'Play'}
      </button>
      <div style={{ fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.5, padding: '4px 2px' }}>
        Stage Dir (⊘) and Perf Cue (⚡) blocks are skipped by the playhead.
        <br />
        <span style={{ fontSize: 10, marginTop: 4, display: 'block' }}>
          <kbd style={{ fontSize: 10, background: 'var(--surface-alt)', border: '1px solid var(--border)', padding: '1px 4px', borderRadius: 3, fontFamily: 'monospace' }}>Space</kbd> to toggle · click a block to seek
        </span>
      </div>
    </div>
  );

  const writePalette = () => (
    <div style={{ flex: 1, overflowY: 'auto', padding: '10px 7px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '8px 9px', background: 'var(--surface)', borderRadius: 6, lineHeight: 1.55 }}>
        <strong style={{ color: 'var(--text-primary)' }}>Full source editor.</strong> Editing text invalidates voice assignments in changed paragraphs. Use Resync to re-map them after saving.
      </div>
    </div>
  );

  const revisePalette = () => (
    <div style={{ flex: 1, overflowY: 'auto', padding: '10px 7px', display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div style={{ fontSize: 12, color: 'var(--text-secondary)', padding: '8px 9px', background: 'var(--surface)', borderRadius: 6, lineHeight: 1.55 }}>
        <strong style={{ color: 'var(--text-primary)' }}>In-place edit.</strong> Click any paragraph to edit only that segment. Assignments on unchanged text are preserved.
      </div>
    </div>
  );

  const ms = MODE_STYLE[mode];

  const bodyFont  = READER_FONTS[readerFont].family;
  const bodySize  = SIZE_STOPS[readerSizeIdx];
  // Resolve the reader background to the variant matching the live theme so a choice
  // (e.g. Paper) carries across light/dark without reassignment.
  const isDark    = useIsDark();
  const bgEntry   = READER_BGS[readerBg];
  const contentBg = isDark ? bgEntry.dark : bgEntry.light;

  const toggleReaderPrefs = () => setReaderPrefsOpen(o => !o);

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden', fontFamily: 'var(--font-sans, system-ui, sans-serif)' }}>
      {/* Top bar: mode badge + view toggle + Aa */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 10, padding: '7px 14px',
        borderBottom: '1px solid var(--hairline)',
        background: 'var(--surface)', flexShrink: 0, zIndex: 10, position: 'relative',
      }}>
        <span style={{
          fontSize: 11, fontWeight: 600, letterSpacing: '.06em', textTransform: 'uppercase',
          padding: '3px 8px', border: `1px solid ${ms.border}`,
          borderRadius: 4, color: ms.color, background: ms.bg, transition: 'all .15s',
        }}>{ms.label}</span>
        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>·</span>
        <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Ch 3 — The Storm</span>
        <div style={{ flex: 1 }} />
        {/* Aa — reader preferences toggle */}
        <button onClick={toggleReaderPrefs} title="Reading preferences" style={{
          padding: '3px 9px', borderRadius: 6,
          border: readerPrefsOpen ? '1px solid var(--action-primary)' : '1px solid var(--border)',
          background: readerPrefsOpen ? 'var(--accent-tint-bg)' : 'transparent',
          color: readerPrefsOpen ? 'var(--action-primary)' : 'var(--text-muted)',
          fontSize: 12, fontWeight: 600, cursor: 'pointer',
          fontFamily: 'Georgia, serif', lineHeight: 1, transition: 'all .15s',
        }}>Aa</button>

        {/* ── Reader preferences popover ── */}
        {readerPrefsOpen && (
          <>
            {/* Backdrop */}
            <div onClick={() => setReaderPrefsOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 40 }} />
            <div style={{
              position: 'absolute', top: 'calc(100% + 8px)', right: 0, zIndex: 50,
              background: 'var(--surface)', border: '1px solid var(--border)',
              borderRadius: 14, boxShadow: '0 12px 32px rgba(0,0,0,.14)',
              padding: '18px 18px 16px', display: 'flex', flexDirection: 'column', gap: 18,
              width: 340,
            }}>

              {/* ── View ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>View</span>
                <div style={{ display: 'flex', background: 'var(--bg)', border: '1px solid var(--border)', borderRadius: 8, padding: 3, gap: 2 }}>
                  {([['book', 'Book'], ['script', 'Screenplay'], ['play', 'Stage']] as [View, string][]).map(([v, label]) => (
                    <button key={v} onClick={() => setView(v)} style={{
                      flex: 1, background: view === v ? 'var(--surface)' : 'none', border: 'none',
                      color: view === v ? 'var(--text-primary)' : 'var(--text-muted)',
                      cursor: 'pointer', padding: '5px 6px', borderRadius: 6, fontSize: 12, fontWeight: view === v ? 600 : 400,
                      transition: 'all .1s', boxShadow: view === v ? 'var(--shadow-sm)' : 'none',
                      fontFamily: 'inherit', whiteSpace: 'nowrap',
                    }}>{label}</button>
                  ))}
                </div>
              </div>

              {/* ── Font ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Font</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {(Object.entries(READER_FONTS) as [ReaderFont, typeof READER_FONTS[ReaderFont]][]).map(([key, f]) => {
                    const active = readerFont === key;
                    return (
                      <button key={key} onClick={() => setReaderFont(key)} style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                        gap: 3, padding: '10px 6px 8px', borderRadius: 9, cursor: 'pointer',
                        border: active ? '2px solid var(--action-primary)' : '1.5px solid var(--border)',
                        background: active ? 'var(--accent-tint-bg)' : 'var(--bg)',
                        boxShadow: active ? '0 0 0 1px var(--action-primary)' : 'none',
                        transition: 'all .12s',
                      }}>
                        <span style={{ fontFamily: f.family, fontSize: 22, lineHeight: 1, color: active ? 'var(--action-primary)' : 'var(--text-primary)', fontWeight: 400 }}>Aa</span>
                        <span style={{ fontSize: 10, fontWeight: 600, color: active ? 'var(--action-primary)' : 'var(--text-secondary)', fontFamily: 'var(--font-sans, system-ui)' }}>{f.label}</span>
                        {f.tag && <span style={{ fontSize: 9, color: active ? 'var(--action-primary)' : 'var(--text-muted)', fontFamily: 'var(--font-sans, system-ui)', letterSpacing: '.04em' }}>{f.tag}</span>}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* ── Size ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                  <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Size</span>
                  <span style={{ fontSize: 11, color: 'var(--text-secondary)', fontFamily: 'var(--font-sans, system-ui)' }}>{SIZE_STOPS[readerSizeIdx]}px</span>
                </div>
                {/* Finder-style size slider — reused from the library cover-size control */}
                <div className="ns-size-control" role="group" aria-label="Text size" style={{ display: 'flex', gap: 10 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-muted)', fontFamily: bodyFont, lineHeight: 1, userSelect: 'none', flexShrink: 0, alignSelf: 'center' }}>A</span>
                  <div className="ns-size-slider-wrap" style={{ flex: 1, width: 'auto' }}>
                    <div className="ns-size-track" aria-hidden="true" />
                    {SIZE_STOPS.map((_, i) => (
                      <span
                        key={i}
                        className="ns-size-tick"
                        aria-hidden="true"
                        style={{ left: `calc(7px + ${i / (SIZE_STOPS.length - 1)} * (100% - 14px))` }}
                      />
                    ))}
                    <input
                      type="range"
                      className="ns-size-slider"
                      min={0}
                      max={SIZE_STOPS.length - 1}
                      step={1}
                      value={readerSizeIdx}
                      onChange={e => setReaderSizeIdx(Number(e.target.value))}
                      aria-label="Text size"
                      title="Text size"
                    />
                  </div>
                  <span style={{ fontSize: 19, color: 'var(--text-muted)', fontFamily: bodyFont, lineHeight: 1, userSelect: 'none', flexShrink: 0, alignSelf: 'center' }}>A</span>
                </div>
              </div>

              {/* ── Background ── */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
                <span style={{ fontSize: 10, fontWeight: 700, letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>Background</span>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
                  {(Object.entries(READER_BGS) as [ReaderBg, typeof READER_BGS[ReaderBg]][]).map(([key, b]) => {
                    const active = readerBg === key;
                    const v = isDark ? b.dark : b.light;
                    return (
                      <button key={key} onClick={() => setReaderBg(key)} title={b.label} style={{
                        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                        padding: '0 0 7px', borderRadius: 9, cursor: 'pointer', overflow: 'hidden',
                        border: active ? '2px solid var(--action-primary)' : '1.5px solid var(--border)',
                        boxShadow: active ? '0 0 0 1px var(--action-primary)' : 'none',
                        background: 'transparent', transition: 'all .12s',
                      }}>
                        <div style={{
                          width: '100%', height: 40, borderRadius: '7px 7px 0 0', flexShrink: 0,
                          background: v.bg,
                          backgroundImage: v.img ? `url("${v.img}")` : undefined,
                          backgroundSize: 'cover', backgroundPosition: 'center',
                        }} />
                        <span style={{ fontSize: 9.5, fontWeight: 600, color: active ? 'var(--action-primary)' : 'var(--text-muted)', fontFamily: 'var(--font-sans, system-ui)' }}>{b.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

            </div>
          </>
        )}
      </div>

      {/* Main body */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>

        {/* Content area */}
        {mode === 'write' ? (
          /* Write mode: full textarea */
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 10, padding: '22px 32px', overflow: 'hidden' }}>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
              background: 'rgba(234,179,8,.07)', border: '1px solid rgba(234,179,8,.22)',
              borderRadius: 6, fontSize: 12, color: '#d4a42a', flexShrink: 0,
            }}>
              <FileText size={12} aria-hidden="true" />
              Write mode — editing invalidates voice assignments in changed paragraphs
            </div>
            <textarea
              value={writeText}
              onChange={e => setWriteText(e.target.value)}
              style={{
                flex: 1, fontFamily: 'var(--font-serif, Georgia, serif)', fontSize: 16, lineHeight: 1.75,
                background: 'var(--surface)', border: '1px solid var(--border)',
                borderRadius: 8, padding: '18px 22px', color: 'var(--text-primary)',
                resize: 'none', outline: 'none', transition: 'border-color .12s',
                overflowY: 'auto',
              }}
            />
            <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
              <button onClick={() => setMode('cast')} style={{
                padding: '7px 15px', borderRadius: 'var(--radius-button)',
                border: '1px solid var(--border)', background: 'var(--surface-alt)',
                color: 'var(--text-primary)', fontSize: 13, cursor: 'pointer', fontFamily: 'inherit',
              }}>Cancel</button>
              <button onClick={() => setResyncOpen(true)} style={{
                padding: '7px 15px', borderRadius: 'var(--radius-button)',
                border: '1px solid var(--action-primary)', background: 'var(--action-primary)',
                color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'inherit',
              }}>Save &amp; Resync</button>
            </div>
          </div>
        ) : (
          /* Book / Script view */
          <div style={{ flex: 1, position: 'relative', overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
            {/* Floating painting indicator — fixed so it escapes overflow:hidden parents */}
            {isPainting && paintMember && (
              <div style={{ position: 'fixed', top: 54, right: 248, zIndex: 200, pointerEvents: 'none' }}>
                <div style={{
                  display: 'inline-flex', alignItems: 'center', gap: 7,
                  padding: '6px 14px', borderRadius: 999,
                  background: 'var(--surface)', border: `1.5px solid ${paintMember.dot}`,
                  boxShadow: '0 2px 10px rgba(0,0,0,.12)',
                  fontSize: 12.5, color: 'var(--text-secondary)', fontFamily: 'var(--font-sans, system-ui)',
                }}>
                  <Pencil size={12} style={{ color: paintMember.dot, flexShrink: 0 }} aria-hidden="true" />
                  <span>painting: <strong style={{ color: paintMember.text }}>{paintMember.name}</strong></span>
                  <span style={{ color: 'var(--text-muted)' }}>— click {brushLabel}s to assign</span>
                </div>
              </div>
            )}
            <div style={{ flex: 1, overflowY: 'auto', padding: '28px 32px 56px',
              background: contentBg.bg,
              backgroundImage: contentBg.img ? `url("${contentBg.img}")` : undefined,
              backgroundSize: contentBg.img ? 'cover' : undefined,
              backgroundPosition: 'center',
              transition: 'background-color .25s' }}>
              <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column' }}>
                {view === 'script'
                  ? blocks.map((block, i) => renderScriptRow(block, i))
                  : view === 'play'
                  ? blocks.map((block, i) => renderPlayRow(block, i))
                  : renderBookView()}
              </div>
            </div>
          </div>
        )}

        {/* Director rail — mode icons + contextual palette, unified right panel */}
        <aside style={{
          width: 220, background: 'var(--surface)', borderLeft: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', flexShrink: 0, overflow: 'hidden',
        }}>
          {/* Mode icon grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 4, padding: '6px 8px', borderBottom: '1px solid var(--border)' }}>
            {MODE_GRID_ORDER.map(m => {
              const s = MODE_STYLE[m];
              const isActive = mode === m;
              const Icon = MODE_ICON[m];
              return (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  title={`${s.label} — ${MODE_HINT[m].split('— ')[1] ?? ''} (${s.key})`}
                  aria-label={s.label}
                  aria-pressed={isActive}
                  style={{
                    position: 'relative', width: 42, height: 42,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: isActive ? s.bg : 'var(--surface)',
                    border: `1px solid ${isActive ? s.border : 'var(--border)'}`,
                    borderRadius: 8, color: isActive ? s.color : 'var(--text-secondary)',
                    cursor: 'pointer', transition: 'all .12s', fontFamily: 'inherit',
                    boxShadow: isActive ? `inset 0 0 0 1px ${s.border}` : 'none',
                  }}
                >
                  <Icon size={18} strokeWidth={1.7} aria-hidden="true" style={{ width: 18, height: 18, flexShrink: 0, display: 'block' }} />
                  <span style={{
                    position: 'absolute', bottom: 1, right: 3,
                    fontSize: 8, fontWeight: 700, lineHeight: 1, fontFamily: 'var(--font-mono, monospace)',
                    color: isActive ? s.color : 'var(--text-muted)', opacity: 0.7,
                  }}>{s.key}</span>
                </button>
              );
            })}
          </div>
          {/* Contextual palette */}
          {mode === 'cast' && castPalette()}
          {mode === 'booth' && boothPalette()}
          {mode === 'write' && writePalette()}
          {mode === 'revise' && revisePalette()}
        </aside>
      </div>

      {/* Cue editor overlay */}
      {cueOpen && (
        <CueEditor
          rate={cueRate} pitch={cuePitch} prompt={cuePrompt} desc={cueDesc}
          onRate={setCueRate} onPitch={setCuePitch} onPrompt={setCuePrompt} onDesc={setCueDesc}
          onApply={handleCueApply}
          onCancel={() => setCueOpen(false)}
        />
      )}

      {/* Resync modal */}
      {resyncOpen && <ResyncModal onClose={() => { setResyncOpen(false); setMode('cast'); }} />}
    </div>
  );
};
