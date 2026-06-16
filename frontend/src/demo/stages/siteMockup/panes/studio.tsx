/**
 * siteMockup/panes/studio.tsx — Studio pane
 * Feature D:
 *  - Chapter-nav cluster (top-right of prose column): ← Save & prev · Save & next → + Export ▾ (WAV/MP3)
 *  - "Commit changes" green button with "2 unsaved text edits" chip → Resync Preview modal
 *  - Analysis strip under view-mode pills: stats + green badge + expandable amber ACTION REQUIRED badge
 *  - One prose sentence has hover-look inline controls (voice select chip, ▶, ↻ rebuild)
 *  - "Stop all" red ghost button next to render controls
 */
import React, { useState, useEffect } from 'react';
import { Row, Col, Chip, Btn, ProgressBar, SemanticChip, Avatar, Card, Panel, StatusOrb } from '../shared';
import { Play, RefreshCw, ChevronDown, ChevronUp, Download, ChevronLeft, ChevronRight, Square } from 'lucide-react';

// Speaker token palette — maps speaker IDs to fixed design-token colors (no raw hex)
// We use pill token families as named palette entries for the 4-speaker cast
const SPEAKER_TOKEN: Record<string, { text: string; tintBg: string; tintBorder: string }> = {
  Narrator:   { text: 'var(--success-text)',            tintBg: 'var(--success-tint-bg)',       tintBorder: 'var(--success)' },
  Maren:      { text: 'var(--pill-class-text)',          tintBg: 'var(--pill-class-bg)',         tintBorder: 'var(--pill-class-border)' },
  Dov:        { text: 'var(--pill-age-text)',            tintBg: 'var(--pill-age-bg)',           tintBorder: 'var(--pill-age-border)' },
  ElderRowan: { text: 'var(--pill-extended-text)',       tintBg: 'var(--pill-extended-bg)',      tintBorder: 'var(--pill-extended-border)' },
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

const CAST_SWATCHES: { id: string; name: string }[] = [
  { id: 'Narrator',   name: 'Narrator (default)' },
  { id: 'Maren',      name: 'Maren' },
  { id: 'Dov',        name: 'Dov' },
  { id: 'ElderRowan', name: 'Elder Rowan' },
];

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

// ---------- Hover sentence controls ----------
const HoverSentenceControls: React.FC = () => (
  <span style={{
    display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)', marginLeft: 'var(--space-1)',
    fontSize: 'var(--type-micro)', verticalAlign: 'middle',
  }}>
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 2,
      background: 'var(--surface)', border: '1px solid var(--border)',
      borderRadius: 'var(--radius-round)', padding: '1px 6px', cursor: 'pointer',
      color: 'var(--pill-class-text)', fontSize: 'var(--type-micro)',
    }}>
      Maren <ChevronDown size={9} aria-hidden="true" />
    </span>
    <button aria-label="Preview segment" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--accent)', display: 'flex', alignItems: 'center' }}>
      <Play size={13} />
    </button>
    <button aria-label="Rebuild segment" style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', color: 'var(--text-muted)', display: 'flex', alignItems: 'center' }}>
      <RefreshCw size={11} />
    </button>
  </span>
);

interface Chunk {
  id: string;
  text: string;
  safeText?: string;
  speaker?: string;
  isHighlighted?: boolean;
  styleType?: 'underline' | 'bg-success' | 'bg-accent' | 'none';
  sentenceId?: SentenceId;
  hasPlay?: boolean;
  hasHoverControls?: boolean;
  isRendering?: boolean;
  paragraphIndex: number;
  showNumberTag?: string;
}

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

