import React, { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { AlertTriangle, PenLine } from 'lucide-react';
import type { DirectorsTool } from '../types';
import { useBookDataContext } from '@/pages/Book/BookDataContext';
import { api } from '@/api';
import type { ChapterSegment } from '@/types';
import { splitSegmentText } from './SegmentSplitter';
import { useDirtyGuard } from '../DirtyGuardContext';

// The engine's synthesis character buffer, per design-docs/workflows/chapter-editor-modes.md
// §7 ("~500 chars for XTTS"). The backend derives this per-engine from a
// plugin's manifest `behavior.text_chunk_limit`
// (`app/engines/behavior.py::get_text_chunk_limit`, default 500), but no
// frontend source is currently wired to surface that value per-chapter/engine
// (checked `useStudioChapter`/`StudioStage` — neither sources it either).
// Flagged as a follow-up rather than adding new backend plumbing for this task.
const ENGINE_CHAR_LIMIT = 500;

/**
 * Revise mode — in-place, per-segment text editing (design-docs/workflows/chapter-editor-modes.md §7).
 * See design-docs/plans/active/directors_console_activation/tasks/005-revise-tool.md.
 *
 * Zero-prop (INV-1): resolves book/chapter context itself via
 * `useBookDataContext()` + `useSearchParams()`, same as `BoothTool`/`CastTool`.
 *
 * Paragraph vs. segment (INV-5 — resolved, not assumed): the backend's
 * script-view payload groups consecutive segments into a `paragraph` only
 * when a paragraph-break is detected on a segment
 * (`app/domain/chapters/operations.py::get_script_view_payload` —
 * `current_paragraph_span_ids` accumulates across multiple segment rows
 * until a break). A paragraph can therefore span several segments; it is
 * NOT guaranteed 1:1 with a segment. This confirms the plan's flagged risk
 * (01-map.md INV-5): v1 scope here is narrowed to **"click a segment, edit
 * its text"** — the same unit `BoothTool`'s segment list already uses —
 * rather than a paragraph-level click target the data model doesn't
 * reliably have.
 *
 * Segment-fetch pattern is reused from `BoothTool` (`api.fetchSegments`)
 * rather than re-invented, per the task's instruction.
 */
const ReviseToolBody: React.FC = () => {
  const { chapters } = useBookDataContext();
  const [searchParams] = useSearchParams();
  const { setDirty } = useDirtyGuard();
  const [segments, setSegments] = useState<ChapterSegment[]>([]);
  const [loadingSegments, setLoadingSegments] = useState(false);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [draftText, setDraftText] = useState('');
  const [savingId, setSavingId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  // Segments whose current text_content exceeds the engine's character
  // buffer — a passive (non-blocking) "running long" indicator, per the
  // design doc's overflow-with-no-clean-split behavior.
  const [longSegmentIds, setLongSegmentIds] = useState<Set<string>>(new Set());

  const resolvedChapterId = searchParams.get('chapter') || chapters[0]?.id || null;

  // Stale-response guard: if the user switches chapters quickly, an earlier
  // chapter's fetch can resolve AFTER a later chapter's, silently overwriting
  // `segments` with the wrong chapter's data. Track which chapter id the
  // in-flight fetch was issued for and ignore the response if it no longer
  // matches the current chapter.
  const requestedChapterIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!resolvedChapterId) return;
    requestedChapterIdRef.current = resolvedChapterId;
    setLoadingSegments(true);
    api.fetchSegments(resolvedChapterId)
      .then((data) => {
        if (requestedChapterIdRef.current !== resolvedChapterId) return;
        const loaded = data || [];
        setSegments(loaded);
        setLongSegmentIds(new Set(
          loaded.filter((seg) => (seg.text_content?.length || 0) > ENGINE_CHAR_LIMIT).map((seg) => seg.id),
        ));
      })
      .catch((err) => {
        console.error('Failed to fetch segments for revise tool:', err);
      })
      .finally(() => {
        if (requestedChapterIdRef.current !== resolvedChapterId) return;
        setLoadingSegments(false);
      });
    // Reset any in-progress edit when the active chapter changes.
    setEditingId(null);
    setDraftText('');
    setSaveError(null);
  }, [resolvedChapterId]);

  // Dirty-exit guard (see DirtyGuardContext.tsx): report an in-progress edit
  // whenever the draft differs from the segment's saved text, and clear it
  // once there is no active edit (mount, commit, cancel, or a chapter
  // switch, all of which reset `editingId` to null above).
  useEffect(() => {
    if (!editingId) {
      setDirty(false);
      return;
    }
    const originalText = segments.find((seg) => seg.id === editingId)?.text_content ?? '';
    setDirty(draftText !== originalText, 'Uncommitted segment edit');
  }, [editingId, draftText, segments, setDirty]);

  // Move focus into the textarea (caret at the end of the text) as soon as
  // an edit starts — otherwise focus stays on the segment div/button that
  // triggered it, which is disorienting for keyboard and screen-reader users.
  useEffect(() => {
    if (!editingId) return;
    const el = textareaRef.current;
    if (!el) return;
    el.focus();
    const end = el.value.length;
    el.setSelectionRange(end, end);
  }, [editingId]);

  const handleStartEdit = (segment: ChapterSegment) => {
    if (savingId) return; // don't interrupt an in-flight save
    if (editingId && editingId !== segment.id) return; // other segments stay read-only while one is being edited
    setEditingId(segment.id);
    setDraftText(segment.text_content);
    setSaveError(null);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setDraftText('');
    setSaveError(null);
  };

  const handleCommit = async () => {
    if (!editingId) return;
    const newText = draftText;
    setSavingId(editingId);
    setSaveError(null);

    // Balanced-split check (design doc §7): if the edit pushes the segment
    // over the engine's character buffer, look for a clean sentence-boundary
    // split near the midpoint. NOTE (flagged, not silently assumed): the
    // design doc's split behavior calls for the second half to become its
    // own segment, inheriting the original speaker assignment. The backend
    // has no endpoint to insert a new segment row today (confirmed —
    // `app/db/segments.py` only exposes `update_segment`/`update_segments_bulk`;
    // `sync_chapter_segments` is a whole-chapter resync, out of scope here
    // per the task's "no change to ChapterTextPanel/useChapterText" rule).
    // So v1 always persists the edit as ONE segment, whether or not a clean
    // split point exists, and surfaces the same passive "running long"
    // indicator either way — a real two-way split is deferred as a backend
    // follow-up (new segment-insert endpoint required).
    const isOverLimit = newText.length > ENGINE_CHAR_LIMIT;
    if (isOverLimit) {
      // Result intentionally unused for persistence today; computing it
      // keeps SegmentSplitter exercised on the actual edit path (rather
      // than only from unit tests) and is the seam a future two-segment
      // implementation would hook into.
      splitSegmentText(newText, ENGINE_CHAR_LIMIT);
    }

    try {
      await api.updateSegment(editingId, { text_content: newText, audio_status: 'unprocessed' });
      await api.generateSegments([editingId]);

      setSegments((prev) => prev.map((seg) => (
        seg.id === editingId ? { ...seg, text_content: newText, audio_status: 'unprocessed' } : seg
      )));
      setLongSegmentIds((prev) => {
        const next = new Set(prev);
        if (isOverLimit) next.add(editingId);
        else next.delete(editingId);
        return next;
      });
      setEditingId(null);
      setDraftText('');
    } catch (err) {
      console.error('Failed to save segment edit:', err);
      setSaveError('Save failed. Please try again.');
    } finally {
      setSavingId(null);
    }
  };

  // A `role="button"` div does not synthesize clicks from Enter/Space the
  // way a real `<button>` does, so keyboard activation has to be wired up
  // explicitly here.
  const handleSegmentKeyDown = (event: React.KeyboardEvent<HTMLDivElement>, segment: ChapterSegment) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault(); // Space otherwise scrolls the page
      handleStartEdit(segment);
    }
  };

  const handleTextareaKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Escape') {
      event.preventDefault();
      handleCancelEdit();
      return;
    }
    if (event.key === 'Enter' && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (savingId || draftText.trim().length === 0) return; // mirror the Save button's disabled guard
      void handleCommit();
    }
  };

  // First ~8 words of the segment text, for a descriptive aria-label on the
  // clickable segment (screen readers announce more than a bare "button").
  const getSegmentAriaLabel = (text: string) => {
    const words = text.trim().split(/\s+/).filter(Boolean).slice(0, 8).join(' ');
    return `Edit: ${words}…`;
  };

  return (
    <div className="revise-tool" data-testid="revise-tool">
      <div className="revise-tool__topbar">
        {/* No title here: ChapterWorkspaceHeader (rendered once, above the
            whole console) already shows the chapter title — repeating it
            here duplicated it within ~140px (design-critique HIG finding). */}
        {editingId ? (
          <div className="revise-tool__banner" role="status">
            Editing — save to re-render this section.
          </div>
        ) : (
          <p className="revise-tool__hint">
            Click any passage to edit — saving re-renders that segment.
          </p>
        )}
      </div>

      <div className="revise-text-view" data-testid="revise-text-view">
        {loadingSegments ? (
          <div className="revise-text-view__empty">Loading segments...</div>
        ) : segments.length === 0 ? (
          <div className="revise-text-view__empty">No segments found for this chapter.</div>
        ) : (
          segments.map((seg) => {
            const isEditing = seg.id === editingId;
            const isSaving = seg.id === savingId;
            const isLong = longSegmentIds.has(seg.id) && !isEditing;
            const isReadOnly = Boolean(editingId) && !isEditing;

            if (isEditing) {
              return (
                <div key={seg.id} className="revise-text-view__segment revise-text-view__segment--editing">
                  <textarea
                    ref={textareaRef}
                    className="revise-text-view__textarea"
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    onKeyDown={handleTextareaKeyDown}
                    disabled={isSaving}
                    aria-label="Edit segment text"
                    rows={Math.max(3, Math.ceil(draftText.length / 60))}
                  />
                  {draftText.length > ENGINE_CHAR_LIMIT && (
                    <div className="revise-text-view__overflow-hint">
                      <AlertTriangle size={12} aria-hidden="true" />
                      <span>
                        This text exceeds the engine's ~{ENGINE_CHAR_LIMIT} char buffer and will run long.
                      </span>
                    </div>
                  )}
                  {saveError && (
                    <div className="revise-text-view__error" role="alert">{saveError}</div>
                  )}
                  <div className="revise-text-view__actions">
                    <button
                      type="button"
                      className="revise-text-view__save-btn"
                      onClick={() => void handleCommit()}
                      disabled={isSaving || draftText.trim().length === 0}
                    >
                      {isSaving ? 'Saving...' : 'Save'}
                    </button>
                    <button
                      type="button"
                      className="revise-text-view__cancel-btn"
                      onClick={handleCancelEdit}
                      disabled={isSaving}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              );
            }

            return (
              <div
                key={seg.id}
                onClick={() => handleStartEdit(seg)}
                onKeyDown={(e) => handleSegmentKeyDown(e, seg)}
                className={`revise-text-view__segment${isReadOnly ? ' revise-text-view__segment--readonly' : ''}`}
                role="button"
                tabIndex={isReadOnly ? -1 : 0}
                aria-disabled={isReadOnly}
                aria-label={getSegmentAriaLabel(seg.text_content)}
              >
                <span>{seg.text_content}</span>
                <PenLine size={12} aria-hidden="true" className="revise-text-view__edit-icon" />
                {isLong && (
                  <span className="revise-text-view__long-badge" title={`Exceeds ~${ENGINE_CHAR_LIMIT} char buffer — running long`}>
                    <AlertTriangle size={12} aria-hidden="true" />
                  </span>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};

/**
 * Revise mode — click a segment, edit its text inline, save to invalidate
 * and re-render only that segment's audio. New logic (no existing UI to
 * port); see design-docs/plans/active/directors_console_activation/tasks/005-revise-tool.md.
 */
export const ReviseTool: DirectorsTool = {
  id: 'revise',
  label: 'Revise',
  icon: PenLine,
  component: ReviseToolBody,
  demoPlaceholder: false,
};
