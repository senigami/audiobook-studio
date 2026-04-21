import React, { useMemo, useState } from 'react';
import {
  BookOpen,
  AlignLeft,
  Eye,
  Hash,
  Play,
  WandSparkles,
  RotateCcw,
} from 'lucide-react';
import type {
  ScriptViewResponse,
  Character,
  ScriptSpan,
  ScriptRenderBatch,
} from '../../types';
import './ScriptView.css';

interface ScriptViewProps {
  data: ScriptViewResponse;
  characters: Character[];
  onGenerateBatch: (spanIds: string[]) => void;
  pendingSpanIds: Set<string>;
  playingSpanId?: string | null;
  onPlaySpan?: (spanId: string) => void;
}

export const ScriptView: React.FC<ScriptViewProps> = ({
  data,
  characters,
  onGenerateBatch,
  pendingSpanIds,
  playingSpanId = null,
  onPlaySpan,
}) => {
  const [viewMode, setViewMode] = useState<'book' | 'script'>('book');
  const [showSafeText, setShowSafeText] = useState(false);
  const [showNumbers, setShowNumbers] = useState(false);

  const spanMap = useMemo(() => {
    const map = new Map<string, ScriptSpan>();
    data.spans?.forEach(span => map.set(span.id, span));
    return map;
  }, [data.spans]);

  const charMap = useMemo(() => {
    const map = new Map<string, Character>();
    characters?.forEach(character => map.set(character.id, character));
    return map;
  }, [characters]);

  const batchMap = useMemo(() => {
    const map = new Map<string, ScriptRenderBatch>();
    data.render_batches?.forEach(batch => {
      batch.span_ids.forEach(spanId => map.set(spanId, batch));
    });
    return map;
  }, [data.render_batches]);

  const renderSpan = (span: ScriptSpan) => {
    const char = span.character_id ? charMap.get(span.character_id) : null;
    const batch = batchMap.get(span.id);
    const isPending = pendingSpanIds.has(span.id);
    const isPlaying = playingSpanId === span.id;
    const isReady = span.status === 'rendered';
    const displayText = showSafeText ? (span.sanitized_text || span.text) : span.text;

    const textClassName = [
      'script-span-text',
      isPlaying ? 'script-span-text-playing' : '',
      isReady ? 'script-span-text-ready' : 'script-span-text-muted',
    ].filter(Boolean).join(' ');

    return (
      <span
        key={span.id}
        className={`script-span ${char ? 'is-assigned' : ''} ${isPlaying ? 'is-playing' : ''}`}
        style={char ? ({ '--script-span-accent': char.color } as React.CSSProperties) : undefined}
      >
        {showNumbers && (
          <span className="script-span-number">{span.order_index + 1}</span>
        )}

        <span className={textClassName}>{displayText}</span>

        <div className="span-controls">
          <button
            className="span-control-btn"
            onClick={() => onPlaySpan?.(span.id)}
            title="Play Audio"
            disabled={span.status !== 'rendered'}
          >
            <Play size={14} fill={span.status === 'rendered' ? 'currentColor' : 'none'} />
          </button>
          <button
            className="span-control-btn"
            onClick={() => batch && onGenerateBatch(batch.span_ids)}
            title={span.status === 'rendered' ? 'Rebuild' : 'Generate'}
            disabled={isPending}
          >
            {span.status === 'rendered' ? <RotateCcw size={14} /> : <WandSparkles size={14} />}
          </button>
        </div>
      </span>
    );
  };

  const renderBook = () => {
    return data.paragraphs.map(para => {
      const firstSpan = spanMap.get(para.span_ids[0]);
      const char = firstSpan?.character_id ? charMap.get(firstSpan.character_id) : null;

      return (
        <div
          key={para.id}
          className="book-paragraph"
          style={char ? ({ '--book-paragraph-accent': char.color } as React.CSSProperties) : undefined}
        >
          <div className="book-paragraph-text">
            {para.span_ids.map((spanId, index) => {
              const span = spanMap.get(spanId);
              if (!span) return null;

              return (
                <React.Fragment key={spanId}>
                  {renderSpan(span)}
                  {index < para.span_ids.length - 1 ? ' ' : null}
                </React.Fragment>
              );
            })}
          </div>
        </div>
      );
    });
  };

  const renderScript = () => {
    let lastCharId: string | null = null;

    return data.spans.map(span => {
      const char = span.character_id ? charMap.get(span.character_id) : null;
      const isFirstInRun = span.character_id !== lastCharId;
      lastCharId = span.character_id;

      return (
        <div
          key={span.id}
          className={`script-line ${!isFirstInRun ? 'connected-top' : ''} ${playingSpanId === span.id ? 'is-playing' : ''}`}
        >
          <div className="script-line-speaker" style={char ? { color: char.color } : undefined}>
            {isFirstInRun ? (char?.name || 'Narrator') : ''}
          </div>
          <div className="script-line-content">
            {renderSpan(span)}
          </div>
        </div>
      );
    });
  };

  return (
    <div className="script-view-container glass-panel">
      <div className="script-view-toolbar">
        <div className="script-view-toggle-group">
          <button
            className={`script-view-toggle-btn ${viewMode === 'book' ? 'active' : ''}`}
            onClick={() => setViewMode('book')}
          >
            <BookOpen size={16} style={{ display: 'inline', marginRight: '6px' }} />
            Book
          </button>
          <button
            className={`script-view-toggle-btn ${viewMode === 'script' ? 'active' : ''}`}
            onClick={() => setViewMode('script')}
          >
            <AlignLeft size={16} style={{ display: 'inline', marginRight: '6px' }} />
            Script
          </button>
        </div>

        <div className="script-view-toggle-actions">
          <button
            className={`script-view-pill-toggle ${showSafeText ? 'is-active' : ''}`}
            onClick={() => setShowSafeText(!showSafeText)}
            title="Toggle Safe Text"
            aria-pressed={showSafeText}
          >
            <Eye size={16} />
            <span>Safe</span>
          </button>
          <button
            className={`script-view-pill-toggle ${showNumbers ? 'is-active' : ''}`}
            onClick={() => setShowNumbers(!showNumbers)}
            title="Toggle Segment Numbers"
            aria-pressed={showNumbers}
          >
            <Hash size={16} />
            <span>Numbers</span>
          </button>
        </div>
      </div>

      <div className="script-content-scroll">
        {viewMode === 'book' ? renderBook() : renderScript()}
      </div>
    </div>
  );
};
