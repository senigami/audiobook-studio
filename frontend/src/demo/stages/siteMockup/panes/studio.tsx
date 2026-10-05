/**
 * siteMockup/panes/studio.tsx — Studio pane
 *
 * SUPERSEDED for mode structure (task 012, Part C): `directorsConsole.tsx` is what's actually
 * mounted in `siteMockupStage.tsx` as the demo's Chapter Workspace equivalent — this file is not
 * wired in and is historically informative rather than current (per
 * `design-docs/plans/active/north_star_screen_parity/01-map.md`'s source-of-truth resolution).
 * However, several designs prototyped here were NOT dead ends — they were separately ported into
 * the live app: the bookmark affordance/panel, the lexicon panel, and the Contents-tab-style
 * chapter dropdown live on via `ChapterWorkspaceHeader.tsx` and `BookLayout.tsx`. Read this file
 * for that prototyping history, not as a description of what the demo currently shows.
 *
 * Feature D:
 *  - Chapter-nav cluster (top-right of prose column): ← Save & prev · Save & next → + Export ▾ (WAV/MP3)
 *  - "Commit changes" green button with "2 unsaved text edits" chip → Resync Preview modal
 *  - Analysis strip under view-mode pills: stats + green badge + expandable amber ACTION REQUIRED badge
 *  - One prose sentence has hover-look inline controls (voice select chip, ▶, ↻ rebuild)
 *  - "Stop all" red ghost button next to render controls
 *  - 🔖 Named bookmark affordance + "Jump to next unrendered section" (task 012)
 */
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Row, Col, Chip, Btn, ProgressBar, SemanticChip, Card, Panel, StatusOrb, FOLLOW_DURATION_SEC, buildSegmentTimeline, useChapterFollow, ResumeFollowingPill, SPEAKER_TOKEN, CHAPTERS, CHAPTER_RENDER_PCT } from '../shared';
import type { OrbStatus } from '../shared';
import { Play, RefreshCw, ChevronDown, ChevronUp, Download, ChevronLeft, ChevronRight, Square, Check, Bookmark, SkipForward, BookMarked } from 'lucide-react';
import type { TrackState } from '../../siteMockupStage';
import { CastPanel, VOICE_VARIATIONS, INITIAL_CHARACTERS } from './castPanel';
import { addBookmark, subscribeBookmarks } from '../bookmarkStore';
import { LexiconPanel } from './lexiconPanel';

// Per-section render state for the current chapter (mock).
// Derived from CHAPTER_RENDER_PCT[3] = 60 → sections §1–§10 are rendered,
// §11–§18 are not. Keys are the chunk ids that carry showNumberTag.
const CHUNK_RENDERED: Record<string, boolean> = {
  c1:  true,   // §1
  c5:  true,   // §2
  c6:  true,   // §3
  c10: true,   // §4
  c13: true,   // §5
  c15: true,   // §6
  c17: true,   // §7
  c19: true,   // §8
  c21: true,   // §9
  c23: true,   // §10
  c25: false,  // §11
  c27: false,  // §12
  c29: false,  // §13
  c31: false,  // §14
  c33: false,  // §15
  c35: false,  // §16
  c37: false,  // §17
  c39: false,  // §18
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

// ---------- Resync Preview modal ----------
const ResyncModal: React.FC<{ onClose: () => void }> = ({ onClose }) => (
  <div style={{
    position: 'fixed', inset: 0, zIndex: 200,
    background: 'var(--overlay-backdrop)',
    display: 'flex', alignItems: 'center', justifyContent: 'center',
  }}>
    <Panel style={{ padding: 'var(--space-3) var(--space-4)', width: 320, boxShadow: 'var(--shadow-xl)' }}>
      <div style={{ fontSize: 'var(--type-caption)', fontWeight: 700, color: 'var(--text-primary)', marginBottom: 'var(--space-3)' }}>
        Resync Preview
      </div>
      <Card style={{ padding: 'var(--space-2) var(--space-3)', marginBottom: 'var(--space-2)' }}>
        <div style={{ fontSize: 'var(--type-caption)', color: 'var(--text-primary)', marginBottom: 'var(--space-1)' }}>
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
        borderRadius: 'var(--radius-button)', padding: 'var(--space-1) var(--space-3)', marginBottom: 'var(--space-3)',
        fontSize: 'var(--type-micro)', color: 'var(--warning-text)', lineHeight: 'var(--leading-normal)',
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
    minWidth: 100, padding: 'var(--space-1) 0',
  }}>
    {['WAV', 'MP3'].map(fmt => (
      <button
        key={fmt}
        type="button"
        onClick={onClose}
        style={{
          width: '100%',
          border: 0,
          background: 'transparent',
          fontFamily: 'inherit',
          textAlign: 'left',
          fontSize: 'var(--type-caption)', padding: 'var(--space-1) var(--space-3)', cursor: 'pointer',
          color: 'var(--text-primary)',
          display: 'flex', alignItems: 'center', gap: 6,
        }}>
        <Download size={11} aria-hidden="true" />
        {fmt}
      </button>
    ))}
  </div>
);

// ---------- Shared dropdown menu shell (mirrors ExportMenu style) ----------
const DropdownMenu: React.FC<{
  items: string[];
  onSelect: (item: string) => void;
  onClose: () => void;
}> = ({ items, onSelect, onClose }) => (
  <div
    style={{
      position: 'absolute', top: '100%', left: 0, zIndex: 200,
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-md)',
      minWidth: 110, padding: 'var(--space-1) 0',
    }}
  >
    {items.map(item => (
      <button
        key={item}
        type="button"
        onClick={(e) => { e.stopPropagation(); onSelect(item); onClose(); }}
        style={{
          width: '100%', border: 0, background: 'transparent',
          fontFamily: 'inherit', textAlign: 'left',
          fontSize: 'var(--type-micro)', padding: 'var(--space-1) var(--space-3)',
          cursor: 'pointer', color: 'var(--text-primary)',
        }}
      >
        {item}
      </button>
    ))}
  </div>
);

// Derive sorted chapter-4 character names from the seed data for the dropdown.
// Filter to those in chapter 4 (the default active chapter in this mock).
const HOVER_CHARACTERS = INITIAL_CHARACTERS
  .filter(c => c.chapters.includes(4))
  .map(c => ({ id: c.id, name: c.name === 'Narrator (default)' ? 'Narrator' : c.name, voiceName: c.voiceName }));

// ---------- Hover sentence controls ----------
const HoverSentenceControls: React.FC<{ chunkId: string; onPlayFromHere: (id: string) => void }> = ({ chunkId, onPlayFromHere }) => {
  const [charId, setCharId] = useState('Maren');
  const [variation, setVariation] = useState('Default');
  const [charMenuOpen, setCharMenuOpen] = useState(false);
  const [varMenuOpen, setVarMenuOpen] = useState(false);

  const activeChar = HOVER_CHARACTERS.find(c => c.id === charId) ?? HOVER_CHARACTERS[0];
  const voiceVariations: string[] = VOICE_VARIATIONS[activeChar.voiceName] ?? [];
  const variationItems = ['Default', ...voiceVariations];
  const tok = SPEAKER_TOKEN[activeChar.id] ?? SPEAKER_TOKEN.Narrator;

  const handleSelectChar = (name: string) => {
    const found = HOVER_CHARACTERS.find(c => c.name === name);
    if (found) {
      setCharId(found.id);
      setVariation('Default');
    }
  };

  const chipLabel = variation === 'Default'
    ? activeChar.name
    : `${activeChar.name} · ${variation}`;

  return (
    <span
      className="hover-sentence-controls"
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', marginLeft: 'var(--space-1)',
        fontSize: 'var(--type-micro)', verticalAlign: 'middle',
        opacity: 0, visibility: 'hidden', transition: 'opacity 0.1s ease',
      }}
    >
      {/* Character dropdown */}
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        <span
          role="button"
          tabIndex={0}
          aria-label="Select character"
          onClick={(e) => { e.stopPropagation(); setCharMenuOpen(v => !v); setVarMenuOpen(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setCharMenuOpen(v => !v); setVarMenuOpen(false); } }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 2,
            background: tok.tintBg,
            border: `1px solid ${tok.tintBorder}`,
            borderRadius: 'var(--radius-round)', padding: '1px 6px', cursor: 'pointer',
            color: tok.text, fontSize: 'var(--type-micro)', whiteSpace: 'nowrap',
          }}
        >
          {chipLabel} <ChevronDown size={9} aria-hidden="true" />
        </span>
        {charMenuOpen && (
          <DropdownMenu
            items={HOVER_CHARACTERS.map(c => c.name)}
            onSelect={handleSelectChar}
            onClose={() => setCharMenuOpen(false)}
          />
        )}
      </span>

      {/* Variation dropdown */}
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        <span
          role="button"
          tabIndex={0}
          aria-label="Select variation"
          onClick={(e) => { e.stopPropagation(); setVarMenuOpen(v => !v); setCharMenuOpen(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setVarMenuOpen(v => !v); setCharMenuOpen(false); } }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 2,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-round)', padding: '1px 6px', cursor: 'pointer',
            color: 'var(--text-secondary)', fontSize: 'var(--type-micro)', whiteSpace: 'nowrap',
            opacity: voiceVariations.length === 0 ? 0.5 : 1,
          }}
        >
          {variation} <ChevronDown size={9} aria-hidden="true" />
        </span>
        {varMenuOpen && (
          <DropdownMenu
            items={variationItems}
            onSelect={(v) => setVariation(v)}
            onClose={() => setVarMenuOpen(false)}
          />
        )}
      </span>

      <button
        aria-label="Play from here"
        onClick={(e) => { e.stopPropagation(); onPlayFromHere(chunkId); }}
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--action-primary)', display: 'flex', alignItems: 'center' }}
      >
        <Play size={13} />
      </button>
      <button
        aria-label="Rebuild segment"
        style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}
      >
        <RefreshCw size={11} />
      </button>
    </span>
  );
};

