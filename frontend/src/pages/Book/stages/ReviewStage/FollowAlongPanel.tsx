interface FollowAlongPanelProps {
  chapterTitle: string;
  activeSegmentId: string | null;
  totalSegments: number;
  activeSegmentIndex: number;
  onReRenderSegment?: () => void;
  isReRendering?: boolean;
  reRenderError?: string | null;
  /** S1: 0-100 progress for the active re-render, or null if not yet reported */
  reRenderProgress?: number | null;
}

export function FollowAlongPanel({
  chapterTitle,
  activeSegmentId,
  totalSegments,
  activeSegmentIndex,
  onReRenderSegment,
  isReRendering,
  reRenderError,
  reRenderProgress,
}: FollowAlongPanelProps) {
  return (
    <div
      className="follow-along-panel"
      style={{
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        padding: '16px',
        background: 'var(--surface-alt)',
        border: '1px solid var(--border)',
        borderRadius: 'var(--radius-panel)',
        minWidth: '260px',
      }}
    >
      <h3 style={{ fontSize: '0.85rem', fontWeight: 700, margin: 0, color: 'var(--text-primary)' }}>
        Follow-Along Playback
      </h3>

      <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)' }}>
        <strong>Chapter:</strong> {chapterTitle || 'No Chapter Selected'}
      </div>

      {activeSegmentId && (
        <div
          style={{
            fontSize: '0.7rem',
            color: 'var(--text-muted)',
            borderTop: '1px solid var(--border)',
            paddingTop: '8px',
            marginTop: '4px',
          }}
        >
          <div>
            <strong>Segment:</strong> {activeSegmentIndex + 1} / {totalSegments}
          </div>
          {onReRenderSegment && (
            <button
              type="button"
              onClick={onReRenderSegment}
              disabled={isReRendering}
              aria-label="Regenerate Segment"
              style={{
                marginTop: '8px',
                padding: '6px 10px',
                background: 'var(--surface)',
                color: 'var(--text-primary)',
                border: '1px solid var(--border)',
                borderRadius: 'var(--radius-button)',
                fontSize: '0.7rem',
                fontWeight: 600,
                cursor: isReRendering ? 'not-allowed' : 'pointer',
                opacity: isReRendering ? 0.6 : 1,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: '4px',
                width: '100%',
              }}
            >
              {isReRendering
                ? reRenderProgress != null
                  ? `Regenerating... ${reRenderProgress}%`
                  : 'Regenerating...'
                : 'Regenerate Segment'}
            </button>
          )}
          {reRenderError && (
            <div
              role="alert"
              style={{
                marginTop: '6px',
                fontSize: '0.65rem',
                color: 'var(--error)',
                padding: '4px 6px',
                background: 'var(--error-tint-bg)',
                borderRadius: 'var(--radius-button)',
                border: '1px solid var(--error-tint-border)',
              }}
            >
              {reRenderError}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
