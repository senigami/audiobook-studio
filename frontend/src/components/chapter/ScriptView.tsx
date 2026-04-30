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
} from 'lucide-react';
import type {
  ScriptViewResponse,
  Character,
  SpeakerProfile,
  ScriptSpan,
  ScriptRenderBatch,
  ScriptRangeAssignment,
  TtsEngine,
  Speaker,
} from '../../types';
import { getVoiceProfileEngine, formatVoiceEngineLabel, buildVoiceOptions } from '../../utils/voiceProfiles';
import { VoiceProfileSelect } from './VoiceProfileSelect';
import './ScriptView.css';

interface ScriptViewProps {
  data: ScriptViewResponse;
  characters: Character[];
  onGenerateBatch?: (spanIds: string[]) => void | Promise<void>;
  pendingSpanIds: Set<string>;
  playingSpanId?: string | null;
  playingSpanIds?: Set<string>;
  onPlaySpan?: (spanId: string) => void;
  onAssign?: (spanIds: string[]) => void;
  onAssignRange?: (range: ScriptRangeAssignment) => void;
  onAssignToCharacter?: (spanIds: string[], characterId: string | null, profileName: string | null) => void;
  activeCharacterId?: string | null;
  engines?: TtsEngine[];
  speakerProfiles?: SpeakerProfile[];
  speakers?: Speaker[];
}

export const ScriptView: React.FC<ScriptViewProps> = ({
  data,
  characters,
  onGenerateBatch,
  pendingSpanIds,
  playingSpanId = null,
  playingSpanIds,
  onPlaySpan,
  onAssign,
  onAssignRange,
  onAssignToCharacter,
  activeCharacterId,
  engines = [],
  speakerProfiles = [],
  speakers = [],
}) => {
  const anyEnginesEnabled = useMemo(() => engines.some(e => e.enabled && e.status === 'ready'), [engines]);
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

  const profileEngineMap = useMemo(() => {
    return new Map(
      speakerProfiles
        .filter(profile => !!profile?.name)
        .map(profile => [profile.name, getVoiceProfileEngine(profile) || 'unknown'])
    );
  }, [speakerProfiles]);

  const engineIsEnabled = (engineId: string | null | undefined) => {
    if (engines.length === 0) {
      return true;
    }
    if (!engineId || engineId === 'unknown') {
      return anyEnginesEnabled;
    }
    return engines.some(engine => engine.engine_id === engineId && engine.enabled && engine.status === 'ready');
  };

  const batchEngineStatus = (spanIds: string[]) => {
    const enginesForBatch = new Set<string>();
    spanIds.forEach(spanId => {
      const span = spanMap.get(spanId);
      const engineId = span?.speaker_profile_name ? profileEngineMap.get(span.speaker_profile_name) || null : null;
      if (engineId) enginesForBatch.add(engineId);
    });

    const unavailable = Array.from(enginesForBatch).find(engineId => !engineIsEnabled(engineId));
    return {
      canGenerate: unavailable ? false : anyEnginesEnabled,
      unavailableEngine: unavailable,
    };
  };

  const isPlayingSpan = (spanId: string) => {
    if (playingSpanIds) return playingSpanIds.has(spanId);
    return playingSpanId === spanId;
  };

  const availableVoices = useMemo(() => {
    const all = buildVoiceOptions(speakerProfiles, speakers, engines, characters);
    // For sentence reassignment, only show Default + Characters.
    // Exclude raw/orphan voices.
    return all.filter(v => v.character_name !== undefined);
  }, [speakerProfiles, speakers, engines, characters]);

  const assignableVoices = useMemo(
    () => availableVoices.map(option => (
      option.id === 'separator-line'
        ? option
        : { ...option, disabled: false }
    )),
    [availableVoices]
  );

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
    const isPlaying = isPlayingSpan(span.id);
    const isReady = span.status === 'rendered';
    const displayText = showSafeText ? (span.sanitized_text || span.text) : span.text;
    const batchStatus = batch ? batchEngineStatus(batch.span_ids) : { canGenerate: false, unavailableEngine: null as string | null };

    const isHighlighted = char && activeCharacterId === char.id;

    const textClassName = [
      'script-span-text',
      isPlaying ? 'script-span-text-playing' : '',
      isReady ? 'script-span-text-ready' : 'script-span-text-muted',
    ].filter(Boolean).join(' ');

    return (
      <span
        key={span.id}
        data-span-id={span.id}
        className={`script-span ${char ? 'is-assigned' : ''} ${isHighlighted ? 'is-highlighted' : ''} ${isPlaying ? 'is-playing' : ''} ${activeCharacterId ? 'is-paintable' : ''}`}
        style={char ? ({ '--script-span-accent': char.color } as React.CSSProperties) : undefined}
        onClick={(e) => {
          // If we have a selection, don't trigger whole-span assignment yet
          const selection = window.getSelection();
          if (selection && !selection.isCollapsed) return;

          if (activeCharacterId) {
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
          <VoiceProfileSelect
            value={char?.speaker_profile_name || ''}
            onChange={(profileName) => {
              const selectedOption = assignableVoices.find(option => option.value === profileName);
              onAssignToCharacter?.([span.id], selectedOption?.character_id || null, selectedOption?.profile_name || profileName || null);
            }}
            options={assignableVoices}
            defaultLabel="Default"
            className="span-control-select"
          />
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
              if (batch && batchStatus.canGenerate) onGenerateBatch?.(batch.span_ids);
            }}
            title={!batchStatus.canGenerate
              ? (batchStatus.unavailableEngine
                  ? `Engine ${formatVoiceEngineLabel(batchStatus.unavailableEngine)} is disabled in Settings`
                  : 'All engines disabled')
              : (!anyEnginesEnabled ? 'All engines disabled' : (span.status === 'rendered' ? 'Rebuild' : 'Generate'))}
            disabled={isPending || !batchStatus.canGenerate || !onGenerateBatch}
          >
            {span.status === 'rendered' ? <RotateCcw size={14} /> : <WandSparkles size={14} />}
          </button>
        </div>
      </span>
    );
  };

  const renderBook = () => {
    return data.paragraphs.map(para => {
      return (
        <div
          key={para.id}
          className={`book-paragraph ${activeCharacterId ? 'is-paintable' : ''}`}
          onClick={() => {
             // If we have a selection, don't trigger whole-paragraph assignment
             const selection = window.getSelection();
             if (selection && !selection.isCollapsed) return;

             if (activeCharacterId) {
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
          className={`script-line ${!isFirstInRun ? 'connected-top' : ''}`}
          style={char ? ({ '--script-line-accent': char.color } as React.CSSProperties) : undefined}
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
          {activeCharacterId && (
            <button
              className="btn-primary selection-assign-btn"
              onClick={(e) => {
                e.stopPropagation();
                if (activeCharacterId) {
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
              {activeCharacterId === 'CLEAR_ASSIGNMENT' ? 'Clear Assignment' : `Assign ${charMap.get(activeCharacterId)?.name || 'Character'}`}
            </button>
          )}
        </div>
      )}
    </div>
  );
};