// ---------- Selection-popover assign control ----------
// Self-contained Character ▾ · Variation ▾ control rendered inside the
// selection context-menu popover. Calls onAssign(charId, variation) when
// the user clicks "Assign".
const SelectionAssignControl: React.FC<{
  onAssign: (charId: string, variation: string) => void;
  onCancel: () => void;
}> = ({ onAssign, onCancel }) => {
  const [charId, setCharId] = useState('Maren');
  const [variation, setVariation] = useState('Default');
  const [charMenuOpen, setCharMenuOpen] = useState(false);
  const [varMenuOpen, setVarMenuOpen] = useState(false);

  const activeChar = HOVER_CHARACTERS.find(c => c.id === charId) ?? HOVER_CHARACTERS[0];
  const voiceVariations: string[] = VOICE_VARIATIONS[activeChar.voiceName] ?? [];
  const variationItems = ['Default', ...voiceVariations];
  const tok = SPEAKER_TOKEN[activeChar.id] ?? SPEAKER_TOKEN.Narrator;

  const handleSelectChar = (name: string) => {
    const found = HOVER_CHARACTERS.find(c => c.name === name);
    if (found) {
      setCharId(found.id);
      setVariation('Default');
    }
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexWrap: 'nowrap' }}>
      <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-secondary)', whiteSpace: 'nowrap' }}>Assign:</span>

      {/* Character dropdown */}
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        <span
          role="button"
          tabIndex={0}
          aria-label="Select character"
          onClick={(e) => { e.stopPropagation(); setCharMenuOpen(v => !v); setVarMenuOpen(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setCharMenuOpen(v => !v); setVarMenuOpen(false); } }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 2,
            background: tok.tintBg, border: `1px solid ${tok.tintBorder}`,
            borderRadius: 'var(--radius-round)', padding: '2px 6px', cursor: 'pointer',
            color: tok.text, fontSize: 'var(--type-micro)', whiteSpace: 'nowrap', fontWeight: 600,
          }}
        >
          {activeChar.name} <ChevronDown size={9} aria-hidden="true" />
        </span>
        {charMenuOpen && (
          <DropdownMenu
            items={HOVER_CHARACTERS.map(c => c.name)}
            onSelect={handleSelectChar}
            onClose={() => setCharMenuOpen(false)}
          />
        )}
      </span>

      {/* Variation dropdown */}
      <span style={{ position: 'relative', display: 'inline-flex' }}>
        <span
          role="button"
          tabIndex={0}
          aria-label="Select variation"
          onClick={(e) => { e.stopPropagation(); setVarMenuOpen(v => !v); setCharMenuOpen(false); }}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.stopPropagation(); setVarMenuOpen(v => !v); setCharMenuOpen(false); } }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 2,
            background: 'var(--surface)', border: '1px solid var(--border)',
            borderRadius: 'var(--radius-round)', padding: '2px 6px', cursor: 'pointer',
            color: 'var(--text-secondary)', fontSize: 'var(--type-micro)', whiteSpace: 'nowrap',
            opacity: voiceVariations.length === 0 ? 0.5 : 1,
          }}
        >
          {variation} <ChevronDown size={9} aria-hidden="true" />
        </span>
        {varMenuOpen && (
          <DropdownMenu
            items={variationItems}
            onSelect={(v) => setVariation(v)}
            onClose={() => setVarMenuOpen(false)}
          />
        )}
      </span>

      {/* Confirm button */}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onAssign(activeChar.id, variation); }}
        style={{
          background: tok.tintBg, border: `1px solid ${tok.tintBorder}`,
          borderRadius: 'var(--radius-button)', padding: '2px 8px',
          color: tok.text, fontSize: 'var(--type-micro)', fontWeight: 700,
          cursor: 'pointer', whiteSpace: 'nowrap',
        }}
      >
        ✓
      </button>

      {/* Dismiss */}
      <button
        type="button"
        aria-label="Dismiss"
        onClick={(e) => { e.stopPropagation(); onCancel(); }}
        style={{
          background: 'none', border: 'none', padding: '2px 4px', cursor: 'pointer',
          color: 'var(--text-muted)', fontSize: 'var(--type-micro)', lineHeight: 1,
        }}
      >
        ✕
      </button>
    </div>
  );
};

interface Chunk {
  id: string;
  text: string;
  safeText?: string;
  speaker?: string;
  /** Variation label applied to this span (e.g. 'Whisper', 'Default') */
  variation?: string;
  isHighlighted?: boolean;
  styleType?: 'underline' | 'bg-success' | 'bg-accent' | 'none';
  sentenceId?: SentenceId;
  hasPlay?: boolean;
  hasHoverControls?: boolean;
  isRendering?: boolean;
  paragraphIndex: number;
  showNumberTag?: string;
}

// ---------- Inline word phonetic editor ------------------------------------
// Splits a chunk's display text into tokens (words + whitespace/punctuation).
// Each word token is clickable — clicking it opens a tiny inline phonetic editor
// that stores a one-off spoken-form override for that word in that chunk.

/** A single text token: either a word (clickable) or inter-word punctuation/space. */
interface TextToken {
  raw: string;
  /** True = a word that can receive a phonetic override */
  isWord: boolean;
  /** Position index among word-tokens in the chunk (used as override key) */
  wordIndex: number;
}

function tokenize(text: string): TextToken[] {
  // Split on word boundaries, keeping delimiters so we can reconstruct.
  // \w+ matches word chars; the rest are separators.
  const parts = text.split(/(\w+)/);
  const tokens: TextToken[] = [];
  let wordIdx = 0;
  for (const part of parts) {
    if (/^\w+$/.test(part)) {
      tokens.push({ raw: part, isWord: true, wordIndex: wordIdx++ });
    } else if (part.length > 0) {
      tokens.push({ raw: part, isWord: false, wordIndex: -1 });
    }
  }
  return tokens;
}

/** The tiny inline phonetic editor that appears above a clicked word. */
const InlinePhoneticEditor: React.FC<{
  originalWord: string;
  initialValue: string;
  speakerToken: { text: string; tintBg: string; tintBorder: string };
  onConfirm: (phonetic: string) => void;
  onCancel: () => void;
}> = ({ originalWord, initialValue, speakerToken, onConfirm, onCancel }) => {
  const [value, setValue] = useState(initialValue || originalWord);
  return (
    <span
      style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        background: speakerToken.tintBg,
        border: `1px solid ${speakerToken.tintBorder}`,
        borderRadius: 'var(--radius-card)',
        padding: '2px 4px',
        verticalAlign: 'middle',
        boxShadow: 'var(--shadow-md)',
        position: 'relative', zIndex: 100,
      }}
    >
      <span style={{ fontSize: 'var(--type-micro)', color: speakerToken.text, whiteSpace: 'nowrap', flexShrink: 0 }}>
        "{originalWord}" →
      </span>
      <input
        autoFocus
        value={value}
        onChange={e => setValue(e.target.value)}
        onKeyDown={e => {
          e.stopPropagation();
          if (e.key === 'Enter') onConfirm(value.trim() || originalWord);
          if (e.key === 'Escape') onCancel();
        }}
        onClick={e => e.stopPropagation()}
        placeholder="phonetic…"
        style={{
          width: 90, fontSize: 'var(--type-micro)', padding: '1px 4px',
          border: `1px solid ${speakerToken.tintBorder}`,
          borderRadius: 'var(--radius-button)',
          background: 'var(--surface)', color: 'var(--text-primary)',
          outline: 'none', fontFamily: 'inherit', fontStyle: 'italic',
        }}
      />
      <button
        type="button"
        aria-label="Confirm phonetic override"
        onClick={e => { e.stopPropagation(); onConfirm(value.trim() || originalWord); }}
        style={{
          background: speakerToken.tintBg, border: `1px solid ${speakerToken.tintBorder}`,
          borderRadius: 'var(--radius-button)', padding: '1px 5px',
          color: speakerToken.text, fontSize: 'var(--type-micro)', fontWeight: 700,
          cursor: 'pointer', display: 'inline-flex', alignItems: 'center',
        }}
      >
        <Check size={10} aria-hidden="true" />
      </button>
      <button
        type="button"
        aria-label="Cancel phonetic override"
        onClick={e => { e.stopPropagation(); onCancel(); }}
        style={{
          background: 'none', border: 'none', padding: '1px 3px',
          color: speakerToken.text, fontSize: 'var(--type-micro)',
          cursor: 'pointer', opacity: 0.7,
        }}
      >
        ✕
      </button>
    </span>
  );
};

