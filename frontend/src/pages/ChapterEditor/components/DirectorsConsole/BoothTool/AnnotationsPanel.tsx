import { useState, useEffect } from 'react';
import { useAnnotations, saveAnnotation, deleteAnnotation } from '@/store/annotations';

/**
 * Ported verbatim from `frontend/src/pages/Book/stages/ReviewStage/AnnotationsPanel.tsx`
 * (relocated only). `@/store/annotations` (localStorage-only, no backend
 * persistence) is reused as-is per INV-6 — this pass does not add persistence.
 * See design-docs/plans/active/directors_console_activation/tasks/004-booth-tool.md.
 */
export interface AnnotationsPanelProps {
  chapterId: string | null;
  activeSegmentId: string | null;
  onSeekToSegment: (segmentId: string) => void;
  /** Render-group ordinal (1-based) by segment id — the same derivation
   * `FollowAlongPanel` uses for its "Segment N / M" indicator. Used here so
   * neither the active-segment label nor saved notes ever show a raw
   * internal segment id. */
  groupNumberBySegmentId: Map<string, number>;
}

export function AnnotationsPanel({
  chapterId,
  activeSegmentId,
  onSeekToSegment,
  groupNumberBySegmentId,
}: AnnotationsPanelProps) {
  const annotations = useAnnotations(chapterId || '');
  const [noteText, setNoteText] = useState('');
  // Pinned target for the note currently being composed. Distinct from
  // `activeSegmentId` (which is playback-driven and changes every few
  // seconds) so that typing a note doesn't get wiped out or re-targeted
  // mid-sentence by the karaoke playhead moving on. Set on textarea
  // focus/first keystroke; cleared on save, cancel, or blur-with-empty-text.
  const [notingSegmentId, setNotingSegmentId] = useState<string | null>(null);

  const segmentOrdinal = (segmentId: string | null): number | null => {
    if (!segmentId) return null;
    return groupNumberBySegmentId.get(segmentId) ?? null;
  };

  // Find the note for the currently active (playback) segment — used only to
  // seed `noteText` while no note is pinned.
  const activeSegmentAnnotation = annotations.find(
    (a) => a.segmentId === activeSegmentId && a.chapterId === chapterId
  );

  useEffect(() => {
    // While a note is pinned, the active segment moving on (playback) must
    // NOT overwrite what the user is typing — that's the bug this pin exists
    // to fix. Only sync from storage when nothing is pinned.
    if (notingSegmentId) return;
    setNoteText(activeSegmentAnnotation?.notes || '');
  }, [activeSegmentId, activeSegmentAnnotation?.notes, notingSegmentId]);

  const pinNotingSegment = () => {
    if (!notingSegmentId && activeSegmentId) {
      setNotingSegmentId(activeSegmentId);
    }
  };

  const handleFocus = () => {
    pinNotingSegment();
  };

  const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    // First-keystroke fallback in case focus wasn't the trigger (e.g. paste
    // via a programmatic focus that skipped the focus event in some browsers).
    pinNotingSegment();
    setNoteText(e.target.value);
  };

  const handleBlur = () => {
    if (!noteText.trim()) {
      setNotingSegmentId(null);
    }
  };

  const notingTargetId = notingSegmentId ?? activeSegmentId;

  const handleSave = () => {
    if (!chapterId || !notingTargetId) return;
    saveAnnotation(chapterId, notingTargetId, noteText.trim());
    setNotingSegmentId(null);
  };

  const handleCancel = () => {
    setNoteText(activeSegmentAnnotation?.notes || '');
    setNotingSegmentId(null);
  };

  const handleDelete = (segmentId: string) => {
    if (!chapterId) return;
    deleteAnnotation(chapterId, segmentId);
  };

  return (
    <div
      className="review-annotations-drawer"
      style={{
        width: '280px',
        background: 'var(--surface-alt)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-panel)',
        padding: '16px',
        display: 'flex',
        flexDirection: 'column',
        gap: '16px',
        height: '100%',
        boxSizing: 'border-box',
      }}
    >
      <h3 style={{ fontSize: '0.9rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
        Annotations
      </h3>

      {/* List section */}
      <div
        style={{
          flex: 1,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {annotations.length === 0 ? (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Notes you leave while listening appear here. Click a line to jump there, then jot a note.
          </div>
        ) : (
          annotations.map((anno) => (
            <div
              key={anno.segmentId}
              onClick={() => onSeekToSegment(anno.segmentId)}
              style={{
                padding: '8px',
                background: 'var(--surface)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-button)',
                cursor: 'pointer',
                display: 'flex',
                flexDirection: 'column',
                gap: '4px',
                position: 'relative',
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.7rem', fontWeight: 600, color: 'var(--accent)' }}>
                  Segment {segmentOrdinal(anno.segmentId) ?? '?'}
                </span>
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(anno.segmentId);
                  }}
                  style={{
                    fontSize: '0.7rem',
                    color: 'var(--error)',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    padding: '2px 4px',
                  }}
                  aria-label="Delete"
                >
                  Delete
                </button>
              </div>
              <p style={{ fontSize: '0.75rem', margin: 0, color: 'var(--text-secondary)', wordBreak: 'break-word' }}>
                {anno.notes}
              </p>
            </div>
          ))
        )}
      </div>

      {/* Text area / Editor section */}
      <div
        style={{
          borderTop: '1px solid var(--border)',
          paddingTop: '12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '8px',
        }}
      >
        {activeSegmentId ? (
          <>
            <div style={{ fontSize: '0.75rem', fontWeight: 600, color: 'var(--text-primary)' }}>
              {notingSegmentId ? 'Note for segment' : 'Active Segment:'}{' '}
              <span style={{ color: 'var(--accent)' }}>{segmentOrdinal(notingTargetId) ?? '?'}</span>
            </div>
            <textarea
              value={noteText}
              onFocus={handleFocus}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="Add a note for the active segment..."
              style={{
                width: '100%',
                height: '70px',
                fontSize: '0.75rem',
                padding: '6px 8px',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-button)',
                background: 'var(--surface)',
                color: 'var(--text-primary)',
                resize: 'none',
                boxSizing: 'border-box',
              }}
            />
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={handleSave}
                disabled={!noteText.trim()}
                style={{
                  padding: '6px 12px',
                  fontSize: '0.75rem',
                  fontWeight: 600,
                  color: 'var(--text-on-accent)',
                  background: 'var(--accent)',
                  border: 'none',
                  borderRadius: 'var(--radius-button)',
                  cursor: 'pointer',
                  opacity: noteText.trim() ? 1 : 0.6,
                }}
              >
                Save Note
              </button>
              {notingSegmentId && (
                <button
                  onClick={handleCancel}
                  style={{
                    padding: '6px 12px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    color: 'var(--text-secondary)',
                    background: 'transparent',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-button)',
                    cursor: 'pointer',
                  }}
                >
                  Cancel
                </button>
              )}
            </div>
          </>
        ) : (
          <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
            Select a segment to add a note
          </div>
        )}
      </div>
    </div>
  );
}
