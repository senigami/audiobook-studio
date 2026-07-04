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
} from '@/types';
import { getVoiceProfileEngine, formatVoiceEngineLabel, buildVoiceOptions } from '@/utils/voiceProfiles';
import { computeSpanRenderProgress, batchEngineStatus as computeBatchEngineStatus } from '@/pages/ChapterEditor/scriptViewProgress';
import { VoiceProfileSelect } from '@/pages/ChapterEditor/components/VoiceProfileSelect';
import '@/pages/ChapterEditor/components/ScriptView.css';

interface ScriptViewProps {
  data: ScriptViewResponse;
  characters: Character[];
  onGenerateBatch?: (spanIds: string[]) => void | Promise<void>;
  pendingSpanIds: Set<string>;
  renderingSpanIds?: Set<string>;
  queuedSpanIds?: Set<string>;
  preparingSpanIds?: Set<string>;
  renderingBatchProgressById?: Record<string, number>;
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
  viewMode?: 'book' | 'script';
  onViewModeChange?: (mode: 'book' | 'script') => void;
  showSafeText?: boolean;
  onShowSafeTextChange?: (next: boolean) => void;
  showNumbers?: boolean;
  onShowNumbersChange?: (next: boolean) => void;
  hideToolbarControls?: boolean;
  /**
   * When provided (and non-empty): maps the *first* span_id of each render group → its
   * 1-based group number. Only spans present in this map receive a number label; all others
   * are suppressed. When absent or empty, falls back to per-span sentence numbering.
   */
  groupNumberForSpan?: Map<string, number>;
}

// ---------------------------------------------------------------------------
// ScriptSpanItem — memo'd leaf so progress-frame re-renders don't cascade to
// every span. All per-span state is passed as primitive/stable props so
// React.memo's shallow comparison can bail out on unrelated frames.
// ---------------------------------------------------------------------------
interface ScriptSpanItemProps {
  span: ScriptSpan;
  mode: 'book' | 'script';
  char: Character | null | undefined;
  isPending: boolean;
  isRendering: boolean;
  isQueued: boolean;
  isPreparing: boolean;
  isPlaying: boolean;
  isReady: boolean;
  canPlay: boolean;
  litCount: number;
  showCursor: boolean;
  displayText: string;
  canGenerate: boolean;
  unavailableEngine: string | null | undefined;
  anyEnginesEnabled: boolean;
  batchSpanIds: string[] | undefined;
  showNumbers: boolean;
  /** Resolved display number; null means use fallbackNumber; undefined means suppress entirely. */
  groupNumber: number | null | undefined;
  fallbackNumber: number;
  activeCharacterId: string | null | undefined;
  assignableVoices: ReturnType<typeof buildVoiceOptions>;
  onAssign?: (spanIds: string[]) => void;
  onPlaySpan?: (spanId: string) => void;
  onAssignToCharacter?: (spanIds: string[], characterId: string | null, profileName: string | null) => void;
  onGenerateBatch?: (spanIds: string[]) => void | Promise<void>;
}