/** Renders a chunk's text as clickable word tokens.
 *  Each word that has a phonetic override shows the override text in italics
 *  while keeping the full speaker tint of the enclosing chunk span.
 *  Clicking a word opens the inline editor inline (replaces that token). */
const ClickableWords: React.FC<{
  text: string;
  chunkId: string;
  speakerToken: { text: string; tintBg: string; tintBorder: string };
  wordOverrides: Record<string, string>;
  onOverride: (key: string, phonetic: string) => void;
  onClearOverride: (key: string) => void;
}> = ({ text, chunkId, speakerToken, wordOverrides, onOverride, onClearOverride }) => {
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const tokens = tokenize(text);

  return (
    <>
      {tokens.map((tok, i) => {
        if (!tok.isWord) {
          return <React.Fragment key={i}>{tok.raw}</React.Fragment>;
        }
        const key = `${chunkId}:${tok.wordIndex}`;
        const override = wordOverrides[key];
        const isEditing = editingKey === key;

        if (isEditing) {
          return (
            <InlinePhoneticEditor
              key={i}
              originalWord={tok.raw}
              initialValue={override ?? ''}
              speakerToken={speakerToken}
              onConfirm={(phonetic) => {
                if (phonetic && phonetic !== tok.raw) {
                  onOverride(key, phonetic);
                } else {
                  onClearOverride(key);
                }
                setEditingKey(null);
              }}
              onCancel={() => setEditingKey(null)}
            />
          );
        }

        if (override) {
          return (
            <span
              key={i}
              title={`Phonetic: "${override}" (click to edit)`}
              onClick={e => { e.stopPropagation(); setEditingKey(key); }}
              style={{
                cursor: 'pointer',
                fontStyle: 'italic',
                fontWeight: 600,
                color: speakerToken.text,
                background: speakerToken.tintBg,
                border: `1px solid ${speakerToken.tintBorder}`,
                borderRadius: 3,
                padding: '0 2px',
                textDecoration: 'underline dotted',
              }}
            >
              {override}
            </span>
          );
        }

        return (
          <span
            key={i}
            title="Click to add phonetic override for this word"
            onClick={e => { e.stopPropagation(); setEditingKey(key); }}
            style={{
              cursor: 'pointer',
              borderRadius: 2,
              padding: '0 1px',
              transition: 'background 0.1s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = speakerToken.tintBg; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            {tok.raw}
          </span>
        );
      })}
    </>
  );
};

const initialChunks: Chunk[] = [
  // Paragraph 1
  {
    id: 'c1',
    text: 'The road wound down through silver birch and pale stone, the kind of road that remembers every foot that has ever crossed it.',
    safeText: 'The road went down through pale trees and old stone.',
    speaker: 'Narrator',
    styleType: 'underline',
    sentenceId: 's1',
    paragraphIndex: 0,
    showNumberTag: '§1',
  },
  {
    id: 'c2',
    text: ' ',
    paragraphIndex: 0,
  },
  {
    id: 'c3',
    text: 'Maren pulled her cloak tighter against the chill that rose from the valley floor.',
    safeText: 'Maren pulled her cloak close.',
    styleType: 'bg-success',
    hasPlay: true,
    paragraphIndex: 0,
  },
  {
    id: 'c4',
    text: ' ',
    paragraphIndex: 0,
  },
  {
    id: 'c5',
    text: 'The vale smelled of old rain and something older still — loam and iron and time.',
    safeText: 'The vale smelled of rain.',
    speaker: 'Maren',
    styleType: 'underline',
    sentenceId: 's2',
    paragraphIndex: 0,
    showNumberTag: '§2',
  },

  // Paragraph 2
  {
    id: 'c6',
    text: '"Stay close to me.',
    safeText: '"Stay close to me.',
    speaker: 'Dov',
    styleType: 'underline',
    sentenceId: 's3',
    hasHoverControls: true,
    paragraphIndex: 1,
    showNumberTag: '§3',
  },
  {
    id: 'c7',
    text: ' ',
    paragraphIndex: 1,
  },
  {
    id: 'c8',
    text: "The warden's lantern moves at dusk, and it moves fast.\"",
    safeText: 'The warden moves at dusk."',
    speaker: 'Maren',
    styleType: 'underline',
    paragraphIndex: 1,
  },
  {
    id: 'c9',
    text: ' ',
    paragraphIndex: 1,
  },
  {
    id: 'c10',
    text: 'Dov tightened his grip on the satchel and said nothing for a long moment.',
    safeText: 'Dov tightened his grip.',
    styleType: 'bg-accent',
    isRendering: true,
    paragraphIndex: 1,
    showNumberTag: '§4',
  },
  {
    id: 'c11',
    text: ' ',
    paragraphIndex: 1,
  },
  {
    id: 'c12',
    text: '"How close exactly?"',
    safeText: '"How close exactly?"',
    speaker: 'Narrator',
    styleType: 'underline',
    sentenceId: 's4',
    paragraphIndex: 1,
  },

  // Paragraph 3
  {
    id: 'c13',
    text: 'Far above, an owl called once, then fell silent.',
    safeText: 'The vale took them.',
    speaker: 'Dov',
    styleType: 'underline',
    sentenceId: 's5',
    paragraphIndex: 2,
    showNumberTag: '§5',
  },
  {
    id: 'c14',
    text: ' ',
    paragraphIndex: 2,
  },
  {
    id: 'c15',
    text: '"He excelled,"',
    safeText: '"He excelled,"',
    speaker: 'Dov',
    styleType: 'underline',
    paragraphIndex: 2,
    showNumberTag: '§6',
  },
  {
    id: 'c16',
    text: ' Dove said, rising from his chair.',
    safeText: ' Dove said, rising from his chair.',
    speaker: 'Narrator',
    styleType: 'none',
    paragraphIndex: 2,
  },

  // Paragraph 4
  {
    id: 'c17',
    text: 'They walked a long while without speaking, the path narrowing until the birches gave way to black pines that swallowed what little light remained.',
    speaker: 'Narrator',
    styleType: 'none',
    paragraphIndex: 3,
    showNumberTag: '§7',
  },
  {
    id: 'c18',
    text: ' The cold had teeth here, and it found every gap in their cloaks.',
    speaker: 'Narrator',
    styleType: 'none',
    paragraphIndex: 3,
  },

  // Paragraph 5
  {
    id: 'c19',
    text: '"There — do you see the lantern?"',
    speaker: 'Maren',
    styleType: 'underline',
    paragraphIndex: 4,
    showNumberTag: '§8',
  },
  {
    id: 'c20',
    text: ' She pointed past a leaning cairn to a smear of amber light that bobbed against the dark.',
    speaker: 'Narrator',
    styleType: 'none',
    paragraphIndex: 4,
  },

  // Paragraph 6
  {
    id: 'c21',
    text: '"The warden keeps no schedule a man can trust,"',
    speaker: 'Dov',
    styleType: 'underline',
    paragraphIndex: 5,
    showNumberTag: '§9',
  },
  {
    id: 'c22',
    text: ' he murmured, and drew the satchel tight against his ribs.',
    speaker: 'Narrator',
    styleType: 'none',
    paragraphIndex: 5,
  },

  // Paragraph 7
  {
    id: 'c23',
    text: 'An old voice came out of the dark before they saw its owner.',
    speaker: 'Narrator',
    styleType: 'none',
    paragraphIndex: 6,
    showNumberTag: '§10',
  },
  {
    id: 'c24',
    text: ' "You are late, and the vale does not forgive lateness."',
    speaker: 'ElderRowan',
    styleType: 'underline',
    paragraphIndex: 6,
  },

  // Paragraph 8
  {
    id: 'c25',
    text: 'Elder Rowan stepped into the lantern\'s reach, her staff tapping the frost like a slow second heartbeat.',
    speaker: 'Narrator',
    styleType: 'none',
    paragraphIndex: 7,
    showNumberTag: '§11',
  },
  {
    id: 'c26',
    text: ' "Whatever you carry, carry it quietly past the third stone."',
    speaker: 'ElderRowan',
    styleType: 'underline',
    paragraphIndex: 7,
  },

  // Paragraph 9
  {
    id: 'c27',
    text: '"And if the warden wakes?"',
    speaker: 'Maren',
    styleType: 'underline',
    paragraphIndex: 8,
    showNumberTag: '§12',
  },
  {
    id: 'c28',
    text: ' Maren\'s hand had already found the hilt at her hip.',
    speaker: 'Narrator',
    styleType: 'none',
    paragraphIndex: 8,
  },

  // Paragraph 10
  {
    id: 'c29',
    text: '"Then you run, and you do not look back to count who follows,"',
    speaker: 'ElderRowan',
    styleType: 'underline',
    paragraphIndex: 9,
    showNumberTag: '§13',
  },
  {
    id: 'c30',
    text: ' the old woman said, and the lantern guttered as if the vale itself had leaned closer to listen.',
    speaker: 'Narrator',
    styleType: 'none',
    paragraphIndex: 9,
  },

  // Paragraph 11
  {
    id: 'c31',
    text: 'The third stone was taller than a man and slick with the breath of the river below.',
    speaker: 'Narrator',
    styleType: 'none',
    paragraphIndex: 10,
    showNumberTag: '§14',
  },
  {
    id: 'c32',
    text: ' Dov laid his palm against it and felt, faintly, a pulse that was not his own.',
    speaker: 'Narrator',
    styleType: 'none',
    paragraphIndex: 10,
  },

  // Paragraph 12
  {
    id: 'c33',
    text: '"It remembers every foot that has ever crossed it,"',
    speaker: 'Dov',
    styleType: 'underline',
    paragraphIndex: 11,
    showNumberTag: '§15',
  },
  {
    id: 'c34',
    text: ' he whispered, half to Maren and half to the stone.',
    speaker: 'Narrator',
    styleType: 'none',
    paragraphIndex: 11,
  },

  // Paragraph 13
  {
    id: 'c35',
    text: 'Somewhere ahead a bell rang once, low and wrong, the sound a throat makes when it has forgotten how to be a bell.',
    speaker: 'Narrator',
    styleType: 'none',
    paragraphIndex: 12,
    showNumberTag: '§16',
  },
  {
    id: 'c36',
    text: ' "That is the warden," Elder Rowan breathed. "Go now, while it is still only curious."',
    speaker: 'ElderRowan',
    styleType: 'underline',
    paragraphIndex: 12,
  },

  // Paragraph 14
  {
    id: 'c37',
    text: 'They went, three shapes folding into the dark between the stones, and the vale closed over them like water over a dropped coin.',
    speaker: 'Narrator',
    styleType: 'none',
    paragraphIndex: 13,
    showNumberTag: '§17',
  },
  {
    id: 'c38',
    text: ' Behind them the lantern stayed, a single stubborn ember refusing the night.',
    speaker: 'Narrator',
    styleType: 'none',
    paragraphIndex: 13,
  },

  // Paragraph 15
  {
    id: 'c39',
    text: '"Stay close,"',
    speaker: 'Maren',
    styleType: 'underline',
    paragraphIndex: 14,
    showNumberTag: '§18',
  },
  {
    id: 'c40',
    text: ' she said again, softer now, and this time it sounded less like a warning and more like a prayer.',
    speaker: 'Narrator',
    styleType: 'none',
    paragraphIndex: 14,
  }
];

interface SelectionContextMenu {
  x: number;
  y: number;
  chunkId: string;
  startOffset: number;
  endOffset: number;
  selectedText: string;
}

// Follow-playback helpers live in shared.tsx (reused by Review). Re-exported here
// for siteMockupStage's import and the studioTimeline unit test.
export { buildSegmentTimeline, activeChunkIdAt } from '../shared';
export const STUDIO_FOLLOW_DURATION_SEC = FOLLOW_DURATION_SEC;

// Local chapter-status → OrbStatus mapping (mirrors CHAPTER_STATUS_ORB in book.tsx)
const STUDIO_CHAPTER_STATUS_ORB: Record<string, OrbStatus> = {
  Published: 'done',
  Review:    'running',
  Studio:    'preparing',
  Drafting:  'idle',
};

// Contents dropdown — lists all chapters with a mini StatusOrb + chapter title
const ContentsDropdown: React.FC<{
  activeChapter: number;
  onSelect: (n: number) => void;
  onClose: () => void;
}> = ({ activeChapter, onSelect, onClose }) => (
  <div
    style={{
      position: 'absolute', top: '100%', left: 0, zIndex: 300,
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-card)', boxShadow: 'var(--shadow-md)',
      minWidth: 220, padding: 'var(--space-1) 0',
    }}
  >
    {CHAPTERS.map(ch => {
      const pct = CHAPTER_RENDER_PCT[ch.n - 1] ?? 0;
      const orbStatus = STUDIO_CHAPTER_STATUS_ORB[ch.status] ?? 'idle';
      const isActive = ch.n === activeChapter;
      return (
        <button
          key={ch.n}
          type="button"
          onClick={(e) => { e.stopPropagation(); onSelect(ch.n); onClose(); }}
          style={{
            width: '100%', border: 0, background: isActive ? 'var(--accent-tint-bg)' : 'transparent',
            fontFamily: 'inherit', textAlign: 'left',
            display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
            padding: 'var(--space-1) var(--space-3)', cursor: 'pointer',
            color: isActive ? 'var(--action-primary)' : 'var(--text-primary)',
            fontWeight: isActive ? 700 : 400,
          }}
          onMouseEnter={e => { if (!isActive) e.currentTarget.style.background = 'var(--surface-alt)'; }}
          onMouseLeave={e => { if (!isActive) e.currentTarget.style.background = 'transparent'; }}
        >
          <StatusOrb status={orbStatus} progress={pct / 100} size={12} />
          <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', minWidth: 16, flexShrink: 0 }}>
            {ch.n}
          </span>
          <span style={{ fontSize: 'var(--type-caption)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {ch.title}
          </span>
        </button>
      );
    })}
  </div>
);

export const StudioPane: React.FC<{
  activeTrack?: TrackState | null;
  setActiveTrack?: React.Dispatch<React.SetStateAction<TrackState | null>>;
  activeChapter?: number;
  setActiveChapter?: (n: number) => void;
  lastEditedSegmentByChapter?: Record<number, string>;
  setLastEditedSegmentByChapter?: React.Dispatch<React.SetStateAction<Record<number, string>>>;
}> = ({ activeTrack = null, setActiveTrack, activeChapter = 4, setActiveChapter, lastEditedSegmentByChapter, setLastEditedSegmentByChapter }) => {
  const matchTrackName = `Chapter ${activeChapter}`;
  const [viewMode, setViewMode] = useState<'book' | 'script'>('book');
  const [safeText, setSafeText] = useState(false);
  const [showNumbers, setShowNumbers] = useState(false);
  const [armedSwatch, setArmedSwatch] = useState<string | null>(null);
  // Task 013: per-word phonetic overrides keyed as "{chunkId}:{wordIndex}"
  const [wordOverrides, setWordOverrides] = useState<Record<string, string>>({});
  // Task 013: show/hide the pronunciation lexicon side panel
  const [showLexicon, setShowLexicon] = useState(false);
  // Default per-sentence speakers used to tint unassigned prose. Range
  // selection (handleAssignSpeakerToSelection) is now the assignment gesture;
  // the old "arm a swatch + click a sentence" paint path has been retired.
  const [sentenceSpeaker] = useState<Record<SentenceId, string>>({
    s1: 'Narrator', s2: 'Maren', s3: 'Dov', s4: 'Narrator', s5: 'Dov',
  });
  const [showResync, setShowResync] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [actionExpanded, setActionExpanded] = useState(false);
  const [contentsDropdownOpen, setContentsDropdownOpen] = useState(false);

  // ---- Task 012: Named bookmarks ----
  // bookmarkPending: true while the inline label input is open
  const [bookmarkPending, setBookmarkPending] = useState(false);
  const [bookmarkLabel, setBookmarkLabel] = useState('');
  // currentBookmarkChunkId: the chunk to anchor the bookmark to when confirmed.
  // We use the first visible unrendered section as a default focus point when
  // no playback chunk is active (more useful than an arbitrary id).
  const [bookmarkTargetChunkId, setBookmarkTargetChunkId] = useState<string>('c1');
  // Trigger a flash animation when a bookmark is saved
  const [bookmarkSaved, setBookmarkSaved] = useState(false);
  // bookmarkCount: re-render trigger when the shared store changes
  const [, setBookmarkTick] = useState(0);
  useEffect(() => subscribeBookmarks(() => setBookmarkTick(t => t + 1)), []);

  // ---- Task 012: Jump to next unrendered section ----
  // nextUnrenderedChunkId: the id of the first section chunk whose audio is not done.
  const nextUnrenderedChunkId = React.useMemo(() => {
    // Walk chunks in document order, find first with showNumberTag that is not rendered.
    for (const ch of initialChunks) {
      if (ch.showNumberTag && !CHUNK_RENDERED[ch.id]) return ch.id;
    }
    return null;
  }, []);

  // jumpToNextUnrendered: scrolls to the next unrendered section and briefly
  // highlights it by setting it as the "jumped" chunk.
  const [jumpedChunkId, setJumpedChunkId] = useState<string | null>(null);
  const jumpToNextUnrendered = useCallback(() => {
    if (!nextUnrenderedChunkId) return;
    setJumpedChunkId(nextUnrenderedChunkId);
    const container = scrollRef.current;
    if (!container) return;
    const el = container.querySelector<HTMLElement>(`[data-chunk-id="${nextUnrenderedChunkId}"]`);
    if (!el) return;
    const elRect = el.getBoundingClientRect();
    const cRect = container.getBoundingClientRect();
    const elTop = elRect.top - cRect.top + container.scrollTop;
    const target = Math.max(0, elTop + elRect.height / 2 - container.clientHeight / 2);
    container.scrollTo({ top: target, behavior: 'smooth' });
    // Clear the highlight after 1.8 s
    setTimeout(() => setJumpedChunkId(null), 1800);
  }, [nextUnrenderedChunkId]);

  // State for dynamic chunks
  const [chunks, setChunks] = useState<Chunk[]>(initialChunks);
  // Context menu for sub-sentence speaker assignment
  const [contextMenu, setContextMenu] = useState<SelectionContextMenu | null>(null);

  const timeline = React.useMemo(() => buildSegmentTimeline(chunks, STUDIO_FOLLOW_DURATION_SEC), [chunks]);
  const { scrollRef, activeChunkId, followEngaged, isFollowing, resume } = useChapterFollow({
    activeTrack, matchTrackName, timeline,
  });

  // Chapter navigation helpers
  const chapterCount = CHAPTERS.length;
  const currentChapterIdx = CHAPTERS.findIndex(c => c.n === activeChapter);
  const prevChapterN = currentChapterIdx > 0 ? CHAPTERS[currentChapterIdx - 1].n : null;
  const nextChapterN = currentChapterIdx < chapterCount - 1 ? CHAPTERS[currentChapterIdx + 1].n : null;

  // Close contents dropdown when clicking outside
  const contentsDropdownRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!contentsDropdownOpen) return;
    const handleOutside = (e: MouseEvent) => {
      if (contentsDropdownRef.current && !contentsDropdownRef.current.contains(e.target as Node)) {
        setContentsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [contentsDropdownOpen]);

  // Record last-edited bookmark: when activeChunkId changes and is non-null, store it.
  const prevActiveChunkIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!activeChunkId || activeChunkId === prevActiveChunkIdRef.current) return;
    prevActiveChunkIdRef.current = activeChunkId;
    if (setLastEditedSegmentByChapter) {
      setLastEditedSegmentByChapter(prev => ({ ...prev, [activeChapter]: activeChunkId }));
    }
  }, [activeChunkId, activeChapter, setLastEditedSegmentByChapter]);

  // On chapter switch: if a stored segment bookmark exists, scroll to it via the
  // existing scrollRef mechanism; otherwise scroll to top.
  useEffect(() => {
    const storedId = lastEditedSegmentByChapter?.[activeChapter];
    const container = scrollRef.current;
    if (!container) return;
    if (storedId) {
      const el = container.querySelector<HTMLElement>(`[data-chunk-id="${storedId}"]`);
      if (el) {
        const elRect = el.getBoundingClientRect();
        const cRect = container.getBoundingClientRect();
        const elTop = elRect.top - cRect.top + container.scrollTop;
        const target = Math.max(0, elTop + elRect.height / 2 - container.clientHeight / 2);
        container.scrollTo({ top: target, behavior: 'smooth' });
        return;
      }
    }
    container.scrollTo({ top: 0, behavior: 'auto' });
  }, [activeChapter]); // intentional: only re-run on chapter switch

  const onPlayFromHere = (chunkId: string) => {
    const seg = timeline.find(s => s.id === chunkId);
    if (!seg || !setActiveTrack) return;
    setActiveTrack({
      trackName: matchTrackName, subtitle: 'Chapter playback',
      duration: STUDIO_FOLLOW_DURATION_SEC,
      currentTime: seg.start, isPlaying: true, scope: 'chapter',
    });
    resume();
  };

  // Simulated rendering progress
  const [isRenderingRemaining, setIsRenderingRemaining] = useState(false);
  const [renderProgress, setRenderProgress] = useState(0.45);

  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRenderingRemaining) {
      interval = setInterval(() => {
        setRenderProgress(p => {
          if (p >= 1) {
            setIsRenderingRemaining(false);
            return 0.45;
          }
          return Math.min(1, p + 0.01);
        });
      }, 500);
    }
    return () => clearInterval(interval);
  }, [isRenderingRemaining]);

  // Handle outside clicks to close the context menu
  useEffect(() => {
    const handleDocClick = (e: MouseEvent) => {
      const menuEl = document.getElementById('selection-context-menu');
      if (menuEl && !menuEl.contains(e.target as Node)) {
        setContextMenu(null);
      }
    };
    document.addEventListener('mousedown', handleDocClick);
    return () => document.removeEventListener('mousedown', handleDocClick);
  }, []);

  const handleSwatchClick = (id: string) => {
    setArmedSwatch(prev => (prev === id ? null : id));
  };

  const handleMouseUp = () => {
    setTimeout(() => {
      const selection = window.getSelection();
      if (!selection || selection.rangeCount === 0 || selection.isCollapsed) {
        return;
      }
      const range = selection.getRangeAt(0);
      const selectedText = selection.toString().trim();
      if (!selectedText) return;

      // Find chunk element
      let node: Node | null = range.startContainer;
      if (node.nodeType !== Node.ELEMENT_NODE) {
        node = node.parentNode;
      }
      let element = node as HTMLElement | null;
      while (element && !element.getAttribute('data-chunk-id')) {
        element = element.parentElement;
      }
      if (!element) return;
      const chunkId = element.getAttribute('data-chunk-id');
      if (!chunkId) return;

      // Get selection offsets relative to the text node
      const startOffset = range.startOffset;
      const endOffset = range.endOffset;

      const rect = range.getBoundingClientRect();
      setContextMenu({
        x: rect.left + rect.width / 2 + window.scrollX,
        y: rect.top + window.scrollY,
        chunkId,
        startOffset,
        endOffset,
        selectedText,
      });
    }, 10);
  };

  // Task 013: word-level phonetic override handlers
  const handleWordOverride = useCallback((key: string, phonetic: string) => {
    setWordOverrides(prev => ({ ...prev, [key]: phonetic }));
  }, []);

  const handleClearWordOverride = useCallback((key: string) => {
    setWordOverrides(prev => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  const handleAssignSpeakerToSelection = (speaker: string, variation: string = 'Default') => {
    if (!contextMenu) return;
    const { chunkId, startOffset, endOffset } = contextMenu;

    setChunks(prevChunks => {
      const nextChunks: Chunk[] = [];
      for (const chunk of prevChunks) {
        if (chunk.id === chunkId) {
          const textBefore = chunk.text.slice(0, startOffset);
          const textSelected = chunk.text.slice(startOffset, endOffset);
          const textAfter = chunk.text.slice(endOffset);

          // Unique suffixes to keep keys/IDs stable
          const stamp = `${Date.now()}-${Math.random().toString(36).substr(2, 4)}`;

          if (textBefore) {
            nextChunks.push({
              ...chunk,
              id: `${chunk.id}-before-${stamp}`,
              text: textBefore,
              // clear highlight on the before-split
              isHighlighted: false,
            });
          }

          nextChunks.push({
            ...chunk,
            id: `${chunk.id}-selected-${stamp}`,
            text: textSelected,
            speaker,
            variation: variation !== 'Default' ? variation : undefined,
            isHighlighted: true,
            // sub-chunks don't carry sentenceId (their speaker is explicit)
            sentenceId: undefined,
          });

          if (textAfter) {
            nextChunks.push({
              ...chunk,
              id: `${chunk.id}-after-${stamp}`,
              text: textAfter,
              isHighlighted: false,
            });
          }
        } else {
          nextChunks.push(chunk);
        }
      }
      return nextChunks;
    });

    window.getSelection()?.removeAllRanges();
    setContextMenu(null);
  };

  const renderChunkElement = (chunk: Chunk) => {
    const text = (safeText && chunk.safeText) ? chunk.safeText : chunk.text;
    const sp = chunk.speaker || (chunk.sentenceId ? sentenceSpeaker[chunk.sentenceId] : undefined) || 'Narrator';
    const tok = SPEAKER_TOKEN[sp] ?? SPEAKER_TOKEN.Narrator;

    // Render the word content — in book view, individual words are clickable for
    // phonetic overrides (task 013). The override keeps the enclosing span's speaker
    // tint intact; only the spoken form changes.
    const wordContent = (
      <ClickableWords
        text={text}
        chunkId={chunk.id}
        speakerToken={tok}
        wordOverrides={wordOverrides}
        onOverride={handleWordOverride}
        onClearOverride={handleClearWordOverride}
      />
    );

    const handleClick = () => {
      // Sentence-click no longer commits an assignment — range selection is the
      // primary gesture. The armed-swatch whole-chunk paint path is retired;
      // cast row selection still sets armedSwatch as a "who" hint but assignment
      // commits on text range via handleAssignSpeakerToSelection.
    };

    const cursorStyle = chunk.hasPlay ? 'pointer' : 'text';
    const isActive = chunk.id === activeChunkId;
    const isJumped = chunk.id === jumpedChunkId;
    const activeOverlay = isActive
      ? { background: tok.tintBg, color: tok.text, boxShadow: `0 0 0 2px ${tok.tintBorder}`, borderRadius: 4, transition: 'background .2s ease, box-shadow .2s ease' }
      : isJumped
      ? { background: 'var(--warning-tint-bg)', boxShadow: '0 0 0 2px var(--warning-tint-border)', borderRadius: 4, transition: 'background .4s ease, box-shadow .4s ease' }
      : null;

    const isContent = text.trim().length > 0 && !chunk.isRendering;

    const renderInner = () => {
      if (chunk.isHighlighted) {
        return (
          <span
            key={chunk.id}
            data-chunk-id={chunk.id}
            style={{
              background: tok.tintBg,
              color: tok.text,
              border: `1px solid ${tok.tintBorder}`,
              borderRadius: 'var(--radius-button)',
              padding: '2px 4px',
              margin: '0 1px',
              cursor: 'text',
              fontWeight: 500,
              display: 'inline',
              position: 'relative',
              ...activeOverlay,
            }}
          >
            {wordContent}
            {chunk.variation && (
              <span style={{
                fontSize: 'var(--type-micro)',
                fontWeight: 700,
                color: tok.text,
                opacity: 0.75,
                marginLeft: 3,
                verticalAlign: 'super',
                letterSpacing: 'var(--tracking-wide)',
              }}>
                {chunk.variation}
              </span>
            )}
          </span>
        );
      }

      if (chunk.styleType === 'underline') {
        return (
          <span
            key={chunk.id}
            data-chunk-id={chunk.id}
            onClick={handleClick}
            style={{
              borderBottom: `2px solid ${tok.text}`,
              paddingBottom: 1,
              cursor: cursorStyle,
              ...activeOverlay,
            }}
          >
            {wordContent}
          </span>
        );
      }

      if (chunk.styleType === 'bg-success') {
        return (
          <span
            key={chunk.id}
            data-chunk-id={chunk.id}
            onClick={handleClick}
            style={{
              background: 'var(--success-tint-bg)',
              borderRadius: 3,
              padding: '1px 3px',
              cursor: cursorStyle,
              position: 'relative',
              display: 'inline',
              ...activeOverlay,
            }}
          >
            {chunk.hasPlay && (
              <Play size={9} style={{ marginRight: 3, color: 'var(--success-text)', verticalAlign: 'middle' }} aria-hidden="true" />
            )}
            {wordContent}
          </span>
        );
      }

      if (chunk.styleType === 'bg-accent') {
        return (
          <span
            key={chunk.id}
            data-chunk-id={chunk.id}
            style={{
              background: 'var(--accent-tint-bg)',
              borderRadius: 3,
              padding: '1px 3px',
              display: 'inline',
              ...activeOverlay,
            }}
          >
            {wordContent}
            {chunk.isRendering && (
              <span style={{ fontSize: 'var(--type-micro)', color: 'var(--action-primary)', fontStyle: 'italic', marginLeft: 5 }}>
                rendering…
              </span>
            )}
          </span>
        );
      }

      return (
        <span
          key={chunk.id}
          data-chunk-id={chunk.id}
          onClick={handleClick}
          style={{
            cursor: cursorStyle,
            ...activeOverlay,
          }}
        >
          {wordContent}
        </span>
      );
    };

    if (isContent) {
      return (
        <span key={chunk.id} className="hover-chunk-wrap" style={{ position: 'relative', display: 'inline' }}>
          {renderInner()}
          <HoverSentenceControls chunkId={chunk.id} onPlayFromHere={onPlayFromHere} />
          {chunk.hasHoverControls && (
            <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontStyle: 'italic', marginLeft: 4 }}>
              per-section controls on hover
            </span>
          )}
        </span>
      );
    }

    return renderInner();
  };

  return (
    <>
      <style>{`
        .hover-chunk-wrap .hover-sentence-controls { opacity: 0; visibility: hidden; transition: opacity 0.1s ease; }
        .hover-chunk-wrap:hover .hover-sentence-controls { opacity: 1 !important; visibility: visible !important; }
      `}</style>
      {showResync && <ResyncModal onClose={() => setShowResync(false)} />}

      {contextMenu && (
        <div
          id="selection-context-menu"
          style={{
            position: 'fixed',
            top: contextMenu.y - 52,
            left: contextMenu.x,
            transform: 'translateX(-50%)',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-card)',
            padding: 'var(--space-1) var(--space-2)',
            boxShadow: 'var(--shadow-md)',
            zIndex: 1000,
          }}
        >
          <SelectionAssignControl
            onAssign={(charId, variation) => handleAssignSpeakerToSelection(charId, variation)}
            onCancel={() => { window.getSelection()?.removeAllRanges(); setContextMenu(null); }}
          />
        </div>
      )}

      <Col gap={0} className="ns-enter" style={{ flex: 1, overflow: 'hidden' }}>
        {/* View mode segmented control + toggles */}
        <div style={{
          padding: 'var(--space-1) var(--space-3)',
          borderBottom: '1px solid var(--hairline)',
          display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
          background: 'var(--surface)', flexShrink: 0,
        }}>
          {/* Segmented pill container */}
          <div style={{
            display: 'inline-flex', alignItems: 'center',
            border: '1px solid var(--hairline)',
            borderRadius: 'var(--radius-round)',
            overflow: 'hidden',
            background: 'var(--surface-alt)',
          }}>
            {(['book', 'script'] as const).map((mode, i) => (
              <div
                key={mode}
                onClick={() => setViewMode(mode)}
                style={{
                  fontSize: 'var(--type-caption)', fontWeight: 600,
                  padding: '3px var(--space-3)',
                  cursor: 'pointer',
                  borderRight: i === 0 ? '1px solid var(--hairline)' : undefined,
                  background: viewMode === mode ? 'var(--accent-tint-bg)' : 'transparent',
                  color: viewMode === mode ? 'var(--action-primary)' : 'var(--text-secondary)',
                  transition: 'background 0.15s, color 0.15s',
                  whiteSpace: 'nowrap',
                }}
              >
                {mode === 'book' ? 'Book view' : 'Script view'}
              </div>
            ))}
          </div>
          <div style={{ flex: 1 }} />
          {/* Safe text / # toggles */}
          <div
            onClick={() => setSafeText(s => !s)}
            style={{
              fontSize: 'var(--type-micro)', padding: '2px var(--space-2)',
              borderRadius: 'var(--radius-round)', cursor: 'pointer',
              border: `1px solid ${safeText ? 'var(--action-primary)' : 'var(--hairline)'}`,
              background: safeText ? 'var(--accent-tint-bg)' : 'transparent',
              color: safeText ? 'var(--action-primary)' : 'var(--text-muted)',
            }}
          >Safe text</div>
          <div
            onClick={() => setShowNumbers(n => !n)}
            style={{
              fontSize: 'var(--type-micro)', padding: '2px var(--space-2)',
              borderRadius: 'var(--radius-round)', cursor: 'pointer',
              border: `1px solid ${showNumbers ? 'var(--action-primary)' : 'var(--hairline)'}`,
              background: showNumbers ? 'var(--accent-tint-bg)' : 'transparent',
              color: showNumbers ? 'var(--action-primary)' : 'var(--text-muted)',
            }}
          >#</div>
          {/* Task 013: Pronunciation lexicon toggle */}
          <div
            onClick={() => setShowLexicon(v => !v)}
            title="Pronunciation lexicon (book / series / global)"
            style={{
              fontSize: 'var(--type-micro)', padding: '2px var(--space-2)',
              borderRadius: 'var(--radius-round)', cursor: 'pointer',
              border: `1px solid ${showLexicon ? 'var(--action-primary)' : 'var(--hairline)'}`,
              background: showLexicon ? 'var(--accent-tint-bg)' : 'transparent',
              color: showLexicon ? 'var(--action-primary)' : 'var(--text-muted)',
              display: 'inline-flex', alignItems: 'center', gap: 3,
            }}
          >
            <BookMarked size={11} aria-hidden="true" /> Pronunciation
          </div>
        </div>

        {/* Analysis strip */}
        <div style={{
          padding: 'var(--space-1) var(--space-3)',
          borderBottom: '1px solid var(--hairline)',
          background: 'var(--surface-alt)',
          display: 'flex', alignItems: 'center', gap: 'var(--space-2)', flexShrink: 0, flexWrap: 'wrap',
        }}>
          <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>
            12,403 chars · 2,118 words · 184 sentences · 186 segments · est. 14m 32s
          </span>
          <div style={{ flex: 1 }} />
          {/* Green badge — auto-fixed */}
          <SemanticChip variant="success"><Check size={12} strokeWidth={2.4} style={{ marginRight: 4 }} aria-hidden="true" />3/3 long sentences auto-fixed</SemanticChip>
          {/* Hairline separator */}
          <div style={{ width: 1, height: 16, background: 'var(--hairline)', flexShrink: 0 }} />
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
            padding: 'var(--space-1) var(--space-3) var(--space-2)',
            background: 'var(--warning-tint-bg)',
            borderBottom: '1px solid var(--warning-tint-border)',
            flexShrink: 0,
          }}>
            <Card style={{ padding: 'var(--space-1) var(--space-3)', border: '1px solid var(--warning-tint-border)', display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
              <span style={{ fontSize: 'var(--type-micro)', color: 'var(--warning-text)', flex: 1, lineHeight: 'var(--leading-normal)' }}>
                Segment 142: "Sira—who had never once spoken above a whisper in all her years at the vale and whom nobody could quite place—stepped forward." — too long, cannot auto-split (contains em-dash within dialogue attribution).
              </span>
              <Btn small>Edit</Btn>
            </Card>
          </div>
        )}

        {/* Main row: prose + cast palette */}
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden', position: 'relative' }}>
          {/* Content area — prose */}
          {followEngaged && !isFollowing && <ResumeFollowingPill onClick={resume} />}
          <div ref={scrollRef} onMouseUp={handleMouseUp} style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-3) var(--space-4)', position: 'relative' }}>
            {/* Chapter-nav cluster: unsaved chip + Commit + Contents▾ + prev/next + export */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 'var(--space-2)', marginBottom: 'var(--space-2)', flexWrap: 'wrap',
            }}>
              {/* Left group: unsaved chip + Commit changes */}
              <SemanticChip variant="warning">2 unsaved text edits</SemanticChip>
              <Btn
                small
                primary
                onClick={() => setShowResync(true)}
                style={{ background: 'var(--success-strong)', border: '1px solid var(--success-strong)' }}
              >
                Commit changes
              </Btn>

              {/* ── Bookmark affordance (task 012) ── */}
              {bookmarkPending ? (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
                  <input
                    autoFocus
                    value={bookmarkLabel}
                    onChange={e => setBookmarkLabel(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter') {
                        const label = bookmarkLabel.trim() || 'untitled bookmark';
                        addBookmark({ book: 'The Whispering Vale', chapter: activeChapter, segment: bookmarkTargetChunkId, label });
                        setBookmarkLabel('');
                        setBookmarkPending(false);
                        setBookmarkSaved(true);
                        setTimeout(() => setBookmarkSaved(false), 1600);
                      }
                      if (e.key === 'Escape') { setBookmarkLabel(''); setBookmarkPending(false); }
                    }}
                    placeholder="label this spot…"
                    style={{
                      fontSize: 'var(--type-micro)', padding: '2px 6px',
                      border: '1px solid var(--accent-tint-border)',
                      borderRadius: 'var(--radius-button)',
                      background: 'var(--accent-tint-bg)', color: 'var(--text-primary)',
                      outline: 'none', width: 140,
                    }}
                  />
                  <button
                    type="button"
                    aria-label="Save bookmark"
                    onClick={() => {
                      const label = bookmarkLabel.trim() || 'untitled bookmark';
                      addBookmark({ book: 'The Whispering Vale', chapter: activeChapter, segment: bookmarkTargetChunkId, label });
                      setBookmarkLabel('');
                      setBookmarkPending(false);
                      setBookmarkSaved(true);
                      setTimeout(() => setBookmarkSaved(false), 1600);
                    }}
                    style={{
                      background: 'var(--action-primary)', border: '1px solid var(--action-primary)',
                      borderRadius: 'var(--radius-button)', padding: '2px 7px',
                      color: 'var(--text-on-accent)', fontSize: 'var(--type-micro)',
                      fontWeight: 700, cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >Save</button>
                  <button
                    type="button"
                    aria-label="Cancel bookmark"
                    onClick={() => { setBookmarkLabel(''); setBookmarkPending(false); }}
                    style={{
                      background: 'none', border: '1px solid var(--border)',
                      borderRadius: 'var(--radius-button)', padding: '2px 5px',
                      color: 'var(--text-muted)', fontSize: 'var(--type-micro)',
                      cursor: 'pointer', fontFamily: 'inherit',
                    }}
                  >✕</button>
                </span>
              ) : (
                <button
                  type="button"
                  aria-label="Bookmark this spot"
                  title="Bookmark this spot"
                  onClick={() => {
                    // default anchor: active playback chunk, first unrendered section, or c1
                    const target = activeChunkId ?? nextUnrenderedChunkId ?? 'c1';
                    setBookmarkTargetChunkId(target);
                    setBookmarkPending(true);
                  }}
                  style={{
                    fontSize: 'var(--type-micro)', padding: '3px var(--space-2)',
                    borderRadius: 'var(--radius-button)',
                    border: `1px solid ${bookmarkSaved ? 'var(--accent-tint-border)' : 'var(--hairline)'}`,
                    background: bookmarkSaved ? 'var(--accent-tint-bg)' : 'var(--surface-alt)',
                    color: bookmarkSaved ? 'var(--action-primary)' : 'var(--text-secondary)',
                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3,
                    fontFamily: 'inherit', fontWeight: 600, whiteSpace: 'nowrap',
                    transition: 'background 0.3s, color 0.3s, border-color 0.3s',
                  }}
                >
                  <Bookmark size={10} aria-hidden="true" />
                  {bookmarkSaved ? 'Bookmarked!' : 'Bookmark'}
                </button>
              )}

              {/* ── Jump to next unrendered section (task 012) ── */}
              {nextUnrenderedChunkId && (
                <button
                  type="button"
                  aria-label="Jump to next unrendered section"
                  title="Jump to next unrendered section"
                  onClick={jumpToNextUnrendered}
                  style={{
                    fontSize: 'var(--type-micro)', padding: '3px var(--space-2)',
                    borderRadius: 'var(--radius-button)',
                    border: '1px solid var(--warning-tint-border)',
                    background: 'var(--warning-tint-bg)',
                    color: 'var(--warning-text)',
                    cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 3,
                    fontFamily: 'inherit', fontWeight: 600, whiteSpace: 'nowrap',
                  }}
                >
                  <SkipForward size={10} aria-hidden="true" />
                  Next unrendered
                </button>
              )}

              <div style={{ flex: 1 }} />

              {/* Contents ▾ dropdown */}
              <div ref={contentsDropdownRef} style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setContentsDropdownOpen(v => !v)}
                  aria-haspopup="listbox"
                  aria-expanded={contentsDropdownOpen}
                  style={{
                    fontSize: 'var(--type-micro)', padding: '3px var(--space-2)',
                    borderRadius: 'var(--radius-button)',
                    border: `1px solid ${contentsDropdownOpen ? 'var(--accent-tint-border)' : 'var(--hairline)'}`,
                    background: contentsDropdownOpen ? 'var(--accent-tint-bg)' : 'var(--surface-alt)',
                    color: contentsDropdownOpen ? 'var(--action-primary)' : 'var(--text-secondary)',
                    cursor: 'pointer', whiteSpace: 'nowrap',
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                    fontFamily: 'inherit', fontWeight: 600,
                  }}
                >
                  Contents {contentsDropdownOpen ? <ChevronUp size={9} aria-hidden="true" /> : <ChevronDown size={9} aria-hidden="true" />}
                </button>
                {contentsDropdownOpen && (
                  <ContentsDropdown
                    activeChapter={activeChapter}
                    onSelect={(n) => { if (setActiveChapter) setActiveChapter(n); }}
                    onClose={() => setContentsDropdownOpen(false)}
                  />
                )}
              </div>

              {/* Hairline separator */}
              <div style={{ width: 1, height: 20, background: 'var(--hairline)', flexShrink: 0 }} />

              {/* Prev / Next chapter buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                <button
                  type="button"
                  disabled={prevChapterN == null}
                  onClick={() => { if (prevChapterN != null && setActiveChapter) setActiveChapter(prevChapterN); }}
                  title={prevChapterN != null ? `Ch ${prevChapterN}` : 'No previous chapter'}
                  aria-label="Previous chapter"
                  style={{
                    fontSize: 'var(--type-micro)', padding: '3px var(--space-2)',
                    borderRadius: 'var(--radius-button) 0 0 var(--radius-button)',
                    border: '1px solid var(--hairline)', background: 'var(--surface-alt)',
                    color: prevChapterN == null ? 'var(--text-muted)' : 'var(--text-secondary)',
                    cursor: prevChapterN == null ? 'default' : 'pointer', whiteSpace: 'nowrap',
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                    fontFamily: 'inherit', opacity: prevChapterN == null ? 0.5 : 1,
                  }}
                >
                  <ChevronLeft size={10} aria-hidden="true" /> prev
                </button>
                <button
                  type="button"
                  disabled={nextChapterN == null}
                  onClick={() => { if (nextChapterN != null && setActiveChapter) setActiveChapter(nextChapterN); }}
                  title={nextChapterN != null ? `Ch ${nextChapterN}` : 'No next chapter'}
                  aria-label="Next chapter"
                  style={{
                    fontSize: 'var(--type-micro)', padding: '3px var(--space-2)',
                    borderRadius: '0 var(--radius-button) var(--radius-button) 0',
                    border: '1px solid var(--hairline)', borderLeft: 'none',
                    background: 'var(--surface-alt)',
                    color: nextChapterN == null ? 'var(--text-muted)' : 'var(--text-secondary)',
                    cursor: nextChapterN == null ? 'default' : 'pointer', whiteSpace: 'nowrap',
                    display: 'inline-flex', alignItems: 'center', gap: 3,
                    fontFamily: 'inherit', opacity: nextChapterN == null ? 0.5 : 1,
                  }}
                >
                  next <ChevronRight size={10} aria-hidden="true" />
                </button>
              </div>

              {/* Hairline separator */}
              <div style={{ width: 1, height: 20, background: 'var(--hairline)', flexShrink: 0 }} />

              {/* Export dropdown */}
              <div style={{ position: 'relative' }}>
                <div
                  onClick={() => setExportMenuOpen(m => !m)}
                  style={{
                    fontSize: 'var(--type-micro)', padding: '3px var(--space-2)',
                    borderRadius: 'var(--radius-button)',
                    border: '1px solid var(--hairline)', background: 'var(--surface-alt)',
                    color: 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap',
                    display: 'flex', alignItems: 'center', gap: 3,
                  }}
                >
                  Export <ChevronDown size={9} aria-hidden="true" />
                </div>
                {exportMenuOpen && <ExportMenu onClose={() => setExportMenuOpen(false)} />}
              </div>
            </div>

            {/* Cast selection indicator — shows who is active in the cast panel;
                assignment now commits via range selection, not sentence click */}
            {armedSwatch && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)',
                fontSize: 'var(--type-micro)',
                padding: '3px var(--space-2)', marginBottom: 'var(--space-2)', borderRadius: 'var(--radius-round)',
                background: SPEAKER_TOKEN[armedSwatch]?.tintBg ?? 'var(--surface-alt)',
                border: `1px solid ${SPEAKER_TOKEN[armedSwatch]?.tintBorder ?? 'var(--border)'}`,
                color: SPEAKER_TOKEN[armedSwatch]?.text ?? 'var(--text-secondary)',
              }}>
                {armedSwatch === 'ElderRowan' ? 'Elder Rowan' : armedSwatch} selected — select a text range to assign
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

                {/* Range assignment hint */}
                <SemanticChip variant="accent">
                  select any word range — even across sentence boundaries — to assign a character + variation to exactly that span
                </SemanticChip>

                {/* Paragraphs — rendered generically from each chunk's paragraphIndex
                    so the manuscript can grow without editing the render path. */}
                {Array.from(new Set(chunks.map(c => c.paragraphIndex)))
                  .sort((a, b) => a - b)
                  .map(pIdx => (
                    <div key={pIdx} style={{
                      fontSize: 'var(--type-reading)',
                      lineHeight: 'var(--leading-reading)',
                      color: 'var(--text-primary)',
                      maxWidth: '70ch',
                      position: 'relative',
                    }}>
                      {chunks.filter(c => c.paragraphIndex === pIdx).map(c => (
                        <React.Fragment key={c.id}>
                          {c.showNumberTag && (
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, marginRight: 4 }}>
                              {showNumbers && (
                                <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>
                                  {c.showNumberTag}
                                </span>
                              )}
                              {/* Render-state dot: grey = done, amber = not rendered */}
                              <span
                                title={CHUNK_RENDERED[c.id] !== false ? 'Rendered' : 'Not yet rendered'}
                                style={{
                                  width: 6, height: 6, borderRadius: '50%', flexShrink: 0, display: 'inline-block',
                                  background: CHUNK_RENDERED[c.id] !== false ? 'var(--success)' : 'var(--warning)',
                                  opacity: 0.7,
                                }}
                              />
                            </span>
                          )}
                          {renderChunkElement(c)}
                        </React.Fragment>
                      ))}
                    </div>
                  ))}
              </Col>
            ) : (
              /* Script view */
              <Col gap={0}>
                <div style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontStyle: 'italic', marginBottom: 'var(--space-2)' }}>
                  Script view — final read-through / play-script preview
                </div>
                {SCRIPT_LINES.map((line, i) => {
                  const tok = SPEAKER_TOKEN[line.speaker] ?? SPEAKER_TOKEN.Narrator;
                  return (
                    <div key={i} style={{
                      marginBottom: 'var(--space-1)', borderRadius: 'var(--radius-card)', padding: 'var(--space-1) var(--space-2)',
                      background: line.rendering ? 'var(--accent-tint-bg)' : 'transparent',
                      border: line.rendering ? '1px solid var(--accent-tint-border)' : '1px solid transparent',
                    }}>
                      <Row gap={6} style={{ alignItems: 'center', marginBottom: 2 }}>
                        <span style={{ width: 7, height: 7, borderRadius: 'var(--radius-round)', background: tok.text, display: 'inline-block', flexShrink: 0 }} />
                        <span style={{ fontSize: 'var(--type-micro)', fontWeight: 700, color: tok.text, textTransform: 'uppercase', letterSpacing: 'var(--tracking-wide)' }}>
                          {line.speaker}
                        </span>
                        {line.rendering && (
                          <SemanticChip variant="accent">rendering…</SemanticChip>
                        )}
                      </Row>
                      <div style={{ fontSize: 'var(--type-caption)', color: 'var(--text-primary)', lineHeight: 'var(--leading-normal)', paddingLeft: 13 }}>
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

          {/* Cast panel — chapter-aware three-tier slide-out */}
          <CastPanel
            activeChapter={activeChapter}
            armedSwatch={armedSwatch}
            onSwatchClick={handleSwatchClick}
          />

          {/* Task 013: Pronunciation lexicon side panel (toggled by the toolbar button) */}
          {showLexicon && <LexiconPanel />}
        </div>

        {/* Render controls strip */}
        <div style={{
          flexShrink: 0, borderTop: '1px solid var(--hairline)',
          padding: 'var(--space-1) var(--space-3)',
          display: 'flex', alignItems: 'center', gap: 'var(--space-2)', background: 'var(--surface)',
        }}>
          {/* Primary render actions */}
          <Btn primary small>
            <Play size={10} style={{ marginRight: 3 }} aria-hidden="true" />
            Render chapter
          </Btn>
          <Btn small onClick={() => setIsRenderingRemaining(true)}>Render remaining</Btn>
          {/* Hairline separator before stop */}
          <div style={{ width: 1, height: 16, background: 'var(--hairline)', flexShrink: 0 }} />
          {/* Stop all — ghost button using error tokens */}
          <button
            aria-label="Stop all rendering"
            onClick={() => {
              setIsRenderingRemaining(false);
              setRenderProgress(0.45);
            }}
            style={{
              fontSize: 'var(--type-micro)', fontWeight: 600,
              padding: '3px var(--space-2)',
              borderRadius: 'var(--radius-button)',
              border: '1px solid var(--error)', color: 'var(--error)', background: 'transparent',
              cursor: 'pointer', whiteSpace: 'nowrap',
              display: 'inline-flex', alignItems: 'center', gap: 4,
            }}
          >
            <Square size={9} aria-hidden="true" />
            Stop all
          </button>
          {isRenderingRemaining && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-1)', marginLeft: 'var(--space-3)' }}>
              <StatusOrb status="running" progress={renderProgress} size={14} />
              <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-primary)', fontWeight: 600 }}>
                Queue Remaining: 3 chapters ({Math.round(renderProgress * 100)}% total progress)
              </span>
              <div style={{ width: 80 }}>
                <ProgressBar pct={renderProgress * 100} height={4} shimmer />
              </div>
            </div>
          )}
          <div style={{ flex: 1 }} />
          {/* Hairline before metadata chips */}
          <div style={{ width: 1, height: 16, background: 'var(--hairline)', flexShrink: 0 }} />
          <Chip active>Neural Engine</Chip>
          <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)' }}>ETA ~12m</span>
        </div>
      </Col>
    </>
  );
};
