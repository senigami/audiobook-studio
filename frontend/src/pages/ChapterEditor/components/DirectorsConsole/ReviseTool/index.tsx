import React, { useEffect, useMemo, useRef, useState } from 'react';
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
  // Segments whose current text_content exceeds the engine's character
  // buffer — a passive (non-blocking) "running long" indicator, per the
  // design doc's overflow-with-no-clean-split behavior.
  const [longSegmentIds, setLongSegmentIds] = useState<Set<string>>(new Set());

  const resolvedChapterId = searchParams.get('chapter') || chapters[0]?.id || null;

  const selectedChapter = useMemo(
    () => chapters.find((chapter) => chapter.id === resolvedChapterId) || null,
    [chapters, resolvedChapterId],
  );

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

  return (
    <div className="revise-tool" data-testid="revise-tool">
      <div className="revise-tool__topbar">
        <h2 className="revise-tool__title">{selectedChapter?.title || 'Revise'}</h2>
        {editingId && (
          <div className="revise-tool__banner" role="status">
            Editing — save to re-render this section.
          </div>
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
                    className="revise-text-view__textarea"
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
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
                className={`revise-text-view__segment${isReadOnly ? ' revise-text-view__segment--readonly' : ''}`}
                role="button"
                tabIndex={isReadOnly ? -1 : 0}
                aria-disabled={isReadOnly}
              >
                <span>{seg.text_content}</span>
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