const ScriptSpanItem = React.memo<ScriptSpanItemProps>(({
  span,
  mode,
  char,
  isPending,
  isRendering,
  isQueued,
  isPreparing,
  isPlaying,
  isReady,
  canPlay,
  litCount,
  showCursor,
  displayText,
  canGenerate,
  unavailableEngine,
  anyEnginesEnabled,
  batchSpanIds,
  showNumbers,
  groupNumber,
  fallbackNumber,
  activeCharacterId,
  assignableVoices,
  onAssign,
  onPlaySpan,
  onAssignToCharacter,
  onGenerateBatch,
}) => {
  const isHighlighted = !!(char && activeCharacterId === char.id);

  const textClassName = [
    'script-span-text',
    mode === 'script'
      ? (isPreparing ? 'script-span-text-preparing' : isRendering ? 'script-span-text-rendering' : isQueued ? 'script-span-text-queued' : isPending ? 'script-span-text-pending' : '')
      : (isPreparing ? 'script-span-text-book-preparing' : isRendering ? 'script-span-text-book-rendering' : isQueued ? 'script-span-text-book-queued' : isPending ? 'script-span-text-book-pending' : ''),
    isPlaying ? 'script-span-text-playing' : '',
    isReady ? 'script-span-text-ready' : 'script-span-text-muted',
  ].filter(Boolean).join(' ');

  return (
    <span
      data-span-id={span.id}
      data-testid={`script-span-${span.id}`}
      data-render-status={isPreparing ? 'preparing' : isRendering ? 'rendering' : isQueued ? 'queued' : isPending ? 'pending' : isReady ? 'rendered' : 'idle'}
      className={`script-span ${char ? 'is-assigned' : ''} ${isHighlighted ? 'is-highlighted' : ''} ${isPlaying ? 'is-playing' : ''} ${mode === 'book' && isPreparing ? 'is-book-preparing' : ''} ${mode === 'book' && isRendering && !isPreparing ? 'is-book-rendering' : ''} ${mode === 'book' && isQueued ? 'is-book-queued' : ''} ${mode === 'book' && isPending && !isRendering && !isQueued ? 'is-book-pending' : ''} ${mode === 'script' && isPreparing ? 'is-preparing' : ''} ${mode === 'script' && isRendering && !isPreparing ? 'is-rendering' : ''} ${mode === 'script' && isQueued ? 'is-queued' : ''} ${mode === 'script' && isPending && !isRendering && !isQueued ? 'is-pending' : ''} ${activeCharacterId ? 'is-paintable' : ''}`}
      style={char ? ({ '--script-span-accent': char.color } as React.CSSProperties) : undefined}
      onClick={(e) => {
        const selection = window.getSelection();
        if (selection && !selection.isCollapsed) return;
        if (activeCharacterId) {
          e.stopPropagation();
          onAssign?.([span.id]);
        }
      }}
    >
      {showNumbers && groupNumber !== undefined && (
        <span className="script-span-number" data-testid="span-number">
          {groupNumber ?? fallbackNumber}
        </span>
      )}

      <span className={textClassName}>
        {isRendering && !isPreparing
          ? <SegmentProgressText text={displayText} litCount={litCount} showCursor={showCursor} />
          : displayText}
      </span>

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
          aria-label="Play audio"
          title="Play Audio"
          disabled={!canPlay}
        >
          <Play size={14} fill={canPlay ? 'currentColor' : 'none'} aria-hidden="true" />
        </button>
        <button
          className="span-control-btn"
          data-testid={`generate-span-${span.id}`}
          onClick={(e) => {
            e.stopPropagation();
            if (batchSpanIds && canGenerate) onGenerateBatch?.(batchSpanIds);
          }}
          aria-label={!canGenerate
            ? (unavailableEngine
                ? `Engine ${formatVoiceEngineLabel(unavailableEngine)} is disabled in Settings`
                : 'All engines disabled')
            : (!anyEnginesEnabled ? 'All engines disabled' : (isReady ? 'Rebuild segment audio' : 'Generate segment audio'))}
          title={!canGenerate
            ? (unavailableEngine
                ? `Engine ${formatVoiceEngineLabel(unavailableEngine)} is disabled in Settings`
                : 'All engines disabled')
            : (!anyEnginesEnabled ? 'All engines disabled' : (isReady ? 'Rebuild' : 'Generate'))}
          disabled={isPending || !canGenerate || !onGenerateBatch}
        >
          {isReady ? <RotateCcw size={14} aria-hidden="true" /> : <WandSparkles size={14} aria-hidden="true" />}
        </button>
      </div>
    </span>
  );
});

const SegmentProgressText: React.FC<{ text: string; litCount: number; showCursor: boolean }> = ({ text, litCount, showCursor }) => {
  const letters = Array.from(text);
  const safeLitCount = Math.max(0, Math.min(litCount, letters.length));
  // Cursor sits at the next character that hasn't been lit yet
  const cursorIndex = showCursor && safeLitCount < letters.length ? safeLitCount : -1;

  return (
    <>
      {letters.map((letter, index) => {
        const isCursor = index === cursorIndex;
        const isLit = index < safeLitCount;
        return (
          <span
            key={`${index}-${letter}`}
            className={[
              'script-progress-letter',
              isLit ? 'is-lit' : '',
              isCursor ? 'is-cursor' : '',
            ].filter(Boolean).join(' ')}
            style={{
              '--script-progress-letter-index': index,
            } as React.CSSProperties}
          >
            {letter}
          </span>
        );
      })}
    </>
  );
};