export const StudioPane: React.FC = () => {
  const [viewMode, setViewMode] = useState<'book' | 'script'>('book');
  const [safeText, setSafeText] = useState(false);
  const [showNumbers, setShowNumbers] = useState(false);
  const [armedSwatch, setArmedSwatch] = useState<string | null>(null);
  const [sentenceSpeaker, setSentenceSpeaker] = useState<Record<SentenceId, string>>({
    s1: 'Narrator', s2: 'Maren', s3: 'Dov', s4: 'Narrator', s5: 'Dov',
  });
  const [showResync, setShowResync] = useState(false);
  const [exportMenuOpen, setExportMenuOpen] = useState(false);
  const [actionExpanded, setActionExpanded] = useState(false);

  // State for dynamic chunks
  const [chunks, setChunks] = useState<Chunk[]>(initialChunks);
  // Context menu for sub-sentence speaker assignment
  const [contextMenu, setContextMenu] = useState<SelectionContextMenu | null>(null);

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

  const handleSentenceClick = (sid: SentenceId) => {
    if (!armedSwatch) return;
    setSentenceSpeaker(prev => ({ ...prev, [sid]: armedSwatch }));
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

  const handleAssignSpeakerToSelection = (speaker: string) => {
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
            });
          }

          nextChunks.push({
            ...chunk,
            id: `${chunk.id}-selected-${stamp}`,
            text: textSelected,
            speaker,
            isHighlighted: true,
          });

          if (textAfter) {
            nextChunks.push({
              ...chunk,
              id: `${chunk.id}-after-${stamp}`,
              text: textAfter,
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

    const handleClick = () => {
      if (chunk.sentenceId) {
        handleSentenceClick(chunk.sentenceId);
      } else if (armedSwatch) {
        setChunks(prev => prev.map(c => c.id === chunk.id ? { ...c, speaker: armedSwatch } : c));
      }
    };

    const cursorStyle = armedSwatch ? 'crosshair' : (chunk.hasPlay || chunk.sentenceId ? 'pointer' : 'default');

    if (chunk.isHighlighted) {
      return (
        <span
          key={chunk.id}
          data-chunk-id={chunk.id}
          onClick={handleClick}
          style={{
            background: tok.tintBg,
            color: tok.text,
            border: `1px solid ${tok.tintBorder}`,
            borderRadius: 'var(--radius-button)',
            padding: '2px 4px',
            margin: '0 2px',
            cursor: cursorStyle,
            fontWeight: 500,
            display: 'inline-block',
          }}
        >
          {text}
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
          }}
        >
          {text}
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
          }}
        >
          {chunk.hasPlay && (
            <Play size={9} style={{ marginRight: 3, color: 'var(--success-text)', verticalAlign: 'middle' }} aria-hidden="true" />
          )}
          {text}
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
          }}
        >
          {text}
          {chunk.isRendering && (
            <span style={{ fontSize: 'var(--type-micro)', color: 'var(--accent)', fontStyle: 'italic', marginLeft: 5 }}>
              rendering…
            </span>
          )}
        </span>
      );
    }

    if (chunk.hasHoverControls) {
      return (
        <span key={chunk.id} style={{ position: 'relative', display: 'inline' }}>
          <span
            data-chunk-id={chunk.id}
            onClick={handleClick}
            style={{
              borderBottom: `2px solid ${tok.text}`,
              paddingBottom: 1,
              cursor: cursorStyle,
            }}
          >
            {text}
          </span>
          <HoverSentenceControls />
          <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontStyle: 'italic', marginLeft: 4 }}>
            per-section controls on hover
          </span>
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
        }}
      >
        {text}
      </span>
    );
  };

  return (
    <>
      {showResync && <ResyncModal onClose={() => setShowResync(false)} />}

      {contextMenu && (
        <div
          id="selection-context-menu"
          style={{
            position: 'fixed',
            top: contextMenu.y - 45,
            left: contextMenu.x,
            transform: 'translateX(-50%)',
            background: 'var(--surface)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-card)',
            padding: 'var(--space-1) var(--space-2)',
            boxShadow: 'var(--shadow-md)',
            display: 'flex',
            gap: 6,
            zIndex: 1000,
            alignItems: 'center'
          }}
        >
          <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-secondary)', marginRight: 2 }}>Assign:</span>
          {['Narrator', 'Maren', 'Dov'].map(sp => {
            const tok = SPEAKER_TOKEN[sp];
            return (
              <button
                key={sp}
                onClick={() => handleAssignSpeakerToSelection(sp)}
                style={{
                  background: tok.tintBg,
                  border: `1px solid ${tok.tintBorder}`,
                  color: tok.text,
                  fontSize: 'var(--type-micro)',
                  padding: '2px 6px',
                  borderRadius: 'var(--radius-button)',
                  cursor: 'pointer',
                  fontWeight: 600,
                }}
              >
                {sp}
              </button>
            );
          })}
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
                  color: viewMode === mode ? 'var(--accent)' : 'var(--text-secondary)',
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
              border: `1px solid ${safeText ? 'var(--accent)' : 'var(--hairline)'}`,
              background: safeText ? 'var(--accent-tint-bg)' : 'transparent',
              color: safeText ? 'var(--accent)' : 'var(--text-muted)',
            }}
          >Safe text</div>
          <div
            onClick={() => setShowNumbers(n => !n)}
            style={{
              fontSize: 'var(--type-micro)', padding: '2px var(--space-2)',
              borderRadius: 'var(--radius-round)', cursor: 'pointer',
              border: `1px solid ${showNumbers ? 'var(--accent)' : 'var(--hairline)'}`,
              background: showNumbers ? 'var(--accent-tint-bg)' : 'transparent',
              color: showNumbers ? 'var(--accent)' : 'var(--text-muted)',
            }}
          >#</div>
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
          <SemanticChip variant="success">✓ 3/3 long sentences auto-fixed</SemanticChip>
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
        <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
          {/* Content area — prose */}
          <div onMouseUp={handleMouseUp} style={{ flex: 1, overflowY: 'auto', padding: 'var(--space-3) var(--space-4)' }}>
            {/* Chapter-nav cluster: unsaved chip + Commit + nav + export */}
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

              <div style={{ flex: 1 }} />

              {/* Right group: chapter nav + export — hairline-separated */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 0 }}>
                {/* Save & prev */}
                <div style={{
                  fontSize: 'var(--type-micro)', padding: '3px var(--space-2)',
                  borderRadius: 'var(--radius-button) 0 0 var(--radius-button)',
                  border: '1px solid var(--hairline)', background: 'var(--surface-alt)',
                  color: 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap',
                  display: 'flex', alignItems: 'center', gap: 3,
                }}>
                  <ChevronLeft size={10} aria-hidden="true" /> Save &amp; prev
                </div>
                {/* Save & next */}
                <div style={{
                  fontSize: 'var(--type-micro)', padding: '3px var(--space-2)',
                  borderRadius: '0 var(--radius-button) var(--radius-button) 0',
                  border: '1px solid var(--hairline)', borderLeft: 'none',
                  background: 'var(--surface-alt)',
                  color: 'var(--text-secondary)', cursor: 'pointer', whiteSpace: 'nowrap',
                  display: 'flex', alignItems: 'center', gap: 3,
                }}>
                  Save &amp; next <ChevronRight size={10} aria-hidden="true" />
                </div>
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

            {/* Paint-mode floating chip */}
            {armedSwatch && (
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 'var(--space-1)',
                fontSize: 'var(--type-micro)',
                padding: '3px var(--space-2)', marginBottom: 'var(--space-2)', borderRadius: 'var(--radius-round)',
                background: SPEAKER_TOKEN[armedSwatch]?.tintBg ?? 'var(--surface-alt)',
                border: `1px solid ${SPEAKER_TOKEN[armedSwatch]?.tintBorder ?? 'var(--border)'}`,
                color: SPEAKER_TOKEN[armedSwatch]?.text ?? 'var(--text-secondary)',
              }}>
                painting: {armedSwatch === 'ElderRowan' ? 'Elder Rowan' : armedSwatch} — click sentences to assign
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

                {/* Paragraph 1 */}
                <div style={{
                  fontSize: 'var(--type-reading)',
                  lineHeight: 'var(--leading-reading)',
                  color: 'var(--text-primary)',
                  maxWidth: '70ch',
                }}>
                  {chunks.filter(c => c.paragraphIndex === 0).map(c => (
                    <React.Fragment key={c.id}>
                      {showNumbers && c.showNumberTag && (
                        <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', marginRight: 4 }}>
                          {c.showNumberTag}
                        </span>
                      )}
                      {renderChunkElement(c)}
                    </React.Fragment>
                  ))}
                </div>

                {/* Paragraph 2 — with hover sentence controls on one sentence */}
                <div style={{
                  fontSize: 'var(--type-reading)',
                  lineHeight: 'var(--leading-reading)',
                  color: 'var(--text-primary)',
                  maxWidth: '70ch',
                }}>
                  {chunks.filter(c => c.paragraphIndex === 1).map(c => (
                    <React.Fragment key={c.id}>
                      {showNumbers && c.showNumberTag && (
                        <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', marginRight: 4 }}>
                          {c.showNumberTag}
                        </span>
                      )}
                      {renderChunkElement(c)}
                    </React.Fragment>
                  ))}
                </div>

                {/* Paragraph 3 */}
                <div style={{
                  fontSize: 'var(--type-reading)',
                  lineHeight: 'var(--leading-reading)',
                  color: 'var(--text-primary)',
                  maxWidth: '70ch',
                  position: 'relative',
                }}>
                  {chunks.filter(c => c.paragraphIndex === 2).map(c => (
                    <React.Fragment key={c.id}>
                      {showNumbers && c.showNumberTag && (
                        <span style={{ fontSize: 'var(--type-micro)', color: 'var(--text-muted)', marginRight: 4 }}>
                          {c.showNumberTag}
                        </span>
                      )}
                      {renderChunkElement(c)}
                    </React.Fragment>
                  ))}
                  <span style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    marginLeft: 'var(--space-1)',
                    fontSize: 'var(--type-micro)',
                    color: 'var(--accent)',
                    background: 'var(--accent-tint-bg)',
                    border: '1px solid var(--accent-tint-border)',
                    borderRadius: 'var(--radius-round)',
                    padding: '1px 6px',
                    cursor: 'default',
                    verticalAlign: 'middle',
                  }}>
                    Select text to assign sub-sentence speaker
                  </span>
                </div>
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

          {/* Cast palette — right column, ~160px */}
          <Panel style={{
            width: 160, flexShrink: 0,
            borderLeft: '1px solid var(--hairline)',
            borderTop: 'none', borderBottom: 'none', borderRight: 'none',
            borderRadius: 0,
            boxShadow: 'none',
            background: 'var(--surface)',
            display: 'flex', flexDirection: 'column', padding: 0,
          }}>
            {/* Eyebrow section label */}
            <div style={{
              fontSize: 'var(--type-micro)',
              fontWeight: 'var(--type-weight-micro)' as unknown as number,
              letterSpacing: 'var(--tracking-wide)', textTransform: 'uppercase',
              color: 'var(--text-muted)',
              padding: 'var(--space-2) var(--space-3)',
              borderBottom: '1px solid var(--hairline)',
              flexShrink: 0,
            }}>Cast</div>
            <Col gap={0} style={{ flex: 1, padding: 'var(--space-1) 0' }}>
              {CAST_SWATCHES.map((sw, idx) => {
                const isArmed = armedSwatch === sw.id;
                const tok = SPEAKER_TOKEN[sw.id] ?? SPEAKER_TOKEN.Narrator;
                return (
                  <React.Fragment key={sw.id}>
                    {idx > 0 && (
                      <div style={{ height: 1, background: 'var(--hairline)', margin: '0 var(--space-3)' }} />
                    )}
                    <button
                      type="button"
                      onClick={() => handleSwatchClick(sw.id)}
                      aria-pressed={isArmed}
                      style={{
                        width: '100%',
                        border: 0,
                        fontFamily: 'inherit',
                        display: 'flex', alignItems: 'center', gap: 'var(--space-2)',
                        padding: 'var(--space-2) var(--space-3)',
                        textAlign: 'left',
                        cursor: 'pointer',
                        background: isArmed ? tok.tintBg : 'transparent',
                        borderLeft: isArmed ? `3px solid ${tok.text}` : '3px solid transparent',
                        transition: 'background 0.15s',
                      }}
                    >
                      {/* Color dot — larger for visibility */}
                      <span style={{
                        width: 12, height: 12, borderRadius: 'var(--radius-round)',
                        background: tok.text,
                        flexShrink: 0, display: 'inline-block',
                        boxShadow: isArmed ? `0 0 0 2px ${tok.tintBorder}` : 'none',
                      }} />
                      {/* Avatar */}
                      <Avatar name={sw.id === 'ElderRowan' ? 'ER' : sw.id} size={20} style={{
                        background: tok.tintBg,
                        border: `1px solid ${tok.tintBorder}`,
                      }} />
                      <span style={{
                        fontSize: 'var(--type-micro)', fontWeight: isArmed ? 700 : 400,
                        color: isArmed ? tok.text : 'var(--text-secondary)',
                        lineHeight: 'var(--leading-snug)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1,
                      }}>
                        {sw.name}
                      </span>
                    </button>
                  </React.Fragment>
                );
              })}
            </Col>
            <div style={{
              padding: 'var(--space-2) var(--space-3)',
              borderTop: '1px solid var(--hairline)',
              fontSize: 'var(--type-micro)', color: 'var(--text-muted)', fontStyle: 'italic',
              lineHeight: 'var(--leading-snug)',
            }}>
              paint a voice, then click text to assign sub-sentence spans
            </div>
          </Panel>
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
