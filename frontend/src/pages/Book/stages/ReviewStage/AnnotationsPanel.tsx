import { useState, useEffect } from 'react';
import { useAnnotations, saveAnnotation, deleteAnnotation } from '@/store/annotations';

export interface AnnotationsPanelProps {
  chapterId: string | null;
  activeSegmentId: string | null;
  onSeekToSegment: (segmentId: string) => void;
}

export function AnnotationsPanel({
  chapterId,
  activeSegmentId,
  onSeekToSegment,
}: AnnotationsPanelProps) {
  const annotations = useAnnotations(chapterId || '');
  const [noteText, setNoteText] = useState('');

  // Find the note for the active segment
  const activeAnnotation = annotations.find(
    (a) => a.segmentId === activeSegmentId && a.chapterId === chapterId
  );

  useEffect(() => {
    setNoteText(activeAnnotation?.notes || '');
  }, [activeSegmentId, activeAnnotation?.notes]);

  const handleSave = () => {
    if (!chapterId || !activeSegmentId) return;
    saveAnnotation(chapterId, activeSegmentId, noteText.trim());
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
            No notes for this chapter yet.
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
                  Segment: {anno.segmentId}
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
              Active Segment: <span style={{ color: 'var(--accent)' }}>{activeSegmentId}</span>
            </div>
            <textarea
              value={noteText}
              onChange={(e) => setNoteText(e.target.value)}
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
            <button
              onClick={handleSave}
              disabled={!noteText.trim()}
              style={{
                padding: '6px 12px',
                fontSize: '0.75rem',
                fontWeight: 600,
                color: 'var(--button-primary-text, #fff)',
                background: 'var(--accent)',
                border: 'none',
                borderRadius: 'var(--radius-button)',
                cursor: 'pointer',
                opacity: noteText.trim() ? 1 : 0.6,
              }}
            >
              Save Note
            </button>
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