export const ScriptView: React.FC<ScriptViewProps> = ({
  data,
  characters,
  onGenerateBatch,
  pendingSpanIds,
  renderingSpanIds = new Set<string>(),
  queuedSpanIds = new Set<string>(),
  preparingSpanIds = new Set<string>(),
  renderingBatchProgressById = {},
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
  viewMode: controlledViewMode,
  onViewModeChange,
  showSafeText: controlledShowSafeText,
  onShowSafeTextChange,
  showNumbers: controlledShowNumbers,
  onShowNumbersChange,
  hideToolbarControls = false,
  groupNumberForSpan,
}) => {
  const anyEnginesEnabled = useMemo(() => engines.some(e => e.enabled && e.status === 'ready'), [engines]);
  const [internalViewMode, setInternalViewMode] = useState<'book' | 'script'>('book');
  const [internalShowSafeText, setInternalShowSafeText] = useState(false);
  const [internalShowNumbers, setInternalShowNumbers] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<ScriptRangeAssignment | null>(null);
  const [popoverPos, setPopoverPos] = useState<{ top: number; left: number } | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const viewMode = controlledViewMode ?? internalViewMode;
  const showSafeText = controlledShowSafeText ?? internalShowSafeText;
  const showNumbers = controlledShowNumbers ?? internalShowNumbers;

  const handleViewModeChange = (next: 'book' | 'script') => {
    if (onViewModeChange) onViewModeChange(next);
    else setInternalViewMode(next);
  };

  const handleShowSafeTextChange = () => {
    const next = !showSafeText;
    if (onShowSafeTextChange) onShowSafeTextChange(next);
    else setInternalShowSafeText(next);
  };

  const handleShowNumbersChange = () => {
    const next = !showNumbers;
    if (onShowNumbersChange) onShowNumbersChange(next);
    else setInternalShowNumbers(next);
  };

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

  const audioGroupMap = useMemo(() => {
    const map = new Map<string, any>();
    data.audio_groups?.forEach(group => {
      group.span_ids.forEach((spanId: string) => map.set(spanId, group));
    });
    return map;
  }, [data.audio_groups]);

  const profileEngineMap = useMemo(() => {
    return new Map(
      speakerProfiles
        .filter(profile => !!profile?.name)
        .map(profile => [profile.name, getVoiceProfileEngine(profile) || 'unknown'])
    );
  }, [speakerProfiles]);


  const batchEngineStatus = (spanIds: string[]) =>
    computeBatchEngineStatus(spanIds, spanMap, profileEngineMap, engines, anyEnginesEnabled);

  const isPlayingSpan = (spanId: string) => {
    if (playingSpanIds) return playingSpanIds.has(spanId);
    return playingSpanId === spanId;
  };

  const getDisplayText = (span: ScriptSpan) => showSafeText ? (span.sanitized_text || span.text) : span.text;

  const getRenderingTextProgress = (batch: ScriptRenderBatch | undefined, span: ScriptSpan) => {
    if (!batch) return { litCount: 0, showCursor: false };
    const batchSpans = batch.span_ids
      .map(spanId => spanMap.get(spanId))
      .filter((candidate): candidate is ScriptSpan => !!candidate);
    return computeSpanRenderProgress(
      batch,
      span,
      batchSpans,
      renderingBatchProgressById[batch.id] ?? 0,
      getDisplayText,
    );
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

  const batchHasRenderState = (batch: ScriptRenderBatch | undefined) => {
    if (!batch) return false;
    return batch.span_ids.some(spanId =>
      preparingSpanIds.has(spanId) || renderingSpanIds.has(spanId) || queuedSpanIds.has(spanId) || pendingSpanIds.has(spanId)
    );
  };

  const batchRenderClassName = (batch: ScriptRenderBatch) => {
    const isPreparing = batch.span_ids.some(spanId => preparingSpanIds.has(spanId));
    const isRendering = !isPreparing && batch.span_ids.some(spanId => renderingSpanIds.has(spanId));
    const isQueued = !isPreparing && !isRendering && batch.span_ids.some(spanId => queuedSpanIds.has(spanId));
    const isPending = !isPreparing && !isRendering && !isQueued && batch.span_ids.some(spanId => pendingSpanIds.has(spanId));

    return [
      'script-render-group',
      isPreparing ? 'is-preparing' : '',
      isRendering ? 'is-rendering' : '',
      isQueued ? 'is-queued' : '',
      isPending ? 'is-pending' : '',
    ].filter(Boolean).join(' ');
  };

  const renderSpan = (span: ScriptSpan, mode: 'book' | 'script' = 'book') => {
    const char = span.character_id ? charMap.get(span.character_id) : null;
    const batch = batchMap.get(span.id);
    const audioGroup = audioGroupMap.get(span.id);
    const isPending = pendingSpanIds.has(span.id);
    const isRendering = renderingSpanIds.has(span.id);
    const isQueued = queuedSpanIds.has(span.id);
    const isPreparing = preparingSpanIds.has(span.id);
    const renderingTextProgress = isRendering
      ? getRenderingTextProgress(batch, span)
      : { litCount: 0, showCursor: false };
    const isPlaying = isPlayingSpan(span.id);
    const isReady = span.status === 'rendered' || !!(audioGroup && (audioGroup.status === 'rendered' || audioGroup.audio_file_path || audioGroup.asset_url));
    const canPlay = span.status === 'rendered' || !!(audioGroup && (audioGroup.audio_file_path || audioGroup.asset_url));
    const displayText = getDisplayText(span);
    const batchStatus = batch ? batchEngineStatus(batch.span_ids) : { canGenerate: false, unavailableEngine: null as string | null };

    // Determine group number for this span (null = use fallback ordinal, undefined = suppress).
    const useGroupMode = !!(groupNumberForSpan && groupNumberForSpan.size > 0);
    const groupNumber: number | null | undefined = useGroupMode
      ? (groupNumberForSpan!.has(span.id) ? groupNumberForSpan!.get(span.id) : undefined)
      : null;  // null = show fallback ordinal

    return (
      <ScriptSpanItem
        key={span.id}
        span={span}
        mode={mode}
        char={char}
        isPending={isPending}
        isRendering={isRendering}
        isQueued={isQueued}
        isPreparing={isPreparing}
        isPlaying={isPlaying}
        isReady={isReady}
        canPlay={canPlay}
        litCount={renderingTextProgress.litCount}
        showCursor={renderingTextProgress.showCursor}
        displayText={displayText}
        canGenerate={batchStatus.canGenerate ?? false}
        unavailableEngine={batchStatus.unavailableEngine}
        anyEnginesEnabled={anyEnginesEnabled}
        batchSpanIds={batch?.span_ids}
        showNumbers={showNumbers}
        groupNumber={groupNumber}
        fallbackNumber={span.order_index + 1}
        activeCharacterId={activeCharacterId}
        assignableVoices={assignableVoices}
        onAssign={onAssign}
        onPlaySpan={onPlaySpan}
        onAssignToCharacter={onAssignToCharacter}
        onGenerateBatch={onGenerateBatch}
      />
    );
  };

  const renderBook = () => {
    // data.paragraphs is typed as required, but a malformed/partial payload has crashed this
    // render before (F14) — guard defensively even though the type contract says it can't happen.
    if (!data?.paragraphs) return null;
    return data.paragraphs.map(para => {
      const nodes: React.ReactNode[] = [];
      let groupBatch: ScriptRenderBatch | null = null;
      let groupEntries: Array<{ span: ScriptSpan; index: number }> = [];

      const flushGroup = () => {
        if (!groupBatch || groupEntries.length === 0) return;

        nodes.push(
          <span
            key={`render-group-${groupBatch.id}-${para.id}-${groupEntries[0].index}`}
            className={batchRenderClassName(groupBatch)}
            data-testid={`script-render-group-${groupBatch.id}`}
          >
            {groupEntries.map(({ span, index }) => (
              <React.Fragment key={span.id}>
                {renderSpan(span)}
                {index < para.span_ids.length - 1 ? ' ' : null}
              </React.Fragment>
            ))}
          </span>
        );

        groupBatch = null;
        groupEntries = [];
      };

      para.span_ids.forEach((spanId, index) => {
        const span = spanMap.get(spanId);
        if (!span) return;

        const batch = batchMap.get(span.id);
        const shouldGroup = batchHasRenderState(batch);

        if (batch && shouldGroup) {
          if (groupBatch?.id !== batch.id) {
            flushGroup();
            groupBatch = batch;
          }
          groupEntries.push({ span, index });
          return;
        }

        flushGroup();
        nodes.push(
          <React.Fragment key={spanId}>
            {renderSpan(span)}
            {index < para.span_ids.length - 1 ? ' ' : null}
          </React.Fragment>
        );
      });

      flushGroup();

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
            {nodes}
          </div>
        </div>
      );
    });
  };

  const renderScript = () => {
    // Same defensive guard as renderBook (F14) — data.spans is typed as required.
    if (!data?.spans) return null;
    let lastCharId: string | null | undefined = undefined;

    return data.spans.map(span => {
      const char = span.character_id ? charMap.get(span.character_id) : null;
      const lineIsPending = pendingSpanIds.has(span.id);
      const lineIsRendering = renderingSpanIds.has(span.id);
      const lineIsQueued = queuedSpanIds.has(span.id);
      // Preparing (engine/model loading) takes precedence over the other states —
      // script mode previously omitted it entirely, so a loading segment showed no
      // block/pulse even though preparingSpanIds was correct. Precedence mirrors
      // batchRenderClassName: preparing > rendering > queued > pending.
      const lineIsPreparing = preparingSpanIds.has(span.id);
      const isFirstInRun = span.character_id !== lastCharId;
      lastCharId = span.character_id;

      return (
        <div
          key={span.id}
          className={`script-line ${!isFirstInRun ? 'connected-top' : ''} ${lineIsPreparing ? 'is-preparing' : ''} ${lineIsRendering && !lineIsPreparing ? 'is-rendering' : ''} ${lineIsQueued && !lineIsPreparing && !lineIsRendering ? 'is-queued' : ''} ${lineIsPending && !lineIsPreparing && !lineIsRendering && !lineIsQueued ? 'is-pending' : ''}`}
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
      {!hideToolbarControls && (
        <div className="script-view-toolbar">
          <div className="script-view-toggle-group">
            <button
              className={`script-view-toggle-btn ${viewMode === 'book' ? 'active' : ''}`}
              onClick={() => handleViewModeChange('book')}
            >
              <BookOpen size={16} style={{ display: 'inline', marginRight: '6px' }} />
              Book
            </button>
            <button
              className={`script-view-toggle-btn ${viewMode === 'script' ? 'active' : ''}`}
              onClick={() => handleViewModeChange('script')}
            >
              <AlignLeft size={16} style={{ display: 'inline', marginRight: '6px' }} />
              Script
            </button>
          </div>


          <div className="script-view-toggle-actions">
            <button
              className={`script-view-pill-toggle ${showSafeText ? 'is-active' : ''}`}
              onClick={handleShowSafeTextChange}
              title="Toggle Safe Text"
              aria-pressed={showSafeText}
            >
              <Eye size={16} />
              <span>Safe</span>
            </button>
            <button
              className={`script-view-pill-toggle ${showNumbers ? 'is-active' : ''}`}
              onClick={handleShowNumbersChange}
              title="Toggle Segment Numbers"
              aria-pressed={showNumbers}
            >
              <Hash size={16} />
              <span>Numbers</span>
            </button>
          </div>
        </div>
      )}

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
