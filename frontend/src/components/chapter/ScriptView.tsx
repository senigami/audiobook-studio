import React, { useMemo, useState, useRef, useEffect } from 'react';
import {
  BookOpen,
  AlignLeft,
  Eye,
  Hash,
  Play,
  WandSparkles,
  RotateCcw,
  UserPlus,
  Sparkles,
} from 'lucide-react';
import type {
  ScriptViewResponse,
  Character,
  ScriptSpan,
  ScriptRenderBatch,
  ScriptRangeAssignment,
} from '../../types';
import './ScriptView.css';

interface ScriptViewProps {
  data: ScriptViewResponse;
  characters: Character[];
  onGenerateBatch: (spanIds: string[]) => void;
  pendingSpanIds: Set<string>;
  playingSpanId?: string | null;
  onPlaySpan?: (spanId: string) => void;
  onAssign?: (spanIds: string[]) => void;
  onAssignRange?: (range: ScriptRangeAssignment) => void;
  activeCharacterId?: string | null;
  onCompact?: () => void;
  isCompacting?: boolean;
}

export const ScriptView: React.FC<ScriptViewProps> = ({
  data,
  characters,
  onGenerateBatch,
  pendingSpanIds,
  playingSpanId = null,
  onPlaySpan,
  onAssign,
  onAssignRange,
  activeCharacterId,
  onCompact,
  isCompacting = false,
}) => {
  const [viewMode, setViewMode] = useState<'book' | 'script'>('book');
  const [showSafeText, setShowSafeText] = useState(false);
  const [showNumbers, setShowNumbers] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<ScriptRangeAssignment | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

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

  const getSpanIdFromNode = (node: Node | null): string | null => {
    let curr = node;
    while (curr && curr !== containerRef.current) {
      if (curr instanceof HTMLElement && curr.dataset.spanId) {
        return curr.dataset.spanId;
      }
      curr = curr.parentNode;
    }
    return null;
  };

  const handleSelection = () => {
    const selection = window.getSelection();
    if (!selection || selection.isCollapsed || viewMode !== 'book') {
      setPendingSelection(null);
      setPopoverPos(null);
      return;
    }

    const range = selection.getRangeAt(0);
    const startSpanId = getSpanIdFromNode(range.startContainer);
    const endSpanId = getSpanIdFromNode(range.endContainer);

    if (!startSpanId || !endSpanId) {
      setPendingSelection(null);
      setPopoverPos(null);
      return;
    }

    const startOffset = range.startOffset;
    const endOffset = range.endOffset;

    setPendingSelection({
      start_span_id: startSpanId,
      start_offset: startOffset,
      end_span_id: endSpanId,
      end_offset: endOffset,
    });

    const rect = range.getBoundingClientRect();
    const containerRect = containerRef.current?.getBoundingClientRect();
    if (containerRect) {
      setPopoverPos({
        top: rect.top - containerRect.top - 40,
        left: rect.left - containerRect.left + rect.width / 2,
      });
    }
  };

  useEffect(() => {
    const onMouseDown = () => {
      // Clear previous selection popover when starting a new selection
      setPendingSelection(null);
      setPopoverPos(null);
    };
    document.addEventListener('mousedown', onMouseDown);
    return () => document.removeEventListener('mousedown', onMouseDown);
  }, []);

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
        data-span-id={span.id}
        className={`script-span ${char ? 'is-assigned' : ''} ${isPlaying ? 'is-playing' : ''} ${activeCharacterId !== undefined ? 'is-paintable' : ''}`}
        style={char ? ({ '--script-span-accent': char.color } as React.CSSProperties) : undefined}
        onClick={(e) => {
          // If we have a selection, don't trigger whole-span assignment yet
          const selection = window.getSelection();
          if (selection && !selection.isCollapsed) return;

          if (activeCharacterId !== undefined) {
            e.stopPropagation();
            onAssign?.([span.id]);
          }
        }}
      >
        {showNumbers && (
          <span className="script-span-number">{span.order_index + 1}</span>
        )}

        <span className={textClassName}>{displayText}</span>

        <div className="span-controls">
          <button
            className="span-control-btn"
            onClick={(e) => {
              e.stopPropagation();
              onPlaySpan?.(span.id);
            }}
            title="Play Audio"
            disabled={span.status !== 'rendered'}
          >
            <Play size={14} fill={span.status === 'rendered' ? 'currentColor' : 'none'} />
          </button>
          <button
            className="span-control-btn"
            onClick={(e) => {
              e.stopPropagation();
              batch && onGenerateBatch(batch.span_ids);
            }}
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
          className={`book-paragraph ${activeCharacterId !== undefined ? 'is-paintable' : ''}`}
          style={char ? ({ '--book-paragraph-accent': char.color } as React.CSSProperties) : undefined}
          onClick={() => {
             // If we have a selection, don't trigger whole-paragraph assignment
             const selection = window.getSelection();
             if (selection && !selection.isCollapsed) return;

             if (activeCharacterId !== undefined) {
               onAssign?.(para.span_ids);
             }
          }}
        >
          <div className="book-paragraph-gutter" />
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
    <div 
      className="script-view-container glass-panel" 
      ref={containerRef}
      onMouseUp={handleSelection}
    >
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

          <button
            className={`script-view-pill-toggle ${isCompacting ? 'is-loading' : ''}`}
            onClick={onCompact}
            title="Clean up and merge compatible spans"
            disabled={isCompacting}
          >
            <Sparkles size={16} className={isCompacting ? 'animate-spin' : ''} />
            <span>{isCompacting ? 'Cleaning...' : 'Clean Up'}</span>
          </button>
        </div>
      </div>

      <div className="script-content-scroll">
        {viewMode === 'book' ? renderBook() : renderScript()}
      </div>

      {popoverPos && pendingSelection && (
        <div 
          className="selection-popover fade-in"
          style={{
            position: 'absolute',
            top: popoverPos.top,
            left: popoverPos.left,
            transform: 'translateX(-50%)',
            zIndex: 1000,
          }}
        >
          <button 
            className="btn-primary selection-assign-btn"
            onClick={(e) => {
              e.stopPropagation();
              if (activeCharacterId !== undefined) {
                onAssignRange?.({
                   ...pendingSelection,
                   character_id: activeCharacterId
                });
              }
              setPendingSelection(null);
              setPopoverPos(null);
              window.getSelection()?.removeAllRanges();
            }}
          >
            <UserPlus size={14} style={{ marginRight: '6px' }} />
            Assign {activeCharacterId ? (charMap.get(activeCharacterId)?.name || 'Character') : 'Narrator'}
          </button>
        </div>
      )}
    </div>
  );
};
